/**
 * CitationVerifier.mjs
 *
 * Deterministic reference verification for the AI Tutor pipeline.
 * Parses .bib files, queries the Semantic Scholar Graph API, and emits
 * comments in the same shape as the LLM subagents so they flow through
 * dedup/prune/grouping unchanged.
 *
 * Comments produced here are PRE-MAPPED: docPath, startOffset, endOffset
 * are computed locally from the .bib file, so they bypass the merged.tex
 * Phase 6 mapping step.
 *
 * Configuration:
 *   SEMANTIC_SCHOLAR_API_KEY     — required to enable the verifier
 *   AI_TUTOR_CITATION_MAX_ENTRIES — cap entries per project (default 200)
 *
 * Rate-limit / retry strategy:
 *   The Semantic Scholar partner key is rate-limited at 1 request/second per
 *   key, enforced per source IP. Because every Overleaf user on this web
 *   instance shares the same key, all S2 traffic is funneled through a single
 *   module-level FIFO limiter that releases at most one request every
 *   S2_MIN_INTERVAL_MS. On 429 we honor Retry-After; otherwise we use
 *   exponential backoff with full jitter (AWS-style). Transient failures
 *   (429 / 5xx / network errors that exhaust retries) are surfaced as
 *   unverified verdicts so we never flag a legitimate citation as fabricated
 *   just because S2 was briefly unavailable.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const S2_FIELDS = 'title,authors,year,venue,externalIds,publicationVenue'
const TITLE_MATCH_STRONG = 0.85
const TITLE_MATCH_CANDIDATE = 0.70
const YEAR_TOLERANCE_OK = 1
const YEAR_TOLERANCE_WARN = 3
const SEARCH_LIMIT = 5
const BATCH_SIZE = 100
const DEFAULT_MAX_ENTRIES = 200

// Single-key shared limiter: S2 enforces 1 RPS per key, by source IP.
// 1100 ms gives a 10% safety margin so clock skew between us and S2 doesn't
// push us over the cliff under sustained load.
const S2_MIN_INTERVAL_MS = parseInt(process.env.AI_TUTOR_S2_MIN_INTERVAL_MS, 10) || 1100
const S2_MAX_RETRIES = parseInt(process.env.AI_TUTOR_S2_MAX_RETRIES, 10) || 5
const S2_BACKOFF_BASE_MS = 1000
const S2_BACKOFF_CAP_MS = 30_000
const S2_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_TUTOR_S2_REQUEST_TIMEOUT_MS, 10) || 30_000

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Process-wide FIFO scheduler. Reserve() returns the wall-clock delay (ms)
 * the caller must wait before firing its request. Because reservations are
 * stamped synchronously into nextAvailableAt, concurrent callers naturally
 * serialize — caller N waits (N-1) * intervalMs even if all N call reserve()
 * in the same tick.
 */
class S2RateLimiter {
  constructor(intervalMs) {
    this.intervalMs = intervalMs
    this.nextAvailableAt = 0
  }

  acquire() {
    const now = Date.now()
    const slot = Math.max(now, this.nextAvailableAt)
    this.nextAvailableAt = slot + this.intervalMs
    const wait = slot - now
    return wait > 0 ? sleep(wait) : Promise.resolve()
  }

  /**
   * Push the next-available timestamp at least `ms` into the future. Called
   * after S2 returns 429 with Retry-After, so OTHER in-flight S2 callers in
   * this process also back off — not just the one that got hit. Without this,
   * a single 429 buys 1.1s of pacing for the caller but everyone else keeps
   * firing into the same rate-limited wall.
   */
  pauseFor(ms) {
    const target = Date.now() + ms
    if (target > this.nextAvailableAt) this.nextAvailableAt = target
  }

  reset() {
    this.nextAvailableAt = 0
  }
}

const s2Limiter = new S2RateLimiter(S2_MIN_INTERVAL_MS)

function parseRetryAfter(header) {
  if (!header) return null
  const asInt = parseInt(header, 10)
  if (!Number.isNaN(asInt) && String(asInt) === String(header).trim()) {
    return Math.max(0, asInt * 1000)
  }
  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  return null
}

// Full-jitter exponential backoff (AWS architecture blog). Avoids retry storms
// when many concurrent requests hit the same 429 wall.
function computeBackoffMs(attempt) {
  const exp = Math.min(S2_BACKOFF_CAP_MS, S2_BACKOFF_BASE_MS * Math.pow(2, attempt))
  return Math.floor(Math.random() * exp)
}

// ---------------------------------------------------------------------------
// BibTeX parser (regex-based, handles balanced braces)
// ---------------------------------------------------------------------------

/**
 * Find the index of the matching closing brace for an opening brace at idx.
 * Returns -1 if unbalanced.
 */
function findMatchingBrace(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Strip surrounding braces or quotes from a bib field value, recursively.
 * Also collapses whitespace and removes simple LaTeX command wrappers.
 */
export function cleanBibValue(raw) {
  let s = (raw || '').trim()
  while (s.length >= 2) {
    const first = s[0]
    const last = s[s.length - 1]
    if ((first === '{' && last === '}') || (first === '"' && last === '"')) {
      s = s.slice(1, -1).trim()
    } else break
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Parse a single .bib file into an array of entries.
 * Each entry: { key, type, fields, raw, charStart, charEnd }
 *   key       — citation key (e.g., "smith2023")
 *   type      — entry type (e.g., "inproceedings", "article")
 *   fields    — { title, author, year, doi, journal, booktitle, url, ... }
 *   raw       — the full source text of the entry, including @type{ ... }
 *   charStart — offset of '@' in the source
 *   charEnd   — offset of the closing '}'
 */
export function parseBibFile(bibContent) {
  const entries = []
  const entryRe = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g
  let match
  while ((match = entryRe.exec(bibContent)) !== null) {
    const type = match[1].toLowerCase()
    if (type === 'comment' || type === 'preamble' || type === 'string') continue
    const key = match[2]
    const openBraceIdx = bibContent.indexOf('{', match.index)
    const closeBraceIdx = findMatchingBrace(bibContent, openBraceIdx)
    if (closeBraceIdx === -1) continue
    const body = bibContent.slice(match.index + match[0].length, closeBraceIdx)
    const fields = parseFields(body)
    entries.push({
      key,
      type,
      fields,
      raw: bibContent.slice(match.index, closeBraceIdx + 1),
      charStart: match.index,
      charEnd: closeBraceIdx + 1,
    })
    entryRe.lastIndex = closeBraceIdx + 1
  }
  return entries
}

/**
 * Parse the body of a bib entry (everything after the key, before the closing brace).
 * Handles balanced braces and quoted strings inside field values.
 */
function parseFields(body) {
  const fields = {}
  let i = 0
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++
    if (i >= body.length) break

    let nameStart = i
    while (i < body.length && /[A-Za-z_-]/.test(body[i])) i++
    const name = body.slice(nameStart, i).toLowerCase().trim()
    if (!name) {
      i++
      continue
    }

    while (i < body.length && /\s/.test(body[i])) i++
    if (body[i] !== '=') {
      i++
      continue
    }
    i++
    while (i < body.length && /\s/.test(body[i])) i++

    let valueStart = i
    let valueEnd = i
    if (body[i] === '{') {
      const close = findMatchingBrace(body, i)
      if (close === -1) break
      valueEnd = close + 1
      i = close + 1
    } else if (body[i] === '"') {
      let j = i + 1
      while (j < body.length && body[j] !== '"') {
        if (body[j] === '\\') j++
        j++
      }
      valueEnd = j + 1
      i = j + 1
    } else {
      while (i < body.length && body[i] !== ',' && body[i] !== '\n') i++
      valueEnd = i
    }
    fields[name] = cleanBibValue(body.slice(valueStart, valueEnd))
  }
  return fields
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

const LATEX_COMMAND_RE = /\\[A-Za-z]+\s*\{?|[{}]/g
const PUNCT_RE = /[\.,;:!?'"`‘’“”\(\)\[\]\-]/g

export function stripLatex(s) {
  return (s || '').replace(LATEX_COMMAND_RE, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeTitle(s) {
  return stripLatex(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(PUNCT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Drop everything after the first colon (subtitle) for a more lenient compare.
 */
export function titleMainPart(s) {
  const t = normalizeTitle(s)
  const colon = t.indexOf(' ')
  // Use raw colon position from the cleaned-LaTeX string (before lowercasing)
  const stripped = stripLatex(s)
  const colonIdx = stripped.indexOf(':')
  if (colonIdx > 0) {
    return normalizeTitle(stripped.slice(0, colonIdx))
  }
  return t
  void colon
}

/**
 * Extract the first author's last name from a BibTeX author field.
 * Handles "Last, First and Last2, First2" and "First Last and First2 Last2".
 */
export function extractAuthorSurnames(authorField) {
  if (!authorField) return []
  const s = stripLatex(authorField)
  const authors = s.split(/\s+and\s+/i)
  return authors.map(a => {
    const trimmed = a.trim()
    if (trimmed.includes(',')) {
      return normalizeAuthorName(trimmed.split(',')[0])
    }
    const parts = trimmed.split(/\s+/)
    return normalizeAuthorName(parts[parts.length - 1] || '')
  }).filter(Boolean)
}

export function normalizeAuthorName(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize a venue string for comparison. Drops common boilerplate.
 */
export function normalizeVenue(s) {
  if (!s) return ''
  let t = stripLatex(s).toLowerCase()
  t = t.replace(/proceedings of (the )?/g, '')
  t = t.replace(/the (\d+(st|nd|rd|th) )?(annual |international |conference on )+/g, ' ')
  t = t.replace(/conference on/g, ' ')
  t = t.replace(/\b(20|19)\d{2}\b/g, ' ')
  t = t.replace(/[^a-z0-9 ]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Lenient venue compare. Tries:
 *   - direct token containment after normalization
 *   - well-known acronym map (ICLR, NeurIPS, ACL, ...)
 */
const VENUE_ACRONYMS = {
  iclr: ['international conference on learning representations', 'iclr'],
  neurips: ['neural information processing systems', 'nips', 'neurips', 'advances in neural'],
  icml: ['international conference on machine learning', 'icml'],
  acl: ['association for computational linguistics', 'acl', 'annual meeting'],
  emnlp: ['empirical methods in natural language processing', 'emnlp'],
  naacl: ['north american chapter', 'naacl'],
  aaai: ['aaai conference on artificial intelligence', 'aaai'],
  cvpr: ['computer vision and pattern recognition', 'cvpr'],
  iccv: ['international conference on computer vision', 'iccv'],
  eccv: ['european conference on computer vision', 'eccv'],
  colm: ['conference on language modeling', 'colm'],
  jmlr: ['journal of machine learning research', 'jmlr'],
  arxiv: ['arxiv', 'corr', 'preprint'],
}

export function venuesAgree(bibVenue, s2Venue) {
  const aRaw = stripLatex(bibVenue || '').toLowerCase()
  const bRaw = stripLatex(s2Venue || '').toLowerCase()
  if (!aRaw || !bRaw) return null

  // Acronym route — compare against raw lowercased strings so we don't
  // accidentally strip the words that identify the venue.
  for (const [, aliases] of Object.entries(VENUE_ACRONYMS)) {
    const aHit = aliases.some(al => aRaw.includes(al))
    const bHit = aliases.some(al => bRaw.includes(al))
    if (aHit && bHit) return true
  }

  const a = normalizeVenue(bibVenue || '')
  const b = normalizeVenue(s2Venue || '')
  if (!a || !b) return null
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true

  const ta = new Set(a.split(' ').filter(t => t.length > 2))
  const tb = new Set(b.split(' ').filter(t => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return null
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size) >= 0.5
}

// ---------------------------------------------------------------------------
// Levenshtein similarity
// ---------------------------------------------------------------------------

export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const v0 = new Array(b.length + 1)
  const v1 = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) v0[j] = j
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]
  }
  return v1[b.length]
}

export function titleSimilarity(a, b) {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na.length || !nb.length) return 0
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

// ---------------------------------------------------------------------------
// Semantic Scholar client
// ---------------------------------------------------------------------------

/**
 * Fetch one URL against the Semantic Scholar API, going through the shared
 * rate limiter and retrying transient failures (429, 5xx, network errors).
 *
 * Returns one of:
 *   - parsed JSON object on 2xx
 *   - { _notFound: true } on 404
 *   - { _error: string, _transient?: true } on permanent failure or
 *     exhausted retries. _transient: true means "S2 was unreachable, treat
 *     as unknown" — callers should not fabricate verdicts from this.
 *
 * `deps` is the dependency-injection seam used by tests:
 *   httpFetch  — replaces global fetch
 *   limiter    — replaces the module-level rate limiter
 *   sleepFn    — replaces setTimeout-based sleep
 *   backoffFn  — replaces computeBackoffMs (use a deterministic stub in tests)
 *   stats      — optional { retries, rateLimit429, networkErrors } counters
 */
async function s2Fetch(url, opts, apiKey, deps = {}) {
  const {
    httpFetch = fetch,
    limiter = s2Limiter,
    sleepFn = sleep,
    backoffFn = computeBackoffMs,
    stats,
  } = deps
  const headers = { 'User-Agent': 'Overleaf-AITutor/1.0', ...(opts?.headers || {}) }
  if (apiKey) headers['x-api-key'] = apiKey

  let lastErr = null
  for (let attempt = 0; attempt <= S2_MAX_RETRIES; attempt++) {
    await limiter.acquire()
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), S2_REQUEST_TIMEOUT_MS)
      : null
    try {
      const res = await httpFetch(url, {
        ...opts,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      })
      if (timeoutId) clearTimeout(timeoutId)

      if (res.status === 404) return { _notFound: true }
      if (res.status >= 200 && res.status < 300) {
        return await res.json()
      }
      if (res.status === 429 || res.status >= 500) {
        if (stats) {
          if (res.status === 429) stats.rateLimit429 = (stats.rateLimit429 || 0) + 1
          else stats.serverErrors5xx = (stats.serverErrors5xx || 0) + 1
        }
        if (attempt === S2_MAX_RETRIES) {
          const text = await res.text().catch(() => '')
          return {
            _error: `S2 ${res.status} after ${S2_MAX_RETRIES} retries: ${text.slice(0, 200)}`,
            _transient: true,
          }
        }
        const retryAfter = parseRetryAfter(
          res.headers?.get ? res.headers.get('retry-after') : null
        )
        const wait = retryAfter != null ? retryAfter : backoffFn(attempt)
        // Cooperative backoff: make all other in-process S2 callers wait too.
        if (retryAfter != null && limiter.pauseFor) limiter.pauseFor(retryAfter)
        if (stats) stats.retries = (stats.retries || 0) + 1
        await sleepFn(wait)
        continue
      }
      // 4xx (non-429) → permanent client error, no point retrying.
      const text = await res.text().catch(() => '')
      return { _error: `S2 ${res.status}: ${text.slice(0, 200)}` }
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)
      lastErr = err
      if (stats) stats.networkErrors = (stats.networkErrors || 0) + 1
      if (attempt === S2_MAX_RETRIES) {
        return { _error: `S2 request failed: ${err.message}`, _transient: true }
      }
      if (stats) stats.retries = (stats.retries || 0) + 1
      await sleepFn(backoffFn(attempt))
    }
  }
  return {
    _error: lastErr ? `S2 failed: ${lastErr.message}` : 'S2 failed after retries',
    _transient: true,
  }
}

/**
 * Look up papers by DOI in batches.
 *
 * Returns Map<doi_lowercase, paper|null>. A key is present-with-null when S2
 * confirmed the DOI is not in its index. A key is ABSENT from the map when
 * the lookup hit a transient error (429/5xx/network) — callers should treat
 * that as "unknown" and fall through to a second route (title search), not
 * as a confirmed miss. This distinction matters: a brief S2 outage must not
 * flag every DOI-bearing citation in the project as fabricated.
 *
 * The slice-level transient-error count is appended to `stats.doiBatchTransientErrors`
 * when a stats object is provided.
 */
export async function lookupByDOIs(dois, apiKey, fetchFn = s2Fetch, stats = null) {
  const result = new Map()
  if (dois.length === 0) return result
  for (let i = 0; i < dois.length; i += BATCH_SIZE) {
    const slice = dois.slice(i, i + BATCH_SIZE)
    const url = `${S2_BASE}/paper/batch?fields=${encodeURIComponent(S2_FIELDS)}`
    const body = JSON.stringify({ ids: slice.map(d => `DOI:${d}`) })
    const data = await fetchFn(
      url,
      { method: 'POST', body, headers: { 'Content-Type': 'application/json' } },
      apiKey
    )
    if (Array.isArray(data)) {
      for (let k = 0; k < slice.length; k++) {
        result.set(slice[k].toLowerCase(), data[k] || null)
      }
      continue
    }
    if (data?._transient) {
      if (stats) stats.doiBatchTransientErrors = (stats.doiBatchTransientErrors || 0) + slice.length
      // Leave keys absent — verifyEntry will fall through to title search.
      continue
    }
    // Permanent error (e.g. malformed request, 4xx other than 404) — treat
    // as confirmed-not-found so we don't loop forever on the same broken input.
    for (const d of slice) result.set(d.toLowerCase(), null)
  }
  return result
}

/**
 * Search S2 by title.
 *
 * Returns:
 *   Array of candidate papers (possibly empty) on success.
 *   null on transient API failure — callers should treat as "unknown" rather
 *     than "no results," so legitimate citations aren't flagged as fabricated
 *     during an S2 outage.
 */
export async function searchByTitle(title, apiKey, fetchFn = s2Fetch) {
  const q = encodeURIComponent(stripLatex(title).slice(0, 300))
  const url = `${S2_BASE}/paper/search?query=${q}&limit=${SEARCH_LIMIT}&fields=${encodeURIComponent(S2_FIELDS)}`
  const data = await fetchFn(url, { method: 'GET' }, apiKey)
  if (data?._transient) return null
  if (data?._notFound || data?._error) return []
  return Array.isArray(data?.data) ? data.data : []
}

// ---------------------------------------------------------------------------
// Per-entry verification logic
// ---------------------------------------------------------------------------

/**
 * Compare a parsed bib entry to a Semantic Scholar paper record.
 * Returns { issues: [{ field, severity, detail }], titleSim }.
 */
export function compareEntryToPaper(entry, paper) {
  const issues = []
  const bibTitle = entry.fields.title || ''
  const s2Title = paper?.title || ''
  const titleSim = titleSimilarity(bibTitle, s2Title)

  // Author surname
  const bibSurnames = extractAuthorSurnames(entry.fields.author || '')
  const s2Surnames = (paper?.authors || []).map(a => {
    const parts = (a.name || '').trim().split(/\s+/)
    return normalizeAuthorName(parts[parts.length - 1] || '')
  }).filter(Boolean)
  if (bibSurnames.length > 0 && s2Surnames.length > 0) {
    const firstBib = bibSurnames[0]
    const firstS2 = s2Surnames[0]
    if (firstBib && firstS2 && firstBib !== firstS2) {
      // Allow partial match (e.g., hyphenated, Western-vs-Asian conventions)
      const overlap = bibSurnames.filter(n => s2Surnames.includes(n)).length
      if (overlap / Math.max(1, bibSurnames.length) < 0.5) {
        issues.push({
          field: 'author',
          severity: 'critical',
          detail: `bib first author "${firstBib}" but Semantic Scholar lists "${firstS2}"`,
        })
      } else if (firstBib !== firstS2) {
        issues.push({
          field: 'author',
          severity: 'warning',
          detail: `first-author surname differs: bib "${firstBib}" vs S2 "${firstS2}" (other authors do match)`,
        })
      }
    }
  }

  // Year
  const bibYear = parseInt(entry.fields.year, 10)
  const s2Year = paper?.year ? parseInt(paper.year, 10) : null
  if (Number.isFinite(bibYear) && Number.isFinite(s2Year)) {
    const diff = Math.abs(bibYear - s2Year)
    if (diff > YEAR_TOLERANCE_WARN) {
      issues.push({ field: 'year', severity: 'critical', detail: `bib year ${bibYear} vs S2 year ${s2Year}` })
    } else if (diff > YEAR_TOLERANCE_OK) {
      issues.push({ field: 'year', severity: 'warning', detail: `bib year ${bibYear} vs S2 year ${s2Year}` })
    }
  }

  // Venue
  const bibVenue = entry.fields.booktitle || entry.fields.journal || entry.fields.publisher || ''
  const s2Venue = paper?.publicationVenue?.name || paper?.venue || ''
  const venueAgree = venuesAgree(bibVenue, s2Venue)
  if (venueAgree === false) {
    issues.push({
      field: 'venue',
      severity: 'warning',
      detail: `bib venue "${bibVenue}" vs S2 venue "${s2Venue}"`,
    })
  }

  // DOI cross-check
  const bibDoi = (entry.fields.doi || '').toLowerCase().trim()
  const s2Doi = (paper?.externalIds?.DOI || '').toLowerCase().trim()
  if (bibDoi && s2Doi && bibDoi !== s2Doi) {
    issues.push({
      field: 'doi',
      severity: 'critical',
      detail: `bib DOI "${bibDoi}" vs S2 DOI "${s2Doi}"`,
    })
  }

  return { issues, titleSim }
}

/**
 * Build a single comment from verification issues. Returns null if no issues
 * worth reporting (entry verified clean).
 */
function buildComment(entry, verdict, bibPath) {
  const headerLine = `@${entry.type}{${entry.key},`
  const headerIdx = entry.raw.indexOf(headerLine)
  const startOffset = entry.charStart + (headerIdx >= 0 ? headerIdx : 0)
  const endOffset = startOffset + headerLine.length

  let severity = 'suggestion'
  let body = ''
  if (verdict.kind === 'fabricated') {
    severity = 'critical'
    body = `Reference may be fabricated. No close match in Semantic Scholar (best title similarity ${verdict.bestSim.toFixed(2)}). ` +
      (verdict.bestCandidate
        ? `Closest hit: "${verdict.bestCandidate.title}" (${verdict.bestCandidate.year}, ${verdict.bestCandidate.venue || 'no venue'}).`
        : 'No candidates returned by S2 search.')
  } else if (verdict.kind === 'doi_not_found') {
    severity = 'critical'
    body = `DOI "${entry.fields.doi}" was not found in Semantic Scholar. Verify the reference details.`
  } else if (verdict.kind === 'doi_mismatch') {
    severity = 'critical'
    body = `DOI "${entry.fields.doi}" resolves to a different paper: "${verdict.paper.title}" (${verdict.paper.year}). Check the citation.`
  } else if (verdict.kind === 'unverified') {
    severity = 'warning'
    body = `Could not verify in Semantic Scholar (no result above ${TITLE_MATCH_CANDIDATE} title similarity). ` +
      `This is common for workshop papers, tech reports, or pre-2000 work — confirm details manually.`
  } else if (verdict.kind === 'mismatch') {
    const sevs = verdict.issues.map(i => i.severity)
    severity = sevs.includes('critical') ? 'critical' : 'warning'
    const lines = verdict.issues.map(i => `- ${i.field}: ${i.detail}`).join('\n')
    body = `Reference fields disagree with Semantic Scholar record "${verdict.paper.title}" (${verdict.paper.year || 'unknown year'}, ${verdict.paper.venue || 'no venue'}):\n${lines}`
  } else {
    return null
  }

  return {
    highlightText: headerLine,
    comment: body,
    severity,
    category: 'citation_verification',
    agentName: 'Reference Verification',
    docPath: bibPath,
    startOffset,
    endOffset,
    _preMapped: true,
  }
}

/**
 * Decide a verdict for one parsed bib entry, given S2 lookup results.
 *
 * @param entry           parsed bib entry
 * @param doiLookup       Map<doi, paper|null>
 * @param titleSearchFn   async (title) => candidate papers
 */
export async function verifyEntry(entry, doiLookup, titleSearchFn) {
  // Skip non-bibliographic types (some bib files include @misc with no title)
  const title = (entry.fields.title || '').trim()
  const doi = (entry.fields.doi || '').toLowerCase().trim()

  // 1. DOI route. Three cases:
  //    has(doi) && paper          → matched, compare fields
  //    has(doi) && paper === null → S2 confirmed not found → doi_not_found
  //    !has(doi)                  → DOI lookup was a transient miss; do not
  //                                 emit doi_not_found, fall through to title.
  if (doi && doiLookup.has(doi)) {
    const paper = doiLookup.get(doi)
    if (paper === null) {
      return { kind: 'doi_not_found' }
    }
    if (paper && paper.title) {
      const sim = titleSimilarity(title, paper.title)
      if (title && sim < 0.5) {
        return { kind: 'doi_mismatch', paper }
      }
      const cmp = compareEntryToPaper(entry, paper)
      if (cmp.issues.length === 0) return { kind: 'verified', paper }
      return { kind: 'mismatch', paper, issues: cmp.issues }
    }
  }

  if (!title) {
    return { kind: 'no_title' }
  }

  // 2. Title search route
  const candidates = await titleSearchFn(title)
  if (candidates === null) {
    // Transient S2 failure — do not fabricate a verdict.
    return { kind: 'unverified', reason: 'api_unavailable' }
  }
  if (candidates.length === 0) {
    return { kind: 'fabricated', bestSim: 0, bestCandidate: null }
  }

  let best = null
  let bestSim = 0
  for (const c of candidates) {
    const sim = titleSimilarity(title, c.title || '')
    if (sim > bestSim) {
      bestSim = sim
      best = c
    }
  }

  if (bestSim < TITLE_MATCH_CANDIDATE) {
    return {
      kind: 'fabricated',
      bestSim,
      bestCandidate: best ? { title: best.title, year: best.year, venue: best.venue || best.publicationVenue?.name } : null,
    }
  }

  if (bestSim < TITLE_MATCH_STRONG) {
    // Borderline match — only report if other fields disagree
    const cmp = compareEntryToPaper(entry, best)
    if (cmp.issues.length === 0) {
      return { kind: 'unverified' }
    }
    return { kind: 'mismatch', paper: best, issues: cmp.issues }
  }

  const cmp = compareEntryToPaper(entry, best)
  if (cmp.issues.length === 0) return { kind: 'verified', paper: best }
  return { kind: 'mismatch', paper: best, issues: cmp.issues }
}

// ---------------------------------------------------------------------------
// Cache (per-project, on-disk JSON)
// ---------------------------------------------------------------------------

function cacheKeyFor(entry) {
  const doi = (entry.fields.doi || '').toLowerCase().trim()
  if (doi) return `doi:${doi}`
  const t = normalizeTitle(entry.fields.title || '').slice(0, 120)
  const a = (extractAuthorSurnames(entry.fields.author || '')[0] || '')
  const y = entry.fields.year || ''
  const h = crypto.createHash('sha1').update(`${t}|${a}|${y}`).digest('hex').slice(0, 16)
  return `tit:${h}`
}

function loadCache(cacheDir) {
  if (!cacheDir) return {}
  try {
    const p = path.join(cacheDir, 'citation_cache.json')
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return {}
  }
}

function saveCache(cacheDir, cache) {
  if (!cacheDir) return
  try {
    // Atomic write: serialize into a per-pid temp file, then rename onto the
    // canonical path. rename(2) is atomic on POSIX, so concurrent runs on the
    // same project (two web replicas, or the same project being checked twice
    // simultaneously) can't produce a half-written JSON file that breaks the
    // next loadCache(). The pid suffix prevents two writers from racing on
    // the same temp filename.
    const p = path.join(cacheDir, 'citation_cache.json')
    const tmp = path.join(cacheDir, `citation_cache.json.${process.pid}.tmp`)
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf-8')
    fs.renameSync(tmp, p)
  } catch (err) {
    console.warn(`[CitationVerifier] Failed to save cache: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Verify all citations across all .bib files in a project.
 *
 * @param opts.bibFiles   array of { path, content } objects
 * @param opts.apiKey     Semantic Scholar API key (required; verifier no-ops without it)
 * @param opts.cacheDir   project cache dir for persisted lookups
 * @param opts.maxEntries cap on entries to verify (default 200)
 * @param opts.fetchFn    test hook — overrides s2Fetch
 *
 * @returns { comments, stats }
 */
export async function verifyCitations({
  bibFiles = [],
  apiKey,
  cacheDir,
  maxEntries = parseInt(process.env.AI_TUTOR_CITATION_MAX_ENTRIES, 10) || DEFAULT_MAX_ENTRIES,
  fetchFn = s2Fetch,
} = {}) {
  if (!apiKey) {
    console.log('[CitationVerifier] SEMANTIC_SCHOLAR_API_KEY not set, skipping')
    return { comments: [], stats: { skipped: 'no_api_key' } }
  }
  if (!bibFiles || bibFiles.length === 0) {
    console.log('[CitationVerifier] No .bib files in project, skipping')
    return { comments: [], stats: { skipped: 'no_bib_files' } }
  }

  const start = Date.now()
  const allEntries = []
  for (const { path: bibPath, content } of bibFiles) {
    const parsed = parseBibFile(content)
    for (const e of parsed) allEntries.push({ ...e, _bibPath: bibPath })
  }
  if (allEntries.length === 0) {
    return { comments: [], stats: { skipped: 'empty_bibs' } }
  }
  const truncated = allEntries.length > maxEntries
  const entries = allEntries.slice(0, maxEntries)
  console.log(
    `[CitationVerifier] Parsed ${allEntries.length} entries from ${bibFiles.length} bib file(s); ` +
    `verifying ${entries.length}${truncated ? ` (capped, dropped ${allEntries.length - entries.length})` : ''}`
  )

  const cache = loadCache(cacheDir)
  const cachedHits = []
  const toVerify = []
  for (const e of entries) {
    const ck = cacheKeyFor(e)
    if (cache[ck]) {
      cachedHits.push({ entry: e, verdict: cache[ck] })
    } else {
      toVerify.push({ entry: e, cacheKey: ck })
    }
  }
  console.log(`[CitationVerifier] Cache: ${cachedHits.length} hits, ${toVerify.length} to verify`)

  // Counters shared with the s2Fetch layer so we know whether the API was
  // healthy during this run (separate from per-verdict counts below).
  const apiStats = {
    retries: 0,
    rateLimit429: 0,
    serverErrors5xx: 0,
    networkErrors: 0,
    doiBatchTransientErrors: 0,
  }
  const tracedFetch = (url, opts, key) =>
    fetchFn === s2Fetch
      ? s2Fetch(url, opts, key, { stats: apiStats })
      : fetchFn(url, opts, key)

  // 1. DOI batch
  const doisToLookup = [...new Set(
    toVerify.map(({ entry }) => (entry.fields.doi || '').toLowerCase().trim()).filter(Boolean)
  )]
  const doiLookup = await lookupByDOIs(doisToLookup, apiKey, tracedFetch, apiStats)

  // 2. Verify each (title search done lazily inside verifyEntry).
  // Pacing is owned by the module-level limiter inside s2Fetch — no per-loop
  // sleep here, otherwise we'd double-throttle and waste wall-clock.
  const titleSearchFn = title => searchByTitle(title, apiKey, tracedFetch)
  const verdicts = []
  for (const { entry, cacheKey } of toVerify) {
    try {
      const verdict = await verifyEntry(entry, doiLookup, titleSearchFn)
      verdicts.push({ entry, verdict })
      // Don't cache transient-unverified verdicts — we want to retry next run
      // once S2 is healthy again. Cache everything else, including legitimate
      // unverified (borderline match) verdicts.
      const isTransient = verdict.kind === 'unverified' && verdict.reason === 'api_unavailable'
      if (!isTransient) cache[cacheKey] = verdict
    } catch (err) {
      console.warn(`[CitationVerifier] verify failed for ${entry.key}: ${err.message}`)
    }
  }
  saveCache(cacheDir, cache)

  // 3. Comments from cached + fresh verdicts
  const comments = []
  const stats = {
    verified: 0, fabricated: 0, mismatch: 0, unverified: 0,
    doi_not_found: 0, doi_mismatch: 0, no_title: 0,
    api: apiStats,
  }
  for (const { entry, verdict } of [...cachedHits, ...verdicts]) {
    stats[verdict.kind] = (stats[verdict.kind] || 0) + 1
    if (verdict.kind === 'verified' || verdict.kind === 'no_title') continue
    const c = buildComment(entry, verdict, entry._bibPath)
    if (c) comments.push(c)
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(
    `[CitationVerifier] Done in ${elapsed}s — ${comments.length} comments. ` +
    `Stats: ${JSON.stringify(stats)}`
  )

  return { comments, stats, elapsed }
}

export const __test__ = {
  parseFields,
  findMatchingBrace,
  buildComment,
  cacheKeyFor,
  s2Fetch,
  s2Limiter,
  S2RateLimiter,
  parseRetryAfter,
  computeBackoffMs,
  loadCache,
  saveCache,
  S2_MIN_INTERVAL_MS,
  S2_MAX_RETRIES,
}

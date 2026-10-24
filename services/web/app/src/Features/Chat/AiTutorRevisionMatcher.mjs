/**
 * AiTutorRevisionMatcher.mjs
 *
 * Labels fresh review comments against threads from an earlier review run
 * (new / still_open / dismissed) and finds prior threads that are now fixed.
 * Also holds the small file helpers for the applied-thread record and run history.
 */

import fs from 'node:fs'
import path from 'node:path'

export const AI_TUTOR_THREAD_RE = /^\[(AI Tutor|critical|warning|suggestion)\]/
export const REVISION_MATCH_THRESHOLD = 0.4
// Prior threads with no recorded location (made before applied_threads.json) are
// matched on text alone, which needs a much higher bar than the located case.
export const UNLOCATED_MATCH_THRESHOLD = 0.7

const PREFIX_RE = /^(\[AI Tutor\]\s*)?\[(critical|warning|suggestion)\]\s*(\[[^\]]*\]\s*)?/i
const AGENT_TAG_RE = /^(?:\[AI Tutor\]\s*)?\[(?:critical|warning|suggestion)\]\s*\[([^\]]*)\]/
const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype'])
const APPLIED_FILE = 'applied_threads.json'

/**
 * Normalize whitespace: collapse runs of whitespace into a single space, trim.
 */
export function normalizeWhitespace(str)
{
  return str.replace(/\s+/g, ' ').trim()
}

/**
 * Compute Dice coefficient (bigram similarity) between two strings.
 * Returns a value between 0.0 and 1.0.
 */
export function diceCoefficient(a, b)
{
  if (a === b) return 1.0
  if (a.length < 2 || b.length < 2) return 0.0

  const bigramsA = new Map()
  for (let i = 0; i < a.length - 1; i++)
  {
    const bg = a.slice(i, i + 2)
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1)
  }

  const bigramsB = new Map()
  for (let i = 0; i < b.length - 1; i++)
  {
    const bg = b.slice(i, i + 2)
    bigramsB.set(bg, (bigramsB.get(bg) || 0) + 1)
  }

  let intersection = 0
  for (const [bg, countA] of bigramsA)
  {
    intersection += Math.min(countA, bigramsB.get(bg) || 0)
  }

  return (2.0 * intersection) / ((a.length - 1) + (b.length - 1))
}

export function comparisonKey(text)
{
  return normalizeWhitespace(text.replace(PREFIX_RE, '').toLowerCase())
}

function sameLocation(c, t)
{
  if (c.docPath !== t.docPath) return false
  const a = normalizeWhitespace(c.highlightText || '').toLowerCase()
  const b = normalizeWhitespace(t.highlightText || '').toLowerCase()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a) || diceCoefficient(a, b) >= 0.5
}

export function labelComments(comments, priorThreads)
{
  const priorKeys = priorThreads.map(t => comparisonKey(t.comment))
  const matchedOpen = new Set()
  const counts = { new: 0, still_open: 0, dismissed: 0, fixed: 0 }

  const labeled = comments.map(c =>
  {
    const key = comparisonKey(c.comment)
    let best = -1
    let bestScore = 0
    priorKeys.forEach((pk, i) =>
    {
      const t = priorThreads[i]
      const located = Boolean(t.docPath && t.highlightText)
      if (located && !sameLocation(c, t)) return
      const score = diceCoefficient(key, pk)
      const min = located ? REVISION_MATCH_THRESHOLD : UNLOCATED_MATCH_THRESHOLD
      if (score >= min && score > bestScore)
      {
        best = i
        bestScore = score
      }
    })
    let revisionLabel = 'new'
    if (best >= 0)
    {
      if (priorThreads[best].status === 'open')
      {
        revisionLabel = 'still_open'
        matchedOpen.add(priorThreads[best].threadId)
      }
      else revisionLabel = 'dismissed'
    }
    counts[revisionLabel]++
    return { ...c, revisionLabel }
  })

  const fixedThreadIds = priorThreads
    .filter(t => t.status === 'open' && !matchedOpen.has(t.threadId))
    .map(t => t.threadId)
  counts.fixed = fixedThreadIds.length
  return { comments: labeled, counts, fixedThreadIds }
}

function isTutorComment(text)
{
  if (typeof text !== 'string' || !AI_TUTOR_THREAD_RE.test(text)) return false
  return text.match(AGENT_TAG_RE)?.[1] !== 'Reference Verification'
}

export function buildPriorThreads(threads, appliedThreads)
{
  const out = []
  for (const [threadId, t] of Object.entries(threads || {}))
  {
    const content = t?.messages?.[0]?.content
    if (!isTutorComment(content)) continue
    const a = appliedThreads?.[threadId]
    out.push({
      threadId,
      comment: content,
      status: t.resolved ? 'resolved' : 'open',
      ...(a?.docPath && a?.highlightText && { docPath: a.docPath, highlightText: a.highlightText }),
    })
  }
  for (const [threadId, a] of Object.entries(appliedThreads || {}))
  {
    if (Object.hasOwn(threads || {}, threadId) || !isTutorComment(a?.comment)) continue
    out.push({
      threadId,
      comment: a.comment,
      status: 'deleted',
      ...(a.docPath && a.highlightText && { docPath: a.docPath, highlightText: a.highlightText }),
    })
  }
  return out
}

const APPLIED_FIELDS = ['threadId', 'comment', 'highlightText', 'docPath', 'agentName', 'severity']

export function validateAppliedThreads(body)
{
  const list = body?.threads
  if (!Array.isArray(list)) return null
  const out = []
  for (const e of list)
  {
    if (!e || typeof e !== 'object') return null
    if (!APPLIED_FIELDS.every(f => typeof e[f] === 'string')) return null
    if (!e.threadId || BAD_IDS.has(e.threadId)) return null
    out.push(Object.fromEntries(APPLIED_FIELDS.map(f => [f, e[f]])))
  }
  return out
}

export function readAppliedThreads(cacheDir)
{
  const file = path.join(cacheDir, APPLIED_FILE)
  if (!fs.existsSync(file)) return {}
  try
  {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  }
  catch (err)
  {
    console.warn(`[AiTutorRevisionMatcher] could not parse ${file}: ${err.message}`)
    return {}
  }
}

export function mergeAppliedThreads(cacheDir, threads, now = new Date())
{
  fs.mkdirSync(cacheDir, { recursive: true })
  const record = readAppliedThreads(cacheDir)
  for (const { threadId, ...fields } of threads)
  {
    record[threadId] = { ...fields, appliedAt: now.toISOString() }
  }
  fs.writeFileSync(path.join(cacheDir, APPLIED_FILE), JSON.stringify(record, null, 2))
}

export function clearAppliedThreads(cacheDir)
{
  fs.rmSync(path.join(cacheDir, APPLIED_FILE), { force: true })
}

export function saveReviewRun(cacheDir, result, now = new Date())
{
  const dir = path.join(cacheDir, 'review_runs')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, now.toISOString().replace(/[:.]/g, '-') + '.json')
  // 'wx': never overwrite an earlier run; a same-millisecond collision throws.
  fs.writeFileSync(file, JSON.stringify(result, null, 2), { flag: 'wx' })
  return file
}

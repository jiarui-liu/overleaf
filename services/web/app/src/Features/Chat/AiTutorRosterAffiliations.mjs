/**
 * AiTutorRosterAffiliations.mjs
 *
 * Checks each lab member's affiliations on the title page against what AdminBot
 * has on record for them: the affiliation on their member record, and Vector
 * Institute for members who hold Vector compute.
 *
 * AdminBot answers only for names it is sent, behind a token that opens this
 * one read (POST /papermentor/author-affiliations). Without
 * ADMINBOT_PAPERMENTOR_TOKEN the check is skipped.
 *
 * The orchestrator extracts { name, affiliations } per author with the LLM;
 * everything here is deterministic.
 */

export const ROSTER_AFFILIATION_AGENT_NAME = 'Lab Affiliation Check'

const DEFAULT_ADMINBOT_URL = 'https://admin.safe.eu'
const FETCH_TIMEOUT_MS = 8000

/**
 * Ask AdminBot what it records for each author. Returns [] when unconfigured
 * or on any failure: a missing roster must never block a review.
 */
export async function fetchAuthorAffiliations(
  names,
  {
    url = process.env.ADMINBOT_URL || DEFAULT_ADMINBOT_URL,
    token = process.env.ADMINBOT_PAPERMENTOR_TOKEN,
    fetchImpl = globalThis.fetch,
  } = {}
)
{
  if (!token || names.length === 0) return []
  try
  {
    const response = await fetchImpl(`${url.replace(/\/+$/, '')}/papermentor/author-affiliations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ authors: names.slice(0, 100) }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok)
    {
      console.warn(`[AI Tutor] [${ROSTER_AFFILIATION_AGENT_NAME}] AdminBot answered ${response.status}; skipping`)
      return []
    }
    const body = await response.json()
    return Array.isArray(body?.authors) ? body.authors : []
  } catch (err)
  {
    console.warn(`[AI Tutor] [${ROSTER_AFFILIATION_AGENT_NAME}] AdminBot unreachable (${err.message}); skipping`)
    return []
  }
}

// Spellings the lab's own institutions go by, folded to one form before comparing.
const ALIASES = [
  [/\bmpi(?:[- ]is)?\b/g, 'max planck institute'],
  [/\buoft\b|\bu of t\b/g, 'university of toronto'],
  [/\buniv\b/g, 'university'],
  [/\binst\b/g, 'institute'],
]

/** Lowercase words of an affiliation, with LaTeX, accents and punctuation removed. */
export function normalizeAffiliation(text)
{
  let s = text
    .replace(/\\["'`^~=.uvHc]\s*\{?([a-zA-Z])\}?/g, '$1') // T\"ubingen, T\"{u}bingen
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
  for (const [re, to] of ALIASES) s = s.replace(re, to)
  return s.replace(/\s+/g, ' ').trim()
}

// Words that carry no identity in an institution's name.
const STOP_WORDS = new Set(['of', 'for', 'the', 'and', 'at', 'in', 'de', 'fur'])

/**
 * Whether a recorded affiliation is covered by those listed for the author:
 * every significant word of the record appears in them. "University of
 * Toronto" is covered by "University of Toronto & Vector Institute", and a
 * record of "University of Toronto & Vector Institute" by the two listed
 * separately, but neither by "University of Waterloo".
 */
export function affiliationListed(recorded, listed)
{
  const words = normalizeAffiliation(recorded).split(' ').filter(w => w && !STOP_WORDS.has(w))
  const have = new Set(listed.flatMap(l => normalizeAffiliation(l).split(' ')))
  return words.every(w => have.has(w))
}

/** The first line of the author block that names the author, verbatim. */
function lineNaming(frontMatter, name)
{
  const surname = name.trim().split(/\s+/).pop()
  if (!surname) return null
  const line = frontMatter.split('\n').find(l => l.includes(surname) && !/^\s*%/.test(l))
  return line ? line.trim().slice(0, 200) : null
}

/**
 * Compare extracted authors with AdminBot's answers. `authors` is
 * [{ name, affiliations: string[] }] as read from the title page; `roster` is
 * AdminBot's answer, aligned by `author`. Returns review comments.
 */
export function compareRosterAffiliations(authors, roster, frontMatter)
{
  const byAuthor = new Map(roster.map(r => [r.author, r.member]))
  const comments = []
  for (const { name, affiliations } of authors)
  {
    const member = byAuthor.get(name)
    if (!member) continue
    const missing = []
    if (member.affiliation && !affiliationListed(member.affiliation, affiliations))
    {
      missing.push(member.affiliation)
    }
    if (member.vector && !affiliations.some(a => /\bvector\b/i.test(normalizeAffiliation(a))))
    {
      missing.push('Vector Institute')
    }
    if (missing.length === 0) continue
    const highlightText = lineNaming(frontMatter, name)
    if (!highlightText) continue
    const listed = affiliations.length ? affiliations.map(a => `"${a}"`).join(', ') : 'no affiliation'
    comments.push({
      highlightText,
      comment:
        `${name} is listed with ${listed}, but the lab's records also give ` +
        `${missing.map(m => `"${m}"`).join(' and ')}` +
        `${member.vector && missing.includes('Vector Institute') ? ' (they use Vector compute)' : ''}. ` +
        'Add the missing affiliation for this author, keeping the numbering in order of first appearance. ' +
        'If the record is out of date, ask them to update it in AdminBot.',
      severity: 'warning',
      category: 'front_matter',
      agentName: ROSTER_AFFILIATION_AGENT_NAME,
    })
  }
  return comments
}

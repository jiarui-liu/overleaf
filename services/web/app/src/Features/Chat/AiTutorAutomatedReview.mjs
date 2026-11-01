/**
 * Automated Paper Mentor reviews.
 *
 * AdminBot asks for a review of a paper that is at its review step; the server
 * runs it in the background, exactly as the panel would, and the authors load
 * and apply it from the panel the next time they open it. Nothing is written
 * into the project until an author clicks Apply.
 *
 * The bookkeeping lives next to the review in the project's cache directory,
 * in automated_review.json:
 *   { status: 'running' | 'ready' | 'failed', requestedAt, finishedAt?,
 *     reviewedAt?, error?, claimedAt?, claimedBy? }
 * The review itself is the ordinary review_comments.json, so a review an author
 * runs by hand afterwards replaces it and the automated one is no longer offered.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VENUES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'ai-tutor-skills',
  '02_venues'
)

export const AUTOMATED_STATE_FILE = 'automated_review.json'
const REVIEW_FILE = 'review_comments.json'

// One automated attempt per project per day, whatever came of it, so a review
// that keeps failing cannot turn the hourly trigger into an hourly LLM bill.
export const AUTOMATED_RETRY_MS = 24 * 60 * 60 * 1000
// A 'running' state older than this was left behind by a restart.
export const AUTOMATED_STALE_RUN_MS = 60 * 60 * 1000
export const MAX_CONCURRENT_AUTOMATED_REVIEWS = 2

const VENUE_RE = /^[a-z0-9_]{1,40}$/

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function serviceTokenMatches(authorization, expected)
{
  if (!expected) return false
  const match = /^Bearer\s+(\S+)$/i.exec(authorization || '')
  if (!match) return false
  // Hash both sides so timingSafeEqual sees equal lengths
  const given = crypto.createHash('sha256').update(match[1]).digest()
  const wanted = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(given, wanted)
}

/**
 * The token in an "Anyone with this link can edit" URL, or in a bare token.
 * Only the shape is read here; whether it is a real read-and-write token is
 * TokenAccessHandler's call.
 */
export function shareTokenFrom(value)
{
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  let pathname = trimmed
  if (/^https?:\/\//i.test(trimmed))
  {
    try
    {
      pathname = new URL(trimmed).pathname
    } catch
    {
      return null
    }
  }
  // The #checksum fragment is checked client-side and is not part of the token
  const segments = pathname.split('#')[0].split('/').filter(Boolean)
  return segments.length === 1 ? segments[0] : null
}

/**
 * The venue key to review against: AdminBot's guess (e.g. 'iclr_2026') when a
 * venue guideline exists for it, otherwise the panel's own default.
 */
export function automatedVenue(value, venuesDir = VENUES_DIR)
{
  if (typeof value !== 'string' || !VENUE_RE.test(value)) return 'arxiv'
  return fs.existsSync(path.join(venuesDir, `${value}.md`)) ? value : 'arxiv'
}

function readJsonFile(file)
{
  try
  {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch
  {
    return null
  }
}

export function readAutomatedState(cacheDir)
{
  return readJsonFile(path.join(cacheDir, AUTOMATED_STATE_FILE))
}

export function readCachedReview(cacheDir)
{
  return readJsonFile(path.join(cacheDir, REVIEW_FILE))
}

export function writeAutomatedState(cacheDir, state)
{
  fs.mkdirSync(cacheDir, { recursive: true })
  const file = path.join(cacheDir, AUTOMATED_STATE_FILE)
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2))
  fs.renameSync(`${file}.tmp`, file)
}

/**
 * Why a new automated review may not start now, or null when it may.
 * @returns {null | { status: 'running' } | { status: 'recent', lastRequestedAt: string }}
 */
export function automatedStartBlock(state, now = new Date())
{
  const requested = Date.parse(state?.requestedAt)
  if (!Number.isFinite(requested)) return null
  const age = now.getTime() - requested
  if (state.status === 'running' && age < AUTOMATED_STALE_RUN_MS) return { status: 'running' }
  if (age < AUTOMATED_RETRY_MS) return { status: 'recent', lastRequestedAt: state.requestedAt }
  return null
}

/** The automated review still waiting to be applied, or null. */
export function pendingAutomatedReview(state, review)
{
  if (!state || state.status !== 'ready' || state.claimedAt) return null
  // A later review (usually one an author ran by hand) has replaced it
  if (!review || !state.reviewedAt || review.reviewedAt !== state.reviewedAt) return null
  return review
}

/**
 * Claim the pending review for applying, so two coauthors cannot both apply it.
 * @returns the new state, or null when there is nothing to claim
 */
export function claimAutomatedReview(state, review, reviewedAt, userId, now = new Date())
{
  const pending = pendingAutomatedReview(state, review)
  if (!pending || pending.reviewedAt !== reviewedAt) return null
  return { ...state, claimedAt: now.toISOString(), claimedBy: String(userId) }
}

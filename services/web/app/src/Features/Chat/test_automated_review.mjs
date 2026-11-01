/**
 * test_automated_review.mjs
 *
 * Offline test for AiTutorAutomatedReview.mjs. No API calls.
 *
 * Run: node app/src/Features/Chat/test_automated_review.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AUTOMATED_RETRY_MS,
  AUTOMATED_STALE_RUN_MS,
  automatedStartBlock,
  automatedVenue,
  claimAutomatedReview,
  pendingAutomatedReview,
  readAutomatedState,
  serviceTokenMatches,
  shareTokenFrom,
  writeAutomatedState,
} from './AiTutorAutomatedReview.mjs'

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL ${name}: ${err.message}`)
  }
}

const now = new Date('2026-11-01T12:00:00Z')
const ago = ms => new Date(now.getTime() - ms).toISOString()

check('service token: exact bearer only', () => {
  assert.equal(serviceTokenMatches('Bearer s3cret', 's3cret'), true)
  assert.equal(serviceTokenMatches('bearer s3cret', 's3cret'), true)
  assert.equal(serviceTokenMatches('Bearer s3cre', 's3cret'), false)
  assert.equal(serviceTokenMatches('s3cret', 's3cret'), false)
  assert.equal(serviceTokenMatches(undefined, 's3cret'), false)
  // An unset token never matches, not even an empty header
  assert.equal(serviceTokenMatches('Bearer ', ''), false)
  assert.equal(serviceTokenMatches('Bearer x', undefined), false)
})

check('share token: from the edit link, the bare token, never other paths', () => {
  assert.equal(shareTokenFrom('https://overleaf.safe.eu/1234567890abcdefgh#a1b2c3'), '1234567890abcdefgh')
  assert.equal(shareTokenFrom('https://overleaf.safe.eu/1234567890abcdefgh/'), '1234567890abcdefgh')
  assert.equal(shareTokenFrom(' 1234567890abcdefgh '), '1234567890abcdefgh')
  assert.equal(shareTokenFrom('https://overleaf.safe.eu/project/65f0c0ffee0000000000abcd'), null)
  assert.equal(shareTokenFrom('https://overleaf.safe.eu/read/abcdefghijkl'), null)
  assert.equal(shareTokenFrom(''), null)
  assert.equal(shareTokenFrom(42), null)
})

check('venue: only venues with a guideline, anything else falls back to arxiv', () => {
  assert.equal(automatedVenue('iclr_2026'), 'iclr_2026')
  // A venue the skills do not cover yet reviews as the panel's default would
  assert.equal(automatedVenue('iclr_2031'), 'arxiv')
  assert.equal(automatedVenue('ICLR 2026'), 'arxiv')
  assert.equal(automatedVenue('../06_writing_style/affiliations'), 'arxiv')
  assert.equal(automatedVenue(undefined), 'arxiv')
})

check('start: once a day per project, and never while one is running', () => {
  assert.equal(automatedStartBlock(null, now), null)
  assert.deepEqual(automatedStartBlock({ status: 'running', requestedAt: ago(60_000) }, now), { status: 'running' })
  // A failure still waits out the day: the trigger runs hourly
  assert.equal(automatedStartBlock({ status: 'failed', requestedAt: ago(2 * 60 * 60_000) }, now).status, 'recent')
  assert.equal(automatedStartBlock({ status: 'ready', requestedAt: ago(AUTOMATED_RETRY_MS + 1) }, now), null)
  // A 'running' left behind by a restart stops blocking as running, but still counts as today's attempt
  assert.equal(automatedStartBlock({ status: 'running', requestedAt: ago(AUTOMATED_STALE_RUN_MS + 1) }, now).status, 'recent')
})

const review = { reviewedAt: '2026-11-01T11:00:00.000Z', summary: { total: 3 } }
const ready = { status: 'ready', requestedAt: ago(30 * 60_000), reviewedAt: review.reviewedAt }

check('pending: only a finished, unclaimed review that is still the latest', () => {
  assert.equal(pendingAutomatedReview(ready, review), review)
  assert.equal(pendingAutomatedReview({ ...ready, status: 'running' }, review), null)
  assert.equal(pendingAutomatedReview({ ...ready, claimedAt: now.toISOString() }, review), null)
  // An author ran a review by hand afterwards: that one replaced it
  assert.equal(pendingAutomatedReview(ready, { ...review, reviewedAt: '2026-11-01T11:30:00.000Z' }), null)
  assert.equal(pendingAutomatedReview(ready, null), null)
})

check('claim: succeeds once, for the review that is on offer', () => {
  const claimed = claimAutomatedReview(ready, review, review.reviewedAt, 'user1', now)
  assert.equal(claimed.claimedBy, 'user1')
  assert.equal(claimed.claimedAt, now.toISOString())
  assert.equal(claimAutomatedReview(claimed, review, review.reviewedAt, 'user2', now), null)
  assert.equal(claimAutomatedReview(ready, review, 'some-other-time', 'user1', now), null)
})

check('state file round-trips and survives a missing directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'automated-review-'))
  try {
    const cacheDir = path.join(dir, 'project')
    assert.equal(readAutomatedState(cacheDir), null)
    writeAutomatedState(cacheDir, ready)
    assert.deepEqual(readAutomatedState(cacheDir), ready)
    assert.deepEqual(fs.readdirSync(cacheDir), ['automated_review.json'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

if (failed > 0) {
  console.log(`${failed} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')

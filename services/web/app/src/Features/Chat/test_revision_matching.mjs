/**
 * test_revision_matching.mjs
 *
 * Offline test for AiTutorRevisionMatcher.mjs. No API calls.
 *
 * Run: node app/src/Features/Chat/test_revision_matching.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  diceCoefficient,
  comparisonKey,
  labelComments,
  buildPriorThreads,
  validateAppliedThreads,
  readAppliedThreads,
  mergeAppliedThreads,
  clearAppliedThreads,
  saveReviewRun,
} from './AiTutorRevisionMatcher.mjs'

const CACHE_DIR = process.env.CACHE_DIR || '/home/ubuntu/overleaf/develop/ai-tutor-cache'

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

const mk = comment => ({ comment, highlightText: 'x', docPath: 'main.tex' })

function runScenario(comments, label) {
  check(`scenario: ${label}`, () => {
    const k = comments
    assert.ok(k.length >= 6)
    const prior = [
      { threadId: 'o0', comment: k[0].comment + ' (see Sec. 2)', status: 'open' },
      { threadId: 'o1', comment: k[1].comment + ' (see Sec. 2)', status: 'open' },
      { threadId: 'r2', comment: k[2].comment, status: 'resolved' },
      { threadId: 'd3', comment: k[3].comment, status: 'deleted' },
      { threadId: 'ghost-a', comment: '[warning] [Ghost] qqq zzz xxj placeholder alpha', status: 'open' },
      { threadId: 'ghost-b', comment: '[warning] [Ghost] qqq zzz xxj placeholder beta', status: 'open' },
    ]
    const out = labelComments(k, prior)
    assert.equal(out.counts.still_open, 2)
    assert.equal(out.counts.dismissed, 2)
    assert.equal(out.counts.fixed, 2)
    assert.equal(out.counts.new, k.length - 4)
    assert.deepEqual(out.fixedThreadIds.sort(), ['ghost-a', 'ghost-b'])
    for (const l of ['new', 'still_open', 'dismissed'])
      assert.equal(out.comments.filter(c => c.revisionLabel === l).length, out.counts[l])
    assert.equal(k[0].revisionLabel, undefined)
  })
}

const fixture = [
  '[warning] [Clarity] The acronym GRPO is used in the introduction but never defined.',
  '[critical] [Experiments] No baseline comparison against retrieval-augmented models is reported.',
  '[suggestion] [Figures] Figure 3 has unlabeled axes, so readers cannot read the units.',
  '[warning] [Related Work] Prior work on curriculum learning for code models is missing.',
  '[suggestion] [Writing] Typo in the abstract: "recieve" should be "receive".',
  '[critical] [Contribution] The list of contributions is unclear and overlaps with the summary.',
].map(mk)
runScenario(fixture, 'inline fixture')

// Cached review files
if (fs.existsSync(CACHE_DIR)) {
  for (const id of fs.readdirSync(CACHE_DIR)) {
    const f = path.join(CACHE_DIR, id, 'review_comments.json')
    if (!fs.existsSync(f)) continue
    let review
    try {
      review = JSON.parse(fs.readFileSync(f, 'utf-8'))
    } catch {
      continue
    }
    const all = []
    const kept = []
    for (const list of Object.values(review.commentsByDoc || {})) {
      for (const c of list) {
        if (typeof c.comment !== 'string') continue
        all.push(c)
        const key = comparisonKey(c.comment)
        if (kept.every(o => diceCoefficient(key, comparisonKey(o.comment)) < 0.4)) kept.push(c)
      }
    }
    if (all.length >= 10) {
      check(`distinct comments stay new: ${id}`, () => {
        const half = Math.floor(all.length / 2)
        const prior = all.slice(0, half).map((c, i) => ({
          threadId: 'p' + i, comment: c.comment, status: 'open',
          docPath: c.docPath, highlightText: c.highlightText,
        }))
        const next = all.slice(half)
        // Located priors: only comments on the same spot can match.
        const located = labelComments(next, prior)
        assert.ok(located.counts.new >= next.length * 0.8, JSON.stringify(located.counts))
        // Unlocated priors (pre-feature threads): high text bar only.
        const bare = labelComments(next, prior.map(({ docPath, highlightText, ...t }) => t))
        assert.ok(bare.counts.new >= next.length * 0.8, JSON.stringify(bare.counts))
      })
    }
    if (kept.length < 6) {
      console.log(`SKIP ${id}: only ${kept.length} distinct comments`)
      continue
    }
    runScenario(kept, id)
  }
}

// Extra checks
check('empty prior: all new', () => {
  const out = labelComments(fixture, [])
  assert.equal(out.counts.new, fixture.length)
  assert.equal(out.counts.fixed, 0)
  assert.deepEqual(out.fixedThreadIds, [])
})

check('prefix on/off still matches', () => {
  const body = 'The acronym GRPO is used in the introduction but never defined.'
  const out = labelComments(
    [mk('[warning] [Clarity] ' + body)],
    [{ threadId: 't', comment: '[AI Tutor] [warning] [Clarity] ' + body, status: 'open' }]
  )
  assert.equal(out.comments[0].revisionLabel, 'still_open')
})

check('two comments share one open thread', () => {
  const body = 'The acronym GRPO is used in the introduction but never defined.'
  const out = labelComments(
    [mk('[warning] [Clarity] ' + body), mk('[warning] [Clarity] ' + body + ' Please fix.')],
    [{ threadId: 't', comment: '[warning] [Clarity] ' + body, status: 'open' }]
  )
  assert.deepEqual(out.comments.map(c => c.revisionLabel), ['still_open', 'still_open'])
  assert.deepEqual(out.fixedThreadIds, [])
})

check('best match wins', () => {
  const body = 'The acronym GRPO is used in the introduction but never defined anywhere.'
  const c = mk('[warning] [Clarity] ' + body)
  const a = labelComments([c], [
    { threadId: 'open', comment: '[warning] [Clarity] ' + body + ' Extra words appended here.', status: 'open' },
    { threadId: 'res', comment: '[warning] [Clarity] ' + body, status: 'resolved' },
  ])
  assert.equal(a.comments[0].revisionLabel, 'dismissed')
  const b = labelComments([c], [
    { threadId: 'open', comment: '[warning] [Clarity] ' + body, status: 'open' },
    { threadId: 'res', comment: '[warning] [Clarity] ' + body + ' Extra words appended here.', status: 'resolved' },
  ])
  assert.equal(b.comments[0].revisionLabel, 'still_open')
})

check('same text at a different location stays new', () => {
  const body = 'The acronym GRPO is used in the introduction but never defined.'
  const prior = [{
    threadId: 't', comment: '[warning] [Clarity] ' + body, status: 'open',
    docPath: 'other.tex', highlightText: 'GRPO',
  }]
  const out = labelComments([{ ...mk('[warning] [Clarity] ' + body), highlightText: 'GRPO' }], prior)
  assert.equal(out.comments[0].revisionLabel, 'new')
  prior[0].docPath = 'main.tex'
  const same = labelComments([{ ...mk('[warning] [Clarity] ' + body), highlightText: 'GRPO' }], prior)
  assert.equal(same.comments[0].revisionLabel, 'still_open')
})

check('severity-only prefix threads are prior threads', () => {
  const got = buildPriorThreads({ t1: { messages: [{ content: '[critical] This opening is too vague.' }] } }, {})
  assert.equal(got.length, 1)
  assert.equal(comparisonKey('[critical] This opening is too vague.'), 'this opening is too vague.')
  const out = labelComments(
    [mk('[critical] [Clarity] This opening is too vague.')], got
  )
  assert.equal(out.comments[0].revisionLabel, 'still_open')
})

check('buildPriorThreads', () => {
  assert.deepEqual(
    buildPriorThreads({ t1: { messages: [{ content: '[warning] [Clarity] a b c' }] } }, {}),
    [{ threadId: 't1', comment: '[warning] [Clarity] a b c', status: 'open' }]
  )
  assert.equal(
    buildPriorThreads({ t1: { messages: [{ content: '[warning] [Clarity] a' }], resolved: true } }, {})[0].status,
    'resolved'
  )
  assert.deepEqual(
    buildPriorThreads({
      a: { messages: [] },
      b: { messages: [{ content: 'hello' }] },
      c: { messages: [{ content: '[warning] [Reference Verification] x' }] },
    }, {}),
    []
  )
  assert.deepEqual(
    buildPriorThreads({}, { gone: { comment: '[critical] [Method] y' } }),
    [{ threadId: 'gone', comment: '[critical] [Method] y', status: 'deleted' }]
  )
  const dup = buildPriorThreads(
    { t1: { messages: [{ content: '[warning] [Clarity] a' }] } },
    { t1: { comment: '[warning] [Clarity] a' } }
  )
  assert.equal(dup.length, 1)
  assert.equal(dup[0].status, 'open')
  assert.deepEqual(buildPriorThreads({}, { r: { comment: '[AI Tutor] [warning] [Reference Verification] z' } }), [])
  assert.deepEqual(buildPriorThreads({}, {}), [])
})

check('validateAppliedThreads', () => {
  const e = {
    threadId: 't1', comment: 'c', highlightText: 'h', docPath: 'main.tex', agentName: 'Clarity', severity: 'warning',
  }
  assert.deepEqual(validateAppliedThreads({ threads: [e] }), [e])
  assert.deepEqual(validateAppliedThreads({ threads: [{ ...e, extra: 1 }] }), [e])
  assert.equal(validateAppliedThreads({}), null)
  assert.equal(validateAppliedThreads({ threads: 'x' }), null)
  assert.equal(validateAppliedThreads({ threads: [{ ...e, threadId: 5 }] }), null)
  assert.equal(validateAppliedThreads({ threads: [{ ...e, severity: 1 }] }), null)
  const { docPath, ...noDoc } = e
  assert.equal(validateAppliedThreads({ threads: [noDoc] }), null)
  assert.equal(validateAppliedThreads({ threads: [{ ...e, threadId: '__proto__' }] }), null)
})

check('applied threads files', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rev-')), 'sub')
  assert.deepEqual(readAppliedThreads(dir), {})
  const mkT = id => ({
    threadId: id, comment: 'c' + id, highlightText: 'h', docPath: 'main.tex', agentName: 'A', severity: 'warning',
  })
  mergeAppliedThreads(dir, [mkT('a')])
  mergeAppliedThreads(dir, [mkT('b')])
  const got = readAppliedThreads(dir)
  assert.deepEqual(Object.keys(got).sort(), ['a', 'b'])
  for (const v of Object.values(got)) assert.equal(new Date(v.appliedAt).toISOString(), v.appliedAt)
  clearAppliedThreads(dir)
  assert.deepEqual(readAppliedThreads(dir), {})
  clearAppliedThreads(dir)
  fs.writeFileSync(path.join(dir, 'applied_threads.json'), 'not json')
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(readAppliedThreads(dir), {})
  } finally {
    console.warn = warn
  }
})

check('saveReviewRun keeps history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'))
  const p1 = saveReviewRun(dir, { n: 1 }, new Date('2026-10-22T10:00:00.000Z'))
  const before = fs.readFileSync(p1)
  saveReviewRun(dir, { n: 2 }, new Date('2026-10-22T10:05:00.000Z'))
  const files = fs.readdirSync(path.join(dir, 'review_runs'))
  assert.equal(files.length, 2)
  assert.equal(path.basename(p1), '2026-10-22T10-00-00-000Z.json')
  assert.ok(fs.readFileSync(p1).equals(before))
})

if (failed) {
  console.log(`${failed} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')

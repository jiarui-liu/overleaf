/**
 * test_roster_affiliations.mjs
 *
 * Unit tests for comparing title-page affiliations with AdminBot's roster.
 * No API calls: AdminBot is stubbed.
 *
 * Run inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_roster_affiliations.mjs
 */

import assert from 'node:assert/strict'
import {
  affiliationListed,
  compareRosterAffiliations,
  fetchAuthorAffiliations,
  normalizeAffiliation,
} from './AiTutorRosterAffiliations.mjs'

let passed = 0
async function test(name, fn)
{
  try
  {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (err)
  {
    console.error(`  FAIL ${name}\n${err.stack}`)
    process.exitCode = 1
  }
}

const FRONT = String.raw`\author{Ada Lovelace\textsuperscript{1} \quad Alan Turing\textsuperscript{2} \\
\textsuperscript{1}University of Toronto \quad \textsuperscript{2}Max Planck Institute for Intelligent Systems, T\"ubingen}`

console.log('affiliationListed')

await test('matches a record inside a longer listed affiliation, and across separate entries', () =>
{
  assert.ok(affiliationListed('University of Toronto', ['University of Toronto & Vector Institute']))
  assert.ok(affiliationListed('University of Toronto & Vector Institute', ['University of Toronto', 'Vector Institute']))
  assert.ok(!affiliationListed('University of Toronto', ['University of Waterloo']))
})

await test('folds LaTeX accents and the MPI abbreviation', () =>
{
  assert.equal(normalizeAffiliation(String.raw`MPI-IS, T\"{u}bingen`), 'max planck institute tubingen')
  assert.ok(affiliationListed('MPI for Intelligent Systems', ['Max Planck Institute for Intelligent Systems, Tübingen']))
})

console.log('compareRosterAffiliations')

const authors = [
  { name: 'Ada Lovelace', affiliations: ['University of Toronto'] },
  { name: 'Alan Turing', affiliations: ['Max Planck Institute for Intelligent Systems, Tübingen'] },
  { name: 'Grace Hopper', affiliations: ['Yale University'] },
]

await test('flags a missing Vector affiliation for a member with Vector compute', () =>
{
  const roster = [
    { author: 'Ada Lovelace', member: { name: 'Ada Lovelace', affiliation: 'University of Toronto', vector: true } },
    { author: 'Alan Turing', member: { name: 'Alan Turing', affiliation: 'MPI for Intelligent Systems', vector: false } },
    { author: 'Grace Hopper', member: null },
  ]
  const comments = compareRosterAffiliations(authors, roster, FRONT)
  assert.equal(comments.length, 1)
  assert.match(comments[0].highlightText, /^\\author\{Ada Lovelace/)
  assert.match(comments[0].comment, /"Vector Institute" \(they use Vector compute\)/)
  assert.equal(comments[0].category, 'front_matter')
})

await test('flags a recorded affiliation the paper leaves out, and ignores non-members', () =>
{
  const roster = [
    { author: 'Alan Turing', member: { name: 'Alan Turing', affiliation: 'ETH Zurich', vector: false } },
    { author: 'Grace Hopper', member: null },
  ]
  const comments = compareRosterAffiliations(authors, roster, FRONT)
  assert.equal(comments.length, 1)
  assert.match(comments[0].comment, /^Alan Turing is listed with "Max Planck.*also give "ETH Zurich"/)
})

await test('says nothing when every member is complete', () =>
{
  const roster = [
    { author: 'Ada Lovelace', member: { name: 'Ada Lovelace', affiliation: 'University of Toronto', vector: false } },
  ]
  assert.deepEqual(compareRosterAffiliations(authors, roster, FRONT), [])
})

console.log('fetchAuthorAffiliations')

await test('posts the names with the token and returns the answer', async () =>
{
  let seen
  const fetchImpl = async (url, init) =>
  {
    seen = { url, init }
    return { ok: true, json: async () => ({ authors: [{ author: 'Ada', member: null }] }) }
  }
  const answer = await fetchAuthorAffiliations(['Ada'], { url: 'https://admin.test/', token: 't', fetchImpl })
  assert.deepEqual(answer, [{ author: 'Ada', member: null }])
  assert.equal(seen.url, 'https://admin.test/papermentor/author-affiliations')
  assert.equal(seen.init.headers.Authorization, 'Bearer t')
  assert.deepEqual(JSON.parse(seen.init.body), { authors: ['Ada'] })
})

await test('returns nothing without a token, on an error status, or when AdminBot is down', async () =>
{
  const never = async () => { throw new Error('should not be called') }
  assert.deepEqual(await fetchAuthorAffiliations(['Ada'], { token: '', fetchImpl: never }), [])
  assert.deepEqual(await fetchAuthorAffiliations(['Ada'], { token: 't', fetchImpl: async () => ({ ok: false, status: 401 }) }), [])
  assert.deepEqual(await fetchAuthorAffiliations(['Ada'], { token: 't', fetchImpl: never }), [])
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)

/**
 * test_style_checks.mjs
 *
 * Unit tests for the rule-based emoji and affiliation order checks. No API calls.
 *
 * Run inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_style_checks.mjs
 */

import assert from 'node:assert/strict'
import { checkAffiliationOrder, checkEmoji } from './AiTutorStyleChecks.mjs'

let passed = 0
function test(name, fn)
{
  try
  {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (err)
  {
    console.error(`  FAIL ${name}\n${err.stack}`)
    process.exitCode = 1
  }
}

console.log('checkEmoji')

test('flags a body line with an emoji', () =>
{
  const tex = '\\begin{document}\nPlain line.\n  Our method wins 🚀 on every benchmark.\n\\end{document}\n'
  const comments = checkEmoji(tex)
  assert.equal(comments.length, 1)
  assert.equal(comments[0].highlightText, 'Our method wins 🚀 on every benchmark.')
  assert.match(comments[0].comment, /🚀/)
})

test('ignores emoji in comments, the preamble, and typographic symbols', () =>
{
  const tex = '\\newcommand{\\rocket}{🚀}\n\\begin{document}\n% TODO 🔥 fix\nCopyright © 2026 and Foo™.\n\\end{document}\n'
  assert.equal(checkEmoji(tex).length, 0)
})

test('caps the number of comments', () =>
{
  const tex = '\\begin{document}\n' + 'A ✅ line.\n'.repeat(12) + '\\end{document}\n'
  assert.equal(checkEmoji(tex).length, 5)
})

console.log('checkAffiliationOrder')

test('accepts affiliations numbered in order of appearance', () =>
{
  const fm = '\\author{Alice$^{1,2}$ \\quad Bob$^{2}$ \\quad Carol$^{3}$\\\\\n$^1$ETH \\quad $^2$MPI \\quad $^3$Toronto}'
  assert.equal(checkAffiliationOrder(fm), null)
})

test('flags a skipped number', () =>
{
  const fm = '\\author{\nAlice\\textsuperscript{1} Bob\\textsuperscript{3} Carol\\textsuperscript{2}\n}'
  const comment = checkAffiliationOrder(fm)
  assert.ok(comment)
  assert.equal(comment.highlightText, 'Alice\\textsuperscript{1} Bob\\textsuperscript{3} Carol\\textsuperscript{2}')
  assert.match(comment.comment, /affiliation 3 appears where 2 is expected/)
  assert.match(comment.comment, /1, 3, 2/)
})

test('ignores symbol marks and a single affiliation', () =>
{
  assert.equal(checkAffiliationOrder('\\author{Alice$^{1,*}$ Bob$^{1,\\dagger}$}'), null)
  assert.equal(checkAffiliationOrder('(not found)'), null)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)

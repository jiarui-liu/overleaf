/**
 * test_section_structure.mjs
 *
 * Unit tests for the rule-based Section Structure Check: experimental setup
 * belongs in its own section before the results. No API calls.
 *
 * Run inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_section_structure.mjs
 */

import assert from 'node:assert/strict'
import { parseSections } from './AiTutorReviewOrchestrator.mjs'
import { buildParagraphMap } from './AiTutorSentencePlacement.mjs'
import { checkExperimentStructure, sectionRole } from './AiTutorSectionStructure.mjs'

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

const PROSE = 'This paragraph has enough words in it to count as running prose for the checks.'

/** Build a paper from [command, title] pairs, each followed by one paragraph. */
function paper(headers, { appendixFrom = Infinity } = {})
{
  const body = headers
    .map(([cmd, title], i) =>
      `${i === appendixFrom ? '\\appendix\n' : ''}\\${cmd}{${title}}\n${PROSE}\n`
    )
    .join('\n')
  return `\\begin{document}\n${body}\\end{document}\n`
}

function check(tex)
{
  return checkExperimentStructure(buildParagraphMap(parseSections(tex), tex), tex)
}

console.log('sectionRole')

test('recognises setup titles', () =>
{
  for (const t of ['Experimental Setup', 'Setup', 'Experimental Settings', 'Implementation Details', 'Evaluation Metrics', 'Evaluation Protocol', 'Datasets and Baselines', 'Training Details'])
  {
    assert.equal(sectionRole(t), 'setup', t)
  }
})

test('recognises results titles', () =>
{
  for (const t of ['Experiments', 'Results', 'Main Results', 'Evaluation', 'Analysis', 'Ablation Study', 'RQ1: Does scale help?', '\\textbf{Results}'])
  {
    assert.equal(sectionRole(t), 'results', t)
  }
})

test('ignores method, theory and other sections', () =>
{
  for (const t of ['Introduction', 'Related Work', 'Method', 'Problem Setup', 'Task Setting', 'Theoretical Analysis', 'Conclusion'])
  {
    assert.equal(sectionRole(t), null, t)
  }
})

console.log('checkExperimentStructure')

test('flags a paper with results but no setup section, on the results heading', () =>
{
  const tex = paper([['section', 'Introduction'], ['section', 'Method'], ['section', 'Experiments'], ['subsection', 'Main Results']])
  const { comments } = check(tex)
  assert.equal(comments.length, 1)
  assert.equal(comments[0].highlightText, '\\section{Experiments}')
  assert.ok(tex.includes(comments[0].highlightText))
  assert.match(comments[0].comment, /^There is no Experimental Setup section/)
  assert.match(comments[0].comment, /open "Experiments" directly with a summary of the key findings/)
  assert.equal(comments[0].severity, 'warning')
  assert.equal(comments[0].agentName, 'Section Structure Check')
})

test('accepts a setup subsection before the results', () =>
{
  const tex = paper([['section', 'Method'], ['section', 'Experiments'], ['subsection', 'Experimental Setup'], ['subsection', 'Main Results']])
  assert.equal(check(tex).comments.length, 0)
})

test('flags setup placed after the results inside one Experiments section', () =>
{
  const tex = paper([['section', 'Experiments'], ['subsection', 'Main Results'], ['subsection', 'Setup']])
  const { comments } = check(tex)
  assert.equal(comments.length, 1)
  assert.equal(comments[0].highlightText, '\\subsection{Setup}')
})

test('accepts a separate setup section before the results section', () =>
{
  const tex = paper([['section', 'Method'], ['section', 'Experimental Setup'], ['section', 'Results']])
  assert.equal(check(tex).comments.length, 0)
})

test('flags a setup section placed after the results', () =>
{
  const tex = paper([['section', 'Method'], ['section', 'Results'], ['section', 'Implementation Details']])
  const { comments } = check(tex)
  assert.equal(comments.length, 1)
  assert.equal(comments[0].highlightText, '\\section{Implementation Details}')
  assert.match(comments[0].comment, /comes after the results in "Results"/)
})

test('setup only in the appendix still counts as missing', () =>
{
  const tex = paper([['section', 'Method'], ['section', 'Results'], ['section', 'Experimental Details']], { appendixFrom: 2 })
  const { comments } = check(tex)
  assert.equal(comments.length, 1)
  assert.match(comments[0].comment, /^There is no Experimental Setup section/)
})

test('says nothing about a paper without experiments', () =>
{
  const tex = paper([['section', 'Introduction'], ['section', 'Problem Setup'], ['section', 'Discussion'], ['section', 'Conclusion']])
  assert.equal(check(tex).comments.length, 0)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)

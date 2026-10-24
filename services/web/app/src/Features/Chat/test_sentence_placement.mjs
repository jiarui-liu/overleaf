/**
 * test_sentence_placement.mjs
 *
 * Unit tests for the Sentence Placement Reviewer's deterministic parts:
 * paragraph map, move validation, comment rendering, schema, and prototype
 * selection. No API calls.
 *
 * Run inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_sentence_placement.mjs
 */

import assert from 'node:assert/strict'
import {
  parseSections,
  fuzzyFindInText,
  repairJsonEscapedLatex,
} from './AiTutorReviewOrchestrator.mjs'
import {
  BUNDLED_PROTOTYPES,
  NEW_SETUP_TARGET,
  buildParagraphMap,
  buildPlacementSchema,
  locateOffset,
  renderParagraphMap,
  renderPlacementComment,
  selectPrototypes,
  validateMoves,
} from './AiTutorSentencePlacement.mjs'

const TEX = String.raw`\documentclass{article}
\begin{document}
\begin{abstract}
We study how large language models place sentences in scientific papers and propose a tool.
\end{abstract}

\section{Introduction}
Scientific writing is hard, and misplaced sentences make papers harder to follow for readers.

Our method improves placement accuracy by 12 points over the strongest baseline on every benchmark.
% TODO: tighten this paragraph
Prior tools only check grammar and never look at where a sentence sits in the paper.

\begin{figure}[t]
\centering
\includegraphics{fig1.pdf}

\caption{Overview of the pipeline and the components that we describe below.}
\end{figure}

We make three contributions to the study of scientific writing assistance in this paper.

\section{Method}
We represent each paragraph by its rhetorical role and compare it against prototype papers.

\section{Results}
\subsection{Main Results}
Table 1 reports accuracy for all systems across the three benchmarks we consider here. We fine-tune every model with a learning rate of 1e-5 on four A100 GPUs.

Our approach is the most accurate system on all three benchmarks by a wide margin overall.

\appendix
\section{Details}
Hyperparameters for all experiments are listed here for completeness and reproducibility.
\end{document}
`

const PROTOTYPE = {
  name: 'A Prototype Paper',
  // PDF-extracted text: hard line breaks and a hyphenated word.
  text:
    '1 Introduction\nLanguage models are widely used.\n\n5 Results\nWe find that our ap-\nproach outperforms all baselines by a large\nmargin on every task we evaluate.',
}

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

const sections = parseSections(TEX)
const map = buildParagraphMap(sections, TEX)
const bySection = Object.fromEntries(map.map(s => [s.label, s]))
const deps = { fuzzyFindInText, repairJsonEscapedLatex }

console.log('buildParagraphMap')

test('labels sections, prefixes subsections with their parent', () =>
{
  assert.deepEqual(
    map.map(s => s.label),
    ['Abstract', 'Introduction', 'Method', 'Results', 'Results > Main Results', 'Details']
  )
  assert.equal(bySection.Details.isAppendix, true)
})

test('splits paragraphs, skipping figures, comments and header lines', () =>
{
  const intro = bySection.Introduction.paragraphs
  assert.equal(intro.length, 3)
  assert.match(intro[0].text, /^Scientific writing is hard/)
  // A comment-only line doesn't end a paragraph in LaTeX.
  assert.match(intro[1].text, /^Our method improves[^\n]*\nPrior tools only check grammar/)
  assert.doesNotMatch(intro[1].text, /TODO/)
  assert.match(intro[2].text, /^We make three contributions/)
  for (const p of intro) assert.doesNotMatch(p.text, /includegraphics|caption/)
})

test('paragraph offsets point back into the merged TeX', () =>
{
  for (const sec of map)
  {
    for (const p of sec.paragraphs)
    {
      assert.equal(TEX.slice(p.start, p.start + 20), p.text.slice(0, 20))
    }
  }
})

test('a section with only subsections has no paragraphs of its own', () =>
{
  assert.equal(bySection.Results.paragraphs.length, 0)
  assert.equal(bySection['Results > Main Results'].paragraphs.length, 2)
  assert.match(renderParagraphMap(map), /\[Results\]\n\(no paragraphs of its own/)
})

test('locateOffset finds section and paragraph', () =>
{
  const pos = TEX.indexOf('Our method improves')
  assert.deepEqual(locateOffset(map, pos), { label: 'Introduction', paragraphIndex: 2 })
  assert.equal(locateOffset(map, TEX.indexOf('includegraphics')), null)
})

console.log('validateMoves')

const goodMove = {
  sentence: 'Our method improves placement accuracy by 12 points over the strongest baseline on every benchmark.',
  sentenceRole: 'headline quantitative finding',
  targetSection: 'Results > Main Results',
  targetParagraph: 1,
  placement: 'start_of_paragraph',
  basis: 'prototype',
  sectionRule: 'none',
  prototypePaper: PROTOTYPE.name,
  prototypeLocation: 'Results, first paragraph',
  prototypeQuote: 'We find that our approach outperforms all baselines by a large margin on every task we evaluate.',
  rationale: 'Readers meet the number before the setup that explains it.',
  severity: 'warning',
}
const validate = moves =>
  validateMoves(moves, { mergedTex: TEX, paragraphMap: map, prototypes: [PROTOTYPE], ...deps })

test('keeps a grounded move and records where the sentence is now', () =>
{
  const { kept, dropped } = validate([goodMove])
  assert.equal(dropped.length, 0)
  assert.equal(kept.length, 1)
  assert.deepEqual(kept[0].from, { label: 'Introduction', paragraphIndex: 2 })
  assert.equal(kept[0].paragraphCount, 2)
})

test('drops a sentence that is not in the manuscript', () =>
{
  const { kept, dropped } = validate([{ ...goodMove, sentence: 'This sentence was never written by the authors of this paper at all.' }])
  assert.equal(kept.length, 0)
  assert.equal(dropped[0].reason, 'sentence not found in manuscript')
})

test('drops a target paragraph that does not exist', () =>
{
  const { dropped } = validate([{ ...goodMove, targetParagraph: 9 }, { ...goodMove, targetParagraph: 1.5 }])
  assert.match(dropped[0].reason, /does not exist/)
  assert.match(dropped[1].reason, /does not exist/)
})

test('drops a move that stays in the same paragraph', () =>
{
  const { dropped } = validate([{ ...goodMove, targetSection: 'Introduction', targetParagraph: 2 }])
  assert.equal(dropped[0].reason, 'move stays in the same paragraph')
})

test('allows splitting a sentence into its own new paragraph in place', () =>
{
  const { kept } = validate([{ ...goodMove, targetSection: 'Introduction', targetParagraph: 2, placement: 'new_paragraph_before' }])
  assert.equal(kept.length, 1)
})

test('drops a move whose prototype quote is invented', () =>
{
  const { dropped } = validate([{ ...goodMove, prototypeQuote: 'Transformers are all you need for sequence transduction tasks.' }])
  assert.equal(dropped[0].reason, 'prototype quote not found in prototype text')
})

test('drops the second move for the same sentence', () =>
{
  const { kept, dropped } = validate([goodMove, { ...goodMove, targetSection: 'Method' }])
  assert.equal(kept.length, 1)
  assert.equal(dropped[0].reason, 'duplicate sentence')
})

const setupMove = {
  sentence: 'We fine-tune every model with a learning rate of 1e-5 on four A100 GPUs.',
  sentenceRole: 'training hyperparameters',
  targetSection: 'Method',
  targetParagraph: 1,
  placement: 'end_of_paragraph',
  basis: 'section_rule',
  sectionRule: 'setup_in_setup_section',
  prototypePaper: 'none',
  prototypeLocation: '',
  prototypeQuote: '',
  rationale: 'Hyperparameters interrupt the results.',
  severity: 'warning',
}

test('keeps a rule-based move without a prototype', () =>
{
  const { kept } = validate([setupMove])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].hasPrototype, false)
  assert.deepEqual(kept[0].from, { label: 'Results > Main Results', paragraphIndex: 1 })
})

test('a rule-based move keeps its prototype citation only if the quote checks out', () =>
{
  const cited = { ...setupMove, prototypePaper: PROTOTYPE.name, prototypeLocation: 'Results', prototypeQuote: goodMove.prototypeQuote }
  assert.equal(validate([cited]).kept[0].hasPrototype, true)
  const invented = { ...cited, prototypeQuote: 'Transformers are all you need for sequence transduction tasks.' }
  assert.equal(validate([invented]).kept[0].hasPrototype, false)
})

test('drops a rule-based move that names no rule', () =>
{
  const { dropped } = validate([{ ...setupMove, sectionRule: 'none' }])
  assert.equal(dropped[0].reason, 'unknown section rule')
})

test('a move to the new setup section is kept only when the paper lacks one', () =>
{
  const toNew = { ...setupMove, targetSection: NEW_SETUP_TARGET, targetParagraph: 0 }
  const withNew = validateMoves([toNew], {
    mergedTex: TEX, paragraphMap: map, prototypes: [PROTOTYPE], ...deps, newSetupBefore: 'Results > Main Results',
  })
  assert.equal(withNew.kept.length, 1)
  assert.equal(withNew.kept[0].newSectionBefore, 'Results > Main Results')
  assert.equal(validate([toNew]).dropped[0].reason, 'paper already has a setup section')
})

console.log('rendering + schema')

test('renders the target paragraph and prototype evidence', () =>
{
  const text = renderPlacementComment({ ...goodMove, hasPrototype: true }, 2)
  assert.match(text, /^Move to the start of the first paragraph of "Results > Main Results"\./)
  assert.match(text, /Prototype: "A Prototype Paper" puts this kind of sentence \(headline quantitative finding\) in Results, first paragraph: "We find/)
  assert.match(renderPlacementComment({ ...goodMove, targetParagraph: 2, placement: 'new_paragraph_after' }, 2), /a new paragraph after the last paragraph of/)
})

test('renders the section rule, and the new setup section target', () =>
{
  const text = renderPlacementComment({ ...setupMove, newSectionBefore: 'Results > Main Results' }, 0)
  assert.match(text, /^Move to a new "Experimental Setup" section placed before "Results > Main Results"\. Hyperparameters interrupt the results\. Rule: Experimental setup \(datasets/)
  assert.doesNotMatch(text, /Prototype:/)
})

test('schema only accepts sections and prototypes from this run', () =>
{
  const labels = map.filter(s => s.paragraphs.length > 0).map(s => s.label)
  const schema = buildPlacementSchema(labels, [PROTOTYPE.name])
  assert.equal(schema.safeParse({ moves: [goodMove] }).success, true)
  assert.equal(schema.safeParse({ moves: [{ ...goodMove, targetSection: 'Results' }] }).success, false)
  assert.equal(schema.safeParse({ moves: [{ ...goodMove, prototypePaper: 'Other' }] }).success, false)
  assert.equal(schema.safeParse({ moves: [setupMove] }).success, true)
  assert.equal(schema.safeParse({ moves: [{ ...setupMove, targetSection: NEW_SETUP_TARGET }] }).success, false)
  const withNew = buildPlacementSchema([...labels, NEW_SETUP_TARGET], [PROTOTYPE.name])
  assert.equal(withNew.safeParse({ moves: [{ ...setupMove, targetSection: NEW_SETUP_TARGET }] }).success, true)
})

console.log('selectPrototypes')

test('uses uploads first and makes duplicate names unique', () =>
{
  const { source, papers } = selectPrototypes([{ name: 'a.pdf', text: 'x' }, { name: 'a.pdf', text: 'y' }], 'dataset')
  assert.equal(source, 'uploaded')
  assert.deepEqual(papers.map(p => p.name), ['a.pdf', 'a.pdf (2)'])
})

test('every paper type has a readable bundled prototype', () =>
{
  for (const type of Object.keys(BUNDLED_PROTOTYPES))
  {
    const { source, papers } = selectPrototypes([], type)
    assert.equal(source, 'bundled')
    assert.ok(papers.length > 0 && papers[0].text.length > 10_000, type)
  }
  assert.equal(selectPrototypes([], 'unknown_type').papers[0].name, BUNDLED_PROTOTYPES.other[0].name)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)

/**
 * AiTutorSentencePlacement.mjs
 *
 * Sentence Placement Reviewer: suggests moving individual sentences to the
 * section and paragraph slot where a prototype paper puts a sentence with the
 * same rhetorical role ("this sentence in Introduction ¶2 should open Results,
 * as in <prototype>").
 *
 * Prototypes are the role model papers the user uploaded. Without uploads, the
 * bundled example paper for the classified paper type is used. A move can also
 * rest on one of the fixed SECTION_RULES (e.g. setup details belong in the
 * Experimental Setup section), which apply whatever the prototype does.
 *
 * Runs as one of the Phase 3 agents and returns the same result shape as
 * runSubagent(), so dedup, pruning and position mapping apply unchanged.
 * Orchestrator helpers are passed in as `deps` to avoid a circular import.
 */

import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeExperimentLayout, SETUP_SECTION_NAME } from './AiTutorSectionStructure.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROTOTYPE_DIR = path.join(__dirname, 'ai-tutor-skills', 'prototype_papers')

export const AGENT_ID = 'sentence_placement'
export const AGENT_NAME = 'Sentence Placement Reviewer'
const SKILL_FILE = '04_paper_sections/sentence_placement.md'

const MAX_MOVES = 8
// Prototype quotes come from PDF text (hyphenation, ligatures, line breaks),
// so they are matched more loosely than highlights in the user's LaTeX.
const PROTOTYPE_QUOTE_THRESHOLD = 0.8
// Paragraphs shorter than this after masking (e.g. a lone \label) are not prose.
const MIN_PARAGRAPH_CHARS = 40

// Bundled prototypes per paper type (text pre-extracted from example_papers/).
export const BUNDLED_PROTOTYPES = {
  dataset: [
    { file: '2312.04350_data_construction.txt', name: 'CLadder: Assessing Causal Reasoning in Language Models' },
  ],
  method_improvement: [
    { file: '2502.12110_method_improvement.txt', name: 'A-Mem: Agentic Memory for LLM Agents' },
  ],
  llm_engineering: [
    { file: '2308.16137_lm_infinite.txt', name: 'LM-Infinite: Zero-Shot Extreme Length Generalization for Large Language Models' },
  ],
  llm_inference_findings: [
    { file: '2402.11655_llm_inference_findings.txt', name: 'Competition of Mechanisms: Tracing How Language Models Handle Facts and Counterfactuals' },
  ],
  css: [
    { file: 'N19-1166_css_paper.txt', name: "Something's Brewing! Early Prediction of Controversy-causing Posts from Discussion Features" },
  ],
  position: [
    { file: '2212.01681_position_paper_andreas.txt', name: 'Language Models as Agent Models' },
  ],
  other: [
    { file: '2310.13544_clearly_structured.txt', name: 'A Diachronic Perspective on User Trust in AI under Uncertainty' },
  ],
}

// Section rules enforced regardless of the prototypes. A move based on a rule
// needs no prototype excerpt.
export const SECTION_RULES = {
  setup_in_setup_section:
    `Experimental setup (datasets, models, baselines, metrics, hyperparameters, prompts, ` +
    `implementation and compute details) belongs in the ${SETUP_SECTION_NAME} section, ` +
    'not in the Experiments / Results section.',
  results_open_with_findings:
    'The Experiments / Results section opens directly with a summary of the key findings, ' +
    'followed by the results; no setup or method recap comes before them.',
}
const NO_RULE = 'none'
const NO_PROTOTYPE = 'none'

// Target label offered when the paper has results but no setup section, so
// setup sentences have somewhere to go.
export const NEW_SETUP_TARGET = `NEW SECTION: ${SETUP_SECTION_NAME}`

const bundledTextCache = new Map()

function readBundledPrototype(file)
{
  if (!bundledTextCache.has(file))
  {
    bundledTextCache.set(file, fs.readFileSync(path.join(PROTOTYPE_DIR, file), 'utf-8'))
  }
  return bundledTextCache.get(file)
}

/**
 * Pick the prototype papers: the user's uploads if any, otherwise the bundled
 * prototype for this paper type (falling back to the generic one).
 * Returns { source: 'uploaded' | 'bundled', papers: [{ name, text }] }.
 */
export function selectPrototypes(roleModelTexts, paperType)
{
  if (roleModelTexts && roleModelTexts.length > 0)
  {
    // Names become schema enum values and lookup keys, so they must be unique.
    const seen = new Map()
    const papers = roleModelTexts.map(rm =>
    {
      const n = (seen.get(rm.name) || 0) + 1
      seen.set(rm.name, n)
      return { name: n > 1 ? `${rm.name} (${n})` : rm.name, text: rm.text }
    })
    return { source: 'uploaded', papers }
  }
  const entries = BUNDLED_PROTOTYPES[paperType] || BUNDLED_PROTOTYPES.other
  const papers = []
  for (const entry of entries)
  {
    try
    {
      papers.push({ name: entry.name, text: readBundledPrototype(entry.file) })
    } catch (err)
    {
      console.warn(`[AI Tutor] [${AGENT_NAME}] WARN: bundled prototype ${entry.file} unreadable (${err.message})`)
    }
  }
  return { source: 'bundled', papers }
}

// ---------------------------------------------------------------------------
// Paragraph map of the user's paper
// ---------------------------------------------------------------------------

// Environments that are not running prose; they act as paragraph separators.
const COMMENT_FILL = '\u0001'
const NON_PROSE_ENV_RE =
  /\\begin\{(figure|table|equation|align|gather|multline|eqnarray|algorithm|algorithmic|tabular|tabularx|lstlisting|verbatim|minted|tikzpicture|wrapfigure|wraptable)(\*?)\}[\s\S]*?\\end\{\1\2\}/g

/**
 * Replace everything that isn't prose with same-length filler so offsets are
 * preserved: non-prose environments and header lines become newlines (so they
 * split paragraphs). % comments become COMMENT_FILL rather than spaces, because
 * a comment-only line is not a paragraph break in LaTeX and must not look blank.
 */
function maskNonProse(text)
{
  const blank = s => s.replace(/[^\n]/g, '\n')
  return text
    .replace(NON_PROSE_ENV_RE, blank)
    .replace(/^[ \t]*\\(?:sub)*section\*?\{[^\n]*$/gm, blank)
    .replace(/^[ \t]*\\(?:begin|end)\{abstract\}[^\n]*$/gm, blank)
    .replace(/^[ \t]*\\(?:appendix|label\{[^}]*\})[ \t]*$/gm, blank)
    .replace(/(^|[^\\])%[^\n]*/g, (m, pre) => pre + COMMENT_FILL.repeat(m.length - pre.length))
}

/**
 * Split the paper into sections and numbered paragraphs.
 *
 * Uses sections at levels 0-2; \subsubsection content stays inside its parent
 * \subsection, as in parseSections(). Subsections are labelled
 * "Parent > Child" so the model can tell "Results > RQ1" from "Methods > RQ1".
 *
 * Returns [{ label, title, level, isAppendix, start, end, paragraphs: [{ index, start, end, text }] }]
 * with offsets into mergedTex. Sections with no prose of their own (a
 * \section that only introduces subsections) keep an empty paragraphs list.
 */
export function buildParagraphMap(sections, mergedTex)
{
  const units = sections.filter(s => s.level <= 2)
  const seen = new Map()
  let parentTitle = null
  const map = []

  for (const s of units)
  {
    if (s.level <= 1) parentTitle = s.title
    let label = s.level === 2 && parentTitle ? `${parentTitle} > ${s.title}` : s.title
    const n = (seen.get(label) || 0) + 1
    seen.set(label, n)
    if (n > 1) label = `${label} (${n})`

    const raw = mergedTex.slice(s.charStart, s.charEnd)
    const masked = maskNonProse(raw)
    const paragraphs = []
    const sepRe = /\n(?:[ \t]*\n)+/g
    let paraStart = 0
    const pushParagraph = (from, to) =>
    {
      const slice = masked.slice(from, to).replaceAll(COMMENT_FILL, ' ')
      const trimmed = slice.trim()
      if (trimmed.length < MIN_PARAGRAPH_CHARS) return
      const lead = slice.length - slice.trimStart().length
      const start = s.charStart + from + lead
      paragraphs.push({
        index: paragraphs.length + 1,
        start,
        end: start + trimmed.length,
        // Drop the whitespace-only lines left by removed comments so the
        // model doesn't read them as paragraph breaks.
        text: trimmed.replace(/\n[ \t]*(?=\n)/g, ''),
      })
    }
    let m
    while ((m = sepRe.exec(masked)) !== null)
    {
      pushParagraph(paraStart, m.index)
      paraStart = m.index + m[0].length
    }
    pushParagraph(paraStart, masked.length)

    map.push({
      label,
      title: s.title,
      level: s.level,
      isAppendix: !!s.isAppendix,
      start: s.charStart,
      end: s.charEnd,
      paragraphs,
    })
  }
  return map
}

/**
 * Find which section/paragraph of the map contains a mergedTex offset.
 * Returns { label, paragraphIndex } or null when the offset isn't in prose.
 */
export function locateOffset(paragraphMap, offset)
{
  for (const sec of paragraphMap)
  {
    for (const p of sec.paragraphs)
    {
      if (offset >= p.start && offset < p.end)
      {
        return { label: sec.label, paragraphIndex: p.index }
      }
    }
  }
  return null
}

export function renderParagraphMap(paragraphMap)
{
  return paragraphMap
    .map(sec =>
    {
      const header = `### [${sec.label}]${sec.isAppendix ? ' (appendix)' : ''}`
      if (sec.paragraphs.length === 0)
      {
        return `${header}\n(no paragraphs of its own; see its subsections)`
      }
      const body = sec.paragraphs
        .map(p => `[${sec.label} ¶${p.index}]\n${p.text}`)
        .join('\n\n')
      return `${header}\n${body}`
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Schema + rendering
// ---------------------------------------------------------------------------

const PLACEMENTS = [
  'start_of_paragraph',
  'end_of_paragraph',
  'new_paragraph_before',
  'new_paragraph_after',
]

/**
 * The target section and prototype are enums built from this run's paper, so
 * the model can only name sections that exist and prototypes it was given.
 */
export function buildPlacementSchema(targetLabels, prototypeNames)
{
  const ruleIds = [...Object.keys(SECTION_RULES), NO_RULE]
  return z.object({
    moves: z.array(
      z.object({
        sentence: z
          .string()
          .describe('One complete sentence copied VERBATIM from the manuscript, without the [Section ¶n] marker.'),
        sentenceRole: z
          .string()
          .describe('Rhetorical role of the sentence, e.g. "headline quantitative finding", "limitation of prior work".'),
        targetSection: z.enum(targetLabels).describe('Section of the manuscript the sentence should move to.'),
        // Plain number: .int() adds safe-integer bounds that strict structured
        // outputs may reject. validateMoves() checks it is a valid index.
        targetParagraph: z
          .number()
          .describe('1-based paragraph number within targetSection, as in the [Section ¶n] markers.'),
        placement: z.enum(PLACEMENTS).describe('Where relative to targetParagraph the sentence should go.'),
        basis: z
          .enum(['prototype', 'section_rule'])
          .describe('Whether the move rests on a prototype paper or on one of the section rules.'),
        sectionRule: z
          .enum(ruleIds)
          .describe(`The section rule the move enforces, or "${NO_RULE}" when basis is "prototype".`),
        prototypePaper: z
          .enum([...prototypeNames, NO_PROTOTYPE])
          .describe(`Prototype paper that places a sentence with this role there, or "${NO_PROTOTYPE}".`),
        prototypeLocation: z
          .string()
          .describe('Where the prototype places it, e.g. "Results, first paragraph". Empty if no prototype.'),
        prototypeQuote: z
          .string()
          .describe('A VERBATIM excerpt (under 200 chars) from the prototype showing a sentence with the same role at that location. Empty if no prototype.'),
        rationale: z
          .string()
          .describe('One or two sentences on why the move helps the reader.'),
        severity: z.enum(['suggestion', 'warning']),
      })
    ),
  })
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

function paragraphPhrase(index, count)
{
  if (index === count && count > 1) return 'the last paragraph'
  return index <= ORDINALS.length ? `the ${ORDINALS[index - 1]} paragraph` : `paragraph ${index}`
}

export function describeTarget(targetSection, targetParagraph, placement, paragraphCount)
{
  const para = `${paragraphPhrase(targetParagraph, paragraphCount)} of "${targetSection}"`
  switch (placement)
  {
    case 'start_of_paragraph': return `the start of ${para}`
    case 'end_of_paragraph': return `the end of ${para}`
    case 'new_paragraph_before': return `a new paragraph before ${para}`
    case 'new_paragraph_after': return `a new paragraph after ${para}`
    default: return para
  }
}

/**
 * `move.newSectionBefore` is set (by validateMoves) when the target is
 * NEW_SETUP_TARGET; it names the section the new one should precede.
 * `move.hasPrototype` says whether the prototype evidence checked out.
 */
export function renderPlacementComment(move, paragraphCount)
{
  const target = move.newSectionBefore
    ? `a new "${SETUP_SECTION_NAME}" section placed before "${move.newSectionBefore}"`
    : describeTarget(move.targetSection, move.targetParagraph, move.placement, paragraphCount)
  const parts = [`Move to ${target}.`, move.rationale.trim()]
  if (move.sectionRule && move.sectionRule !== NO_RULE)
  {
    parts.push(`Rule: ${SECTION_RULES[move.sectionRule]}`)
  }
  if (move.hasPrototype)
  {
    const quote = move.prototypeQuote.replace(/\s+/g, ' ').trim()
    parts.push(
      `Prototype: "${move.prototypePaper}" puts this kind of sentence (${move.sentenceRole.trim()}) in ` +
      `${move.prototypeLocation.trim()}: "${quote}"`
    )
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Keep only moves that are grounded and actionable:
 *   - the sentence is found in the manuscript (exact, backslash-repaired, or fuzzy)
 *     and sits in a prose paragraph
 *   - the target paragraph exists
 *   - the move actually changes where the sentence is
 *   - it rests on a real section rule, or on a prototype whose quote is found
 *     in that prototype's text (a rule-based move keeps a prototype citation
 *     only if its quote checks out)
 * `newSetupBefore` is the section label a NEW_SETUP_TARGET move goes before,
 * or null when the paper already has a setup section.
 * Returns { kept: [{ ...move, sentence, from, hasPrototype, newSectionBefore }], dropped: [{ move, reason }] }.
 */
export function validateMoves(moves, { mergedTex, paragraphMap, prototypes, fuzzyFindInText, repairJsonEscapedLatex, newSetupBefore = null })
{
  const byLabel = new Map(paragraphMap.map(s => [s.label, s]))
  const byPrototype = new Map(prototypes.map(p => [p.name, p.text]))
  const kept = []
  const dropped = []
  const seenSentences = new Set()

  for (const move of moves)
  {
    let sentence = move.sentence
    let pos = mergedTex.indexOf(sentence)
    if (pos === -1 && repairJsonEscapedLatex)
    {
      const repaired = repairJsonEscapedLatex(sentence)
      if (repaired !== sentence && (pos = mergedTex.indexOf(repaired)) !== -1) sentence = repaired
    }
    if (pos === -1)
    {
      const fuzzy = fuzzyFindInText(sentence, mergedTex)
      if (fuzzy)
      {
        sentence = fuzzy.matchedText
        pos = fuzzy.index
      }
    }
    if (pos === -1)
    {
      dropped.push({ move, reason: 'sentence not found in manuscript' })
      continue
    }
    if (seenSentences.has(pos))
    {
      dropped.push({ move, reason: 'duplicate sentence' })
      continue
    }

    const from = locateOffset(paragraphMap, pos)
    if (!from)
    {
      dropped.push({ move, reason: 'sentence is not in a prose paragraph' })
      continue
    }

    let newSectionBefore = null
    if (move.targetSection === NEW_SETUP_TARGET)
    {
      if (!newSetupBefore)
      {
        dropped.push({ move, reason: 'paper already has a setup section' })
        continue
      }
      newSectionBefore = newSetupBefore
    }
    const target = byLabel.get(move.targetSection)
    if (newSectionBefore)
    {
      // Paragraph and placement don't apply to a section that doesn't exist yet.
    } else if (
      !target ||
      !Number.isInteger(move.targetParagraph) ||
      move.targetParagraph < 1 ||
      move.targetParagraph > target.paragraphs.length
    )
    {
      dropped.push({ move, reason: `target paragraph ${move.targetSection} ¶${move.targetParagraph} does not exist` })
      continue
    }

    const sameParagraph = from.label === move.targetSection && from.paragraphIndex === move.targetParagraph
    if (sameParagraph && (move.placement === 'start_of_paragraph' || move.placement === 'end_of_paragraph'))
    {
      dropped.push({ move, reason: 'move stays in the same paragraph' })
      continue
    }

    const prototypeText = byPrototype.get(move.prototypePaper)
    const hasPrototype =
      !!prototypeText && !!fuzzyFindInText(move.prototypeQuote, prototypeText, PROTOTYPE_QUOTE_THRESHOLD)
    const hasRule = Object.hasOwn(SECTION_RULES, move.sectionRule)
    if (move.basis === 'section_rule' ? !hasRule : !hasPrototype)
    {
      dropped.push({
        move,
        reason: move.basis === 'section_rule' ? 'unknown section rule' : 'prototype quote not found in prototype text',
      })
      continue
    }

    seenSentences.add(pos)
    kept.push({
      ...move,
      sentence,
      from,
      hasPrototype,
      newSectionBefore,
      paragraphCount: target ? target.paragraphs.length : 0,
    })
  }
  return { kept, dropped }
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * Run the placement agent. `deps` carries orchestrator helpers:
 *   { generateObjectWithRetry, fuzzyFindInText, repairJsonEscapedLatex, loadSkill, strictMode }
 */
export async function runSentencePlacementAgent(
  { openai, model, sections, mergedTex, roleModelTexts, paperType },
  deps
)
{
  const prototypes = selectPrototypes(roleModelTexts, paperType)
  const meta = {
    placementPrototypes: {
      source: prototypes.source,
      papers: prototypes.papers.map(p => p.name),
    },
  }
  if (prototypes.papers.length === 0)
  {
    return { id: AGENT_ID, comments: [], skipped: true, reason: 'No prototype papers available', meta }
  }

  const paragraphMap = buildParagraphMap(sections, mergedTex)
  const targetLabels = paragraphMap.filter(s => s.paragraphs.length > 0).map(s => s.label)
  const layout = describeExperimentLayout(paragraphMap)
  const newSetupBefore =
    !layout.hasSetup && layout.firstResultsWithProse ? layout.firstResultsWithProse.label : null
  const paragraphCount = paragraphMap.reduce((n, s) => n + s.paragraphs.length, 0)
  if (targetLabels.length < 2)
  {
    return {
      id: AGENT_ID,
      comments: [],
      skipped: true,
      reason: 'Fewer than two sections with prose — nothing to move between',
      meta,
    }
  }
  console.log(
    `[AI Tutor] [${AGENT_NAME}] ${targetLabels.length} sections, ${paragraphCount} paragraphs; ` +
    `prototypes (${prototypes.source}): ${prototypes.papers.map(p => `"${p.name}"`).join(', ')}`
  )

  const schema = buildPlacementSchema(
    newSetupBefore ? [...targetLabels, NEW_SETUP_TARGET] : targetLabels,
    prototypes.papers.map(p => p.name)
  )
  const layoutFacts = [
    `- Experimental setup section(s): ${layout.hasSetup ? layout.setup.map(s => `"${s.label}"`).join(', ') : 'NONE'}`,
    `- Experiments / results section(s): ${layout.results.length ? layout.results.map(s => `"${s.label}"`).join(', ') : 'none detected'}`,
    newSetupBefore
      ? `- The paper has no setup section. To move setup sentences out of the results, use targetSection "${NEW_SETUP_TARGET}" (it will be placed before "${newSetupBefore}").`
      : null,
    layout.setupAfterResults ? '- The setup section currently comes AFTER the first results.' : null,
  ].filter(Boolean).join('\n')

  const prototypeBlock = prototypes.papers
    .map((p, i) => `### Prototype ${i + 1}: "${p.name}"\n${p.text}`)
    .join('\n\n')

  const severityRule = deps.strictMode
    ? 'Use only [warning] severity: report a move only when the misplaced sentence would confuse a reviewer.'
    : 'Use [warning] when the misplacement confuses the reader (e.g. a result stated before its method is introduced); otherwise [suggestion].'

  const system = `You are the "${AGENT_NAME}" for an academic paper writing tutor.

Your job: find sentences in the user's manuscript that sit in the wrong section or paragraph slot, and say exactly where each should move, grounded in how the prototype paper(s) below place a sentence with the same rhetorical role.

For each suggested move:
1. Copy the sentence VERBATIM from the manuscript (one complete sentence; never include the [Section ¶n] markers).
2. Name its rhetorical role.
3. Pick the target: a section of the manuscript (targetSection) and a paragraph number within it (targetParagraph, as shown in the [Section ¶n] markers), plus where relative to that paragraph it should go.
4. Give the basis:
   - basis "section_rule": the move enforces one of the SECTION RULES below; name it in sectionRule.
   - basis "prototype": cite which prototype, where it places a sentence with the same role (section + which paragraph), and a VERBATIM excerpt under 200 characters from the prototype text. The excerpt is checked against the prototype text; a prototype-based move with an invented excerpt is discarded.
   A rule-based move may also cite a prototype that does the same; set prototypePaper to "${NO_PROTOTYPE}" and leave the location and excerpt empty otherwise.
5. Explain in one or two sentences why the move helps the reader.

SECTION RULES (mandatory, apply whatever the prototypes do):
${Object.entries(SECTION_RULES).map(([id, text]) => `- ${id}: ${text}`).join('\n')}
Check every paragraph of the Experiments / Results sections against these rules first. A description of which dataset, model, baseline, metric or hyperparameter is used is setup and must move to the setup section. The only setup allowed in a results paragraph is a clause saying what a figure or table reports. The first paragraph of the results should be the summary of findings: if a findings summary sits later, move it to the start.

Experiments layout of this manuscript (detected from section titles):
${layoutFacts}

Rules:
- Compare STRUCTURE, not content. The prototypes are on different topics; never suggest adding their content.
- Only suggest a move when the sentence clearly belongs to a different slot and the prototype supports it. Most sentences are fine where they are. Return fewer moves, or none, rather than weak ones.
- Suggest at most ${MAX_MOVES} moves. Section-rule violations come first. Prefer moves across sections; within-section moves only when the paragraph slot clearly matters (e.g. the headline finding should open the Results).
- Do not move section headers, captions, equations, or citations-only fragments.
- ${severityRule}

## Placement reference
${deps.loadSkill(SKILL_FILE)}

## Prototype papers
${prototypeBlock}`

  const prompt = `## Manuscript, section by section and paragraph by paragraph
Paragraph markers like [Introduction ¶2] are for reference only.

${renderParagraphMap(paragraphMap)}`

  const logSystem = system.replace(prototypeBlock, `[${prototypes.papers.length} prototype paper(s) — content omitted from log]`)

  const result = await deps.generateObjectWithRetry(
    {
      model: openai(model),
      schema,
      system,
      prompt,
      temperature: 0.3,
    },
    `Phase3-${AGENT_ID}`,
    { system: logSystem }
  )

  const rawMoves = result.object.moves.slice(0, MAX_MOVES)
  const { kept, dropped } = validateMoves(rawMoves, {
    mergedTex,
    paragraphMap,
    newSetupBefore,
    prototypes: prototypes.papers,
    fuzzyFindInText: deps.fuzzyFindInText,
    repairJsonEscapedLatex: deps.repairJsonEscapedLatex,
  })
  for (const d of dropped)
  {
    console.warn(
      `[AI Tutor] [${AGENT_NAME}] Dropped move (${d.reason}): "${d.move.sentence.slice(0, 80)}..."`
    )
  }
  const moves = deps.strictMode ? kept.filter(m => m.severity !== 'suggestion') : kept
  console.log(`[AI Tutor] [${AGENT_NAME}] ${moves.length}/${result.object.moves.length} move(s) kept`)

  return {
    id: AGENT_ID,
    comments: moves.map(m => ({
      highlightText: m.sentence,
      comment: renderPlacementComment(m, m.paragraphCount),
      severity: m.severity,
      category: AGENT_ID,
      agentName: AGENT_NAME,
      placement: {
        from: { section: m.from.label, paragraph: m.from.paragraphIndex },
        to: m.newSectionBefore
          ? { section: NEW_SETUP_TARGET, before: m.newSectionBefore }
          : { section: m.targetSection, paragraph: m.targetParagraph, placement: m.placement },
        rule: m.sectionRule !== NO_RULE ? m.sectionRule : undefined,
        prototype: m.hasPrototype
          ? { name: m.prototypePaper, location: m.prototypeLocation, quote: m.prototypeQuote }
          : undefined,
      },
    })),
    skipped: false,
    meta,
  }
}

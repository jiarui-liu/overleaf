/**
 * AiTutorReviewOrchestrator.mjs
 *
 * Multi-agent paper review system. Orchestrates:
 *   Phase 0 — Regex-based section parsing of merged.tex
 *   Phase 1 — LLM-based paper type classification + section-to-category mapping
 *   Phase 2 — Parallel reviewer subagents (one per review aspect)
 *   Phase 3 — Comment deduplication and position mapping back to original docs
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.join(__dirname, 'ai-tutor-skills')

// Set AI_TUTOR_LOG_PROMPTS=true in .env to log full LLM prompts and responses
const LOG_PROMPTS = process.env.AI_TUTOR_LOG_PROMPTS === 'true'

// Fuzzy matching threshold (0.0–1.0). Higher = stricter. Default 0.85.
// Set AI_TUTOR_FUZZY_THRESHOLD in .env to override.
const FUZZY_THRESHOLD_ENV = parseFloat(process.env.AI_TUTOR_FUZZY_THRESHOLD)
const FUZZY_THRESHOLD_DEFAULT = 0.85

// ---------------------------------------------------------------------------
// Skill loader
// ---------------------------------------------------------------------------

function loadSkill(relativePath)
{
  const fullPath = path.join(SKILLS_DIR, relativePath)
  try
  {
    const content = fs.readFileSync(fullPath, 'utf-8')
    console.log(`[AI Tutor] Loaded skill: ${relativePath} (${content.length} chars)`)
    return content
  } catch (err)
  {
    console.warn(`[AI Tutor] WARN: Skill file not found: ${relativePath} (${err.message})`)
    return `[skill file not found: ${relativePath}]`
  }
}



// ---------------------------------------------------------------------------
// Phase 0 — Section parsing (pure regex, no LLM)
// ---------------------------------------------------------------------------

/**
 * Parse the merged TeX into a structured list of sections.
 * Each section has { title, level, content, charStart, charEnd }.
 * Level 0 = abstract, 1 = \section, 2 = \subsection, 3 = \subsubsection.
 * Sections marked with \section*{} are treated the same.
 */
export function parseSections(mergedTex)
{
  const sections = []

  // 1. Abstract
  const absRe = /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/
  const absMatch = absRe.exec(mergedTex)
  if (absMatch)
  {
    sections.push({
      title: 'Abstract',
      level: 0,
      content: absMatch[1].trim(),
      charStart: absMatch.index,
      charEnd: absMatch.index + absMatch[0].length,
    })
  }

  // 2. Collect all \section / \subsection / \subsubsection headers
  const hdrRe = /^\\(section|subsection|subsubsection)\*?\{([^}]+)\}/gm
  const headers = []
  let m
  while ((m = hdrRe.exec(mergedTex)) !== null)
  {
    const level =
      m[1] === 'section' ? 1 : m[1] === 'subsection' ? 2 : 3
    headers.push({ title: m[2].trim(), level, pos: m.index })
  }

  // 3. Turn headers into sections (content runs until next same-or-higher-level header)
  for (let i = 0; i < headers.length; i++)
  {
    let endPos
    // Find the next header at same or higher (lower number) level
    for (let j = i + 1; j < headers.length; j++)
    {
      if (headers[j].level <= headers[i].level)
      {
        endPos = headers[j].pos
        break
      }
    }
    if (endPos === undefined) endPos = mergedTex.length

    sections.push({
      title: headers[i].title,
      level: headers[i].level,
      content: mergedTex.slice(headers[i].pos, endPos),
      charStart: headers[i].pos,
      charEnd: endPos,
    })
  }

  return sections
}

// ---------------------------------------------------------------------------
// Helpers — JSON-escaped LaTeX repair
// ---------------------------------------------------------------------------

/**
 * Repair highlightText that was mangled by JSON escape sequences.
 *
 * When the LLM outputs LaTeX like \begin{table} in a JSON string without
 * double-escaping, the JSON parser interprets \b as backspace (0x08),
 * \t as tab (0x09), \f as form feed (0x0C), \r as CR (0x0D).
 * This reverses that transformation so we can match against real LaTeX source.
 */
function repairJsonEscapedLatex(text)
{
  return text
    .replace(/\x08/g, '\\b')   // backspace → \b  (e.g. \begin, \bar, \bfseries)
    .replace(/\x0C/g, '\\f')   // form feed → \f  (e.g. \frac, \figure, \footnote)
    .replace(/\t/g, '\\t')     // tab       → \t  (e.g. \textit, \textbf, \table)
    .replace(/\r/g, '\\r')     // CR        → \r  (e.g. \ref, \renewcommand)
}

// ---------------------------------------------------------------------------
// Fuzzy matching utilities
// ---------------------------------------------------------------------------

const FUZZY_THRESHOLD = Number.isFinite(FUZZY_THRESHOLD_ENV) ? FUZZY_THRESHOLD_ENV : FUZZY_THRESHOLD_DEFAULT

/**
 * Normalize whitespace: collapse runs of whitespace into a single space, trim.
 */
function normalizeWhitespace(str)
{
  return str.replace(/\s+/g, ' ').trim()
}

/**
 * Build a whitespace-normalized version of a string together with a
 * position map (normalizedIndex → originalIndex) so we can translate
 * match positions back to the original text.
 */
function normalizeWithPosMap(str)
{
  let normalized = ''
  const posMap = []
  let prevWasSpace = true // treat start as after space to trim leading whitespace

  for (let i = 0; i < str.length; i++)
  {
    const ch = str[i]
    if (/\s/.test(ch))
    {
      if (!prevWasSpace && normalized.length > 0)
      {
        normalized += ' '
        posMap.push(i)
        prevWasSpace = true
      }
    }
    else
    {
      normalized += ch
      posMap.push(i)
      prevWasSpace = false
    }
  }

  // Trim trailing space
  if (normalized.endsWith(' '))
  {
    normalized = normalized.slice(0, -1)
    posMap.pop()
  }

  return { text: normalized, posMap }
}

/**
 * Compute Dice coefficient (bigram similarity) between two strings.
 * Returns a value between 0.0 and 1.0.
 */
function diceCoefficient(a, b)
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

/**
 * Find the best fuzzy substring match of `needle` in `haystack`.
 *
 * Strategy:
 *  1. Fast path — whitespace-normalized exact match
 *  2. Sliding window with bigram Dice coefficient on normalized text
 *  3. Refinement pass (step=1) around the best coarse match
 *
 * Returns { index, length, matchedText, similarity } in ORIGINAL
 * haystack coordinates, or null if no match meets the threshold.
 */
function fuzzyFindInText(needle, haystack, threshold = FUZZY_THRESHOLD)
{
  if (!needle || needle.length < 5 || !haystack || haystack.length < needle.length * 0.5)
  {
    return null
  }

  const normNeedle = normalizeWhitespace(needle)
  const { text: normHaystack, posMap } = normalizeWithPosMap(haystack)

  if (normNeedle.length < 2 || normHaystack.length < normNeedle.length * 0.5)
  {
    return null
  }

  // Fast path: whitespace-normalized exact match
  const exactIdx = normHaystack.indexOf(normNeedle)
  if (exactIdx !== -1)
  {
    const origStart = posMap[exactIdx]
    const origEndIdx = Math.min(exactIdx + normNeedle.length - 1, posMap.length - 1)
    const origEnd = posMap[origEndIdx] + 1
    return {
      index: origStart,
      length: origEnd - origStart,
      matchedText: haystack.substring(origStart, origEnd),
      similarity: 1.0,
    }
  }

  // Sliding window on normalized text
  const needleLen = normNeedle.length
  const windowSizes = [
    needleLen,
    Math.floor(needleLen * 0.9),
    Math.ceil(needleLen * 1.1),
    Math.floor(needleLen * 0.8),
    Math.ceil(needleLen * 1.2),
  ]
  const minWindow = Math.min(...windowSizes)
  const step = Math.max(1, Math.floor(needleLen / 6))

  let best = null

  for (let pos = 0; pos <= normHaystack.length - minWindow; pos += step)
  {
    for (const wLen of windowSizes)
    {
      if (pos + wLen > normHaystack.length) continue
      const candidate = normHaystack.substring(pos, pos + wLen)
      const sim = diceCoefficient(normNeedle, candidate)
      if (sim >= threshold && (!best || sim > best.similarity))
      {
        best = { normIndex: pos, normLen: wLen, similarity: sim }
      }
    }
  }

  if (!best) return null

  // Refinement pass with step=1 around the best coarse position
  const refineStart = Math.max(0, best.normIndex - step)
  const refineEnd = Math.min(normHaystack.length, best.normIndex + step + 1)
  for (let pos = refineStart; pos <= refineEnd; pos++)
  {
    for (const wLen of windowSizes)
    {
      if (pos + wLen > normHaystack.length) continue
      const candidate = normHaystack.substring(pos, pos + wLen)
      const sim = diceCoefficient(normNeedle, candidate)
      if (sim > best.similarity)
      {
        best = { normIndex: pos, normLen: wLen, similarity: sim }
      }
    }
  }

  // Map back to original haystack coordinates
  const origStart = posMap[best.normIndex]
  const endIdx = Math.min(best.normIndex + best.normLen - 1, posMap.length - 1)
  const origEnd = posMap[endIdx] + 1

  return {
    index: origStart,
    length: origEnd - origStart,
    matchedText: haystack.substring(origStart, origEnd),
    similarity: best.similarity,
  }
}

// ---------------------------------------------------------------------------
// Helpers — context length error detection + retry
// ---------------------------------------------------------------------------

/**
 * Detect if an error is a context-length-exceeded error from OpenAI.
 */
function isContextLengthError(error)
{
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('context_length_exceeded') ||
    msg.includes('maximum context length') ||
    msg.includes('exceeds the context window') ||
    msg.includes('maximum number of tokens')
  )
}

/**
 * Truncate text to roughly `maxChars` characters, keeping start and end
 * with a clear marker in the middle.
 */
function truncateText(text, maxChars)
{
  if (text.length <= maxChars) return text
  const half = Math.floor(maxChars / 2)
  return (
    text.slice(0, half) +
    '\n\n[... truncated due to context length limits ...]\n\n' +
    text.slice(-half)
  )
}

/**
 * Wrapper around generateObject that retries with progressively truncated
 * prompt content if the LLM returns a context-length-exceeded error.
 *
 * On the first call, sends the full prompt. If a context error occurs,
 * retries with the prompt truncated to 50% of the original length,
 * then 25%, stopping after 3 attempts.
 */
/**
 * Preview helper: first 500 + last 500 chars, with a separator if truncated.
 */
function previewText(text, headLen = 500, tailLen = 500)
{
  if (text.length <= headLen + tailLen + 20) return text
  return (
    text.slice(0, headLen) +
    `\n... [${text.length - headLen - tailLen} chars omitted] ...\n` +
    text.slice(-tailLen)
  )
}

async function generateObjectWithRetry(options, label = 'LLM call', logOverrides = {})
{
  const originalPrompt = options.prompt
  const systemPrompt = options.system || ''
  const fractions = [1.0, 0.5, 0.25]

  // Use log-friendly versions if provided (large content blocks pre-truncated),
  // otherwise fall back to full prompts
  const logSystem = logOverrides.system != null ? logOverrides.system : systemPrompt
  const logPromptFull = logOverrides.prompt != null ? logOverrides.prompt : originalPrompt

  for (let i = 0; i < fractions.length; i++)
  {
    const fraction = fractions[i]
    const prompt =
      fraction < 1.0
        ? truncateText(originalPrompt, Math.floor(originalPrompt.length * fraction))
        : originalPrompt

    const attempt = i + 1
    console.log(
      `[AI Tutor] [${label}] Attempt ${attempt}/${fractions.length} — ` +
      `system: ${systemPrompt.length} chars, prompt: ${prompt.length} chars` +
      (fraction < 1.0 ? ` (truncated to ${Math.round(fraction * 100)}%)` : '')
    )
    // Log full prompt template with embedded content previewed
    if (LOG_PROMPTS)
    {
      console.log(`[AI Tutor] [${label}] System prompt:\n${logSystem}`)
      console.log(`[AI Tutor] [${label}] User prompt:\n${fraction < 1.0 ? previewText(prompt) : logPromptFull}`)
    }
    const startTime = Date.now()

    try
    {
      const result = await generateObject({ ...options, prompt })
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const responseStr = JSON.stringify(result.object)
      console.log(
        `[AI Tutor] [${label}] Completed in ${elapsed}s — response: ${responseStr.length} chars`
      )
      if (LOG_PROMPTS)
      {
        console.log(`[AI Tutor] [${label}] Response:\n${previewText(responseStr)}`)
      }
      return result
    } catch (err)
    {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (isContextLengthError(err) && i < fractions.length - 1)
      {
        const nextPct = Math.round(fractions[i + 1] * 100)
        console.warn(
          `[AI Tutor] [${label}] Context length exceeded after ${elapsed}s ` +
          `(prompt ${prompt.length} chars). Retrying with ~${nextPct}% of original prompt...`
        )
        continue
      }
      console.error(
        `[AI Tutor] [${label}] FAILED after ${elapsed}s: ${err.message}`
      )
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — Paper type classification + section mapping
// ---------------------------------------------------------------------------

const PAPER_TYPES = [
  'dataset',
  'method_improvement',
  'llm_engineering',
  'llm_inference_findings',
  'css',
  'position',
  'other',
]

const REVIEW_CATEGORIES = [
  'abstract',
  'introduction',
  'related_work',
  'methods',
  'results',
  'conclusion',
  'appendix',
]

const SectionAssignmentSchema = z.object({
  sectionTitle: z.string().describe('The EXACT section title from the outline'),
  category: z
    .enum(REVIEW_CATEGORIES)
    .describe(
      'Which reviewer this section should be assigned to. ' +
      'abstract = abstract, introduction = introduction, ' +
      'related_work = related work / background / prior work, ' +
      'methods = methods / approach / methodology / dataset construction / task formulation / preliminaries, ' +
      'results = results / experiments / analysis / discussion / RQ sections / evaluation, ' +
      'conclusion = conclusion / limitations / ethical considerations / acknowledgments, ' +
      'appendix = all the appendix sections'
    ),
})

const ClassificationSchema = z.object({
  paperType: z.enum(PAPER_TYPES),
  paperTypeSummary: z
    .string()
    .describe('One-sentence description of why this paper type was chosen'),
  sectionAssignments: z
    .array(SectionAssignmentSchema)
    .describe(
      'An assignment for EVERY section in the outline. Each section title must appear exactly once. ' +
      'No section should be left unassigned — every section gets a reviewer.'
    ),
  typeSpecificGuidance: z
    .object({
      abstractFocus: z
        .string()
        .describe(
          'Type-specific reviewing criteria for the abstract reviewer'
        ),
      introductionFocus: z.string(),
      methodsFocus: z.string(),
      resultsFocus: z.string(),
      overallNotes: z
        .string()
        .describe(
          'Any additional type-specific notes for all reviewers'
        ),
    })
    .describe(
      'Reviewing criteria generated specifically for this paper type, to be injected into each subagent'
    ),
})

/**
 * Convert the per-section assignments array into the category→titles map
 * that the rest of the pipeline expects.
 */
function buildSectionMapping(sectionAssignments, sections)
{
  const mapping = {}
  for (const cat of REVIEW_CATEGORIES)
  {
    mapping[cat] = []
  }

  // Add all assigned sections
  for (const assignment of sectionAssignments)
  {
    const cat = assignment.category
    if (mapping[cat])
    {
      mapping[cat].push(assignment.sectionTitle)
    }
  }

  // Safety net: find any sections from Phase 0 that the LLM missed
  // and assign them to the closest matching category
  const assignedTitles = new Set(
    sectionAssignments.map(a => a.sectionTitle.toLowerCase().trim())
  )
  for (const sec of sections)
  {
    if (sec.title.toLowerCase() === 'abstract') continue // handled separately
    if (assignedTitles.has(sec.title.toLowerCase().trim())) continue
    // Unassigned section — heuristic fallback
    const lower = sec.title.toLowerCase()
    let fallbackCat = 'results' // default: most sections are results-like
    if (lower.includes('introduction')) fallbackCat = 'introduction'
    else if (lower.includes('related') || lower.includes('background') || lower.includes('prior'))
      fallbackCat = 'related_work'
    else if (
      lower.includes('method') || lower.includes('approach') || lower.includes('dataset') ||
      lower.includes('preliminar') || lower.includes('formulation') || lower.includes('framework')
    )
      fallbackCat = 'methods'
    else if (
      lower.includes('conclusion') || lower.includes('limitation') || lower.includes('ethic') ||
      lower.includes('acknowledgment')
    )
      fallbackCat = 'conclusion'
    else if (
      lower.includes('appendix')
    )
      fallbackCat = 'appendix'
    mapping[fallbackCat].push(sec.title)
    console.warn(
      `[AI Tutor] Section "${sec.title}" was not assigned by LLM, falling back to "${fallbackCat}"`
    )
  }

  return mapping
}

async function classifyPaper(openai, model, sections)
{
  const abstractSection = sections.find(
    s => s.title.toLowerCase() === 'abstract'
  )
  const introSection = sections.find(s =>
    s.title.toLowerCase().startsWith('introduction')
  )

  console.log(
    `[AI Tutor] Phase 1: Abstract found: ${!!abstractSection} (${abstractSection?.content?.length || 0} chars), ` +
    `Introduction found: ${!!introSection} (${introSection?.content?.length || 0} chars)`
  )

  const sectionTitles = sections
    .filter(s => s.level <= 2)
    .map(s => `${'  '.repeat(s.level)}${s.title}`)
    .join('\n')

  // Build a numbered list so the LLM can see exactly which sections to assign
  const nonAbstractSections = sections.filter(
    s => s.level >= 1 && s.level <= 2
  )
  const numberedSections = nonAbstractSections
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n')

  console.log(
    `[AI Tutor] Phase 1: ${nonAbstractSections.length} sections to assign:\n${numberedSections}`
  )

  const paperTypeDefinitions = loadSkill('01_setup/paper_type_definitions.md')

  console.log(`[AI Tutor] Phase 1: Paper type definitions: ${paperTypeDefinitions.length} chars`)

  const classifierSystem = `You are a paper type classifier for an academic writing tutor.
Given a paper's abstract, introduction, and section outline, classify its type
and produce a section-to-category mapping plus type-specific review guidance.

${paperTypeDefinitions}`

  const abstractContent = abstractSection?.content || '(not found)'
  const introContent = introSection?.content || '(not found)'

  const classifierPrompt = `## Section Outline
${sectionTitles}

## All Sections to Assign (you MUST assign every one of these)
${numberedSections}

## Abstract
${abstractContent}

## Introduction
${introContent}

Based on the above:
1. Classify the paper type.
2. In sectionAssignments, assign EVERY section from the numbered list above to exactly one review category. Use the EXACT section titles. Do not skip any section.
3. Generate type-specific guidance for each reviewer.`

  // Build log-friendly versions: full template but embedded content previewed
  const logSystem = `You are a paper type classifier for an academic writing tutor.
Given a paper's abstract, introduction, and section outline, classify its type
and produce a section-to-category mapping plus type-specific review guidance.

${previewText(paperTypeDefinitions)}`

  const logPrompt = `## Section Outline
${sectionTitles}

## All Sections to Assign (you MUST assign every one of these)
${numberedSections}

## Abstract
${previewText(abstractContent)}

## Introduction
${previewText(introContent)}

Based on the above:
1. Classify the paper type.
2. In sectionAssignments, assign EVERY section from the numbered list above to exactly one review category. Use the EXACT section titles. Do not skip any section.
3. Generate type-specific guidance for each reviewer.`

  const result = await generateObjectWithRetry({
    model: openai(model),
    schema: ClassificationSchema,
    system: classifierSystem,
    prompt: classifierPrompt,
    temperature: 0.3,
  }, 'Phase1-Classifier', { system: logSystem, prompt: logPrompt })

  // Convert per-section assignments → category→titles map
  const raw = result.object
  console.log(
    `[AI Tutor] Phase 1 result: paperType="${raw.paperType}", ` +
    `${raw.sectionAssignments.length} section assignments, ` +
    `summary: "${raw.paperTypeSummary}"`
  )
  for (const a of raw.sectionAssignments)
  {
    console.log(`[AI Tutor]   -> "${a.sectionTitle}" => ${a.category}`)
  }

  const sectionMapping = buildSectionMapping(
    raw.sectionAssignments,
    sections
  )

  // Ensure the abstract section is always in the abstract category
  // (it's excluded from the LLM assignment list since it's level 0)
  if (abstractSection && !sectionMapping['abstract'].includes('Abstract'))
  {
    sectionMapping['abstract'].push('Abstract')
  }

  // Force appendix sections into the appendix category regardless of LLM assignment.
  // The LLM sometimes assigns appendix subsections to methods/results/etc. based on
  // their content, but appendix should always be reviewed as a separate unit.
  for (const [cat, titles] of Object.entries(sectionMapping))
  {
    if (cat === 'appendix') continue
    const toMove = titles.filter(t => t.toLowerCase().includes('appendix'))
    if (toMove.length > 0)
    {
      sectionMapping[cat] = titles.filter(t => !t.toLowerCase().includes('appendix'))
      sectionMapping['appendix'].push(...toMove)
      console.log(
        `[AI Tutor] Moved ${toMove.length} appendix section(s) from "${cat}" to "appendix": [${toMove.join(', ')}]`
      )
    }
  }

  console.log('[AI Tutor] Phase 1: Final section mapping:')
  for (const [cat, titles] of Object.entries(sectionMapping))
  {
    console.log(`[AI Tutor]   ${cat}: [${titles.join(', ')}]`)
  }

  return {
    paperType: raw.paperType,
    paperTypeSummary: raw.paperTypeSummary,
    sectionMapping,
    typeSpecificGuidance: raw.typeSpecificGuidance,
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Reviewer subagents
// ---------------------------------------------------------------------------

const CommentArraySchema = z.object({
  comments: z.array(
    z.object({
      highlightText: z
        .string()
        .describe(
          'The EXACT text from the paper to highlight. Must be a verbatim substring (1-200 chars).'
        ),
      comment: z
        .string()
        .describe(
          'Constructive review comment or suggestion for this highlighted text'
        ),
      severity: z
        .enum(['suggestion', 'warning', 'critical'])
        .describe(
          'suggestion = nice-to-have, warning = should fix, critical = must fix'
        ),
    })
  ),
})

/**
 * Definition for each reviewer subagent.
 * skillFiles: paths relative to ai-tutor-skills/
 * sectionCategories: which categories from Phase 1 mapping this agent reviews
 * guidanceKey: which key from typeSpecificGuidance to inject (or null)
 * systemPreamble: additional system instructions
 * fallbackToFullDoc: if true and no matching sections found, receive full doc
 * textOnly: if false in the future, could receive images (multimodal interface)
 */
const SUBAGENT_DEFS = [
  {
    id: 'abstract',
    name: 'Abstract Reviewer',
    skillFiles: ['04_paper_sections/abstract.md'],
    sectionCategories: ['abstract'],
    guidanceKey: 'abstractFocus',
    textOnly: true,
    systemPreamble:
      'Review the abstract for structure (5-sentence pattern), specificity (exact numbers, not vague), matryoshka doll principle, and clarity.',
  },
  {
    id: 'introduction',
    name: 'Introduction Reviewer',
    skillFiles: ['04_paper_sections/introduction.md'],
    sectionCategories: ['introduction'],
    guidanceKey: 'introductionFocus',
    textOnly: true,
    systemPreamble:
      'Review the introduction for the 5-question structure, storytelling (setting/villain/superhero), contributions list, and whether it sets the right expectations.',
  },
  {
    id: 'related_work',
    name: 'Related Work Reviewer',
    skillFiles: [
      '04_paper_sections/related_work.md',
      '06_writing_style/citations_and_references.md',
    ],
    sectionCategories: ['related_work'],
    guidanceKey: null,
    textOnly: true,
    systemPreamble:
      'Review the related work section for coverage, history-book paragraph structure, compare-and-contrast, and proper citation usage.',
  },
  {
    id: 'methods',
    name: 'Methods Reviewer',
    skillFiles: [
      '04_paper_sections/methods.md',
      '04_paper_sections/task_formulation.md',
      '06_writing_style/math_and_formulas.md',
    ],
    sectionCategories: ['methods'],
    guidanceKey: 'methodsFocus',
    textOnly: true,
    systemPreamble:
      'Review methods for clarity, design justification, intuition-before-formalism, notation consistency, and pseudo-code readability.',
  },
  {
    id: 'results',
    name: 'Results Reviewer',
    skillFiles: ['04_paper_sections/results_and_analysis.md'],
    sectionCategories: ['results'],
    guidanceKey: 'resultsFocus',
    textOnly: true,
    systemPreamble:
      'Review results for RQ structure, bold findings at paragraph starts, figure/table interpretation, and whether claims are supported by evidence.',
  },
  {
    id: 'conclusion',
    name: 'Conclusion & Supplements Reviewer',
    skillFiles: [
      '04_paper_sections/conclusion.md',
      '04_paper_sections/limitations.md',
      '04_paper_sections/ethical_considerations.md',
    ],
    sectionCategories: ['conclusion'],
    guidanceKey: null,
    textOnly: true,
    systemPreamble:
      'Review conclusion for brevity (not repeating abstract), limitations coverage, ethical considerations, and future work.',
  },
  {
    id: 'appendix',
    name: 'Appendix Reviewer',
    skillFiles: [
      '04_paper_sections/faq_appendix.md',
    ],
    sectionCategories: ['appendix'],
    guidanceKey: null,
    textOnly: true,
    systemPreamble:
      'Review the appendix sections as a unified block. Check that supplementary material is well-organized, ' +
      'that proofs are complete and clearly presented, that additional experiments/tables are properly referenced ' +
      'from the main text, and that a FAQ section (if present) anticipates likely reviewer questions. ' +
      'Also check that content in the appendix truly belongs there rather than in the main paper.',
  },
  {
    id: 'writing_style',
    name: 'Writing Style Reviewer',
    skillFiles: [
      '06_writing_style/grammar_and_punctuation.md',
      '06_writing_style/capitalization_and_acronyms.md',
      '06_writing_style/general_writing_habits.md',
      '06_writing_style/citations_and_references.md',
    ],
    sectionCategories: null, // receives full document
    guidanceKey: null,
    textOnly: true,
    systemPreamble:
      'Review the writing style: grammar, tense consistency, pronoun clarity, vague language, formality, active voice, filler words, and capitalization.',
  },
  {
    id: 'latex_formatting',
    name: 'LaTeX & Formatting Reviewer',
    skillFiles: [
      '06_writing_style/latex_formatting.md',
      '06_writing_style/math_and_formulas.md',
      '05_figures_and_tables/table_formatting.md',
    ],
    sectionCategories: null, // receives full document
    guidanceKey: null,
    textOnly: true,
    systemPreamble:
      'Review LaTeX formatting: \\cref usage, table formatting (booktabs, no vertical bars), equation punctuation, broken references, quotation marks.',
  },
  {
    id: 'figures_tables',
    name: 'Figures & Captions Reviewer',
    skillFiles: [
      '05_figures_and_tables/caption_writing.md',
      '05_figures_and_tables/figure1_design.md',
      '05_figures_and_tables/experiment_visualization.md',
    ],
    sectionCategories: null, // special: extracts figure/table environments
    guidanceKey: null,
    textOnly: true, // future: set to false for multimodal
    systemPreamble:
      'Review figure and table captions for self-containedness, first-sentence-as-statement, abbreviation definitions, and whether the surrounding text properly explains each figure/table.',
  },
  {
    id: 'structure',
    name: 'Structure & Narrative Reviewer',
    skillFiles: ['06_writing_style/general_writing_habits.md'],
    sectionCategories: null, // receives section skeleton
    guidanceKey: 'overallNotes',
    textOnly: true,
    systemPreamble:
      'Review overall paper structure: one key idea, storytelling flow, whether first sentences of paragraphs tell the whole story, section ordering, heading frequency (~every 10-15 lines), and consistency.',
  },
]

/**
 * Extract figure/table environments + surrounding context from the document.
 */
function extractFigureTableEnvironments(mergedTex)
{
  const envRe =
    /\\begin\{(figure|table)\*?\}[\s\S]*?\\end\{\1\*?\}/g
  const results = []
  let match
  while ((match = envRe.exec(mergedTex)) !== null)
  {
    // Include 3 lines before and after for context
    const beforeStart = mergedTex.lastIndexOf('\n', Math.max(0, match.index - 1))
    const linesBefore = mergedTex
      .slice(Math.max(0, beforeStart - 300), match.index)
      .split('\n')
      .slice(-3)
      .join('\n')
    const afterEnd = mergedTex.indexOf('\n', match.index + match[0].length)
    const linesAfter = mergedTex
      .slice(
        match.index + match[0].length,
        Math.min(mergedTex.length, (afterEnd === -1 ? mergedTex.length : afterEnd) + 300)
      )
      .split('\n')
      .slice(0, 3)
      .join('\n')
    results.push(`${linesBefore}\n${match[0]}\n${linesAfter}`)
  }
  return results.join('\n\n---\n\n')
}

/**
 * Build a "skeleton" of the paper: section titles + first sentence of each paragraph.
 */
function buildSkeleton(sections)
{
  const lines = []
  for (const sec of sections)
  {
    if (sec.level <= 2)
    {
      lines.push(`${'#'.repeat(sec.level + 1)} ${sec.title}`)
      // Extract first sentence of each non-empty paragraph
      const paragraphs = sec.content
        .split(/\n\n+/)
        .map(p => p.replace(/^\s*\\(?:sub)*section\*?\{[^}]+\}\s*/, '').trim())
        .filter(p => p.length > 20 && !p.startsWith('%'))
      for (const para of paragraphs.slice(0, 10))
      {
        const firstSentence = para.match(/^[^.!?]*[.!?]/)
        if (firstSentence)
        {
          lines.push(`  - ${firstSentence[0].trim()}`)
        }
      }
    }
  }
  return lines.join('\n')
}

/**
 * Collect sections matching a list of title strings from the Phase 1 mapping.
 *
 * Deduplicates overlapping sections: if a parent section (e.g., \section{Methodology})
 * and its child subsections (e.g., \subsection{Game-Theoretic Preliminaries}) are both
 * matched, only the parent is included since its content already contains the children.
 */
function collectSectionContent(sections, titleList)
{
  if (!titleList || titleList.length === 0) return ''
  const lowerTitles = new Set(titleList.map(t => t.toLowerCase().trim()))
  let matched = sections.filter(s =>
    lowerTitles.has(s.title.toLowerCase().trim())
  )
  if (matched.length === 0)
  {
    // Fuzzy fallback: partial match
    const fuzzyMatched = sections.filter(s =>
      [...lowerTitles].some(
        t =>
          s.title.toLowerCase().includes(t) ||
          t.includes(s.title.toLowerCase())
      )
    )
    if (fuzzyMatched.length > 0)
    {
      console.warn(
        `[AI Tutor] WARN: No exact section match for [${titleList.join(', ')}]. ` +
        `Fuzzy-matched ${fuzzyMatched.length} section(s): ${fuzzyMatched.map(s => s.title).join(', ')}`
      )
    } else
    {
      console.warn(
        `[AI Tutor] WARN: No sections matched (exact or fuzzy) for titles: [${titleList.join(', ')}]`
      )
    }
    matched = fuzzyMatched
  }

  // Remove child sections whose char range is fully contained within a parent section.
  // This prevents duplication when both \section{Methodology} and its \subsection{...}
  // children are matched — the parent already includes all child content.
  const deduped = matched.filter(s => {
    return !matched.some(
      parent =>
        parent !== s &&
        parent.charStart <= s.charStart &&
        parent.charEnd >= s.charEnd
    )
  })

  if (deduped.length < matched.length)
  {
    const removed = matched.length - deduped.length
    console.log(
      `[AI Tutor] Deduped ${removed} child section(s) already contained in parent sections`
    )
  }

  return deduped.map(s => s.content).join('\n\n')
}

/**
 * Run a single reviewer subagent.
 */
async function runSubagent(
  openai,
  model,
  def,
  sections,
  sectionMapping,
  typeGuidance,
  mergedTex
)
{
  console.log(`[AI Tutor] [${def.name}] Starting — gathering review text...`)

  // 1. Gather the text this agent should review
  let reviewText
  let textSource
  if (def.id === 'figures_tables')
  {
    reviewText = extractFigureTableEnvironments(mergedTex)
    textSource = 'figure/table environments'
    if (!reviewText || reviewText.length < 50)
    {
      console.log(`[AI Tutor] [${def.name}] Skipped: no figures/tables found in document`)
      return { id: def.id, comments: [], skipped: true, reason: 'No figures/tables found' }
    }
  } else if (def.id === 'structure')
  {
    reviewText = buildSkeleton(sections)
    textSource = 'paper skeleton'
  } else if (def.sectionCategories === null)
  {
    // Full document agents (writing_style, latex_formatting)
    reviewText = mergedTex
    textSource = 'full merged document'
  } else
  {
    // Section-specific agents: collect matching sections
    textSource = `sections: ${def.sectionCategories.join(', ')}`
    let parts = []
    for (const cat of def.sectionCategories)
    {
      const titles = sectionMapping[cat] || []
      const text = collectSectionContent(sections, titles)
      if (text) parts.push(text)
    }
    reviewText = parts.join('\n\n')
    if (!reviewText || reviewText.trim().length < 30)
    {
      console.log(
        `[AI Tutor] [${def.name}] Skipped: no matching sections for categories [${def.sectionCategories.join(', ')}]`
      )
      return {
        id: def.id,
        comments: [],
        skipped: true,
        reason: `No matching sections found for categories: ${def.sectionCategories.join(', ')}`,
      }
    }
  }
  console.log(
    `[AI Tutor] [${def.name}] Review text: ${reviewText.length} chars from ${textSource}`
  )

  // 2. Load skill files
  const skillContent = def.skillFiles
    .map(f =>
    {
      const content = loadSkill(f)
      return `--- ${f} ---\n${content}`
    })
    .join('\n\n')

  // 3. Build type-specific guidance injection
  let guidanceInjection = ''
  if (def.guidanceKey && typeGuidance && typeGuidance[def.guidanceKey])
  {
    guidanceInjection = `\n\n## Type-Specific Review Focus\n${typeGuidance[def.guidanceKey]}`
  }
  if (typeGuidance?.overallNotes && def.guidanceKey !== 'overallNotes')
  {
    guidanceInjection += `\n\n## General Type Notes\n${typeGuidance.overallNotes}`
  }

  // 4. Call LLM
  const systemPrompt = `You are the "${def.name}" for an academic paper writing tutor.
${def.systemPreamble}

Your task: Read the provided LaTeX text and produce specific, actionable inline feedback that helps the author strengthen their paper.

Each piece of feedback must:
- Reference an EXACT substring from the text (1-200 chars) as highlightText. The highlightText MUST appear verbatim — do not paraphrase or shorten it.
- Be one of two types:
  **Suggestion**: A concrete rewrite, restructuring, or addition the author should consider. Explain *why* the change improves clarity, precision, or persuasiveness.
  **Concern**: A specific weakness, gap, or risk in the current writing — e.g., an unsupported claim, ambiguous phrasing, missing context, logical gap, weak transition, or unclear contribution.

Do NOT produce:
- Generic praise ("Good point here")
- Vague observations ("This could be improved")
- Comments about negligible LaTeX syntax
- Summaries of what the text already says

Every comment should answer the question: "What should the author *do* to make this part of the paper stronger?"

Produce at most 10 comments. Prioritize fewer, deeper comments over many shallow ones. Label each comment as one of:
[suggestion] (nice to have),
[warning] (should fix), or
[critical] (must fix).

Avoid including too many low impact [suggestion] comments. If there are only a few meaningful issues, generate fewer comments. Your comments must be concise, limited to 1 to 3 sentences to ensure readability.

## Writing Skills Reference
${skillContent}
${guidanceInjection}`

  const userPrompt = `Review the following LaTeX text and provide your comments:\n\n${reviewText}`

  // Build log-friendly versions: full template but skill content and review text previewed
  const logSystemPrompt = `You are the "${def.name}" for an academic paper writing tutor.
${def.systemPreamble}

Your task: Read the provided LaTeX text and produce specific, actionable inline feedback that helps the author strengthen their paper.

Each piece of feedback must:
- Reference an EXACT substring from the text (1-200 chars) as highlightText. The highlightText MUST appear verbatim — do not paraphrase or shorten it.
- Be one of two types:
  **Suggestion**: A concrete rewrite, restructuring, or addition the author should consider. Explain *why* the change improves clarity, precision, or persuasiveness.
  **Concern**: A specific weakness, gap, or risk in the current writing — e.g., an unsupported claim, ambiguous phrasing, missing context, logical gap, weak transition, or unclear contribution.

Do NOT produce:
- Generic praise ("Good point here")
- Vague observations ("This could be improved")
- Comments about negligible LaTeX syntax
- Summaries of what the text already says

Every comment should answer the question: "What should the author *do* to make this part of the paper stronger?"

Produce at most 10 comments. Prioritize fewer, deeper comments over many shallow ones. Label each comment as one of:
[suggestion] (nice to have),
[warning] (should fix), or
[critical] (must fix).

Avoid including too many low impact [suggestion] comments. If there are only a few meaningful issues, generate fewer comments. Your comments must be concise, limited to 1 to 3 sentences to ensure readability.

## Writing Skills Reference
${previewText(skillContent)}
${guidanceInjection}`

  const logUserPrompt = `Review the following LaTeX text. For each comment, identify a specific passage that could be strengthened and provide either a concrete suggestion for improvement or a concern the author needs to address:\n\n${previewText(reviewText)}`

  console.log(
    `[AI Tutor] [${def.name}] System prompt: ${systemPrompt.length} chars ` +
    `(${def.skillFiles.length} skill files, guidance: ${guidanceInjection ? 'yes' : 'none'})`
  )

  const result = await generateObjectWithRetry({
    model: openai(model),
    schema: CommentArraySchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.4,
  }, `Phase2-${def.id}`, { system: logSystemPrompt, prompt: logUserPrompt })

  // 5. Validate: only keep comments whose highlightText actually exists in the review text
  const rawCount = result.object.comments.length
  const validated = result.object.comments.filter(c =>
  {
    if (reviewText.includes(c.highlightText)) return true

    // Try repairing JSON-escaped LaTeX backslashes
    const repaired = repairJsonEscapedLatex(c.highlightText)
    if (repaired !== c.highlightText && reviewText.includes(repaired))
    {
      console.log(
        `[AI Tutor] [${def.name}] Repaired JSON-escaped highlightText: "${repaired.slice(0, 80)}..."`
      )
      c.highlightText = repaired
      return true
    }

    // Try fuzzy matching as last resort
    const fuzzyResult = fuzzyFindInText(c.highlightText, reviewText)
    if (fuzzyResult)
    {
      console.log(
        `[AI Tutor] [${def.name}] Fuzzy-matched highlightText (sim=${fuzzyResult.similarity.toFixed(3)}): ` +
        `"${fuzzyResult.matchedText.slice(0, 80)}..."`
      )
      c.highlightText = fuzzyResult.matchedText
      return true
    }

    console.warn(
      `[AI Tutor] [${def.name}] WARN: highlightText not found in review text, discarding: ` +
      `"${c.highlightText.slice(0, 80)}..." (comment: "${c.comment.slice(0, 60)}...")`
    )
    return false
  })

  console.log(
    `[AI Tutor] [${def.name}] Validation: ${validated.length}/${rawCount} comments kept` +
    (rawCount - validated.length > 0
      ? ` (${rawCount - validated.length} discarded — highlightText not found)`
      : '')
  )
  for (const c of validated)
  {
    console.log(
      `[AI Tutor] [${def.name}]   [${c.severity}] "${c.highlightText.slice(0, 50)}..." => ${c.comment.slice(0, 80)}...`
    )
  }

  return {
    id: def.id,
    comments: validated.map(c => ({
      ...c,
      category: def.id,
      agentName: def.name,
    })),
    skipped: false,
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Comment position mapping
// ---------------------------------------------------------------------------

/**
 * Build a mapping from character ranges in merged.tex to original file paths.
 * Uses the "% ========== INLINED FROM: ... ==========" markers.
 */
function buildInlineMap(mergedTex)
{
  const regions = []
  const markerRe =
    /^% ========== INLINED FROM: (.+?) ==========$/gm
  const endRe = /^% ========== END OF: (.+?) ==========$/gm

  const starts = []
  let m
  while ((m = markerRe.exec(mergedTex)) !== null)
  {
    starts.push({ file: m[1].trim(), pos: m.index + m[0].length + 1 })
  }
  const ends = []
  while ((m = endRe.exec(mergedTex)) !== null)
  {
    ends.push({ file: m[1].trim(), pos: m.index })
  }

  // Match starts with ends
  for (const start of starts)
  {
    const matchingEnd = ends.find(
      e => e.file === start.file && e.pos > start.pos
    )
    if (matchingEnd)
    {
      regions.push({
        file: start.file,
        start: start.pos,
        end: matchingEnd.pos,
      })
    }
  }

  return regions
}

/**
 * Given a character position in merged.tex, find which original file it belongs to.
 * Returns the root doc path if it's not inside any inlined region.
 */
function findOriginalFile(pos, inlineMap, rootDocPath)
{
  for (const region of inlineMap)
  {
    if (pos >= region.start && pos < region.end)
    {
      return region.file
    }
  }
  return rootDocPath
}

/**
 * Map comments from merged.tex positions back to original document positions.
 *
 * Strategy:
 *  1. Find highlightText in merged.tex → get merged position
 *  2. Determine which original file that position belongs to
 *  3. Find highlightText in the original file → get original position
 *  4. Return comment with docPath + startOffset
 */
export function mapCommentsToDocuments(
  comments,
  mergedTex,
  docContentMap,
  rootDocPath
)
{
  const inlineMap = buildInlineMap(mergedTex)
  const normalizedRoot = rootDocPath.startsWith('/')
    ? rootDocPath.slice(1)
    : rootDocPath

  console.log(
    `[AI Tutor] Phase 3: Mapping ${comments.length} comments to documents. ` +
    `Inline map: ${inlineMap.length} regions, root: ${normalizedRoot}, ` +
    `docContentMap: ${Object.keys(docContentMap).length} files`
  )
  if (inlineMap.length > 0)
  {
    for (const r of inlineMap)
    {
      console.log(`[AI Tutor] Phase 3:   inline region: ${r.file} (chars ${r.start}-${r.end})`)
    }
  }

  const mapped = []
  let notFoundInMerged = 0
  let directMapped = 0
  let fallbackMapped = 0
  let fuzzyMapped = 0
  let unmapped = 0

  for (const comment of comments)
  {
    // Step 1: find in merged.tex (exact, then fuzzy)
    let mergedPos = mergedTex.indexOf(comment.highlightText)
    if (mergedPos === -1)
    {
      // Try fuzzy match against merged.tex
      const fuzzyResult = fuzzyFindInText(comment.highlightText, mergedTex)
      if (fuzzyResult)
      {
        console.log(
          `[AI Tutor] Phase 3: Fuzzy-matched in merged.tex (sim=${fuzzyResult.similarity.toFixed(3)}): ` +
          `"${fuzzyResult.matchedText.slice(0, 80)}..." [${comment.agentName}]`
        )
        comment.highlightText = fuzzyResult.matchedText
        mergedPos = fuzzyResult.index
      }
      else
      {
        console.warn(
          `[AI Tutor] Phase 3: WARN: highlightText not found in merged.tex (exact + fuzzy): ` +
          `"${comment.highlightText.slice(0, 80)}..." [${comment.agentName}]`
        )
        notFoundInMerged++
        continue
      }
    }

    // Step 2: determine original file
    let originalFile = findOriginalFile(mergedPos, inlineMap, normalizedRoot)
    // Normalize: try adding .tex if not found
    if (!docContentMap[originalFile] && docContentMap[originalFile + '.tex'])
    {
      originalFile = originalFile + '.tex'
    }

    const originalContent = docContentMap[originalFile]
    if (!originalContent)
    {
      // Fallback: search all docs for the highlightText (exact, then fuzzy)
      let found = false
      for (const [docPath, content] of Object.entries(docContentMap))
      {
        const idx = content.indexOf(comment.highlightText)
        if (idx !== -1)
        {
          mapped.push({
            ...comment,
            docPath,
            startOffset: idx,
            endOffset: idx + comment.highlightText.length,
          })
          found = true
          console.warn(
            `[AI Tutor] Phase 3: WARN: Original file "${originalFile}" not in docContentMap. ` +
            `Fallback found in "${docPath}" for: "${comment.highlightText.slice(0, 50)}..."`
          )
          fallbackMapped++
          break
        }
      }
      // Try fuzzy fallback across all docs
      if (!found)
      {
        let bestFuzzy = null
        let bestDocPath = null
        for (const [docPath, content] of Object.entries(docContentMap))
        {
          const fuzzyResult = fuzzyFindInText(comment.highlightText, content)
          if (fuzzyResult && (!bestFuzzy || fuzzyResult.similarity > bestFuzzy.similarity))
          {
            bestFuzzy = fuzzyResult
            bestDocPath = docPath
          }
        }
        if (bestFuzzy)
        {
          comment.highlightText = bestFuzzy.matchedText
          mapped.push({
            ...comment,
            docPath: bestDocPath,
            startOffset: bestFuzzy.index,
            endOffset: bestFuzzy.index + bestFuzzy.length,
          })
          found = true
          console.log(
            `[AI Tutor] Phase 3: Fuzzy fallback across docs (sim=${bestFuzzy.similarity.toFixed(3)}): ` +
            `found in "${bestDocPath}" for: "${comment.highlightText.slice(0, 50)}..." [${comment.agentName}]`
          )
          fuzzyMapped++
        }
      }
      if (!found)
      {
        console.warn(
          `[AI Tutor] Phase 3: WARN: Could not map comment to any document (exact + fuzzy): ` +
          `"${comment.highlightText.slice(0, 60)}..." [${comment.agentName}]`
        )
        unmapped++
      }
      continue
    }

    // Step 3: find in original file (exact, then fuzzy)
    let originalPos = originalContent.indexOf(comment.highlightText)
    if (originalPos === -1)
    {
      // Try fuzzy match in expected original file first
      const fuzzyResult = fuzzyFindInText(comment.highlightText, originalContent)
      if (fuzzyResult)
      {
        console.log(
          `[AI Tutor] Phase 3: Fuzzy-matched in original file "${originalFile}" (sim=${fuzzyResult.similarity.toFixed(3)}): ` +
          `"${fuzzyResult.matchedText.slice(0, 80)}..." [${comment.agentName}]`
        )
        comment.highlightText = fuzzyResult.matchedText
        mapped.push({
          ...comment,
          docPath: originalFile,
          startOffset: fuzzyResult.index,
          endOffset: fuzzyResult.index + fuzzyResult.length,
        })
        fuzzyMapped++
        continue
      }

      // Fallback: try searching all docs (exact, then fuzzy)
      let found = false
      for (const [docPath, content] of Object.entries(docContentMap))
      {
        const idx = content.indexOf(comment.highlightText)
        if (idx !== -1)
        {
          mapped.push({
            ...comment,
            docPath,
            startOffset: idx,
            endOffset: idx + comment.highlightText.length,
          })
          found = true
          console.warn(
            `[AI Tutor] Phase 3: WARN: highlightText not in expected file "${originalFile}", ` +
            `fallback found in "${docPath}": "${comment.highlightText.slice(0, 50)}..."`
          )
          fallbackMapped++
          break
        }
      }
      // Try fuzzy fallback across all docs
      if (!found)
      {
        let bestFuzzy = null
        let bestDocPath = null
        for (const [docPath, content] of Object.entries(docContentMap))
        {
          const fuzzyResult = fuzzyFindInText(comment.highlightText, content)
          if (fuzzyResult && (!bestFuzzy || fuzzyResult.similarity > bestFuzzy.similarity))
          {
            bestFuzzy = fuzzyResult
            bestDocPath = docPath
          }
        }
        if (bestFuzzy)
        {
          comment.highlightText = bestFuzzy.matchedText
          mapped.push({
            ...comment,
            docPath: bestDocPath,
            startOffset: bestFuzzy.index,
            endOffset: bestFuzzy.index + bestFuzzy.length,
          })
          found = true
          console.log(
            `[AI Tutor] Phase 3: Fuzzy fallback across docs (sim=${bestFuzzy.similarity.toFixed(3)}): ` +
            `found in "${bestDocPath}" for: "${comment.highlightText.slice(0, 50)}..." [${comment.agentName}]`
          )
          fuzzyMapped++
        }
      }
      if (!found)
      {
        console.warn(
          `[AI Tutor] Phase 3: WARN: highlightText not in any original file (exact + fuzzy): ` +
          `"${comment.highlightText.slice(0, 60)}..." (expected: ${originalFile}) [${comment.agentName}]`
        )
        unmapped++
      }
      continue
    }

    mapped.push({
      ...comment,
      docPath: originalFile,
      startOffset: originalPos,
      endOffset: originalPos + comment.highlightText.length,
    })
    directMapped++
  }

  console.log(
    `[AI Tutor] Phase 3: Mapping complete — ` +
    `${directMapped} direct, ${fallbackMapped} fallback, ${fuzzyMapped} fuzzy, ` +
    `${notFoundInMerged} not in merged.tex, ${unmapped} unmapped. ` +
    `Total mapped: ${mapped.length}/${comments.length}`
  )

  return mapped
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full multi-agent paper review.
 *
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {string} opts.model - e.g. 'gpt-4o', 'gpt-4o-mini'
 * @param {string} opts.cacheDir - path to the project's cache directory
 * @param {object} opts.docContentMap - { normalizedPath: contentString }
 * @param {string} opts.rootDocPath - normalized root doc path
 * @returns {object} { comments, classification, summary, failedAgents }
 */
export async function runFullReview({
  projectId,
  model,
  venue = 'arxiv',
  cacheDir,
  docContentMap,
  rootDocPath,
})
{
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey)
  {
    throw new Error(
      'OPENAI_API_KEY not set. Add it to /home/ubuntu/.jiarui/overleaf/.env'
    )
  }

  const openai = createOpenAI({ apiKey })

  // Read merged.tex from cache
  const mergedTexPath = path.join(cacheDir, 'merged.tex')
  if (!fs.existsSync(mergedTexPath))
  {
    throw new Error(
      'merged.tex not found. Run "Give Writing Suggestions" first to analyze the project.'
    )
  }
  const mergedTex = fs.readFileSync(mergedTexPath, 'utf-8')

  const overallStart = Date.now()
  console.log('='.repeat(80))
  console.log(`[AI Tutor] STARTING FULL REVIEW`)
  console.log(`[AI Tutor]   Project: ${projectId}`)
  console.log(`[AI Tutor]   Model: ${model}`)
  console.log(`[AI Tutor]   merged.tex: ${mergedTex.length} chars`)
  console.log(`[AI Tutor]   docContentMap: ${Object.keys(docContentMap).length} files (${Object.keys(docContentMap).join(', ')})`)
  console.log('='.repeat(80))

  // Phase 0: Parse sections
  const phase0Start = Date.now()
  const sections = parseSections(mergedTex)
  const phase0Elapsed = ((Date.now() - phase0Start) / 1000).toFixed(2)
  console.log(
    `[AI Tutor] Phase 0: Parsed ${sections.length} sections in ${phase0Elapsed}s:`
  )
  for (const sec of sections)
  {
    console.log(
      `[AI Tutor]   L${sec.level} "${sec.title}" (${sec.content.length} chars, ` +
      `pos ${sec.charStart}-${sec.charEnd})`
    )
  }

  // Phase 1: Classify paper type + map sections
  console.log('-'.repeat(60))
  console.log('[AI Tutor] Phase 1: Classifying paper type + assigning sections...')
  const phase1Start = Date.now()
  const classification = await classifyPaper(openai, model, sections)
  const phase1Elapsed = ((Date.now() - phase1Start) / 1000).toFixed(1)
  console.log(
    `[AI Tutor] Phase 1 complete in ${phase1Elapsed}s — ` +
    `Paper type: ${classification.paperType} — ${classification.paperTypeSummary}`
  )

  // Build the final list of agents: static defs + dynamic paper-type agent
  const agentDefs = [...SUBAGENT_DEFS]

  // Add a paper-type-specific reviewer if a guideline file exists for this type
  const paperTypeFile = `03_paper_types/${classification.paperType}_paper.md`
  const paperTypeGuideline = loadSkill(paperTypeFile)
  if (!paperTypeGuideline.startsWith('[skill file not found'))
  {
    agentDefs.push({
      id: 'paper_type',
      name: `Paper Type Reviewer (${classification.paperType})`,
      skillFiles: [paperTypeFile],
      sectionCategories: null, // receives full document
      guidanceKey: 'overallNotes',
      textOnly: true,
      systemPreamble:
        `This paper has been classified as: "${classification.paperType}" — ${classification.paperTypeSummary}\n` +
        'Review the paper against the type-specific writing guidelines provided in the skills reference. ' +
        'Check whether the paper follows the recommended structure, includes the expected elements, ' +
        'and addresses the criteria that reviewers of this paper type typically look for. ' +
        'Focus on high-level structural and content issues specific to this paper type, not general writing style.',
    })
    console.log(
      `[AI Tutor] Added dynamic Paper Type Reviewer for "${classification.paperType}" using ${paperTypeFile}`
    )
  } else
  {
    console.log(
      `[AI Tutor] No paper type guideline file found for "${classification.paperType}", skipping Paper Type Reviewer`
    )
  }

  // Add a venue-specific reviewer if a venue is selected (not arxiv/default)
  if (venue && venue !== 'arxiv')
  {
    const venueFile = `02_venues/${venue}.md`
    const venueGuideline = loadSkill(venueFile)
    if (!venueGuideline.startsWith('[skill file not found'))
    {
      agentDefs.push({
        id: 'venue',
        name: `Venue Reviewer (${venue})`,
        skillFiles: [venueFile],
        sectionCategories: null, // receives full document
        guidanceKey: 'overallNotes',
        textOnly: true,
        systemPreamble:
          `The paper is being prepared for submission to: ${venue}.\n` +
          'Review the paper specifically against this venue\'s requirements: ' +
          'page limits, required sections (e.g. limitations, reproducibility, impact statement), ' +
          'formatting rules, and the evaluation criteria that reviewers at this venue apply. ' +
          'Flag any issues that would hurt the paper\'s acceptance at this specific venue. ' +
          'Focus on venue-specific gaps — do not repeat general writing advice covered by other reviewers.',
      })
      console.log(
        `[AI Tutor] Added dynamic Venue Reviewer for "${venue}" using ${venueFile}`
      )
    } else
    {
      console.log(
        `[AI Tutor] No venue guideline file found for "${venue}", skipping Venue Reviewer`
      )
    }
  } else
  {
    console.log('[AI Tutor] No specific venue selected, skipping Venue Reviewer')
  }

  // Phase 2: Run subagents in parallel
  console.log('-'.repeat(60))
  console.log(
    `[AI Tutor] Phase 2: Launching ${agentDefs.length} reviewer subagents in parallel...`
  )
  const phase2Start = Date.now()

  const AGENT_TIMEOUT = 120_000 // 2 minutes per agent
  const subagentPromises = agentDefs.map(def =>
  {
    const promise = runSubagent(
      openai,
      model,
      def,
      sections,
      classification.sectionMapping,
      classification.typeSpecificGuidance,
      mergedTex
    )
    // Wrap with timeout
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${AGENT_TIMEOUT}ms`)),
          AGENT_TIMEOUT
        )
      ),
    ]).catch(err => ({
      id: def.id,
      comments: [],
      skipped: true,
      reason: `Error: ${err.message}`,
    }))
  })

  const results = await Promise.allSettled(subagentPromises)
  const phase2Elapsed = ((Date.now() - phase2Start) / 1000).toFixed(1)

  // Collect results
  const allComments = []
  const failedAgents = []

  console.log(`[AI Tutor] Phase 2: All agents returned after ${phase2Elapsed}s. Collecting results:`)

  for (let i = 0; i < results.length; i++)
  {
    const result =
      results[i].status === 'fulfilled' ? results[i].value : null
    const def = agentDefs[i]

    if (!result || results[i].status === 'rejected')
    {
      failedAgents.push({
        id: def.id,
        name: def.name,
        reason: results[i].reason?.message || 'Unknown error',
      })
      console.error(
        `[AI Tutor]   ${def.name} FAILED: ${results[i].reason?.message || 'Unknown'}`
      )
      continue
    }

    if (result.skipped)
    {
      console.log(
        `[AI Tutor]   ${def.name} SKIPPED: ${result.reason}`
      )
      failedAgents.push({
        id: def.id,
        name: def.name,
        reason: result.reason,
      })
      continue
    }

    console.log(
      `[AI Tutor]   ${def.name}: ${result.comments.length} comments OK`
    )
    allComments.push(...result.comments)
  }

  console.log(
    `[AI Tutor] Phase 2 complete in ${phase2Elapsed}s. ` +
    `Total raw comments: ${allComments.length}, failed/skipped agents: ${failedAgents.length}`
  )

  // Phase 3: Map comments to original documents
  console.log('-'.repeat(60))
  console.log('[AI Tutor] Phase 3: Mapping comments to original documents...')
  const phase3Start = Date.now()
  const mappedComments = mapCommentsToDocuments(
    allComments,
    mergedTex,
    docContentMap,
    rootDocPath
  )
  const phase3Elapsed = ((Date.now() - phase3Start) / 1000).toFixed(2)
  console.log(
    `[AI Tutor] Phase 3 complete in ${phase3Elapsed}s. ` +
    `Mapped ${mappedComments.length}/${allComments.length} comments to original documents`
  )

  // Prefix all comments with [AI Tutor] [severity] [agent]
  for (const c of mappedComments)
  {
    if (!c.comment.startsWith('[AI Tutor]'))
    {
      c.comment = `[AI Tutor] [${c.severity}] [${c.agentName}] ${c.comment}`
    }
  }

  // Group by document
  const commentsByDoc = {}
  for (const c of mappedComments)
  {
    if (!commentsByDoc[c.docPath]) commentsByDoc[c.docPath] = []
    commentsByDoc[c.docPath].push(c)
  }

  // Build summary
  const byCat = {}
  const bySev = {}
  for (const c of mappedComments)
  {
    byCat[c.category] = (byCat[c.category] || 0) + 1
    bySev[c.severity] = (bySev[c.severity] || 0) + 1
  }

  const reviewResult = {
    projectId,
    model,
    reviewedAt: new Date().toISOString(),
    classification: {
      paperType: classification.paperType,
      paperTypeSummary: classification.paperTypeSummary,
    },
    commentsByDoc,
    summary: {
      total: mappedComments.length,
      byCategory: byCat,
      bySeverity: bySev,
    },
    failedAgents,
  }

  // Cache results
  const reviewPath = path.join(cacheDir, 'review_comments.json')
  fs.writeFileSync(reviewPath, JSON.stringify(reviewResult, null, 2))
  console.log(`[AI Tutor] Review cached to ${reviewPath}`)

  const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1)
  console.log('='.repeat(80))
  console.log(`[AI Tutor] REVIEW COMPLETE in ${overallElapsed}s`)
  console.log(`[AI Tutor]   Model: ${model}`)
  console.log(`[AI Tutor]   Paper type: ${reviewResult.classification.paperType}`)
  console.log(`[AI Tutor]   Total comments: ${reviewResult.summary.total}`)
  console.log(`[AI Tutor]   By category: ${JSON.stringify(reviewResult.summary.byCategory)}`)
  console.log(`[AI Tutor]   By severity: ${JSON.stringify(reviewResult.summary.bySeverity)}`)
  console.log(`[AI Tutor]   By document: ${Object.entries(commentsByDoc).map(([d, c]) => `${d}(${c.length})`).join(', ')}`)
  console.log(`[AI Tutor]   Failed/skipped agents: ${failedAgents.length > 0 ? failedAgents.map(a => `${a.name}: ${a.reason}`).join('; ') : 'none'}`)
  console.log(`[AI Tutor]   Timing: Phase 0: ${phase0Elapsed}s, Phase 1: ${phase1Elapsed}s, Phase 2: ${phase2Elapsed}s, Phase 3: ${phase3Elapsed}s`)
  console.log('='.repeat(80))

  return reviewResult
}

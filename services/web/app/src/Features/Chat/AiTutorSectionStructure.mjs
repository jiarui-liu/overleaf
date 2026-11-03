/**
 * AiTutorSectionStructure.mjs
 *
 * Rule-based checks on how the experiments part of a paper is laid out. No LLM.
 *
 * The rule: experimental setup (datasets, models, baselines, metrics,
 * hyperparameters, implementation and compute details) lives in its own
 * Experimental Setup section or subsection, placed before the results. The
 * Experiments / Results section then opens straight with the summary of
 * findings and the results.
 *
 * These checks look only at section titles and order. Whether setup
 * sentences sit inside the results is judged by the Sentence Placement
 * Reviewer, which uses describeExperimentLayout() as ground truth.
 *
 * Also: top-level sections are not named "Our ..." (checkSectionNames), and
 * Related Work has at least three cited paragraphs that each say how this
 * work differs (checkRelatedWork).
 */

export const AGENT_ID = 'section_structure'
export const AGENT_NAME = 'Section Structure Check'

export const SETUP_SECTION_NAME = 'Experimental Setup'

// Titles such as "Experimental Setup", "Setup", "Implementation Details",
// "Evaluation Protocol", "Experimental Settings", "Evaluation Metrics",
// "Datasets and Baselines".
const SETUP_TITLE_RE =
  /\b(set[- ]?ups?|settings?|implementation details?|training details?|evaluation (protocol|details|metrics?)|experimental details?|datasets? and (baselines?|metrics?|models?)|baselines? and metrics?)\b/i

// Titles such as "Experiments", "Results", "Evaluation", "Main Results",
// "Analysis", "Findings", "RQ1: ...".
const RESULTS_TITLE_RE =
  /\b(experiments?|results?|evaluations?|analys[ie]s|findings|ablations?)\b|^RQ\s*\d/i

// Part of the method or theory, not the experiments: "Problem Setup",
// "Task Setting", "Theoretical Analysis", "Formal Setting".
const NOT_EXPERIMENTS_RE = /\b(problem|task|theoretical|theory|formal|game)\b/i

/**
 * Classify a section title: 'setup', 'results', or null.
 * Setup wins over results, so "Experimental Setup" is setup, not results.
 */
export function sectionRole(title)
{
  // Drop macro names but keep their arguments: \textbf{Results} -> Results.
  const t = title.replace(/\\[a-zA-Z]+\*?/g, ' ').replace(/[{}]/g, ' ').trim()
  if (NOT_EXPERIMENTS_RE.test(t)) return null
  if (SETUP_TITLE_RE.test(t)) return 'setup'
  if (RESULTS_TITLE_RE.test(t)) return 'results'
  return null
}

/**
 * Describe the experiments layout from the paragraph map (see
 * buildParagraphMap in AiTutorSentencePlacement.mjs). Appendix sections are
 * ignored: setup details in the appendix are fine as long as the main text
 * has its own setup section.
 *
 * Returns {
 *   setup:   [map entries whose title is setup-like],
 *   results: [map entries whose title is results-like],
 *   firstResultsWithProse: first results entry that has paragraphs and doesn't
 *     hold the setup subsection, or null,
 *   hasSetup, setupAfterResults,
 * }
 */
export function describeExperimentLayout(paragraphMap)
{
  const main = paragraphMap.filter(s => !s.isAppendix && s.level >= 1)
  const setup = main.filter(s => sectionRole(s.title) === 'setup')
  const results = main.filter(s => sectionRole(s.title) === 'results')
  // A section that contains a setup subsection ("Experiments" holding
  // "Experiments > Setup") is only framing: its intro paragraph doesn't make
  // it a results section for the ordering check.
  const holdsSetup = s => setup.some(st => st.label.startsWith(`${s.label} > `))
  const firstResultsWithProse =
    results.find(s => s.paragraphs.length > 0 && !holdsSetup(s)) || null
  const firstSetup = setup[0] || null
  return {
    setup,
    results,
    firstResultsWithProse,
    hasSetup: setup.length > 0,
    setupAfterResults:
      !!firstSetup && !!firstResultsWithProse && firstSetup.start > firstResultsWithProse.start,
  }
}

/** The header line of a section (e.g. "\section{Experiments}"), verbatim. */
function headerLine(mergedTex, entry)
{
  const lineEnd = mergedTex.indexOf('\n', entry.start)
  return mergedTex.slice(entry.start, lineEnd === -1 ? entry.end : lineEnd).trim()
}

/**
 * Run the checks and return findings as review comments anchored on section
 * headers, in the same shape the other agents return.
 */
export function checkExperimentStructure(paragraphMap, mergedTex)
{
  const layout = describeExperimentLayout(paragraphMap)
  const comments = []
  const first = layout.firstResultsWithProse
  if (!first) return { layout, comments }

  // The top-level section that holds the results, e.g. "Experiments" for
  // "Experiments > Main Results". Anchor there so the comment sits on the
  // heading the author would restructure.
  const topLabel = first.label.split(' > ')[0]
  const anchorEntry = paragraphMap.find(s => s.label === topLabel) || first

  if (!layout.hasSetup)
  {
    comments.push({
      highlightText: headerLine(mergedTex, anchorEntry),
      comment:
        `There is no ${SETUP_SECTION_NAME} section. Put the datasets, models, baselines, metrics, ` +
        `hyperparameters and implementation details in a dedicated "${SETUP_SECTION_NAME}" section ` +
        `(or the first subsection of "${topLabel}"), before any results. Then open "${first.label}" ` +
        'directly with a summary of the key findings, followed by the results.',
      severity: 'warning',
    })
  } else if (layout.setupAfterResults)
  {
    const setupEntry = layout.setup[0]
    comments.push({
      highlightText: headerLine(mergedTex, setupEntry),
      comment:
        `"${setupEntry.label}" comes after the results in "${first.label}". Move it before the ` +
        'results so readers know how the experiments were run before they read the numbers, and ' +
        `let "${first.label}" open directly with the summary of findings.`,
      severity: 'warning',
    })
  }

  return {
    layout,
    comments: comments
      .filter(c => c.highlightText)
      .map(c => ({ ...c, category: AGENT_ID, agentName: AGENT_NAME })),
  }
}

// Top-level titles named after the authors' own system: "Our Judge",
// "Our Approach", "My Method".
const POSSESSIVE_TITLE_RE = /^(our|my)\b/i

/**
 * Flag top-level main-text sections titled with "Our ..." and suggest the
 * standard names readers scan for (Methodology, Experimental Setup).
 */
export function checkSectionNames(paragraphMap, mergedTex)
{
  return paragraphMap
    .filter(s => !s.isAppendix && s.level === 1)
    .filter(s => POSSESSIVE_TITLE_RE.test(s.title.replace(/\\[a-zA-Z]+\*?/g, ' ').replace(/[{}]/g, ' ').trim()))
    .map(s => ({
      highlightText: headerLine(mergedTex, s),
      comment:
        `Use a standard section name instead of "${s.title}". Readers scan for "Methodology" (what the ` +
        `approach is) and "${SETUP_SECTION_NAME}" (datasets, models, baselines, metrics). The system's ` +
        'name can go in a subsection title under Methodology.',
      severity: 'suggestion',
      category: AGENT_ID,
      agentName: AGENT_NAME,
    }))
    .filter(c => c.highlightText)
}

// "Related Work", "Prior Work", "Background and Related Work", "Literature Review".
const RELATED_WORK_TITLE_RE = /\b(related|prior|previous) (work|research|literature)\b|\bliterature review\b/i

// Any citation command: \cite, \citep, \citet, \citealp, \parencite, \textcite, \autocite, ...
const CITE_RE = /\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\s*\[[^\]]*\])*\s*\{([^}]*)\}/g

// A sentence that positions the paper against the cited work.
const CONTRAST_RE = /\b(our|we|this (paper|work|study))\b/i

export const MIN_RELATED_WORK_PARAGRAPHS = 3
export const MIN_RELATED_WORK_CITATIONS = 10

/** The first line of a paragraph, verbatim, for anchoring a comment. */
function paragraphLine(mergedTex, p)
{
  const lineEnd = mergedTex.indexOf('\n', p.start)
  return mergedTex.slice(p.start, lineEnd === -1 || lineEnd > p.end ? p.end : lineEnd).trim()
}

/** Distinct citation keys in a paragraph's text. */
function citationKeys(text)
{
  const keys = new Set()
  for (const m of text.matchAll(CITE_RE))
  {
    for (const key of m[1].split(',')) if (key.trim()) keys.add(key.trim())
  }
  return keys
}

/**
 * Check the Related Work section against the lab's minimum: at least three
 * topic paragraphs, a substantial number of citations, a citation in every
 * paragraph, and each paragraph saying how this work differs from what it
 * cites. Subsections count as part of the section.
 */
export function checkRelatedWork(paragraphMap, mergedTex)
{
  const section = paragraphMap.find(s => !s.isAppendix && s.level === 1 && RELATED_WORK_TITLE_RE.test(s.title))
  if (!section) return []
  const paragraphs = paragraphMap
    .filter(s => s === section || s.label.startsWith(`${section.label} > `))
    .flatMap(s => s.paragraphs)

  const comments = []
  const header = headerLine(mergedTex, section)
  const allKeys = new Set(paragraphs.flatMap(p => [...citationKeys(p.text)]))
  if (paragraphs.length < MIN_RELATED_WORK_PARAGRAPHS)
  {
    comments.push({
      highlightText: header,
      comment:
        `"${section.title}" has ${paragraphs.length} paragraph(s). Write at least ${MIN_RELATED_WORK_PARAGRAPHS}, ` +
        'one per related research area (e.g. \\paragraph{Topic 1}, \\paragraph{Topic 2}, \\paragraph{Topic 3}), ' +
        'each tracing how the area developed and ending with how this work differs and what it adds.',
      severity: 'warning',
    })
  }
  if (allKeys.size < MIN_RELATED_WORK_CITATIONS)
  {
    comments.push({
      highlightText: header,
      comment:
        `"${section.title}" cites ${allKeys.size} distinct work(s). Related work should credit the field ` +
        `thoroughly: aim for at least ${MIN_RELATED_WORK_CITATIONS} citations, typically 5-10 relevant papers per ` +
        'topic paragraph, covering the traditional approaches, recent trends and the nearest neighbors of this work.',
      severity: 'warning',
    })
  }
  for (const p of paragraphs)
  {
    const highlightText = paragraphLine(mergedTex, p)
    if (citationKeys(p.text).size === 0)
    {
      comments.push({
        highlightText,
        comment:
          'This related-work paragraph cites nothing. Every claim about prior work needs a citation; ' +
          'name the specific papers (\\citet{...}) for the methods and trends described.',
        severity: 'warning',
      })
    } else if (!CONTRAST_RE.test(p.text))
    {
      comments.push({
        highlightText,
        comment:
          'This paragraph describes prior work but never says how this paper relates to it. End it with how ' +
          'our work differs from these works (assumptions, method or setting) and what it adds.',
        severity: 'suggestion',
      })
    }
  }
  return comments
    .filter(c => c.highlightText)
    .map(c => ({ ...c, category: 'related_work', agentName: AGENT_NAME }))
}

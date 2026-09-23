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

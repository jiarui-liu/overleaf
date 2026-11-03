/**
 * AiTutorStyleChecks.mjs
 *
 * Rule-based style checks on merged.tex. No LLM.
 *
 * - Emoji: papers should contain no emoji in the body, captions, tables or
 *   section titles.
 * - Affiliation order: affiliation superscripts are numbered 1, 2, 3, ... in
 *   the order they first appear in the author list.
 *
 * Each check returns comments in the pre-mapping shape the orchestrator's
 * structural checks use: { highlightText, comment, severity, category, agentName }.
 * highlightText is always a verbatim line of merged.tex so it maps back.
 */

export const EMOJI_AGENT_NAME = 'Emoji Check'
export const AFFILIATION_ORDER_AGENT_NAME = 'Affiliation Order Check'

// Pictographic characters, minus the ones that are ordinary typography
// (©, ®, ™, ‼, ⁉) rather than emoji.
const EMOJI_RE = /(?![©®™‼⁉])\p{Extended_Pictographic}/u

const MAX_EMOJI_COMMENTS = 5

/** The line containing `pos`, trimmed and at most 200 characters. */
function lineAt(text, pos)
{
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const end = text.indexOf('\n', pos)
  const line = text.slice(start, end === -1 ? text.length : end).trim()
  return line.length > 200 ? line.slice(0, 200) : line
}

/** Text before an unescaped % on the line (the line itself if there is none). */
function stripComment(line)
{
  const m = line.match(/(^|[^\\])%/)
  return m ? line.slice(0, m.index + m[1].length) : line
}

/**
 * Flag lines of the document body that contain emoji. One comment per line,
 * at most MAX_EMOJI_COMMENTS so a paper full of them isn't buried.
 */
export function checkEmoji(mergedTex)
{
  const begin = mergedTex.indexOf('\\begin{document}')
  const bodyStart = begin === -1 ? 0 : begin
  const comments = []
  let pos = bodyStart
  for (const rawLine of mergedTex.slice(bodyStart).split('\n'))
  {
    const lineStart = pos
    pos += rawLine.length + 1
    const m = stripComment(rawLine).match(EMOJI_RE)
    if (!m) continue
    comments.push({
      highlightText: lineAt(mergedTex, lineStart + m.index),
      comment:
        `This line contains an emoji (${m[0]}). Papers should not use emoji in the text, captions, ` +
        'tables or section titles. Use words instead, or a math symbol such as \\checkmark or \\times in tables.',
      severity: 'warning',
      category: 'writing_style',
      agentName: EMOJI_AGENT_NAME,
    })
    if (comments.length >= MAX_EMOJI_COMMENTS) break
  }
  return comments
}

// Numeric superscripts: \textsuperscript{1,2}, $^{1,*}$, $^1$, ^{2}.
const SUPERSCRIPT_RE = /\\textsuperscript\s*\{([^}]*)\}|\^\s*\{([^}]*)\}|\^\s*(\d)/g

/**
 * Check that affiliation superscripts in the front matter are numbered in
 * order of first appearance: the first author's affiliation is 1, the next
 * new affiliation is 2, and so on. `frontMatter` is the title/author block as
 * it appears in merged.tex (up to the abstract).
 *
 * Returns a comment, or null when the order is fine or there are fewer than
 * two numbered affiliations.
 */
export function checkAffiliationOrder(frontMatter)
{
  const seen = []
  let firstWrong = null
  for (const m of frontMatter.matchAll(SUPERSCRIPT_RE))
  {
    const lineStart = frontMatter.lastIndexOf('\n', m.index - 1) + 1
    if (/(^|[^\\])%/.test(frontMatter.slice(lineStart, m.index))) continue
    const marks = (m[1] ?? m[2] ?? m[3]).split(/[,\s]+/).filter(x => /^\d+$/.test(x)).map(Number)
    for (const n of marks)
    {
      if (seen.includes(n)) continue
      if (firstWrong === null && n !== seen.length + 1)
      {
        firstWrong = { expected: seen.length + 1, found: n, index: m.index }
      }
      seen.push(n)
    }
  }
  if (seen.length < 2 || !firstWrong) return null

  return {
    highlightText: lineAt(frontMatter, firstWrong.index),
    comment:
      `Affiliation numbers should follow the order they first appear in the author list (1, 2, 3, ...). ` +
      `Here affiliation ${firstWrong.found} appears where ${firstWrong.expected} is expected ` +
      `(order of first appearance: ${seen.join(', ')}). Renumber the affiliations so the first ` +
      'author\'s is 1 and each new one gets the next number.',
    severity: 'warning',
    category: 'front_matter',
    agentName: AFFILIATION_ORDER_AGENT_NAME,
  }
}

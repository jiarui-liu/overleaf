/**
 * test_apa_table_skill.mjs
 *
 * Unit tests for APA 7th edition table formatting skill integration.
 * Verifies skill file content, agent definitions, and table extraction.
 *
 * Run locally (no Docker needed):
 *   node app/src/Features/Chat/test_apa_table_skill.mjs
 *
 * Or inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_apa_table_skill.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.join(__dirname, 'ai-tutor-skills')
const ORCHESTRATOR_PATH = path.join(__dirname, 'AiTutorReviewOrchestrator.mjs')

let pass = 0
let fail = 0
const failures = []

function assert(cond, label) {
  if (cond) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    failures.push(label)
    console.log(`  FAIL ${label}`)
  }
}

async function group(name, fn) {
  console.log(`\n--- ${name} ---`)
  await fn()
}

// Read orchestrator source once for static analysis of agent definitions
const orchestratorSrc = fs.readFileSync(ORCHESTRATOR_PATH, 'utf-8')

/**
 * Extract skillFiles arrays from SUBAGENT_DEFS by agent id.
 * Parses the source text to avoid needing @ai-sdk/openai installed.
 */
function getAgentSkillFiles(agentId) {
  // Match the agent block: id: 'agentId' ... skillFiles: [ ... ]
  const re = new RegExp(
    `id:\\s*'${agentId}'[\\s\\S]*?skillFiles:\\s*\\[([^\\]]+)\\]`
  )
  const m = orchestratorSrc.match(re)
  if (!m) return []
  return m[1]
    .split('\n')
    .map(l => l.match(/'([^']+)'/)?.[1])
    .filter(Boolean)
}

function getAgentBlock(agentId) {
  // Find the block from this agent's id to the next agent's opening brace or the closing ]
  const startRe = new RegExp(`id:\\s*'${agentId}'`)
  const startMatch = startRe.exec(orchestratorSrc)
  if (!startMatch) return ''
  const startPos = startMatch.index
  // Find next agent block or end of SUBAGENT_DEFS array
  const rest = orchestratorSrc.slice(startPos)
  // Match until the next "  {" at indent level (next agent) or "]" (end of array)
  const endMatch = rest.match(/\n\s*\},\s*\n\s*\{|\n\s*\}\s*\n\s*\]/)
  const endPos = endMatch ? endMatch.index : rest.length
  return rest.slice(0, endPos)
}

// ---------------------------------------------------------------------------
// 1. Skill file content
// ---------------------------------------------------------------------------

await group('Skill file loads and has required APA content', () => {
  const skillPath = path.join(SKILLS_DIR, '05_figures_and_tables/table_formatting.md')
  assert(fs.existsSync(skillPath), 'table_formatting.md exists')

  const content = fs.readFileSync(skillPath, 'utf-8')
  assert(content.length > 500, `Skill file has substantial content (${content.length} chars)`)

  // APA sections
  assert(content.includes('## Table Number'), 'Has Table Number section')
  assert(content.includes('## Table Title'), 'Has Table Title section')
  assert(content.includes('## Column Headings'), 'Has Column Headings section')
  assert(content.includes('## Body Alignment'), 'Has Body Alignment section')
  assert(content.includes('## Table Notes'), 'Has Table Notes section')
  assert(content.includes('## Borders and Lines'), 'Has Borders and Lines section')
  assert(content.includes('## Placement and Cross-References'), 'Has Placement section')

  // Key APA rules
  assert(content.includes('\\textbf{Table 1}'), 'Has bold table number example')
  assert(content.includes('\\textit{'), 'Has italic title example')
  assert(content.toLowerCase().includes('title case'), 'Mentions title case requirement')
  assert(content.includes('stub heading'), 'Mentions stub heading requirement')
  assert(content.includes('threeparttable'), 'References threeparttable package')
  assert(content.includes('\\toprule'), 'Has booktabs toprule')
  assert(content.includes('\\midrule'), 'Has booktabs midrule')
  assert(content.includes('\\bottomrule'), 'Has booktabs bottomrule')
  assert(content.includes('hline'), 'Mentions hline prohibition')
  assert(content.includes('APA'), 'References APA style')

  // Flag-if patterns (actionable for LLM)
  assert(content.includes('Flag if'), 'Has actionable Flag-if patterns')
})

// ---------------------------------------------------------------------------
// 2. Agent definitions (parsed from source)
// ---------------------------------------------------------------------------

await group('Agent definitions load table_formatting.md', () => {
  const latexSkills = getAgentSkillFiles('latex_formatting')
  const figTabSkills = getAgentSkillFiles('figures_tables')

  assert(latexSkills.length > 0, 'latex_formatting agent has skill files')
  assert(figTabSkills.length > 0, 'figures_tables agent has skill files')

  assert(
    latexSkills.includes('05_figures_and_tables/table_formatting.md'),
    'latex_formatting agent loads table_formatting.md'
  )
  assert(
    figTabSkills.includes('05_figures_and_tables/table_formatting.md'),
    'figures_tables agent loads table_formatting.md'
  )

  // Verify figures_tables block mentions APA
  const figTabBlock = getAgentBlock('figures_tables')
  assert(
    figTabBlock.includes('APA'),
    'figures_tables systemPreamble references APA'
  )

  // Verify figures_tables also keeps its other skills
  assert(
    figTabSkills.includes('05_figures_and_tables/caption_writing.md'),
    'figures_tables agent still loads caption_writing.md'
  )
  assert(
    figTabSkills.includes('05_figures_and_tables/figure1_design.md'),
    'figures_tables agent still loads figure1_design.md'
  )
})

// ---------------------------------------------------------------------------
// 3. All skill files in both agents are loadable
// ---------------------------------------------------------------------------

await group('All skill files for table-related agents are readable', () => {
  const agents = [
    { id: 'latex_formatting', skills: getAgentSkillFiles('latex_formatting') },
    { id: 'figures_tables', skills: getAgentSkillFiles('figures_tables') },
  ]

  for (const agent of agents) {
    for (const skillFile of agent.skills) {
      const fullPath = path.join(SKILLS_DIR, skillFile)
      let content
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch (err) {
        // will fail assertion below
      }
      assert(
        content && content.length > 0,
        `${agent.id} → ${skillFile} is readable (${content ? content.length : 0} chars)`
      )
    }
  }
})

// ---------------------------------------------------------------------------
// 4. caption_writing.md has APA table/figure distinction
// ---------------------------------------------------------------------------

await group('caption_writing.md distinguishes table titles from figure captions', () => {
  const captionPath = path.join(SKILLS_DIR, '05_figures_and_tables/caption_writing.md')
  const content = fs.readFileSync(captionPath, 'utf-8')

  assert(
    content.includes('Table Titles vs. Figure Captions'),
    'caption_writing.md has table/figure distinction section'
  )
  assert(
    content.includes('table_formatting.md'),
    'caption_writing.md cross-references table_formatting.md'
  )
})

// ---------------------------------------------------------------------------
// 5. CONTENTS.md index is updated
// ---------------------------------------------------------------------------

await group('CONTENTS.md reflects updated table_formatting.md scope', () => {
  const contentsPath = path.join(SKILLS_DIR, 'CONTENTS.md')
  const content = fs.readFileSync(contentsPath, 'utf-8')

  const row = content.split('\n').find(l => l.includes('table_formatting.md'))
  assert(row != null, 'CONTENTS.md has table_formatting.md row')
  assert(row.includes('figures_tables'), 'CONTENTS.md lists figures_tables agent')
  assert(row.includes('latex_formatting'), 'CONTENTS.md lists latex_formatting agent')
  assert(row.includes('APA'), 'CONTENTS.md description mentions APA')
})

// ---------------------------------------------------------------------------
// 6. Regex-based APA violation detection patterns
// ---------------------------------------------------------------------------

await group('Regex-based APA violation detection helpers', () => {
  // Vertical bars in tabular spec
  const badSpec = '\\begin{tabular}{|l|c|c|}'
  assert(/\|/.test(badSpec.match(/\\begin\{tabular\}\{([^}]+)\}/)?.[1] || ''),
    'Detects vertical bars in column spec')

  const goodSpec = '\\begin{tabular}{lcc}'
  assert(!/\|/.test(goodSpec.match(/\\begin\{tabular\}\{([^}]+)\}/)?.[1] || ''),
    'Clean spec has no vertical bars')

  // \\hline detection
  const badHline = '\\hline\nMethod & Score \\\\\n\\hline'
  assert(/\\hline/.test(badHline), 'Detects \\hline usage')

  const goodRules = '\\toprule\nMethod & Score \\\\\n\\midrule'
  assert(!/\\hline/.test(goodRules), 'Booktabs rules have no \\hline')

  // Missing table number/title
  const noTitle = '\\begin{table}[t]\n\\begin{tabular}{lc}'
  assert(!/\\textbf\{Table\s+\d+\}/.test(noTitle), 'Detects missing bold table number')

  const withTitle = '\\textbf{Table 1}\\\\\n\\textit{Method Comparison}\n\\begin{table}[t]'
  assert(/\\textbf\{Table\s+\d+\}/.test(withTitle), 'Detects present bold table number')
  assert(/\\textit\{[^}]+\}/.test(withTitle), 'Detects present italic title')

  // Missing stub heading
  const noStub = '\\begin{tabular}{lcc}\n\\toprule\n & Metric A & Metric B \\\\'
  const firstDataRow = noStub.split('\\toprule')[1]?.trim().split('\n')[0] || ''
  assert(firstDataRow.trim().startsWith('&') || firstDataRow.trim().startsWith(' &'),
    'Detects empty stub heading (row starts with &)')
})

// ---------------------------------------------------------------------------
// 7. No duplicate skill file entries in any agent
// ---------------------------------------------------------------------------

await group('No duplicate skill file entries in agents', () => {
  for (const agentId of ['latex_formatting', 'figures_tables']) {
    const skills = getAgentSkillFiles(agentId)
    const unique = new Set(skills)
    assert(
      skills.length === unique.size,
      `${agentId} has no duplicate skill files (${skills.length} entries, ${unique.size} unique)`
    )
  }
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(50)}`)
console.log(`Total: ${pass + fail}  |  Passed: ${pass}  |  Failed: ${fail}`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
} else {
  console.log('All tests passed!')
}

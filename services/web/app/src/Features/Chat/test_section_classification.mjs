/**
 * test_section_classification.mjs
 *
 * Tests the multi-label section classification on all cached projects.
 * Run inside the Docker container:
 *   docker compose exec web node app/src/Features/Chat/test_section_classification.mjs
 *
 * Or run a single project:
 *   docker compose exec web node app/src/Features/Chat/test_section_classification.mjs 698adb3b7ad77d8594fae055
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  parseSections,
  classifyPaper,
  buildSectionMapping,
  SUBAGENT_DEFS,
} from './AiTutorReviewOrchestrator.mjs'
import { createOpenAI } from '@ai-sdk/openai'

const CACHE_DIR = '/var/lib/overleaf/ai-tutor-cache'
const MODEL = process.env.AI_TUTOR_TEST_MODEL || 'gpt-4.1-mini'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatChars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return `${n}`
}

function categoryPrettyName(cat) {
  return cat
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Create hybrid agent definitions for multi-category sections
 * (mirrors the logic in runFullReview)
 */
function buildHybridAgents(hybridSections, sectionMapping) {
  const hybridAgents = []

  if (!hybridSections || hybridSections.length === 0) return hybridAgents

  const combos = {}
  for (const hs of hybridSections) {
    const key = hs.categories.join('+')
    if (!combos[key]) {
      combos[key] = { categories: hs.categories, titles: [] }
    }
    combos[key].titles.push(hs.title)
  }

  for (const [comboKey, combo] of Object.entries(combos)) {
    const relevantDefs = SUBAGENT_DEFS.filter(
      d =>
        d.sectionCategories &&
        d.sectionCategories.some(c => combo.categories.includes(c))
    )

    const seenSkills = new Set()
    const mergedSkills = []
    for (const d of relevantDefs) {
      for (const sf of d.skillFiles) {
        if (!seenSkills.has(sf)) {
          seenSkills.add(sf)
          mergedSkills.push(sf)
        }
      }
    }

    const prettyName = combo.categories
      .map(c => categoryPrettyName(c))
      .join(' + ')

    // Add to sectionMapping under the combo key
    sectionMapping[comboKey] = combo.titles

    hybridAgents.push({
      id: `hybrid_${comboKey}`,
      name: `${prettyName} Reviewer (hybrid)`,
      skillFiles: mergedSkills,
      sectionCategories: [comboKey],
      categories: combo.categories,
      titles: combo.titles,
    })
  }

  return hybridAgents
}

/**
 * Collect section content for given titles (simplified version)
 */
function collectSectionContent(sections, titleList) {
  if (!titleList || titleList.length === 0) return ''
  const lowerTitles = new Set(titleList.map(t => t.toLowerCase().trim()))
  const matched = sections.filter(s =>
    lowerTitles.has(s.title.toLowerCase().trim())
  )
  return matched.map(s => s.content).join('\n\n')
}

// ---------------------------------------------------------------------------
// Main test function for a single project
// ---------------------------------------------------------------------------

async function testProject(projectId, openai) {
  const cacheDir = path.join(CACHE_DIR, projectId)

  // Read metadata
  const metaPath = path.join(cacheDir, 'metadata.json')
  if (!fs.existsSync(metaPath)) {
    console.log(`  [SKIP] No metadata.json found`)
    return null
  }
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

  // Read merged.tex
  const mergedPath = path.join(cacheDir, 'merged.tex')
  if (!fs.existsSync(mergedPath)) {
    console.log(`  [SKIP] No merged.tex found`)
    return null
  }
  const mergedTex = fs.readFileSync(mergedPath, 'utf-8')

  console.log(`\n${'='.repeat(80)}`)
  console.log(`Project: ${metadata.projectName}`)
  console.log(`ID: ${projectId}`)
  console.log(`merged.tex: ${formatChars(mergedTex.length)} chars`)
  console.log(`${'='.repeat(80)}`)

  // Phase 0: Parse sections
  const sections = parseSections(mergedTex)
  console.log(`\nPhase 0: Parsed ${sections.length} sections`)
  for (const sec of sections) {
    const indent = '  '.repeat(sec.level)
    console.log(
      `  L${sec.level} ${indent}${sec.title} (${formatChars(sec.content.length)} chars)`
    )
  }

  // Phase 1: Classify
  console.log(`\nPhase 1: Classifying with ${MODEL}...`)
  const startTime = Date.now()
  let classification
  try {
    classification = await classifyPaper(openai, MODEL, sections)
  } catch (err) {
    console.error(`  [ERROR] Classification failed: ${err.message}`)
    return null
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`  Done in ${elapsed}s — Paper type: ${classification.paperType}`)

  // Build hybrid agents
  const hybridAgents = buildHybridAgents(
    classification.hybridSections,
    classification.sectionMapping
  )

  // Print section assignments table
  console.log(`\n### Section Assignments`)
  console.log(
    `${'Level'.padEnd(7)}${'Section Title'.padEnd(60)}${'Chars'.padEnd(8)}Categories`
  )
  console.log('-'.repeat(110))

  // Reconstruct per-section assignments from the mapping
  const sectionCatMap = {} // title → categories[]
  for (const [cat, titles] of Object.entries(classification.sectionMapping)) {
    for (const title of titles) {
      if (!sectionCatMap[title]) sectionCatMap[title] = []
      if (!sectionCatMap[title].includes(cat)) {
        sectionCatMap[title].push(cat)
      }
    }
  }
  // Add hybrid sections
  for (const hs of classification.hybridSections || []) {
    sectionCatMap[hs.title] = hs.categories
  }

  for (const sec of sections) {
    if (sec.level > 2) continue // only show level 0-2
    const indent = sec.level === 0 ? '' : sec.level === 1 ? '' : '  '
    const cats = sectionCatMap[sec.title] || ['(unassigned)']
    const catStr =
      cats.length === 1
        ? cats[0]
        : `[${cats.join(' + ')}] (HYBRID)`
    console.log(
      `L${sec.level}     ${(indent + sec.title).padEnd(60)}${formatChars(sec.content.length).padEnd(8)}${catStr}`
    )
  }

  // Print agent input summary
  console.log(`\n### Agent Input Summary`)
  console.log(
    `${'Agent'.padEnd(45)}${'Sections'.padEnd(8)}${'Chars'.padEnd(10)}Sections Received`
  )
  console.log('-'.repeat(110))

  // Regular section-specific agents
  const allAgents = [
    ...SUBAGENT_DEFS.filter(d => d.sectionCategories !== null),
    ...hybridAgents,
  ]

  let totalAssigned = 0
  for (const agent of allAgents) {
    const agentCats = agent.sectionCategories
    let titles = []
    for (const cat of agentCats) {
      titles.push(...(classification.sectionMapping[cat] || []))
    }
    // Deduplicate
    titles = [...new Set(titles)]
    const text = collectSectionContent(sections, titles)
    if (titles.length === 0) continue

    const isHybrid = agent.id.startsWith('hybrid_')
    const agentLabel = isHybrid ? `${agent.name}` : agent.name

    console.log(
      `${agentLabel.padEnd(45)}${String(titles.length).padEnd(8)}${formatChars(text.length).padEnd(10)}${titles.join(', ')}`
    )
    totalAssigned += titles.length
  }

  // Full-doc agents
  for (const agent of SUBAGENT_DEFS.filter(
    d => d.sectionCategories === null
  )) {
    console.log(
      `${agent.name.padEnd(45)}${'--'.padEnd(8)}${formatChars(mergedTex.length).padEnd(10)}(full document)`
    )
  }

  // Stats
  const hybridCount = (classification.hybridSections || []).length
  const singleCount = sections.filter(s => s.level <= 2).length - hybridCount
  console.log(
    `\n  Stats: ${singleCount} single-category sections, ${hybridCount} hybrid sections, ${hybridAgents.length} hybrid agent(s)`
  )

  return {
    projectId,
    projectName: metadata.projectName,
    paperType: classification.paperType,
    totalSections: sections.filter(s => s.level <= 2).length,
    hybridSections: hybridCount,
    hybridAgents: hybridAgents.length,
    elapsed,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set')
    process.exit(1)
  }

  const openai = createOpenAI({ apiKey })

  // Get project IDs: from args or all cached
  const args = process.argv.slice(2)
  let projectIds
  if (args.length > 0) {
    projectIds = args
  } else {
    projectIds = fs
      .readdirSync(CACHE_DIR)
      .filter(f =>
        fs.existsSync(path.join(CACHE_DIR, f, 'merged.tex'))
      )
      .sort()
  }

  console.log(`\nTesting section classification on ${projectIds.length} project(s)`)
  console.log(`Model: ${MODEL}`)
  console.log(`Cache: ${CACHE_DIR}`)

  const results = []
  for (const pid of projectIds) {
    try {
      const result = await testProject(pid, openai)
      if (result) results.push(result)
    } catch (err) {
      console.error(`\n[ERROR] Project ${pid}: ${err.message}`)
      console.error(err.stack)
    }
  }

  // Final summary
  if (results.length > 1) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`SUMMARY: ${results.length} projects tested`)
    console.log(`${'='.repeat(80)}`)
    console.log(
      `${'Project'.padEnd(50)}${'Type'.padEnd(25)}${'Sections'.padEnd(10)}${'Hybrid'.padEnd(8)}Time`
    )
    console.log('-'.repeat(100))
    for (const r of results) {
      console.log(
        `${r.projectName.slice(0, 48).padEnd(50)}${r.paperType.padEnd(25)}${String(r.totalSections).padEnd(10)}${String(r.hybridSections).padEnd(8)}${r.elapsed}s`
      )
    }
    const totalHybrid = results.reduce((s, r) => s + r.hybridSections, 0)
    const totalSections = results.reduce((s, r) => s + r.totalSections, 0)
    console.log(
      `\nTotal: ${totalSections} sections across ${results.length} papers, ${totalHybrid} hybrid sections`
    )
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

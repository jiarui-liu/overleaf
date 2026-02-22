/**
 * test_comment_dedup.mjs
 *
 * Tests comment deduplication on all existing review results in cache.
 * No API calls — purely operates on cached review_comments.json + merged.tex.
 *
 * Run inside Docker:
 *   docker compose exec web node app/src/Features/Chat/test_comment_dedup.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const CACHE_DIR = process.env.CACHE_DIR || '/home/ubuntu/overleaf/develop/ai-tutor-cache'

// ---------------------------------------------------------------------------
// Inline the dedup helpers (same logic as AiTutorReviewOrchestrator.mjs)
// ---------------------------------------------------------------------------

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim()
}

function diceCoefficient(a, b) {
  if (a === b) return 1.0
  if (a.length < 2 || b.length < 2) return 0.0
  const bigramsA = new Map()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1)
  }
  const bigramsB = new Map()
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    bigramsB.set(bg, (bigramsB.get(bg) || 0) + 1)
  }
  let intersection = 0
  for (const [bg, countA] of bigramsA) {
    intersection += Math.min(countA, bigramsB.get(bg) || 0)
  }
  return (2.0 * intersection) / ((a.length - 1) + (b.length - 1))
}

const SEVERITY_RANK = { critical: 3, warning: 2, suggestion: 1 }

function findOverlappingPairs(comments, mergedTex) {
  // Find positions
  const positioned = comments.map((c, idx) => {
    const pos = mergedTex.indexOf(c.highlightText)
    return {
      comment: c,
      idx,
      start: pos,
      end: pos >= 0 ? pos + c.highlightText.length : -1,
    }
  })

  const pairs = []

  for (let i = 0; i < positioned.length; i++) {
    if (positioned[i].start < 0) continue
    for (let j = i + 1; j < positioned.length; j++) {
      if (positioned[j].start < 0) continue

      const a = positioned[i]
      const b = positioned[j]
      const overlapStart = Math.max(a.start, b.start)
      const overlapEnd = Math.min(a.end, b.end)

      if (overlapStart >= overlapEnd) continue

      const overlapLen = overlapEnd - overlapStart
      const shorterLen = Math.min(a.end - a.start, b.end - b.start)
      const overlapRatio = overlapLen / shorterLen

      if (overlapRatio < 0.5) continue

      // Strip the [AI Tutor] prefix for cleaner comparison
      const commentA = a.comment.comment.replace(/^\[AI Tutor\]\s*\[\w+\]\s*\[[^\]]+\]\s*/, '')
      const commentB = b.comment.comment.replace(/^\[AI Tutor\]\s*\[\w+\]\s*\[[^\]]+\]\s*/, '')

      const commentSim = diceCoefficient(
        normalizeWhitespace(commentA.toLowerCase()),
        normalizeWhitespace(commentB.toLowerCase())
      )

      pairs.push({
        a: a.comment,
        b: b.comment,
        overlapRatio,
        commentSim,
        wouldRemove: commentSim >= 0.4,
        highlightOverlap: mergedTex.slice(overlapStart, overlapEnd).slice(0, 80),
      })
    }
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const projectIds = fs.readdirSync(CACHE_DIR).filter(f => {
    return fs.existsSync(path.join(CACHE_DIR, f, 'review_comments.json')) &&
           fs.existsSync(path.join(CACHE_DIR, f, 'merged.tex'))
  }).sort()

  console.log(`Testing comment deduplication on ${projectIds.length} projects\n`)

  let grandTotalComments = 0
  let grandTotalOverlaps = 0
  let grandTotalWouldRemove = 0
  const projectSummaries = []

  for (const pid of projectIds) {
    const cacheDir = path.join(CACHE_DIR, pid)
    const review = JSON.parse(fs.readFileSync(path.join(cacheDir, 'review_comments.json'), 'utf-8'))
    const mergedTex = fs.readFileSync(path.join(cacheDir, 'merged.tex'), 'utf-8')

    // Get project name from metadata
    let projectName = pid
    const metaPath = path.join(cacheDir, 'metadata.json')
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      projectName = meta.projectName || pid
    }

    // Flatten all comments from all docs
    const allComments = []
    for (const [docPath, comments] of Object.entries(review.commentsByDoc)) {
      for (const c of comments) {
        allComments.push(c)
      }
    }

    const pairs = findOverlappingPairs(allComments, mergedTex)
    const wouldRemove = pairs.filter(p => p.wouldRemove)

    grandTotalComments += allComments.length
    grandTotalOverlaps += pairs.length
    grandTotalWouldRemove += wouldRemove.length

    projectSummaries.push({
      name: projectName,
      total: allComments.length,
      overlaps: pairs.length,
      wouldRemove: wouldRemove.length,
    })

    if (pairs.length === 0) {
      console.log(`## ${projectName}`)
      console.log(`   ${allComments.length} comments, 0 overlapping pairs\n`)
      continue
    }

    console.log(`## ${projectName}`)
    console.log(`   ${allComments.length} comments, ${pairs.length} overlapping pair(s), ${wouldRemove.length} would be removed\n`)

    for (const p of pairs) {
      const action = p.wouldRemove ? 'REMOVE' : 'KEEP (different concerns)'
      console.log(`   [${action}] overlap=${(p.overlapRatio * 100).toFixed(0)}% commentSim=${(p.commentSim * 100).toFixed(0)}%`)
      console.log(`     A: [${p.a.agentName}] [${p.a.severity}] "${p.a.highlightText.slice(0, 70)}..."`)
      console.log(`        ${p.a.comment.slice(0, 120)}...`)
      console.log(`     B: [${p.b.agentName}] [${p.b.severity}] "${p.b.highlightText.slice(0, 70)}..."`)
      console.log(`        ${p.b.comment.slice(0, 120)}...`)
      console.log()
    }
  }

  // Summary table
  console.log('='.repeat(100))
  console.log('SUMMARY')
  console.log('='.repeat(100))
  console.log(
    `${'Project'.padEnd(55)}${'Comments'.padEnd(10)}${'Overlaps'.padEnd(10)}Removed`
  )
  console.log('-'.repeat(85))
  for (const s of projectSummaries) {
    console.log(
      `${s.name.slice(0, 53).padEnd(55)}${String(s.total).padEnd(10)}${String(s.overlaps).padEnd(10)}${s.wouldRemove}`
    )
  }
  console.log('-'.repeat(85))
  console.log(
    `${'TOTAL'.padEnd(55)}${String(grandTotalComments).padEnd(10)}${String(grandTotalOverlaps).padEnd(10)}${grandTotalWouldRemove}`
  )
  console.log(
    `\nDedup would remove ${grandTotalWouldRemove}/${grandTotalComments} comments ` +
    `(${(grandTotalWouldRemove / grandTotalComments * 100).toFixed(1)}%)`
  )
}

main()

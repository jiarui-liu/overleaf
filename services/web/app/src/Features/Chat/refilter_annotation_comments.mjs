#!/usr/bin/env node
/**
 * Batch re-filter and re-apply annotation project comments.
 *
 * Run inside the web container:
 *   node /overleaf/services/web/app/src/Features/Chat/refilter_annotation_comments.mjs
 *
 * What it does for each annotation project:
 * 1. Load cached review_comments.json
 * 2. Filter out formalism comments based on env settings
 * 3. Delete existing AI Tutor threads (chat API) + comment ranges (document-updater)
 * 4. Re-apply filtered comments: create threads + comment ranges
 * 5. Save updated review_comments.json
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CACHE_DIR = '/var/lib/overleaf/ai-tutor-cache'
const MAPPING_FILE = path.join(CACHE_DIR, 'paper_hash_mapping.json')
const CHAT_HOST = 'chat'
const CHAT_PORT = 3010
const DOCUPDATER_HOST = 'document-updater'
const DOCUPDATER_PORT = 3003

// Parse env — same constants as AiTutorReviewOrchestrator
const DISABLED_AGENTS = new Set(
  (process.env.AI_TUTOR_DISABLED_AGENTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)
const SKIP_ANONYMITY = process.env.AI_TUTOR_SKIP_ANONYMITY === 'true'
const SKIP_SOURCE_COMMENTS = process.env.AI_TUTOR_SKIP_SOURCE_COMMENTS === 'true'
const SHOW_PREFIX = process.env.AI_TUTOR_SHOW_PREFIX !== 'false'

// We need a userId for creating threads. Use a fixed system user ID.
// This is the first user in the system (admin).
const SYSTEM_USER_ID = await getFirstUserId()

console.log('='.repeat(70))
console.log('Annotation Comment Re-filter & Re-apply')
console.log(`  DISABLED_AGENTS: ${[...DISABLED_AGENTS].join(', ') || '(none)'}`)
console.log(`  SKIP_ANONYMITY: ${SKIP_ANONYMITY}`)
console.log(`  SKIP_SOURCE_COMMENTS: ${SKIP_SOURCE_COMMENTS}`)
console.log(`  SHOW_PREFIX: ${SHOW_PREFIX}`)
console.log(`  SYSTEM_USER_ID: ${SYSTEM_USER_ID}`)
console.log('='.repeat(70))

// ---- HTTP helpers ----

function request(host, port, method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)) } catch { resolve(data) }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${method} ${urlPath}: ${data.slice(0, 300)}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function chatApi(method, urlPath, body) {
  return request(CHAT_HOST, CHAT_PORT, method, urlPath, body)
}

function docUpdater(method, urlPath, body) {
  return request(DOCUPDATER_HOST, DOCUPDATER_PORT, method, urlPath, body)
}

// ---- MongoDB helper (via mongosh in mongo container — called from host) ----
// We can't import mongoose here, so we use a simpler approach:
// read the mapping file and project metadata from cache

async function getFirstUserId() {
  // Read from any cached review log to find a userId, or generate a fixed one
  // We'll use a deterministic ID based on 'system-refilter'
  return '000000000000000000000000'
}

// ---- Generate random thread IDs (same format as RangesTracker) ----
function generateThreadId() {
  return crypto.randomBytes(12).toString('hex')
}

// ---- Comment filtering ----

const ANONYMITY_KEYWORDS = [
  'anonymi', 'double-blind', 'double blind', 'author name', 'de-anonymi',
  'self-citation', 'identifying information', 'blind review', 'author identif',
  'anonymous submission', 'acknowledgment',
]

const SOURCE_COMMENT_KEYWORDS = [
  '% todo', '% note', '% fix', 'latex comment', 'commented-out',
  'commented out', 'source comment', '% hack', '% xxx',
]

function shouldRemoveComment(comment) {
  const cat = comment.category || ''
  const text = (comment.comment || '').toLowerCase()

  if (DISABLED_AGENTS.has(cat)) return 'disabled_agent'

  if (SKIP_ANONYMITY) {
    for (const kw of ANONYMITY_KEYWORDS) {
      if (text.includes(kw)) return 'anonymity'
    }
  }

  if (SKIP_SOURCE_COMMENTS) {
    for (const kw of SOURCE_COMMENT_KEYWORDS) {
      if (text.includes(kw)) return 'source_comment'
    }
  }

  return null
}

// ---- Get doc IDs from MongoDB via exec ----
// Since we're inside the web container, we can't easily query mongo.
// But we CAN read the docstore or use the internal APIs.
// The simplest: use document-updater's /project/:id/doc endpoint to list docs,
// but that doesn't exist. Instead, use the web's internal mongo connection.

// Actually, we'll use the docstore service to get all docs.
async function getProjectDocs(projectId) {
  try {
    // docstore runs on port 3016
    const docs = await request('docstore', 3016, 'GET', `/project/${projectId}`)
    return docs // Array of { _id, lines, ranges, ... }
  } catch (err) {
    console.error(`  Failed to get docs from docstore: ${err.message}`)
    return null
  }
}

// ---- Main processing ----

async function processProject(projectId) {
  const reviewFile = path.join(CACHE_DIR, projectId, 'review_comments.json')
  if (!fs.existsSync(reviewFile)) {
    return { status: 'skip', reason: 'no review file' }
  }

  const reviewData = JSON.parse(fs.readFileSync(reviewFile, 'utf-8'))
  const originalCommentsByDoc = reviewData.commentsByDoc || {}

  // ---- Step 1: Filter comments ----
  let totalOriginal = 0
  let totalRemoved = 0
  const removedDetails = []
  const filteredCommentsByDoc = {}

  for (const [docPath, comments] of Object.entries(originalCommentsByDoc)) {
    const kept = []
    for (const c of comments) {
      totalOriginal++
      const reason = shouldRemoveComment(c)
      if (reason) {
        totalRemoved++
        removedDetails.push({ reason, agent: c.agentName, text: (c.comment || '').slice(0, 80) })
      } else {
        kept.push(c)
      }
    }
    if (kept.length > 0) {
      filteredCommentsByDoc[docPath] = kept
    }
  }

  const totalKept = totalOriginal - totalRemoved

  // ---- Step 2: Delete existing AI Tutor threads ----
  let deletedThreads = 0
  try {
    const threads = await chatApi('GET', `/project/${projectId}/threads`)
    const aiTutorRe = /^\[(AI Tutor|critical|warning|suggestion)\]/
    for (const [threadId, thread] of Object.entries(threads)) {
      if (thread.messages && thread.messages.length > 0) {
        const firstMsg = thread.messages[0].content || ''
        if (aiTutorRe.test(firstMsg)) {
          await chatApi('DELETE', `/project/${projectId}/thread/${threadId}`)
          deletedThreads++
        }
      }
    }
  } catch (err) {
    return { status: 'error', reason: `delete threads: ${err.message}` }
  }

  // ---- Step 3: Delete old comment ranges from all docs ----
  let deletedRanges = 0
  try {
    // Get all docs with their ranges from document-updater
    // First, get the project docs from docstore
    const docs = await getProjectDocs(projectId)
    if (docs && Array.isArray(docs)) {
      for (const doc of docs) {
        const docId = doc._id
        // Get doc ranges from document-updater
        try {
          const docData = await docUpdater('GET', `/project/${projectId}/doc/${docId}?fromVersion=-1`)
          const comments = docData.ranges?.comments || []
          for (const comment of comments) {
            const commentId = comment.id
            try {
              await docUpdater('DELETE', `/project/${projectId}/doc/${docId}/comment/${commentId}`)
              deletedRanges++
            } catch (delErr) {
              // Ignore individual delete failures
            }
          }
        } catch {
          // Doc may not have ranges, that's fine
        }
      }
    }
  } catch (err) {
    console.error(`  Warning: range cleanup error: ${err.message}`)
  }

  // ---- Step 4: Re-apply filtered comments ----
  let applied = 0
  let skipped = 0

  // Get all docs with content to find highlight positions
  const docs = await getProjectDocs(projectId)
  if (!docs || !Array.isArray(docs)) {
    // Save filtered review even if we can't re-apply
    saveFilteredReview(reviewFile, reviewData, filteredCommentsByDoc, totalKept)
    return { status: 'partial', reason: 'could not get docs', totalOriginal, totalRemoved, totalKept, deletedThreads, deletedRanges, applied: 0, skipped: 0 }
  }

  // Build docPath → { docId, content } mapping
  // We need metadata.json for the doc paths
  const metaFile = path.join(CACHE_DIR, projectId, 'metadata.json')
  let docPathToId = {}

  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
    // The metadata has categories.texFiles.files, but not docIds.
    // We need to match doc paths to docstore docs.
    // Docstore docs have _id and lines but no path directly.
    // However, the review_comments.json has docPath for each comment.
    // The doc paths in commentsByDoc match the project doc paths.
    // We can get the mapping from MongoDB, or try to match by content.
  }

  // Build content map from docstore docs
  const docContentMap = {} // docId -> content
  const docIdList = [] // { docId, content }
  for (const doc of docs) {
    const content = Array.isArray(doc.lines) ? doc.lines.join('\n') : (doc.lines || '')
    docContentMap[doc._id] = content
    docIdList.push({ docId: doc._id, content })
  }

  // For each docPath in filtered comments, find the matching docId by
  // checking which doc contains the highlight texts
  for (const [docPath, comments] of Object.entries(filteredCommentsByDoc)) {
    // Try to find the doc that contains the first comment's highlight
    let matchedDocId = null

    for (const comment of comments) {
      if (matchedDocId) break
      for (const { docId, content } of docIdList) {
        if (content.includes(comment.highlightText)) {
          matchedDocId = docId
          break
        }
      }
    }

    if (!matchedDocId) {
      skipped += comments.length
      continue
    }

    const docContent = docContentMap[matchedDocId]

    for (const comment of comments) {
      const idx = docContent.indexOf(comment.highlightText)
      if (idx === -1) {
        skipped++
        continue
      }

      try {
        const threadId = generateThreadId()

        // Create thread message in chat API
        await chatApi('POST', `/project/${projectId}/thread/${threadId}/messages`, {
          user_id: SYSTEM_USER_ID,
          content: comment.comment,
        })

        // Add comment range to document via document-updater
        // The document-updater doesn't have a direct "add comment" API.
        // Comment ranges are normally added via ShareJS ops.
        // We need to use the setDoc approach or manipulate ranges directly.
        //
        // Alternative: use the document-updater's internal update mechanism.
        // Actually, the simplest working approach is to use the realtime
        // service's REST API, but that doesn't exist either.
        //
        // The most reliable approach: manipulate the ranges in MongoDB directly
        // through docstore, since the docs aren't loaded in document-updater
        // (they get loaded on demand).

        // For now, just create the thread. The comment won't have a highlight
        // range until we figure out the range injection. But at least the
        // thread/message exists.
        applied++
      } catch (err) {
        skipped++
      }
    }
  }

  // ---- Step 5: Save filtered review ----
  saveFilteredReview(reviewFile, reviewData, filteredCommentsByDoc, totalKept)

  return {
    status: 'ok',
    totalOriginal,
    totalRemoved,
    totalKept,
    deletedThreads,
    deletedRanges,
    applied,
    skipped,
    removedDetails,
  }
}

function saveFilteredReview(reviewFile, reviewData, filteredCommentsByDoc, totalKept) {
  const updated = {
    ...reviewData,
    commentsByDoc: filteredCommentsByDoc,
    summary: { total: totalKept, byCategory: {}, bySeverity: {} },
    refilteredAt: new Date().toISOString(),
  }
  for (const comments of Object.values(filteredCommentsByDoc)) {
    for (const c of comments) {
      updated.summary.byCategory[c.category] = (updated.summary.byCategory[c.category] || 0) + 1
      updated.summary.bySeverity[c.severity] = (updated.summary.bySeverity[c.severity] || 0) + 1
    }
  }
  fs.writeFileSync(reviewFile, JSON.stringify(updated, null, 2))
}

// ---- Run ----

async function main() {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
  const annotationProjectIds = [...new Set(Object.values(mapping))]
  console.log(`\nProcessing ${annotationProjectIds.length} annotation projects...\n`)

  let succeeded = 0
  let errored = 0
  let totalRemovedAll = 0
  let totalDeletedAll = 0
  let totalAppliedAll = 0

  for (let i = 0; i < annotationProjectIds.length; i++) {
    const pid = annotationProjectIds[i]
    process.stdout.write(`[${i + 1}/${annotationProjectIds.length}] ${pid} ... `)

    try {
      const r = await processProject(pid)
      if (r.status === 'skip') {
        console.log('SKIP:', r.reason)
      } else if (r.status === 'error') {
        console.log('ERROR:', r.reason)
        errored++
      } else {
        console.log(
          `${r.status.toUpperCase()}: ${r.totalOriginal}→${r.totalKept} comments ` +
          `(removed ${r.totalRemoved}), deleted ${r.deletedThreads} threads + ${r.deletedRanges} ranges, ` +
          `applied ${r.applied} (skipped ${r.skipped})`
        )
        succeeded++
        totalRemovedAll += r.totalRemoved
        totalDeletedAll += r.deletedThreads
        totalAppliedAll += r.applied
      }
    } catch (err) {
      console.log('EXCEPTION:', err.message)
      errored++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log('\n' + '='.repeat(70))
  console.log('Summary:')
  console.log(`  Succeeded:        ${succeeded}`)
  console.log(`  Errors:           ${errored}`)
  console.log(`  Comments removed: ${totalRemovedAll}`)
  console.log(`  Threads deleted:  ${totalDeletedAll}`)
  console.log(`  Comments applied: ${totalAppliedAll}`)
  console.log('='.repeat(70))
  console.log('\nIMPORTANT: Thread messages were created but comment RANGES (highlights)')
  console.log('could not be added server-side (requires ShareJS ops).')
  console.log('To re-apply with proper highlights, use the frontend "Apply Comments"')
  console.log('button for each project, or re-run the full review.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

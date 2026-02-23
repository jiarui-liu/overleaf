// Batch script: generate AI review comments for all annotation projects
// and apply them as comment threads visible in the Overleaf editor.
//
// Usage (copy into container, then run):
//   docker compose cp services/web/scripts/generate_annotation_comments.mjs web:/overleaf/services/web/scripts/
//   docker compose exec web node scripts/generate_annotation_comments.mjs [--admin-email=jiaruiliu999@gmail.com] [--model=gpt-4.1-2025-04-14] [--concurrency=2] [--skip-existing] [--project-id=XXXX]
//
// Options:
//   --admin-email   Owner email for the annotation projects (default: jiaruiliu999@gmail.com)
//   --model         OpenAI model to use for review generation (default: gpt-4.1-2025-04-14)
//   --concurrency   How many projects to process in parallel (default: 1)
//   --skip-existing Skip projects that already have review_comments.json in cache
//   --project-id    Process only this specific project (for testing/retry)

import fs from 'node:fs'
import path from 'node:path'
import parseArgs from 'minimist'
import { User } from '../app/src/models/User.mjs'
import ProjectEntityHandler from '../app/src/Features/Project/ProjectEntityHandler.mjs'
import ProjectGetter from '../app/src/Features/Project/ProjectGetter.mjs'
import DocumentHelper from '../app/src/Features/Documents/DocumentHelper.mjs'
import { runFullReview } from '../app/src/Features/Chat/AiTutorReviewOrchestrator.mjs'
import { db, ObjectId, waitForDb } from '../app/src/infrastructure/mongodb.mjs'

const argv = parseArgs(process.argv.slice(2), {
  string: ['admin-email', 'model', 'concurrency', 'project-id'],
  boolean: ['skip-existing'],
})

const ADMIN_EMAIL = argv['admin-email'] || 'jiaruiliu999@gmail.com'
const MODEL = argv.model || 'gpt-4.1-2025-04-14'
const VENUE = 'arxiv'
const CONCURRENCY = parseInt(argv.concurrency || '1', 10)
const SKIP_EXISTING = argv['skip-existing'] || false
const SINGLE_PROJECT_ID = argv['project-id'] || null
const CACHE_DIR = '/var/lib/overleaf/ai-tutor-cache'
const MAPPING_FILE = path.join(CACHE_DIR, 'paper_hash_mapping.json')

// Internal service URLs (within Docker network)
const CHAT_URL = `http://${process.env.CHAT_HOST || '127.0.0.1'}:3010`
const DOC_UPDATER_URL = `http://${process.env.DOCUMENT_UPDATER_HOST || '127.0.0.1'}:3003`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadMapping() {
  try {
    const data = fs.readFileSync(MAPPING_FILE, 'utf-8')
    return JSON.parse(data) // { paperHash: projectId }
  } catch {
    return {}
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Phase A: Generate comments via the orchestrator
// ---------------------------------------------------------------------------

async function generateComments(projectId, adminId) {
  const cacheDir = path.join(CACHE_DIR, projectId)

  // Get project data
  const allDocs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootDoc_id: 1,
    name: 1,
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  // Find root doc
  let rootDocPath = null
  if (project.rootDoc_id) {
    for (const [docPath, docData] of Object.entries(allDocs)) {
      if (docData._id.toString() === project.rootDoc_id.toString()) {
        rootDocPath = docPath
        break
      }
    }
  }
  if (!rootDocPath) {
    for (const [docPath, docData] of Object.entries(allDocs)) {
      if (docPath.endsWith('.tex') && docData.lines) {
        const content = Array.isArray(docData.lines)
          ? docData.lines.join('\n')
          : docData.lines
        if (DocumentHelper.contentHasDocumentclass(content)) {
          rootDocPath = docPath
          break
        }
      }
    }
  }
  if (!rootDocPath) {
    throw new Error(`No root .tex file found for project ${projectId}`)
  }

  // Build docContentMap
  const docContentMap = {}
  for (const [docPath, docData] of Object.entries(allDocs)) {
    const normalized = docPath.startsWith('/') ? docPath.slice(1) : docPath
    const content = Array.isArray(docData.lines)
      ? docData.lines.join('\n')
      : docData.lines || ''
    docContentMap[normalized] = content
  }

  const normalizedRootPath = rootDocPath.startsWith('/')
    ? rootDocPath.slice(1)
    : rootDocPath

  // Inline-expand merged.tex (same logic as reviewWholeProject)
  const texFilesOrdered = []
  const visitedFiles = new Set()
  const referencedFigures = new Set()
  const referencedBibFiles = new Set()
  const referencedPackages = new Set()

  function resolveDocPath(filePath) {
    if (docContentMap[filePath] !== undefined) return filePath
    if (docContentMap[filePath + '.tex'] !== undefined) return filePath + '.tex'
    return null
  }

  function extractReferences(content) {
    let match
    const graphicsRe = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = graphicsRe.exec(content)) !== null) referencedFigures.add(match[1].trim())
    const bibRe = /\\(?:bibliography|addbibresource)\{([^}]+)\}/g
    while ((match = bibRe.exec(content)) !== null) {
      for (const b of match[1].split(',')) referencedBibFiles.add(b.trim())
    }
    const pkgRe = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = pkgRe.exec(content)) !== null) {
      for (const p of match[1].split(',')) referencedPackages.add(p.trim())
    }
    const clsRe = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = clsRe.exec(content)) !== null) referencedPackages.add(match[1].trim())
  }

  function inlineExpand(filePath, basePath) {
    let resolvedPath = filePath
    if (basePath && !filePath.startsWith('/')) {
      const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/'))
        : ''
      resolvedPath = baseDir ? baseDir + '/' + filePath : filePath
    }
    let actualPath = resolveDocPath(resolvedPath)
    if (!actualPath && resolvedPath !== filePath) {
      actualPath = resolveDocPath(filePath)
    }
    if (!actualPath || visitedFiles.has(actualPath)) {
      return `% [AI Tutor] Could not inline: ${filePath} (${!actualPath ? 'not found' : 'already included'})`
    }
    visitedFiles.add(actualPath)
    texFilesOrdered.push(actualPath)
    const content = docContentMap[actualPath]
    if (!content) return ''
    extractReferences(content)
    return content.replace(
      /\\(?:input|include)\{([^}]+)\}/g,
      (_match, includedFile) => {
        const trimmed = includedFile.trim()
        return (
          `% ========== INLINED FROM: ${trimmed} ==========\n` +
          inlineExpand(trimmed, actualPath) +
          `\n% ========== END OF: ${trimmed} ==========`
        )
      }
    )
  }

  const mergedTexContent = inlineExpand(normalizedRootPath, '')

  // Write cache files
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'merged.tex'), mergedTexContent, 'utf-8')

  const allDocPaths = Object.keys(allDocs).map(p => p.startsWith('/') ? p.slice(1) : p)
  const allFiles = await ProjectEntityHandler.promises.getAllFiles(projectId)
  const allFilePaths = Object.keys(allFiles).map(p => p.startsWith('/') ? p.slice(1) : p)
  const figureFiles = allFilePaths.filter(fp => {
    const noExt = fp.replace(/\.[^.]+$/, '')
    return [...referencedFigures].some(ref => {
      const refNoExt = ref.replace(/\.[^.]+$/, '')
      return fp === ref || fp.endsWith('/' + ref) || noExt === refNoExt || noExt.endsWith('/' + refNoExt)
    })
  })
  const bibFiles = [...allDocPaths, ...allFilePaths].filter(p => {
    if (!p.endsWith('.bib')) return false
    const noExt = p.replace(/\.bib$/, '')
    return [...referencedBibFiles].some(ref => {
      const refNoExt = ref.replace(/\.bib$/, '')
      return p === ref || p === ref + '.bib' || noExt === refNoExt || noExt.endsWith('/' + refNoExt)
    })
  })
  const usefulExts = ['.sty', '.cls', '.bst', '.def', '.cfg', '.clo', '.fd']
  const usefulFiles = [...allDocPaths, ...allFilePaths].filter(p =>
    usefulExts.some(ext => p.endsWith(ext)) && !texFilesOrdered.includes(p) && !bibFiles.includes(p) && !figureFiles.includes(p)
  )

  const metadata = {
    projectId,
    projectName: project.name || '',
    rootDocPath: normalizedRootPath,
    analyzedAt: new Date().toISOString(),
    categories: {
      texFiles: { files: texFilesOrdered, count: texFilesOrdered.length },
      figures: { files: figureFiles, references: Array.from(referencedFigures), count: figureFiles.length },
      bibFiles: { files: bibFiles, references: Array.from(referencedBibFiles), count: bibFiles.length },
      usefulFiles: { files: usefulFiles, count: usefulFiles.length },
    },
    mergedTexLength: mergedTexContent.length,
  }
  fs.writeFileSync(path.join(cacheDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

  // Call the orchestrator
  const result = await runFullReview({
    projectId,
    model: MODEL,
    venue: VENUE,
    cacheDir,
    docContentMap,
    rootDocPath: normalizedRootPath,
    roleModelTexts: [],
  })

  // Build docPath -> docId mapping
  const docPathToId = {}
  for (const [docPath, docData] of Object.entries(allDocs)) {
    const normalized = docPath.startsWith('/') ? docPath.slice(1) : docPath
    docPathToId[normalized] = docData._id.toString()
  }
  result.docPathToId = docPathToId
  result.metadata = metadata

  return result
}

// ---------------------------------------------------------------------------
// Phase B: Apply comments (create threads + add ranges to docs)
// ---------------------------------------------------------------------------

async function applyComments(projectId, result, adminId) {
  const docsCollection = db.docs
  const roomsCollection = db.rooms
  const messagesCollection = db.messages

  // Step 1: Flush project from document-updater to ensure clean state
  try {
    await fetch(`${DOC_UPDATER_URL}/project/${projectId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30000),
    })
    console.log(`  [Apply] Flushed project ${projectId} from document-updater`)
  } catch (err) {
    console.warn(`  [Apply] Warning: could not flush project from document-updater: ${err.message}`)
  }

  let totalApplied = 0
  let totalSkipped = 0

  for (const [docPath, comments] of Object.entries(result.commentsByDoc)) {
    const docId = result.docPathToId[docPath]
    if (!docId) {
      console.warn(`  [Apply] No doc ID for path: ${docPath}, skipping ${comments.length} comments`)
      totalSkipped += comments.length
      continue
    }

    // Get current doc content and ranges from MongoDB
    const doc = await docsCollection.findOne({
      _id: new ObjectId(docId),
      project_id: new ObjectId(projectId),
    })

    if (!doc) {
      console.warn(`  [Apply] Doc ${docId} not found in database, skipping`)
      totalSkipped += comments.length
      continue
    }

    const docContent = Array.isArray(doc.lines) ? doc.lines.join('\n') : (doc.lines || '')
    const existingRanges = doc.ranges || {}
    const existingComments = existingRanges.comments || []

    const newCommentRanges = []

    for (const comment of comments) {
      const idx = docContent.indexOf(comment.highlightText)
      if (idx === -1) {
        totalSkipped++
        continue
      }

      // Generate a new ObjectId for the thread
      const threadId = new ObjectId()

      // Create the chat room (thread)
      const roomResult = await roomsCollection.findOneAndUpdate(
        {
          project_id: new ObjectId(projectId),
          thread_id: threadId,
        },
        {
          $set: {
            project_id: new ObjectId(projectId),
            thread_id: threadId,
          },
        },
        { upsert: true, returnDocument: 'after' }
      )

      const roomId = roomResult._id

      // Create the message in the thread
      await messagesCollection.insertOne({
        content: comment.comment,
        room_id: roomId,
        user_id: new ObjectId(adminId),
        timestamp: new Date(),
      })

      // Add comment range to the doc
      newCommentRanges.push({
        id: threadId.toString(),
        op: {
          c: comment.highlightText,
          p: idx,
          t: threadId.toString(),
        },
        metadata: {
          user_id: adminId.toString(),
          ts: new Date(),
        },
      })

      totalApplied++
    }

    if (newCommentRanges.length > 0) {
      // Update the doc's ranges in MongoDB
      const updatedComments = [...existingComments, ...newCommentRanges]
      await docsCollection.updateOne(
        { _id: new ObjectId(docId) },
        {
          $set: {
            'ranges.comments': updatedComments,
          },
        }
      )
      console.log(`  [Apply] Added ${newCommentRanges.length} comments to ${docPath}`)
    }
  }

  return { totalApplied, totalSkipped }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await waitForDb()

  console.log('='.repeat(80))
  console.log('BATCH COMMENT GENERATION AND APPLICATION')
  console.log(`  Model: ${MODEL}`)
  console.log(`  Venue: ${VENUE}`)
  console.log(`  Concurrency: ${CONCURRENCY}`)
  console.log(`  Skip existing: ${SKIP_EXISTING}`)
  console.log('='.repeat(80))

  // Find admin user
  const admin = await User.findOne({ email: ADMIN_EMAIL })
  if (!admin) {
    console.error(`Admin user ${ADMIN_EMAIL} not found.`)
    process.exit(1)
  }
  const adminId = admin._id.toString()
  console.log(`Admin user: ${admin.email} (${adminId})`)

  // Load annotation project IDs
  let projectIds
  if (SINGLE_PROJECT_ID) {
    projectIds = [SINGLE_PROJECT_ID]
    console.log(`\nProcessing single project: ${SINGLE_PROJECT_ID}`)
  } else {
    const mapping = loadMapping()
    projectIds = [...new Set(Object.values(mapping))]
    console.log(`\nFound ${projectIds.length} annotation projects`)
  }

  // Filter out projects that already have review_comments.json
  if (SKIP_EXISTING) {
    const before = projectIds.length
    projectIds = projectIds.filter(pid => {
      const commentsFile = path.join(CACHE_DIR, pid, 'review_comments.json')
      return !fs.existsSync(commentsFile)
    })
    console.log(`Skipping ${before - projectIds.length} projects with existing comments (${projectIds.length} remaining)`)
  }

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    totalCommentsApplied: 0,
    totalCommentsSkipped: 0,
    errors: [],
  }

  // Process projects with concurrency control
  async function processProject(projectId, index) {
    const label = `[${index + 1}/${projectIds.length}] ${projectId}`
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`${label}: Starting...`)

    try {
      // Phase A: Generate comments
      console.log(`${label}: Generating comments...`)
      const startTime = Date.now()
      const reviewResult = await generateComments(projectId, adminId)

      const totalComments = Object.values(reviewResult.commentsByDoc).flat().length
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`${label}: Generated ${totalComments} comments in ${elapsed}s`)

      // Phase B: Apply comments
      console.log(`${label}: Applying comments...`)
      const { totalApplied, totalSkipped } = await applyComments(projectId, reviewResult, adminId)
      console.log(`${label}: Applied ${totalApplied} comments, skipped ${totalSkipped}`)

      results.success++
      results.totalCommentsApplied += totalApplied
      results.totalCommentsSkipped += totalSkipped
    } catch (err) {
      console.error(`${label}: FAILED - ${err.message}`)
      results.failed++
      results.errors.push({ projectId, error: err.message })
    }
  }

  // Process in batches based on concurrency
  for (let i = 0; i < projectIds.length; i += CONCURRENCY) {
    const batch = projectIds.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map((pid, batchIdx) => processProject(pid, i + batchIdx))
    )
    // Small delay between batches to avoid overwhelming the API
    if (i + CONCURRENCY < projectIds.length) {
      await sleep(2000)
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80))
  console.log('BATCH COMPLETE')
  console.log(`  Success: ${results.success}/${projectIds.length}`)
  console.log(`  Failed: ${results.failed}`)
  console.log(`  Total comments applied: ${results.totalCommentsApplied}`)
  console.log(`  Total comments skipped: ${results.totalCommentsSkipped}`)
  if (results.errors.length > 0) {
    console.log(`\nFailed projects:`)
    for (const { projectId, error } of results.errors) {
      console.log(`  ${projectId}: ${error}`)
    }
  }
  console.log('='.repeat(80))

  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

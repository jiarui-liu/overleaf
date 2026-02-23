import { expressify } from '@overleaf/promise-utils'
import Modules from '../../infrastructure/Modules.mjs'
import ChatApiHandler from './ChatApiHandler.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import UserInfoManager from '../User/UserInfoManager.mjs'
import UserInfoController from '../User/UserInfoController.mjs'
import ChatManager from './ChatManager.mjs'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import DocumentHelper from '../Documents/DocumentHelper.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { runFullReview } from './AiTutorReviewOrchestrator.mjs'
import { isAnnotatorEmail } from './AnnotatorConfig.mjs'

async function sendMessage(req, res) {
  const { project_id: projectId } = req.params
  const { content, client_id: clientId } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  const message = await ChatApiHandler.promises.sendGlobalMessage(
    projectId,
    userId,
    content
  )

  const user = await UserInfoManager.promises.getPersonalInfo(message.user_id)
  message.user = UserInfoController.formatPersonalInfo(user)
  message.clientId = clientId
  EditorRealTimeController.emitToRoom(projectId, 'new-chat-message', message)

  await Modules.promises.hooks.fire('chatMessageSent', {
    projectId,
    userId,
    messageId: message.id,
  })

  res.sendStatus(204)
}

async function getMessages(req, res) {
  const { project_id: projectId } = req.params
  const { query } = req
  const messages = await ChatApiHandler.promises.getGlobalMessages(
    projectId,
    query.limit,
    query.before
  )

  await ChatManager.promises.injectUserInfoIntoThreads({ global: { messages } })
  res.json(messages)
}

async function deleteMessage(req, res) {
  const { project_id: projectId, message_id: messageId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.deleteGlobalMessage(projectId, messageId)

  EditorRealTimeController.emitToRoom(projectId, 'delete-global-message', {
    messageId,
    userId,
  })
  res.sendStatus(204)
}

async function editMessage(req, res, next) {
  const { project_id: projectId, message_id: messageId } = req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.editGlobalMessage(
    projectId,
    messageId,
    userId,
    content
  )

  EditorRealTimeController.emitToRoom(projectId, 'edit-global-message', {
    messageId,
    userId,
    content,
  })
  res.sendStatus(204)
}

async function sendThreadMessage(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  const message = await ChatApiHandler.promises.sendComment(projectId, threadId, userId, content)

  const user = await UserInfoManager.promises.getPersonalInfo(message.user_id)
  message.user = UserInfoController.formatPersonalInfo(user)
  EditorRealTimeController.emitToRoom(projectId, 'new-comment', threadId, message)

  res.sendStatus(204)
}

async function getThreads(req, res) {
  const { project_id: projectId } = req.params
  const threads = await ChatApiHandler.promises.getThreads(projectId)

  await ChatManager.promises.injectUserInfoIntoThreads(threads)
  res.json(threads)
}

async function resolveThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.resolveThread(projectId, threadId, userId)

  EditorRealTimeController.emitToRoom(projectId, 'resolve-thread', threadId, userId)
  res.sendStatus(204)
}

async function reopenThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params

  await ChatApiHandler.promises.reopenThread(projectId, threadId)

  EditorRealTimeController.emitToRoom(projectId, 'reopen-thread', threadId)
  res.sendStatus(204)
}

async function deleteThreadMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, message_id: messageId } =
    req.params

  await ChatApiHandler.promises.deleteMessage(projectId, threadId, messageId)
  res.sendStatus(204)
}

async function editThreadMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, message_id: messageId } =
    req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.editMessage(
    projectId,
    threadId,
    messageId,
    userId,
    content
  )
  res.sendStatus(204)
}

async function deleteThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params

  await ChatApiHandler.promises.deleteThread(projectId, threadId)

  EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)
  res.sendStatus(204)
}

async function logAITutorSuggestions(req, res) {
  const { project_id: projectId } = req.params
  const { timestamp, abstract, suggestions, model } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)

  if (!userId) {
    return res.sendStatus(401)
  }

  try {
    // Create logs directory if it doesn't exist
    const logDir = '/var/lib/overleaf/ai-tutor-logs'
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    // Create a log entry
    const logEntry = {
      timestamp,
      projectId,
      userId: userId.toString(),
      model,
      abstractLength: abstract.length,
      suggestionsCount: suggestions.length,
      suggestions: suggestions.map(s => ({
        text: s.text,
        comment: s.comment,
      })),
    }

    // Append to daily log file
    const date = new Date(timestamp).toISOString().split('T')[0]
    const logFile = path.join(logDir, `ai-tutor-${date}.jsonl`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n')

    res.sendStatus(204)
  } catch (error) {
    console.error('Failed to log AI tutor suggestions:', error)
    // Don't fail the request - logging is optional
    res.sendStatus(204)
  }
}

async function analyzeWholeProject(req, res) {
  try {
  const { project_id: projectId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)

  if (!userId) {
    return res.sendStatus(401)
  }

  // Phase 1: Gather all docs and files from the project
  const allDocs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const allFiles = await ProjectEntityHandler.promises.getAllFiles(projectId)

  const project = await ProjectGetter.promises.getProject(projectId, {
    rootDoc_id: 1,
    name: 1,
  })

  if (!project) {
    return res.status(404).json({ error: 'Project not found' })
  }

  // Phase 2: Find the root .tex file
  let rootDocPath = null

  // Try using project's rootDoc_id
  if (project.rootDoc_id) {
    for (const [docPath, docData] of Object.entries(allDocs)) {
      if (docData._id.toString() === project.rootDoc_id.toString()) {
        rootDocPath = docPath
        break
      }
    }
  }

  // Fallback: scan for \documentclass
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
    return res.status(400).json({
      error: 'Could not find root .tex file with \\documentclass',
    })
  }

  // Phase 3: Build doc content map (normalized path -> content string)
  const docContentMap = {}
  for (const [docPath, docData] of Object.entries(allDocs)) {
    const normalized = docPath.startsWith('/') ? docPath.slice(1) : docPath
    const content = Array.isArray(docData.lines)
      ? docData.lines.join('\n')
      : docData.lines || ''
    docContentMap[normalized] = content
  }

  // Phase 4: Recursively inline \input/\include, extract references, track included files
  const texFilesOrdered = []
  const visitedFiles = new Set()
  const referencedFigures = new Set()
  const referencedBibFiles = new Set()
  const referencedPackages = new Set()

  function resolveDocPath(filePath) {
    if (docContentMap[filePath] !== undefined) return filePath
    if (docContentMap[filePath + '.tex'] !== undefined)
      return filePath + '.tex'
    return null
  }

  function extractReferences(content) {
    let match
    // \includegraphics
    const graphicsRe = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = graphicsRe.exec(content)) !== null) {
      referencedFigures.add(match[1].trim())
    }
    // \bibliography / \addbibresource
    const bibRe = /\\(?:bibliography|addbibresource)\{([^}]+)\}/g
    while ((match = bibRe.exec(content)) !== null) {
      for (const b of match[1].split(',')) {
        referencedBibFiles.add(b.trim())
      }
    }
    // \usepackage / \RequirePackage
    const pkgRe =
      /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = pkgRe.exec(content)) !== null) {
      for (const p of match[1].split(',')) {
        referencedPackages.add(p.trim())
      }
    }
    // \documentclass
    const clsRe = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/g
    while ((match = clsRe.exec(content)) !== null) {
      referencedPackages.add(match[1].trim())
    }
  }

  // Recursively expand \input{} and \include{} inline, replacing each
  // command with the actual content of the referenced file.
  function inlineExpand(filePath, basePath) {
    // Try resolving relative to the parent file's directory first,
    // then fall back to the project root. This mirrors TeX's TEXINPUTS
    // behavior where \input paths are searched in multiple locations.
    let resolvedPath = filePath
    if (basePath && !filePath.startsWith('/')) {
      const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/'))
        : ''
      resolvedPath = baseDir ? baseDir + '/' + filePath : filePath
    }

    // Try resolved path (relative to parent), then original path (relative to project root)
    let actualPath = resolveDocPath(resolvedPath)
    if (!actualPath && resolvedPath !== filePath) {
      actualPath = resolveDocPath(filePath)
    }
    if (!actualPath || visitedFiles.has(actualPath)) {
      // Cycle or missing file: leave a comment marker
      return `% [AI Tutor] Could not inline: ${filePath} (${!actualPath ? 'not found' : 'already included'})`
    }

    visitedFiles.add(actualPath)
    texFilesOrdered.push(actualPath)

    const content = docContentMap[actualPath]
    if (!content) return ''

    // Extract figure, bib, package references from this file
    extractReferences(content)

    // Replace each \input{...} and \include{...} with the inlined content
    const expanded = content.replace(
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

    return expanded
  }

  const normalizedRootPath = rootDocPath.startsWith('/')
    ? rootDocPath.slice(1)
    : rootDocPath

  // Phase 5: Merge by inlining from root document
  const mergedTexContent = inlineExpand(normalizedRootPath, '')

  // Phase 6: Categorize ALL files into 5 categories
  const allDocPaths = Object.keys(allDocs).map(p =>
    p.startsWith('/') ? p.slice(1) : p
  )
  const allFilePaths = Object.keys(allFiles).map(p =>
    p.startsWith('/') ? p.slice(1) : p
  )

  // Category 2: figures - match references against binary files
  const figureFiles = []
  for (const filePath of allFilePaths) {
    const fileNoExt = filePath.replace(/\.[^.]+$/, '')
    for (const ref of referencedFigures) {
      const refNoExt = ref.replace(/\.[^.]+$/, '')
      if (
        filePath === ref ||
        filePath.endsWith('/' + ref) ||
        fileNoExt === refNoExt ||
        fileNoExt.endsWith('/' + refNoExt)
      ) {
        figureFiles.push(filePath)
        break
      }
    }
  }

  // Category 3: bib files
  const bibFiles = []
  for (const docPath of allDocPaths) {
    if (docPath.endsWith('.bib')) {
      const docNoExt = docPath.replace(/\.bib$/, '')
      for (const ref of referencedBibFiles) {
        const refNoExt = ref.replace(/\.bib$/, '')
        if (
          docPath === ref ||
          docPath === ref + '.bib' ||
          docNoExt === refNoExt ||
          docNoExt.endsWith('/' + refNoExt)
        ) {
          bibFiles.push(docPath)
          break
        }
      }
    }
  }
  for (const filePath of allFilePaths) {
    if (filePath.endsWith('.bib') && !bibFiles.includes(filePath)) {
      bibFiles.push(filePath)
    }
  }

  // Category 4: useful files (.sty, .cls, .bst, etc.)
  const usefulExts = ['.sty', '.cls', '.bst', '.def', '.cfg', '.clo', '.fd']
  const usefulFiles = []
  for (const docPath of allDocPaths) {
    if (
      usefulExts.some(ext => docPath.endsWith(ext)) &&
      !texFilesOrdered.includes(docPath) &&
      !bibFiles.includes(docPath)
    ) {
      usefulFiles.push(docPath)
    }
  }
  for (const filePath of allFilePaths) {
    if (
      usefulExts.some(ext => filePath.endsWith(ext)) &&
      !figureFiles.includes(filePath)
    ) {
      usefulFiles.push(filePath)
    }
  }

  // Category 5: irrelevant files
  const categorized = new Set([
    ...texFilesOrdered,
    ...figureFiles,
    ...bibFiles,
    ...usefulFiles,
  ])
  const irrelevantFiles = []
  for (const docPath of allDocPaths) {
    if (!categorized.has(docPath)) irrelevantFiles.push(docPath)
  }
  for (const filePath of allFilePaths) {
    if (!categorized.has(filePath)) irrelevantFiles.push(filePath)
  }

  // Phase 7: Write cache files to disk
  const cacheDir = path.join('/var/lib/overleaf/ai-tutor-cache', projectId)
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  const mergedTexPath = path.join(cacheDir, 'merged.tex')
  fs.writeFileSync(mergedTexPath, mergedTexContent, 'utf-8')

  const metadata = {
    projectId,
    projectName: project.name || '',
    rootDocPath: normalizedRootPath,
    analyzedAt: new Date().toISOString(),
    categories: {
      texFiles: {
        description: 'TeX files merged in reading order',
        files: texFilesOrdered,
        count: texFilesOrdered.length,
      },
      figures: {
        description: 'Referenced figure files',
        files: figureFiles,
        references: Array.from(referencedFigures),
        count: figureFiles.length,
      },
      bibFiles: {
        description: 'Referenced bibliography files',
        files: bibFiles,
        references: Array.from(referencedBibFiles),
        count: bibFiles.length,
      },
      usefulFiles: {
        description: 'Other useful files (style, class, etc.)',
        files: usefulFiles,
        count: usefulFiles.length,
      },
      irrelevantFiles: {
        description: 'Irrelevant or unused files',
        files: irrelevantFiles,
        count: irrelevantFiles.length,
      },
    },
    mergedTexPath,
    mergedTexLength: mergedTexContent.length,
    totalDocs: allDocPaths.length,
    totalFiles: allFilePaths.length,
  }

  const metadataPath = path.join(cacheDir, 'metadata.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')

  // Phase 8: Return metadata to frontend
  res.json(metadata)
  } catch (err) {
    console.error('[AI Tutor] Project analysis failed:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
}

async function reviewWholeProject(req, res) {
  try {
  const { project_id: projectId } = req.params
  const { model = 'gpt-5.2-chat-latest', venue = 'arxiv', roleModelTexts: rawRoleModelTexts = [] } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)

  // Validate roleModelTexts if provided
  const roleModelTexts = []
  if (Array.isArray(rawRoleModelTexts)) {
    for (const rm of rawRoleModelTexts.slice(0, 3)) {
      if (rm && typeof rm.name === 'string' && typeof rm.text === 'string' && rm.text.length > 0) {
        roleModelTexts.push({
          name: rm.name.slice(0, 200),
          text: rm.text.slice(0, 80000),
        })
      }
    }
  }
  if (roleModelTexts.length > 0) {
    const totalChars = roleModelTexts.reduce((sum, rm) => sum + rm.text.length, 0)
    console.log(
      `[AI Tutor] Role model papers: ${roleModelTexts.length} paper(s), ` +
      `${(totalChars / 1000).toFixed(0)}K total chars: ` +
      roleModelTexts.map(rm => `"${rm.name}" (${(rm.text.length / 1000).toFixed(0)}K)`).join(', ')
    )
  }

  // Step 1: Run project analysis (always re-analyze for fresh data)
  console.log('[AI Tutor] reviewWholeProject: running project analysis...')

  const allDocs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const allFiles = await ProjectEntityHandler.promises.getAllFiles(projectId)
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootDoc_id: 1,
    name: 1,
  })

  if (!project) {
    return res.status(404).json({ error: 'Project not found' })
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
    return res.status(400).json({
      error: 'Could not find root .tex file with \\documentclass',
    })
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

  // Inline-expand and write merged.tex + metadata.json to cache
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
    // Try resolving relative to the parent file's directory first,
    // then fall back to the project root (mirrors TeX TEXINPUTS behavior)
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

  const normalizedRootPath = rootDocPath.startsWith('/')
    ? rootDocPath.slice(1)
    : rootDocPath
  const mergedTexContent = inlineExpand(normalizedRootPath, '')

  // Categorize files
  const allDocPaths = Object.keys(allDocs).map(p => p.startsWith('/') ? p.slice(1) : p)
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
  const categorized = new Set([...texFilesOrdered, ...figureFiles, ...bibFiles, ...usefulFiles])
  const irrelevantFiles = [...allDocPaths, ...allFilePaths].filter(p => !categorized.has(p))

  // Write cache
  const cacheDir = path.join('/var/lib/overleaf/ai-tutor-cache', projectId)
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'merged.tex'), mergedTexContent, 'utf-8')

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
      irrelevantFiles: { files: irrelevantFiles, count: irrelevantFiles.length },
    },
    mergedTexLength: mergedTexContent.length,
    totalDocs: allDocPaths.length,
    totalFiles: allFilePaths.length,
  }
  fs.writeFileSync(path.join(cacheDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')
  console.log(`[AI Tutor] Project analysis complete: ${texFilesOrdered.length} tex files, ${mergedTexContent.length} chars merged`)

  // Save role model texts to cache for debugging
  if (roleModelTexts.length > 0) {
    for (let i = 0; i < roleModelTexts.length; i++) {
      const rmPath = path.join(cacheDir, `role_model_${i}_${roleModelTexts[i].name.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`)
      fs.writeFileSync(rmPath, roleModelTexts[i].text, 'utf-8')
      console.log(`[AI Tutor] Saved role model text to ${rmPath} (${(roleModelTexts[i].text.length / 1000).toFixed(0)}K chars)`)
    }
  }

  // Step 2: Run multi-agent review
    const result = await runFullReview({
      projectId,
      model,
      venue,
      cacheDir,
      docContentMap,
      rootDocPath: normalizedRootPath,
      roleModelTexts,
    })
    // Attach metadata to the response so frontend can display file info
    result.metadata = metadata

    // Build docPath -> docId mapping so frontend can open the correct document
    const docPathToId = {}
    for (const [docPath, docData] of Object.entries(allDocs)) {
      const normalized = docPath.startsWith('/') ? docPath.slice(1) : docPath
      docPathToId[normalized] = docData._id.toString()
    }
    result.docPathToId = docPathToId

    // Log review results to JSONL
    try {
      const logDir = '/var/lib/overleaf/ai-tutor-logs'
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
      const date = new Date().toISOString().split('T')[0]
      const logFile = path.join(logDir, `ai-tutor-${date}.jsonl`)

      // Flatten all comments from all docs
      const allComments = Object.values(result.commentsByDoc).flat()

      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'full_review',
        projectId,
        userId: userId.toString(),
        model,
        venue,
        roleModelPapers: roleModelTexts.length > 0 ? roleModelTexts.map(rm => rm.name) : undefined,
        paperType: result.classification.paperType,
        paperTypeSummary: result.classification.paperTypeSummary,
        summary: result.summary,
        failedAgents: result.failedAgents,
        comments: allComments.map(c => ({
          highlightText: c.highlightText,
          comment: c.comment,
          severity: c.severity,
          category: c.category,
          agentName: c.agentName,
          docPath: c.docPath,
        })),
      }
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n')
    } catch (logErr) {
      console.warn('[AI Tutor] Failed to write JSONL log:', logErr.message)
    }

    res.json(result)
  } catch (err) {
    console.error('[AI Tutor] Review failed:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
}

async function deleteAiTutorComments(req, res) {
  const { project_id: projectId } = req.params

  try {
    // 1. Fetch all threads for this project
    const threads = await ChatApiHandler.promises.getThreads(projectId)

    // 2. Find threads whose first message starts with [AI Tutor] or [critical]/[warning]/[suggestion]
    const aiTutorRe = /^\[(AI Tutor|critical|warning|suggestion)\]/
    const aiTutorThreadIds = []
    for (const [threadId, thread] of Object.entries(threads)) {
      if (thread.messages && thread.messages.length > 0) {
        const firstMsg = thread.messages[0].content || ''
        if (aiTutorRe.test(firstMsg)) {
          aiTutorThreadIds.push(threadId)
        }
      }
    }

    if (aiTutorThreadIds.length === 0) {
      return res.json({ deleted: 0 })
    }

    // 3. Delete each AI Tutor thread and emit socket events
    for (const threadId of aiTutorThreadIds) {
      await ChatApiHandler.promises.deleteThread(projectId, threadId)
      EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)
    }

    console.log(
      `[AI Tutor] Deleted ${aiTutorThreadIds.length} AI Tutor comment threads from project ${projectId}`
    )
    res.json({ deleted: aiTutorThreadIds.length })
  } catch (err) {
    console.error('[AI Tutor] Failed to delete comments:', err)
    res.status(500).json({ error: err.message })
  }
}

async function getAnnotations(req, res) {
  const { project_id: projectId } = req.params

  const annotationsPath = path.join(
    '/var/lib/overleaf/ai-tutor-cache',
    projectId,
    'annotations.json'
  )

  try {
    if (fs.existsSync(annotationsPath)) {
      const data = fs.readFileSync(annotationsPath, 'utf-8')
      res.json(JSON.parse(data))
    } else {
      res.json({})
    }
  } catch (error) {
    console.error('[Annotations] Failed to read annotations:', error)
    res.json({})
  }
}

async function saveAnnotation(req, res) {
  const { project_id: projectId } = req.params
  const { threadId, commentContent, ratings } = req.body
  const user = SessionManager.getSessionUser(req.session)

  if (!user) {
    return res.sendStatus(401)
  }

  // Verify this is an annotation account
  if (!isAnnotatorEmail(user.email)) {
    return res.sendStatus(403)
  }

  // Validate ratings
  if (!ratings || typeof ratings !== 'object') {
    return res.status(400).json({ error: 'Invalid ratings' })
  }

  for (const key of ['validity', 'actionability', 'conciseness']) {
    const val = ratings[key]
    if (val !== null && (typeof val !== 'number' || (val !== 0 && val !== 1))) {
      return res.status(400).json({ error: `Invalid rating for ${key}` })
    }
  }

  const cacheDir = path.join('/var/lib/overleaf/ai-tutor-cache', projectId)
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  const annotationsPath = path.join(cacheDir, 'annotations.json')

  let annotations = {}
  try {
    if (fs.existsSync(annotationsPath)) {
      annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf-8'))
    }
  } catch {
    annotations = {}
  }

  annotations[threadId] = {
    threadId,
    commentContent: commentContent || '',
    ratings: {
      validity: ratings.validity ?? null,
      actionability: ratings.actionability ?? null,
      conciseness: ratings.conciseness ?? null,
    },
    timestamp: new Date().toISOString(),
    annotatorEmail: user.email,
  }

  fs.writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2), 'utf-8')
  res.json(annotations[threadId])
}

export default {
  sendMessage: expressify(sendMessage),
  getMessages: expressify(getMessages),
  deleteMessage: expressify(deleteMessage),
  editMessage: expressify(editMessage),
  sendThreadMessage: expressify(sendThreadMessage),
  getThreads: expressify(getThreads),
  resolveThread: expressify(resolveThread),
  reopenThread: expressify(reopenThread),
  deleteThreadMessage: expressify(deleteThreadMessage),
  editThreadMessage: expressify(editThreadMessage),
  deleteThread: expressify(deleteThread),
  logAITutorSuggestions: expressify(logAITutorSuggestions),
  analyzeWholeProject: expressify(analyzeWholeProject),
  reviewWholeProject: expressify(reviewWholeProject),
  deleteAiTutorComments: expressify(deleteAiTutorComments),
  getAnnotations: expressify(getAnnotations),
  saveAnnotation: expressify(saveAnnotation),
}

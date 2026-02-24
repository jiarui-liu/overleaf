/**
 * AiTutorBaselineReview.mjs
 *
 * Baseline single-call LLM reviewer. Makes one generateObject call to review
 * the entire paper without any skill files, producing ~30 inline comments.
 * Used to compare against the multi-agent review system.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { mapCommentsToDocuments } from './AiTutorReviewOrchestrator.mjs'

const BASELINE_SYSTEM_PROMPT = `You are an experienced academic peer reviewer. Review the following LaTeX paper and produce exactly 30 specific, actionable inline comments.

Requirements:
- Cover ALL sections of the paper (abstract, introduction, related work, methods, results, conclusion, etc.)
- Each comment must reference an EXACT verbatim substring from the paper (1-200 characters). The substring must appear exactly as-is in the paper text.
- Provide constructive, specific feedback — not vague or generic observations
- Assign severity: "critical" (must fix for acceptance), "warning" (should fix, significant issue), "suggestion" (nice-to-have improvement)
- Focus on: clarity, correctness, completeness, methodology, presentation, missing references, unsupported claims, logical gaps
- Do NOT comment on anonymity or double-blind compliance
- Do NOT comment on LaTeX source comments (lines starting with %)
- Do NOT comment on formatting or LaTeX commands unless they affect readability
- Aim for a balanced distribution across the paper's sections`

const BaselineCommentSchema = z.object({
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
 * Run a baseline single-call review of the paper.
 *
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {string} opts.model - e.g. 'gpt-4.1-2025-04-14'
 * @param {string} opts.cacheDir - path to the project's cache directory
 * @param {object} opts.docContentMap - { normalizedPath: contentString }
 * @param {string} opts.rootDocPath - normalized root doc path
 * @returns {object} result in same format as runFullReview
 */
export async function runBaselineReview({
  projectId,
  model,
  cacheDir,
  docContentMap,
  rootDocPath,
}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set')
  }

  const openai = createOpenAI({ apiKey })

  // Read merged.tex from cache
  const mergedTexPath = path.join(cacheDir, 'merged.tex')
  if (!fs.existsSync(mergedTexPath)) {
    throw new Error('merged.tex not found in cache directory')
  }
  const mergedTex = fs.readFileSync(mergedTexPath, 'utf-8')

  console.log('='.repeat(80))
  console.log(`[Baseline] STARTING BASELINE REVIEW`)
  console.log(`[Baseline]   Project: ${projectId}`)
  console.log(`[Baseline]   Model: ${model}`)
  console.log(`[Baseline]   merged.tex: ${mergedTex.length} chars`)
  console.log('='.repeat(80))

  const startTime = Date.now()

  // Single LLM call
  const { object: raw } = await generateObject({
    model: openai(model),
    schema: BaselineCommentSchema,
    system: BASELINE_SYSTEM_PROMPT,
    prompt: mergedTex,
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(
    `[Baseline] LLM call complete in ${elapsed}s — got ${raw.comments.length} comments`
  )

  // Validate each comment's highlightText exists in merged tex (exact or fuzzy via mapCommentsToDocuments)
  // Add baseline metadata to each comment
  const commentsWithMeta = raw.comments.map(c => ({
    ...c,
    comment: `[${c.severity}] [Baseline] ${c.comment}`,
    category: 'baseline',
    agentName: 'Baseline',
  }))

  // Map comments to original documents using shared infrastructure
  const mapped = mapCommentsToDocuments(
    commentsWithMeta,
    mergedTex,
    docContentMap,
    rootDocPath
  )

  console.log(
    `[Baseline] Mapped ${mapped.length}/${commentsWithMeta.length} comments to documents`
  )

  // Group by document path
  const commentsByDoc = {}
  for (const c of mapped) {
    if (!commentsByDoc[c.docPath]) {
      commentsByDoc[c.docPath] = []
    }
    commentsByDoc[c.docPath].push(c)
  }

  // Build summary
  const bySeverity = {}
  for (const c of mapped) {
    bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1
  }

  const result = {
    projectId,
    model,
    reviewedAt: new Date().toISOString(),
    classification: {
      paperType: 'baseline',
      paperTypeSummary: 'Single-call baseline review without skill files',
    },
    commentsByDoc,
    summary: {
      total: mapped.length,
      byCategory: { baseline: mapped.length },
      bySeverity,
    },
    failedAgents: [],
  }

  // Save to cache
  const outPath = path.join(cacheDir, 'baseline_comments.json')
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`[Baseline] Saved ${mapped.length} comments to ${outPath}`)

  return result
}

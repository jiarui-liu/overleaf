import { postJSON } from '@/infrastructure/fetch-json'

export interface FileCategory {
  description: string
  files: string[]
  references?: string[]
  count: number
}

export interface WholeProjectMetadata {
  projectId: string
  projectName: string
  rootDocPath: string
  analyzedAt: string
  categories: {
    texFiles: FileCategory
    figures: FileCategory
    bibFiles: FileCategory
    usefulFiles: FileCategory
    irrelevantFiles: FileCategory
  }
  mergedTexPath: string
  mergedTexLength: number
  totalDocs: number
  totalFiles: number
}

// -- Multi-agent review types --

export interface ReviewComment {
  highlightText: string
  comment: string
  severity: 'suggestion' | 'warning' | 'critical'
  category: string
  agentName: string
  docPath: string
  startOffset: number
  endOffset: number
  revisionLabel?: 'new' | 'still_open' | 'dismissed'
}

export type ReviewRevisionCounts = {
  new: number
  still_open: number
  dismissed: number
  fixed: number
}

export type AppliedThread = {
  threadId: string
  comment: string
  highlightText: string
  docPath: string
  agentName: string
  severity: string
}

export function shouldApply(c: ReviewComment): boolean {
  return c.revisionLabel !== 'still_open' && c.revisionLabel !== 'dismissed'
}

export function formatRevisionLine(r: ReviewRevisionCounts): string {
  const base = `${r.new} new · ${r.still_open} still open · ${r.fixed} fixed since last review`
  return r.dismissed > 0 ? `${base} · ${r.dismissed} dismissed` : base
}

// A direct text edit (e.g. the Acknowledgments section), applied as a normal
// editor change rather than a comment.
export interface ReviewEdit {
  docPath: string
  offset: number // server-side position, used as a hint when relocating
  oldText: string // exact text being replaced ('' for a pure insertion)
  anchorText: string // text right after an insertion point ('' = end of doc)
  newText: string
  description: string
  agentName: string
}

export interface ReviewResult {
  projectId: string
  model: string
  reviewedAt: string
  classification: {
    paperType: string
    paperTypeSummary: string
  }
  commentsByDoc: Record<string, ReviewComment[]>
  editsByDoc?: Record<string, ReviewEdit[]>
  docPathToId: Record<string, string>
  summary: {
    total: number
    edits?: number
    byCategory: Record<string, number>
    bySeverity: Record<string, number>
    revision?: ReviewRevisionCounts
  }
  failedAgents: Array<{ id: string; name: string; reason: string }>
  roleModelPapers?: string[]
  // Prototypes the Sentence Placement Reviewer compared against: the uploaded
  // role model papers, or a built-in example paper for the paper type.
  placementPrototypes?: { source: 'uploaded' | 'bundled'; papers: string[] }
  metadata?: WholeProjectMetadata
}

export async function runFullReview(
  projectId: string,
  model: string,
  venue: string = 'arxiv',
  roleModelTexts: Array<{ name: string; text: string }> = []
): Promise<{ success: boolean; result?: ReviewResult; error?: string }> {
  try {
    const result = (await postJSON(
      `/project/${projectId}/ai-tutor-review`,
      {
        body: {
          model,
          venue,
          roleModelTexts:
            roleModelTexts.length > 0 ? roleModelTexts : undefined,
        },
      }
    )) as ReviewResult
    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred.',
    }
  }
}

export async function deleteAiTutorComments(
  projectId: string
): Promise<{ deleted: number }> {
  return (await postJSON(
    `/project/${projectId}/ai-tutor-delete-comments`
  )) as { deleted: number }
}

export async function recordAppliedThreads(
  projectId: string,
  threads: AppliedThread[]
): Promise<void> {
  await postJSON(`/project/${projectId}/ai-tutor-applied-threads`, {
    body: { threads },
  })
}

export interface CitationCheckStats {
  verified?: number
  mismatch?: number
  fabricated?: number
  unverified?: number
  doi_not_found?: number
  doi_mismatch?: number
  no_title?: number
  skipped?: string
  error?: string
}

export interface CitationCheckResult extends ReviewResult {
  citationVerification: CitationCheckStats
  elapsedSeconds?: number
}

export async function runCitationCheck(
  projectId: string
): Promise<{ success: boolean; result?: CitationCheckResult; error?: string }> {
  try {
    const result = (await postJSON(
      `/project/${projectId}/ai-tutor-citation-check`,
      { body: {} }
    )) as CitationCheckResult
    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred.',
    }
  }
}

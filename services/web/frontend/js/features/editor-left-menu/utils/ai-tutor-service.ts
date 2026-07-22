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
  docPathToId: Record<string, string>
  summary: {
    total: number
    byCategory: Record<string, number>
    bySeverity: Record<string, number>
  }
  failedAgents: Array<{ id: string; name: string; reason: string }>
  roleModelPapers?: string[]
  metadata?: WholeProjectMetadata
  // Scoped reviews only: metadata for each reviewed file, keyed by doc path
  // (matching commentsByDoc), so the panel can render per-file "File details".
  metadataByDoc?: Record<string, WholeProjectMetadata>
}

export async function runFullReview(
  projectId: string,
  model: string,
  venue: string = 'arxiv',
  roleModelTexts: Array<{ name: string; text: string }> = [],
  docPaths: string[] = []
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
          docPaths: docPaths.length > 0 ? docPaths : undefined,
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

/**
 * List the project's .tex files so the user can pick a subset to review.
 */
export async function fetchPaperFiles(
  projectId: string
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  try {
    const result = (await postJSON(`/project/${projectId}/ai-tutor-files`, {
      body: {},
    })) as { files: string[] }
    return { success: true, files: result.files }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred.',
    }
  }
}

/**
 * Delete Paper Mentor comments. With no threadIds, deletes every Paper Mentor
 * comment in the project. With threadIds, deletes only those threads that are
 * Paper Mentor comments (used for per-file deletion: the caller passes the
 * thread ids found in one document's ranges). Returns the ids actually deleted
 * so the caller can remove the matching comment ranges from the open document.
 */
export async function deleteAiTutorComments(
  projectId: string,
  threadIds?: string[]
): Promise<{ deleted: number; deletedIds: string[] }> {
  return (await postJSON(
    `/project/${projectId}/ai-tutor-delete-comments`,
    threadIds && threadIds.length > 0 ? { body: { threadIds } } : undefined
  )) as { deleted: number; deletedIds: string[] }
}

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
  metadata?: WholeProjectMetadata
}

export async function runFullReview(
  projectId: string,
  model: string,
  venue: string = 'arxiv'
): Promise<{ success: boolean; result?: ReviewResult; error?: string }> {
  try {
    const result = (await postJSON(
      `/project/${projectId}/ai-tutor-review`,
      { body: { model, venue } }
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

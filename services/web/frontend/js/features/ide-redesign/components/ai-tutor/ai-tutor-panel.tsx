import { useCallback, useEffect, useRef, useState } from 'react'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useProjectContext } from '@/shared/context/project-context'
import { postJSON } from '@/infrastructure/fetch-json'
import RangesTracker from '@overleaf/ranges-tracker'
import {
  runFullReview,
  deleteAiTutorComments,
  WholeProjectMetadata,
  ReviewResult,
  ReviewComment,
} from '@/features/editor-left-menu/utils/ai-tutor-service'
import { ThreadId } from '../../../../../../types/review-panel/review-panel'
import { CommentOperation } from '../../../../../../types/change'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import MaterialIcon from '@/shared/components/material-icon'

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat' },
]

const VENUE_OPTIONS = [
  { value: 'arxiv', label: 'arXiv / No Specific Venue' },
  { value: 'colm_2026', label: 'COLM 2026' },
  { value: 'icml_2026', label: 'ICML 2026' },
  { value: 'acl_2026', label: 'ACL 2026' },
  { value: 'aaai_2026', label: 'AAAI 2026' },
  { value: 'iclr_2026', label: 'ICLR 2026' },
  { value: 'emnlp_2025', label: 'EMNLP 2025' },
  { value: 'neurips_2025', label: 'NeurIPS 2025' },
]

interface CommentQueue {
  entries: Array<{ docPath: string; docId: string; comments: ReviewComment[] }>
  currentIndex: number
  totalApplied: number
  totalSkipped: number
}

export default function AiTutorPanel() {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Model selection
  const [selectedModel, setSelectedModel] = useState('gpt-4o')

  // Venue selection
  const [selectedVenue, setSelectedVenue] = useState('arxiv')

  // Delete comments state
  const [isDeleting, setIsDeleting] = useState(false)

  // Full review state
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [reviewProgress, setReviewProgress] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)

  // Auto-apply state
  const [isApplying, setIsApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<string | null>(null)
  const commentQueueRef = useRef<CommentQueue | null>(null)
  const applyTriggerRef = useRef(0)
  const [applyTrigger, setApplyTrigger] = useState(0)

  const { currentDocument, currentDocumentId } = useEditorOpenDocContext()
  const { openDocWithId } = useEditorManagerContext()
  const { projectId } = useProjectContext()

  // -----------------------------------------------------------------------
  // Effect: when currentDocument changes during auto-apply, process next batch
  // -----------------------------------------------------------------------
  useEffect(() => {
    const queue = commentQueueRef.current
    if (!queue || !currentDocument || !currentDocumentId) return

    const entry = queue.entries[queue.currentIndex]
    if (!entry) return

    // Verify the expected document is fully loaded (both ID and container must match)
    // currentDocumentId updates before currentDocument during doc switching,
    // so we must also check currentDocument.doc_id to avoid using stale content
    if (entry.docId !== currentDocumentId) return
    if (currentDocument.doc_id !== currentDocumentId) return

    const snapshot = currentDocument.getSnapshot()
    if (!snapshot) return

    const applyBatch = async () => {
      let applied = 0
      let skipped = 0

      for (const comment of entry.comments) {
        const idx = snapshot.indexOf(comment.highlightText)
        if (idx === -1) {
          skipped++
          continue
        }

        try {
          const threadId = RangesTracker.generateId() as ThreadId
          await postJSON(`/project/${projectId}/thread/${threadId}/messages`, {
            body: { content: comment.comment },
          })
          const op: CommentOperation = {
            c: comment.highlightText,
            p: idx,
            t: threadId,
          }
          currentDocument.submitOp(op)
          applied++
        } catch (err) {
          console.warn('[AI Tutor] Failed to apply comment:', err)
          skipped++
        }
      }

      queue.totalApplied += applied
      queue.totalSkipped += skipped
      queue.currentIndex++

      // Process next document or finish
      if (queue.currentIndex < queue.entries.length) {
        const next = queue.entries[queue.currentIndex]
        setApplyProgress(
          `Applying comments... ${queue.totalApplied} applied, ` +
          `processing ${next.docPath} (${queue.currentIndex + 1}/${queue.entries.length})`
        )
        openDocWithId(next.docId)
      } else {
        // All done
        const filesProcessed = queue.entries.length
        setIsApplying(false)
        setAppliedCount(queue.totalApplied)
        setApplyProgress(null)
        setSuccessMessage(
          `Applied ${queue.totalApplied} comment(s) across ${filesProcessed} file(s).` +
          (queue.totalSkipped > 0
            ? ` ${queue.totalSkipped} comment(s) could not be matched.`
            : '')
        )
        commentQueueRef.current = null
      }
    }

    applyBatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument, currentDocumentId, applyTrigger])

  // -----------------------------------------------------------------------
  // Run full review (analyzes project + runs multi-agent review in one call)
  // -----------------------------------------------------------------------
  const handleFullReview = useCallback(async () => {
    setIsReviewing(true)
    setError(null)
    setSuccessMessage(null)
    setReviewProgress(
      'Analyzing project structure and running multi-agent review... This may take 1-2 minutes.'
    )
    setReviewResult(null)
    setAppliedCount(0)

    try {
      const result = await runFullReview(projectId, selectedModel, selectedVenue)

      if (!result.success) {
        setError(result.error || 'Review failed.')
        setIsReviewing(false)
        setReviewProgress(null)
        return
      }

      setReviewResult(result.result!)
      setReviewProgress(null)

      const r = result.result!
      const failedNote =
        r.failedAgents.length > 0
          ? ` (${r.failedAgents.length} agent(s) skipped)`
          : ''
      setSuccessMessage(
        `Review complete! ${r.summary.total} comments from ${Object.keys(r.summary.byCategory).length} reviewers.` +
        ` Paper type: ${r.classification.paperType}.${failedNote}`
      )
    } catch (err) {
      console.error('[AI Tutor] Full review error:', err)
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      )
      setReviewProgress(null)
    } finally {
      setIsReviewing(false)
    }
  }, [projectId, selectedModel, selectedVenue])

  // -----------------------------------------------------------------------
  // Apply review comments across all documents automatically
  // -----------------------------------------------------------------------
  const handleApplyComments = useCallback(() => {
    if (!reviewResult) {
      setError('No review results available.')
      return
    }

    const docPathToId = reviewResult.docPathToId || {}

    // Build a queue of (docPath, docId, comments) entries
    const entries: CommentQueue['entries'] = []
    for (const [docPath, comments] of Object.entries(reviewResult.commentsByDoc)) {
      const docId = docPathToId[docPath]
      if (docId && (comments as ReviewComment[]).length > 0) {
        entries.push({ docPath, docId, comments: comments as ReviewComment[] })
      }
    }

    if (entries.length === 0) {
      setError('No comments could be mapped to documents.')
      return
    }

    // Initialize the queue
    commentQueueRef.current = {
      entries,
      currentIndex: 0,
      totalApplied: 0,
      totalSkipped: 0,
    }

    setIsApplying(true)
    setAppliedCount(0)
    setError(null)
    setSuccessMessage(null)
    setApplyProgress(
      `Applying comments... processing ${entries[0].docPath} (1/${entries.length})`
    )

    // Open the first document (or trigger if already open)
    const firstDocId = entries[0].docId
    if (currentDocumentId === firstDocId) {
      // Document is already open — trigger the effect manually
      applyTriggerRef.current++
      setApplyTrigger(applyTriggerRef.current)
    } else {
      openDocWithId(firstDocId)
    }
  }, [reviewResult, currentDocumentId, openDocWithId])

  // -----------------------------------------------------------------------
  // Delete all AI Tutor comments
  // -----------------------------------------------------------------------
  const handleDeleteComments = useCallback(async () => {
    setIsDeleting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await deleteAiTutorComments(projectId)
      if (result.deleted > 0) {
        setSuccessMessage(
          `Deleted ${result.deleted} AI Tutor comment(s). Refresh the page to see changes.`
        )
      } else {
        setSuccessMessage('No AI Tutor comments found to delete.')
      }
    } catch (err) {
      console.error('[AI Tutor] Delete comments error:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to delete comments.'
      )
    } finally {
      setIsDeleting(false)
    }
  }, [projectId])

  // Helper to extract metadata from review result
  const projectMetadata: WholeProjectMetadata | undefined =
    reviewResult?.metadata

  return (
    <div className="ai-tutor-panel">
      <RailPanelHeader title="AI Tutor" />
      <div style={{ padding: '12px 16px' }}>
        {/* ── Delete AI Tutor Comments ── */}
        <OLButton
          variant="danger"
          size="sm"
          onClick={handleDeleteComments}
          disabled={isDeleting || isReviewing || isApplying}
          style={{ width: '100%', marginBottom: '12px' }}
        >
          {isDeleting ? 'Deleting...' : 'Delete All AI Tutor Comments'}
        </OLButton>

        {/* ── Model Selection ── */}
        <OLFormGroup controlId="ai-tutor-model" style={{ marginBottom: '12px' }}>
          <OLFormLabel>Model</OLFormLabel>
          <OLFormControl
            as="select"
            value={selectedModel}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedModel(e.target.value)
            }
            disabled={isReviewing || isApplying}
          >
            {MODEL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </OLFormControl>
        </OLFormGroup>

        {/* ── Venue Selection ── */}
        <OLFormGroup controlId="ai-tutor-venue" style={{ marginBottom: '12px' }}>
          <OLFormLabel>Target Venue</OLFormLabel>
          <OLFormControl
            as="select"
            value={selectedVenue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedVenue(e.target.value)
            }
            disabled={isReviewing || isApplying}
          >
            {VENUE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </OLFormControl>
        </OLFormGroup>

        {/* ── Full Paper Review ── */}
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #dee2e6',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
            }}
          >
            <MaterialIcon type="rate_review" />
            <strong>Full Paper Review</strong>
          </span>
          <p
            style={{ fontSize: '13px', color: '#333', margin: '0 0 8px 0' }}
          >
            Analyzes your project structure, classifies your paper type, then
            runs parallel reviewers for each section and aspect.
          </p>

          {/* Run Full Review button */}
          <OLButton
            variant="primary"
            onClick={handleFullReview}
            disabled={isReviewing || isApplying}
            style={{ width: '100%', marginBottom: '6px' }}
          >
            {isReviewing ? 'Reviewing paper...' : 'Run Full Review'}
          </OLButton>

          {reviewProgress && (
            <div
              style={{
                fontSize: '12px',
                color: '#0d6efd',
                padding: '6px 8px',
                backgroundColor: '#e7f1ff',
                borderRadius: '4px',
                marginBottom: '6px',
              }}
            >
              {reviewProgress}
            </div>
          )}

          {/* Apply comments */}
          {reviewResult && (
            <>
              <OLButton
                variant="success"
                onClick={handleApplyComments}
                disabled={isApplying}
                style={{ width: '100%', marginBottom: '6px' }}
              >
                {isApplying
                  ? 'Applying comments...'
                  : `Apply ${reviewResult.summary.total} Comments to All Files`}
              </OLButton>
              {applyProgress && (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#0d6efd',
                    padding: '6px 8px',
                    backgroundColor: '#e7f1ff',
                    borderRadius: '4px',
                    marginBottom: '6px',
                  }}
                >
                  {applyProgress}
                </div>
              )}
              {appliedCount > 0 && !isApplying && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#198754',
                    margin: '0 0 6px 0',
                  }}
                >
                  {appliedCount} comment(s) applied across all files.
                </p>
              )}
            </>
          )}

          {/* Review summary */}
          {reviewResult && (
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#222' }}>
                  Review summary ({reviewResult.summary.total} comments)
                </summary>
                <div style={{ padding: '6px 0' }}>
                  <p style={{ margin: '0 0 4px 0' }}>
                    <strong>Paper type:</strong>{' '}
                    {reviewResult.classification.paperType} —{' '}
                    {reviewResult.classification.paperTypeSummary}
                  </p>
                  <p style={{ margin: '0 0 4px 0' }}>
                    <strong>By category:</strong>
                  </p>
                  <ul
                    style={{
                      margin: '2px 0 6px 0',
                      paddingLeft: '18px',
                    }}
                  >
                    {Object.entries(reviewResult.summary.byCategory).map(
                      ([cat, count]) => (
                        <li key={cat}>
                          {cat}: {count as number}
                        </li>
                      )
                    )}
                  </ul>
                  <p style={{ margin: '0 0 4px 0' }}>
                    <strong>By severity:</strong>
                  </p>
                  <ul
                    style={{
                      margin: '2px 0 6px 0',
                      paddingLeft: '18px',
                    }}
                  >
                    {Object.entries(reviewResult.summary.bySeverity).map(
                      ([sev, count]) => (
                        <li key={sev}>
                          {sev}: {count as number}
                        </li>
                      )
                    )}
                  </ul>
                  <p style={{ margin: '0 0 4px 0' }}>
                    <strong>Comments by document:</strong>
                  </p>
                  <ul
                    style={{
                      margin: '2px 0 6px 0',
                      paddingLeft: '18px',
                    }}
                  >
                    {Object.entries(reviewResult.commentsByDoc).map(
                      ([docPath, comments]) => (
                        <li key={docPath}>
                          {docPath}: {(comments as ReviewComment[]).length}
                        </li>
                      )
                    )}
                  </ul>
                  {reviewResult.failedAgents.length > 0 && (
                    <>
                      <p
                        style={{
                          margin: '0 0 4px 0',
                          color: '#dc3545',
                        }}
                      >
                        <strong>Skipped agents:</strong>
                      </p>
                      <ul
                        style={{
                          margin: '2px 0 6px 0',
                          paddingLeft: '18px',
                        }}
                      >
                        {reviewResult.failedAgents.map(
                          (a: { id: string; name: string; reason: string }) => (
                            <li key={a.id}>
                              {a.name}: {a.reason}
                            </li>
                          )
                        )}
                      </ul>
                    </>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* File details from analysis metadata */}
          {projectMetadata && (
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#222' }}>
                  File details ({projectMetadata.categories.texFiles.count} TeX,{' '}
                  {projectMetadata.categories.figures.count} figures,{' '}
                  {projectMetadata.mergedTexLength.toLocaleString()} chars
                  merged)
                </summary>
                <div style={{ padding: '4px 0' }}>
                  <strong>TeX files (merged):</strong>
                  <ul style={{ margin: '2px 0 6px 0', paddingLeft: '18px' }}>
                    {projectMetadata.categories.texFiles.files.map(
                      (f: string) => (
                        <li key={f}>{f}</li>
                      )
                    )}
                  </ul>
                  {projectMetadata.categories.figures.count > 0 && (
                    <>
                      <strong>Figures:</strong>
                      <ul
                        style={{
                          margin: '2px 0 6px 0',
                          paddingLeft: '18px',
                        }}
                      >
                        {projectMetadata.categories.figures.files.map(
                          (f: string) => (
                            <li key={f}>{f}</li>
                          )
                        )}
                      </ul>
                    </>
                  )}
                  {projectMetadata.categories.bibFiles.count > 0 && (
                    <>
                      <strong>Bib files:</strong>
                      <ul
                        style={{
                          margin: '2px 0 6px 0',
                          paddingLeft: '18px',
                        }}
                      >
                        {projectMetadata.categories.bibFiles.files.map(
                          (f: string) => (
                            <li key={f}>{f}</li>
                          )
                        )}
                      </ul>
                    </>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* ── Status messages ── */}
        {error && (
          <div
            className="alert alert-danger"
            role="alert"
            style={{ marginTop: '12px', fontSize: '13px' }}
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            className="alert alert-success"
            role="alert"
            style={{ marginTop: '12px', fontSize: '13px' }}
          >
            {successMessage}
          </div>
        )}
      </div>
    </div>
  )
}

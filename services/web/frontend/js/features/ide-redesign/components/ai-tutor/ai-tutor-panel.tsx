import { useCallback, useEffect, useRef, useState } from 'react'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useRailContext } from '@/features/ide-react/context/rail-context'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useProjectContext } from '@/shared/context/project-context'
import { postJSON } from '@/infrastructure/fetch-json'
import RangesTracker from '@overleaf/ranges-tracker'
import {
  runFullReview,
  deleteAiTutorComments,
  fetchPaperFiles,
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
import {
  extractTextFromPdf,
  RoleModelPaper,
} from './extract-pdf-text'
import {
  ReviewSummary,
  FileDetails,
  ScopedFileControls,
} from './review-result-details'

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
  const [selectedModel, setSelectedModel] = useState('gpt-5.2-chat-latest')

  // Venue selection
  const [selectedVenue, setSelectedVenue] = useState('arxiv')

  // Role model papers
  const [roleModelFiles, setRoleModelFiles] = useState<File[]>([])
  const [roleModelTexts, setRoleModelTexts] = useState<RoleModelPaper[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete comments state
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null)
  // Per-file delete: the document we must open to read its comment ranges.
  const pendingDeleteRef = useRef<{ docPath: string; docId: string } | null>(
    null
  )
  const deleteTriggerRef = useRef(0)
  const [deleteTrigger, setDeleteTrigger] = useState(0)
  // Delete-all queue: remaining docPaths to delete after the current one. The
  // per-file delete is a single-pending-ref/open-doc flow, so a "Delete all"
  // must run them one at a time — the delete effect advances this on completion.
  const deleteQueueRef = useRef<string[]>([])

  // Full review state
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [reviewProgress, setReviewProgress] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)
  // Tracks which action produced the current reviewResult, so the summary,
  // file details, and apply controls render under the section that ran it.
  const [reviewSource, setReviewSource] = useState<
    'full' | 'scoped' | 'citation' | null
  >(null)

  // Auto-apply state
  const [isApplying, setIsApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<string | null>(null)
  const commentQueueRef = useRef<CommentQueue | null>(null)
  const applyTriggerRef = useRef(0)
  const [applyTrigger, setApplyTrigger] = useState(0)

  // Scoped (per-file) review state
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isScopedReviewing, setIsScopedReviewing] = useState(false)
  const [scopedProgress, setScopedProgress] = useState<string | null>(null)

  const { currentDocument, currentDocumentId } = useEditorOpenDocContext()
  const { openDocWithId } = useEditorManagerContext()
  const { projectId } = useProjectContext()
  const { selectedTab } = useRailContext()

  // Load the list of project .tex files whenever the Paper Mentor tab becomes
  // active so the user can pick a subset for a scoped review. The rail keeps
  // panels mounted across tab switches, so a mount-only fetch goes stale when
  // the user adds/removes files and returns to the tab. Keying on selectedTab
  // re-fetches on every activation (and the initial mount, since the tab is
  // already active then) without needing a page refresh.
  useEffect(() => {
    if (selectedTab !== 'ai-tutor') return
    let cancelled = false
    setIsLoadingFiles(true)
    fetchPaperFiles(projectId)
      .then(res => {
        if (cancelled) return
        if (res.success && res.files) {
          setAvailableFiles(res.files)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFiles(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, selectedTab])

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }, [])

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

    // Quick check that the document has content before starting
    if (!currentDocument.getSnapshot()) return

    const applyBatch = async () => {
      let applied = 0
      let skipped = 0

      for (const comment of entry.comments) {
        // Re-fetch snapshot for each comment to account for position shifts
        // from previously applied comment operations
        const currentSnap = currentDocument.getSnapshot()
        if (!currentSnap) {
          skipped++
          continue
        }

        const idx = currentSnap.indexOf(comment.highlightText)
        if (idx === -1) {
          skipped++
          continue
        }

        // Bounds check: ensure position + highlight length is within document
        if (idx + comment.highlightText.length > currentSnap.length) {
          console.warn(
            `[AI Tutor] Position out of range: idx=${idx}, highlight=${comment.highlightText.length}, doc=${currentSnap.length}`
          )
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
  // Role model paper file handling
  // -----------------------------------------------------------------------
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      const newFiles = [...roleModelFiles, ...files].slice(0, 3)
      setRoleModelFiles(newFiles)
      setExtractionError(null)
      setIsExtracting(true)

      try {
        const extracted: RoleModelPaper[] = await Promise.all(
          newFiles.map(async file => {
            const text = await extractTextFromPdf(file)
            if (text.trim().length < 100) {
              throw new Error(
                `"${file.name}" appears to contain no extractable text (scanned/image PDF?).`
              )
            }
            return { name: file.name, text }
          })
        )
        setRoleModelTexts(extracted)
      } catch (err) {
        console.error('[AI Tutor] PDF extraction error:', err)
        setExtractionError(
          err instanceof Error
            ? err.message
            : 'Failed to extract text from PDF.'
        )
        setRoleModelFiles(roleModelFiles)
      } finally {
        setIsExtracting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [roleModelFiles]
  )

  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFiles = roleModelFiles.filter((_, i) => i !== index)
      setRoleModelFiles(newFiles)
      if (newFiles.length === 0) {
        setRoleModelTexts([])
      } else {
        setRoleModelTexts(roleModelTexts.filter((_, i) => i !== index))
      }
      setExtractionError(null)
    },
    [roleModelFiles, roleModelTexts]
  )

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
    setReviewSource(null)
    setAppliedCount(0)

    try {
      const result = await runFullReview(
        projectId,
        selectedModel,
        selectedVenue,
        roleModelTexts
      )

      if (!result.success) {
        setError(result.error || 'Review failed.')
        setIsReviewing(false)
        setReviewProgress(null)
        return
      }

      setReviewResult(result.result!)
      setReviewSource('full')
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
  }, [projectId, selectedModel, selectedVenue, roleModelTexts])

  // -----------------------------------------------------------------------
  // Run a scoped review on only the selected files (same pipeline as full
  // review, restricted to the chosen files server-side).
  // -----------------------------------------------------------------------
  const handleScopedReview = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setError('Select at least one file to review.')
      return
    }
    setIsScopedReviewing(true)
    setError(null)
    setSuccessMessage(null)
    setScopedProgress(
      `Reviewing ${selectedFiles.length} selected file(s)... This may take a minute.`
    )
    setReviewResult(null)
    setReviewSource(null)
    setAppliedCount(0)

    try {
      const result = await runFullReview(
        projectId,
        selectedModel,
        selectedVenue,
        roleModelTexts,
        selectedFiles
      )

      if (!result.success) {
        setError(result.error || 'Review failed.')
        setScopedProgress(null)
        return
      }

      setReviewResult(result.result!)
      setReviewSource('scoped')
      setScopedProgress(null)

      const r = result.result!
      if (r.summary.total === 0) {
        setSuccessMessage(
          `Reviewed ${selectedFiles.length} file(s) — nothing to flag.`
        )
      } else {
        const failedNote =
          r.failedAgents.length > 0
            ? ` (${r.failedAgents.length} agent(s) skipped)`
            : ''
        setSuccessMessage(
          `Section review complete! ${r.summary.total} comments across ` +
          `${selectedFiles.length} file(s).${failedNote}`
        )
      }
    } catch (err) {
      console.error('[AI Tutor] Scoped review error:', err)
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      )
      setScopedProgress(null)
    } finally {
      setIsScopedReviewing(false)
    }
  }, [projectId, selectedModel, selectedVenue, roleModelTexts, selectedFiles])

  // -----------------------------------------------------------------------
  // Apply review comments. Pass a list of docPaths to apply only those files'
  // comments (per-file apply); pass nothing to apply across all reviewed docs.
  // -----------------------------------------------------------------------
  const applyCommentsForDocPaths = useCallback(
    (docPathFilter?: string[]) => {
      if (!reviewResult) {
        setError('No review results available.')
        return
      }

      const docPathToId = reviewResult.docPathToId || {}
      const filterSet = docPathFilter ? new Set(docPathFilter) : null

      // Build a queue of (docPath, docId, comments) entries
      const entries: CommentQueue['entries'] = []
      for (const [docPath, comments] of Object.entries(
        reviewResult.commentsByDoc
      )) {
        if (filterSet && !filterSet.has(docPath)) continue
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
    },
    [reviewResult, currentDocumentId, openDocWithId]
  )

  // Apply every reviewed document's comments (used by the Full Paper Review
  // section's single "Apply to All Files" button).
  const handleApplyComments = useCallback(
    () => applyCommentsForDocPaths(),
    [applyCommentsForDocPaths]
  )

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
          `Deleted ${result.deleted} Paper Mentor comment(s). Refresh the page to see changes.`
        )
      } else {
        setSuccessMessage('No Paper Mentor comments found to delete.')
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

  // Delete only this document's Paper Mentor comments. We open the doc so we
  // can read its comment thread ids from ranges, then ask the server to delete
  // the Paper Mentor ones among them (handled by the effect below).
  const handleDeleteCommentsForDoc = useCallback(
    (docPath: string) => {
      const docId = reviewResult?.docPathToId?.[docPath]
      if (!docId) {
        setError(`Could not resolve document "${docPath}".`)
        return
      }
      pendingDeleteRef.current = { docPath, docId }
      setIsDeleting(true)
      setError(null)
      setSuccessMessage(null)
      setDeleteProgress(`Deleting comments in ${docPath}...`)
      if (currentDocumentId === docId) {
        deleteTriggerRef.current++
        setDeleteTrigger(deleteTriggerRef.current)
      } else {
        openDocWithId(docId)
      }
    },
    [reviewResult, currentDocumentId, openDocWithId]
  )

  // Delete every reviewed file's Paper Mentor comments, one file at a time.
  // Seeds the delete queue with all-but-the-first docPath and kicks off the
  // first; the delete effect's finally drains the rest sequentially.
  const handleDeleteAllScoped = useCallback(() => {
    if (!reviewResult) return
    const docPathToId = reviewResult.docPathToId || {}
    const docPaths = Object.entries(reviewResult.commentsByDoc)
      .filter(([docPath, comments]) => comments.length > 0 && docPathToId[docPath])
      .map(([docPath]) => docPath)
    if (docPaths.length === 0) return
    deleteQueueRef.current = docPaths.slice(1)
    handleDeleteCommentsForDoc(docPaths[0])
  }, [reviewResult, handleDeleteCommentsForDoc])

  // When the document for a pending per-file delete is open, read its comment
  // thread ids and delete the Paper Mentor ones, then remove those ranges.
  useEffect(() => {
    const pending = pendingDeleteRef.current
    if (!pending || !currentDocument || !currentDocumentId) return
    if (pending.docId !== currentDocumentId) return
    if (currentDocument.doc_id !== currentDocumentId) return

    const ranges = (
      currentDocument as unknown as {
        ranges?: {
          comments?: Array<{ id: string }>
          removeCommentId?: (id: string) => void
        }
      }
    ).ranges

    const runDelete = async () => {
      try {
        const threadIds = (ranges?.comments || []).map(c => c.id)
        if (threadIds.length === 0) {
          setSuccessMessage(`No comments to delete in ${pending.docPath}.`)
        } else {
          const res = await deleteAiTutorComments(projectId, threadIds)
          for (const id of res.deletedIds || []) {
            ranges?.removeCommentId?.(id)
          }
          setSuccessMessage(
            res.deleted > 0
              ? `Deleted ${res.deleted} Paper Mentor comment(s) in ${pending.docPath}.`
              : `No Paper Mentor comments to delete in ${pending.docPath}.`
          )
        }
      } catch (err) {
        console.error('[AI Tutor] Per-file delete error:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to delete comments.'
        )
      } finally {
        pendingDeleteRef.current = null
        // Delete-all: if more files are queued, start the next one and keep the
        // deleting state on; otherwise we're done.
        const queue = deleteQueueRef.current
        if (queue.length > 0) {
          const next = queue.shift() as string
          handleDeleteCommentsForDoc(next)
        } else {
          setIsDeleting(false)
          setDeleteProgress(null)
        }
      }
    }

    runDelete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument, currentDocumentId, deleteTrigger])

  // Helper to extract metadata from review result
  const projectMetadata: WholeProjectMetadata | undefined =
    reviewResult?.metadata

  // Renders the "Apply N Comments to <scope>" button plus its progress and
  // done messages. Shared by the full-review and scoped-review sections — only
  // the scope wording differs.
  const renderApplyControls = (scopeLabel: string) =>
    reviewResult ? (
      <>
        <OLButton
          variant="success"
          onClick={handleApplyComments}
          disabled={isApplying}
          style={{ width: '100%', marginBottom: '6px' }}
        >
          {isApplying
            ? 'Applying comments...'
            : `Apply ${reviewResult.summary.total} Comments to ${scopeLabel}`}
        </OLButton>
        {applyProgress && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--blue-50)',
              padding: '6px 8px',
              backgroundColor: 'var(--bg-tertiary-themed)',
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
              color: 'var(--green-50)',
              margin: '0 0 6px 0',
            }}
          >
            {appliedCount} comment(s) applied to {scopeLabel}.
          </p>
        )}
      </>
    ) : null

  return (
    <div className="ai-tutor-panel" style={{ color: 'var(--content-primary-themed)' }}>
      <RailPanelHeader title="Paper Mentor" />
      <div className="ai-tutor-panel-body" style={{ padding: '12px 16px' }}>
        {/* ── Delete AI Tutor Comments ── */}
        <OLButton
          variant="danger"
          size="sm"
          onClick={handleDeleteComments}
          disabled={isDeleting || isReviewing || isScopedReviewing || isApplying}
          style={{ width: '100%', marginBottom: '12px' }}
        >
          {isDeleting ? 'Deleting...' : 'Delete All Paper Mentor Comments'}
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

        {/* ── Role Model Papers (Optional) ── */}
        <OLFormGroup
          controlId="ai-tutor-role-models"
          style={{ marginBottom: '12px' }}
        >
          <OLFormLabel>
            Role Model Papers{' '}
            <span style={{ fontSize: '11px', opacity: 0.65 }}>
              (optional, up to 3 PDFs)
            </span>
          </OLFormLabel>
          <div
            style={{
              border: '1px dashed var(--border-divider-themed)',
              borderRadius: '6px',
              padding: '10px',
              backgroundColor: 'var(--bg-secondary-themed)',
              marginBottom: '4px',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              disabled={
                isReviewing ||
                isApplying ||
                isExtracting ||
                roleModelFiles.length >= 3
              }
              style={{ fontSize: '12px', width: '100%' }}
            />
            <p
              style={{ fontSize: '11px', color: 'var(--content-secondary-themed)', margin: '6px 0 0 0' }}
            >
              Upload exemplary papers to compare structure and writing style (not
              content).
            </p>
          </div>
          {isExtracting && (
            <div
              style={{ fontSize: '12px', color: 'var(--blue-50)', marginTop: '4px' }}
            >
              Extracting text from PDF(s)...
            </div>
          )}
          {extractionError && (
            <div
              style={{ fontSize: '12px', color: 'var(--red-50)', marginTop: '4px' }}
            >
              {extractionError}
            </div>
          )}
          {roleModelFiles.length > 0 && (
            <ul
              style={{
                margin: '6px 0 0 0',
                paddingLeft: '18px',
                fontSize: '12px',
              }}
            >
              {roleModelFiles.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  style={{ marginBottom: '2px' }}
                >
                  {file.name}
                  {roleModelTexts[i] && (
                    <span style={{ opacity: 0.65 }}>
                      {' '}
                      ({(roleModelTexts[i].text.length / 1000).toFixed(0)}K
                      chars)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    disabled={isReviewing || isApplying}
                    style={{
                      marginLeft: '6px',
                      border: 'none',
                      background: 'none',
                      color: 'var(--red-50)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '0 2px',
                    }}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OLFormGroup>

        {/* ── Full Paper Review ── */}
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'var(--bg-secondary-themed)',
            borderRadius: '6px',
            border: '1px solid var(--border-divider-themed)',
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
            style={{ fontSize: '13px', color: 'var(--content-secondary-themed)', margin: '0 0 8px 0' }}
          >
            Analyzes your project structure, classifies your paper type, then
            runs parallel reviewers for each section and aspect.
          </p>

          {/* Run Full Review button */}
          <OLButton
            variant="primary"
            onClick={handleFullReview}
            disabled={isReviewing || isScopedReviewing || isApplying}
            style={{ width: '100%', marginBottom: '6px' }}
          >
            {isReviewing ? 'Reviewing paper...' : 'Run Full Review'}
          </OLButton>

          {reviewProgress && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--blue-50)',
                padding: '6px 8px',
                backgroundColor: 'var(--bg-tertiary-themed)',
                borderRadius: '4px',
                marginBottom: '6px',
              }}
            >
              {reviewProgress}
            </div>
          )}

          {/* Apply comments + summary + file details (full review / citation) */}
          {reviewSource !== 'scoped' && renderApplyControls('All Files')}

          {reviewResult && reviewSource !== 'scoped' && (
            <ReviewSummary reviewResult={reviewResult} />
          )}

          {projectMetadata && reviewSource !== 'scoped' && (
            <FileDetails projectMetadata={projectMetadata} />
          )}
        </div>

        {/* ── Review Specific Files ── */}
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'var(--bg-secondary-themed)',
            borderRadius: '6px',
            border: '1px solid var(--border-divider-themed)',
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
            <MaterialIcon type="fact_check" />
            <strong>Review Specific Files</strong>
          </span>
          <p
            style={{ fontSize: '13px', color: 'var(--content-secondary-themed)', margin: '0 0 8px 0' }}
          >
            Runs the same multi-agent review on only the files you select —
            ideal for iterating on one section at a time.
          </p>

          {/* File selection list */}
          <div
            style={{
              maxHeight: '160px',
              overflowY: 'auto',
              border: '1px solid var(--border-divider-themed)',
              borderRadius: '4px',
              padding: '6px 8px',
              marginBottom: '8px',
              backgroundColor: 'var(--bg-primary-themed)',
            }}
          >
            {isLoadingFiles ? (
              <span style={{ fontSize: '12px', color: 'var(--content-secondary-themed)' }}>
                Loading files…
              </span>
            ) : availableFiles.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--content-secondary-themed)' }}>
                No .tex files found in this project.
              </span>
            ) : (
              availableFiles.map(file => (
                <label
                  key={file}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    padding: '2px 0',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file)}
                    onChange={() => toggleFile(file)}
                    disabled={isReviewing || isScopedReviewing || isApplying}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {file}
                  </span>
                </label>
              ))
            )}
          </div>

          <OLButton
            variant="primary"
            onClick={handleScopedReview}
            disabled={
              selectedFiles.length === 0 ||
              isReviewing ||
              isScopedReviewing ||
              isApplying
            }
            style={{ width: '100%', marginBottom: '6px' }}
          >
            {isScopedReviewing
              ? 'Reviewing selected files...'
              : `Review Selected Files${
                  selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''
                }`}
          </OLButton>

          {scopedProgress && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--blue-50)',
                padding: '6px 8px',
                backgroundColor: 'var(--bg-tertiary-themed)',
                borderRadius: '4px',
              }}
            >
              {scopedProgress}
            </div>
          )}

          {/* Per-file apply/delete + summary + file details for the scoped review */}
          {reviewResult && reviewSource === 'scoped' && (
            <div style={{ marginTop: '8px' }}>
              <ScopedFileControls
                commentsByDoc={reviewResult.commentsByDoc}
                onApply={applyCommentsForDocPaths}
                onDelete={handleDeleteCommentsForDoc}
                onDeleteAll={handleDeleteAllScoped}
                isApplying={isApplying}
                isDeleting={isDeleting}
                applyProgress={applyProgress}
                deleteProgress={deleteProgress}
                appliedCount={appliedCount}
              />
              <ReviewSummary reviewResult={reviewResult} />
              {projectMetadata && (
                <FileDetails projectMetadata={projectMetadata} />
              )}
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

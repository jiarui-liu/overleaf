import OLButton from '@/shared/components/ol/ol-button'
import {
  ReviewComment,
  ReviewResult,
  WholeProjectMetadata,
} from '@/features/editor-left-menu/utils/ai-tutor-service'

// Count a file's comments by severity for the per-file card breakdown line.
function severityCounts(comments: ReviewComment[]) {
  let critical = 0
  let warning = 0
  let suggestion = 0
  for (const c of comments) {
    if (c.severity === 'critical') critical++
    else if (c.severity === 'warning') warning++
    else suggestion++
  }
  return { critical, warning, suggestion }
}

// Count a file's comments by category for the per-file "Review summary".
function categoryCounts(comments: ReviewComment[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const c of comments) {
    counts[c.category] = (counts[c.category] || 0) + 1
  }
  return counts
}

// Per-file "Review summary" + "File details" collapsibles, shown inside each
// reviewed file's card. The category/severity breakdowns are derived from that
// file's own comments; paper type / role models / skipped agents are global and
// repeated per card so each card reads as self-contained. File details reuses
// the shared FileDetails component, driven by this file's scoped metadata.
function FileCardSummary({
  comments,
  perFileMetadata,
  classification,
  roleModelPapers,
  failedAgents,
}: {
  comments: ReviewComment[]
  perFileMetadata?: WholeProjectMetadata
  classification: ReviewResult['classification']
  roleModelPapers?: string[]
  failedAgents: ReviewResult['failedAgents']
}) {
  const byCategory = categoryCounts(comments)
  const { critical, warning, suggestion } = severityCounts(comments)
  return (
    <div className="ai-tutor-file-card__meta">
      <div style={{ fontSize: '12px' }}>
        <details>
          <summary
            style={{ cursor: 'pointer', color: 'var(--content-primary-themed)' }}
          >
            Review summary ({comments.length} comments)
          </summary>
          <div style={{ padding: '6px 0' }}>
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>Paper type:</strong> {classification.paperType} —{' '}
              {classification.paperTypeSummary}
            </p>
            {roleModelPapers && roleModelPapers.length > 0 && (
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>Role models:</strong> {roleModelPapers.join(', ')}
              </p>
            )}
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>By category:</strong>
            </p>
            <ul style={{ margin: '2px 0 6px 0', paddingLeft: '18px' }}>
              {Object.entries(byCategory).map(([cat, count]) => (
                <li key={cat}>
                  {cat}: {count}
                </li>
              ))}
            </ul>
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>By severity:</strong>
            </p>
            <ul style={{ margin: '2px 0 6px 0', paddingLeft: '18px' }}>
              <li>critical: {critical}</li>
              <li>warning: {warning}</li>
              <li>suggestion: {suggestion}</li>
            </ul>
            {failedAgents.length > 0 && (
              <>
                <p style={{ margin: '0 0 4px 0', color: 'var(--red-50)' }}>
                  <strong>Skipped agents:</strong>
                </p>
                <ul style={{ margin: '2px 0 6px 0', paddingLeft: '18px' }}>
                  {failedAgents.map(a => (
                    <li key={a.id}>
                      {a.name}: {a.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      </div>
      {perFileMetadata && <FileDetails projectMetadata={perFileMetadata} />}
    </div>
  )
}

// Per-file apply/delete results for a scoped ("Review Specific Files") run.
// Shows a master summary bar (Apply all / Delete all) above one card per
// reviewed file that has issues — each with a severity breakdown and its own
// Apply / Delete actions. Files with zero comments are hidden. All async state
// (applying/deleting + progress/applied messages) is owned by the panel and
// passed in, so this component stays presentational.
export function ScopedFileControls({
  reviewResult,
  commentsByDoc,
  onApply,
  onDelete,
  onDeleteAll,
  isApplying,
  isDeleting,
  applyProgress,
  deleteProgress,
  appliedCount,
}: {
  reviewResult: ReviewResult
  commentsByDoc: Record<string, ReviewComment[]>
  onApply: (docPaths: string[]) => void
  onDelete: (docPath: string) => void
  onDeleteAll: () => void
  isApplying: boolean
  isDeleting: boolean
  applyProgress?: string | null
  deleteProgress?: string | null
  appliedCount: number
}) {
  const entries = Object.entries(commentsByDoc).filter(
    ([, comments]) => comments.length > 0
  )
  if (entries.length === 0) return null

  const allDocPaths = entries.map(([docPath]) => docPath)
  const totalComments = entries.reduce(
    (sum, [, comments]) => sum + comments.length,
    0
  )
  const busy = isApplying || isDeleting

  return (
    <div className="ai-tutor-scoped-results">
      {entries.length > 1 && (
        <div className="ai-tutor-scoped-summary-bar">
          <span className="ai-tutor-scoped-summary-bar__label">
            Reviewed {entries.length} files · {totalComments} comments
          </span>
          <div className="ai-tutor-scoped-summary-bar__actions">
            <OLButton
              variant="success"
              size="sm"
              onClick={() => onApply(allDocPaths)}
              disabled={busy}
            >
              Apply all {totalComments}
            </OLButton>
            <OLButton
              variant="danger"
              size="sm"
              onClick={onDeleteAll}
              disabled={busy}
            >
              Delete all
            </OLButton>
          </div>
        </div>
      )}

      {entries.map(([docPath, comments]) => {
        const { critical, warning, suggestion } = severityCounts(comments)
        return (
          <div key={docPath} className="ai-tutor-file-card">
            <div className="ai-tutor-file-card__header">
              <span
                className="ai-tutor-file-card__filename"
                title={docPath}
              >
                {docPath}
              </span>
              <span className="ai-tutor-file-card__count">
                {comments.length} {comments.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>
            <div className="ai-tutor-file-card__severity">
              <span className="ai-tutor-sev--critical">{critical} critical</span>
              {' · '}
              <span className="ai-tutor-sev--warning">{warning} warning</span>
              {' · '}
              <span className="ai-tutor-sev--suggestion">
                {suggestion} suggestion
              </span>
            </div>
            <FileCardSummary
              comments={comments}
              perFileMetadata={reviewResult.metadataByDoc?.[docPath]}
              classification={reviewResult.classification}
              roleModelPapers={reviewResult.roleModelPapers}
              failedAgents={reviewResult.failedAgents}
            />
            <div className="ai-tutor-file-card__actions">
              <OLButton
                variant="success"
                size="sm"
                onClick={() => onApply([docPath])}
                disabled={busy}
              >
                Apply {comments.length} changes
              </OLButton>
              <OLButton
                variant="danger"
                size="sm"
                onClick={() => onDelete(docPath)}
                disabled={busy}
              >
                Delete
              </OLButton>
            </div>
          </div>
        )
      })}

      {applyProgress && (
        <div className="ai-tutor-scoped-progress">{applyProgress}</div>
      )}
      {deleteProgress && (
        <div className="ai-tutor-scoped-progress">{deleteProgress}</div>
      )}
      {appliedCount > 0 && !isApplying && (
        <p className="ai-tutor-scoped-applied">
          {appliedCount} comment(s) applied.
        </p>
      )}
    </div>
  )
}

// Collapsible summary of a review result (paper type, counts by category and
// severity, comments per document, and any skipped agents). Shared by the Full
// Paper Review and Review Specific Files sections so both render identically.
export function ReviewSummary({
  reviewResult,
}: {
  reviewResult: ReviewResult
}) {
  return (
    <div style={{ marginTop: '4px', fontSize: '12px' }}>
      <details>
        <summary
          style={{ cursor: 'pointer', color: 'var(--content-primary-themed)' }}
        >
          Review summary ({reviewResult.summary.total} comments)
        </summary>
        <div style={{ padding: '6px 0' }}>
          <p style={{ margin: '0 0 4px 0' }}>
            <strong>Paper type:</strong>{' '}
            {reviewResult.classification.paperType} —{' '}
            {reviewResult.classification.paperTypeSummary}
          </p>
          {reviewResult.roleModelPapers &&
            reviewResult.roleModelPapers.length > 0 && (
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>Role models:</strong>{' '}
                {reviewResult.roleModelPapers.join(', ')}
              </p>
            )}
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
                  color: 'var(--red-50)',
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
  )
}

// Collapsible breakdown of the files the analysis ingested (TeX, figures,
// bib). Driven entirely by the review result's project metadata.
export function FileDetails({
  projectMetadata,
}: {
  projectMetadata: WholeProjectMetadata
}) {
  return (
    <div style={{ marginTop: '4px', fontSize: '12px' }}>
      <details>
        <summary
          style={{ cursor: 'pointer', color: 'var(--content-primary-themed)' }}
        >
          File details ({projectMetadata.categories.texFiles.count} TeX,{' '}
          {projectMetadata.categories.figures.count} figures,{' '}
          {projectMetadata.mergedTexLength.toLocaleString()} chars merged)
        </summary>
        <div style={{ padding: '4px 0' }}>
          <strong>TeX files (merged):</strong>
          <ul style={{ margin: '2px 0 6px 0', paddingLeft: '18px' }}>
            {projectMetadata.categories.texFiles.files.map((f: string) => (
              <li key={f}>{f}</li>
            ))}
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
                {projectMetadata.categories.figures.files.map((f: string) => (
                  <li key={f}>{f}</li>
                ))}
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
                {projectMetadata.categories.bibFiles.files.map((f: string) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </div>
  )
}

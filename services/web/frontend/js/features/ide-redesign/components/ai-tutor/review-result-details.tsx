import {
  ReviewComment,
  ReviewResult,
  WholeProjectMetadata,
} from '@/features/editor-left-menu/utils/ai-tutor-service'

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

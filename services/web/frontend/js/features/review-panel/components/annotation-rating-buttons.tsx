import { FC, useCallback } from 'react'
import { useAnnotationContext } from '../context/annotation-context'
import { AnnotationRatings } from '../types/annotation'

const DIMENSIONS: {
  key: keyof AnnotationRatings
  label: string
  description: string
}[] = [
  {
    key: 'validity',
    label: 'Valid',
    description: 'Is the feedback factually correct and relevant to the text?',
  },
  {
    key: 'actionability',
    label: 'Actionable',
    description:
      'Does the feedback clearly suggest what the author should change?',
  },
  {
    key: 'conciseness',
    label: 'Concise',
    description:
      'Is the feedback brief and to the point without unnecessary detail?',
  },
]

export const AnnotationRatingButtons: FC<{
  threadId: string
  commentContent: string
}> = ({ threadId, commentContent }) => {
  const { annotations, setRating } = useAnnotationContext()
  const annotation = annotations[threadId]

  const handleClick = useCallback(
    (dimension: keyof AnnotationRatings, value: number) => {
      const current = annotation?.ratings?.[dimension]
      // Toggle off if clicking same value
      setRating(
        threadId,
        commentContent,
        dimension,
        current === value ? null : value
      )
    },
    [annotation, threadId, commentContent, setRating]
  )

  return (
    <div className="annotation-ratings">
      <div className="annotation-instruction">
        Rate each aspect of this AI comment:
      </div>
      {DIMENSIONS.map(({ key, label, description }) => (
        <div key={key} className="annotation-rating-row">
          <div className="annotation-rating-question">
            <span className="annotation-rating-label">{label}</span>
            <span className="annotation-rating-description">{description}</span>
          </div>
          <div className="annotation-rating-buttons">
            <button
              type="button"
              className={`annotation-rating-btn annotation-rating-btn-no${
                annotation?.ratings?.[key] === 0 ? ' active' : ''
              }`}
              onClick={() => handleClick(key, 0)}
            >
              No
            </button>
            <button
              type="button"
              className={`annotation-rating-btn annotation-rating-btn-yes${
                annotation?.ratings?.[key] === 1 ? ' active' : ''
              }`}
              onClick={() => handleClick(key, 1)}
            >
              Yes
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

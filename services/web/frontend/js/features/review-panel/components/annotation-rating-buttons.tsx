import { FC, useCallback } from 'react'
import { useAnnotationContext } from '../context/annotation-context'
import { AnnotationRatings } from '../types/annotation'

const DIMENSIONS: { key: keyof AnnotationRatings; label: string }[] = [
  { key: 'validity', label: 'Validity' },
  { key: 'actionability', label: 'Actionability' },
  { key: 'conciseness', label: 'Conciseness' },
]

const SCALE = [1, 2, 3, 4, 5]

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
      {DIMENSIONS.map(({ key, label }) => (
        <div key={key} className="annotation-rating-row">
          <span className="annotation-rating-label">{label}</span>
          <div className="annotation-rating-buttons">
            {SCALE.map(value => (
              <button
                key={value}
                type="button"
                className={`annotation-rating-btn${
                  annotation?.ratings?.[key] === value ? ' active' : ''
                }`}
                onClick={() => handleClick(key, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

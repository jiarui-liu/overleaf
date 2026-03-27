import { FC, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import ReviewPanelTabs from './review-panel-tabs'
import ReviewPanelHeader from './review-panel-header'
import ReviewPanelCurrentFile from './review-panel-current-file'
import { ReviewPanelOverview } from './review-panel-overview'
import classnames from 'classnames'
import { useReviewPanelStyles } from '@/features/review-panel/hooks/use-review-panel-styles'
import { useReviewPanelViewContext } from '../context/review-panel-view-context'
import { useIsNewEditorEnabled } from '@/features/ide-redesign/utils/new-editor-utils'

const MIN_REVIEW_PANEL_WIDTH = 150
const MAX_REVIEW_PANEL_WIDTH = 600

const ReviewPanel: FC<{ mini?: boolean }> = ({ mini = false }) => {
  const choosenSubView = useReviewPanelViewContext()
  const newEditor = useIsNewEditorEnabled()
  const innerRef = useRef<HTMLDivElement>(null)

  const activeSubView = useMemo(
    () => (mini ? 'cur_file' : choosenSubView),
    [choosenSubView, mini]
  )

  const style = useReviewPanelStyles()

  // Restore persisted width on mount
  useEffect(() => {
    if (mini) return
    const saved = localStorage.getItem('review-panel-width')
    if (saved) {
      const width = parseInt(saved, 10)
      if (width >= MIN_REVIEW_PANEL_WIDTH && width <= MAX_REVIEW_PANEL_WIDTH) {
        document.documentElement.style.setProperty(
          '--review-panel-width',
          `${width}px`
        )
      }
    }
  }, [mini])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (mini) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--review-panel-width'
        ),
        10
      )

      // In new editor, panel is on the LEFT (order: -1).
      // Dragging right = increasing width. delta = moveX - startX
      // In old editor, panel is on the RIGHT.
      // Dragging left = increasing width. delta = startX - moveX
      const isNewEditor = !!document.querySelector('.ide-redesign-main')

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = isNewEditor
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX
        const newWidth = Math.min(
          MAX_REVIEW_PANEL_WIDTH,
          Math.max(MIN_REVIEW_PANEL_WIDTH, startWidth + delta)
        )
        document.documentElement.style.setProperty(
          '--review-panel-width',
          `${newWidth}px`
        )
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')

        const finalWidth = parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--review-panel-width'
          ),
          10
        )
        localStorage.setItem('review-panel-width', String(finalWidth))
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [mini]
  )

  const className = classnames('review-panel-container', {
    'review-panel-mini': mini,
    'review-panel-subview-overview': activeSubView === 'overview',
  })

  return (
    <div
      className={className}
      style={style}
      data-testid="review-panel"
    >
      <div id="review-panel-inner" className="review-panel-inner" ref={innerRef}>
        {!newEditor && !mini && <ReviewPanelHeader />}

        {activeSubView === 'cur_file' && <ReviewPanelCurrentFile />}
        {activeSubView === 'overview' && <ReviewPanelOverview />}

        <div
          className="review-panel-footer"
          id="review-panel-tabs"
          role="tablist"
        >
          <ReviewPanelTabs />
        </div>
        {!mini && (
          <div
            className="review-panel-resize-handle"
            onMouseDown={handleResizeStart}
          />
        )}
      </div>
    </div>
  )
}

export default memo(ReviewPanel)

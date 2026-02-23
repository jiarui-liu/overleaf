import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'

export default function AnnotationPanel() {
  return (
    <div className="annotation-panel">
      <RailPanelHeader title="Annotation Guide" />
      <div className="annotation-panel-body">
        <p>
          Rate each AI Tutor comment on the following three dimensions using a
          1-5 Likert scale.
        </p>

        <h5>Validity</h5>
        <p>
          Is the comment factually correct and relevant to the text it
          highlights?
        </p>
        <ul>
          <li>
            <strong>1</strong> — Completely wrong or irrelevant
          </li>
          <li>
            <strong>2</strong> — Mostly incorrect
          </li>
          <li>
            <strong>3</strong> — Partially correct
          </li>
          <li>
            <strong>4</strong> — Mostly correct
          </li>
          <li>
            <strong>5</strong> — Fully correct and relevant
          </li>
        </ul>

        <h5>Actionability</h5>
        <p>
          Does the comment provide clear, specific guidance that the author can
          act on?
        </p>
        <ul>
          <li>
            <strong>1</strong> — No actionable guidance
          </li>
          <li>
            <strong>2</strong> — Vague suggestion
          </li>
          <li>
            <strong>3</strong> — Somewhat actionable
          </li>
          <li>
            <strong>4</strong> — Clear and actionable
          </li>
          <li>
            <strong>5</strong> — Highly specific and immediately actionable
          </li>
        </ul>

        <h5>Conciseness</h5>
        <p>
          Is the comment appropriately concise without omitting important
          information?
        </p>
        <ul>
          <li>
            <strong>1</strong> — Extremely verbose or too terse
          </li>
          <li>
            <strong>2</strong> — Could be significantly shorter/longer
          </li>
          <li>
            <strong>3</strong> — Acceptable length
          </li>
          <li>
            <strong>4</strong> — Well-balanced
          </li>
          <li>
            <strong>5</strong> — Perfectly concise
          </li>
        </ul>

        <h5>Instructions</h5>
        <ul>
          <li>Click a number (1-5) to set a rating</li>
          <li>Click the same number again to clear it</li>
          <li>Ratings are saved automatically</li>
          <li>Only AI Tutor comments show rating buttons</li>
        </ul>
      </div>
    </div>
  )
}

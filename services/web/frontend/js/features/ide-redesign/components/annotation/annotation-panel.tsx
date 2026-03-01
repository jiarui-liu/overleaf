import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'

export default function AnnotationPanel() {
  return (
    <div className="annotation-panel">
      <RailPanelHeader title="Annotation Guide" />
      <div className="annotation-panel-body">
        <p>
          For each Paper Mentor comment, answer <strong>Yes</strong> or{' '}
          <strong>No</strong> on the following three questions.
        </p>

        <h5>Valid</h5>
        <p>Is the feedback factually correct and relevant to the text?</p>
        <ul>
          <li>
            <strong>Yes</strong> — The comment accurately identifies a real issue
            or makes a correct observation about the highlighted text.
          </li>
          <li>
            <strong>No</strong> — The comment is factually wrong, misinterprets
            the text, or is irrelevant to the highlighted passage.
          </li>
        </ul>

        <h5>Actionable</h5>
        <p>Does the feedback clearly suggest what the author should change?</p>
        <ul>
          <li>
            <strong>Yes</strong> — The comment provides specific guidance that
            the author can follow to improve the paper.
          </li>
          <li>
            <strong>No</strong> — The comment is vague, merely points out a
            problem without suggesting how to fix it, or the suggested action is
            unclear.
          </li>
        </ul>

        <h5>Concise</h5>
        <p>
          Is the feedback brief and to the point without unnecessary detail?
        </p>
        <ul>
          <li>
            <strong>Yes</strong> — The comment conveys its message efficiently
            without excessive verbosity or repetition.
          </li>
          <li>
            <strong>No</strong> — The comment is unnecessarily long, repetitive,
            or includes irrelevant information.
          </li>
        </ul>

        <h5>Instructions</h5>
        <ul>
          <li>
            Click <strong>Yes</strong> or <strong>No</strong> for each question
          </li>
          <li>Click the same button again to clear your selection</li>
          <li>Ratings are saved automatically</li>
          <li>Only Paper Mentor comments show rating buttons</li>
        </ul>
      </div>
    </div>
  )
}

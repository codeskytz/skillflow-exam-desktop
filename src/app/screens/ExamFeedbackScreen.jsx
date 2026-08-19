import { useEffect, useState } from 'react';
import { AppButton, BrandMark } from '../components/ui';
import { getMySubmission } from '../api';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * A past submission with the teacher's marks, mirroring the mobile
 * ExamFeedbackScreen. Read-only: this is where a student sees what they got and
 * what the teacher wrote, per question.
 */
export default function ExamFeedbackScreen({ navigation, route }) {
  const submissionId = route.params?.submissionId;

  const [submission, setSubmission] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMySubmission(submissionId)
      .then(setSubmission)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [submissionId]);

  const back = () => navigation.reset({ routes: [{ name: 'Dashboard' }] });

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-center"><p className="muted">Loading your result…</p></div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="screen">
        <div className="screen-center">
          <div className="card card-narrow" style={{ textAlign: 'center' }}>
            <p className="error">{error || 'That result could not be found.'}</p>
            <AppButton title="Back to dashboard" onClick={back} className="btn-block" />
          </div>
        </div>
      </div>
    );
  }

  const isGraded = submission.status === 'graded';
  const total = submission.total || 0;
  const pct = total ? Math.round((submission.score / total) * 100) : null;
  const answers = submission.answers || [];

  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={back} aria-label="Back">←</button>
        <BrandMark />
        <h1>{submission.exam_title || 'Your result'}</h1>
      </header>

      <div className="content">
        <div className="content-narrow">
          <div className="stat-row">
            <div className="stat-tile">
              <strong>{isGraded ? `${submission.score}/${total}` : '—'}</strong>
              <span>Score</span>
            </div>
            <div className="stat-tile">
              <strong>{isGraded && pct !== null ? `${pct}%` : '—'}</strong>
              <span>Percentage</span>
            </div>
            <div className="stat-tile">
              <strong>{isGraded ? (pct >= 50 ? 'Passed' : 'Failed') : 'Pending'}</strong>
              <span>Status</span>
            </div>
          </div>

          {!isGraded ? (
            <div className="empty" style={{ marginBottom: 20 }}>
              Your teacher has not finished marking this exam yet.
            </div>
          ) : null}

          <h2 className="section-title">Questions</h2>

          {answers.length === 0 ? (
            <div className="empty">No answer breakdown is available for this exam.</div>
          ) : (
            <div className="sub-list">
              {answers.map((a, i) => {
                // is_correct stays null for written answers until a teacher marks them.
                const correct = a.is_correct === true;
                const wrong = a.is_correct === false;
                const isChoice = a.type === 'mcq' || a.type === 'tf';

                /*
                 * The API calls this student_answer, and for a choice question it
                 * is the option index as a string. Reading it as "answer" — which
                 * this screen did — made every answer render as a dash.
                 */
                const given = a.student_answer;
                const hasAnswer = given !== null && given !== undefined && given !== '';
                const shown = !hasAnswer
                  ? 'No answer'
                  : isChoice
                    ? `${LETTERS[Number(given)] ?? '?'}. ${a.options?.[Number(given)] ?? ''}`.trim()
                    : given;

                const correctShown =
                  isChoice && a.correct_answer !== null && a.correct_answer !== undefined
                    ? `${LETTERS[Number(a.correct_answer)] ?? '?'}. ${a.options?.[Number(a.correct_answer)] ?? ''}`.trim()
                    : null;

                return (
                  <div key={a.answer_id || i} className="sub-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                    <span className="option-key" style={{ marginTop: 2 }}>{i + 1}</span>
                    <div className="sub-row-body">
                      <strong>{a.question || `Question ${i + 1}`}</strong>
                      <span>Your answer: {shown}</span>
                      {wrong && correctShown ? (
                        <span style={{ color: 'var(--success)', display: 'block', marginTop: 4 }}>
                          Correct answer: {correctShown}
                        </span>
                      ) : null}
                      {a.comment ? (
                        <span style={{ color: 'var(--gold-light)', display: 'block', marginTop: 4 }}>
                          Teacher: {a.comment}
                        </span>
                      ) : null}
                    </div>
                    <span className={`pill ${correct ? 'pill-graded' : 'pill-pending'}`}>
                      {correct ? 'Correct' : wrong ? 'Incorrect' : a.marks != null ? `${a.marks} marks` : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <AppButton title="Back to dashboard" onClick={back} className="btn-block" />
        </div>
      </div>
    </div>
  );
}

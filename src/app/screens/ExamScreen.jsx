import { useCallback, useEffect, useRef, useState } from 'react';
import { AppButton, AppModal } from '../components/ui';
import { submitExam } from '../api';
import { getSession } from '../session';

/**
 * Sitting the paper, mirroring the mobile ExamScreen.
 *
 * The rules are the exam's, not the app's: duration, randomise_questions,
 * auto_submit_on_leave and prevent_screenshot all come from the server and are
 * honoured here exactly as the mobile app honours them. What differs is only
 * how "leaving" is detected — window blur and minimise instead of AppState —
 * and that the window is put into kiosk mode for the duration.
 *
 * Submission happens exactly once. Timer expiry, leaving the window, the submit
 * button and quitting the app all funnel through the same guarded call, because
 * two of them firing together would otherwise create two submissions.
 */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

export default function ExamScreen({ navigation, route }) {
  const exam = route.params?.exam;

  const [questions] = useState(() =>
    exam?.randomize_questions ? shuffle(exam.questions || []) : exam?.questions || [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState((exam?.duration || 0) * 60);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [leftWindow, setLeftWindow] = useState(false);

  const timerRef = useRef(null);
  const answersRef = useRef(answers);
  const submitStartedRef = useRef(false);
  answersRef.current = answers;

  /** The one path to a submission. Guarded so it can never run twice. */
  const submitAnswers = useCallback(async () => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;

    clearInterval(timerRef.current);
    setSubmitting(true);

    try {
      const session = await getSession();

      if (!session?.token) {
        setSubmitError('You are not signed in. Your result could not be recorded.');
        return;
      }

      const payload = questions.map((q, i) => ({
        question_id: q.id,
        answer: answersRef.current[i] !== undefined ? String(answersRef.current[i]) : null,
      }));

      setServerResult(await submitExam(exam.id, payload));
    } catch (err) {
      // The result screen still renders from local grading, so a network
      // failure loses the record but not the student's sense of how they did.
      setSubmitError(
        err?.message || 'Your answers could not be synced. Your result may not be recorded.',
      );
    } finally {
      setSubmitting(false);
      setSubmitted(true);
      // The paper is over: hand the desktop back to the student.
      window.examShell?.unlockAfterExam();
    }
  }, [exam, questions]);

  // The countdown. Reaching zero submits whatever has been answered.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          submitAnswers();

          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [submitAnswers]);

  /*
   * Lockdown for the duration of the paper: kiosk mode, always on top, and
   * excluded from screen capture where the OS allows it. Released in the
   * cleanup so a crash or an early exit cannot strand the machine in kiosk.
   */
  useEffect(() => {
    window.examShell?.lockForExam();

    return () => {
      window.examShell?.unlockAfterExam();
    };
  }, []);

  /*
   * Leaving the window. On mobile this is AppState going inactive; here the
   * main process reports blur or minimise. Whether it auto-submits is the
   * exam's decision, exactly as on mobile — otherwise it is recorded and shown.
   */
  useEffect(() => {
    const off = window.examShell?.onLeftWindow(() => {
      if (submitStartedRef.current) return;

      setLeftWindow(true);

      if (exam?.auto_submit_on_leave) {
        submitAnswers();
      }
    });

    return off;
  }, [exam, submitAnswers]);

  // Alt+F4 and the window close button, refused by main until confirmed here.
  useEffect(() => {
    const off = window.examShell?.onCloseRequested(async () => {
      if (submitStartedRef.current) return;

      const reallyQuit = await window.examShell?.confirmQuit();

      if (reallyQuit) {
        await submitAnswers();
        window.examShell?.forceClose();
      }
    });

    return off;
  }, [submitAnswers]);

  if (!exam) {
    return (
      <div className="screen">
        <div className="screen-center">
          <div className="card card-narrow" style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: 16 }}>Exam not found</h2>
            <AppButton title="Back to dashboard" onClick={() => navigation.reset({ routes: [{ name: 'Dashboard' }] })} />
          </div>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="screen">
        <div className="screen-center">
          <div style={{ textAlign: 'center' }}>
            <div className="btn-spinner" style={{ width: 40, height: 40, borderWidth: 4, margin: '0 auto 18px' }} />
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Submitting your answers…</h2>
            <p className="muted small" style={{ marginTop: 6 }}>Do not close the app.</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    // Locally graded from the answer keys the exam payload carries, then
    // overridden by the server's marks when the submission got through.
    const auto = questions.filter((q) => q.answer !== null && q.answer !== undefined);
    const localScore = auto.reduce(
      (acc, q) => acc + (answers[questions.indexOf(q)] === q.answer ? 1 : 0),
      0,
    );

    const autoScore = serverResult ? serverResult.auto_score : localScore;
    const autoTotal = serverResult ? serverResult.total_auto : auto.length;
    const manualTotal = serverResult ? serverResult.total_manual : questions.length - auto.length;
    const percentage = autoTotal ? Math.round((autoScore / autoTotal) * 100) : 100;
    const passed = percentage >= 50;

    return (
      <div className="screen">
        <div className="content">
          <div className="result">
            <div className={`result-badge ${passed ? 'result-pass' : 'result-fail'}`}>
              {passed ? '✓' : '✕'}
            </div>
            <h2>{passed ? 'Exam completed' : 'Exam submitted'}</h2>
            <p>{passed ? 'Great job, keep it up.' : 'Better luck next time.'}</p>

            <div className="result-card">
              <div className="result-row"><span>Score</span><span>{autoScore} / {autoTotal}</span></div>
              <div className="result-row"><span>Percentage</span><span>{percentage}%</span></div>
              {manualTotal > 0 ? (
                <div className="result-row">
                  <span>Open questions</span>
                  <span style={{ color: 'var(--gold-dark)' }}>Awaiting teacher grading</span>
                </div>
              ) : null}
              <div className="result-row">
                <span>Status</span>
                <span style={{ color: passed ? 'var(--success)' : 'var(--danger)' }}>
                  {passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            </div>

            {submitError ? <p className="error">{submitError}</p> : null}

            <AppButton
              title="Back to dashboard"
              onClick={() => navigation.reset({ routes: [{ name: 'Dashboard' }] })}
              className="btn-block"
            />
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const selected = answers[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const isText = question.type === 'qa' || question.type === 'essay';
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const setAnswer = (value) => setAnswers((prev) => ({ ...prev, [currentIndex]: value }));

  return (
    <div className="screen">
      <header className="exam-head">
        <button type="button" className="icon-btn" onClick={() => setExitVisible(true)} aria-label="Exit exam">✕</button>
        <div className="exam-head-center">
          <h2>{exam.title}</h2>
          <span>Question {currentIndex + 1} of {questions.length}</span>
        </div>
        <span className={`timer ${timeLeft <= 60 ? 'timer-low' : ''}`}>{formatTime(timeLeft)}</span>
      </header>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="exam-body">
        <div className="exam-inner">
          {leftWindow && !exam.auto_submit_on_leave ? (
            <p className="leave-warning">
              You left the exam window. This has been noted — stay in the app until you submit.
            </p>
          ) : null}

          <div className="question-card">{question.question}</div>

          {isText ? (
            <>
              <textarea
                className="text-answer"
                value={typeof selected === 'string' ? selected : ''}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={
                  question.type === 'essay'
                    ? 'Write your detailed explanation here…'
                    : 'Type your answer here…'
                }
                autoFocus
              />
              <p className="muted small" style={{ marginTop: 8 }}>
                {question.type === 'essay'
                  ? 'Provide a full explanation to support your answer.'
                  : 'Write a clear, concise answer.'}
              </p>
            </>
          ) : (
            <div className="options">
              {(question.options || []).map((option, index) => (
                <button
                  key={index}
                  type="button"
                  className={`option ${selected === index ? 'option-on' : ''}`}
                  onClick={() => setAnswer(index)}
                >
                  <span className="option-key">{String.fromCharCode(65 + index)}</span>
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="exam-foot">
        <AppButton
          title="Previous"
          variant="ghost"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        />
        <AppButton
          title={isLast ? 'Submit exam' : 'Next question'}
          onClick={() => (isLast ? setConfirmVisible(true) : setCurrentIndex((i) => i + 1))}
        />
      </footer>

      <AppModal
        visible={confirmVisible}
        icon="warning"
        title="Submit your exam?"
        text={`You have answered ${Object.keys(answers).length} of ${questions.length} questions. You cannot change your answers after submitting.`}
        confirmButtonText="Submit"
        cancelButtonText="Keep working"
        onConfirm={() => {
          setConfirmVisible(false);
          submitAnswers();
        }}
        onCancel={() => setConfirmVisible(false)}
        onClose={() => setConfirmVisible(false)}
      />

      <AppModal
        visible={exitVisible}
        icon="danger"
        title="Leave the exam?"
        text="Leaving now submits the answers you have given so far. This cannot be undone."
        confirmButtonText="Submit and leave"
        cancelButtonText="Stay"
        onConfirm={() => {
          setExitVisible(false);
          submitAnswers();
        }}
        onCancel={() => setExitVisible(false)}
        onClose={() => setExitVisible(false)}
      />
    </div>
  );
}

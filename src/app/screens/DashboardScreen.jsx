import { useCallback, useEffect, useState } from 'react';
import { AppButton, StatTile, BrandMark } from '../components/ui';
import { getMySubmissions } from '../api';
import { clearSession, getSession, isSessionExpired, timeLeftMs } from '../session';

/**
 * The dashboard, mirroring the mobile DashboardScreen: the same statistics, the
 * same "enter a code" entry point, the same list of past submissions, and the
 * same two-hour session expiry that returns a student to the login screen.
 */
export default function DashboardScreen({ navigation }) {
  const [student, setStudent] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const goToLogin = useCallback(async () => {
    await clearSession();
    navigation.reset({ routes: [{ name: 'Login' }] });
  }, [navigation]);

  useEffect(() => {
    getSession().then(setStudent);
  }, []);

  /*
   * Session expiry. On mobile this hangs off AppState; the desktop equivalent
   * is the window regaining focus, plus a timer for the case where the app is
   * left open and untouched.
   */
  useEffect(() => {
    let timer = null;

    const schedule = async () => {
      const left = await timeLeftMs();

      if (left <= 0) {
        goToLogin();
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(goToLogin, left);
    };

    const onFocus = () => {
      isSessionExpired().then((expired) => (expired ? goToLogin() : schedule()));
    };

    window.addEventListener('focus', onFocus);
    schedule();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [goToLogin]);

  useEffect(() => {
    getMySubmissions()
      .then(setSubmissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const graded = submissions.filter((s) => s.status === 'graded');
  const pending = submissions.length - graded.length;
  const passed = graded.filter((s) => (s.total || 0) > 0 && (s.score / s.total) * 100 >= 50);
  const passPct = graded.length ? Math.round((passed.length / graded.length) * 100) : 0;

  return (
    <div className="screen">
      <header className="topbar">
        <BrandMark />
        <h1>Dashboard</h1>
        <span className="who">{student?.name || ''}</span>
        <AppButton title="Sign out" variant="ghost" onClick={goToLogin} />
      </header>

      <div className="content">
        <div className="content-narrow">
          <div className="stat-row">
            <StatTile value={submissions.length} label="Exams taken" />
            <StatTile value={graded.length} label="Graded" />
            <StatTile value={pending} label="Awaiting grading" />
            <StatTile value={`${passPct}%`} label="Pass rate" />
          </div>

          <div className="start-card">
            <div className="start-card-body">
              <h2>Ready to sit an exam?</h2>
              <p>Enter the code your teacher gave you to begin.</p>
            </div>
            <AppButton title="Enter exam code" onClick={() => navigation.navigate('ExamCode')} />
          </div>

          <h2 className="section-title">Your results</h2>

          {loading ? (
            <div className="empty">Loading your results…</div>
          ) : submissions.length === 0 ? (
            <div className="empty">You have not taken any exams yet.</div>
          ) : (
            <div className="sub-list">
              {submissions.map((s) => {
                const isGraded = s.status === 'graded';
                const pct = s.total ? Math.round((s.score / s.total) * 100) : null;

                return (
                  <button
                    key={s.id}
                    type="button"
                    className="sub-row"
                    onClick={() => navigation.navigate('ExamFeedback', { submissionId: s.id })}
                  >
                    <div className="sub-row-body">
                      <strong>{s.exam_title || s.exam?.title || 'Exam'}</strong>
                      <span>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : ''}
                        {isGraded && pct !== null ? ` · ${s.score}/${s.total} (${pct}%)` : ''}
                      </span>
                    </div>
                    <span className={`pill ${isGraded ? 'pill-graded' : 'pill-pending'}`}>
                      {isGraded ? 'Graded' : 'Awaiting grading'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

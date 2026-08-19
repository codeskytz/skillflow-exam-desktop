import { useState } from 'react';
import { AppButton, BrandMark } from '../components/ui';
import { validateExamCode } from '../api';

/**
 * Entering the exam code, mirroring the mobile ExamCodeScreen.
 *
 * The code is validated before the paper opens, so an invalid or already-taken
 * code fails here rather than after the lockdown has started.
 */
export default function ExamCodeScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setError('');
    const trimmed = code.trim();

    if (!trimmed) {
      setError('Please enter an exam code.');
      return;
    }

    setLoading(true);
    try {
      const exam = await validateExamCode(trimmed);
      navigation.replace('Exam', { exam });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => navigation.goBack()} aria-label="Back">←</button>
        <BrandMark />
        <h1>Start an exam</h1>
      </header>

      <div className="screen-center">
        <div className="card card-narrow" style={{ textAlign: 'center' }}>
          <div className="code-badge">#</div>

          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Your exam awaits</h2>
          <p className="muted small" style={{ margin: '6px 0 22px', lineHeight: '19px' }}>
            Enter the special exam code given to you by your teacher or school to begin.
          </p>

          <input
            className="code-input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) handleStart();
            }}
            placeholder="ENTER CODE"
            maxLength={12}
            autoFocus
            spellCheck={false}
          />

          {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

          <AppButton
            title="Start Exam"
            onClick={handleStart}
            loading={loading}
            className="btn-block"
          />
        </div>
      </div>
    </div>
  );
}

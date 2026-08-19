import { useCallback, useEffect, useState } from 'react';
import { checkForUpdate } from '../api';
import logo from '../logo.png';
import { AppButton } from './ui';

/**
 * Stops an out-of-date build being used, and nudges about a merely old one.
 *
 * Two things worth knowing about how this behaves:
 *
 * It fails open. The check runs in the background and the app is usable while
 * it is in flight, so a student with no signal or a server having a bad day is
 * never met with a wall telling them to update. That is deliberate — a gate
 * that turns every outage into a lockout would cost more exams than the stale
 * builds it prevents. The real enforcement is server-side: the API refuses to
 * hand a paper to a build below the minimum, whatever this screen decides.
 *
 * And it only ever appears before an exam. The check runs once at startup, so
 * a minimum that moves while somebody is writing cannot interrupt them.
 */

function UpdateRequiredScreen({ status, onRetry }) {
  const [opening, setOpening] = useState(false);

  const download = async () => {
    if (!status.download_url) return;

    setOpening(true);
    try {
      await window.examShell?.openDownloadPage(status.download_url);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="screen-center update-screen">
      <div className="card card-narrow" style={{ textAlign: 'center' }}>
        <img src={logo} alt="" className="update-logo" />

        <h1 className="update-title">Update required</h1>

        <p className="update-text">
          This version of Skillflow Exam is too old to sit a paper. Install the latest version to continue.
        </p>

        <div className="update-versions">
          <span>
            You have <strong>{status.current || 'an unknown version'}</strong>
          </span>
          {status.latest ? (
            <span>
              Latest is <strong>{status.latest}</strong>
            </span>
          ) : null}
        </div>

        {status.notes ? <p className="update-notes">{status.notes}</p> : null}

        {status.download_url ? (
          <AppButton title={opening ? 'Opening…' : 'Download the update'} onClick={download} disabled={opening} />
        ) : (
          // The threshold can be set without a link. Saying so beats a button
          // that does nothing.
          <p className="update-text">Please contact your school for the latest version.</p>
        )}

        <button type="button" className="btn btn-ghost btn-small" onClick={onRetry}>
          I have updated — check again
        </button>
      </div>
    </div>
  );
}

function UpdateBanner({ status, onDismiss }) {
  const download = () => {
    if (status.download_url) window.examShell?.openDownloadPage(status.download_url);
  };

  return (
    <div className="update-banner" role="status">
      <span>
        Version {status.latest} is available. You have {status.current}.
      </span>
      {status.download_url ? (
        <button type="button" className="update-banner-link" onClick={download}>
          Get it
        </button>
      ) : null}
      <button type="button" className="update-banner-close" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export default function UpdateGate({ children }) {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(() => {
    // Never rejects; an unreachable server resolves to null.
    checkForUpdate().then(setStatus);
  }, []);

  useEffect(check, [check]);

  if (status?.update_required) {
    return <UpdateRequiredScreen status={status} onRetry={check} />;
  }

  return (
    <>
      {children}
      {status?.update_available && !dismissed ? (
        <UpdateBanner status={status} onDismiss={() => setDismissed(true)} />
      ) : null}
    </>
  );
}

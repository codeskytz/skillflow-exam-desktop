/**
 * The signed-in student, mirroring exam-portal/src/utils/session.js.
 *
 * Same key, same two-hour window, same expiry semantics — the mobile app and
 * this one behave identically, so a rule learned on one holds on the other.
 * AsyncStorage becomes localStorage; everything else is unchanged, including
 * the async signatures, so screens port across without edits.
 */

const SESSION_KEY = 'sf_student_session';

export const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export async function startSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, loggedInAt: Date.now() }));
}

export async function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function timeLeftMs() {
  const session = await getSession();
  if (!session) return 0;

  const left = SESSION_DURATION_MS - (Date.now() - session.loggedInAt);

  return Math.max(0, left);
}

export async function isSessionExpired() {
  return (await timeLeftMs()) <= 0;
}

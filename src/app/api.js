import { clearSession, getSession } from './session';

/**
 * The API client, mirroring exam-portal/src/config/api.js.
 *
 * One difference, and it matters: the mobile app hard-codes a LAN address,
 * which breaks the moment the router hands out a different one. Here the base
 * URL comes from the main process, so the same build points at staging or
 * production by environment rather than by edit.
 */

const TIMEOUT_MS = 20000;
const FALLBACK_BASE = 'https://api.skillflowtz.com/api/v1';

let cachedBase = null;

async function apiBase() {
  if (cachedBase) return cachedBase;

  try {
    cachedBase = (await window.examShell?.getApiBase()) || FALLBACK_BASE;
  } catch {
    cachedBase = FALLBACK_BASE;
  }

  return cachedBase;
}

let cachedVersion = null;

/** What this build calls itself, for the update gate and the server's check. */
export async function appVersion() {
  if (cachedVersion) return cachedVersion;

  try {
    cachedVersion = (await window.examShell?.getAppVersion()) || null;
  } catch {
    cachedVersion = null;
  }

  return cachedVersion;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };

  /*
   * Every request says which app it is and what version. The server refuses to
   * hand out a paper to a build below the configured minimum, so the gate does
   * not depend on this app choosing to honour it — an old build that predates
   * the check still cannot start an exam.
   */
  headers['X-App-Platform'] = 'desktop';

  const version = await appVersion();
  if (version) headers['X-App-Version'] = version;

  if (auth) {
    const session = await getSession();
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${await apiBase()}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw new Error('The request timed out. Please check your connection and try again.');
    }

    throw new Error('Network error. Please check your connection and try again.');
  }
  clearTimeout(timer);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      await clearSession();
      throw new Error('Session expired. Please sign in again.');
    }

    const message = data.message || data.error || 'Something went wrong. Please try again.';
    throw new Error(message);
  }

  return data;
}

export async function login({ email, password }) {
  return request('/auth/login', { method: 'POST', body: { email, password }, auth: false });
}

export async function validateExamCode(code) {
  const data = await request('/exams/validate', { method: 'POST', body: { code } });

  return data.exam;
}

export async function submitExam(examId, answers) {
  const data = await request(`/exams/${examId}/submit`, { method: 'POST', body: { answers } });

  return data.submission;
}

export async function getMySubmissions() {
  const data = await request('/my/submissions');

  return data.submissions;
}

export async function getMySubmission(submissionId) {
  const data = await request(`/my/submissions/${submissionId}`);

  return data.submission;
}

/**
 * Which server this build is actually talking to.
 *
 * Shown on the login screen: a desktop app gives no address bar, so without
 * this there is nothing to tell a tester that "nothing I change locally has any
 * effect" is really "you are pointed at production".
 */
export async function currentApiBase() {
  return apiBase();
}

/**
 * Ask whether this build is still allowed to run.
 *
 * Unauthenticated on purpose: it runs before the login screen, so a build too
 * old to sign in correctly says so rather than showing a form that will fail.
 *
 * Never throws. A student with no connection, or a server having a bad day,
 * must not be met with a wall telling them to update — that would turn every
 * outage into a lockout. Unreachable means "carry on", and the server-side
 * check still stops an old build from starting a paper once it is reachable.
 */
export async function checkForUpdate() {
  try {
    const version = await appVersion();
    const query = new URLSearchParams({ platform: 'desktop', ...(version ? { version } : {}) });

    return await request(`/app-version?${query}`, { auth: false });
  } catch {
    return null;
  }
}

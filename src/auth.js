// auth.js — simple Firebase email/password auth + degraded fallback
import { firebaseConfig } from './firebaseConfig.js';
// Local staging role map (simple mapping for operational staging). Edit as needed.
const ROLE_MAP = {
  'jefe@celsur.local': 'JEFE',
  // add mapping entries here for staging users
};
const DEFAULT_ROLE = 'SUPERVISOR';

const FB = typeof window !== 'undefined' ? window.firebaseModules || {} : {};
let _auth = null;
let _initialized = false;
let _retries = 0;

function buildSessionFromFirebaseUser(user) {
  if (!user) return null;
  const email = user.email || null;
  const uid = user.uid || (email ? email : 'unknown');
  const role = (email && AUTH_ROLE_MAP && AUTH_ROLE_MAP[email]) ? AUTH_ROLE_MAP[email] : AUTH_DEFAULT_ROLE || 'SUPERVISOR';
  const now = new Date().toISOString();
  const session = {
    userId: uid,
    role,
    sessionStartedAt: now,
    degradedAuth: false,
    authProvider: 'firebase',
    lastValidation: now,
  };
  // expose lightweight session globally
  try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, session); } catch (e) { /* ignore */ }
  return session;
}

export async function initAuth({ onChange } = {}) {
  if (_initialized) return;
  _initialized = true;
  const { getAuth, onAuthStateChanged } = FB;
  try {
    if (typeof getAuth !== 'function') throw new Error('Firebase auth not available');
    _auth = getAuth();
    if (typeof onAuthStateChanged === 'function') {
      onAuthStateChanged(_auth, (user) => {
        if (user) {
          buildSessionFromFirebaseUser(user);
          _retries = 0;
          window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
          window.__HX_RUNTIME__.authDiagnostics = getAuthDiagnostics();
          onChange && onChange(window.__HX_SESSION__);
        } else {
          // set anonymous or signed-out state
          try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, { userId: null, role: null, sessionStartedAt: null, degradedAuth: false, authProvider: null, lastValidation: new Date().toISOString() }); } catch (e) {}
          onChange && onChange(window.__HX_SESSION__);
        }
      });
    }
  } catch (e) {
    // degraded mode
    try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, { userId: null, role: null, degradedAuth: true, authProvider: null, lastValidation: new Date().toISOString() }); } catch (err) {}
    window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
    window.__HX_RUNTIME__.authDiagnostics = getAuthDiagnostics({ degraded: true, error: String(e && e.message) });
    console.warn('Auth init degraded:', e && e.message);
    onChange && onChange(window.__HX_SESSION__);
  }
}

export async function loginWithEmail(email, password) {
  const { signInWithEmailAndPassword } = FB;
  if (typeof signInWithEmailAndPassword !== 'function') {
    const err = new Error('Sign-in method not available'); err.code = 'AUTH_NOT_AVAILABLE'; throw err;
  }
  try {
    const auth = _auth || FB.getAuth && FB.getAuth();
    const res = await signInWithEmailAndPassword(auth, String(email), String(password));
    const user = res && res.user ? res.user : null;
    buildSessionFromFirebaseUser(user);
    window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
    window.__HX_RUNTIME__.authDiagnostics = getAuthDiagnostics();
    return window.__HX_SESSION__;
  } catch (e) {
    _retries += 1;
    window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
    window.__HX_RUNTIME__.authDiagnostics = getAuthDiagnostics({ lastError: String(e && e.message) });
    throw e;
  }
}

export async function logout() {
  const { signOut } = FB;
  if (typeof signOut !== 'function') {
    // degrade: clear local session only
    try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, { userId: null, role: null, sessionStartedAt: null, degradedAuth: true, authProvider: null, lastValidation: new Date().toISOString() }); } catch (e) {}
    return;
  }
  try {
    const auth = _auth || FB.getAuth && FB.getAuth();
    await signOut(auth);
    try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, { userId: null, role: null, sessionStartedAt: null, degradedAuth: false, authProvider: null, lastValidation: new Date().toISOString() }); } catch (e) {}
  } catch (e) {
    try { window.__HX_SESSION__ = Object.assign({}, window.__HX_SESSION__ || {}, { degradedAuth: true, lastValidation: new Date().toISOString() }); } catch (err) {}
    throw e;
  }
}

export function getCurrentUser() { return (typeof window !== 'undefined' && window.__HX_SESSION__) ? window.__HX_SESSION__ : null; }

export function getAuthDiagnostics(opts = {}) {
  const s = (typeof window !== 'undefined' && window.__HX_SESSION__) || {};
  const now = new Date();
  const started = s.sessionStartedAt ? new Date(s.sessionStartedAt) : null;
  const durationMs = started ? (now - started) : 0;
  return Object.assign({
    authStatus: s.userId ? 'authenticated' : 'anonymous',
    currentRole: s.role || null,
    degradedAuth: !!s.degradedAuth,
    tokenStatus: s.userId ? 'ok' : 'none',
    sessionDurationMs: durationMs,
    authRetries: _retries,
    lastValidation: s.lastValidation || null,
  }, opts || {});
}

export default { initAuth, loginWithEmail, logout, getAuthDiagnostics, getCurrentUser };

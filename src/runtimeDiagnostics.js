import { APP_CONFIG } from './config.js';
import storeWrapper from './storage/index.js';
import * as Analytics from './analytics.js';

// getEnvironmentDiagnostics: runtime environment summary for staging
export function getEnvironmentDiagnostics() {
  const rt = typeof window !== 'undefined' && window.__HX_RUNTIME__ ? window.__HX_RUNTIME__ : {};
  const host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'unknown';
  const isLocalHost = /(^localhost$)|(^127\.)|(^::1$)/.test(host);
  let env = 'production';
  try {
    if (isLocalHost) env = 'local';
    else if (host && host.includes('staging')) env = 'staging';
    else if (APP_CONFIG && APP_CONFIG.STORAGE_BACKEND === 'local') env = 'local';
    else if (typeof process !== 'undefined' && process.env && (process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'staging')) env = 'staging';
  } catch (e) { /* ignore */ }

  const firebaseEnabled = !!(APP_CONFIG && APP_CONFIG.STORAGE_BACKEND === 'firebase' && typeof window !== 'undefined' && window.firebaseModules);
  const activeAdapter = (storeWrapper && typeof storeWrapper.getActiveAdapterName === 'function') ? storeWrapper.getActiveAdapterName() : (APP_CONFIG && APP_CONFIG.STORAGE_BACKEND) || 'unknown';
  const fallbackActive = activeAdapter === 'local' || !firebaseEnabled;

  const fbDiag = rt.firebaseDiagnostics || (typeof (storeWrapper && storeWrapper.getFirebaseDiagnostics) === 'function' ? storeWrapper.getFirebaseDiagnostics() : null) || {};
  const storageDiag = rt.storage || rt.storageDiagnostics || (typeof (storeWrapper && storeWrapper.getStorageDiagnostics) === 'function' ? storeWrapper.getStorageDiagnostics() : null) || {};
  const authDiag = rt.authDiagnostics || {};

  const degraded = !!(fbDiag?.degraded || storageDiag?.degraded || authDiag?.degradedAuth);

  const version = (APP_CONFIG && APP_CONFIG.APP_VERSION) || (rt && rt.version) || '0.0.0';

  // collect recent runtime warnings/criticals (last 50)
  const events = Array.isArray(rt.events) ? rt.events.slice(-50) : [];
  const warnings = events.filter(e => {
    const t = String(e?.type || e?.msg || '').toUpperCase();
    return /DEGRADED|WARNING|RETRY|CONFLICT|FAIL|ERROR|CRITICAL|PANIC/.test(t);
  }).reverse();

  const result = {
    currentEnvironment: env,
    host,
    firebaseEnabled,
    activeAdapter,
    fallbackActive,
    stagingMode: env === 'staging',
    degradedState: degraded,
    buildVersion: version,
    runtimeWarnings: warnings.slice(0, 20),
    timestamp: new Date().toISOString(),
    raw: { fbDiag, storageDiag, authDiag },
  };

  // expose latest snapshot
  try { if (!window.__HX_RUNTIME__) window.__HX_RUNTIME__ = {}; window.__HX_RUNTIME__.environmentDiagnostics = result; } catch (e) {}
  return result;
}

export function getProductionReadinessSummary() {
  const rt = typeof window !== 'undefined' && window.__HX_RUNTIME__ ? window.__HX_RUNTIME__ : {};
  const ops = rt.operationsCount || 0;
  const retries = rt.retriesCount || 0;
  const retryRate = ops > 0 ? (retries / ops) : 0;
  const conflicts = rt.conflictsCount || 0;
  const conflictRate = ops > 0 ? (conflicts / ops) : 0;

  const events = Array.isArray(rt.events) ? rt.events.slice(-200) : [];
  const degradedCount = events.filter(e => {
    const s = String((e && (e.type || e.msg)) || '').toUpperCase();
    return /DEGRADED|AUTO_FALLBACK|STORAGE_AUTO_FALLBACK|FIREBASE_AUTH_FAILED|DEGRADED_MODE|STORAGE_WARNING/.test(s);
  }).length;
  const degradedFrequency = events.length ? (degradedCount / events.length) : 0;

  const authDiag = rt.authDiagnostics || {};
  const storageDiag = rt.storage || rt.storageDiagnostics || {};
  const fbDiag = rt.firebaseDiagnostics || {};

  // simple weighted readiness score (0-100)
  let penalty = 0;
  penalty += Math.min(30, retryRate * 100 * 0.4); // retries penalized up to 30
  penalty += Math.min(30, conflictRate * 100 * 0.6); // conflicts up to 30
  penalty += Math.min(20, degradedFrequency * 100 * 0.5); // degraded up to 20
  if (authDiag.degradedAuth) penalty += 10;
  if (storageDiag.degraded) penalty += 10;
  if (fbDiag.degraded) penalty += 10;

  const readinessScore = Math.max(0, Math.round(100 - penalty));

  const summary = {
    timestamp: new Date().toISOString(),
    operationsCount: ops,
    retriesCount: retries,
    retryRate: Number((retryRate * 100).toFixed(2)), // percent
    conflictsCount: conflicts,
    conflictRate: Number((conflictRate * 100).toFixed(2)),
    degradedFrequency: Number(degradedFrequency.toFixed(4)),
    authStability: { degradedAuth: !!authDiag.degradedAuth, authRetries: authDiag.authRetries || 0 },
    storageHealth: { degraded: !!storageDiag.degraded, adapter: rt.storage && rt.storage.activeAdapter ? rt.storage.activeAdapter : (rt.storage && rt.storage.activeAdapter) || null },
    firebaseHealth: { degraded: !!fbDiag.degraded, lastConflict: fbDiag.lastConflictSample || null },
    readinessScore,
    raw: { authDiag, storageDiag, fbDiag },
  };

  try { if (!window.__HX_RUNTIME__) window.__HX_RUNTIME__ = {}; window.__HX_RUNTIME__.productionReadiness = summary; } catch (e) {}
  return summary;
}

// attach to runtime global if present
try { if (typeof window !== 'undefined') { window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {}; window.__HX_RUNTIME__.getEnvironmentDiagnostics = getEnvironmentDiagnostics; window.__HX_RUNTIME__.getProductionReadinessSummary = getProductionReadinessSummary; window.__HX_RUNTIME__.analytics = Analytics; } } catch (e) { /* ignore */ }

export default { getEnvironmentDiagnostics, getProductionReadinessSummary };

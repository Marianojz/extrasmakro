import { APP_CONFIG } from './config.js';
import storeWrapper from './storage/index.js';

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

// attach to runtime global if present
try { if (typeof window !== 'undefined') { window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {}; window.__HX_RUNTIME__.getEnvironmentDiagnostics = getEnvironmentDiagnostics; } } catch (e) { /* ignore */ }

export default { getEnvironmentDiagnostics };

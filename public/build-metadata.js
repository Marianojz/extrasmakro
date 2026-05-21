// build-metadata.js — runtime build metadata for operational traceability
// Update this file as part of the release process.

window.__HX_BUILD__ = {
  version: "v0.1.0",
  buildDate: "2026-05-20T19:39:49-03:00",
  environment: "staging",
  commitHash: "94b8fcd",
  releaseChannel: "staging"
};

// Helper: expose a short summary string (serializable)
window.__HX_BUILD__.summary = `${window.__HX_BUILD__.version} (${window.__HX_BUILD__.releaseChannel}) @ ${window.__HX_BUILD__.commitHash} — ${window.__HX_BUILD__.buildDate}`;

// Surface in startup logs and runtime telemetry
try {
  console.info('[startup] __HX_BUILD__', window.__HX_BUILD__.summary);
  window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
  // assign only serializable build metadata to runtime (avoid functions)
  window.__HX_RUNTIME__.build = {
    version: window.__HX_BUILD__.version,
    buildDate: window.__HX_BUILD__.buildDate,
    environment: window.__HX_BUILD__.environment,
    commitHash: window.__HX_BUILD__.commitHash,
    releaseChannel: window.__HX_BUILD__.releaseChannel,
    summary: window.__HX_BUILD__.summary
  };
} catch (e) { /* ignore in older browsers */ }

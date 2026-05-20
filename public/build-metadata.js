// build-metadata.js — runtime build metadata for operational traceability
// Update this file as part of the release process.

window.__HX_BUILD__ = {
  version: "v0.1.0",
  buildDate: "2026-05-20T19:39:49-03:00",
  environment: "staging",
  commitHash: "94b8fcd",
  releaseChannel: "staging"
};

// Helper: expose a short summary function
window.__HX_BUILD__.toString = function() {
  return `${this.version} (${this.releaseChannel}) @ ${this.commitHash} — ${this.buildDate}`;
};

// Surface in startup logs and runtime telemetry
try {
  console.info('[startup] __HX_BUILD__', window.__HX_BUILD__.toString());
  window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
  window.__HX_RUNTIME__.build = window.__HX_BUILD__;
} catch (e) { /* ignore in older browsers */ }

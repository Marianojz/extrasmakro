// feature-flags.js — lightweight runtime feature toggles (lite)
// Feature flags are visible, reversible and runtime-safe. Toggle via release process.

window.__HX_FLAGS__ = {
  advancedDiagnostics: false,
  supervisorAssistant: false,
  analyticsPanel: false,
  forecastWarnings: false
};

// Note: do not attach functions to global flags — use src/config/features.js helpers for checks.

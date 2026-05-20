// feature-flags.js — lightweight runtime feature toggles (lite)
// Feature flags are visible, reversible and runtime-safe. Toggle via release process.

window.__HX_FLAGS__ = {
  advancedDiagnostics: false,
  supervisorAssistant: false,
  analyticsPanel: false,
  forecastWarnings: false
};

// Convenience API
window.__HX_FLAGS__.isEnabled = function(flag) { return !!this[flag]; };

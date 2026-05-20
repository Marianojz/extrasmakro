// operationalAssistant.js
// Lightweight, rule-based operational assistant helpers.
// No external AI, no network calls. Consumers provide metrics/events and this module returns text summaries.

function safeNow() { return new Date().toISOString(); }

export function generateQuickMetricsSummary(metrics) {
  // metrics: { activity, errors, retries, activeConvocatorias }
  const parts = [];
  if (!metrics) return { ts: safeNow(), summary: 'No metrics available' };
  parts.push(`Activity: ${metrics.activity || 0} events`);
  if (metrics.errors) parts.push(`Errors: ${metrics.errors}`);
  if (metrics.retries && metrics.retries > 5) parts.push(`Retries high: ${metrics.retries}`);
  if (metrics.activeConvocatorias) parts.push(`Active convocatorias: ${metrics.activeConvocatorias}`);
  return { ts: safeNow(), summary: parts.join(' • ') };
}

export function explainAlert(alert) {
  // alert: { type, payload }
  if (!alert || !alert.type) return 'Unknown alert';
  switch (alert.type) {
    case 'degraded':
      return 'Degraded mode: fallback storage or Firebase issues detected. Check telemetry and retry counters.';
    case 'retries':
      return 'High retry rate: network instability or transient errors. Confirm Firebase availability and recent imports.';
    case 'conflict':
      return 'Conflict detected: concurrent writes to the same entity. Investigate recent imports and multi-tab activity.';
    default:
      return `Alert type ${alert.type}: consult operational KB for recommended steps.`;
  }
}

export function summarizeConvocatorias(convocatorias=[]) {
  // returns short executive summary
  const active = convocatorias.filter(c=>c.status==='active').length;
  const upcoming = convocatorias.filter(c=>c.startsWithAt && new Date(c.startsWithAt) > Date.now()).length;
  return `Convocatorias — active: ${active}, upcoming: ${upcoming}, total: ${convocatorias.length}`;
}

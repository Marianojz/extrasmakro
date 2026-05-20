// metrics.js
// Cross-module heuristic metric calculators and simple detectors.
// Keep rules simple and deterministic.

export function computeActivitySummary(events) {
  // events: array of { ts, type }
  const total = Array.isArray(events) ? events.length : 0;
  const byType = {};
  (events||[]).forEach(e => { byType[e.type] = (byType[e.type]||0)+1; });
  return { total, byType };
}

export function detectAnomalies(history) {
  // history: { retries: [{ts, count}], conflicts: [{ts, count}], degraded: [{ts}] }
  const warnings = [];
  const recentRetries = (history.retries||[]).slice(-7).reduce((s,i)=>s+i.count,0);
  if (recentRetries > 20) warnings.push({ code: 'retries_high', message: 'Recent retries exceed threshold' });
  const recentConflicts = (history.conflicts||[]).slice(-14).reduce((s,i)=>s+i.count,0);
  if (recentConflicts > 10) warnings.push({ code: 'conflicts_recurrent', message: 'Repeated conflicts in recent days' });
  const degradedCount = (history.degraded||[]).length;
  if (degradedCount > 3) warnings.push({ code: 'degraded_frequent', message: 'Multiple degraded events recorded' });
  return warnings;
}

export function simplePredictiveWarnings(trendSeries) {
  // trendSeries: { retriesTrend: number, activityTrend: number }
  const preds = [];
  if (trendSeries.retriesTrend > 0.5) preds.push({ risk: 'low-coverage', reason: 'retries increasing quickly' });
  if (trendSeries.activityTrend < -0.5) preds.push({ risk: 'supervisor_low_activity', reason: 'sharp drop in activity' });
  return preds;
}

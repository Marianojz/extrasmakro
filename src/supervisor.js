import api from './api/apiLayer.js';
import runtimeDiagnostics from './runtimeDiagnostics.js';
import { APP_CONFIG } from './config.js';

const Models = api;

/**
 * Lightweight Supervisor assistance module.
 * - Read-only suggestions and alerts
 * - Uses existing api.meta telemetry and runtime diagnostics
 * - Must not perform destructive actions without explicit confirmation in UI
 */

export async function getSupervisorSummary() {
  const suggestionsRaw = Array.isArray(await Models.suggestionList?.()) ? await Models.suggestionList() : (await Models.suggestionList?.()) || [];
  const suggestions = (suggestionsRaw || []).slice(0, 8);

  const telemetry = api.meta && typeof api.meta.getTelemetry === 'function' ? api.meta.getTelemetry() : {};
  const health = api.meta && typeof api.meta.generateOperationalHealthSummary === 'function' ? api.meta.generateOperationalHealthSummary() : {};
  const readiness = typeof runtimeDiagnostics.getProductionReadinessSummary === 'function' ? runtimeDiagnostics.getProductionReadinessSummary() : {};
  const env = typeof runtimeDiagnostics.getEnvironmentDiagnostics === 'function' ? runtimeDiagnostics.getEnvironmentDiagnostics() : {};

  // Simple overutilization: empleados convocado >= threshold
  const OVERUSE_THRESHOLD = (APP_CONFIG && APP_CONFIG.SUPERVISOR_OVERUSE_THRESHOLD) || 8;
  let employees = [];
  try {
    const all = await Models.listEmployees();
    employees = Array.isArray(all) ? all : Object.values(all || {});
  } catch (e) { employees = []; }
  const overutilized = (employees || []).filter(e => (e && e.stats && (e.stats.convocado || 0) >= OVERUSE_THRESHOLD)).slice(0, 12);

  // Build alerts array from health.detectedIssues + runtime checks
  const alerts = [];
  if (env && env.degradedState) alerts.push({ id: 'runtime-degraded', level: 'critical', msg: 'Runtime degraded state detected' });
  if (readiness && typeof readiness.readinessScore === 'number' && readiness.readinessScore < 70) alerts.push({ id: 'low-readiness', level: 'warning', msg: `Readiness score low (${readiness.readinessScore})` });
  if (health && Array.isArray(health.detectedIssues) && health.detectedIssues.length) {
    health.detectedIssues.forEach((it, idx) => alerts.push({ id: 'issue-' + idx, level: 'warning', msg: `${it.type}: ${JSON.stringify(it).slice(0,200)}` }));
  }
  if (overutilized.length) alerts.push({ id: 'overutilized', level: 'warning', msg: `${overutilized.length} empleados con convocatorias elevadas (>= ${OVERUSE_THRESHOLD})` });

  return {
    timestamp: new Date().toISOString(),
    topSuggestions: suggestions,
    telemetry,
    health,
    readiness,
    env,
    alerts,
    overutilized,
  };
}

export default { getSupervisorSummary };

// Lightweight operational analytics helpers — heuristics-only, explainable, no side-effects
// Exports functions for executive dashboard, employee insights, calls analytics, trends detection, forecast lite and simple report generation

function safePercent(part, total) {
  if (!total || total === 0) return 0;
  return Math.round((part / total) * 10000) / 100; // 2 decimals
}

function rollingAverage(values = [], window = 7) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a,b)=>a+(b||0),0) / slice.length;
}

function summarizeExecutiveDashboard(state = {}) {
  // state expected to contain calls, employees, audit, telemetry, supervisors
  const calls = state.calls || [];
  const employees = state.employees || [];
  const telemetry = state.telemetry || {};
  const supervisors = state.supervisors || [];

  const totalCalls = calls.length;
  const accepted = calls.filter(c => c.finalStatus === 'confirmed').length;
  const rejected = calls.filter(c => c.finalStatus === 'rejected').length;
  const noResponse = calls.filter(c => c.finalStatus === 'no_response' || c.finalStatus === 'no_respond').length;
  const acceptanceRate = safePercent(accepted, totalCalls);
  const rejectionRate = safePercent(rejected, totalCalls);

  // participation: employees who answered at least once in period
  const participants = new Set(calls.filter(c=>c.finalStatus==='confirmed').map(c=>c.employeeId));
  const participationRate = safePercent(participants.size, employees.length);

  // simple trends: operations per day (assumes call.ts ISO)
  const perDay = {};
  calls.forEach(c=>{
    try{
      const d = (c.ts || c.timestamp || c.date) ? new Date(c.ts||c.timestamp||c.date).toISOString().slice(0,10) : 'unknown';
      perDay[d] = (perDay[d] || 0) + 1;
    } catch(e) {}
  });
  const days = Object.keys(perDay).sort();
  const last7 = days.slice(-7).map(d=>perDay[d]||0);

  // system stability
  const readinessScore = telemetry && typeof telemetry.readinessScore === 'number' ? telemetry.readinessScore : null;

  return {
    totalCalls,
    accepted,
    rejected,
    noResponse,
    acceptanceRate,
    rejectionRate,
    participationRate,
    dailySeries: { days, perDay },
    last7Average: rollingAverage(last7,7),
    readinessScore,
    generatedAt: new Date().toISOString(),
  };
}

function employeeInsights(employeeId, state = {}) {
  const employees = state.employees || [];
  const calls = state.calls || [];
  const emp = employees.find(e=>e.id === employeeId) || { id: employeeId };

  const empCalls = calls.filter(c=>c.employeeId === employeeId);
  const totalConvocations = empCalls.length;
  const accepted = empCalls.filter(c=>c.finalStatus === 'confirmed').length;
  const rejected = empCalls.filter(c=>c.finalStatus === 'rejected').length;
  const noResponse = empCalls.filter(c=>/no_response|no_respond/.test(c.finalStatus||'')).length;
  const acceptanceRate = safePercent(accepted, totalConvocations);

  // availability: last known weekly availability count if present
  const availabilityRecords = emp.availabilityHistory || [];
  const availabilityRate = availabilityRecords.length ? safePercent(availabilityRecords.filter(Boolean).length, availabilityRecords.length) : null;

  // compliance warning heuristics
  const warnings = [];
  if (acceptanceRate < 50 && totalConvocations >= 3) warnings.push('Low acceptance rate (<50%)');
  if ((emp.reputation || 100) < 60) warnings.push('Low reputation');
  if ((empCalls.length>0) && (accepted===0 && empCalls.length>=3)) warnings.push('Multiple convocations with no confirmations');

  return {
    employee: { ...emp },
    totalConvocations,
    accepted,
    rejected,
    noResponse,
    acceptanceRate,
    availabilityRate,
    warnings,
    trend: {
      lastCalls: empCalls.slice(-10),
    },
    generatedAt: new Date().toISOString(),
  };
}

function callsAnalytics(calls = []) {
  const total = calls.length;
  const accepted = calls.filter(c=>c.finalStatus==='confirmed').length;
  const rejected = calls.filter(c=>c.finalStatus==='rejected').length;
  const avgResponseMs = (() => {
    const times = calls.map(c=>{
      if (!c.attempts || c.attempts.length===0) return null;
      const first = c.attempts[0];
      if (!first.ts || !c.ts) return null;
      try { return new Date(first.ts).getTime() - new Date(c.ts || c.timestamp).getTime(); } catch(e){return null}
    }).filter(Boolean);
    if (times.length===0) return null;
    return Math.round(times.reduce((a,b)=>a+b,0)/times.length);
  })();

  // coverage: proportion of calls that ended with a confirmed attendance
  const coverage = safePercent(accepted, total);

  return { total, accepted, rejected, coverage, avgResponseMs, generatedAt: new Date().toISOString() };
}

function detectOperationalTrends(rt = {}, options = {}) {
  // rt expected to be window.__HX_RUNTIME__ or telemetry snapshots
  const telemetry = rt.telemetry || rt || {};
  const observations = telemetry.RECENT_OBSERVATIONS || [];
  const opDurations = telemetry.OPERATION_DURATIONS_MS || [];

  const trends = [];

  // low availability heuristic: if average availability across last 4 weeks < threshold
  if (rt.availabilityStats && rt.availabilityStats.last4WeeksAverage !== undefined) {
    if (rt.availabilityStats.last4WeeksAverage < (options.lowAvailabilityThreshold || 0.6)) {
      trends.push({ type: 'low_availability', score: rt.availabilityStats.last4WeeksAverage, detail: 'Average availability across last 4 weeks below threshold' });
    }
  }

  // overutilized employees: repeated convocations for same employee
  const empCounts = {};
  (observations||[]).forEach(o=>{ if (o && o.employeeId) empCounts[o.employeeId] = (empCounts[o.employeeId]||0)+1; });
  const overutilized = Object.entries(empCounts).filter(([k,v]) => v >= (options.overutilizedThreshold || 5)).map(([id,cnt])=>({ employeeId: id, count: cnt }));
  if (overutilized.length) trends.push({ type: 'overutilized_employees', items: overutilized });

  // conflicts rising: look at repeated_conflicts in observations
  const conflicts = (observations||[]).filter(o=>o.stage==='operation_conflict');
  if (conflicts.length > (options.conflictAlertThreshold || 5)) trends.push({ type: 'conflicts_rising', count: conflicts.length });

  // retries increasing: compare recent retry rate to older window if available
  const retryEvents = (observations||[]).filter(o=>o.stage==='operation_retry');
  if (retryEvents.length > (options.retryAlertThreshold || 10)) trends.push({ type: 'retries_high', count: retryEvents.length });

  // degraded recurring: check for repeated degraded events
  const degraded = (observations||[]).filter(o=>/DEGRADED|degraded|AUTO_FALLBACK/i.test(String(o.stage||o.msg||'')));
  if (degraded.length > (options.degradedAlertThreshold || 3)) trends.push({ type: 'degraded_recurring', count: degraded.length });

  // slow operations
  const slowOps = (opDurations||[]).filter(d => d >= (options.slowOperationMs || 2000));
  if (slowOps.length > 0) trends.push({ type: 'slow_operations', count: slowOps.length, sampleMs: slowOps.slice(-5) });

  return { trends, generatedAt: new Date().toISOString() };
}

function forecastLite(state = {}, horizonDays = 14) {
  // Simple heuristic-based forecast
  // - estimate saturday coverage risk based on historic average attendance on saturdays vs required
  const saturdayHistory = state.saturdayEvents || [];
  const requiredPerSaturday = state.requiredSaturdayStaff || 10;
  const avgAttendance = saturdayHistory.length ? (saturdayHistory.reduce((a,e)=>a + (e.attendanceCount||0),0) / saturdayHistory.length) : null;
  const probabilityShortage = avgAttendance !== null ? Math.max(0, Math.round(((requiredPerSaturday - avgAttendance) / requiredPerSaturday) * 100)) : null;

  // employees critical: those with low spare capacity (e.g., high convocations, low acceptance)
  const empScores = (state.employees || []).map(e=>({ id: e.id, convocations: e.convocations || 0, acceptanceRate: e.acceptanceRate || 100 })).sort((a,b)=> (b.convocations - a.convocations));
  const criticalEmployees = empScores.slice(0,5);

  // high load days: if recent daily calls average > threshold
  const calls = state.calls || [];
  const perDay = {};
  calls.forEach(c=>{ const d = (c.ts||c.date||c.timestamp) ? new Date(c.ts||c.date||c.timestamp).toISOString().slice(0,10) : 'unknown'; perDay[d] = (perDay[d]||0)+1; });
  const days = Object.keys(perDay).sort();
  const last14 = days.slice(-horizonDays).map(d=>perDay[d]||0);
  const avgLast14 = rollingAverage(last14, horizonDays);
  const highLoad = avgLast14 > (state.expectedDailyCalls || 30);

  return {
    probabilityShortage,
    avgAttendance,
    requiredPerSaturday,
    criticalEmployees,
    highLoad,
    avgLast14,
    generatedAt: new Date().toISOString(),
  };
}

function generateReport(type = 'weekly', payload = {}, format = 'json') {
  // Returns structured report data; export formatting (csv/html) is responsibility of caller
  const now = new Date().toISOString();
  const base = { type, generatedAt: now, payload };
  if (format === 'json') return JSON.stringify(base, null, 2);
  if (format === 'csv') {
    // simple flatten for basic CSV cases
    const rows = [];
    if (Array.isArray(payload.rows)) {
      const header = Object.keys(payload.rows[0] || {}).join(',');
      rows.push(header);
      payload.rows.forEach(r => rows.push(Object.values(r).map(v=>`"${String(v||'')}"`).join(',')));
    } else {
      rows.push('key,value');
      Object.keys(payload).forEach(k=> rows.push(`${k},"${String(payload[k]||'')}"`));
    }
    return rows.join('\n');
  }
  // default: return object
  return base;
}

export default {
  summarizeExecutiveDashboard,
  employeeInsights,
  callsAnalytics,
  detectOperationalTrends,
  forecastLite,
  generateReport,
};

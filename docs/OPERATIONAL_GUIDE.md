OPERATIONAL GUIDE — Production-ready Procedures

Quick checks

- Start app and confirm: window.__HX_RUNTIME__.environmentDiagnostics.degradedState === false
- Run: window.__HX_RUNTIME__.getProductionReadinessSummary() and inspect readinessScore
- Inspect recent events: window.__HX_RUNTIME__.events.slice(-40)

Degraded handling

- If storage degraded: check firebase diagnostics, adapter health, then consider switching to local adapter only after confirming data safety.
- If auth degraded: validate token expiry and sign-in flows; avoid auto-clearing audit.

Telemetry and logs

- Use debug-panel (if enabled) to copy runtime JSON. Avoid printing full stacks.
- Watch metrics: retryRate < 5%, conflictRate low, authRetries reasonable.

Conflict handling

- On PATCH_CONFLICT, surface to operators; do not auto-merge.
- Use models.merge helpers for guided resolution; record decisions in audit.

Operational playbook

- Routine: daily smoke checks, weekly staging load test, monthly recovery rehearsal.
- Emergency: If production shows persistent critical errors, enable degraded mode, stop writes, preserve audit, and run rollback plan.
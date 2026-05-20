OPERATIONAL PLAYBOOK — Horas Extras V2

Purpose: concise ops runbook for production window (7–14 days).

1) Monitoring window
- Duration: 14 days (recommended)
- Focus: retries, degraded frequency, overwrite attempts, Firebase latency, auth instability

2) Roles
- On-call ops: response & mitigation
- Supervisor leads: functional validation
- Engineering lead: rollback decision and fixes

3) Daily checks (first 14 days)
- readinessScore snapshot at 09:00 and 18:00
- Review runtime warnings and top 5 events
- Audit integrity spot-check (random sample)

4) Alert thresholds (example)
- Critical: retry exhaustion, repeated degraded mode, audit append failure
- Warning: conflict spikes > 5% over 1 hour, Firebase reconnects > 10/hour

5) Communication
- Incident room + brief status bulletin every 60 min until resolved

INCIDENT RESPONSE — Horas Extras V2

Scope: simple, operational, escalable.

1) Detection
- Runtime telemetry alerts: retry exhaustion, degraded mode, Firebase denied writes, auth failures.
- Supervisor/manual report channel (Slack/email).

2) Classification
- Critical: audit append failure, repeated degraded, import corruption risk.
- Warning: conflict spikes, latency spikes, Firebase reconnects.

3) Immediate actions
- Critical: freeze expansion, notify on-call, enact rollback checklist, open incident room.
- Warning: increase sampling, enable debug telemetry, monitor 2x frequency.

4) Rollback manual
- Use verified snapshot (timestamped). Follow BACKUP_RECOVERY.md steps.

5) Escalation
- Level 1 (on-call ops): 0–30 min
- Level 2 (engineering lead): 30–90 min
- Level 3 (product + stakeholders): >90 min

6) Postmortem
- 72h document and CLAIR action items, update playbook.

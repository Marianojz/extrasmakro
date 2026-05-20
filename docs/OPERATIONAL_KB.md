Operational Knowledge Base — Starter

Purpose
Quick troubleshooting and runbook for common incidents.

Common errors & recovery
1) Firebase degraded / unavailable
 - Symptoms: increased retries, errors in imports, degraded flag
 - Steps: check Firebase console, enable degraded mode, fallback to localStorage exports, notify supervisor

2) Conflict on employee record
 - Symptoms: save fails with conflict, audit shows concurrent writes
 - Steps: identify recent imports, check multi-tab activity, manually reconcile latest audit entries, apply patch (no overwrite)

3) Retry storms
 - Symptoms: many retries after an import
 - Steps: pause automated imports, inspect logs for error reason, reduce retry rate, apply backoff adjustments

4) Audit growth
 - Symptoms: storage ballooning, slow list operations
 - Steps: trigger monthly archive job, compress snapshots, present admin download link

5) Supervisor overloaded
 - Symptoms: many active convocatorias with low responses
 - Steps: review assignments, reassign supervisors, create high-priority filter in UI

Contacts
- Developer: repository owner
- Operations: ops@yourorg.example (replace when available)

Notes
- Keep this KB editable and grow with incidents. Link KB entries from UI alert explanations.

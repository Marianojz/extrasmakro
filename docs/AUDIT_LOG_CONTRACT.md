AUDIT LOG CONTRACT (Append-only)

Purpose
- Define the minimal, backwards-compatible contract for audit log entries to guarantee append-only integrity without changing architecture.

Required fields (new entries)
- id: string (UUID v4). Must be present and globally unique.
- ts / timestamp: ISO 8601 string (e.g. 2026-05-18T21:42:54.232Z). Mandatory.
- tipo / operation: string (semantic event name). Mandatory.
- origin / source: string (where the event was generated). Mandatory.
- createdAt: ISO 8601 string (display/consistency). Required; should equal ts when created.

Append-only metadata (added automatically)
- version: integer (default: 1)
- appendOnly: boolean (always true)

Optional / compatibility fields
- entity: string (domain/entity that the event is related to)
- entityId: string (id of entity instance)
- usuario / userId: string (actor who triggered the event)
- details: object (free-form structured payload)
- before / after: for contextual diffs (avoid mutating historic content)

Examples
{
  "id": "a3f1c8d2-4b5e-4f3a-9b6c-2a9e4f1b0c9d",
  "ts": "2026-05-18T21:42:54.232Z",
  "timestamp": "2026-05-18T21:42:54.232Z",
  "tipo": "user.login",
  "operation": "user.login",
  "origin": "ui.login",
  "entity": "user",
  "entityId": "emp-123",
  "usuario": "mariano",
  "userId": "mariano",
  "createdAt": "2026-05-18T21:42:54.232Z",
  "version": 1,
  "appendOnly": true,
  "details": { "ip": "x.x.x.x" }
}

Operational rules (summary)
- Historical events MUST NOT be edited, replaced, nor removed.
- Adapters must append via granular operations (appendAuditLog) or per-item storage (local adapter uses per-item keys).
- No adapter should call set('/auditLogs', <array>) or replace the auditLogs array wholesale in operational flows.
- Administrative maintenance flows may perform controlled full-state saves but MUST record a forcible 'system.reset' or equivalent audit entry and use the explicit allowed reasons (see firebase/supabase adapters).

Merge semantics
- Merges are performed with mergeAuditLogsAppendOnly(previous, incoming):
  - Normalizes entries (generates missing ids/timestamps)
  - Deduplicates by stable key (id, ts, operation, entity, entityId, user)
  - Preserves previous events' ordering and content
  - Appends new events only

Import behavior
- Legacy imports must NOT overwrite history. The import routine computes appended logs and appends them. If an import attempts to truncate or alter historical prefix, it is blocked and a 'AUDIT_APPEND_ONLY_VIOLATION' audit event is emitted.

Firebase guidance
- Use appendAuditLog() which runs a runTransaction() on /auditLogs. Do NOT use set() or update() that replaces the whole /auditLogs value.

Testing and validation
- Integration tests validate normalization, merge/dedup behavior and concurrency merge-race handling (see tests/integration/).

Operational checklist for deploy
- Notify ops to avoid manual edits to /auditLogs in Realtime Database or DB table rows.
- Add IAM constraints or operational SOP to forbid manual destructive edits.
- Ensure backups are taken before any administrative maintenance.

Contact
- Developers: @Marianojz
- For urgent rollback: follow documented maintenance procedure in docs/ (use save(..., { reason: 'maintenance' })).

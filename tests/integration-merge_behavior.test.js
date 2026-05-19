const assert = require('node:assert/strict');

(async () => {
  try {
    const adapter = await import('../src/storage/adapter.js');
    const { mergeAuditLogsAppendOnly, getAppendedAuditLogs } = adapter;

    const prev = [
      { id: '1', ts: '2026-01-01T00:00:00Z', operation: 'a', entity: 'system', usuario: 's1' },
      { id: '2', ts: '2026-01-02T00:00:00Z', operation: 'b', entity: 'system', usuario: 's1' },
    ];

    const incoming = [
      { id: '1', ts: '2026-01-01T00:00:00Z', operation: 'a', entity: 'system', usuario: 's1' },
      { id: '2', ts: '2026-01-02T00:00:00Z', operation: 'b', entity: 'system', usuario: 's1' },
      { operation: 'c', origin: 'tester' }
    ];

    // Correct merge pattern: compute appended logs from incoming and prev, then merge
    const appended = getAppendedAuditLogs(prev, incoming);
    assert.equal(appended.length, 1, 'one appended expected');

    const merged = mergeAuditLogsAppendOnly(prev, appended);
    assert.ok(Array.isArray(merged), 'merged is array');
    assert.equal(merged.length, 3, 'should preserve two existing and add one new');

    // Re-applying the same appended set must be idempotent
    const merged2 = mergeAuditLogsAppendOnly(merged, appended);
    assert.equal(merged2.length, merged.length, 're-applying appended must be idempotent');

    console.log('merge_behavior OK');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

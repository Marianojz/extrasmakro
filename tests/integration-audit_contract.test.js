const assert = require('node:assert/strict');

(async () => {
  try {
    const adapter = await import('../src/storage/adapter.js');
    const merged = adapter.mergeAuditLogsAppendOnly([], [{ operation: 'test.event', origin: 'unit.test' }]);
    assert.ok(Array.isArray(merged), 'merge should return array');
    assert.equal(merged.length, 1, 'one normalized entry expected');
    const log = merged[0];
    assert.ok(typeof log.id === 'string' && log.id.length > 0, 'id must exist');
    assert.ok(/-/.test(log.id), 'id looks like a UUID');
    assert.ok(log.ts, 'ts must be present');
    assert.ok(log.timestamp, 'timestamp must be present');
    assert.ok(log.createdAt, 'createdAt must be present');
    assert.equal(log.appendOnly, true, 'appendOnly must be true');
    assert.ok(Number.isInteger(log.version), 'version must be integer');
    console.log('audit_contract OK');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

const assert = require('node:assert/strict');

(async () => {
  try {
    const adapter = await import('../src/storage/adapter.js');
    const { mergeAuditLogsAppendOnly } = adapter;

    // Simulate two concurrent clients each appending a log with same content
    const base = [ { id: 'x', ts: '2026-05-01T00:00:00Z', operation: 'a' } ];
    const clientA = [ { id: 'x', ts: '2026-05-01T00:00:00Z', operation: 'a' }, { operation: 'a1' } ];
    const clientB = [ { id: 'x', ts: '2026-05-01T00:00:00Z', operation: 'a' }, { operation: 'b1' } ];

    // Merge A then B
    const mergedAB = mergeAuditLogsAppendOnly(base, clientA);
    const finalAB = mergeAuditLogsAppendOnly(mergedAB, clientB);

    // Merge B then A
    const mergedBA = mergeAuditLogsAppendOnly(base, clientB);
    const finalBA = mergeAuditLogsAppendOnly(mergedBA, clientA);

    // Compare by operation set (ids/timestamps are generated and may differ)
    const opsAB = finalAB.map(l => l.operation || l.tipo).filter(Boolean).sort();
    const opsBA = finalBA.map(l => l.operation || l.tipo).filter(Boolean).sort();
    assert.deepEqual(opsAB, opsBA, 'concurrent merges must result in same set of operations');

    // Ensure no duplicate entries by stable key (operation+ts) where possible
    const ops = finalAB.map(l => `${l.operation||l.tipo}::${l.ts||l.timestamp}`).filter(Boolean);
    const uniqueOps = new Set(ops);
    assert.equal(uniqueOps.size, ops.length, 'no duplicate entries after merge (by op+ts)');

    console.log('merge_race OK');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

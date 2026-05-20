const assert = require('node:assert/strict');

(async () => {
  try {
    // Minimal firebaseModules mock with adjustable behavior
    global.window = global.window || {};
    global.window.__HX_RUNTIME__ = global.window.__HX_RUNTIME__ || {};

    const dbState = { root: {} };

    function setValueAtPath(path, value) {
      // path like 'employees/e1' or 'systemConfig'
      const parts = String(path || '').split('/').filter(Boolean);
      if (parts.length === 0) {
        // top-level root replace
        dbState.root = value || {};
        return;
      }
      let cur = dbState.root;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = value;
    }

    function getValueAtPath(path) {
      const parts = String(path || '').split('/').filter(Boolean);
      if (parts.length === 0) return dbState.root;
      let cur = dbState.root;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[p];
      }
      return cur;
    }

    // Mutable behavior controls
    let updateFailUntil = 0; // number of failing attempts before success
    let updateAttempt = 0;

    const firebaseModules = {
      initializeApp: () => ({}),
      getDatabase: () => ({}),
      ref: (_db, path) => ({ path }),
      get: async (r) => {
        const value = getValueAtPath(r.path || '/');
        return { exists: () => value !== undefined, val: () => value };
      },
      update: async (r, patch) => {
        updateAttempt += 1;
        if (updateAttempt <= updateFailUntil) throw new Error('transient-update');
        // apply patch shallow: keys may include slashes
        for (const k of Object.keys(patch || {})) {
          setValueAtPath(k, patch[k]);
        }
        return;
      },
      runTransaction: async (r, cb) => {
        const cur = getValueAtPath(r.path || '/');
        const next = cb(Array.isArray(cur) ? cur : []);
        setValueAtPath(r.path ? r.path.slice(1) : '/', next);
        return { committed: true };
      },
      getAuth: () => ({}),
      signInAnonymously: async () => ({}),
    };

    global.window.firebaseModules = firebaseModules;

    // import adapter
    const adapterModule = await import('../src/storage/firebaseAdapter.js');
    const adapter = adapterModule.default || adapterModule;

    // --- Test 1: retry behavior ---
    updateFailUntil = 1; // first update fails once, second succeeds
    updateAttempt = 0;

    // call saveSystemConfig which uses update under the hood
    await adapter.saveSystemConfig({ testRetry: true });

    const d1 = adapter.getFirebaseDiagnostics();
    assert(d1.retryCount >= 1, 'retryCount should be >= 1 after transient failure');
    console.log('retry behavior OK');

    // --- Test 2: conflict detection ---
    // Prepare root state with employees.e1 = { name: 'A', version: 1 }
    dbState.root = { employees: { e1: { name: 'A', version: 1 } }, auditLogs: [] };

    // Make the remote return a different value for /employees/e1 to simulate concurrent change
    // We'll patch getValueAtPath to return different value when path === '/employees/e1'
    // Implemented via setting dbState differently after load to simulate change

    // Ensure updateAttempt resets
    updateAttempt = 0; updateFailUntil = 0;

    // Perform update: client loads current state, then before applyGranularOperations the remote will differ
    // To simulate remote change between load and apply, we'll mutate dbState.root after load but before update is called

    // Monkey-patch adapter.load to perform controlled race: call original load, then mutate dbState.root
    const originalLoad = adapter.load;
    adapter.load = async function() {
      const s = await originalLoad();
      // simulate concurrent external change
      setValueAtPath('employees/e1', { name: 'EXTERNAL_CHANGE', version: 99 });
      return s;
    };

    try {
      await adapter.update(async (draft) => {
        // make a change to employee e1
        draft.employees = draft.employees || {};
        draft.employees.e1 = { ...(draft.employees.e1 || {}), name: 'B', version: 2 };
        return undefined; // allow default replace behavior
      });
      console.error('Expected conflict but update succeeded unexpectedly');
      process.exit(1);
    } catch (e) {
      assert(e && e.code === 'FIREBASE_PATCH_CONFLICT', 'Expected FIREBASE_PATCH_CONFLICT');
      const d2 = adapter.getFirebaseDiagnostics();
      assert(d2.conflictCount >= 1, 'conflictCount should have incremented');
      console.log('conflict detection OK');
    }

    console.log('All firebase integration tests OK');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
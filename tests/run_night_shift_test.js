(async () => {
  // Polyfill minimal window.localStorage and structuredClone for Node
  global.window = global.window || {};
  const storage = {};
  global.window.localStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  // localStorageAdapter references `localStorage` global directly
  global.localStorage = global.window.localStorage;
  global.structuredClone = (v) => JSON.parse(JSON.stringify(v));

  // Dynamic import of models (ESM)
  const modelsPath = new URL('../src/models.js', import.meta.url).pathname;
  const Models = await import('../src/models.js');

  try {
    console.log('Starting night shift flow test...');
    // Create two employees
    const emp1 = await Models.initEmployee({ name: 'Test Emp 1', turno_base: 'tarde', tipo: 'efectivo' }, null);
    const emp2 = await Models.initEmployee({ name: 'Test Emp 2', turno_base: 'tarde', tipo: 'efectivo' }, null);
    console.log('Created employees:', emp1.id, emp2.id);

    const dateKey = '2026_03_03';
    await Models.createNightShiftEvent(dateKey, ['Sector1','Sector2'], null, null);
    console.log('Created night shift event:', dateKey);

    await Models.addNightShiftPerson(dateKey, emp1.id, { sector: 'Sector1', funcion: 'Operador', menu: 'comun', requiere_remis: true, direccion: 'Calle 1', supervisor: true }, null);
    await Models.addNightShiftPerson(dateKey, emp2.id, { sector: 'Sector2', funcion: 'Cajero', menu: 'dieta', requiere_remis: false, direccion: '', supervisor: false }, null);
    console.log('Added two persons to event.');

    const before = await Models.exportState();
    console.log('State before close (night event):');
    console.log(JSON.stringify(before.nightShiftEvents[dateKey], null, 2));

      // Attempt to close (should succeed only if exactly 1 supervisor)
      await Models.closeNightShiftEvent(dateKey, null);
      console.log('Closed event.');
      // Capture state immediately after close (before any reopen) for clarity
      const afterClose = await Models.exportState();
      console.log('State immediately after close (snapshot):');
      console.log(JSON.stringify(afterClose.nightShiftEvents[dateKey], null, 2));

      // Attempt duplicate add (should fail)
      try {
        await Models.addNightShiftPerson(dateKey, emp2.id, { sector: 'X' }, null);
        console.error('ERROR: duplicate add was allowed');
      } catch (err) {
        console.log('Duplicate add blocked as expected:', err.message);
      }

      // Attempt to add invalid employee
      try {
        await Models.addNightShiftPerson(dateKey, '9999', { sector: 'X' }, null);
        console.error('ERROR: adding invalid employee was allowed');
      } catch (err) {
        console.log('Invalid employee blocked as expected:', err.message);
      }

      // Reopen event (should be allowed for current month)
      const reopened = await Models.reopenNightShiftEvent(dateKey, null);
      console.log('Reopened event state:', reopened.estado);

    const after = await Models.exportState();
    console.log('State after close (night event):');
    console.log(JSON.stringify(after.nightShiftEvents[dateKey], null, 2));

    console.log('Affected employees stats:');
    console.log('Emp1 horas_100:', after.employees[emp1.id].stats.horas_100);
    console.log('Emp2 horas_100:', after.employees[emp2.id].stats.horas_100);

    console.log('Recent auditLogs (last 3):');
    console.log(JSON.stringify(after.auditLogs.slice(-3), null, 2));

  } catch (e) {
    console.error('ERROR during test:', e);
  }
})();

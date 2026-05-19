const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

assert.ok(exists('src/models.js'), 'src/models.js debe existir');
assert.ok(exists('src/storage/localStorageAdapter.js'), 'src/storage/localStorageAdapter.js debe existir');
assert.ok(exists('src/storage/firebaseAdapter.js'), 'src/storage/firebaseAdapter.js debe existir');
assert.ok(exists('src/storage/supabaseAdapter.js'), 'src/storage/supabaseAdapter.js debe existir');

const modelsSource = read('src/models.js');
assert.match(modelsSource, /async function updateState\(mutator\)/, 'models.js debe centralizar escrituras en updateState');
assert.match(modelsSource, /store\.update/, 'models.js debe delegar escrituras en store.update');
assert.match(modelsSource, /operation:\s*'state\.imported'/, 'importState debe auditar la importación');
assert.match(modelsSource, /importedAuditLogsIgnored/, 'importState debe ignorar auditLogs importados');
assert.match(modelsSource, /operation:\s*'state\.reset'/, 'resetAllData debe generar un evento forense irreversible');
assert.match(modelsSource, /CRITICAL_AUDIT_EVENT_MAP/, 'models.js debe exponer el mapa de eventos críticos auditados');

const localAdapterSource = read('src/storage/localStorageAdapter.js');
assert.match(localAdapterSource, /navigator\.locks\.?request|navigator\.locks\?\.request/, 'localStorageAdapter debe serializar escrituras entre pestañas');
assert.match(localAdapterSource, /buildGranularOperations/, 'localStorageAdapter debe calcular operaciones granulares');
assert.match(localAdapterSource, /saveEmployee/, 'localStorageAdapter debe exponer persistencia granular de empleados');
assert.match(localAdapterSource, /appendAuditLog/, 'localStorageAdapter debe exponer appendAuditLog');
assert.match(localAdapterSource, /saveSaturdayData/, 'localStorageAdapter debe exponer persistencia segmentada de saturdayData');
assert.match(localAdapterSource, /mergeAuditLogsAppendOnly/, 'localStorageAdapter debe preservar auditLogs en modo append-only');

const firebaseAdapterSource = read('src/storage/firebaseAdapter.js');
assert.match(firebaseAdapterSource, /runTransaction/, 'firebaseAdapter debe usar transacciones');
assert.match(firebaseAdapterSource, /update:\s*updateState/, 'firebaseAdapter debe exponer update');
assert.match(firebaseAdapterSource, /saveEmployee/, 'firebaseAdapter debe soportar persistencia granular de empleados');
assert.match(firebaseAdapterSource, /buildFirebasePatch/, 'firebaseAdapter debe generar patches granulares');
assert.match(firebaseAdapterSource, /mergeAuditLogsAppendOnly/, 'firebaseAdapter debe evitar sobrescribir auditLogs');

const supabaseAdapterSource = read('src/storage/supabaseAdapter.js');
assert.match(supabaseAdapterSource, /\.eq\('version', record\.version\)/, 'supabaseAdapter debe controlar conflictos por versión');
assert.match(supabaseAdapterSource, /Conflicto de concurrencia en Supabase/, 'supabaseAdapter debe informar conflictos de concurrencia');
assert.match(supabaseAdapterSource, /buildGranularOperations/, 'supabaseAdapter debe planificar persistencia granular');
assert.match(supabaseAdapterSource, /saveEmployee/, 'supabaseAdapter debe exponer persistencia granular de empleados');
assert.match(supabaseAdapterSource, /mergeAuditLogsAppendOnly/, 'supabaseAdapter debe preservar auditLogs append-only');

const supabaseSetupSource = read('docs/supabase-setup.sql');
assert.match(supabaseSetupSource, /version BIGINT NOT NULL DEFAULT 0/i, 'supabase-setup.sql debe crear la columna version');

const auditDocSource = read('docs/AUDITORIA_TECNICA_TOTAL_v3.md');
assert.doesNotMatch(auditDocSource, /nextIdCounter en `INITIAL_STATE`/, 'la auditoría no debe documentar nextIdCounter como estado activo');

const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.scripts['test:smoke'], 'node tests/smoke.test.js', 'package.json debe apuntar al smoke test');

console.log('Smoke OK');

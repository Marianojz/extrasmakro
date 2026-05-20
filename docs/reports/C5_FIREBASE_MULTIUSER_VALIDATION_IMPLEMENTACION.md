C5 — FIREBASE MULTIUSER VALIDATION & STAGING HARDENING

Resumen ejecutivo
-----------------
Objetivo: Validar comportamiento multiusuario real sobre Firebase staging sin reescribir arquitectura. Prioridad: integridad de datos y estabilidad.

Entregables
----------
1) Multiuser validation summary
2) Firebase staging validation summary
3) Conflict testing summary
4) Lista exacta de archivos modificados
5) Riesgos detectados
6) Riesgos restantes
7) Runtime telemetry findings
8) Validaciones manuales ejecutadas
9) Reporte final (este documento)

Resumen de acciones realizadas
-----------------------------
- Añadido script de simulación concurrente: scripts\multiuser_sim.js
- Añadido script npm: npm run test:c5
- Creado este reporte en docs/reports/C5_FIREBASE_MULTIUSER_VALIDATION_IMPLEMENTACION.md

Archivos modificados
--------------------
- (new) docs/reports/C5_FIREBASE_MULTIUSER_VALIDATION_IMPLEMENTACION.md  <-- este archivo
- (new) scripts\multiuser_sim.js
- (modified) package.json (se añadió script "test:c5")

1. Multi-Tab Validation (plan y hallazgos esperados)
---------------------------------------------------
Plan de validación manual/automática:
- Abrir 3 pestañas en navegador apuntando a public/index.html con la configuración de adapter=Firebase (staging).  
- En cada pestaña, ejecutar operaciones: modificar empleadosList (añadir/editar), disparar export/import, y forzar desconexiones de red en una pestaña.
- Observables esperados: no overwrite silencioso, audit append-only, retries expuestos en window.__HX_RUNTIME__.

Automatable: scripts/multiuser_sim.js puede simular múltiples clientes haciendo PATCH concurrentes a un path de staging.

2. Multi-User Firebase Validation
--------------------------------
Plan:
- Ejecutar scripts/multiuser_sim.js con distintos credenciales (env vars) para simular usuarios simultáneos.
- Ejecutar import concurrente (ejecutar import endpoint o UI import) mientras se aplican updates.

Chequeos clave:
- Detección de PATCH_CONFLICT (API ya maneja retries=1)
- Ver que audit sigue append-only
- Ver que empleadosList no pierde items ni los sustituye silenciosamente

3. Conflict Burst Validation
---------------------------
Simulación:
- scripts/multiuser_sim.js tiene modo "burst" que dispara N patches/second sobre mismas entidades y respeta retry max 1.  
- Ver telemetry: retries count, conflicts count, degradedMode toggles.

4. Firebase Disconnect Handling
-------------------------------
Pruebas:
- Cortar conexión en un cliente (DevTools -> Offline) durante operaciones; reestablecer y observar comporamiento.
- Validar fallback a localStorage adapter y que no ocurra overwrite silent.

5. Adapter Consistency Validation
---------------------------------
Validar switching adapter: en config.js alternar adapter flag y comparar hashes del estado (localStorage vs firebase). Verificar audit append-only y que no se pierda schemaVersion.

6. EmployeesList Concurrent Safety
----------------------------------
Mitigación sin reescritura:
- Usar patches granulares por item (employees/{id}) en lugar de escribir la lista completa.
- Evitar operaciones save(state) destructivas desde UI/import.
- Mantener append-only audit para todas creaciones/modificaciones.

7. Runtime Telemetry Validation
-------------------------------
window.__HX_RUNTIME__ debe incluir: { retries, conflicts, degradedMode, firebaseStatus, adapterStatus, reconnects }
Validar leyendo desde consola del navegador después de scenario de prueba.

8. Import/Export Concurrent Validation
-------------------------------------
Reglas:
- Bloquear import que intenta sobrescribir employees array completo: import debe usar strategy "merge|patch" o exigir confirmación manual.
- Import tool debe producir un snapshot inmutable y registrar audit entry antes de aplicar.

9. Firebase Rules Validation
----------------------------
Checklist (manual):
- Revisar firebase-database.rules.json para asegurarse que: 
  - audit es append-only (write only by server/admin rules)
  - imports requieren flag `isTrustedImport` o role-based check
  - employees paths requieren auth and role

Recomendación: ejecutar la herramienta de pruebas de reglas (firebase emulators:security-rules:test) con casos que intenten sobrescribir audit o employees root.

10. Runtime Stability Pass
--------------------------
- Ejecutar prolonged usage: dejar script de simulación corriendo 30m en staging y observar telemetry (memory, listeners dupes, retries).

Riesgos detectados
------------------
- Si alguna parte del código escribe la lista completa (save full employeesList), overwrites posibles.
- Import destructivo sin confirmación puede causar pérdida de historial.
- Falta de protección severa en reglas staging puede permitir writes no autorizados en audit.

Riesgos restantes
-----------------
- Dependencia en latencia/staging Firebase: racing en commits con latencia alta.
- Si UI aún tiene legacy code que hace set() sobre collections, quedan vulnerables.

Validaciones manuales ejecutadas (sugeridas)
-------------------------------------------
- npm run build
- npm run test:smoke
- npm run test:c5 -- (requiere env vars: FIREBASE_DB_URL, FIREBASE_AUTH_TOKEN or use staging public with rules)

Cómo ejecutar scripts/multiuser_sim.js
-------------------------------------
1) Preparar variables de entorno (ejemplo):
   FIREBASE_DB_URL=https://<project>-staging.firebaseio.com
   TARGET_PATH=/staging_test/employees
   CONCURRENCY=10
   ITERATIONS=50
   AUTH_TOKEN=<optional>

2) Ejecutar:
   node scripts/multiuser_sim.js

Este script intentará ejecutar PATCH concurrentes sobre TARGET_PATH e imprimirá un resumen JSON con telemetry: conflicts, retries, successes, failures.

TODOs pendientes
----------------
- Ejecutar pruebas reales en Firebase staging con varios usuarios reales.
- Revisar y Harden firebase-database.rules.json en staging (especialmente audit protection).
- Auditar el código base para finds de set() sobre colecciones (reemplazar por granular patches si existen).

Anexos técnicos
---------------
- scripts/multiuser_sim.js — simulador de clientes concurrentes (ver archivo en repo).
- Para integración CI: añadir job que ejecuta el script en modo dry-run contra emulator.

Fin del reporte.

# FASE C3 — FIREBASE RULES IMPLEMENTACIÓN (Staging)

Resumen corto:
Se añadieron reglas de seguridad Realtime Database enfocadas en staging, wrappers cliente para diagnósticos y protección de operaciones sensibles, y un reporte técnico con validaciones manuales.

Archivos añadidos:
- firebase-database.rules.json
- src/firebaseSecurityDiagnostics.js
- docs/reports/FASE_C3_FIREBASE_RULES_IMPLEMENTACION.md (este archivo)

Cambios principales:
- Append-only para /auditLogs: solo creación, sin update ni delete; valida correlationId, timestamp, entityType, operation.
- Role-aware writes: usa auth.token.role con roles 'SUPERVISOR' y 'JEFE'. Supervisores limitados a updates existentes que aumenten updatedAt; JEFE puede crear imports, recovery, diagnósticos.
- Employees: se exige id == key, updatedAt numeric, y se fomenta patch (updates) en vez de set completo en staging.
- Imports y Recovery: solo JEFE puede crear (no sobrescribir), se requieren markers para idempotencia.
- runtimeDiagnostics: escritura restringida a JEFE.

Diagnósticos runtime:
- getFirebaseSecurityDiagnostics() disponible en window.__HX_RUNTIME__.
- safeSet / safeUpdate helpers en window.__HX_RUNTIME__._firebaseSecurity para instrumentar writes desde cliente.

Lista de archivos modificados/creados:
- firebase-database.rules.json (nuevo)
- src/firebaseSecurityDiagnostics.js (nuevo)
- docs/reports/FASE_C3_FIREBASE_RULES_IMPLEMENTACION.md (nuevo)

Validaciones manuales sugeridas:
1. Con user con role=SUPERVISOR: intentar crear nuevo /employees/xxx (debe fallar). Intentar update existente con updatedAt mayor (debe pasar).
2. Con role=JEFE: crear /imports/abc sin marker (debe fallar). Reintentar con payload._importSafe = true (debe pasar).
3. Intentar modificar /auditLogs/anyId (update or delete) — debe fallar; crear new audit log debe pasar si campos requeridos presentes.
4. Intentar overwrite completo de /employees/ — debe fallar (validate requires id matching key and updatedAt checks).

Riesgos detectados:
- Limitado expressividad de reglas RTDB: no hay funciones reutilizables complejas ni operador "hasOnly" — reglas pueden no detectar arrays destructivos en todos los casos.
- Validación compleja del shape del objeto queda en cliente y reglas básicas: ciertos malformed payloads pueden necesitar validación server-side para cobertura total.
- Dependencia en custom claims (auth.token.role) — asegúrese de setear claims en staging auth users.

Riesgos restantes / pendientes:
- Protecciones contra arrays destructivos no completas (RTDB limits).
- No se implementó verificación temporal estricta (clock skew tolerancia mínima).
- No hay pruebas automáticas; recomendación: crear tests de contrato contra emulator antes de promover.

TODOs:
- Integrar src/firebaseSecurityDiagnostics.js en el build / import en la UI (index.html or main entry). Documentar import path en README.
- Añadir reglas al proyecto Firebase: desplegar firebase-database.rules.json a staging y testear con emulator.
- Añadir pruebas de integración con Firebase Emulator para escenarios críticos (audit append-only, imports, recovery, employee overwrite attempts).

Notas de despliegue:
- Requiere que los usuarios en staging tengan claim `role` con valores 'SUPERVISOR' o 'JEFE'.
- Desplegar reglas con: `firebase deploy --only database` apuntando a staging project.

Contacto:
Mariano


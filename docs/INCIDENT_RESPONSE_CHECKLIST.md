# INCIDENT RESPONSE CHECKLIST — Horas Extras V2

Propósito: pasos rápidos y ordenados para incidentes operacionales críticos.

Principios generales:
- Prioridad: proteger integridad de datos y audit append-only.
- Siempre generar correlationId para la operación y anexarlo al audit.
- Si duda sobre corrupción, ejecutar rollback manual y consultar equipo.

1) Firebase offline / Reconnect failures
- Paso 1: Activar modo degraded visible en UI (flag: degraded=true).
- Paso 2: Forzar adapter a localStorage (if available) y mostrar banner: "Operación en modo local".
- Paso 3: Registrar evento en audit: operation=backend_fail, status=started, correlationId.
- Paso 4: Monitorear reconnects; si reconnect > 30m, escalar al equipo de infra.
- Paso 5: Al reconectar, revisar conflicts y ejecutar reconciliation manual si aparecen.

2) Import failure / Corrupted import
- Paso 1: Detener import (no sobrescribir). Registrar failure.
- Paso 2: Restaurar snapshot más reciente exportado (export YYYYMMDD_HHMMSS.json).
- Paso 3: Comparar append-only audit entre backup y sistema actual.
- Paso 4: Si audit está corrupto, no restaurar automáticamente; escalar a ingeniería.

3) Rollback manual
- Paso 1: Identificar snapshot de respaldo válido (export list en /exports).
- Paso 2: Avisar a operadores: "Rollback inminente — detener acciones".
- Paso 3: Importar snapshot en ambiente controlado (staging). Verificar.
- Paso 4: Aplicar import manual con confirmación de 2 operadores (dupla) — prevenir errores.
- Paso 5: Registrar operation=rollback, entity=full_state, status=completed, correlationId.

4) Degraded prolonged mode
- Paso 1: Activar banner y limitar acciones críticas (no cerrar eventos nocturnos hasta confirmar integridad).
- Paso 2: Recolectar telemetry (window.__HX_RUNTIME__) y exportar.
- Paso 3: Si degraded > 24h, escalar y preparar rollback plan.

5) Conflict storm (múltiples conflicts en ventana corta)
- Paso 1: Pausar writes desde UI (poner app en modo solo-lectura si posible).
- Paso 2: Exportar conflicts list y append-only audit.
- Paso 3: Ejecutar reconciliación manual — preferir patching granular.
- Paso 4: Notificar supervisores afectados y revertir si se detecta overwrite.

6) Importante — checklist pre-acción manual
- Validar que existe export reciente.
- Anotar correlationId para todo cambio manual.
- Tener al menos 2 operadores para cambios destructivos.

Contacto de emergencia: equipo de desarrollo / almacenamiento / infraestructura.

Fecha: 2026-05-20

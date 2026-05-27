# REGISTRO DE AISLAMIENTO BINARIO - EXTRASMAKRO
## Objetivo: Detectar EXACTAMENTE qué módulo provoca el freeze del navegador

### REGLAS:
- Activar SOLO un subsistema por vez.
- Validar estabilidad antes de continuar.
- Si reaparece freeze: identificar inmediatamente el último módulo activado.

---

## FASE A - React mínimo / App.tsx vacío / Sin providers
**Estado:** ✅ COMPLETADA - LISTA PARA VALIDACIÓN
**Fecha:** 2025-12-14

### Módulo activado:
- `config.js` (APP_CONFIG)
- `config/features.js` (isFeatureEnabled)

### Módulos DESACTIVADOS:
- apiLayer.js
- runtime.js
- runtime-ui.js
- utils.js (toCSV, parseCSV, etc.)
- debug-panel.js
- runtimeDiagnostics.js
- storage/*
- supervisor.js
- live-intelligence.js
- operational-intelligence-v4.js
- strategic-operations-v5.js
- auth.js
- permissions.js
- utils_id.js

### Métricas iniciales:
- Carga: ⏳ PENDIENTE VALIDAR
- CPU: ⏳ PENDIENTE VALIDAR
- Memoria: ⏳ PENDIENTE VALIDAR
- Scrolling: ⏳ PENDIENTE VALIDAR
- Responsive: ⏳ PENDIENTE VALIDAR
- DevTools: ⏳ PENDIENTE VALIDAR

### Resultado: ⏳ ESPERANDO VALIDACIÓN DEL USUARIO

---

## FASE B - Layout estático (Sidebar, Header, Sin animaciones/gradients/blur)
**Estado:** ⏸️ WAITING - Pendiente completar FASE A

---

## FASE C - Una sola pantalla simple (Sin tablas/charts/métricas)
**Estado:** ⏸️ WAITING

---

## FASE D - React Query
**Estado:** ⏸️ WAITING

---

## FASE E - Firebase
**Estado:** ⏸️ WAITING

---

## FASE F - observers/listeners
**Estado:** ⏸️ WAITING

---

## FASE G - dashboards
**Estado:** ⏸️ WAITING

---

## FASE H - sistema visual premium
**Estado:** ⏸️ WAITING

---

## MÓDULO CULPABLE: [POR IDENTIFICAR]

---

## INSTRUCCIONES PARA EL USUARIO:

1. **Abrir la aplicación** en el navegador (usando served_app.js o servidor local)
2. **Observar la consola** - debe mostrar `[FASE A] Iniciando aislamiento binario`
3. **Verificar NO hay freeze**
4. **Medir métricas** usando DevTools (F12):
   - Performance tab para tiempo de carga
   - Task Manager para CPU
   - Memory tab para memoria
   - Probar scrolling
   - Redimensionar ventana para responsive
   - Verificar DevTools funciona sin bloqueos

5. **Reportar resultado:**
   - ✅ "FASE A OK" = procederé a activar FASE B
   - ❌ "FASE A FREEZE" = módulos culpables: config.js o config/features.js


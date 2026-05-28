# INVESTIGACION FORENSE TOTAL - FREEZE / WHITE SCREEN

Fecha: 2026-05-28

## 1) Root cause real exacta
Saturacion del bootstrap por inicializacion concurrente de modulos de inteligencia con side-effects (timers + scans de estado completo + re-render de paneles) durante los primeros segundos de vida de la app, junto con una via paralela de bootstrap estrategico desde HTML.

## 2) Archivo exacto
- src/live-intelligence.js
- src/operational-intelligence-v4.js
- src/strategic-operations-v5.js
- src/strategic-integration.js
- index.html
- src/app.js

## 3) Funcion exacta
- mountLiveIntelligence
- mountV4
- mountV5
- attachV5 dentro de strategic-integration
- bloque document.addEventListener('DOMContentLoaded', async () => { ... }) en app.js

## 4) Patron exacto del freeze
- Multiples montajes de dashboards/intelligence con timers periodicos.
- Cada ciclo ejecuta lecturas pesadas (listEmployees, getWeekAvailability, exportState) y re-render de secciones completas.
- Coincidencia temporal de loops de 6s, 8s, 12s y 20s en paralelo.
- En condiciones de CPU degradada o pestaña en background/foreground, la cola del main thread se congestiona y el navegador entra en estado de pagina no responde.

## 5) Modulo que rompe render
- Bootstrap pre-render de app.js (antes del parche) al esperar mantenimiento y chequeos antes de montar UI visible.

## 6) Modulo que congela main thread
- Cadena combinada de live-intelligence + V4 + V5 por lecturas y render periodico de alto costo en paralelo.

## 7) Listeners/observers que se multiplican
- Keydown global y timers de intelligence/runtime cuando los montajes no estaban protegidos por singleton en V4 y Live.
- Via paralela de strategic-integration desde index amplificaba inicializacion estrategica fuera del control de app.js.

## 8) Provider/render en loop
- No aplica React providers (stack vanilla JS).
- Equivalente funcional detectado: loops de refresco que rehacen arboles de dashboard de forma repetitiva.

## 9) Parche minimo estable aplicado
- Eliminada la carga paralela de strategic-integration desde index.html.
- Boot incremental en app.js con fases diferidas y controladas.
- Shell de arranque visible inmediato antes de tareas de mantenimiento.
- Instrumentacion forense temporal de bootstrap (intervalos/listeners/RAF/long tasks).
- Guardas singleton + cleanup de intervalos en Live y V4.
- Guarda singleton en V5 y control de auto-mount cuando DOMContentLoaded ya paso.

## 10) Riesgos que quedan
- Los modulos de inteligencia siguen siendo costosos por diseno (aunque ya no arrancan en tormenta). En datasets muy grandes puede haber picos de latencia.
- Se recomienda mantener muestreo de long tasks y topes de render incremental por lote.

## Evidencia adicional
- Al levantar servidor local, el navegador solicita todos los modulos iniciales y queda sin completar navegacion (timeout en herramienta de navegador), consistente con bootstrap pesado.
- Los tests de contrato/auditoria/race pasan luego del parche.

## Validaciones ejecutadas
- npm run test:smoke -> OK
- npm run test:integration -> audit_contract OK, merge_behavior OK, merge_race OK

## Archivos modificados
- index.html
- src/app.js
- src/bootstrap-forensics.js
- src/live-intelligence.js
- src/operational-intelligence-v4.js
- src/strategic-operations-v5.js
- src/strategic-integration.js

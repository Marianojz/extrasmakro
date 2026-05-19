# Índice Maestro de Documentación — Horas Extras V2

Documento Rector
----------------
- Documento rector único: [MASTER_CONTEXT.md](active/MASTER_CONTEXT.md)

Documentos Activos
------------------
- Módulo Sábados (consolidado): [MODULO_SABADO.md](active/MODULO_SABADO.md)
- Auditoría técnica: [AUDITORIA_TECNICA_TOTAL_v3.md](AUDITORIA_TECNICA_TOTAL_v3.md)

Documentos Gobernanza
----------------------
- Política institucional: [POLITICA_HORAS_EXTRAS.md](governance/POLITICA_HORAS_EXTRAS.md)
- Modelo algorítmico: [MODELO_ALGORITMICO_TRANSPARENCIA.md](governance/MODELO_ALGORITMICO_TRANSPARENCIA.md)
- Procedimiento de descargos: [PROCEDIMIENTO_DESCARGOS.md](governance/PROCEDIMIENTO_DESCARGOS.md)
- Análisis de riesgos: [ANALISIS_RIESGOS_OFICIAL.md](governance/ANALISIS_RIESGOS_OFICIAL.md)
- Manual supervisor: [MANUAL_SUPERVISOR.md](governance/MANUAL_SUPERVISOR.md)

Documentos Históricos
----------------------
- CONTEXT.md → `docs/historical/CONTEXT.md`
- PHASES.md → `docs/historical/PHASES.md`
- ROADMAP.md → `docs/historical/ROADMAP.md`
- PROTOCOLO_EJECUCION_IA.md → `docs/historical/PROTOCOLO_EJECUCION_IA.md`
- PROTOCOLO_OPERATIVO_CONGELADO.md → `docs/historical/PROTOCOLO_OPERATIVO_CONGELADO.md`
- Servidor dev: `docs/historical/server_development_stub.js`

Convenciones de actualización
-----------------------------
- `docs/active/`: Documentos activos y operativos. Cambios solo por autorización del responsable del proyecto.
- `docs/governance/`: Políticas, procedimientos y documentos legales/operativos.
- `docs/historical/`: Documentos archivados y versiones previas.
- Para cambios en `docs/active/` registrar entrada en `docs/active/CHANGELOG.md` y etiquetar en control de versiones.

Contacto
--------
Para actualizaciones o dudas sobre la normalización documental contactar al responsable de TI y RRHH.

---

## Project status — 19/05/2026

- Roadmap status: **PRE-FIREBASE HARDENED STAGING (partial)** — last updated 19/05/2026.
- Roadmap (operacional): [ROADMAP_OPERACIONAL_HORAS_EXTRAS_V2.md](../ROADMAP_OPERACIONAL_HORAS_EXTRAS_V2.md)

### Blocks (resumen breve)

- Block A — Core: boundary operativo consolidado (apiLayer), scoring, convocatorias, reputación y persistencia local (localStorage) como paso inicial.
- Block B — Operaciones: módulo Sábados, Turno Noche, exportación de reportes y auditoría técnica.
- Block C — Gobernanza: políticas, procedimientos de descargos, modelo algorítmico y transparencia.
- Block D — Integración y hardening: adapter Firebase, concurrencia multiusuario, retries y observabilidad (hardened-staging parcial).

### Próximos pasos recomendados

- A1.5.1 — Preparar integración de adapter Firebase en hardened-staging (lectura inicial): implementar contratos de adapter, agregar tests unitarios, habilitar modo read-only en staging, añadir hooks de observabilidad y retries, ejecutar pruebas smoke.

### Cómo probar localmente (dev)

- Generar build de la UI:

```bash
npm run build
```

- Ejecutar pruebas de smoke:

```bash
npm run test:smoke
```

> Estado instantáneo: PRE-FIREBASE HARDENED STAGING (partial). Última actualización: 19/05/2026.


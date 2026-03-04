MODELO ALGORÍTMICO — TRANSPARENCIA (v2.1)

1. Propósito

Este documento describe la definición técnica del scoring usado para priorizar asignaciones de horas extras. Está destinado a RRHH, auditores y representantes sindicales que requieran comprender la lógica de priorización.

2. Definición de `total_horas`

`total_horas` se define como la suma aritmética de horas registradas como `horas_50` y `horas_100` del empleado en el historial acumulado. Formalmente:

```
total_horas = horas_50 + horas_100
```

3. Fórmula de scoring (v2.1)

La versión 2.1 del scoring usa la siguiente expresión (valores numéricos deben almacenarse en `config.js` para fácil auditoría):

```
score = (total_horas * W_h) + convocado_count - (reputation * W_r) + penalty_conf
```

Donde:
- `W_h` = peso de horas acumuladas (valor por defecto: 3)
- `convocado_count` = contador de convocatorias del empleado (entero)
- `reputation` = reputación normalizada 0..100
- `W_r` = peso de reputación (valor por defecto: 0.5)
- `penalty_conf` = penalización por confiabilidad (ver sección 4)

Interpretación: menor `score` implica mayor prioridad en la asignación.

4. Penalización por confiabilidad

La penalización por confiabilidad es aplicada cuando el índice de confiabilidad (`confiabilidad`) es menor que 0.5. En v2.1 se aplica una penalización fija:

```
if (confiabilidad < 0.5) penalty_conf = +20
else penalty_conf = 0
```

Observación: esta función produce una discontinuidad en la curva de ranking; su ajuste a una penalización continua es sujeto a revisión en Fase 3B.

5. Criterios de desempate

Si dos empleados tienen el mismo `score`, se aplican en orden los siguientes criterios de desempate:

1. Menor `total_horas` (priorizar quien trabajó menos)
2. Mayor `reputation`
3. Menor número de `convocado_count` en los últimos 90 días
4. Antigüedad menor (priorizar rotación hacia empleados más nuevos)

6. Ejemplo práctico

Datos (ejemplo):
- Empleado A: `horas_50`=10, `horas_100`=5 → `total_horas`=15; `convocado_count`=8; `reputation`=70; `confiabilidad`=0.6
- Empleado B: `horas_50`=5, `horas_100`=5 → `total_horas`=10; `convocado_count`=12; `reputation`=60; `confiabilidad`=0.4

Parámetros por defecto: `W_h`=3, `W_r`=0.5

Calculo A: score_A = (15*3) + 8 - (70*0.5) + 0 = 45 + 8 - 35 = 18
Calculo B: score_B = (10*3) +12 - (60*0.5) + 20 = 30 +12 -30 +20 = 32

Resultado: `score_A` (18) < `score_B` (32) → Empleado A tiene mayor prioridad.

7. No hay exclusión automática

Este modelo NO excluye automáticamente a ningún empleado. `penalty_conf` afecta prioridad, pero no deniega la posibilidad de asignación. Cualquier asignación fuera del top sugerido exige registro en `auditLogs` con motivo y, cuando el motivo sea `otro`, texto obligatorio.

8. Registro de decisiones fuera del top

Cada decisión que aplique un empleado fuera del top calculado debe registrar en `auditLogs`: identificador del decisor, fecha/hora, empleado seleccionado, score del top sugerido, motivo, y texto justificativo (obligatorio si motivo=`otro`).

9. Límites y supuestos

- `total_horas` usa histórico acumulado almacenado en `employees[id].stats`.
- La reputación es un valor entre 0 y 100; su cálculo y penalizaciones automáticas están fuera del alcance de esta sección.
- Penalizaciones y pesos deben estar definidos en `src/config.js` para permitir auditoría y cambios controlados.
- Cualquier cambio en la fórmula debe documentarse y versionarse como `scoringVersion`.

10. Versionado y transparencia

El modelo debe versionarse como `v2.1` en `config.js` y el sistema debe conservar un histórico de cambios en `systemConfig.scoringHistory` con autor, fecha y razón del cambio.

Versión del documento: 1.0
Fecha: (a definir)
# Modelo Algorítmico y Transparencia — Horas Extras V2

1. Propósito

Explicar de forma transparente la mecánica del algoritmo de prioridad (scoring v2.1) para RRHH y representantes sindicales.

2. Definiciones

- `horas_50`: total acumulado de horas pagadas al 50%.
- `horas_100`: total acumulado de horas pagadas al 100%.
- `total_horas`: por defecto, suma simple: `total_horas = horas_50 + horas_100`.
  - Nota: esta definición puede ajustarse por consenso operativo si se decide ponderar tipos de hora.
- `convocado`: número total de veces en que el empleado fue convocado en el período considerado.
- `reputationScore`: valor numérico entre 0 y 100.
- `confiabilidad`: métrica derivada de la proporción `acepto/convocado` (definida en `models.js`).

3. Fórmula de scoring v2.1 (definición exacta)

- Fórmula principal:

  score = (total_horas × 3) + convocado − (reputationScore × 0.5)

- Penalización por baja confiabilidad:

  Si `confiabilidad < 0.5` y `convocado > 0`, entonces `score = score + 20`.

- Interpretación:
  - Menor `score` significa mayor prioridad para asignación.
  - La penalización de +20 es discreta y se aplica solo cuando se cumplen ambas condiciones.

4. Criterios de desempate

- Si dos empleados tienen el mismo `score`, se desempata por:
  1. Mayor `reputationScore` (preferir reputación mayor)
  2. Menor `convocado` (preferir quien fue convocado menos veces)
  3. Antigüedad mayor (`antiguedad_meses`)
  4. Orden por `id` (último recurso)

5. Ejemplo práctico

Empleado A:
- `horas_50` = 10
- `horas_100` = 5
- `total_horas` = 15
- `convocado` = 3
- `reputationScore` = 80
- `confiabilidad` = 0.8

scoreA = (15 × 3) + 3 − (80 × 0.5) = 45 + 3 − 40 = 8

Empleado B:
- `horas_50` = 5
- `horas_100` = 7
- `total_horas` = 12
- `convocado` = 2
- `reputationScore` = 60
- `confiabilidad` = 0.4

scoreB = (12 × 3) + 2 − (60 × 0.5) = 36 + 2 − 30 = 8

- Ambos tienen `score = 8`. Aplicar desempate: `reputationScore` mayor (A) → A priorizado.
- Nota: B tiene `confiabilidad < 0.5` y `convocado > 0`, por lo que le corresponde la penalización +20. Con la penalización, scoreB = 28 → B pierde prioridad.

6. Aclaraciones importantes

- El algoritmo **no** excluye automáticamente a empleados: solo prioriza.
- Cualquier asignación fuera del top sugerido debe registrarse con motivo y justificación en `auditLogs`.
- El modelo tiene límites: decisiones operativas excepcionales (urgencia, experiencia requerida) pueden y deben prevalecer, con registro.

7. Límites y supuestos

- `total_horas` se define por ahora como suma simple; cualquier cambio debe registrarse y comunicarse a RRHH.
- La penalización binaria por `confiabilidad` genera discontinuidad: se documenta y su impacto será revisado en Fase 3B.

8. Registro de cambios

- Versión 1.0 — 26/02/2026 — Definición inicial para revisión con RRHH.

PROCEDIMIENTO FORMAL DE DESCARGOS

1. Objetivo

Establecer el procedimiento formal mediante el cual un empleado puede presentar descargo frente a una penalización automática derivada de una convocatoria o incidente operacional.

2. Evento que origina penalización

Eventos típicos que generan penalización automática: `falto`, `no_respondio` (al cierre del 2º intento), `numero_incorrecto`. Estas penalizaciones se aplican automáticamente por el sistema y quedan en estado `pendiente_descargo`.

3. Notificación

- El empleado y su supervisor recibirán una notificación interna (registro en la UI + entrada en `auditLogs`) indicando el motivo, fecha/hora y el plazo para presentar descargo.

4. Ventana de descargo

- Plazo estándar: 48 horas desde la notificación. Este plazo podrá ampliarse a 72 horas cuando lo exija el convenio colectivo de trabajo (CCT) o por indicación formal de RRHH.

5. Presentación del descargo

- El empleado debe ingresar a la sección de descargos en la interfaz y registrar su explicación y, opcionalmente, evidencias adjuntas.
- El descargo queda asociado al evento original (`callEvent.id`) y al empleado.

6. Evaluación y decisión

- Quién decide: Supervisor directo o rol designado por RRHH.
- Opciones de resolución: `aprobado` (revierte la penalización), `rechazado` (penalización mantiene), `sin_respuesta` (si vence la ventana sin descargo y el sistema cierra el incidente).
- El decisor debe registrar en el sistema una justificación textual de la resolución.

7. Registro en `auditLogs`

Cada paso del procedimiento debe quedar en `auditLogs`: notificación enviada, descargo recibido (texto y adjuntos), resolución (decisor, fecha, texto justificativo). Los registros deben ser inmutables y traer sello temporal.

8. Políticas de conservación de registros

Los registros de descargos y sus resoluciones deberán conservarse conforme a la política general de retención de datos que se definirá antes de la puesta en producción. Mientras tanto, se conservarán en el audit log local.

9. Posible ampliación a 72h

Si la revisión legal o el CCT aplicable exige una ventana mayor, se documentará la ampliación a 72 horas y se aplicará en `config.js` y en este procedimiento.

10. Consideraciones finales

- La reversión de penalizaciones no implica sanción ni obligación de pago retroactivo; sólo restaura el estado reputacional.
- Cualquier disputa grave deberá seguir los procedimientos formales de la empresa y/o del sindicato.

Versión: 1.0
Fecha: (a definir)
# Procedimiento de Descargos — Horas Extras V2

1. Evento que genera penalización

- Incidentes que pueden generar penalización: `falto`, `no_respondio` (tras 2 intentos), `numero_incorrecto`, y `rechazo` en convocatoria.
- La aplicación registra el incidente en `employees[id].incidents` y crea una entrada con estado inicial `pendiente_descargo`.

2. Notificación

- El sistema genera un registro en `auditLogs` y una notificación visual en la UI al supervisor.
- El empleado debe recibir constancia del incidente y del inicio de la ventana de descargo; en la fase offline esta constancia puede imprimirse desde el detalle del empleado.

3. Ventana de descargo

- Plazo operativo actual: 48 horas desde el momento del incidente.
- Este plazo está sujeto a validación legal por RRHH; si el CCT exige 72 horas, el plazo se actualizará y quedará registrado en la política.

4. Presentación del descargo

- El empleado puede presentar su descargo en formato libre (texto) desde la UI.
- El descargo queda registrado en el incidente con marca temporal y autor.

5. Resolución (aprobación / rechazo)

- Quién decide: rol `jefe` o persona autorizada por RRHH (no el supervisor que registró el incidente, si la política organizacional lo requiere).
- La resolución debe incluir: identificador del decisor, fecha/hora y texto justificativo.
- La resolución se registra en `auditLogs` vinculada al incidente.

6. Efecto de la resolución

- Si se aprueba → se revierte la penalización; el incidente pasa a `revertido`.
- Si se rechaza → la penalización se mantiene; el incidente pasa a `rechazado`.
- Si vence sin descargo → el incidente pasa a `cerrado_sin_descargo` y se mantiene la penalización.

7. Registro y conservación

- Todos los incidentes y su resolución se conservan en `auditLogs` y en los registros del empleado.
- Política de conservación: por defecto mantener registros por 5 años; esta política será revisada y adaptada para la Fase 5 (política de retención en Firestore).

8. Posibles ajustes

- Si la revisión legal determina necesidad, el plazo de descargo podrá ampliarse a 72 horas.

9. Notas operativas

- En la fase offline, la notificación al empleado puede ser impresa o entregada en papel y firmada; en producción (Firebase) deberá enviarse notificación electrónica según política.

Versión: 1.0
Fecha: 26/02/2026
Responsable: RRHH — Operaciones (documentar responsable real antes de publicación)

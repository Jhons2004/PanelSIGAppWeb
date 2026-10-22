function WAPP_CERT_registrarPendiente_(payload, user) {
  const cfg = WAPP_cfg_();
  const flow = WAPP_FLOW_get_();
  if (!flow.registro) throw new Error('No existe un OEC activo.');

  const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
  const evalData = WAPP_PRES_getEvaluacion_() || {};

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_CERTIFICADOS_PENDIENTES);
  if (!sh) throw new Error('No existe Certificados_Pendientes.');

  const id = Utilities.getUuid();
  const now = new Date();

  const row = {
    ID_Pendiente: id,
    Fecha_Registro: now,
    OEC_ID: ctx.registro,
    Razon_Social: ctx.razonSocial,
    Esquema: ctx.tipo,
    Norma: ctx.norma,
    Tipo_Evaluacion: evalData.tipoEvaluacion || '',
    Ciclo_ID: ctx.ciclo && ctx.ciclo.cicloId || '',
    Fila_Presupuesto: String(payload.filaPresupuesto || ''),
    ID_Evaluacion: String(payload.idEvaluacion || ''),
    Usuario_Origen: user.email,
    Estado: 'Pendiente',
    Origen: 'WebApp_Presupuestos',
    Observaciones: String(payload.observaciones || ''),
    Fecha_Procesado: '',
    Procesado_Por: ''
  };

  WAPP_appendByHeaders_(sh, row);

  return {
    idPendiente: id,
    estado: 'Pendiente',
    registro: ctx.registro
  };
}

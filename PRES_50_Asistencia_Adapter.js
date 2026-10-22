function WAPP_ASIST_obtenerLinksActuales_() {
  const cfg = WAPP_cfg_();
  const flow = WAPP_FLOW_get_();
  if (!flow.registro) throw new Error('No existe un OEC activo.');

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_EVENTOS);
  if (!sh) throw new Error('No existe Eventos_Asistencia.');

  const rows = WAPP_rowsByHeaders_(sh)
    .filter(r =>
      String(r.OEC_ID || '').trim().toUpperCase() === flow.registro &&
      WAPP_norm_(r.Estado_Evento) !== 'anulado'
    )
    .slice(-10);

  const map = rows.map(r => ({
    idEvento: String(r.ID_Evento || ''),
    tipoActividad: String(r.Tipo_Actividad || ''),
    tipoEvaluacion: String(r.Tipo_Evaluacion || ''),
    estado: String(r.Estado_Evento || ''),
    url: String(r.URL_Captura || ''),
    urlPdf: String(r.URL_PDF || ''),
    fechaReunion: WAPP_dateText_(r.Fecha_Reunion)
  }));

  return {
    encontrada: map.length > 0,
    eventos: map
  };
}

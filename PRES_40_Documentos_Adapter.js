function WAPP_DOC_generar_(payload) {
  payload = payload || {};

  const evaluacion = WAPP_PRES_getEvaluacion_();
  const equipo = WAPP_EQ_get_();

  if (!evaluacion) {
    throw new Error('No existe la evaluación en sesión.');
  }

  if (!equipo.length) {
    throw new Error('No existe equipo evaluador en sesión.');
  }

  // Repite las validaciones críticas justo antes de generar.
  WAPP_EQ_assertDiasSegunPrediccion_(equipo);

  WAPP_DUP_assertAllowed_({
    registro: evaluacion.registro,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal
  }, WAPP_SEC_assertUsuarioInterno_());

  const result = WAPP_DOCV16_generar_(payload);

  return {
    result: result,
    resumen: {
      registro: evaluacion.registro,
      tipoEvaluacion: evaluacion.tipoEvaluacion,
      fechaInicio: evaluacion.fechaInicio,
      fechaFinal: evaluacion.fechaFinal,
      integrantes: equipo.length,
      operacionId: result.operacionId || '',
      estado: result.estado || ''
    }
  };
}

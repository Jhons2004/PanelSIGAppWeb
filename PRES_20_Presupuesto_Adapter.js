function WAPP_PRES_guardarEvaluacion_(payload) {
  const flow = WAPP_FLOW_get_();
  const user = WAPP_SEC_assertUsuarioInterno_();
  if (!flow.registro) throw new Error('No existe un OEC activo.');

  const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
  const permitirOtrosTipos = payload.mostrarOtrosTipos === true;
  const tipo = WAPP_EVAL_validarTipo_(
    ctx,
    payload.tipoEvaluacion,
    permitirOtrosTipos
  );
  const tipoFueraPrograma = !(
    Array.isArray(ctx.tiposEvaluacionPermitidos) &&
    ctx.tiposEvaluacionPermitidos.includes(tipo)
  );

  const data = {
    registro: flow.registro,
    tipoEvaluacion: tipo,
    mostrarOtrosTipos: permitirOtrosTipos,
    tipoFueraPrograma: tipoFueraPrograma,
    fechaInicio: String(payload.fechaInicio || '').trim(),
    fechaFinal: String(payload.fechaFinal || '').trim(),

    // Dirección real: pendiente de fuente definida por OGA.
    direccionOEC: String(payload.direccionOEC || '').trim(),

    personal: Number(payload.personal),
    sitios: Number(payload.sitios),
    areas: Number(payload.areas),
    nc: Number(payload.nc || 0),
    testificaciones: Number(payload.testificaciones || 0),
    muestreo: String(payload.muestreo || 'No').trim(),
    ciclosAcreditados: Number(ctx.ciclosAcreditados || 0),
    instalacionesProgramadas: []
  };

  const estimacion = WAPP_TIME_estimar_(ctx, data);
  const autoFechaFinal =
    WAPP_EVAL_autocompletaFechaFinal_(data.tipoEvaluacion);

  // Todos los tipos requieren ingresar fechas.
  if (!data.fechaInicio) {
    throw new Error('Seleccione la fecha inicial.');
  }

  // Sólo los procesos programados con antelación autocompletan fecha final.
  if (!data.fechaFinal && autoFechaFinal) {
    data.fechaFinal = WAPP_TIME_fechaFinalSugerida_(
      data.fechaInicio,
      estimacion.duracionSugerida
    );
  }

  if (!data.fechaFinal) {
    throw new Error('Seleccione la fecha final.');
  }

  // Control básico de integridad. Para revisión documental AC estas fechas
  // NO intervienen en la detección de duplicados ni en la programación anticipada.
  WAPP_TIME_validarFechas_(data.fechaInicio, data.fechaFinal);

  // Control de duplicados:
  // primera parada = mismo OEC + mismo tipo, independientemente de las fechas.
  const duplicado = WAPP_DUP_assertAllowed_({
    registro: data.registro,
    tipoEvaluacion: data.tipoEvaluacion,
    fechaInicio: data.fechaInicio,
    fechaFinal: data.fechaFinal
  }, user);

  data.controlDuplicado = {
    hasDuplicates: duplicado.hasDuplicates,
    authorized: duplicado.authorized,
    authorization: duplicado.authorization ? {
      idAutorizacion: duplicado.authorization.idAutorizacion,
      autorizadoPor: duplicado.authorization.autorizadoPor,
      motivo: duplicado.authorization.motivo,
      fechaAutorizacion: duplicado.authorization.fechaAutorizacion,
      filasAntecedentes: duplicado.authorization.filasAntecedentes || []
    } : null,
    antecedentes: duplicado.duplicates || []
  };

  // Sitios programados se validan contra Registro Maestro.
  if (typeof WAPP_SITIOS_validarSeleccion_ !== 'function') {
    throw new Error(
      'No está disponible el servicio de instalaciones. ' +
      'Verifique 12_Sitios_Service.gs antes de guardar la evaluación.'
    );
  }

  data.instalacionesProgramadas = WAPP_SITIOS_validarSeleccion_(
    data.registro,
    payload.instalacionesProgramadas,
    data.tipoEvaluacion
  );

  data.estimacionTiempo = estimacion;
  data.fechaFinalSugerida = autoFechaFinal && data.fechaInicio
    ? WAPP_TIME_fechaFinalSugerida_(
        data.fechaInicio,
        estimacion.duracionSugerida
      )
    : '';

  const props = WAPP_STATE_props_();
  props.setProperty('WAPP_EVALUACION', JSON.stringify(data));

  // Cualquier cambio de evaluación invalida una vista previa anterior.
  props.deleteProperty('WAPP_DOC_PREVIEW_STATE');

  return data;
}

function WAPP_PRES_getEvaluacion_() {
  const raw = WAPP_STATE_props_().getProperty('WAPP_EVALUACION');
  return raw ? JSON.parse(raw) : null;
}

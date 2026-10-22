/**
 * Acceso institucional de la WebApp.
 *
 * La identidad NO se recibe desde HTML. Google Workspace/Apps Script Session
 * determina el correo y Security.gs aplica la autorización OGA.
 * payload sólo admite información operativa como nuevaOperacion.
 */
function WAPP_API_login(payload) {
  try {
    payload = payload || {};
    WAPP_assertConfig_();

    // IMPORTANTE: cualquier payload.email legado se ignora deliberadamente.
    const user = WAPP_SEC_assertUsuarioInterno_();

    if (payload.nuevaOperacion === true) {
      WAPP_API_limpiarEstadoOperacion_();
    }

    return WAPP_ok_({
      version: WAPP_VERSION,
      env: WAPP_getEnv_(),
      user: user,
      csrf: WAPP_SEC_issueMutationToken_(),
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

/**
 * Bootstrap principal. Permite recargar la página y recuperar la identidad
 * institucional/flujo sin volver a escribir un correo.
 */
function WAPP_API_bootstrap() {
  try {
    WAPP_assertConfig_();
    const user = WAPP_SEC_assertUsuarioInterno_();

    return WAPP_ok_({
      version: WAPP_VERSION,
      env: WAPP_getEnv_(),
      user: user,
      csrf: WAPP_SEC_issueMutationToken_(),
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

/**
 * Cierra la sesión OPERATIVA de la aplicación.
 * No cierra Gmail/Drive ni la sesión global de Google.
 */
function WAPP_API_logout(payload) {
  try {
    payload = payload || {};
    WAPP_SEC_assertUsuarioInterno_();

    const token = String(payload.csrf || '').trim();
    if (token) {
      WAPP_SEC_assertMutationToken_(token);
      WAPP_SEC_revokeMutationToken_(token);
    }

    return WAPP_ok_({ closed: true });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

/**
 * Limpia solamente el estado temporal de una operación cuando el usuario
 * solicita expresamente "Iniciar nueva operación".
 */
function WAPP_API_limpiarEstadoOperacion_() {
  const props = WAPP_STATE_props_();
  props.deleteProperty(WAPP_FLOW_key_());
  props.deleteProperty('WAPP_EVALUACION');
  props.deleteProperty('WAPP_EQUIPO');
  props.deleteProperty('WAPP_EQUIPO_COMPOSICION');
  props.deleteProperty('WAPP_DOC_PREVIEW_STATE');
  props.deleteProperty('WAPP_DUPLICATE_AUTH_V1');
  props.deleteProperty('WAPP_DUPLICATE_OTP_V1');
  props.deleteProperty('WAPP_DOC_V16_STATE');
  props.deleteProperty('WAPP_OP_V17_STATE');
  WAPP_FLOW_reset_('');
}

/**
 * Fachada pública para google.script.run.
 * El HTML SOLO llama funciones WAPP_API_*.
 * No se expone ejecución arbitraria de funciones internas.
 */
function WAPP_API_buscarOEC(registro) {
  try {
    WAPP_SEC_assertUsuarioInterno_();
    const ctx = WAPP_OEC_obtenerContexto_(registro);
    SIGA_AUDIT_event_('CONSULTA_OEC', 'PRESUPUESTO', 'OK', registro, '', '');

    const props = WAPP_STATE_props_();
    props.deleteProperty('WAPP_EVALUACION');
    props.deleteProperty('WAPP_EQUIPO');
    props.deleteProperty('WAPP_EQUIPO_COMPOSICION');
    props.deleteProperty('WAPP_DOC_PREVIEW_STATE');
    props.deleteProperty('WAPP_DUPLICATE_AUTH_V1');
    props.deleteProperty('WAPP_DUPLICATE_OTP_V1');

    WAPP_FLOW_reset_(ctx.registro);
    WAPP_FLOW_complete_('OEC', {
      registro: ctx.registro,
      razonSocial: ctx.razonSocial,
      cicloId: ctx.ciclo && ctx.ciclo.cicloId || ''
    });
    return WAPP_ok_({
      contexto: ctx,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}



function WAPP_API_obtenerSitiosOEC() {
  try {
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('EVALUACION');

    if (typeof WAPP_SITIOS_listar_ !== 'function') {
      throw new Error(
        'Módulo de instalaciones no disponible. ' +
        'Verifique que 12_Sitios_Service.gs esté instalado y guardado.'
      );
    }

    const flow = WAPP_FLOW_get_();
    const sitios = WAPP_SITIOS_listar_(flow.registro);

    return WAPP_ok_({
      sitios: sitios,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}


function WAPP_API_diagnosticoSitios() {
  try {
    const user = WAPP_SEC_assertUsuarioInterno_();
    const flow = WAPP_FLOW_get_();

    if (
      typeof WAPP_SITIOS_listar_ !== 'function' ||
      typeof WAPP_SITIOS_validarSeleccion_ !== 'function'
    ) {
      throw new Error(
        'Módulo 12_Sitios_Service.gs incompleto o no instalado.'
      );
    }

    const registro = flow.registro || 'OGA-LE-001-01';
    const sitios = WAPP_SITIOS_listar_(registro);

    return WAPP_ok_({
      usuario: user.email,
      registro: registro,
      total: sitios.length,
      sitios: sitios
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_verificarDuplicadosEvaluacion(payload) {
  try {
    payload = payload || {};
    const user = WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('EVALUACION');

    const out = WAPP_DUP_check_(payload, user);

    return WAPP_ok_({
      duplicado: out
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_autorizarDuplicadoEvaluacion(payload) {
  // Endpoint legado conservado para que una versión antigua del cliente
  // falle de forma explícita y no permita omitir el OTP.
  return WAPP_fail_(new Error(
    'Autorización directa deshabilitada. Solicite y valide el token de jefatura.'
  ));
}

function WAPP_API_solicitarTokenDuplicado(payload) {
  try {
    payload = payload || {};
    const user = WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('solicitarTokenDuplicado', payload.requestId);
    WAPP_FLOW_assertPrevious_('EVALUACION');

    const out = WAPP_DUP_OTP_solicitar_(payload, user);

    return WAPP_ok_({
      otp: out
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_validarTokenDuplicado(payload) {
  try {
    payload = payload || {};
    const user = WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('validarTokenDuplicado', payload.requestId);
    WAPP_FLOW_assertPrevious_('EVALUACION');

    const out = WAPP_DUP_OTP_validar_(payload, user);

    return WAPP_ok_({
      autorizacion: out
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_estimarTiempo(payload) {
  try {
    payload = payload || {};
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('EVALUACION');

    const flow = WAPP_FLOW_get_();
    const ctx = WAPP_OEC_obtenerContexto_(flow.registro);

    WAPP_EVAL_validarTipo_(ctx, payload.tipoEvaluacion, payload.mostrarOtrosTipos === true);

    const out = WAPP_TIME_estimar_(ctx, payload);
    return WAPP_ok_({ estimacion: out });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_obtenerCatalogoEquipo() {
  try {
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('EQUIPO');

    const flow = WAPP_FLOW_get_();
    const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
    const out = WAPP_TEAM_obtenerCatalogos_(ctx);
    const evaluacion = WAPP_PRES_getEvaluacion_();

    return WAPP_ok_({
      catalogo: out,
      evaluacion: evaluacion
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_guardarEvaluacion(payload) {
  try {
    payload = payload || {};
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('guardarEvaluacion', payload.requestId);
    WAPP_FLOW_assertPrevious_('EVALUACION');

    SIGA_AUDIT_preflight_();
    SIGA_AUDIT_requerirEvento_('OPERACION_INICIO','PRESUPUESTO_EVALUACION', WAPP_FLOW_get_().registro || '', payload.requestId || '');
    const out = WAPP_PRES_guardarEvaluacion_(payload);
    SIGA_AUDIT_event_('OPERACION', 'PRESUPUESTO_EVALUACION', 'OK', WAPP_FLOW_get_().registro || '', payload.requestId || '', '');
    WAPP_FLOW_complete_('EVALUACION', out);

    return WAPP_ok_({
      evaluacion: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    SIGA_AUDIT_event_('OPERACION_ERROR', 'WAPP_API_guardarEvaluacion', 'ERROR', '', payload && payload.requestId || '', 'Fallo controlado');
    return WAPP_fail_(e);
  }
}

function WAPP_API_guardarEquipo(payload) {
  try {
    payload = payload || {};
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('guardarEquipo', payload.requestId);
    WAPP_FLOW_assertPrevious_('EQUIPO');

    SIGA_AUDIT_preflight_();
    SIGA_AUDIT_requerirEvento_('OPERACION_INICIO','PRESUPUESTO_EQUIPO', WAPP_FLOW_get_().registro || '', payload.requestId || '');
    const out = WAPP_EQ_guardar_(payload);
    SIGA_AUDIT_event_('OPERACION', 'PRESUPUESTO_EQUIPO', 'OK', WAPP_FLOW_get_().registro || '', payload.requestId || '', '');
    WAPP_FLOW_complete_('EQUIPO', {
      total: out.total || 0
    });

    return WAPP_ok_({
      equipo: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    SIGA_AUDIT_event_('OPERACION_ERROR', 'WAPP_API_guardarEquipo', 'ERROR', '', payload && payload.requestId || '', 'Fallo controlado');
    return WAPP_fail_(e);
  }
}


function WAPP_API_previsualizarDocumentos() {
  try {
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('DOCUMENTOS');

    const out = WAPP_DOC_PREVIEW_create_();

    return WAPP_ok_({
      preview: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_generarDocumentos(payload) {
  try {
    payload = payload || {};

    if (!WAPP_FEATURE_enabled_('DOCUMENT_GENERATION')) {
      throw new Error(
        'La generación documental está deshabilitada por configuración. ' +
        'Esta versión valida únicamente hasta la vista previa.'
      );
    }
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('generarDocumentos', payload.requestId);
    WAPP_FLOW_assertPrevious_('DOCUMENTOS');
    WAPP_DOC_PREVIEW_assertToken_(payload.previewToken);

    SIGA_AUDIT_preflight_();
    SIGA_AUDIT_requerirEvento_('OPERACION_INICIO','PRESUPUESTO_DOCUMENTOS', WAPP_FLOW_get_().registro || '', payload.requestId || '');
    const out = WAPP_DOC_generar_(payload);
    SIGA_AUDIT_event_('OPERACION', 'PRESUPUESTO_DOCUMENTOS', 'OK', WAPP_FLOW_get_().registro || '', payload.requestId || '', '');
    WAPP_FLOW_complete_('DOCUMENTOS', out.resumen || {});

    return WAPP_ok_({
      documentos: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    SIGA_AUDIT_event_('OPERACION_ERROR', 'WAPP_API_generarDocumentos', 'ERROR', '', payload && payload.requestId || '', 'Fallo controlado');
    return WAPP_fail_(e);
  }
}

function WAPP_API_obtenerAsistenciaActual() {
  try {
    WAPP_SEC_assertUsuarioInterno_();
    WAPP_FLOW_assertPrevious_('ASISTENCIA');

    const out = WAPP_ASIST_obtenerLinksActuales_();
    WAPP_FLOW_complete_('ASISTENCIA', {
      encontrada: !!out.encontrada
    });

    return WAPP_ok_({
      asistencia: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    return WAPP_fail_(e);
  }
}

function WAPP_API_registrarCertificadoPendiente(payload) {
  try {
    payload = payload || {};
    const user = WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_('certificadoPendiente', payload.requestId);
    WAPP_FLOW_assertPrevious_('CIERRE');

    SIGA_AUDIT_preflight_();
    SIGA_AUDIT_requerirEvento_('OPERACION_INICIO','PRESUPUESTO_CERTIFICADO', WAPP_FLOW_get_().registro || '', payload.requestId || '');
    const out = WAPP_CERT_registrarPendiente_(payload, user);
    SIGA_AUDIT_event_('OPERACION', 'PRESUPUESTO_CERTIFICADO', 'OK', WAPP_FLOW_get_().registro || '', payload.requestId || '', '');
    WAPP_FLOW_complete_('CIERRE', {
      idPendiente: out.idPendiente,
      estado: out.estado
    });

    return WAPP_ok_({
      certificado: out,
      flow: WAPP_FLOW_publicState_()
    });
  } catch (e) {
    SIGA_AUDIT_event_('OPERACION_ERROR', 'WAPP_API_registrarCertificadoPendiente', 'ERROR', '', payload && payload.requestId || '', 'Fallo controlado');
    return WAPP_fail_(e);
  }
}

function WAPP_API_diagnostico() {
  try {
    const user = WAPP_SEC_assertUsuarioInterno_();
    return WAPP_ok_(WAPP_DIAG_run_(user));
  } catch (e) {
    return WAPP_fail_(e);
  }
}

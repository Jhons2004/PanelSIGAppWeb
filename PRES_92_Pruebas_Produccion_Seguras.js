/**
 * 92_Pruebas_Produccion_Seguras
 *
 * Conjunto de pruebas READ-ONLY para soporte productivo.
 * No genera documentos, no reserva correlativos, no modifica Sheets,
 * no cambia Script Properties y no crea/actualiza Calendar ni correo.
 */

function TEST_WAPP_PROD_CONFIG_READONLY() {
  WAPP_SEC_assertUsuarioInterno_();
  const out = {
    version: WAPP_VERSION,
    appEnv: WAPP_getEnv_(),
    actual: WAPP_validateConfig_(WAPP_getEnv_()),
    prod: WAPP_validateConfig_('PROD')
  };

  console.log(
    '[TEST_WAPP_PROD_CONFIG_READONLY] ' +
    JSON.stringify(out)
  );

  return out;
}


function TEST_WAPP_PROD_DEPENDENCIAS_READONLY() {
  WAPP_SEC_assertUsuarioInterno_();
  const cfg = WAPP_cfg_();
  const props = PropertiesService.getScriptProperties();

  const requiredFunctions = [
    'WAPP_API_login',
    'WAPP_API_buscarOEC',
    'WAPP_API_guardarEvaluacion',
    'WAPP_API_guardarEquipo',
    'WAPP_API_previsualizarDocumentos',
    'WAPP_API_generarDocumentos',
    'WAPP_API_reanudarOperacionParcial',
    'WAPP_DOCV16_generar_',
    'WAPP_V17_completarOperacion_',
    'WAPP_V171_TC_resolver_',
    'WAPP_INT_diagnosticarFila_',
    'WAPP_ASISTV16_prepararAgenda_',
    'WAPP_CERT_registrarPendiente_'
  ];

  const funciones = requiredFunctions.map(function(name) {
    return {
      name: name,
      disponible:
        typeof globalThis[name] === 'function'
    };
  });

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_BOLETAS_ID);
  const requiredSheets = [
    cfg.HOJA_PRESUPUESTO,
    cfg.HOJA_REGISTROS,
    cfg.HOJA_EQUIPO_EVALUADOR,
    cfg.OPERACION.SHEET_BOLETA_TEMPLATE,
    cfg.INTEGRIDAD.SHEET_OPERACIONES,
    cfg.INTEGRIDAD.SHEET_CORRELATIVOS,
    cfg.TIPO_CAMBIO.SHEET
  ];

  const sheets = requiredSheets.map(function(name) {
    const sh = ss.getSheetByName(name);
    return {
      name: name,
      existe: !!sh,
      lastRow: sh ? sh.getLastRow() : null
    };
  });

  const out = {
    ok:
      funciones.every(function(x){ return x.disponible; }) &&
      sheets.every(function(x){ return x.existe; }),
    version: WAPP_VERSION,
    appEnv: WAPP_getEnv_(),
    calendarEnabled:
      String(
        props.getProperty(
          cfg.OPERACION.PROP_CALENDAR_ENABLED
        ) || ''
      ).trim().toUpperCase(),
    emailEnabled:
      String(
        props.getProperty(
          cfg.OPERACION.PROP_EMAIL_ENABLED
        ) || ''
      ).trim().toUpperCase(),
    funciones: funciones,
    sheets: sheets
  };

  console.log(
    '[TEST_WAPP_PROD_DEPENDENCIAS_READONLY] ' +
    JSON.stringify(out)
  );

  return out;
}


function TEST_WAPP_PROD_TIPO_CAMBIO_READONLY() {
  WAPP_SEC_assertUsuarioInterno_();
  const out = WAPP_V171_TC_preflight_();

  console.log(
    '[TEST_WAPP_PROD_TIPO_CAMBIO_READONLY] ' +
    JSON.stringify(out)
  );

  return out;
}


function TEST_WAPP_PROD_IDENTIDAD_CANONICA_READONLY() {
  WAPP_SEC_assertUsuarioInterno_();
  if (typeof WAPP_DIAG_ID_scan_ !== 'function') {
    throw new Error(
      'Falta 91_Diagnostico_Identidad_Canonica.gs.'
    );
  }

  const out = WAPP_DIAG_ID_scan_();

  console.log(
    '[TEST_WAPP_PROD_IDENTIDAD_CANONICA_READONLY] ' +
    JSON.stringify(out)
  );

  return out;
}


function TEST_WAPP_PROD_ULTIMA_OPERACION_READONLY() {
  WAPP_SEC_assertUsuarioInterno_();
  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_BOLETAS_ID);
  const sh = ss.getSheetByName(cfg.HOJA_PRESUPUESTO);

  if (!sh || sh.getLastRow() < 2) {
    return {
      ok: true,
      existe: false,
      mensaje: 'No existen filas operativas para diagnosticar.'
    };
  }

  const fila = sh.getLastRow();
  const diagnostico = WAPP_INT_diagnosticarFila_(fila);

  const out = {
    ok: true,
    existe: true,
    fila: fila,
    diagnostico: diagnostico
  };

  console.log(
    '[TEST_WAPP_PROD_ULTIMA_OPERACION_READONLY] ' +
    JSON.stringify(out)
  );

  return out;
}

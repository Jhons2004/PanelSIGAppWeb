/** =========================================================
 *  Ingreso_reconocimientos.gs — SPA Edition
 *
 *  ✅ ELIMINADO:
 *     doGet(), renderHtml_(), getWebAppUrl_(), obtenerContextoUi_()
 *     abrirPanelSelectorResoluciones(), abrirPanelIngresoResoluciones()
 *     abrirPanelIngresoReconocimientos()
 *     → Navegación 100% en manos del SPA (Code.gs + OGA engine)
 *
 *  ✅ RENOMBRADO con prefijo rec_ (evitar colisiones de scope global):
 *     CFG_RECONOCIMIENTO             → REC_CFG
 *     CFG_BOLETA                     → REC_CFG_BOLETA
 *     getSheetByGid_                 → rec_getSheetByGid_
 *     buscarFilaPorRegistro_         → rec_buscarFilaPorRegistro_
 *     mapRowByHeaders_               → rec_mapRowByHeaders_
 *     actualizarEstadoResolucion...  → rec_actualizarEstadoResolucion_
 *     normalizarTexto_               → rec_normalizarTexto_
 *     normalizarEncabezado_          → rec_normalizarEncabezado_
 *     obtenerValorPorAliases_        → rec_obtenerValorPorAliases_
 *     valorSeguro_                   → rec_valorSeguro_
 *     escapeForReplaceText_          → rec_escapeForReplaceText_
 *     limpiarNitReconocimiento_      → rec_limpiarNit_
 *     fechaGuatemalaLarga_           → rec_fechaGuatemalaLarga_
 *     extraerAnioDeFecha_            → rec_extraerAnioDeFecha_
 *     formatearFechaReconocido_      → rec_formatearFechaReconocido_
 *     normalizarEstadoEmitido_       → rec_normalizarEstadoEmitido_
 *     construirNombreDocumento...    → rec_construirNombreDocumento_
 *     extraerFileIdDeUrl_            → rec_extraerFileIdDeUrl_
 *     exportarHojaComoPDF            → rec_exportarHojaComoPDF
 *     generarBoletaAutomatica...     → rec_generarBoletaAutomatica_
 *     obtenerResponsableBoleta...    → rec_obtenerResponsableBoleta_
 *
 *  ✅ CORREGIDO:
 *     obtenerNombreUsuarioPorCorreoSheets() → obtenerNombreUsuarioPorCorreo()
 *     (usa la función que ya existe en Usuarios.gs del sistema)
 *
 *  ⚠️  MANTENER PÚBLICAS sin renombrar (llamadas desde google.script.run):
 *     buscarDatosReconocimiento()
 *     generarResolucionReconocimiento()
 *     registrarBoletaPago()  ← función base compartida con otros módulos
 *     Si registrarBoletaPago ya existe en otro .gs → eliminar el bloque de aquí
 * ========================================================= */

/* =========================================================
 * CONFIGURACIÓN
 * ========================================================= */
const REC_CFG = {
  ssSolicitudesId:  '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc',
  gidSolicitudes:    1842193478,
  ssBaseOficialId:  '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc',
  gidBaseOficial:    1456467872,
  ssDecisionesId:   '1ojF7iJ_npGYO4NH6SxqHAmsKCRX-62HTeM6RP1oEWDU',
  gidDecisiones:     1983481747,
  templateDocId:    '1z6olYs7pWk3pMSace7B-dVWhyw4jS-Y3Jgty2txXHoQ',
  carpetaDestinoId: '1I4w5Qb4hIuaixnNAf6emfTZC61n8U-El',
  timezone:         'America/Guatemala',
  cooperacion:      'Global Accreditation Cooperation Incorporated**'
};

const REC_CFG_BOLETA = {
  idCfg:                  '1kK9qsUKH019-quRrifuwXGfxHH6YVSzL0gf8jPnwIVQ',
  idRegistros:            '1ILM5ZnguO-EGs4m-zu6igOP6oT-s7t1EPMahXtdow3o',
  idCarpetaPdf:           '1ieYZfytPUF8QvVeuv88nIrjKicdgHLZZ',
  conceptoReconocimiento: 'Aplicación y evaluación general de la documentación',
  montoUsdReconocimiento:  100
};

/* =========================================================
 * API PÚBLICA — llamadas desde google.script.run en el HTML
 * ========================================================= */

/**
 * Busca y valida todos los datos necesarios para la resolución.
 */
function buscarDatosReconocimiento(params) {
  const registro = String(params?.registro || '').trim();
  const anio     = String(params?.anio     || '').trim();

  if (!registro) throw new Error('Debe proporcionar el Registro de acreditación.');
  if (!anio)     throw new Error('Debe proporcionar el Año de solicitud.');

  const shSolicitudes   = rec_getSheetByGid_(REC_CFG.ssSolicitudesId, REC_CFG.gidSolicitudes);
  const filaSolicitud   = rec_buscarFilaPorRegistro_(shSolicitudes, 'Registro de acreditación', registro);
  if (!filaSolicitud)   throw new Error('No se encontró el registro en la hoja de solicitudes.');

  const datosSolicitud    = rec_mapRowByHeaders_(shSolicitudes, filaSolicitud);
  const marcaTemporal     = rec_obtenerValorPorAliases_(datosSolicitud, ['Marca temporal', 'Timestamp']);
  const anioSolicitudReal = rec_extraerAnioDeFecha_(marcaTemporal);

  if (!anioSolicitudReal) {
    throw new Error('No fue posible determinar el año real de la solicitud desde la Marca temporal.');
  }
  if (String(anioSolicitudReal) !== String(anio)) {
    throw new Error(
      'El año ingresado no coincide con el año de la solicitud registrada. ' +
      'Año ingresado: ' + anio + '. Año detectado: ' + anioSolicitudReal + '.'
    );
  }

  const estadoResolucion = rec_obtenerValorPorAliases_(datosSolicitud, ['Resolución', 'Resolucion']);
  const yaEmitida        = rec_normalizarEstadoEmitido_(estadoResolucion);

  const shBaseOficial    = rec_getSheetByGid_(REC_CFG.ssBaseOficialId, REC_CFG.gidBaseOficial);
  const filaBaseOficial  = rec_buscarFilaPorRegistro_(shBaseOficial, 'Registro de acreditación', registro);
  const datosBaseOficial = filaBaseOficial ? rec_mapRowByHeaders_(shBaseOficial, filaBaseOficial) : {};

  const shDecisiones   = rec_getSheetByGid_(REC_CFG.ssDecisionesId, REC_CFG.gidDecisiones);
  const filaDecision   = rec_buscarFilaPorRegistro_(shDecisiones, 'Registro_Acreditacion', registro);
  const datosDecision  = filaDecision ? rec_mapRowByHeaders_(shDecisiones, filaDecision) : {};

  return {
    registro, anio, anioSolicitudReal,
    esquema:            rec_obtenerValorPorAliases_(datosSolicitud,   ['Esquema de acreditación', 'Esquema']),
    razonSocial:        rec_obtenerValorPorAliases_(datosSolicitud,   ['Razón social (según lo inscrito con su número de identificación tributaria)', 'Razón social', 'Razon social']),
    norma:              rec_obtenerValorPorAliases_(datosSolicitud,   ['Norma']),
    contactoNombre:     rec_obtenerValorPorAliases_(datosSolicitud,   ['1 Nombres y Apellidos (Completo)', '1 Nombres y Apellidos']),
    contactoCorreo:     rec_obtenerValorPorAliases_(datosSolicitud,   ['Correo Electrónico 1', 'Correo Electronico 1']),
    representanteLegal: rec_obtenerValorPorAliases_(datosSolicitud,   ['Representante Legal']),
    oa:                 rec_obtenerValorPorAliases_(datosBaseOficial, ['Organismo de Acreditación', 'Organismo de acreditación']),
    fechaReconocido:    rec_obtenerValorPorAliases_(datosBaseOficial, ['Reconocido desde']),
    nit: rec_limpiarNit_(rec_obtenerValorPorAliases_(datosBaseOficial, [
      'NIT ( No usar guion)\n(numero de identificación tributaria)',
      'NIT ( No usar guion) (numero de identificacion tributaria)',
      'NIT ( No usar guion)',
      'NIT'
    ])),
    existeBaseOficial:  !!filaBaseOficial,
    tieneDecision:      !!filaDecision,
    yaEmitida,
    estadoResolucion:   rec_valorSeguro_(estadoResolucion),
    reunion:            rec_obtenerValorPorAliases_(datosDecision, ['Reunión', 'Reunion']),
    resolucion:         rec_obtenerValorPorAliases_(datosDecision, ['Resolución', 'Resolucion', 'Resolución de decisión', 'Resolucion de decision']),
    certificadoLink:    rec_obtenerValorPorAliases_(datosSolicitud, ['Certificado (Link)', 'Certificado y Alcance (Link)', 'Certificado de Acreditación', 'Certificado', 'Certificado link'])
  };
}

/**
 * Genera el documento Word + PDF de resolución + boleta de pago automática.
 */
function generarResolucionReconocimiento(params) {
  const datos = buscarDatosReconocimiento(params);

  if (!datos.existeBaseOficial) throw new Error('El registro no existe en la base oficial. No es posible generar el documento.');
  if (!datos.tieneDecision)     throw new Error('El registro no tiene decisión registrada. No es posible generar el documento.');
  if (datos.yaEmitida)          throw new Error('La resolución ya fue emitida para este registro. No se puede generar nuevamente.');

  const carpeta   = DriveApp.getFolderById(REC_CFG.carpetaDestinoId);
  const plantilla = DriveApp.getFileById(REC_CFG.templateDocId);

  const nombreDocumento = rec_construirNombreDocumento_(datos);
  const copia = plantilla.makeCopy(nombreDocumento, carpeta);
  const doc   = DocumentApp.openById(copia.getId());
  const body  = doc.getBody();

  const reemplazos = {
    '{Fecha}':           rec_fechaGuatemalaLarga_(),
    '{Razón}':           datos.razonSocial,
    '{OA}':              datos.oa,
    '{COOPERACIÓN}':     REC_CFG.cooperacion,
    '{acta}':            datos.reunion,
    '{resolución}':      datos.resolucion,
    '{registro}':        datos.registro,
    '{REPRESENTANTE}':   datos.representanteLegal,
    '{fechareconocido}': rec_formatearFechaReconocido_(datos.fechaReconocido),
    '{ANEXO}':           'Se adjunta Certificado de Acreditación como anexo.'
  };

  Object.keys(reemplazos).forEach(function(marcador) {
    body.replaceText(rec_escapeForReplaceText_(marcador), String(reemplazos[marcador] || ''));
  });
  doc.saveAndClose();

  const pdfResolucionBlob = DriveApp.getFileById(copia.getId())
    .getAs(MimeType.PDF).setName(nombreDocumento + '.pdf');
  const pdfResolucionFile = carpeta.createFile(pdfResolucionBlob);

  let certificadoFile = null;
  if (datos.certificadoLink) {
    const certId = rec_extraerFileIdDeUrl_(datos.certificadoLink);
    if (certId) {
      try { certificadoFile = DriveApp.getFileById(certId); } catch (e) {}
    }
  }

  const resultadoBoleta = rec_generarBoletaAutomatica_(datos);
  rec_actualizarEstadoResolucion_(datos.registro, 'Emitida');

  return {
    ok:                  true,
    nombre:              nombreDocumento,
    idDocumento:         copia.getId(),
    urlDocumento:        copia.getUrl(),
    idPdfResolucion:     pdfResolucionFile.getId(),
    urlPdfResolucion:    pdfResolucionFile.getUrl(),
    certificadoEncontrado: !!certificadoFile,
    idCertificado:       certificadoFile ? certificadoFile.getId()  : '',
    urlCertificado:      certificadoFile ? certificadoFile.getUrl() : '',
    urlCarpeta:          carpeta.getUrl(),
    boletaGenerada:      true,
    boletaId:            resultadoBoleta.id            || '',
    boletaNombre:        resultadoBoleta.nombreArchivo || resultadoBoleta.id || '',
    boletaUrlPdf:        resultadoBoleta.urlPdf        || '',
    boletaCorrelativo:   resultadoBoleta.correlativo   || '',
    message: certificadoFile
      ? 'Resolución y boleta generadas correctamente. El certificado anexo fue localizado.'
      : 'Resolución y boleta generadas correctamente. No se localizó automáticamente el PDF del certificado.'
  };
}

/* =========================================================
 * BOLETAS — función pública base
 * ⚠️ Si registrarBoletaPago() ya existe en otro .gs → ELIMINAR este bloque
 * ========================================================= */
function registrarBoletaPago(datos) {
  try {
    const archivoDatos   = SpreadsheetApp.openById(REC_CFG_BOLETA.idRegistros);
    const hoja           = archivoDatos.getSheetByName('Registros');
    const hojaBoleta     = archivoDatos.getSheetByName('Boletas');
    const carpeta        = DriveApp.getFolderById(REC_CFG_BOLETA.idCarpetaPdf);
    const archivoControl = SpreadsheetApp.openById(REC_CFG_BOLETA.idCfg);
    const hojaActividad  = archivoControl.getSheetByName('Actividad');

    if (!hojaActividad) throw new Error("No se encontró la hoja 'Actividad' en el archivo de control.");

    const correlativo     = Number(hojaActividad.getRange('E2').getValue()) + 1;
    hojaActividad.getRange('E2').setValue(correlativo);

    const fecha            = new Date();
    const anio             = fecha.getFullYear();
    const correlativoTexto = String(correlativo).padStart(4, '0');
    const id               = anio + '-' + datos.registro + '-' + correlativoTexto;
    const nombreArchivo    = 'Boleta_' + correlativoTexto + '_' + anio + '-' + datos.registro;

    archivoDatos.getSheets().forEach(function(h) {
      if (h.getName() === 'TEMP_BOLETA') {
        archivoDatos.deleteSheet(h);
        Utilities.sleep(500);
      }
    });

    const hojaTemp = hojaBoleta.copyTo(archivoDatos);
    hojaTemp.setName('TEMP_BOLETA');
    SpreadsheetApp.flush();

    const hojaTempFinal = archivoDatos.getSheetByName('TEMP_BOLETA');
    if (!hojaTempFinal) throw new Error('No fue posible crear la hoja temporal de boleta.');

    hojaTempFinal.getRange('C1').setValue(Number(datos.tasaCambio).toFixed(4));
    hojaTempFinal.getRange('E2').setValue(id);
    hojaTempFinal.getRange('B6').setValue(Utilities.formatDate(fecha, 'GMT-6', 'dd/MM/yyyy'));
    hojaTempFinal.getRange('F6').setValue(datos.nit          || '');
    hojaTempFinal.getRange('B8').setValue(datos.razon        || '');
    hojaTempFinal.getRange('F8').setValue(datos.nombre       || '');
    hojaTempFinal.getRange('C10').setValue((Number(datos.montoUSD) * Number(datos.tasaCambio)).toFixed(2));
    hojaTempFinal.getRange('G10').setValue(Number(datos.montoUSD).toFixed(2));
    hojaTempFinal.getRange('C13').setValue(datos.concepto    || '');
    hojaTempFinal.getRange('C19').setValue(datos.pagoPor     || '');
    hojaTempFinal.getRange('B21').setValue(datos.responsable || '');
    hojaTempFinal.getRange('G22').setValue(correlativo);
    SpreadsheetApp.flush();

    const pdfBlob    = rec_exportarHojaComoPDF(archivoDatos.getId(), hojaTempFinal.getSheetId(), nombreArchivo);
    const archivoPdf = carpeta.createFile(pdfBlob);
    archivoDatos.deleteSheet(hojaTempFinal);

    hoja.appendRow([
      correlativo, fecha, id, datos.registro,
      Number(datos.tasaCambio).toFixed(2), '',
      (Number(datos.montoUSD) * Number(datos.tasaCambio)).toFixed(2),
      'No Pagado', '', '', '', '', '', '', '',
      datos.concepto    || '',
      Number(datos.montoUSD).toFixed(2),
      datos.responsable || ''
    ]);

    return { exito: true, id: nombreArchivo, nombreArchivo, urlPdf: archivoPdf.getUrl(), correlativo };

  } catch (e) {
    Logger.log('❌ registrarBoletaPago: ' + e);
    return { exito: false, error: e?.message || String(e) };
  }
}

/* =========================================================
 * HELPERS PRIVADOS — BOLETA
 * ========================================================= */
function rec_generarBoletaAutomatica_(datosReconocimiento) {
  const tasaCambio = Number(obtenerTipoCambioBanguat() || 0);
  if (!tasaCambio || isNaN(tasaCambio) || tasaCambio <= 0) {
    throw new Error('No fue posible obtener una tasa de cambio válida para generar la boleta.');
  }
  const responsable = rec_obtenerResponsableBoleta_();
  const payload = {
    registro:    datosReconocimiento.registro,
    razon:       datosReconocimiento.razonSocial,
    nombre:      datosReconocimiento.razonSocial,
    norma:       datosReconocimiento.norma,
    esquema:     datosReconocimiento.esquema,
    concepto:    REC_CFG_BOLETA.conceptoReconocimiento,
    montoUSD:    REC_CFG_BOLETA.montoUsdReconocimiento,
    responsable, tasaCambio,
    nit:         datosReconocimiento.nit || '',
    pagoPor:     ''
  };
  if (!payload.nit) throw new Error('No fue posible generar la boleta porque el NIT no está disponible en la base oficial.');
  const resultado = registrarBoletaPago(payload);
  if (!resultado || !resultado.exito) {
    throw new Error('La resolución fue generada, pero ocurrió un problema al generar la boleta: ' +
      ((resultado && resultado.error) ? resultado.error : 'error no especificado'));
  }
  return resultado;
}

function rec_obtenerResponsableBoleta_() {
  try {
    const correo = getUsuarioActivo();
    if (!correo) return 'Usuario';
    const nombre = obtenerNombreUsuarioPorCorreo(correo); // ← Usuarios.gs del sistema
    return String(nombre || correo).trim() || 'Usuario';
  } catch (e) {
    Logger.log('❌ rec_obtenerResponsableBoleta_: ' + e);
    return 'Usuario';
  }
}

function rec_exportarHojaComoPDF(fileId, sheetId, nombreArchivo) {
  const url =
    'https://docs.google.com/spreadsheets/d/' + fileId +
    '/export?exportFormat=pdf&format=pdf&size=letter&portrait=true' +
    '&fitw=true&sheetnames=false&printtitle=false&pagenum=false' +
    '&gridlines=false&fzr=false&gid=' + sheetId;
  const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  return resp.getBlob().setName(nombreArchivo + '.pdf');
}

/* =========================================================
 * HELPERS PRIVADOS — HOJAS
 * ========================================================= */
function rec_getSheetByGid_(spreadsheetId, gid) {
  const ss    = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets().find(sh => sh.getSheetId() === Number(gid));
  if (!sheet) throw new Error('No se encontró la hoja con gid: ' + gid);
  return sheet;
}

function rec_buscarFilaPorRegistro_(sheet, headerRegistro, valorBuscado) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return null;
  const headers = data[0].map(String);
  const idx     = headers.indexOf(headerRegistro);
  if (idx === -1) throw new Error('No se encontró la columna "' + headerRegistro + '" en "' + sheet.getName() + '".');
  const buscado = rec_normalizarTexto_(valorBuscado);
  for (let i = 1; i < data.length; i++) {
    if (rec_normalizarTexto_(data[i][idx]) === buscado) return i + 1;
  }
  return null;
}

function rec_mapRowByHeaders_(sheet, rowNumber) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row     = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  const out = {};
  headers.forEach((h, i) => { out[String(h).trim()] = row[i]; });
  return out;
}

function rec_actualizarEstadoResolucion_(registro, nuevoEstado) {
  const sh   = rec_getSheetByGid_(REC_CFG.ssSolicitudesId, REC_CFG.gidSolicitudes);
  const fila = rec_buscarFilaPorRegistro_(sh, 'Registro de acreditación', registro);
  if (!fila)  throw new Error('No se encontró la solicitud para actualizar el estado de la resolución.');
  const headers    = sh.getDataRange().getValues()[0].map(String);
  const idxResol   = headers.findIndex(h => rec_normalizarEncabezado_(h) === 'resolucion');
  if (idxResol === -1) throw new Error('No se encontró la columna "Resolución" en la hoja de solicitudes.');
  sh.getRange(fila, idxResol + 1).setValue(nuevoEstado);
}

/* =========================================================
 * HELPERS PRIVADOS — TEXTO
 * ========================================================= */
function rec_valorSeguro_(v)       { return v == null ? '' : String(v).trim(); }

function rec_normalizarTexto_(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function rec_normalizarEncabezado_(texto) {
  return String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').replace(/_/g, ' ');
}

function rec_obtenerValorPorAliases_(obj, aliases) {
  if (!obj || !aliases?.length) return '';
  const mapa = {};
  Object.keys(obj).forEach(k => { mapa[rec_normalizarEncabezado_(k)] = obj[k]; });
  for (const alias of aliases) {
    const key = rec_normalizarEncabezado_(alias);
    if (key in mapa) return rec_valorSeguro_(mapa[key]);
  }
  return '';
}

function rec_escapeForReplaceText_(text) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function rec_limpiarNit_(valor) {
  return String(valor || '').replace(/-/g, '').replace(/\s+/g, '').trim();
}

/* =========================================================
 * HELPERS PRIVADOS — FECHA Y ESTADO
 * ========================================================= */
function rec_fechaGuatemalaLarga_() {
  const fecha  = new Date();
  const dia    = Utilities.formatDate(fecha, REC_CFG.timezone, 'd');
  const anio   = Utilities.formatDate(fecha, REC_CFG.timezone, 'yyyy');
  const mesNum = Number(Utilities.formatDate(fecha, REC_CFG.timezone, 'M'));
  const meses  = ['','enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return 'Guatemala, ' + dia + ' de ' + meses[mesNum] + ' de ' + anio;
}

function rec_extraerAnioDeFecha_(valor) {
  if (!valor) return '';
  try {
    if (valor instanceof Date && !isNaN(valor)) return Utilities.formatDate(valor, REC_CFG.timezone, 'yyyy');
    const texto = String(valor).trim();
    const m = texto.match(/(20\d{2}|19\d{2})/);
    if (m) return m[1];
    const d = new Date(texto);
    if (!isNaN(d)) return Utilities.formatDate(d, REC_CFG.timezone, 'yyyy');
  } catch (e) {}
  return '';
}

function rec_formatearFechaReconocido_(valor) {
  if (!valor) return '';
  try {
    if (valor instanceof Date && !isNaN(valor)) return Utilities.formatDate(valor, REC_CFG.timezone, 'dd/MM/yyyy');
    const d = new Date(valor);
    if (!isNaN(d)) return Utilities.formatDate(d, REC_CFG.timezone, 'dd/MM/yyyy');
  } catch (e) {}
  return String(valor).trim();
}

function rec_normalizarEstadoEmitido_(valor) {
  const v = String(valor || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return v === 'emitida' || v === 'emitido';
}

/* =========================================================
 * HELPERS PRIVADOS — DRIVE Y NOMBRES
 * ========================================================= */
function rec_construirNombreDocumento_(datos) {
  return 'Reconocimiento_' + datos.registro + '_' + datos.anio;
}

function rec_extraerFileIdDeUrl_(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  const m = s.match(/[-\w]{25,}/);
  return m ? m[0] : '';
}
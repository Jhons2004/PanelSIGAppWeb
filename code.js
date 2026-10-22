const APP_TITLE = "Sistema de Acreditación OGA";

// ============================
// 🚀 WEBAPP ENTRY POINT
// ============================
function doGet(e) {
  e = e || {};
  const p = e.parameter || {};
  const modo = String(p.modo || '').trim().toLowerCase();

  // 1) Mantener la asistencia pública separada del login administrativo.
  if (modo === 'asistencia') {
    if (typeof WAPP_renderAsistenciaPublica_ !== 'function') {
      throw new Error('No está disponible WAPP_renderAsistenciaPublica_.');
    }
    return WAPP_renderAsistenciaPublica_(p);
  }

  // 2) Procesar callback OAuth si Google regresó con ?code o ?error.
  let authResultado = { handled: false };
  try {
    authResultado = authProcesarCallbackGoogle_(e) || { handled: false };
  } catch (err) {
    console.error('doGet OAuth callback:', err);
  }

  // 3) Render normal de la AppWeb.
  const tpl = HtmlService.createTemplateFromFile('App');
  tpl.SIGA_AUTH_CALLBACK = JSON.stringify({
    handled: !!authResultado.handled,
    ok: authResultado.ok === true,
    msg: authResultado.msg || ''
  }).replace(/</g, '\\u003c');

  return tpl
    .evaluate()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================
// 🔁 ROUTER CENTRAL
// ============================
// Sólo vistas aprobadas; nunca resolver archivos arbitrarios desde un cliente RPC.
const SIGA_VISTAS_AUTORIZADAS_ = Object.freeze({
  Login: true, Menu: true, panel_certificado: true,
  FAC078: true, correspondencia_admon: true,
  registro_pago: true, anulacion_buscar: true,
  panel_reportes: true, PreIngreso: true,
  Agenda_Sistema: true, ConsultaOEC: true,
  Selector_resoluciones: true, Ingreso_resoluciones: true,
  Ingreso_reconocimientos: true, PresupuestoEvaluacionSPA: true,
  DocumentosOEC: true, SIGA_Bitacora: true
});

function cargarVista(nombreVista) {
  var vista = String(nombreVista || '').trim();
  if (!Object.prototype.hasOwnProperty.call(SIGA_VISTAS_AUTORIZADAS_, vista)) {
    throw new Error('Vista no autorizada.');
  }
  if (!getUsuarioActivo() && vista !== 'Login') {
    SIGA_AUDIT_event_('ACCESO_DENEGADO', vista, 'RECHAZADO', '', '', 'Sin sesión');
    return _renderParcial('Login');
  }
  if (vista !== 'Login') SIGA_AUTH_assertGoogle_();
  if (vista === 'SIGA_Bitacora' && !SIGA_AUDIT_esAdmin_()) {
    SIGA_AUDIT_event_('ACCESO_DENEGADO', 'BITACORA', 'RECHAZADO', '', '', 'Rol insuficiente');
    throw new Error('No tiene autorización para consultar la bitácora.');
  }
  SIGA_AUDIT_event_('ACCESO_VISTA', vista, 'OK', '', '', '');
  return _renderParcial(vista);
}

function _renderParcial(nombreVista) {
  try {
    return HtmlService.createTemplateFromFile(nombreVista)
      .evaluate()
      .getContent();
  } catch (e) {
    Logger.log('Error renderizando vista ' + nombreVista + ': ' + e.message);
    return `<div style="color:red;padding:20px;font-family:sans-serif;">
              ❌ Vista <b>${nombreVista}</b> no encontrada.<br>
              <small>${e.message}</small>
            </div>`;
  }
}

const ID_PANEL_CENTRAL = "1kK9qsUKH019-quRrifuwXGfxHH6YVSzL0gf8jPnwIVQ";

// ❌ QUITAR esta línea — sigue siendo scope global:
// const hoja = SpreadsheetApp.openById(ID_PANEL_CENTRAL).getSheetByName("Actividad");

function obtenerTipoCambioBanguat() {
  const url = "https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx";
  const soapBody = `
    <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
      <soap12:Body>
        <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/" />
      </soap12:Body>
    </soap12:Envelope>`;

  const options = {
    method: "post",
    contentType: "application/soap+xml; charset=utf-8",
    payload: soapBody,
    muteHttpExceptions: true
  };

  // ✅ Dentro de la función — se ejecuta solo cuando se llama, no al cargar
  function getHojaActividad() {
    return SpreadsheetApp.openById(ID_PANEL_CENTRAL).getSheetByName("Actividad");
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const xml = response.getContentText();
    Logger.log("📦 XML completo:\n" + xml);

    const document   = XmlService.parse(xml);
    const envelope   = document.getRootElement();
    const nsSoap     = envelope.getNamespace();
    const body       = envelope.getChild("Body", nsSoap);
    const ns         = XmlService.getNamespace("http://www.banguat.gob.gt/variables/ws/");
    const resultNode = body.getChild("TipoCambioDiaResponse", ns)
                           .getChild("TipoCambioDiaResult", ns)
                           .getChild("CambioDolar", ns)
                           .getChild("VarDolar", ns);

    const referencia = parseFloat(
      resultNode.getChild("referencia", ns).getText().replace(",", ".")
    );

    Logger.log("💱 Tasa de cambio recibida: " + referencia);

    // ✅ openById dentro de función — nunca falla en WebApp
    const hoja  = getHojaActividad();
    const celda = hoja.getRange("D2");
    celda.setNumberFormat("0.00000");
    celda.setValue(referencia);

    return referencia;

  } catch (error) {
    Logger.log("❌ Error al obtener la tasa: " + error.message);
    try {
      // ✅ también aquí — openById en lugar de getActiveSpreadsheet
      const respaldo = parseFloat(getHojaActividad().getRange("D2").getValue());
      Logger.log("ℹ️ Usando tasa de respaldo: " + respaldo);
      return isNaN(respaldo) ? 0 : respaldo;
    } catch (e2) {
      Logger.log("❌ Sin tasa de respaldo: " + e2.message);
      return 0;
    }
  }
}

/** Diagnóstico rápido del login sin revelar secretos. */
function QA_LOGIN_OAUTH_SIGA_COMPLETO() {
  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty('GOOGLE_OAUTH_CLIENT_ID') || '');
  const secret = String(props.getProperty('GOOGLE_OAUTH_CLIENT_SECRET') || '');
  const redirect = String(props.getProperty('GOOGLE_OAUTH_REDIRECT_URI') || '');

  const funciones = [
    'authProcesarCallbackGoogle_',
    'obtenerUrlAutenticacionGoogle',
    'crearSesionGoogleVerificada_',
    'getUsuarioActivo',
    'getUsuarioActivoDetalle',
    'obtenerUsuarioAutorizadoGoogle'
  ];

  const existe = {};
  funciones.forEach(function(nombre) {
    try {
      existe[nombre] = typeof this[nombre] === 'function';
    } catch (_) {
      existe[nombre] = false;
    }
  });

  const out = {
    ok_config: !!id && !!secret && !!redirect,
    client_id: !!id,
    client_secret: !!secret,
    redirect_uri: redirect,
    redirect_exec: redirect.endsWith('/exec'),
    funciones: existe,
    session: (typeof QA_SESION_SIGA === 'function') ? QA_SESION_SIGA() : null
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


// ============================
// 📌 RUTAS — nombres exactos de archivos .html
// ============================
function mostrarLogin()                   { return cargarVista('Login'); }
function mostrarPanelMenu()               { return cargarVista('Menu'); }

// ✅ Nombre exacto del archivo en el proyecto
function mostrarPanelCertificados()       { return cargarVista('panel_certificado'); }
function mostrarPanelFAC078()             { return cargarVista('FAC078'); }
function mostrarPanelCorrespondencia()    { return cargarVista('correspondencia_admon'); }
function mostrarIngresoDatosOEC()         { return cargarVista('PreIngreso'); } // IngresoDatosOEC del legado aún no aprobado para QA
function mostrarFormularioRegistroPagos() { return cargarVista('registro_pago'); }
function mostrarPanelAnulacionBoletas()   { return cargarVista('anulacion_buscar'); }
function mostrarPanelReportes()           { return cargarVista('panel_reportes'); }
function mostrarPreIngreso()              { return cargarVista('PreIngreso'); }
function abrirConsejoDirecto()            { return cargarVista('Agenda_Sistema'); }
function mostrarPanelConsultaOEC()        { return cargarVista('ConsultaOEC'); }
function mostrarmoduloselectoresolib()    { return cargarVista('Selector_resoluciones')}
function abrirIngresoResoluciones()      { return cargarVista('Ingreso_resoluciones'); }
function mostrarIngresoReconocimientos() { return cargarVista('Ingreso_reconocimientos'); }
function mostrarpresupuestonuevo() { return cargarVista('PresupuestoEvaluacionSPA'); }
function mostraranulacionbuscar() { return cargarVista('anulacion_buscar'); }
function mostrarDocumentosOECvista() { return cargarVista('DocumentosOEC'); }
/** Bitácora institucional, visible sólo para correos autorizados en Script Properties. */
function mostrarBitacoraSIGA() { return cargarVista('SIGA_Bitacora'); }

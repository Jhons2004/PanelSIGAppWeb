/**
 * SIGA | Auditoría central, reutilizando REGISTRO_BOLETAS_ID.
 * No requiere SIGA_AUDIT_SPREADSHEET_ID, no crea archivos ni pestañas
 * y no altera columnas de Bitacora_WebApp_Operacion.
 * Propiedad opcional: SIGA_AUDIT_ADMIN_EMAILS (administradores de consulta).
 * IMPORTANTE: requiere que la pestaña y sus encabezados YA existan;
 * si falta, el preflight de escrituras falla cerrado.
 */
const SIGA_AUDIT_MARCA_ = 'SIGA_EVENTO:';
const SIGA_AUDIT_META_ = 'SIGA_META:';
const SIGA_AUDIT_COLUMNAS_REQUERIDAS_ = Object.freeze([
  'Fecha', 'Ambiente', 'Operacion_ID', 'Usuario',
  'Registro_OEC', 'Tipo_Evaluacion', 'Estado_Operacion'
]);

function SIGA_AUDIT_email_() {
  try {
    const s = getUsuarioActivoDetalle();
    return s && s.autenticado === true ? String(s.email || '').trim().toLowerCase() : '';
  } catch (_) { return ''; }
}
function SIGA_AUDIT_esAdmin_() {
  const email = SIGA_AUDIT_email_();
  if (!email || !email.endsWith('@oga.org.gt')) return false;
  if (typeof obtenerUsuarioAutorizadoGoogle !== 'function') return false;
  const user = obtenerUsuarioAutorizadoGoogle(email);
  if (!user || user.ok !== true) return false;
  const ids = String(PropertiesService.getScriptProperties().getProperty('SIGA_AUDIT_ADMIN_EMAILS') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return ids.indexOf(email) >= 0;
}
/** Reutiliza la bitácora ya configurada en Presupuesto. No crea pestañas. */
function SIGA_AUDIT_sheet_() {
  if (typeof WAPP_cfg_ !== 'function') {
    throw new Error('No se ha cargado la configuración central de Presupuesto.');
  }
  const cfg = WAPP_cfg_();
  const id = String(cfg.REGISTRO_BOLETAS_ID || '').trim();
  const nombre = String(cfg.OPERACION && cfg.OPERACION.SHEET_AUDIT || 'Bitacora_WebApp_Operacion');
  if (!id) throw new Error('No hay Registro de Boletas configurado en el ambiente actual.');
  const sh = SpreadsheetApp.openById(id).getSheetByName(nombre);
  if (!sh) {
    throw new Error('No existe la pestaña de bitácora "' + nombre + '" en Registro de Boletas (' + WAPP_getEnv_() + '). No se creará automáticamente.');
  }
  const headers = SIGA_AUDIT_headers_(sh);
  const faltantes = SIGA_AUDIT_COLUMNAS_REQUERIDAS_.filter(function(h) {
    return headers.indexOf(h) < 0;
  });
  if (faltantes.length) {
    throw new Error('Esquema de bitácora incompatible. Faltan: ' + faltantes.join(', '));
  }
  return sh;
}
function SIGA_AUDIT_headers_(sh) {
  const cantidad = sh.getLastColumn();
  return cantidad ? sh.getRange(1, 1, 1, cantidad).getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); }) : [];
}
function SIGA_AUDIT_preflight_() {
  const v = String(PropertiesService.getScriptProperties().getProperty('SIGA_AUDIT_ENFORCE_WRITES') || 'true').toLowerCase();
  if (v !== 'false') SIGA_AUDIT_sheet_();
  return true;
}
function SIGA_AUDIT_clean_(value, max) {
  const s = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').slice(0, max || 180);
  // Evitar que Sheets interprete valores de logs como fórmulas inyectadas.
  return /^[\s]*[=+@-]/.test(s) ? "'" + s : s;
}
/** Llamada sólo del backend; no se expone al navegador por el sufijo _. */
/**
 * Registra eventos SIGA con un Operacion_ID propio sin perturbar los registros
 * operativos de Presupuesto. El detalle se encapsula en Estado_Operacion.
 */
function SIGA_AUDIT_event_(tipo, modulo, estado, registro, solicitudId, detalle, emailConfirmado) {
  try {
    const usuario = SIGA_AUDIT_clean_(emailConfirmado || SIGA_AUDIT_email_() || 'no-autenticado', 110);
    const meta = {
      estado: SIGA_AUDIT_clean_(estado, 35),
      solicitudId: SIGA_AUDIT_clean_(solicitudId, 100),
      detalle: SIGA_AUDIT_clean_(detalle, 180)
    };
    const dato = {
      Fecha: new Date(),
      Ambiente: WAPP_getEnv_(),
      Operacion_ID: 'SIGA:' + Utilities.getUuid(),
      Usuario: usuario,
      Registro_OEC: SIGA_AUDIT_clean_(registro, 60),
      Tipo_Evaluacion: SIGA_AUDIT_MARCA_ + SIGA_AUDIT_clean_(tipo, 50) + '|' + SIGA_AUDIT_clean_(modulo, 60),
      Estado_Operacion: SIGA_AUDIT_META_ + JSON.stringify(meta)
    };
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sh = SIGA_AUDIT_sheet_();
      const headers = SIGA_AUDIT_headers_(sh);
      const row = headers.map(function(h) {
        return Object.prototype.hasOwnProperty.call(dato, h) ? dato[h] : '';
      });
      sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
    } finally {
      lock.releaseLock();
    }
    return true;
  } catch (e) {
    console.error('[SIGA_AUDIT] No fue posible persistir auditoría: ' + (e && e.message || e));
    return false;
  }
}
/** Contrato ya referenciado por AuthGoogle_OGA.js. */
function registrarEventoAuth_(evento) {
  evento = evento || {};
  // No registrar googleId, tokens, datos personales no esenciales, ni errores sin filtrar.
  const correo = String(evento.correo || '').trim().toLowerCase();
  const detalle = String(evento.resultado || '') === 'ERROR_AUTH' ? 'Error de autenticación' : String(evento.detalle || '');
  return SIGA_AUDIT_event_('AUTENTICACION', 'GOOGLE', evento.resultado || '', '', '', detalle, correo);
}
/** Contrato ya invocado por el botón salir del shell. */
function cerrarSesionUsuario() {
  SIGA_AUDIT_event_('CIERRE_SESION', 'SIGA', 'OK', '', '', '');
  return cerrarSesion();
}
/** Vista de sólo lectura, con autorización independiente de la navegación. */
function SIGA_AUDIT_consultar(limite) {
  if (!SIGA_AUDIT_esAdmin_()) throw new Error('Acceso a bitácora denegado.');
  const max = Math.min(200, Math.max(1, Number(limite) || 50));
  const sh = SIGA_AUDIT_sheet_();
  const last = sh.getLastRow();
  if (last < 2) return {ok:true, filas:[]};
  const headers = SIGA_AUDIT_headers_(sh);
  const start = Math.max(2, last - Math.max(1000, max * 20) + 1);
  const rows = sh.getRange(start, 1, last - start + 1, headers.length).getValues();
  const output = [];
  for (let i = rows.length - 1; i >= 0 && output.length < max; i--) {
    const r = {};
    headers.forEach(function(h, index) { r[h] = rows[i][index]; });
    if (!String(r.Operacion_ID || '').startsWith('SIGA:')) continue;
    const tipoMod = String(r.Tipo_Evaluacion || '');
    if (!tipoMod.startsWith(SIGA_AUDIT_MARCA_)) continue;
    const tags = tipoMod.slice(SIGA_AUDIT_MARCA_.length).split('|');
    const rawMeta = String(r.Estado_Operacion || '');
    let meta = {};
    if (rawMeta.startsWith(SIGA_AUDIT_META_)) {
      try { meta = JSON.parse(rawMeta.slice(SIGA_AUDIT_META_.length)); } catch (_) {}
    }
    output.push({
      fecha: r.Fecha instanceof Date ? r.Fecha.toISOString() : String(r.Fecha || ''),
      id: String(r.Operacion_ID || ''), usuario: String(r.Usuario || ''),
      tipo: tags[0] || '', modulo: tags.slice(1).join('|'),
      estado: String(meta.estado || ''), registro: String(r.Registro_OEC || ''),
      solicitudId: String(meta.solicitudId || ''), detalle: String(meta.detalle || '')
    });
  }
  return {ok:true, filas:output};
}
/** QA de lectura, sin crear documentos ni enviar correos. */
function SIGA_QA_diagnosticoUnificacion() {
  const admin = SIGA_AUDIT_esAdmin_();
  const user = SIGA_AUDIT_email_();
  let bitacoraError = '';
  let bitacoraLista = false;
  try { SIGA_AUDIT_sheet_(); bitacoraLista = true; }
  catch (e) { bitacoraError = e.message || String(e); }
  const checks = {
    autenticado: !!user,
    dominioOGA: !!user && user.endsWith('@oga.org.gt'),
    registroUsuarios: typeof obtenerUsuarioAutorizadoGoogle === 'function',
    routerUnico: typeof doGet === 'function',
    clientePresupuesto: typeof WAPP_API_bootstrap === 'function',
    generadorPresupuestos: typeof WAPP_DOC_generar_ === 'function',
    buscadorOEC: typeof buscarExpedienteOEC === 'function',
    callbackGoogle: typeof authProcesarCallbackGoogle_ === 'function',
    bitacoraConfigurada: bitacoraLista, // compatibilidad con diagnóstico anterior
    bitacoraExistente: bitacoraLista,
    administracionAuditoria: admin
  };
  return {
    ok: Object.keys(checks).every(function(k) { return k === 'administracionAuditoria' || checks[k]; }),
    ambiente: typeof WAPP_getEnv_ === 'function' ? WAPP_getEnv_() : 'NO_CONFIGURADO',
    checks: checks,
    bitacoraError: bitacoraError
  };
}
/** Falla cerrado si la bitácora no confirma el registro previo a una mutación. */
function SIGA_AUDIT_requerirEvento_(tipo, modulo, registro, solicitud) {
  if (!SIGA_AUDIT_event_(tipo, modulo, 'INICIADA', registro, solicitud, '')) {
    throw new Error('No fue posible confirmar la bitácora. Operación cancelada.');
  }
  return true;
}

/** Verifica identidad Google y padrón Usuarios; opcionalmente modo legado en QA controlado. */
function SIGA_AUTH_assertGoogle_() {
  const data = getUsuarioActivoDetalle();
  if (!data || data.autenticado !== true || !data.email) throw new Error('Sesión institucional ausente.');
  const email = String(data.email).trim().toLowerCase();
  if (!email.endsWith('@oga.org.gt')) throw new Error('Correo fuera del dominio institucional.');
  const requerirGoogle = String(PropertiesService.getScriptProperties().getProperty('SIGA_REQUIRE_GOOGLE') || 'true').toLowerCase() !== 'false';
  if (requerirGoogle && String(data.metodo || '').toLowerCase() !== 'google') {
    throw new Error('Este módulo requiere autenticación con Google Workspace.');
  }
  if (typeof obtenerUsuarioAutorizadoGoogle !== 'function') throw new Error('Falta la autorización institucional.');
  const confirmado = obtenerUsuarioAutorizadoGoogle(email);
  if (!confirmado || confirmado.ok !== true) throw new Error('Usuario no autorizado en el padrón SIGA.');
  return {email:email, usuario:confirmado, metodo:data.metodo};
}

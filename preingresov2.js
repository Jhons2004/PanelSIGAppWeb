/*************************************************
 * MODULO PREREGISTRO V2 - AUTÓNOMO
 * -----------------------------------------------
 * - No depende de helpers del V1
 * - IDs explícitos
 * - Acceso admin desde hoja Usuarios
 * - Asigna código, copia a "Respuestas de formulario 1"
 *   sin borrar el origen
 * - Registra/actualiza en hoja Clientes
 * - En Copy of Ciclos asegura:
 *     OEC_ID, Oficial Asignado, Datos Asignación
 * - Envía correos
 *
 * REQUISITOS:
 * 1) Habilitar el servicio avanzado de Drive (Drive API v2)
 * 2) Habilitar DocumentApp, DriveApp, MailApp
 *************************************************/

/***** CONFIG GENERAL *****/
/*const PRV2 = {
  //PRE_SS_ID: '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc', // Confirmación de datos OEC
  PRE_SS_ID: '1wlTf6R7siY2d4DqMm2553uCUFXfnz-WfQ64VReSB3cw', // Confirmación de datos OEC QA
  PRE_SHEET: 'Pre-registro',

  //FINAL_SS_ID: '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc', // Confirmación de datos OEC
  FINAL_SS_ID: '1wlTf6R7siY2d4DqMm2553uCUFXfnz-WfQ64VReSB3cw', // Confirmación de datos QA
  FINAL_SHEET: 'Respuestas de formulario 1',

  EVID_FOLDER_ID: '1I4yoNOlHhAsF9LwqYaMnKfkTyBjkpSnV', // ubicación en el drive
  EVID_SUBFOLDER: 'PreRegistro',

  RM_SS_ID: '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8', // Registro Maestro
  RM_CICLOS_SHEET: 'Copy of Ciclos',
  RM_CLIENTES_SHEET: 'Clientes',

  USERS_SS_ID: '1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY',
  USERS_SHEET: 'Usuarios',

  CFG_SHEET_NAME: '_Config',
  CFG_KEY_LAST: 'último_correlativo',
  CFG_KEY_LAST2: 'ultimo_correlativo',
  CFG_KEY_NEXT: 'NEXT_GLOBAL',

  TZ: 'America/Guatemala',
  CC_NOTIF: 'carchila@oga.org.gt'
//};*/

const PRV2 = {
  PRE_SS_ID: '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc', // Confirmación de datos OEC
  //PRE_SS_ID: '1wlTf6R7siY2d4DqMm2553uCUFXfnz-WfQ64VReSB3cw', // Confirmación de datos OEC QA
  PRE_SHEET: 'Pre-registro',

  FINAL_SS_ID: '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc', // Confirmación de datos OEC
  //FINAL_SS_ID: '1wlTf6R7siY2d4DqMm2553uCUFXfnz-WfQ64VReSB3cw', // Confirmación de datos QA
  FINAL_SHEET: 'Respuestas de formulario 1',

  EVID_FOLDER_ID: '1I4yoNOlHhAsF9LwqYaMnKfkTyBjkpSnV', // ubicación en el drive
  EVID_SUBFOLDER: 'PreRegistro',

  RM_SS_ID: '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8', // Registro Maestro
  RM_CICLOS_SHEET: 'Copy of Ciclos',
  RM_CLIENTES_SHEET: 'Clientes',

  USERS_SS_ID: '1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY',
  USERS_SHEET: 'Usuarios',

  CFG_SHEET_NAME: '_Config',
  CFG_KEY_LAST: 'último_correlativo',
  CFG_KEY_LAST2: 'ultimo_correlativo',
  CFG_KEY_NEXT: 'NEXT_GLOBAL',

  TZ: 'America/Guatemala',

  // NUEVO CC
  CC_NOTIF: 'solicitudes@oga.org.gt,amelendez@oga.org.gt',

  // NUEVA BOLETA AUTOMÁTICA
  BOLETA_CONCEPTO: 'Aplicación y evaluación general de la documentación',
  BOLETA_MONTO_USD: 100,
  TIPO_EVALUACION_DEFAULT: 'Evaluación Inicial'
};


/***** UTILIDADES GENERALES *****/
function _v2trim(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim();
}

function _v2norm(s) {
  return (s || '').toString()
    .replace(/\r?\n+/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function _v2cleanLine(s) {
  return _v2trim(String(s || '').replace(/\s+/g, ' '));
}

function _v2escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _v2sanitize(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return { ok: !!(obj && obj.ok), error: String(obj && obj.error || ''), light: true };
  }
}

function _v2isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function _v2boolYes(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['si', 'sí', 'yes', 'true', '1', 'ok'].includes(s);
}

function _v2sheetMeta(ss, sh) {
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sh.getName(),
    sheetId: sh.getSheetId(),
    lastRow: sh.getLastRow(),
    lastColumn: sh.getLastColumn()
  };
}

function _v2formatDate(dt, fmt) {
  return Utilities.formatDate(dt, Session.getScriptTimeZone() || PRV2.TZ, fmt || 'dd/MM/yyyy HH:mm:ss');
}

/***** LOGS / DEBUG *****/
function _v2safeStringify_(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    try {
      return String(obj);
    } catch (_) {
      return '[unserializable]';
    }
  }
}

function _v2log_(step, data) {
  const msg = '[PRV2][' + step + '] ' + (data === undefined ? '' : _v2safeStringify_(data));
  try { console.log(msg); } catch (_) {}
  try { Logger.log(msg); } catch (_) {}
}

/***** MENÚ / UI *****/
function mostrarPreIngresoV2() {
  const html = HtmlService.createHtmlOutputFromFile('Preingreso_v2')
    .setWidth(1300)
    .setHeight(1000);
  SpreadsheetApp.getUi().showModalDialog(html, 'Preingreso_v2');
}

/***** APERTURA DE HOJAS EXPLÍCITAS *****/
function _v2getPreSheet() {
  const ss = SpreadsheetApp.openById(PRV2.PRE_SS_ID);
  const sh = ss.getSheetByName(PRV2.PRE_SHEET);
  if (!sh) throw new Error('No se encontró la hoja origen: ' + PRV2.PRE_SHEET);
  return { ss, sh };
}

function _v2getFinalSheet() {
  const ss = SpreadsheetApp.openById(PRV2.FINAL_SS_ID);
  const sh = ss.getSheetByName(PRV2.FINAL_SHEET);
  if (!sh) throw new Error('No se encontró la hoja destino: ' + PRV2.FINAL_SHEET);
  return { ss, sh };
}

function _v2getCiclosSheet() {
  const ss = SpreadsheetApp.openById(PRV2.RM_SS_ID);
  const sh = ss.getSheetByName(PRV2.RM_CICLOS_SHEET);
  if (!sh) throw new Error('No se encontró la hoja: ' + PRV2.RM_CICLOS_SHEET);
  return { ss, sh };
}

function _v2getClientesSheet() {
  const ss = SpreadsheetApp.openById(PRV2.RM_SS_ID);
  const sh = ss.getSheetByName(PRV2.RM_CLIENTES_SHEET);
  if (!sh) throw new Error('No se encontró la hoja: ' + PRV2.RM_CLIENTES_SHEET);
  return { ss, sh };
}

function _v2getUsersSheet() {
  const ss = SpreadsheetApp.openById(PRV2.USERS_SS_ID);
  const sh = ss.getSheetByName(PRV2.USERS_SHEET);
  if (!sh) throw new Error('No se encontró la hoja: ' + PRV2.USERS_SHEET);
  return { ss, sh };
}

/***** BÚSQUEDA DE COLUMNAS POR ALIAS *****/
function _v2findCol(headers, aliases) {
  const H = headers.map(_v2norm);
  const A = (aliases || []).map(_v2norm);

  for (const a of A) {
    const idx = H.indexOf(a);
    if (idx !== -1) return idx + 1;
  }
  for (const a of A) {
    const idx = H.findIndex(h => h.includes(a));
    if (idx !== -1) return idx + 1;
  }
  return 0;
}

function _v2requireCol(headers, aliases, label) {
  const idx = _v2findCol(headers, aliases);
  if (!idx) {
    throw new Error('No se encontró la columna requerida: ' + (label || aliases[0]));
  }
  return idx;
}

function _v2getCellByAliases(headers, row, aliases) {
  const c = _v2findCol(headers, aliases);
  return c ? row[c - 1] : '';
}

/***** USUARIOS / CONTROL DE ACCESO DESDE HOJA USUARIOS *****/
function _v2findUserRecordByEmail(email) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) {
    return { found: false, email: '', isAdmin: false, name: '', rowIndex: 0 };
  }

  const { sh } = _v2getUsersSheet();
  if (sh.getLastRow() < 2) {
    return { found: false, email: wanted, isAdmin: false, name: '', rowIndex: 0 };
  }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cCorreos = _v2requireCol(headers, ['Correos', 'Correo', 'Email', 'Emails'], 'Correos');
  const cAut = _v2requireCol(headers, ['Autorizado'], 'Autorizado');
  const cNombre = _v2requireCol(headers, ['Nombre'], 'Nombre');

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    const correosRaw = String(data[i][cCorreos - 1] || '');
    const mails = correosRaw
      .split(/[,\n;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (mails.includes(wanted)) {
      const aut = data[i][cAut - 1];
      const nombre = _v2trim(data[i][cNombre - 1]);
      return {
        found: true,
        email: wanted,
        isAdmin: _v2boolYes(aut),
        name: nombre,
        rowIndex: i + 2,
        autorizadoRaw: aut
      };
    }
  }

  return {
    found: false,
    email: wanted,
    isAdmin: false,
    name: '',
    rowIndex: 0
  };
}

function _v2getCurrentEmail_() {
  return (_v2getSessionUser_().email || '').trim().toLowerCase();
}

function _v2getSessionUser_() {
  const empty = { email: '', nombre: '', source: '' };

  try {
    if (typeof getUsuarioActivoDetalle === 'function') {
      const det = getUsuarioActivoDetalle();
      if (det) {
        return {
          email: String(det.email || '').trim().toLowerCase(),
          nombre: String(det.nombre || det.usuario || '').trim(),
          source: String(det.source || 'getUsuarioActivoDetalle')
        };
      }
    }
  } catch (err) {
    _v2log_('SESSION_DETAIL_WARN', { error: String(err) });
  }

  try {
    if (typeof getUsuarioActivo === 'function') {
      const usuario = String(getUsuarioActivo() || '').trim();
      if (usuario) {
        return {
          email: '',
          nombre: usuario,
          source: 'getUsuarioActivo'
        };
      }
    }
  } catch (err) {
    _v2log_('SESSION_NAME_WARN', { error: String(err) });
  }

  try {
    const active = _v2normalizeSessionUser_(Session.getActiveUser().getEmail(), 'Session.getActiveUser');
    if (active.email) return active;
  } catch (err) {
    _v2log_('SESSION_ACTIVE_WARN', { error: String(err) });
  }

  try {
    const effective = _v2normalizeSessionUser_(Session.getEffectiveUser().getEmail(), 'Session.getEffectiveUser');
    if (effective.email) return effective;
  } catch (err) {
    _v2log_('SESSION_EFFECTIVE_WARN', { error: String(err) });
  }

  return empty;
}

function _v2normalizeSessionUser_(raw, source) {
  const out = { email: '', nombre: '', source: source || '' };
  if (raw == null) return out;

  if (typeof raw === 'string') {
    out.email = _v2extractEmailFromUnknown_(raw);
    return out;
  }

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalized = _v2normalizeSessionUser_(raw[i], source);
      if (normalized.email) return normalized;
    }
    return out;
  }

  if (typeof raw === 'object') {
    out.email = _v2extractEmailFromUnknown_(
      raw.email || raw.correo || raw.mail || raw.userEmail || raw.usuario || raw.user || ''
    );

    if (!out.email && raw.usuario && typeof raw.usuario === 'object') {
      out.email = _v2extractEmailFromUnknown_(
        raw.usuario.email || raw.usuario.correo || raw.usuario.mail || ''
      );
    }

    out.nombre = String(
      raw.nombre || raw.name || raw.displayName || raw.usuarioNombre || raw.usuario_name || ''
    ).trim();

    if (!out.nombre && raw.usuario && typeof raw.usuario === 'object') {
      out.nombre = String(
        raw.usuario.nombre || raw.usuario.name || raw.usuario.displayName || ''
      ).trim();
    }

    return out;
  }

  return out;
}

function _v2extractEmailFromUnknown_(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const direct = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (direct && direct[0]) return direct[0].trim().toLowerCase();

  if (_v2isEmail(text)) return text.toLowerCase();
  return '';
}

function getCurrentUserInfoV2() {
  try {
    const sessionUser = _v2getSessionUser_();
    const email = String(sessionUser.email || '').trim().toLowerCase();
    const nombre = String(sessionUser.nombre || '').trim();

    let rec = { found: false, isAdmin: false, name: nombre };

    if (email) {
      rec = _v2findUserRecordByEmail(email);
    }

    return _v2sanitize({
      ok: true,
      email: email,
      foundInUsers: !!rec.found,
      isAdmin: !!rec.isAdmin,
      nombre: rec.name || nombre || '',
      userType: rec.isAdmin ? 'admin' : 'readonly',
      sessionSource: sessionUser.source || ''
    });
  } catch (e) {
    return _v2sanitize({
      ok: false,
      error: 'No se pudo obtener información del usuario',
      email: '',
      isAdmin: false,
      nombre: '',
      userType: 'readonly'
    });
  }
}

function _v2requireAdmin() {
  const info = getCurrentUserInfoV2();
  if (!info.ok || !info.isAdmin) {
    throw new Error('Acceso denegado: esta acción requiere permisos de administrador.');
  }
  return info;
}

/***** LISTA DE OFICIALES - TODOS LOS USUARIOS, SIN FILTRAR POR AUTORIZADO *****/
function _v2listarOficiales_() {
  const { sh } = _v2getUsersSheet();
  if (sh.getLastRow() < 2) return [];

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cNombre = _v2requireCol(headers, ['Nombre'], 'Nombre');
  const cCorreos = _v2requireCol(headers, ['Correos', 'Correo', 'Email', 'Emails'], 'Correos');

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const out = [];
  const seen = new Set();

  data.forEach((row, idx) => {
    const nombre = _v2trim(row[cNombre - 1]);
    const correosRaw = String(row[cCorreos - 1] || '');
    const correo = correosRaw
      .split(/[,\n;]+/)
      .map(s => s.trim().toLowerCase())
      .find(_v2isEmail);

    if (!nombre || !correo) return;

    const key = correo.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      nombre: nombre,
      correo: correo,
      rowIndex: idx + 2
    });
  });

  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  return out;
}

function listarOficialesV2() {
  _v2requireAdmin();
  try {
    const oficiales = _v2listarOficiales_();
    _v2log_('OFICIALES_LIST', { total: oficiales.length });
    return _v2sanitize({ ok: true, oficiales: oficiales });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e), oficiales: [] });
  }
}

function _v2resolverOficialPorCorreo_(correoOficial) {
  const wanted = String(correoOficial || '').trim().toLowerCase();
  if (!wanted) {
    throw new Error('Debe seleccionar un oficial.');
  }

  const oficiales = _v2listarOficiales_();
  const hit = oficiales.find(o => String(o.correo || '').toLowerCase() === wanted);

  if (!hit) {
    throw new Error('No se encontró el oficial seleccionado en la hoja Usuarios: ' + wanted);
  }
  return hit;
}

/***** _Config para correlativo global *****/
function _v2ensureConfigSheet(ss) {
  let sh = ss.getSheetByName(PRV2.CFG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PRV2.CFG_SHEET_NAME);
    sh.getRange(1, 1, 1, 2).setValues([['Clave', 'Valor']]);
    try { sh.hideSheet(); } catch (_) {}
  }
  return sh;
}

function _v2cfgFindRow(cfgSh, key) {
  const lr = cfgSh.getLastRow();
  if (lr < 2) return 0;
  const vals = cfgSh.getRange(2, 1, lr - 1, 2).getValues();
  const want = _v2norm(key);
  for (let i = 0; i < vals.length; i++) {
    if (_v2norm(vals[i][0]) === want) return i + 2;
  }
  return 0;
}

function _v2cfgGet(ss, key) {
  const sh = _v2ensureConfigSheet(ss);
  const r = _v2cfgFindRow(sh, key);
  return r ? String(sh.getRange(r, 2).getValue()) : '';
}

function _v2cfgSet(ss, key, value) {
  const sh = _v2ensureConfigSheet(ss);
  const r = _v2cfgFindRow(sh, key);
  if (!r) {
    sh.appendRow([key, value]);
    return;
  }
  sh.getRange(r, 2).setValue(value);
}

function _v2cfgGetLastCorrelativo(ss) {
  const a = parseInt(_v2cfgGet(ss, PRV2.CFG_KEY_LAST), 10);
  if (!isNaN(a) && a >= 0) return a;

  const b = parseInt(_v2cfgGet(ss, PRV2.CFG_KEY_LAST2), 10);
  if (!isNaN(b) && b >= 0) return b;

  const c = parseInt(_v2cfgGet(ss, PRV2.CFG_KEY_NEXT), 10);
  if (!isNaN(c) && c > 0) return c - 1;

  return 0;
}

function _v2cfgSetLastCorrelativo(ss, value) {
  _v2cfgSet(ss, PRV2.CFG_KEY_LAST, String(value));
  _v2cfgSet(ss, PRV2.CFG_KEY_LAST2, String(value));
}

/***** REGLAS DE ESQUEMA / NORMA *****/
function _v2normaDesdeEsquema(esquema) {
  const e = _v2trim(esquema).toLowerCase();

  if (e === 'laboratorio de ensayo') return 'NTG ISO/IEC 17025';
  if (e === 'laboratorio de calibración') return 'NTG ISO/IEC 17025';
  if (e === 'laboratorio clínico') return 'NTG ISO 15189';
  if (e === 'organismo de inspección') return 'NTG ISO/IEC 17020';

  return '';
}

function _v2soloTipoEsquema(norma, esquema) {
  const e = _v2trim(esquema).toLowerCase();

  if (e.includes('calibr')) return 'Laboratorio de Calibración';
  if (e.includes('ensayo')) return 'Laboratorio de Ensayo';
  if (e.includes('inspecc')) return 'Organismo de Inspección';
  if (e.includes('clin')) return 'Laboratorio Clínico';

  return _v2trim(esquema || '');
}

function _v2inferirEsquemaDesdeNorma(norma) {
  const n = String(norma || '').toLowerCase();
  if (n.includes('15189')) return 'Laboratorio Clínico';
  if (n.includes('17020')) return 'Organismo de Inspección';
  if (n.includes('17025')) return '';
  return '';
}

function _v2xxFromEsquema(esquemaTxt, normaTxt) {
  const s = String(esquemaTxt || '').toLowerCase();
  const n = String(normaTxt || '').toLowerCase();

  if (s.includes('calibr')) return 'LC';
  if (s.includes('inspecc') || n.includes('17020')) return 'OI';
  return 'LE';
}

/***** HELPERS DRIVE / OCR *****/
function _v2getEvidFolder(subfolderName) {
  const base = DriveApp.getFolderById(PRV2.EVID_FOLDER_ID);
  if (!subfolderName) return base;
  const it = base.getFoldersByName(subfolderName);
  return it.hasNext() ? it.next() : base.createFolder(subfolderName);
}

function _v2saveBlobToDrive(bytes, contentType, filename, subfolderName) {
  const folder = _v2getEvidFolder(subfolderName);
  const safeName = (String(filename || 'archivo') || 'archivo').replace(/\s+/g, ' ').trim();
  const uniqueName = `${Date.now()}_${safeName}`;
  const blob = Utilities.newBlob(bytes, contentType || MimeType.PDF, uniqueName);
  const file = folder.createFile(blob);
  return { fileId: file.getId(), url: file.getUrl(), folderId: folder.getId() };
}

function _v2pdfToText(fileId, parentFolderId) {
  if (!Drive.Files || typeof Drive.Files.copy !== 'function') {
    throw new Error('OCR no disponible: habilita el Servicio Avanzado de Drive (Drive.Files).');
  }

  const resource = {
    title: 'OCR-' + new Date().toISOString(),
    parents: parentFolderId ? [{ id: parentFolderId }] : undefined
  };

  const doc = Drive.Files.copy(resource, fileId, { ocr: true, ocrLanguage: 'es' });
  const text = DocumentApp.openById(doc.id).getBody().getText() || '';
  return { text, docId: doc.id, method: 'copy-ocr' };
}

/***** EXTRACTORES OCR *****/
function _v2flexLabel(label) {
  return label.trim()
    .split(/\s+/)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
}

function _v2getField(text, labelVariants, maxLookaheadLines) {
  const T = String(text || '');
  const labels = Array.isArray(labelVariants) ? labelVariants : [labelVariants];
  Math.max(1, maxLookaheadLines || 3);

  for (const lbl of labels) {
    const L = _v2flexLabel(lbl);

    const reSame = new RegExp(`${L}\\s*[:：]?\\s*([^\\n\\r]+)`, 'i');
    const m1 = T.match(reSame);
    if (m1 && m1[1]) {
      const v1 = _v2cleanLine(m1[1]);
      if (v1) return v1;
    }

    const reBlock = new RegExp(`${L}[ \\t]*[:：]?[\\s\\r\\n]+([\\s\\S]{0,300})`, 'i');
    const m2 = T.match(reBlock);
    if (m2 && m2[1]) {
      const lines = m2[1].split(/\r?\n/).map(_v2cleanLine).filter(Boolean);
      if (lines.length) return lines[0];
    }
  }

  return '';
}

function _v2fixCompanySpaces(s) {
  if (!s) return s;
  let out = s;
  const terms = ['SOCIEDAD', 'ANONIMA', 'ANÓNIMA', 'LIMITADA', 'S.A.', 'S. A.'];
  for (const t of terms) {
    const re = new RegExp(`([A-ZÁÉÍÓÚÑ]{3,})(${t})`, 'g');
    out = out.replace(re, '$1 $2');
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ', ').replace(/,\s+/g, ', ').trim();
  return out;
}

function _v2findAnyNorm(text) {
  const hit = String(text || '').match(/\b(ISO\/IEC\s*17025|ISO\s*15189|ISO\/IEC\s*17020)\b/i);
  return hit ? hit[1].replace(/\s+/g, ' ').toUpperCase() : '';
}

function _v2cleanNIT(nitRaw) {
  return (nitRaw || '').toString().toUpperCase().replace(/[^0-9K]/g, '');
}

function _v2extractFromSolicitud(text) {
  const T = text || '';

  let norma = _v2getField(T, [
    'NORMA CONTRA LA CUAL SE SOLICITA LA ACREDITACIÓN',
    'NORMA CONTRA LA CUAL SE SOLICITA LA ACREDITACION',
    'NORMA DE ACREDITACIÓN',
    'NORMA DE ACREDITACION'
  ], 3);
  if (!norma) norma = _v2findAnyNorm(T);

  let razon = _v2getField(T, [
    'NOMBRE DE LA ORGANIZACIÓN',
    'NOMBRE DE LA ORGANIZACION',
    'RAZÓN SOCIAL',
    'RAZON SOCIAL'
  ], 3);
  if (razon) razon = razon.replace(/^NOMBRE\s+DE\s+LA\s+ORGANIZACI[ÓO]N\s*/i, '').trim();

  const comercial = _v2getField(T, [
    'NOMBRE COMERCIAL (DE ACUERDO AL RTU)',
    'NOMBRE COMERCIAL'
  ], 3);

  const telefono = _v2getField(T, [
    'TELÉFONO DE LA EMPRESA',
    'TELEFONO DE LA EMPRESA',
    'TELÉFONO',
    'TELEFONO'
  ], 2);

  const near = T.match(/CORREO[^\n\r]*ELECTR[ÓO]NICO[\s\S]{0,160}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  const any = T.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const emailDoc = (near && near[1]) || (any && any[0]) || '';

  const designado = _v2getField(T, [
    'NOMBRE DEL DESIGNADO PARA REALIZAR LA GESTIÓN',
    'NOMBRE DEL DESIGNADO PARA REALIZAR LA GESTION',
    'CONTACTO 1',
    'DESIGNADO'
  ], 3);

  let correoDesignado = _v2getField(T, [
    'CORREO ELECTRÓNICO DEL DESIGNADO PARA REALIZAR LA GESTIÓN',
    'CORREO ELECTRONICO DEL DESIGNADO PARA REALIZAR LA GESTION',
    'CORREO DEL CONTACTO 1',
    'CORREO CONTACTO 1'
  ], 2);
  if (!correoDesignado) {
    const m = T.match(/(CONTACTO\s*1|DESIGNADO)[\s\S]{0,180}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
    if (m) correoDesignado = m[2];
  }

  const representante = _v2getField(T, [
    'NOMBRE DEL REPRESENTANTE LEGAL',
    'REPRESENTANTE LEGAL',
    'NOMBRE DEL REPRESENTANTE'
  ], 3);

  return {
    norma: _v2trim(norma),
    razon: _v2trim(razon),
    comercial: _v2trim(comercial),
    telefono: _v2trim(telefono),
    email: _v2trim(emailDoc),
    designado: _v2trim(designado),
    correoDesignado: _v2trim(correoDesignado),
    representante: _v2trim(representante)
  };
}

function _v2extractFromRTU(text) {
  const T = text || '';
  let nit = '';

  const m1 = T.match(/\bNIT\b[^\n\r]{0,15}?[:：]?\s*([0-9.\-\sKk]+)/i);
  if (m1 && m1[1]) nit = _v2cleanNIT(m1[1]);

  if (!nit) {
    const m2 = T.match(/\b([0-9][0-9.\-\s]{5,}[0-9Kk])\b/);
    if (m2 && m2[1]) nit = _v2cleanNIT(m2[1]);
  }

  let razon = _v2getField(T, ['Raz[oó]n o denominaci[oó]n social'], 2);
  if (!razon) {
    const m3 = T.match(/Raz[oó]n o denominaci[oó]n social\s*[:：]\s*([^\n\r]+)/i);
    razon = (m3 && m3[1]) ? m3[1].trim() : '';
  }

  if (razon) {
    razon = razon.replace(/\s*Tipo de personer[ií]a.*$/i, '').trim();
    razon = _v2fixCompanySpaces(razon);
  }

  const comerciales = [];
  const reCom = /Nombre\s+Comercial\s*:\s*([^\n\r]+)/gi;
  let m;
  while ((m = reCom.exec(T))) {
    const val = _v2cleanLine(m[1]);
    if (val && !comerciales.includes(val)) comerciales.push(val);
  }

  const representantes = [];
  const reRep = /Nombre\s+del\s+representante\s*:\s*([^\n\r]+)/gi;
  let r;
  while ((r = reRep.exec(T))) {
    const val = _v2cleanLine(r[1]);
    if (val && !representantes.includes(val)) representantes.push(val);
  }

  return { nit, razon, comerciales, representantes };
}

/***** OCR / PRECARGA *****/
function preExtraerDatosV2(payload) {
  _v2requireAdmin();

  const trace = [];
  const push = (step, info) => trace.push({ step, t: new Date(), ...(info || {}) });

  try {
    push('start', { hasPayload: !!payload, keys: Object.keys(payload || {}) });

    if (!payload || !payload.solicitud || !payload.rtu) {
      throw new Error('Payload incompleto: faltan solicitud o RTU.');
    }

    const solMeta = _v2saveBlobToDrive(
      payload.solicitud.bytes,
      payload.solicitud.type,
      payload.solicitud.name,
      PRV2.EVID_SUBFOLDER
    );
    push('save:solicitud:ok', solMeta);

    const rtuMeta = _v2saveBlobToDrive(
      payload.rtu.bytes,
      payload.rtu.type,
      payload.rtu.name,
      PRV2.EVID_SUBFOLDER
    );
    push('save:rtu:ok', rtuMeta);

    const solOCR = _v2pdfToText(solMeta.fileId, solMeta.folderId);
    const rtuOCR = _v2pdfToText(rtuMeta.fileId, rtuMeta.folderId);
    push('ocr:solicitud', { docId: solOCR.docId, chars: (solOCR.text || '').length });
    push('ocr:rtu', { docId: rtuOCR.docId, chars: (rtuOCR.text || '').length });

    const s = _v2extractFromSolicitud(solOCR.text || '') || {};
    const r = _v2extractFromRTU(rtuOCR.text || '') || {};

    const razonFinal = _v2trim(r.razon || s.razon || '');
    const nitFinal = _v2cleanNIT(r.nit || '');
    const comercialesRTU = Array.isArray(r.comerciales) ? r.comerciales : [];

    let comercialFinal = '';
    if (s.comercial && comercialesRTU.includes(_v2trim(s.comercial))) comercialFinal = _v2trim(s.comercial);
    else if (comercialesRTU.length) comercialFinal = comercialesRTU[0];
    else comercialFinal = _v2trim(s.comercial || '');

    const esquemaDetectado = _v2inferirEsquemaDesdeNorma(s.norma);
    const normaFinal = _v2normaDesdeEsquema(esquemaDetectado) || _v2trim(s.norma);

    return _v2sanitize({
      ok: true,
      norma: normaFinal,
      esquema: esquemaDetectado,
      telefono: _v2trim(s.telefono || ''),
      email: _v2trim(s.email || ''),
      razon: razonFinal,
      razonRTU: _v2trim(r.razon || ''),
      razonSOL: _v2trim(s.razon || ''),
      nit: nitFinal,
      comercial: _v2trim(comercialFinal),
      comercialSOL: _v2trim(s.comercial || ''),
      comercialesRTU: comercialesRTU,
      representanteLegal: _v2trim(s.representante || ''),
      representantesRTU: Array.isArray(r.representantes) ? r.representantes : [],
      designadoNombre: _v2trim(s.designado || ''),
      designadoCorreo: _v2trim(s.correoDesignado || ''),
      evidencias: {
        solicitudFileId: solMeta.fileId,
        rtuFileId: rtuMeta.fileId,
        solicitudOCRDocId: solOCR.docId,
        rtuOCRDocId: rtuOCR.docId
      },
      debug: { trace }
    });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e), debug: { trace } });
  }
}

/***** GUARDADO EN PRE-REGISTRO *****/
function guardarPreRegistroV2(row) {
  _v2requireAdmin();

  try {
    const { ss, sh } = _v2getPreSheet();
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    const cTs = _v2requireCol(headers, ['Marca temporal', 'timestamp', 'fecha', 'marca de tiempo'], 'Marca temporal');
    const cEmail = _v2requireCol(headers, ['Dirección de correo electrónico', 'direccion de correo electronico', 'correo', 'email'], 'Dirección de correo electrónico');
    const cEsquema = _v2requireCol(headers, ['Esquema de acreditación', 'Esquema', 'Esquema de acreditacion'], 'Esquema de acreditación');
    const cNit = _v2requireCol(headers, ['NIT ( No usar guion) (numero de identificación tributaria)', 'nit'], 'NIT');
    const cRazon = _v2requireCol(headers, ['Razón social (según lo inscrito con su número de identificación tributaria)', 'razon social'], 'Razón social');
    const cComercial = _v2requireCol(headers, ['Nombre comercial del OEC (únicamente si es diferente a la razón social)', 'Nombre comercial del OEC', 'Nombre comercial'], 'Nombre comercial');
    const cSolicitud = _v2requireCol(headers, ['Solicitud'], 'Solicitud');
    const cRTU = _v2requireCol(headers, ['RTU'], 'RTU');
    const cSolFile = _v2requireCol(headers, ['Solicitud_FileId'], 'Solicitud_FileId');
    const cRTUFile = _v2requireCol(headers, ['RTU_FileId'], 'RTU_FileId');
    const cRep = _v2requireCol(headers, ['Representante Legal', 'representante legal'], 'Representante Legal');
    const cTel = _v2requireCol(headers, ['Teléfono', 'Telefono', 'Teléfono ( No utilizar símbolos, eje.- o /)', 'telefono'], 'Teléfono');
    const cC1Nom = _v2requireCol(headers, ['Contacto 1 - nombre', '1 Nombres y Apellidos (Completo)', 'Contacto 1'], 'Contacto 1 - nombre');
    const cC1Mail = _v2requireCol(headers, ['Correo contacto 1', 'Correo Electrónico', 'Correo Electronico'], 'Correo contacto 1');
    const cNorma = _v2requireCol(headers, ['Norma', 'norma solicitada'], 'Norma');

    const email = _v2trim(row.email);
    const esquema = _v2soloTipoEsquema('', row.esquema);
    const norma = _v2normaDesdeEsquema(esquema);
    const nit = _v2cleanNIT(row.nit);
    const razon = _v2trim(row.razon);
    const comercial = _v2trim(row.comercial);
    const contactoNom = _v2trim(row.contactoNom || row.designadoNombre);
    const contactoMail = _v2trim(row.contactoMail || row.designadoCorreo || row.email);
    const telefono = _v2trim(String(row.telefono || '').replace(/[^0-9]/g, ''));
    const representante = _v2trim(row.representanteLegal);
    const evid = row.evidencias || {};

    const faltantes = [];
    if (!email) faltantes.push('Correo');
    if (!esquema) faltantes.push('Esquema');
    if (!norma) faltantes.push('Norma derivada del esquema');
    if (!nit) faltantes.push('NIT');
    if (!razon) faltantes.push('Razón social');
    if (!contactoNom) faltantes.push('Contacto 1 - nombre');
    if (!contactoMail) faltantes.push('Correo contacto 1');
    if (!telefono) faltantes.push('Teléfono');
    if (!representante) faltantes.push('Representante legal');

    if (faltantes.length) {
      return _v2sanitize({ ok: false, error: 'Faltan: ' + faltantes.join(', ') });
    }

    const values = Array(sh.getLastColumn()).fill('');
    values[cTs - 1] = new Date();
    values[cEmail - 1] = email;
    values[cEsquema - 1] = esquema;
    values[cNit - 1] = nit;
    values[cRazon - 1] = razon;
    values[cComercial - 1] = comercial;
    values[cSolicitud - 1] = evid.solicitudFileId ? 'Sí' : '';
    values[cRTU - 1] = evid.rtuFileId ? 'Sí' : '';
    values[cSolFile - 1] = evid.solicitudFileId || '';
    values[cRTUFile - 1] = evid.rtuFileId || '';
    values[cRep - 1] = representante;
    values[cTel - 1] = telefono;
    values[cC1Nom - 1] = contactoNom;
    values[cC1Mail - 1] = contactoMail;
    values[cNorma - 1] = norma;

    sh.appendRow(values);

    return _v2sanitize({
      ok: true,
      meta: _v2sheetMeta(ss, sh)
    });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e) });
  }
}

/***** SUBIDA DE EVIDENCIAS *****/
function subirEvidenciaV2(tipo, payload) {
  _v2requireAdmin();
  try {
    const meta = _v2saveBlobToDrive(payload.bytes, payload.type, payload.name, PRV2.EVID_SUBFOLDER);
    return _v2sanitize({ ok: true, fileId: meta.fileId, url: meta.url, tipo: tipo });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e) });
  }
}

function actualizarEvidenciaV2(rowIndex, tipo, fileId) {
  _v2requireAdmin();
  try {
    const { sh } = _v2getPreSheet();
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    const key = String(tipo || '').toLowerCase();
    const mapFile = {
      solicitud: ['Solicitud_FileId'],
      rtu: ['RTU_FileId'],
      alcance: ['Alcance_FileId'],
      idoneidad: ['Idoneidad_FileId']
    };
    const mapFlag = {
      solicitud: ['Solicitud'],
      rtu: ['RTU'],
      alcance: ['Alcance de Acreditación', 'Alcance'],
      idoneidad: ['Idoneidad']
    };

    const cFile = _v2requireCol(headers, mapFile[key], mapFile[key][0]);
    const cFlag = _v2requireCol(headers, mapFlag[key], mapFlag[key][0]);

    sh.getRange(rowIndex, cFile).setValue(fileId);
    sh.getRange(rowIndex, cFlag).setValue('Sí');

    return _v2sanitize({ ok: true });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e) });
  }
}

/***** LISTADO DE PRE-REGISTROS *****/
function listarPreRegistrosV2(statusFilter) {
  try {
    const userInfo = getCurrentUserInfoV2();
    const wanted = String(statusFilter || 'standby').trim().toLowerCase();

    const { ss, sh } = _v2getPreSheet();
    const meta = _v2sheetMeta(ss, sh);
    meta.userInfo = userInfo;

    if (sh.getLastRow() < 2) {
      return _v2sanitize({ ok: true, rows: [], meta: meta, totals: { totalFilas: 0, devueltas: 0 } });
    }

    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const cRegistro = _v2findCol(headers, ['Registro de acreditación', 'Registro de acreditacion', 'Estado', 'Estatus']);
    const cCom = _v2findCol(headers, ['Nombre comercial del OEC (únicamente si es diferente a la razón social)', 'Nombre comercial del OEC', 'Nombre comercial']);
    const cFlagSol = _v2findCol(headers, ['Solicitud']);
    const cFlagRTU = _v2findCol(headers, ['RTU']);
    const cFlagAlc = _v2findCol(headers, ['Alcance de Acreditación', 'Alcance']);
    const cFlagIdo = _v2findCol(headers, ['Idoneidad']);
    const cSolFile = _v2findCol(headers, ['Solicitud_FileId']);
    const cRTUFile = _v2findCol(headers, ['RTU_FileId']);
    const cAlcFile = _v2findCol(headers, ['Alcance_FileId']);
    const cIdoFile = _v2findCol(headers, ['Idoneidad_FileId']);
    const cTs = _v2findCol(headers, ['Marca temporal', 'timestamp', 'fecha', 'marca de tiempo']);

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

    const safeUrl = (fid) => {
      if (!fid) return '';
      try { return DriveApp.getFileById(String(fid)).getUrl(); } catch (_) { return ''; }
    };

    const rows = [];
    data.forEach((row, i) => {
      const rawReg = cRegistro ? row[cRegistro - 1] : '';
      const regLower = String(rawReg || '').trim().toLowerCase();
      const isStandby = !regLower || ['standby', 'pendiente', 'pending', 'en espera'].includes(regLower);
      if (wanted === 'standby' && !isStandby) return;

      const solId = cSolFile ? row[cSolFile - 1] : '';
      const rtuId = cRTUFile ? row[cRTUFile - 1] : '';
      const alcId = cAlcFile ? row[cAlcFile - 1] : '';
      const idoId = cIdoFile ? row[cIdoFile - 1] : '';

      let ts = cTs ? row[cTs - 1] : '';
      if (ts && Object.prototype.toString.call(ts) === '[object Date]' && !isNaN(ts)) {
        ts = _v2formatDate(ts);
      } else {
        ts = String(ts || '');
      }

      rows.push({
        rowIndex: i + 2,
        registro: rawReg || 'Standby',
        comercial: cCom ? row[cCom - 1] : '',
        solicitudOk: !!solId || (cFlagSol ? _v2boolYes(row[cFlagSol - 1]) : false),
        solicitudUrl: solId ? safeUrl(solId) : '',
        rtuOk: !!rtuId || (cFlagRTU ? _v2boolYes(row[cFlagRTU - 1]) : false),
        rtuUrl: rtuId ? safeUrl(rtuId) : '',
        alcanceOk: !!alcId || (cFlagAlc ? _v2boolYes(row[cFlagAlc - 1]) : false),
        alcanceUrl: alcId ? safeUrl(alcId) : '',
        idoneidadOk: !!idoId || (cFlagIdo ? _v2boolYes(row[cFlagIdo - 1]) : false),
        idoneidadUrl: idoId ? safeUrl(idoId) : '',
        timestamp: ts
      });
    });

    return _v2sanitize({
      ok: true,
      rows: rows,
      meta: meta,
      totals: { totalFilas: data.length, devueltas: rows.length }
    });
  } catch (e) {
    return _v2sanitize({ ok: false, error: String(e) });
  }
}

/***** MAPEO Y COPIA A HOJA FINAL *****/
function _v2finalCodesSet() {
  const { sh } = _v2getFinalSheet();
  if (sh.getLastRow() < 2 || sh.getLastColumn() === 0) return new Set();

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cReg = _v2findCol(headers, ['Registro de acreditación', 'Registro de acreditacion', 'Registro de Acreditación', 'codigo', 'código']);
  if (!cReg) return new Set();

  const vals = sh.getRange(2, cReg, sh.getLastRow() - 1, 1).getValues().flat();
  return new Set(vals.map(v => String(v || '').trim()).filter(Boolean));
}

function _v2mapPreRowToFinalValues(preHeaders, preRow) {
  const { sh: finalSh } = _v2getFinalSheet();
  const finalHeaders = finalSh.getRange(1, 1, 1, finalSh.getLastColumn()).getValues()[0];

  const getPre = (aliases) => _v2getCellByAliases(preHeaders, preRow, aliases);
  const vals = Array(finalSh.getLastColumn()).fill('');

  const setD = (aliases, v) => {
    const i = _v2findCol(finalHeaders, aliases);
    if (i) vals[i - 1] = v;
  };

  const ts        = getPre(['Marca temporal', 'timestamp', 'fecha', 'marca de tiempo']) || new Date();
  const email     = getPre(['Dirección de correo electrónico', 'correo', 'email']);
  const codigo    = getPre(['Registro de acreditación', 'Registro de acreditacion', 'Estado', 'Estatus']);
  const esquema   = getPre(['Esquema de acreditación', 'Esquema', 'Esquema de acreditacion']);
  const nit       = getPre(['NIT ( No usar guion) (numero de identificación tributaria)', 'nit']);
  const razon     = getPre(['Razón social (según lo inscrito con su número de identificación tributaria)', 'razon social']);
  const comercial = getPre(['Nombre comercial del OEC (únicamente si es diferente a la razón social)', 'Nombre comercial del OEC', 'Nombre comercial']);
  const c1Nom     = getPre(['Contacto 1 - nombre', '1 Nombres y Apellidos (Completo)', 'Contacto 1']);
  const c1Mail    = getPre(['Correo contacto 1', 'Correo Electrónico', 'Correo Electronico']);
  const tel       = getPre(['Teléfono', 'Telefono', 'Teléfono ( No utilizar símbolos, eje.- o /)', 'telefono']);
  const norma     = getPre(['Norma', 'norma solicitada']);
  const repLegal  = getPre(['Representante Legal', 'representante legal']);

  setD(['Marca Temporal', 'Marca temporal', 'timestamp', 'fecha'], ts);
  setD(['Dirección de correo electrónico', 'correo', 'email'], email);
  setD(['Registro de acreditación', 'Registro de acreditacion', 'Registro de Acreditación', 'codigo', 'código'], codigo);
  setD(['Esquema de acreditación', 'Esquema', 'Esquema de acreditacion'], esquema);
  setD(['NIT ( No usar guion) (numero de identificación tributaria)', 'nit'], nit);
  setD(['Razón social (según lo inscrito con su número de identificación tributaria)', 'Razon social', 'Razón Social'], razon);
  setD(['Nombre comercial del OEC (únicamente si es diferente a la razón social)', 'Nombre comercial del OEC', 'Nombre comercial'], comercial);
  setD(['1 Nombres y Apellidos (Completo)'], c1Nom);
  setD(['Correo Electrónico', 'Correo Electronico'], c1Mail);
  setD(['Teléfono ( No utilizar símbolos, eje.- o /)', 'telefono'], tel);
  setD(['Norma', 'norma solicitada'], norma);
  setD(['Representante Legal', 'representante legal'], repLegal);

  return vals;
}

function _v2copyToFinal(preHeaders, preRow) {
  const codigo = String(_v2getCellByAliases(preHeaders, preRow, ['Registro de acreditación', 'Registro de acreditacion']) || '').trim();
  if (!codigo) throw new Error('No existe Registro de acreditación para copiar a la hoja final.');

  const codes = _v2finalCodesSet();
  if (codes.has(codigo)) {
    return { ok: true, copied: false, alreadyExisted: true, codigo: codigo };
  }

  const { sh } = _v2getFinalSheet();
  const vals = _v2mapPreRowToFinalValues(preHeaders, preRow);
  sh.appendRow(vals);

  return {
    ok: true,
    copied: true,
    alreadyExisted: false,
    codigo: codigo,
    finalRow: sh.getLastRow()
  };
}

/***** CLIENTES *****/
function _v2upsertCliente(registro, preHeaders, preRow) {
  const { sh } = _v2getClientesSheet();

  _v2log_('CLIENTES_UPSERT_START', { registro: registro });

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  const cOecId    = _v2requireCol(headers, ['OEC_ID'], 'OEC_ID');
  const cRazon    = _v2findCol(headers, ['Razon_Social', 'Razón_Social', 'Razon Social', 'Razón Social']);
  const cTipo     = _v2findCol(headers, ['Tipo']);
  const cNorma    = _v2findCol(headers, ['Norma']);
  const cSitios   = _v2findCol(headers, ['Sitios']);
  const cContacto = _v2findCol(headers, ['Contacto']);
  const cEmail    = _v2findCol(headers, ['Email', 'Correo']);
  const cEstado   = _v2findCol(headers, ['Estado']);

  _v2log_('CLIENTES_UPSERT_COLS', {
    cOecId, cRazon, cTipo, cNorma, cSitios, cContacto, cEmail, cEstado
  });

  const data = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    : [];

  let targetRow = 0;
  for (let i = 0; i < data.length; i++) {
    const oecId = String(data[i][cOecId - 1] || '').trim();
    if (oecId === String(registro || '').trim()) {
      targetRow = i + 2;
      break;
    }
  }

  const razon = _v2trim(_v2getCellByAliases(preHeaders, preRow, [
    'Razón social (según lo inscrito con su número de identificación tributaria)',
    'razon social'
  ]));

  const tipo = _v2trim(_v2getCellByAliases(preHeaders, preRow, [
    'Esquema de acreditación',
    'Esquema',
    'Esquema de acreditacion'
  ]));

  const norma = _v2trim(_v2getCellByAliases(preHeaders, preRow, [
    'Norma',
    'norma solicitada'
  ]));

  const contacto = _v2trim(_v2getCellByAliases(preHeaders, preRow, [
    'Contacto 1 - nombre',
    '1 Nombres y Apellidos (Completo)',
    'Contacto 1'
  ]));

  const email = _v2trim(_v2getCellByAliases(preHeaders, preRow, [
    'Correo contacto 1',
    'Correo Electrónico',
    'Correo Electronico',
    'Dirección de correo electrónico',
    'correo',
    'email'
  ]));

  const estado = 'En proceso';
  const sitios = '';

  if (targetRow) {
    _v2log_('CLIENTES_UPSERT_FOUND', { rowIndex: targetRow, registro: registro });

    sh.getRange(targetRow, cOecId).setValue(registro);
    if (cRazon) sh.getRange(targetRow, cRazon).setValue(razon);
    if (cTipo) sh.getRange(targetRow, cTipo).setValue(tipo);
    if (cNorma) sh.getRange(targetRow, cNorma).setValue(norma);
    if (cSitios && !sh.getRange(targetRow, cSitios).getValue()) sh.getRange(targetRow, cSitios).setValue(sitios);
    if (cContacto) sh.getRange(targetRow, cContacto).setValue(contacto);
    if (cEmail) sh.getRange(targetRow, cEmail).setValue(email);
    if (cEstado && !sh.getRange(targetRow, cEstado).getValue()) sh.getRange(targetRow, cEstado).setValue(estado);

    return {
      ok: true,
      updated: true,
      created: false,
      row: targetRow
    };
  }

  const newRow = Array(sh.getLastColumn()).fill('');
  newRow[cOecId - 1] = registro;
  if (cRazon) newRow[cRazon - 1] = razon;
  if (cTipo) newRow[cTipo - 1] = tipo;
  if (cNorma) newRow[cNorma - 1] = norma;
  if (cSitios) newRow[cSitios - 1] = sitios;
  if (cContacto) newRow[cContacto - 1] = contacto;
  if (cEmail) newRow[cEmail - 1] = email;
  if (cEstado) newRow[cEstado - 1] = estado;

  sh.appendRow(newRow);
  const createdRow = sh.getLastRow();

  _v2log_('CLIENTES_UPSERT_CREATED', {
    rowIndex: createdRow,
    registro: registro,
    razon: razon,
    tipo: tipo,
    norma: norma,
    contacto: contacto,
    email: email,
    estado: estado
  });

  return {
    ok: true,
    updated: true,
    created: true,
    row: createdRow
  };
}

/***** COPY OF CICLOS - OEC_ID + OFICIAL ASIGNADO + DATOS ASIGNACIÓN *****/
function _v2updateCiclos(registro, oficialNombre, fechaAsignacion) {
  const { sh } = _v2getCiclosSheet();

  _v2log_('CICLOS_UPSERT_START', {
    registro: registro,
    oficialNombre: oficialNombre,
    fechaAsignacion: fechaAsignacion
  });

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cOecId = _v2requireCol(headers, ['OEC_ID'], 'OEC_ID');
  const cOficial = _v2requireCol(headers, ['Oficial Asignado'], 'Oficial Asignado');
  const cDatos = _v2requireCol(headers, ['Datos Asignación', 'Datos Asignacion'], 'Datos Asignación');

  const data = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    : [];

  for (let i = 0; i < data.length; i++) {
    const oecId = String(data[i][cOecId - 1] || '').trim();
    if (oecId === String(registro || '').trim()) {
      const rowIndex = i + 2;

      sh.getRange(rowIndex, cOficial).setValue(oficialNombre);
      sh.getRange(rowIndex, cDatos).setValue(fechaAsignacion);

      _v2log_('CICLOS_UPSERT_FOUND', {
        rowIndex: rowIndex,
        registro: registro,
        oficialNombre: oficialNombre
      });

      return {
        ok: true,
        updated: true,
        created: false,
        row: rowIndex
      };
    }
  }

  const newRow = Array(sh.getLastColumn()).fill('');
  newRow[cOecId - 1] = registro;
  newRow[cOficial - 1] = oficialNombre;
  newRow[cDatos - 1] = fechaAsignacion;

  sh.appendRow(newRow);
  const createdRow = sh.getLastRow();

  _v2log_('CICLOS_UPSERT_CREATED', {
    rowIndex: createdRow,
    registro: registro,
    oficialNombre: oficialNombre
  });

  return {
    ok: true,
    updated: true,
    created: true,
    row: createdRow
  };
}

function debugBuscarRegistroEnCiclosV2(registro) {
  try {
    _v2log_('DEBUG_MANUAL_START', { registro: registro });

    const { sh } = _v2getCiclosSheet();
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const cOecId = _v2requireCol(headers, ['OEC_ID'], 'OEC_ID');
    const cOficial = _v2findCol(headers, ['Oficial Asignado']);
    const cDatos = _v2findCol(headers, ['Datos Asignación', 'Datos Asignacion']);

    const data = sh.getLastRow() >= 2
      ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
      : [];

    const hits = [];
    for (let i = 0; i < data.length; i++) {
      const oecId = String(data[i][cOecId - 1] || '').trim();
      if (oecId === String(registro || '').trim()) {
        hits.push({
          rowIndex: i + 2,
          oecId: oecId,
          oficial: cOficial ? data[i][cOficial - 1] : '',
          datosAsignacion: cDatos ? data[i][cDatos - 1] : ''
        });
      }
    }

    const out = {
      ok: true,
      registro: registro,
      encontrados: hits
    };
    _v2log_('DEBUG_MANUAL_OK', out);
    return _v2sanitize(out);
  } catch (e) {
    const err = {
      ok: false,
      registro: registro,
      error: String(e),
      stack: e && e.stack ? String(e.stack) : ''
    };
    _v2log_('DEBUG_MANUAL_ERROR', err);
    return _v2sanitize({ ok: false, error: String(e) });
  }
}

/***** CORREOS *****/

function _v2collectClientEmails(headers, row) {
  const bucket = [];

  bucket.push(_v2getCellByAliases(headers, row, [
    'Dirección de correo electrónico',
    'correo',
    'email'
  ]));

  bucket.push(_v2getCellByAliases(headers, row, [
    'Correo contacto 1',
    'Correo Electrónico',
    'Correo Electronico'
  ]));

  bucket.push(_v2getCellByAliases(headers, row, [
    'Correo contacto 2',
    'Correo Electrónico 2',
    'Correo Electronico 2'
  ]));

  const out = [];
  const seen = new Set();

  bucket.forEach(raw => {
    String(raw || '')
      .split(/[,\n;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach(mail => {
        if (_v2isEmail(mail) && !seen.has(mail)) {
          seen.add(mail);
          out.push(mail);
        }
      });
  });

  return out;
}

function _v2getBoletaOecData_(ctx) {
  const headers = ctx.preHeaders;
  const row = ctx.preRow;
  const registro = String(ctx.registro || '').trim();

  let lookup = {};
  if (typeof buscarDatosOEC_Presupuesto === 'function') {
    try {
      lookup = buscarDatosOEC_Presupuesto(registro) || {};
    } catch (e) {
      _v2log_('BOLETA_LOOKUP_WARN', {
        registro: registro,
        error: String(e)
      });
    }
  }

  const razonRow = _v2trim(_v2getCellByAliases(headers, row, [
    'Razón social (según lo inscrito con su número de identificación tributaria)',
    'razon social'
  ]));

  const comercialRow = _v2trim(_v2getCellByAliases(headers, row, [
    'Nombre comercial del OEC (únicamente si es diferente a la razón social)',
    'Nombre comercial del OEC',
    'Nombre comercial'
  ]));

  const nitRow = _v2trim(_v2getCellByAliases(headers, row, [
    'NIT ( No usar guion) (numero de identificación tributaria)',
    'nit'
  ]));

  const esquemaRow = _v2trim(_v2getCellByAliases(headers, row, [
    'Esquema de acreditación',
    'Esquema',
    'Esquema de acreditacion'
  ]));

  const normaRow = _v2trim(_v2getCellByAliases(headers, row, [
    'Norma',
    'norma solicitada'
  ]));

  return {
    nit: _v2trim(lookup.nit || nitRow),
    razon: _v2trim(lookup.razon || razonRow),
    nombre: _v2trim(lookup.nombre || lookup.comercial || comercialRow || razonRow),
    norma: _v2trim(lookup.norma || normaRow || _v2normaDesdeEsquema(esquemaRow)),
    esquema: _v2trim(lookup.esquema || esquemaRow)
  };
}

function _v2generarBoletaAutomatica_(ctx) {
  if (typeof _registrarBoletaPagoCore_ !== 'function') {
    throw new Error('No se encontró la función _registrarBoletaPagoCore_. Verifica moduloBoletas.gs.');
  }

  if (typeof obtenerTipoCambioBanguat !== 'function') {
    throw new Error('No se encontró la función obtenerTipoCambioBanguat().');
  }

  const tasaCambio = Number(obtenerTipoCambioBanguat());
  if (!(tasaCambio > 0)) {
    throw new Error('No fue posible obtener una tasa de cambio válida para generar la boleta.');
  }

  const oec = _v2getBoletaOecData_(ctx);

  if (!oec.razon) throw new Error('No se encontró la razón social del OEC para la boleta.');
  if (!oec.nit) throw new Error('No se encontró el NIT del OEC para la boleta.');

  const datos = {
    registro: String(ctx.registro || '').trim(),
    razon: oec.razon,
    nombre: oec.nombre || oec.razon,
    norma: oec.norma,
    esquema: oec.esquema,
    concepto: PRV2.BOLETA_CONCEPTO,
    montoUSD: PRV2.BOLETA_MONTO_USD,
    responsable: `Generado automáticamente / Oficial: ${String(ctx.oficialNombre || '').trim()}`,
    tasaCambio: tasaCambio,
    nit: oec.nit,
    pagoPor: ''
  };

  return _registrarBoletaPagoCore_(datos, { includeBlob: true });
}

function _v2getBoletaAttachments_(boleta) {
  if (!boleta || !boleta.exito) return [];

  try {
    if (boleta.blob) return [boleta.blob.copyBlob()];
    if (boleta.fileId) return [DriveApp.getFileById(boleta.fileId).getBlob()];
  } catch (e) {
    _v2log_('BOLETA_ATTACHMENT_ERROR', {
      fileId: boleta.fileId || '',
      error: String(e)
    });
  }

  return [];
}

function _v2boletaHtml_(boleta) {
  if (!boleta || boleta.omitida) return '';

  if (!boleta.exito) {
    return '<p><b>Boleta de pago:</b> No fue posible generarla automáticamente en este momento.</p>';
  }

  const estadoTxt = boleta.duplicada
    ? 'Ya existía una boleta previa para este registro y concepto.'
    : 'Generada automáticamente junto con la asignación.';

  const nombreDoc = boleta.id ? `${boleta.id}.pdf` : 'Boleta.pdf';

  return [
    '<p>Se adjunta la boleta de pago correspondiente al concepto <b>' + _v2escHtml(PRV2.BOLETA_CONCEPTO) + '</b>.</p>',
    '<ul>',
    '<li><b>Tipo de evaluación:</b> ' + _v2escHtml(PRV2.TIPO_EVALUACION_DEFAULT) + '</li>',
    '<li><b>Monto:</b> USD ' + Number(PRV2.BOLETA_MONTO_USD).toFixed(2) + '</li>',
    '<li><b>Documento adjunto:</b> ' + _v2escHtml(nombreDoc) + '</li>',
    '<li><b>Estado de boleta:</b> ' + _v2escHtml(estadoTxt) + '</li>',
    '</ul>'
  ].join('');
}


/*function _v2sendAssignmentEmails(ctx) {
  const headers = ctx.preHeaders;
  const row = ctx.preRow;

  const registro = String(ctx.registro || '').trim();
  const oficialNombre = String(ctx.oficialNombre || '').trim();
  const oficialCorreo = String(ctx.oficialCorreo || '').trim().toLowerCase();
  const fechaAsg = ctx.fechaAsignacion instanceof Date ? ctx.fechaAsignacion : new Date();

  const razon = _v2trim(_v2getCellByAliases(headers, row, [
    'Razón social (según lo inscrito con su número de identificación tributaria)',
    'razon social'
  ]));

  const comercial = _v2trim(_v2getCellByAliases(headers, row, [
    'Nombre comercial del OEC (únicamente si es diferente a la razón social)',
    'Nombre comercial del OEC',
    'Nombre comercial'
  ]));

  const esquema = _v2trim(_v2getCellByAliases(headers, row, [
    'Esquema de acreditación',
    'Esquema',
    'Esquema de acreditacion'
  ]));

  const norma = _v2trim(_v2getCellByAliases(headers, row, [
    'Norma',
    'norma solicitada'
  ]));

  const representante = _v2trim(_v2getCellByAliases(headers, row, [
    'Representante Legal'
  ]));

  const contacto1Nombre = _v2trim(_v2getCellByAliases(headers, row, [
    'Contacto 1 - nombre',
    '1 Nombres y Apellidos (Completo)',
    'Contacto 1'
  ]));

  const clienteEmails = _v2collectClientEmails(headers, row);
  const fechaTxt = _v2formatDate(fechaAsg);

  const subjOficial = 'Asignación de proceso de acreditación';
  const bodyOficial = [
    '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827">',
    `<p>Estimado(a) <b>${_v2escHtml(oficialNombre)}</b>,</p>`,
    '<p>Se le ha asignado un nuevo proceso de acreditación.</p>',
    '<ul>',
    `<li><b>Registro de acreditación:</b> ${_v2escHtml(registro)}</li>`,
    `<li><b>Razón social:</b> ${_v2escHtml(razon)}</li>`,
    `<li><b>Nombre comercial:</b> ${_v2escHtml(comercial || 'No consignado')}</li>`,
    `<li><b>Esquema:</b> ${_v2escHtml(esquema)}</li>`,
    `<li><b>Norma:</b> ${_v2escHtml(norma || 'No consignada')}</li>`,
    `<li><b>Representante legal:</b> ${_v2escHtml(representante || 'No consignado')}</li>`,
    `<li><b>Contacto designado:</b> ${_v2escHtml(contacto1Nombre || 'No consignado')}</li>`,
    `<li><b>Fecha de asignación:</b> ${_v2escHtml(fechaTxt)}</li>`,
    '</ul>',
    '<p>Favor de dar seguimiento al expediente conforme al flujo establecido.</p>',
    '</div>'
  ].join('');

  MailApp.sendEmail({
    to: oficialCorreo,
    cc: PRV2.CC_NOTIF,
    subject: subjOficial,
    htmlBody: bodyOficial
  });

  let clienteEnviado = false;
  let clienteDestinos = [];

  if (clienteEmails.length) {
    const subjCliente = 'Asignación registro proceso de acreditación';
    const bodyCliente = [
      '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827">',
      '<p>Estimado(a) usuario(a),</p>',
      '<p>Se ha asignado el registro de acreditación correspondiente a su proceso.</p>',
      '<ul>',
      `<li><b>Registro de acreditación:</b> ${_v2escHtml(registro)}</li>`,
      `<li><b>Razón social:</b> ${_v2escHtml(razon)}</li>`,
      `<li><b>Esquema:</b> ${_v2escHtml(esquema)}</li>`,
      `<li><b>Norma:</b> ${_v2escHtml(norma || 'No consignada')}</li>`,
      `<li><b>Oficial asignado:</b> ${_v2escHtml(oficialNombre)}</li>`,
      `<li><b>Correo del oficial:</b> ${_v2escHtml(oficialCorreo)}</li>`,
      '</ul>',
      '<p>A partir de esta asignación, el oficial indicado será su punto de contacto para la gestión del expediente.</p>',
      '</div>'
    ].join('');

    MailApp.sendEmail({
      to: clienteEmails.join(','),
      cc: PRV2.CC_NOTIF,
      subject: subjCliente,
      htmlBody: bodyCliente
    });

    clienteEnviado = true;
    clienteDestinos = clienteEmails;
  }

  return {
    ok: true,
    oficialEnviado: true,
    oficialDestino: oficialCorreo,
    clienteEnviado: clienteEnviado,
    clienteDestinos: clienteDestinos
  };
}*/

function _v2sendAssignmentEmails(ctx) {
  const headers = ctx.preHeaders;
  const row = ctx.preRow;

  const registro = String(ctx.registro || '').trim();
  const oficialNombre = String(ctx.oficialNombre || '').trim();
  const oficialCorreo = String(ctx.oficialCorreo || '').trim().toLowerCase();
  const fechaAsg = ctx.fechaAsignacion instanceof Date ? ctx.fechaAsignacion : new Date();
  const boleta = ctx.boleta || null;

  const razon = _v2trim(_v2getCellByAliases(headers, row, [
    'Razón social (según lo inscrito con su número de identificación tributaria)',
    'razon social'
  ]));

  const comercial = _v2trim(_v2getCellByAliases(headers, row, [
    'Nombre comercial del OEC (únicamente si es diferente a la razón social)',
    'Nombre comercial del OEC',
    'Nombre comercial'
  ]));

  const esquema = _v2trim(_v2getCellByAliases(headers, row, [
    'Esquema de acreditación',
    'Esquema',
    'Esquema de acreditacion'
  ]));

  const norma = _v2trim(_v2getCellByAliases(headers, row, [
    'Norma',
    'norma solicitada'
  ]));

  const representante = _v2trim(_v2getCellByAliases(headers, row, [
    'Representante Legal'
  ]));

  const contacto1Nombre = _v2trim(_v2getCellByAliases(headers, row, [
    'Contacto 1 - nombre',
    '1 Nombres y Apellidos (Completo)',
    'Contacto 1'
  ]));

  const clienteEmails = _v2collectClientEmails(headers, row);
  const fechaTxt = _v2formatDate(fechaAsg);
  const bloqueBoleta = _v2boletaHtml_(boleta);

  const subjOficial = 'Asignación de proceso de acreditación';
  const bodyOficial = [
    '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827">',
    `<p>Estimado(a) <b>${_v2escHtml(oficialNombre)}</b>,</p>`,
    '<p>Se le ha asignado un nuevo proceso de acreditación.</p>',
    '<ul>',
    `<li><b>Registro de acreditación:</b> ${_v2escHtml(registro)}</li>`,
    `<li><b>Tipo de evaluación:</b> ${_v2escHtml(PRV2.TIPO_EVALUACION_DEFAULT)}</li>`,
    `<li><b>Razón social:</b> ${_v2escHtml(razon)}</li>`,
    `<li><b>Nombre comercial:</b> ${_v2escHtml(comercial || 'No consignado')}</li>`,
    `<li><b>Esquema:</b> ${_v2escHtml(esquema)}</li>`,
    `<li><b>Norma:</b> ${_v2escHtml(norma || 'No consignada')}</li>`,
    `<li><b>Representante legal:</b> ${_v2escHtml(representante || 'No consignado')}</li>`,
    `<li><b>Contacto designado:</b> ${_v2escHtml(contacto1Nombre || 'No consignado')}</li>`,
    `<li><b>Fecha de asignación:</b> ${_v2escHtml(fechaTxt)}</li>`,
    '</ul>',
    bloqueBoleta,
    '<p>Favor de dar seguimiento al expediente conforme al flujo establecido.</p>',
    '</div>'
  ].join('');

  MailApp.sendEmail({
    to: oficialCorreo,
    cc: PRV2.CC_NOTIF,
    subject: subjOficial,
    htmlBody: bodyOficial,
    attachments: _v2getBoletaAttachments_(boleta)
  });

  let clienteEnviado = false;
  let clienteDestinos = [];

  if (clienteEmails.length) {
    const subjCliente = 'Asignación registro proceso de acreditación';
    const bodyCliente = [
      '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827">',
      '<p>Estimado(a) usuario(a),</p>',
      '<p>Se ha asignado el registro de acreditación correspondiente a su proceso.</p>',
      '<ul>',
      `<li><b>Registro de acreditación:</b> ${_v2escHtml(registro)}</li>`,
      `<li><b>Tipo de evaluación:</b> ${_v2escHtml(PRV2.TIPO_EVALUACION_DEFAULT)}</li>`,
      `<li><b>Razón social:</b> ${_v2escHtml(razon)}</li>`,
      `<li><b>Esquema:</b> ${_v2escHtml(esquema)}</li>`,
      `<li><b>Norma:</b> ${_v2escHtml(norma || 'No consignada')}</li>`,
      `<li><b>Oficial asignado:</b> ${_v2escHtml(oficialNombre)}</li>`,
      `<li><b>Correo del oficial:</b> ${_v2escHtml(oficialCorreo)}</li>`,
      '</ul>',
      bloqueBoleta,
      '<p>A partir de esta asignación, el oficial indicado será su punto de contacto para la gestión del expediente.</p>',
      '</div>'
    ].join('');

    MailApp.sendEmail({
      to: clienteEmails.join(','),
      cc: PRV2.CC_NOTIF,
      subject: subjCliente,
      htmlBody: bodyCliente,
      attachments: _v2getBoletaAttachments_(boleta)
    });

    clienteEnviado = true;
    clienteDestinos = clienteEmails;
  }

  return {
    ok: true,
    oficialEnviado: true,
    oficialDestino: oficialCorreo,
    clienteEnviado: clienteEnviado,
    clienteDestinos: clienteDestinos,
    boletaAdjunta: !!(boleta && boleta.exito),
    boletaDuplicada: !!(boleta && boleta.duplicada)
  };
}


/***** CORRELATIVO GLOBAL *****/
function _v2findMaxCorrelativoGlobal(sh, colReg) {
  const lr = sh.getLastRow();
  if (lr < 2) return 0;

  const vals = sh.getRange(2, colReg, lr - 1, 1).getValues().flat();
  const re = /^OGA-[A-Z]{2}-(\d+)-(\d{2}|\d{4})$/i;

  let max = 0;
  vals.forEach(v => {
    const m = String(v || '').trim().match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });

  return max;
}

/***** ASIGNACIÓN V2: CÓDIGO + COPIA + CLIENTES + CICLOS + CORREOS *****/
/*function asignarRegistroV2(rowIndex, oficialCorreoSeleccionado) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    _v2log_('ASIGNAR_START', {
      rowIndex: rowIndex,
      oficialCorreoSeleccionado: oficialCorreoSeleccionado
    });

    const userInfo = _v2requireAdmin();
    const correoSesion = String(userInfo.email || '').trim().toLowerCase();

    _v2log_('ASIGNAR_USER', {
      emailSesion: correoSesion,
      nombreSesion: userInfo.nombre || '',
      isAdmin: userInfo.isAdmin
    });

    if (!correoSesion) {
      throw new Error('No fue posible obtener el correo del usuario en sesión.');
    }

    const oficialSel = _v2resolverOficialPorCorreo_(oficialCorreoSeleccionado);
    const nombreOficial = oficialSel.nombre;
    const correoOficial = oficialSel.correo;

    _v2log_('ASIGNAR_OFICIAL_SELECCIONADO', {
      nombreOficial: nombreOficial,
      correoOficial: correoOficial
    });

    const { ss, sh } = _v2getPreSheet();
    const lr = sh.getLastRow();
    const lc = sh.getLastColumn();

    _v2log_('ASIGNAR_PRE_META', {
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheetName: sh.getName(),
      lastRow: lr,
      lastColumn: lc
    });

    if (rowIndex < 2 || rowIndex > lr) {
      throw new Error('Fila inválida para asignación.');
    }

    const headers = sh.getRange(1, 1, 1, lc).getValues()[0];
    const row = sh.getRange(rowIndex, 1, 1, lc).getValues()[0];

    _v2log_('ASIGNAR_ROW_RAW', {
      rowIndex: rowIndex,
      row: row
    });

    const cRegistro = _v2requireCol(headers, ['Registro de acreditación', 'Registro de acreditacion'], 'Registro de acreditación');
    const cEsquema = _v2requireCol(headers, ['Esquema de acreditación', 'Esquema', 'Esquema de acreditacion'], 'Esquema de acreditación');
    const cNorma = _v2findCol(headers, ['Norma', 'norma solicitada']);
    const cFlagSol = _v2findCol(headers, ['Solicitud']);
    const cFlagRTU = _v2findCol(headers, ['RTU']);
    const cFlagAlc = _v2findCol(headers, ['Alcance de Acreditación', 'Alcance']);
    const cFlagIdo = _v2findCol(headers, ['Idoneidad']);
    const cSolFile = _v2findCol(headers, ['Solicitud_FileId']);
    const cRTUFile = _v2findCol(headers, ['RTU_FileId']);
    const cAlcFile = _v2findCol(headers, ['Alcance_FileId']);
    const cIdoFile = _v2findCol(headers, ['Idoneidad_FileId']);

    _v2log_('ASIGNAR_COLS', {
      cRegistro, cEsquema, cNorma,
      cFlagSol, cFlagRTU, cFlagAlc, cFlagIdo,
      cSolFile, cRTUFile, cAlcFile, cIdoFile
    });

    const okSol = (cSolFile && row[cSolFile - 1]) || (cFlagSol && _v2boolYes(row[cFlagSol - 1]));
    const okRTU = (cRTUFile && row[cRTUFile - 1]) || (cFlagRTU && _v2boolYes(row[cFlagRTU - 1]));
    const okAlc = (cAlcFile && row[cAlcFile - 1]) || (cFlagAlc && _v2boolYes(row[cFlagAlc - 1]));
    const okIdo = (cIdoFile && row[cIdoFile - 1]) || (cFlagIdo && _v2boolYes(row[cFlagIdo - 1]));

    _v2log_('ASIGNAR_DOCS', {
      okSol: !!okSol,
      okRTU: !!okRTU,
      okAlc: !!okAlc,
      okIdo: !!okIdo,
      solicitudFileId: cSolFile ? row[cSolFile - 1] : '',
      rtuFileId: cRTUFile ? row[cRTUFile - 1] : '',
      alcanceFileId: cAlcFile ? row[cAlcFile - 1] : '',
      idoneidadFileId: cIdoFile ? row[cIdoFile - 1] : ''
    });

    if (!(okSol && okRTU && okAlc && okIdo)) {
      throw new Error('Faltan documentos para asignar el registro.');
    }

    const esquemaTxt = String(row[cEsquema - 1] || '').trim();
    if (!esquemaTxt) {
      throw new Error('No se puede asignar el código porque el preregistro no tiene Esquema de acreditación.');
    }

    const normaTxt = cNorma ? String(row[cNorma - 1] || '').trim() : _v2normaDesdeEsquema(esquemaTxt);

    _v2log_('ASIGNAR_ESQUEMA_NORMA', {
      esquemaTxt: esquemaTxt,
      normaTxt: normaTxt
    });

    let codigo = String(row[cRegistro - 1] || '').trim();
    let codigoNuevo = false;
    let correlativoUsado = null;

    if (!/^OGA-[A-Z]{2}-\d+-\d{2}$/i.test(codigo)) {
      const XX = _v2xxFromEsquema(esquemaTxt, normaTxt);
      const yy = String(new Date().getFullYear()).slice(-2);
      const lastCfg = _v2cfgGetLastCorrelativo(ss);
      const maxSheet = _v2findMaxCorrelativoGlobal(sh, cRegistro);
      const next = Math.max(0, lastCfg, maxSheet) + 1;

      _v2log_('ASIGNAR_CORRELATIVO', {
        XX: XX,
        yy: yy,
        lastCfg: lastCfg,
        maxSheet: maxSheet,
        next: next
      });

      codigo = `OGA-${XX}-${String(next).padStart(3, '0')}-${yy}`;
      codigoNuevo = true;
      correlativoUsado = next;
    }

    _v2log_('ASIGNAR_CODIGO_RESULT', {
      codigoPrevio: String(row[cRegistro - 1] || '').trim(),
      codigoFinal: codigo,
      codigoNuevo: codigoNuevo,
      correlativoUsado: correlativoUsado
    });

    if (codigoNuevo) {
      sh.getRange(rowIndex, cRegistro).setValue(codigo);
      _v2cfgSetLastCorrelativo(ss, correlativoUsado);
      row[cRegistro - 1] = codigo;

      _v2log_('ASIGNAR_CODIGO_GUARDADO', {
        rowIndex: rowIndex,
        cRegistro: cRegistro,
        codigo: codigo,
        correlativoGuardado: correlativoUsado
      });
    }

    if (cNorma) {
      const normaDerivada = _v2normaDesdeEsquema(esquemaTxt);
      if (normaDerivada) {
        sh.getRange(rowIndex, cNorma).setValue(normaDerivada);
        row[cNorma - 1] = normaDerivada;

        _v2log_('ASIGNAR_NORMA_GUARDADA', {
          rowIndex: rowIndex,
          cNorma: cNorma,
          normaDerivada: normaDerivada
        });
      }
    }

    const copyRes = _v2copyToFinal(headers, row);
    _v2log_('ASIGNAR_COPY_FINAL', copyRes);

    const clienteRes = _v2upsertCliente(codigo, headers, row);
    _v2log_('ASIGNAR_UPDATE_CLIENTES', clienteRes);

    const fechaAsignacion = new Date();
    const cicloRes = _v2updateCiclos(codigo, nombreOficial, fechaAsignacion);
    _v2log_('ASIGNAR_UPDATE_CICLOS', cicloRes);

    let mailRes = {
      ok: true,
      oficialEnviado: false,
      clienteEnviado: false,
      clienteDestinos: [],
      mailError: ''
    };

    try {
      mailRes = _v2sendAssignmentEmails({
        preHeaders: headers,
        preRow: row,
        registro: codigo,
        oficialNombre: nombreOficial,
        oficialCorreo: correoOficial,
        fechaAsignacion: fechaAsignacion
      });
      _v2log_('ASIGNAR_MAILS_OK', mailRes);
    } catch (mailErr) {
      mailRes = {
        ok: false,
        oficialEnviado: false,
        clienteEnviado: false,
        clienteDestinos: [],
        mailError: String(mailErr)
      };
      _v2log_('ASIGNAR_MAILS_ERROR', mailRes);
    }

    const out = {
      ok: true,
      codigo: codigo,
      codigoNuevo: codigoNuevo,
      correlativo: correlativoUsado,
      copiadoFinal: !!copyRes.copied,
      yaExistiaEnFinal: !!copyRes.alreadyExisted,

      clienteActualizado: !!clienteRes.updated,
      clienteCreado: !!clienteRes.created,

      cicloActualizado: !!cicloRes.updated,
      cicloCreado: !!cicloRes.created,

      oficialAsignado: nombreOficial,
      oficialCorreo: correoOficial,
      correos: mailRes,
      mailError: mailRes.mailError || ''
    };

    _v2log_('ASIGNAR_END_OK', out);
    return _v2sanitize(out);

  } catch (e) {
    const err = {
      ok: false,
      error: String(e),
      stack: e && e.stack ? String(e.stack) : ''
    };
    _v2log_('ASIGNAR_END_ERROR', err);
    return _v2sanitize({ ok: false, error: String(e) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}*/

function asignarRegistroV2(rowIndex, oficialCorreoSeleccionado) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    _v2log_('ASIGNAR_START', {
      rowIndex: rowIndex,
      oficialCorreoSeleccionado: oficialCorreoSeleccionado
    });

    const userInfo = _v2requireAdmin();
    const correoSesion = String(userInfo.email || '').trim().toLowerCase();

    _v2log_('ASIGNAR_USER', {
      emailSesion: correoSesion,
      nombreSesion: userInfo.nombre || '',
      isAdmin: userInfo.isAdmin
    });

    if (!correoSesion) {
      throw new Error('No fue posible obtener el correo del usuario en sesión.');
    }

    const oficialSel = _v2resolverOficialPorCorreo_(oficialCorreoSeleccionado);
    const nombreOficial = oficialSel.nombre;
    const correoOficial = oficialSel.correo;

    _v2log_('ASIGNAR_OFICIAL_SELECCIONADO', {
      nombreOficial: nombreOficial,
      correoOficial: correoOficial
    });

    const { ss, sh } = _v2getPreSheet();
    const lr = sh.getLastRow();
    const lc = sh.getLastColumn();

    _v2log_('ASIGNAR_PRE_META', {
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheetName: sh.getName(),
      lastRow: lr,
      lastColumn: lc
    });

    if (rowIndex < 2 || rowIndex > lr) {
      throw new Error('Fila inválida para asignación.');
    }

    const headers = sh.getRange(1, 1, 1, lc).getValues()[0];
    const row = sh.getRange(rowIndex, 1, 1, lc).getValues()[0];

    _v2log_('ASIGNAR_ROW_RAW', {
      rowIndex: rowIndex,
      row: row
    });

    const cRegistro = _v2requireCol(headers, ['Registro de acreditación', 'Registro de acreditacion'], 'Registro de acreditación');
    const cEsquema = _v2requireCol(headers, ['Esquema de acreditación', 'Esquema', 'Esquema de acreditacion'], 'Esquema de acreditación');
    const cNorma = _v2findCol(headers, ['Norma', 'norma solicitada']);
    const cFlagSol = _v2findCol(headers, ['Solicitud']);
    const cFlagRTU = _v2findCol(headers, ['RTU']);
    const cFlagAlc = _v2findCol(headers, ['Alcance de Acreditación', 'Alcance']);
    const cFlagIdo = _v2findCol(headers, ['Idoneidad']);
    const cSolFile = _v2findCol(headers, ['Solicitud_FileId']);
    const cRTUFile = _v2findCol(headers, ['RTU_FileId']);
    const cAlcFile = _v2findCol(headers, ['Alcance_FileId']);
    const cIdoFile = _v2findCol(headers, ['Idoneidad_FileId']);

    _v2log_('ASIGNAR_COLS', {
      cRegistro, cEsquema, cNorma,
      cFlagSol, cFlagRTU, cFlagAlc, cFlagIdo,
      cSolFile, cRTUFile, cAlcFile, cIdoFile
    });

    const okSol = (cSolFile && row[cSolFile - 1]) || (cFlagSol && _v2boolYes(row[cFlagSol - 1]));
    const okRTU = (cRTUFile && row[cRTUFile - 1]) || (cFlagRTU && _v2boolYes(row[cFlagRTU - 1]));
    const okAlc = (cAlcFile && row[cAlcFile - 1]) || (cFlagAlc && _v2boolYes(row[cFlagAlc - 1]));
    const okIdo = (cIdoFile && row[cIdoFile - 1]) || (cFlagIdo && _v2boolYes(row[cFlagIdo - 1]));

    _v2log_('ASIGNAR_DOCS', {
      okSol: !!okSol,
      okRTU: !!okRTU,
      okAlc: !!okAlc,
      okIdo: !!okIdo,
      solicitudFileId: cSolFile ? row[cSolFile - 1] : '',
      rtuFileId: cRTUFile ? row[cRTUFile - 1] : '',
      alcanceFileId: cAlcFile ? row[cAlcFile - 1] : '',
      idoneidadFileId: cIdoFile ? row[cIdoFile - 1] : ''
    });

    if (!(okSol && okRTU && okAlc && okIdo)) {
      throw new Error('Faltan documentos para asignar el registro.');
    }

    const esquemaTxt = String(row[cEsquema - 1] || '').trim();
    if (!esquemaTxt) {
      throw new Error('No se puede asignar el código porque el preregistro no tiene Esquema de acreditación.');
    }

    const normaTxt = cNorma ? String(row[cNorma - 1] || '').trim() : _v2normaDesdeEsquema(esquemaTxt);

    _v2log_('ASIGNAR_ESQUEMA_NORMA', {
      esquemaTxt: esquemaTxt,
      normaTxt: normaTxt
    });

    let codigo = String(row[cRegistro - 1] || '').trim();
    let codigoNuevo = false;
    let correlativoUsado = null;

    if (!/^OGA-[A-Z]{2}-\d+-\d{2}$/i.test(codigo)) {
      const XX = _v2xxFromEsquema(esquemaTxt, normaTxt);
      const yy = String(new Date().getFullYear()).slice(-2);
      const lastCfg = _v2cfgGetLastCorrelativo(ss);
      const maxSheet = _v2findMaxCorrelativoGlobal(sh, cRegistro);
      const next = Math.max(0, lastCfg, maxSheet) + 1;

      _v2log_('ASIGNAR_CORRELATIVO', {
        XX: XX,
        yy: yy,
        lastCfg: lastCfg,
        maxSheet: maxSheet,
        next: next
      });

      codigo = `OGA-${XX}-${String(next).padStart(3, '0')}-${yy}`;
      codigoNuevo = true;
      correlativoUsado = next;
    }

    _v2log_('ASIGNAR_CODIGO_RESULT', {
      codigoPrevio: String(row[cRegistro - 1] || '').trim(),
      codigoFinal: codigo,
      codigoNuevo: codigoNuevo,
      correlativoUsado: correlativoUsado
    });

    if (codigoNuevo) {
      sh.getRange(rowIndex, cRegistro).setValue(codigo);
      _v2cfgSetLastCorrelativo(ss, correlativoUsado);
      row[cRegistro - 1] = codigo;

      _v2log_('ASIGNAR_CODIGO_GUARDADO', {
        rowIndex: rowIndex,
        cRegistro: cRegistro,
        codigo: codigo,
        correlativoGuardado: correlativoUsado
      });
    }

    if (cNorma) {
      const normaDerivada = _v2normaDesdeEsquema(esquemaTxt);
      if (normaDerivada) {
        sh.getRange(rowIndex, cNorma).setValue(normaDerivada);
        row[cNorma - 1] = normaDerivada;

        _v2log_('ASIGNAR_NORMA_GUARDADA', {
          rowIndex: rowIndex,
          cNorma: cNorma,
          normaDerivada: normaDerivada
        });
      }
    }

    const copyRes = _v2copyToFinal(headers, row);
    _v2log_('ASIGNAR_COPY_FINAL', copyRes);

    const clienteRes = _v2upsertCliente(codigo, headers, row);
    _v2log_('ASIGNAR_UPDATE_CLIENTES', clienteRes);

    const fechaAsignacion = new Date();
    const cicloRes = _v2updateCiclos(codigo, nombreOficial, fechaAsignacion);
    _v2log_('ASIGNAR_UPDATE_CICLOS', cicloRes);

    // === NUEVO: generar boleta automática SOLO cuando el código es nuevo ===
    let boletaRes = {
      exito: false,
      duplicada: false,
      omitida: !codigoNuevo,
      id: '',
      fileId: '',
      url: '',
      error: ''
    };

    if (codigoNuevo) {
      try {
        boletaRes = _v2generarBoletaAutomatica_({
          preHeaders: headers,
          preRow: row,
          registro: codigo,
          oficialNombre: nombreOficial,
          oficialCorreo: correoOficial,
          fechaAsignacion: fechaAsignacion,
          tipoEvaluacion: PRV2.TIPO_EVALUACION_DEFAULT
        });

        _v2log_('ASIGNAR_BOLETA_OK', {
          exito: boletaRes.exito,
          duplicada: boletaRes.duplicada,
          id: boletaRes.id,
          fileId: boletaRes.fileId,
          url: boletaRes.url
        });
      } catch (boletaErr) {
        boletaRes = {
          exito: false,
          duplicada: false,
          omitida: false,
          id: '',
          fileId: '',
          url: '',
          error: String(boletaErr)
        };

        _v2log_('ASIGNAR_BOLETA_ERROR', boletaRes);
      }
    } else {
      _v2log_('ASIGNAR_BOLETA_OMITIDA', {
        registro: codigo,
        motivo: 'La boleta automática solo se genera cuando el código es nuevo.'
      });
    }

    let mailRes = {
      ok: true,
      oficialEnviado: false,
      clienteEnviado: false,
      clienteDestinos: [],
      mailError: ''
    };

    try {
      mailRes = _v2sendAssignmentEmails({
        preHeaders: headers,
        preRow: row,
        registro: codigo,
        oficialNombre: nombreOficial,
        oficialCorreo: correoOficial,
        fechaAsignacion: fechaAsignacion,
        tipoEvaluacion: PRV2.TIPO_EVALUACION_DEFAULT,
        boleta: boletaRes
      });
      _v2log_('ASIGNAR_MAILS_OK', mailRes);
    } catch (mailErr) {
      mailRes = {
        ok: false,
        oficialEnviado: false,
        clienteEnviado: false,
        clienteDestinos: [],
        mailError: String(mailErr)
      };
      _v2log_('ASIGNAR_MAILS_ERROR', mailRes);
    }

    const out = {
      ok: true,
      codigo: codigo,
      codigoNuevo: codigoNuevo,
      correlativo: correlativoUsado,
      copiadoFinal: !!copyRes.copied,
      yaExistiaEnFinal: !!copyRes.alreadyExisted,

      clienteActualizado: !!clienteRes.updated,
      clienteCreado: !!clienteRes.created,

      cicloActualizado: !!cicloRes.updated,
      cicloCreado: !!cicloRes.created,

      oficialAsignado: nombreOficial,
      oficialCorreo: correoOficial,

      boleta: {
        exito: !!boletaRes.exito,
        duplicada: !!boletaRes.duplicada,
        omitida: !!boletaRes.omitida,
        id: boletaRes.id || '',
        fileId: boletaRes.fileId || '',
        url: boletaRes.url || '',
        error: boletaRes.error || ''
      },

      correos: mailRes,
      mailError: mailRes.mailError || ''
    };

    _v2log_('ASIGNAR_END_OK', out);
    return _v2sanitize(out);

  } catch (e) {
    const err = {
      ok: false,
      error: String(e),
      stack: e && e.stack ? String(e.stack) : ''
    };
    _v2log_('ASIGNAR_END_ERROR', err);
    return _v2sanitize({ ok: false, error: String(e) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
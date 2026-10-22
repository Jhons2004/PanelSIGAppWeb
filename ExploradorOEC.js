/*************************************************
 * EXPLORADOR DE DOCUMENTOS OEC - SOLO LECTURA
 * Compatible con WebApp SPA HtmlService
 *
 * FLUJO SIMPLIFICADO:
 *  1) Se valida el registro en hoja "Clientes"
 *  2) Se obtiene el nombre del OEC desde "Razon_Social"
 *  3) Se busca la carpeta exacta del expediente en la raíz Drive
 *  4) Se navega únicamente dentro de ese expediente
 *************************************************/

const EXPLORADOR_OEC_CFG = {
  ROOT_FOLDER_ID: '1zMjgzmCjjxPxA0oYRe_h7qnbYxr3OJ-8',
  REGISTRO_MAESTRO_ID: '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8',
  REGISTRO_MAESTRO_SHEET: 'Clientes',

  // Rendimiento
  MAX_ITEMS_PER_FOLDER: 50,
  MAX_BREADCRUMB_DEPTH: 20,

  // Cache (segundos)
  CACHE_CLIENTE_SECONDS: 21600,        // 6 horas
  CACHE_EXPEDIENTE_SECONDS: 21600,     // 6 horas
  CACHE_FOLDER_CONTENT_SECONDS: 600    // 10 minutos
};

const MIME_FOLDER = 'application/vnd.google-apps.folder';

function cargarVistaExploradorOEC_() {
  if (typeof cargarVista === 'function') {
    return cargarVista('DocumentosOEC');
  }
  return HtmlService.createHtmlOutputFromFile('DocumentosOEC').getContent();
}


/* ======================================================
 * RUTA SPA / VISTA
 * ====================================================== */

function mostrarExploradorDocumentosOEC() {
  return cargarVistaExploradorOEC_();
}

function abrirExploradorDocumentosOEC() {
  return cargarVistaExploradorOEC_();
}

/* ======================================================
 * API PÚBLICA PARA HTML
 * ====================================================== */


function buscarExpedienteOEC(registro) {
  SIGA_EXPLORADOR_autorizar_();
  SIGA_AUDIT_event_('CONSULTA_EXPEDIENTE','EXPLORADOR','OK',registro,'','');
  return ejecutarConReintento_(function () {
    const reg = normalizarRegistro_(registro);
    validarRegistro_(reg);

    const cliente = obtenerClientePorRegistro_(reg);
    if (!cliente) {
      return {
        ok: false,
        message: 'El registro no existe en la hoja Clientes.'
      };
    }

    const expediente = obtenerCarpetaExpedienteExacta_(reg);
    if (!expediente) {
      return {
        ok: false,
        message: 'El registro existe en Clientes, pero no se encontró su carpeta en Drive.'
      };
    }

    return {
      ok: true,
      registro: reg,
      nombreOEC: cliente.nombreOEC || 'Nombre de OEC no encontrado',
      expediente: {
        id: expediente.id,
        name: expediente.name
      },
      contenido: obtenerContenidoCarpetaSeguraPorId_(expediente.id, expediente.id)
    };
  }, 4, 500);
}

function obtenerContenidoCarpeta(folderId, expedienteId) {
  SIGA_EXPLORADOR_autorizar_();
  if (!expedienteId) throw new Error('Se requiere un expediente de referencia.');
  const raiz = DriveApp.getFolderById(EXPLORADOR_OEC_CFG.ROOT_FOLDER_ID);
  const expediente = DriveApp.getFolderById(expedienteId);
  const parents = expediente.getParents();
  let esDirecto = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === raiz.getId()) { esDirecto = true; break; }
  }
  if (!esDirecto) throw new Error('El expediente no está en la raíz institucional.');
  return ejecutarConReintento_(function () {
    if (!folderId) {
      throw new Error('No se recibió el identificador de carpeta.');
    }

    const folder = DriveApp.getFolderById(folderId);

    if (expedienteId && !esCarpetaDentroDeExpediente_(folder, expedienteId)) {
      throw new Error('Acceso no permitido fuera del expediente seleccionado.');
    }

    return obtenerContenidoCarpetaSeguraPorId_(folderId, expedienteId);
  }, 4, 500);
}

/* ======================================================
 * CLIENTES
 * ====================================================== */

function obtenerClientePorRegistro_(registro) {
  const cacheKey = 'CLIENTE_' + registro;
  const cached = getCachedJson_(cacheKey);
  if (cached && cached.registro) {
    return cached;
  }

  const cliente = ejecutarConReintento_(function () {
    const ss = SpreadsheetApp.openById(EXPLORADOR_OEC_CFG.REGISTRO_MAESTRO_ID);
    const sh = ss.getSheetByName(EXPLORADOR_OEC_CFG.REGISTRO_MAESTRO_SHEET);
    if (!sh) return null;

    const lastRow = sh.getLastRow();
    const lastColumn = sh.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) return null;

    const headers = sh.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

    const idxOecId = encontrarIndiceHeader_(headers, [
      'OEC_ID',
      'OEC ID',
      'REGISTRO',
      'REGISTRO DE ACREDITACION',
      'REGISTRO DE ACREDITACIÓN'
    ]);

    const idxRazon = encontrarIndiceHeader_(headers, [
      'RAZON_SOCIAL',
      'RAZÓN_SOCIAL',
      'RAZON SOCIAL',
      'RAZÓN SOCIAL',
      'NOMBRE OEC'
    ]);

    if (idxOecId < 0 || idxRazon < 0) return null;

    const numRows = lastRow - 1;
    const oecIds = sh.getRange(2, idxOecId + 1, numRows, 1).getDisplayValues();
    const razones = sh.getRange(2, idxRazon + 1, numRows, 1).getDisplayValues();

    for (let i = 0; i < numRows; i++) {
      const regFila = normalizarRegistro_(oecIds[i][0] || '');
      if (regFila === registro) {
        return {
          registro: registro,
          nombreOEC: String(razones[i][0] || '').trim()
        };
      }
    }

    return null;
  }, 4, 500);

  if (cliente) {
    putCachedJson_(cacheKey, cliente, EXPLORADOR_OEC_CFG.CACHE_CLIENTE_SECONDS);
  }

  return cliente;
}

/* ======================================================
 * EXPEDIENTE EN DRIVE RAÍZ
 * ====================================================== */

function obtenerCarpetaExpedienteExacta_(registro) {
  const cacheKey = 'EXPEDIENTE_FOLDER_' + registro;
  const cached = getCachedJson_(cacheKey);
  if (cached && cached.id && cached.name) {
    return cached;
  }

  const expediente = ejecutarConReintento_(function () {
    const query =
      `'${EXPLORADOR_OEC_CFG.ROOT_FOLDER_ID}' in parents and trashed = false and mimeType = '${MIME_FOLDER}' and name = '${escapeDriveQueryValue_(registro)}'`;

    const resp = Drive.Files.list({
      q: query,
      pageSize: 1,
      fields: 'files(id,name)'
    });

    const items = resp.files || [];
    if (!items.length) {
      return null;
    }

    return {
      id: items[0].id,
      name: items[0].name
    };
  }, 4, 500);

  if (expediente) {
    putCachedJson_(cacheKey, expediente, EXPLORADOR_OEC_CFG.CACHE_EXPEDIENTE_SECONDS);
  }

  return expediente;
}

/* ======================================================
 * CONTENIDO DE CARPETA
 * ====================================================== */

function obtenerContenidoCarpetaSeguraPorId_(folderId, expedienteId) {
  const contenido = obtenerContenidoCarpetaCacheable_(folderId);

  if (expedienteId) {
    contenido.breadcrumb = (contenido.breadcrumb || []).filter(function (item) {
      return esMismoONivelInferiorEnBreadcrumb_(contenido.breadcrumb, item.id, expedienteId);
    });
  }

  return contenido;
}

function obtenerContenidoCarpetaCacheable_(folderId) {
  const cacheKey = 'FOLDER_CONTENT_' + folderId;
  const cached = getCachedJson_(cacheKey);
  if (cached) return cached;

  const folder = DriveApp.getFolderById(folderId);
  const listado = listarContenidoCarpetaV2_(folderId, EXPLORADOR_OEC_CFG.MAX_ITEMS_PER_FOLDER);

  const contenido = {
    carpetaActual: {
      id: folder.getId(),
      name: folder.getName()
    },
    breadcrumb: construirBreadcrumb_(folder),
    subcarpetas: listado.subcarpetas,
    archivos: listado.archivos,
    limiteAplicado: !!listado.nextPageToken
  };

  putCachedJson_(cacheKey, contenido, EXPLORADOR_OEC_CFG.CACHE_FOLDER_CONTENT_SECONDS);
  return contenido;
}

function listarContenidoCarpetaV2_(folderId, maxResults, pageToken) {
  const query = `'${folderId}' in parents and trashed = false`;

  const resp = Drive.Files.list({
    q: query,
    pageSize: maxResults || EXPLORADOR_OEC_CFG.MAX_ITEMS_PER_FOLDER,
    pageToken: pageToken || null,
    fields: 'files(id,name,mimeType,modifiedTime,size),nextPageToken'
  });

  const items = resp.files || [];
  const subcarpetas = [];
  const archivos = [];

  items.forEach(function (it) {
    if (it.mimeType === MIME_FOLDER) {
      subcarpetas.push({
        id: it.id,
        name: it.name,
        type: 'folder'
      });
      return;
    }

    archivos.push(mapearArchivoV2_(it));
  });

  subcarpetas.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  archivos.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  return {
    subcarpetas: subcarpetas,
    archivos: archivos,
    nextPageToken: resp.nextPageToken || ''
  };
}

function mapearArchivoV2_(item) {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    tipoLabel: obtenerTipoArchivoLabel_(item.mimeType),
    icono: obtenerIconoArchivo_(item.mimeType),
    previewUrl: construirPreviewUrl_(item.id, item.mimeType),
    lastUpdated: formatearFechaDrive_(item.modifiedTime),
    sizeText: formatearTamano_(Number(item.size || 0)),
    previewable: true,
    type: 'file'
  };
}

function construirBreadcrumb_(folder) {
  const items = [];
  let actual = folder;
  let depth = 0;

  while (actual && depth < EXPLORADOR_OEC_CFG.MAX_BREADCRUMB_DEPTH) {
    items.unshift({
      id: actual.getId(),
      name: actual.getName()
    });

    if (actual.getId() === EXPLORADOR_OEC_CFG.ROOT_FOLDER_ID) {
      break;
    }

    const parents = actual.getParents();
    if (!parents.hasNext()) break;

    actual = parents.next();
    depth++;
  }

  return items;
}

function esMismoONivelInferiorEnBreadcrumb_(breadcrumb, itemId, expedienteId) {
  const idxExp = breadcrumb.findIndex(function (x) { return x.id === expedienteId; });
  const idxItem = breadcrumb.findIndex(function (x) { return x.id === itemId; });

  if (idxExp < 0 || idxItem < 0) return false;
  return idxItem >= idxExp;
}

function esCarpetaDentroDeExpediente_(folder, expedienteId) {
  let actual = folder;
  let depth = 0;
  const maxDepth = 50;

  while (actual && depth < maxDepth) {
    if (actual.getId() === expedienteId) return true;

    const parents = actual.getParents();
    if (!parents.hasNext()) break;

    actual = parents.next();
    depth++;
  }

  return false;
}

/* ======================================================
 * NORMALIZACIÓN / FORMATO
 * ====================================================== */

function normalizarRegistro_(registro) {
  return String(registro || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function validarRegistro_(registro) {
  const patron = /^OGA-(LE|OI|LC)-\d{3}-\d{2}$/i;
  if (!patron.test(String(registro || '').trim())) {
    throw new Error('Formato inválido. Debe usar un registro como OGA-LE-001-01, OGA-OI-123-02 u OGA-LC-045-10.');
  }
}

function encontrarIndiceHeader_(headers, aliases) {
  const aliasSet = aliases.map(normalizarHeader_);
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarHeader_(headers[i]);
    if (aliasSet.includes(h)) return i;
  }
  return -1;
}

function normalizarHeader_(txt) {
  return quitarAcentos_(String(txt || ''))
    .trim()
    .toUpperCase()
    .replace(/[\s\-\/]+/g, '_');
}

function quitarAcentos_(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatearFechaDrive_(isoString) {
  if (!isoString) return '';
  try {
    return Utilities.formatDate(
      new Date(isoString),
      Session.getScriptTimeZone(),
      'dd-MM-yyyy HH:mm'
    );
  } catch (e) {
    return '';
  }
}

function formatearTamano_(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;

  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }

  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function obtenerTipoArchivoLabel_(mimeType) {
  switch (mimeType) {
    case MimeType.GOOGLE_DOCS:
      return 'Documento';
    case MimeType.GOOGLE_SHEETS:
      return 'Hoja de cálculo';
    case MimeType.GOOGLE_SLIDES:
      return 'Presentación';
    case MimeType.PDF:
      return 'PDF';
    default:
      return 'Archivo';
  }
}

function obtenerIconoArchivo_(mimeType) {
  switch (mimeType) {
    case MimeType.GOOGLE_DOCS:
      return '📘';
    case MimeType.GOOGLE_SHEETS:
      return '📗';
    case MimeType.GOOGLE_SLIDES:
      return '📙';
    case MimeType.PDF:
      return '📕';
    default:
      return '📄';
  }
}

function construirPreviewUrl_(id, mimeType) {
  switch (mimeType) {
    case MimeType.GOOGLE_DOCS:
      return `https://docs.google.com/document/d/${id}/preview?rm=minimal`;
    case MimeType.GOOGLE_SHEETS:
      return `https://docs.google.com/spreadsheets/d/${id}/preview?rm=minimal`;
    case MimeType.GOOGLE_SLIDES:
      return `https://docs.google.com/presentation/d/${id}/preview?rm=minimal`;
    case MimeType.PDF:
      return `https://drive.google.com/file/d/${id}/preview`;
    default:
      return `https://drive.google.com/file/d/${id}/preview`;
  }
}

/* ======================================================
 * CACHE / REINTENTOS / UTILIDADES
 * ====================================================== */

function getCachedJson_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function putCachedJson_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || 300);
  } catch (e) {
    // Ignorar si el valor excede límites de cache
  }
}

function escapeDriveQueryValue_(value) {
  return String(value || '').replace(/'/g, "\\'");
}

function ejecutarConReintento_(fn, intentos, esperaBaseMs) {
  const maxIntentos = intentos || 4;
  const base = esperaBaseMs || 500;
  let ultimoError = null;

  for (let i = 0; i < maxIntentos; i++) {
    try {
      return fn();
    } catch (e) {
      ultimoError = e;
      const msg = String(e && e.message ? e.message : e).toUpperCase();

      const esTransient =
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('TIMEOUT') ||
        msg.includes('SERVICE ERROR') ||
        msg.includes('INTERNAL ERROR') ||
        msg.includes('SERVER ERROR') ||
        msg.includes('EXCEPTION: SERVICE INVOKED TOO MANY TIMES') ||
        msg.includes("WE'RE SORRY, A SERVER ERROR OCCURRED");

      if (!esTransient || i === maxIntentos - 1) {
        throw e;
      }

      const espera = Math.min(base * Math.pow(2, i) + Math.floor(Math.random() * 300), 4000);
      Utilities.sleep(espera);
    }
  }

  throw ultimoError || new Error('No fue posible completar la operación.');
}
/** Autorización independiente del HTML: las RPC directas también se validan. */
function SIGA_EXPLORADOR_autorizar_() {
  SIGA_AUTH_assertGoogle_();
  const s = getUsuarioActivoDetalle();
  if (!s || s.autenticado !== true || !s.email) throw new Error('Sesión institucional requerida.');
  const email = String(s.email).trim().toLowerCase();
  if (!email.endsWith('@oga.org.gt')) throw new Error('Dominio no autorizado.');
  const u = obtenerUsuarioAutorizadoGoogle(email);
  if (!u || u.ok !== true) throw new Error('Usuario no autorizado para SIGA.');
  return email;
}

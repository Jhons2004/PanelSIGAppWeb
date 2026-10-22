/***************************************
 * CORRESPONDENCIA ADMINISTRATIVA
 * Integración de adjuntos locales + Google Picker
 * para documentos relacionados con FAC-078.
 *
 * Integrado al Panel Central existente.
 * Este archivo NO define ni reemplaza el doGet/router principal.
 * Puede seguir abriéndose desde el menú actual o mediante showModalDialog().
 ***************************************/

/* ===============================
 * CONFIGURACIÓN EXISTENTE
 * =============================== */
const ID_PLANTILLA_CORRESP = '1tCvRybzUsW9YjFIQN1DAkubT-mELE74iOJy9-TeWd6Q';
const ID_HOJA_CORRESP      = '1Zq7s7AmXq7ogpYFzyYOAif6idc01sJ9sOK_NXb_mU0Y';
const NOMBRE_HOJA_CORRESP  = 'Egreso 2025';

const ID_BASE_OEC3     = '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc';
const NOMBRE_HOJA_OEC3 = 'Respuestas de formulario 1';

// Carpeta donde actualmente se guardan las cartas y los adjuntos.
const ID_CARPETA_PDFS = '1eLaLJoSwpo1oeLNYgQKPBLOI4RPXTkd0';

/* ===============================
 * CONFIGURACIÓN FAC-078
 * =============================== */

// Raíz conocida de FAC-078: carpeta "Estructura".
// Si en producción tiene otro ID, reemplazar solamente este valor.
const ID_CARPETA_RAIZ_FAC078 = '1zMjgzmCjjxPxA0oYRe_h7qnbYxr3OJ-8';

const NOMBRE_HOJA_ADJUNTOS = 'FAC078_ADJUNTOS';
const MIME_CARPETA = 'application/vnd.google-apps.folder';
const MIME_PDF = 'application/pdf';
const MAX_ADJUNTO_BYTES = 25 * 1024 * 1024;
const MIMES_ADJUNTOS_PERMITIDOS = [MIME_PDF];

// Nombres usados en Project Settings > Script properties.
const PROP_PICKER_API_KEY = 'GOOGLE_PICKER_API_KEY';
const PROP_CLOUD_PROJECT_NUMBER = 'CLOUD_PROJECT_NUMBER';

/* ===============================
 * UI PRINCIPAL
 * =============================== */
function mostrarPanelCorrespondencia() {
  // APPWEB / SPA:
  // El shell OGA llama esta función con google.script.run y espera recibir
  // el HTML como texto para inyectarlo dentro de #app-container.
  return HtmlService.createHtmlOutputFromFile('correspondencia_admon').getContent();
}


/* ===============================
 * UTILIDADES GENERALES
 * =============================== */
function pad4_(n) {
  return String(n).padStart(4, '0');
}

function ahoraGT_() {
  return Utilities.formatDate(
    new Date(),
    'America/Guatemala',
    "yyyy-MM-dd' 'HH:mm:ss"
  );
}

function fechaLargaGT_() {
  const tz = 'America/Guatemala';
  const d = new Date();
  const dia = Utilities.formatDate(d, tz, 'd');
  const mesN = parseInt(Utilities.formatDate(d, tz, 'M'), 10);
  const anio = Utilities.formatDate(d, tz, 'yyyy');
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return `${dia} de ${meses[mesN - 1]} de ${anio}`;
}

function honorificoDesdeNombre_(nombre) {
  if (!nombre) return 'Señor/a';

  const first = String(nombre)
    .split(/\s+/)[0]
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();

  const mujeres = new Set([
    'MARIA', 'ANA', 'SOFIA', 'GABRIELA', 'LAURA', 'PATRICIA', 'CARMEN',
    'LUCIA', 'MARTA', 'VERONICA', 'PAULA', 'ANDREA', 'ROCIO', 'SANDRA',
    'DIANA', 'ALEJANDRA', 'KAREN', 'NATALIA', 'CLAUDIA', 'CAROLINA',
    'JULIA', 'ALBA', 'MONICA', 'SUSANA', 'MERCEDES', 'ISABEL', 'KARLA',
    'ELENA', 'BEATRIZ', 'VICTORIA', 'YOLANDA'
  ]);

  if (mujeres.has(first) || /a$/.test(first)) return 'Señora';
  return 'Señor';
}

function getHoja_(id, name) {
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`No existe la hoja "${name}" en el archivo ${id}`);
  return sh;
}

function normalizarTexto_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizarRegistro_(value) {
  return normalizarTexto_(value).toUpperCase();
}

function nombreSeguroArchivo_(name) {
  const clean = String(name || 'documento.pdf')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return (clean || 'documento.pdf').slice(0, 180);
}

function escaparQueryDrive_(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function urlArchivoDrive_(fileId) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function urlCarpetaDrive_(folderId) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/* ===============================
 * CORRELATIVO Y OEC
 * =============================== */

function getSiguienteCodigoCorrespondencia_() {
  const sh = getHoja_(ID_HOJA_CORRESP, NOMBRE_HOJA_CORRESP);
  const year = Utilities.formatDate(new Date(), 'America/Guatemala', 'yyyy');
  const re = new RegExp(`^OGA-CAD-${year}-(\\d{4})/S$`, 'i');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return `OGA-CAD-${year}-0001/S`;

  const values = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNum = 0;

  for (const [code] of values) {
    const match = String(code || '').trim().match(re);
    if (!match) continue;

    const num = parseInt(match[1], 10);
    if (!isNaN(num)) maxNum = Math.max(maxNum, num);
  }

  return `OGA-CAD-${year}-${pad4_(maxNum + 1)}/S`;
}

function buscarOECporRegistro_(registro) {
  const sh = getHoja_(ID_BASE_OEC3, NOMBRE_HOJA_OEC3);
  const data = sh.getDataRange().getValues();
  if (!data.length) return null;

  const headers = data.shift();

  const findHeaderIndex = (patterns) => {
    for (const re of patterns) {
      const idx = headers.findIndex((h) => re.test(String(h || '').trim()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const IDX_REG = findHeaderIndex([/registro.*acreditaci/i]);
  const IDX_CONT = findHeaderIndex([
    /^1\b.*nombres?.*apellidos?.*(completo)?$/i,
    /nombres?.*apellidos?.*(completo)?/i,
    /contacto.*1.*(nombre|apellidos)/i,
    /nombre.*contacto.*1/i
  ]);
  const IDX_RAZ = findHeaderIndex([/raz[oó]n.*social/i]);
  const IDX_COM = findHeaderIndex([/nombre.*comercial/i]);
  const IDX_PUE = findHeaderIndex([/puesto|cargo/i]);
  const IDX_TIT = findHeaderIndex([/t[ií]tulo.*contacto.*1/i]);

  if (IDX_REG < 0) {
    throw new Error('No se encontró columna "Registro de Acreditación"');
  }

  const wanted = normalizarRegistro_(registro);

  for (const row of data) {
    const regVal = normalizarRegistro_(row[IDX_REG]);
    if (regVal !== wanted) continue;

    const contacto = IDX_CONT >= 0 ? row[IDX_CONT] || '' : '';

    return {
      registro: row[IDX_REG] || '',
      contacto1: contacto,
      representante: contacto,
      razonSocial: IDX_RAZ >= 0 ? row[IDX_RAZ] || '' : '',
      nombreComercial: IDX_COM >= 0 ? row[IDX_COM] || '' : '',
      puestoTrabajo: IDX_PUE >= 0 ? row[IDX_PUE] || '' : '',
      tituloProfesional: IDX_TIT >= 0 ? row[IDX_TIT] || '' : ''
    };
  }

  return null;
}

function sugerenciasRedaccion(texto) {
  const tips = [];
  const value = String(texto || '').trim();

  if (value.length < 80) tips.push('Amplía el contexto (motivo, antecedentes y objetivo).');
  if (value && !/[.!?]$/.test(value)) {
    tips.push('Cierra al menos una oración con punto para mayor claridad.');
  }
  if (/(adjunto|anexo)/i.test(value) && !/(se adjunta|anexamos)/i.test(value)) {
    tips.push('Si hay anexos, nómbralos y su propósito.');
  }
  if (!/(agradezco|solicito|por favor|atentamente|cordialmente)/i.test(value)) {
    tips.push('Incluye cortesía y una llamada a la acción clara.');
  }

  return tips;
}

/* ===============================
 * GOOGLE DRIVE: CONTEXTO FAC-078
 * =============================== */

function driveList_(params) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('El servicio avanzado de Drive no está habilitado.');
  }

  return Drive.Files.list(params || {});
}

function driveGet_(fileId) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('El servicio avanzado de Drive no está habilitado.');
  }

  return Drive.Files.get(fileId, {
    supportsAllDrives: true,
    fields: 'id,name,mimeType,size,parents,webViewLink,modifiedTime,trashed,driveId'
  });
}

function listarHijosDrive_(parentId) {
  const files = [];
  let pageToken = null;

  do {
    const response = driveList_({
      q: `'${parentId}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken: pageToken || undefined,
      orderBy: 'folder,name',
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken,files(id,name,mimeType,size,parents,webViewLink,modifiedTime,driveId)'
    });

    if (response.files && response.files.length) files.push.apply(files, response.files);
    pageToken = response.nextPageToken || null;
  } while (pageToken);

  return files;
}

function carpetaCoincideRegistro_(folderName, registro) {
  const name = normalizarRegistro_(folderName);
  const wanted = normalizarRegistro_(registro);
  if (!name || !wanted) return false;

  return name === wanted ||
    name.startsWith(`${wanted} `) ||
    name.startsWith(`${wanted}-`) ||
    name.startsWith(`${wanted}/`) ||
    name.startsWith(`${wanted}_`) ||
    name.startsWith(`${wanted}|`) ||
    name.startsWith(`${wanted}(`);
}

function perteneceARaizDrive_(itemId, rootId) {
  const root = String(rootId || '');
  let currentId = String(itemId || '');
  const visited = {};

  for (let i = 0; i < 20 && currentId; i++) {
    if (currentId === root) return true;
    if (visited[currentId]) return false;
    visited[currentId] = true;

    const meta = driveGet_(currentId);
    const parents = meta.parents || [];
    if (parents.indexOf(root) >= 0) return true;
    currentId = parents.length ? parents[0] : '';
  }

  return false;
}

function rutaDriveHastaRaiz_(itemId, rootId) {
  const names = [];
  let currentId = String(itemId || '');
  const visited = {};

  for (let i = 0; i < 20 && currentId; i++) {
    if (visited[currentId]) break;
    visited[currentId] = true;

    const meta = driveGet_(currentId);
    names.unshift(meta.name || currentId);

    if (currentId === rootId) break;
    const parents = meta.parents || [];
    currentId = parents.length ? parents[0] : '';
  }

  return names.join(' / ');
}

function buscarCarpetaRegistroFAC078_(registro) {
  const rootId = ID_CARPETA_RAIZ_FAC078;
  const wanted = normalizarRegistro_(registro);
  if (!wanted) return null;

  // Primero se revisan los hijos directos de Estructura.
  const directChildren = listarHijosDrive_(rootId);
  const directMatch = directChildren.find((file) =>
    file.mimeType === MIME_CARPETA && carpetaCoincideRegistro_(file.name, wanted)
  );
  if (directMatch) return directMatch;

  // Respaldo: buscar carpetas por nombre y confirmar que estén bajo Estructura.
  const queryName = escaparQueryDrive_(wanted);
  let pageToken = null;

  do {
    const response = driveList_({
      q: `name contains '${queryName}' and mimeType = '${MIME_CARPETA}' and trashed = false`,
      pageSize: 1000,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken,files(id,name,mimeType,parents,driveId)'
    });

    for (const file of response.files || []) {
      if (!carpetaCoincideRegistro_(file.name, wanted)) continue;
      if (perteneceARaizDrive_(file.id, rootId)) return file;
    }

    pageToken = response.nextPageToken || null;
  } while (pageToken);

  return null;
}

function resolverContextoFAC078_(registro) {
  const rootMeta = driveGet_(ID_CARPETA_RAIZ_FAC078);
  const folder = buscarCarpetaRegistroFAC078_(registro);

  if (!folder) {
    return {
      ok: false,
      registro: normalizarRegistro_(registro),
      rootFolderId: ID_CARPETA_RAIZ_FAC078,
      rootFolderName: rootMeta.name || 'Estructura',
      folderId: '',
      folderName: '',
      folderUrl: '',
      path: `${rootMeta.name || 'Estructura'} / (registro no encontrado)`
    };
  }

  return {
    ok: true,
    registro: normalizarRegistro_(registro),
    rootFolderId: ID_CARPETA_RAIZ_FAC078,
    rootFolderName: rootMeta.name || 'Estructura',
    folderId: folder.id,
    folderName: folder.name,
    folderUrl: urlCarpetaDrive_(folder.id),
    path: rutaDriveHastaRaiz_(folder.id, ID_CARPETA_RAIZ_FAC078)
  };
}

// API pública para el front.
function obtenerContextoFAC078(registro) {
  return resolverContextoFAC078_(registro);
}

function obtenerArchivoDrive_(fileId) {
  const id = normalizarTexto_(fileId);
  if (!id) throw new Error('No se recibió el ID del archivo de Drive.');

  try {
    return driveGet_(id);
  } catch (err) {
    throw new Error('No se pudo leer el archivo seleccionado de Drive. Verifique sus permisos.');
  }
}

function validarMimeAdjunto_(mimeType, name) {
  const mime = normalizarTexto_(mimeType).toLowerCase();
  const filename = normalizarTexto_(name).toLowerCase();
  const isPdf = mime === MIME_PDF || /\.pdf$/i.test(filename);

  if (!isPdf || MIMES_ADJUNTOS_PERMITIDOS.indexOf(MIME_PDF) < 0) {
    throw new Error('Solo se permiten archivos PDF para FAC-078.');
  }
}

function validarArchivoDrive_(fileId, registro, parentId, modoDrive) {
  const meta = obtenerArchivoDrive_(fileId);
  const mode = normalizarTexto_(modoDrive).toUpperCase() || 'ESTRUCTURA';

  if (meta.trashed) throw new Error(`El archivo "${meta.name || fileId}" está en la papelera.`);
  if (meta.mimeType === MIME_CARPETA) throw new Error('No se puede adjuntar una carpeta. Seleccione un archivo.');

  validarMimeAdjunto_(meta.mimeType, meta.name);

  const size = Number(meta.size || 0);
  if (size > MAX_ADJUNTO_BYTES) {
    throw new Error(`El archivo supera el límite de ${MAX_ADJUNTO_BYTES / 1024 / 1024} MB.`);
  }

  const rootId = ID_CARPETA_RAIZ_FAC078;
  let allowedParent = parentId || rootId;

  if (mode !== 'MI_DRIVE') {
    if (!perteneceARaizDrive_(allowedParent, rootId)) {
      throw new Error('La carpeta de consulta no pertenece a la estructura FAC-078 autorizada.');
    }

    if (!perteneceARaizDrive_(meta.id, allowedParent)) {
      throw new Error('El archivo seleccionado no pertenece al expediente o estructura FAC-078 autorizada.');
    }
  } else {
    // En la ruta Mi Drive se permite cualquier PDF que el usuario pueda leer.
    // Drive.Files.get() ya confirmó que el archivo es accesible para el usuario.
    allowedParent = '';
  }

  return {
    id: meta.id,
    name: meta.name || 'documento.pdf',
    mimeType: meta.mimeType || MIME_PDF,
    size: size,
    modifiedTime: meta.modifiedTime || '',
    url: meta.webViewLink || urlArchivoDrive_(meta.id),
    sourceFolderId: allowedParent,
    driveMode: mode
  };
}

// API pública llamada cuando el usuario selecciona un documento en Picker.
function validarArchivoDrive(fileId, registro, modoDrive) {
  const mode = normalizarTexto_(modoDrive).toUpperCase() || 'ESTRUCTURA';
  if (mode === 'MI_DRIVE') return validarArchivoDrive_(fileId, registro, '', mode);

  const context = resolverContextoFAC078_(registro);
  const parentId = context.folderId || context.rootFolderId;
  return validarArchivoDrive_(fileId, registro, parentId, mode);
}

/* ===============================
 * GOOGLE PICKER
 * =============================== */

function obtenerConfigPicker_() {
  const props = PropertiesService.getScriptProperties();
  const developerKey = normalizarTexto_(props.getProperty(PROP_PICKER_API_KEY));
  const cloudProjectNumber = normalizarTexto_(props.getProperty(PROP_CLOUD_PROJECT_NUMBER));

  if (!developerKey) {
    throw new Error(`Falta la propiedad ${PROP_PICKER_API_KEY} en Project Settings > Script properties.`);
  }

  if (!cloudProjectNumber) {
    throw new Error(`Falta la propiedad ${PROP_CLOUD_PROJECT_NUMBER} en Project Settings > Script properties.`);
  }

  return { developerKey, cloudProjectNumber };
}

// Devuelve toda la información necesaria en una sola llamada al front.
// El token se utiliza inmediatamente para abrir Picker y no se almacena.
function obtenerBootstrapPicker(registro, modoDrive) {
  const config = obtenerConfigPicker_();
  const mode = normalizarTexto_(modoDrive).toUpperCase() || 'ESTRUCTURA';
  const context = mode === 'MI_DRIVE'
    ? {
        ok: true,
        rootFolderId: ID_CARPETA_RAIZ_FAC078,
        folderId: '',
        path: 'Mi Drive'
      }
    : resolverContextoFAC078_(registro);

  return {
    oauthToken: ScriptApp.getOAuthToken(),
    developerKey: config.developerKey,
    cloudProjectNumber: config.cloudProjectNumber,
    rootFolderId: context.rootFolderId,
    parentFolderId: context.folderId || (mode === 'MI_DRIVE' ? '' : context.rootFolderId),
    driveMode: mode,
    contextFound: context.ok,
    contextPath: context.path,
    contextFolderUrl: context.folderUrl || urlCarpetaDrive_(context.rootFolderId)
  };
}

// Función para ejecutar manualmente desde el editor y provocar autorización.
function probarConfiguracionPicker() {
  const config = obtenerConfigPicker_();
  const root = driveGet_(ID_CARPETA_RAIZ_FAC078);

  return {
    ok: true,
    cloudProjectNumber: config.cloudProjectNumber,
    rootFolderId: root.id,
    rootFolderName: root.name,
    rootFolderUrl: urlCarpetaDrive_(root.id),
    message: 'Picker y Drive están configurados. La API Key no se muestra en el resultado.'
  };
}

/* ===============================
 * DOCUMENTO Y PLANTILLA
 * =============================== */

function getContentWidthPts_(docId) {
  try {
    const meta = Docs.Documents.get(docId);
    const style = meta.documentStyle || {};
    const width = style.pageSize && style.pageSize.width
      ? style.pageSize.width.magnitude
      : 612;
    const marginLeft = style.marginLeft ? style.marginLeft.magnitude : 72;
    const marginRight = style.marginRight ? style.marginRight.magnitude : 72;
    return width - marginLeft - marginRight;
  } catch (err) {
    return 468;
  }
}

function insertJustifiedTextAtMarker_(body, markerRegex, rawText) {
  const found = body.findText(markerRegex);
  if (!found) return;

  const paragraph = found.getElement().getParent();
  const parent = paragraph.getParent();
  const index = parent.getChildIndex(paragraph);

  // Google Docs no permite eliminar el último párrafo de una sección.
  // Si el marcador está al final, agregamos primero un párrafo de seguridad.
  if (index === parent.getNumChildren() - 1 && typeof parent.appendParagraph === 'function') {
    parent.appendParagraph('');
  }

  paragraph.removeFromParent();

  const blocks = String(rawText || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((item) => item.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  let cursor = index;
  blocks.forEach((block) => {
    const para = body.insertParagraph(cursor++, block);
    para.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
  });
}

function insertRichHtmlAtMarker_(body, markerRegex, html, docId) {
  const found = body.findText(markerRegex);
  if (!found) return false;

  const paragraph = found.getElement().getParent();
  const parent = paragraph.getParent();
  let index = parent.getChildIndex(paragraph);

  // Google Docs no permite eliminar el último párrafo de una sección.
  // Si el marcador está al final, agregamos primero un párrafo de seguridad.
  if (index === parent.getNumChildren() - 1 && typeof parent.appendParagraph === 'function') {
    parent.appendParagraph('');
  }

  paragraph.removeFromParent();

  const maxWidth = getContentWidthPts_(docId) * 0.97;
  const parts = String(html || '').split(
    /(<table[\s\S]*?<\/table>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<img[^>]*>)/ig
  );

  for (let part of parts) {
    if (!part) continue;

    if (/^<table/i.test(part)) {
      const rows = [...part.matchAll(/<tr[\s\S]*?<\/tr>/ig)].map((m) => m[0]);
      const table = body.insertTable(index++, []);
      table.setBorderWidth(0.5);

      rows.forEach((rowHtml) => {
        const row = table.appendTableRow();
        const cells = [...rowHtml.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/ig)]
          .map((m) => m[2]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s*\n\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim());

        if (!cells.length) row.appendTableCell('');
        cells.forEach((cell) => row.appendTableCell(cell));
      });
      continue;
    }

    if (/^<ul/i.test(part) || /^<ol/i.test(part)) {
      const ordered = /^<ol/i.test(part);
      const items = [...part.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/ig)]
        .map((m) => m[1]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim());

      items.forEach((text) => {
        const item = body.insertListItem(index++, text);
        item.setGlyphType(
          ordered ? DocumentApp.GlyphType.NUMBER : DocumentApp.GlyphType.BULLET
        );
      });
      continue;
    }

    if (/^<img/i.test(part)) {
      const match = part.match(/src=["']([^"']+)["']/i);
      if (match) {
        const src = match[1];
        let blob = null;

        if (/^data:image\//i.test(src)) {
          const dataMatch = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (dataMatch) {
            blob = Utilities.newBlob(
              Utilities.base64Decode(dataMatch[2]),
              dataMatch[1],
              'img'
            );
          }
        } else {
          try {
            const response = UrlFetchApp.fetch(src);
            const headers = response.getHeaders();
            const contentType = headers['Content-Type'] || 'image/png';
            blob = Utilities.newBlob(response.getContent(), contentType, 'img');
          } catch (err) {
            blob = null;
          }
        }

        const para = body.insertParagraph(index++, '');
        if (blob) {
          const image = para.appendInlineImage(blob);
          try {
            if (image.getWidth() > maxWidth) {
              const scale = maxWidth / image.getWidth();
              image.setWidth(Math.round(image.getWidth() * scale));
              image.setHeight(Math.round(image.getHeight() * scale));
            }
          } catch (err) {
            // Mantener la imagen si el tamaño no puede ajustarse.
          }
          para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        }
      }
      continue;
    }

    part = part
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
      .replace(/<\/(li)>/gi, '\n')
      .replace(/<\/(ul|ol)>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ');

    const blocks = part
      .replace(/\r/g, '')
      .split(/\n{2,}/)
      .map((item) => item.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
      .filter(Boolean);

    blocks.forEach((block) => {
      const para = body.insertParagraph(index++, block);
      para.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
    });
  }

  return true;
}

/* ===============================
 * ADJUNTOS
 * =============================== */

function asegurarHojaAdjuntos_() {
  const ss = SpreadsheetApp.openById(ID_HOJA_CORRESP);
  let sh = ss.getSheetByName(NOMBRE_HOJA_ADJUNTOS);

  const headers = [
    'Timestamp', 'Código correspondencia', 'Registro', 'Año', 'Fuente',
    'ID original Drive', 'ID guardado', 'Nombre', 'MIME', 'Tamaño bytes',
    'URL original', 'URL oficial', 'Carpeta destino', 'Usuario', 'Estado',
    'Mensaje'
  ];

  if (!sh) {
    sh = ss.insertSheet(NOMBRE_HOJA_ADJUNTOS);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }

  return sh;
}

function obtenerCarpetaAdjuntos_(codigo) {
  const root = ID_CARPETA_PDFS
    ? DriveApp.getFolderById(ID_CARPETA_PDFS)
    : DriveApp.getRootFolder();

  const name = `Adjuntos - ${nombreSeguroArchivo_(codigo)}`;
  const existing = root.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : root.createFolder(name);
}

function validarEntradaLocal_(adjunto) {
  const name = nombreSeguroArchivo_(adjunto.nombre || adjunto.name || 'documento.pdf');
  const content = String(adjunto.contenidoBase64 || adjunto.contenido || '').trim();
  const mime = String(adjunto.mimeType || MIME_PDF).toLowerCase();

  if (!content) throw new Error(`El archivo "${name}" no contiene datos.`);
  validarMimeAdjunto_(mime, name);

  let bytes;
  try {
    bytes = Utilities.base64Decode(content);
  } catch (err) {
    throw new Error(`No se pudo leer el contenido del archivo "${name}".`);
  }

  if (bytes.length > MAX_ADJUNTO_BYTES) {
    throw new Error(`El archivo "${name}" supera el límite de ${MAX_ADJUNTO_BYTES / 1024 / 1024} MB.`);
  }

  return { name, mimeType: MIME_PDF, content, bytes };
}

function guardarAdjuntosEnCarpeta_(adjuntos, codigo, registro, targetFolder) {
  if (!Array.isArray(adjuntos) || !adjuntos.length) {
    return {
      folderId: '',
      folderUrl: '',
      attachments: [],
      createdFileIds: []
    };
  }

  const folder = targetFolder || obtenerCarpetaAdjuntos_(codigo);
  const output = [];
  const createdFileIds = [];
  const unique = {};

  for (const raw of adjuntos) {
    const source = normalizarTexto_(raw && raw.source).toUpperCase() || 'LOCAL';

    if (source === 'DRIVE') {
      const sourceId = normalizarTexto_(raw.fileId || raw.id);
      if (!sourceId || unique[`DRIVE:${sourceId}`]) continue;

      const driveMode = normalizarTexto_(raw.driveMode).toUpperCase() || 'ESTRUCTURA';
      const context = driveMode === 'MI_DRIVE'
        ? null
        : resolverContextoFAC078_(registro);
      const allowedParent = context ? (context.folderId || context.rootFolderId) : '';
      const meta = validarArchivoDrive_(sourceId, registro, allowedParent, driveMode);
      const sourceFile = DriveApp.getFileById(meta.id);
      const copy = sourceFile.makeCopy(nombreSeguroArchivo_(meta.name), folder);
      const storedId = copy.getId();

      unique[`DRIVE:${sourceId}`] = true;
      createdFileIds.push(storedId);
      output.push({
        source: 'DRIVE',
        sourceId: meta.id,
        storedId,
        name: meta.name,
        mimeType: meta.mimeType,
        size: meta.size || copy.getSize(),
        sourceUrl: meta.url,
        storedUrl: copy.getUrl(),
        folderId: folder.getId(),
        driveMode
      });
      continue;
    }

    const local = validarEntradaLocal_(raw || {});
    const localKey = `LOCAL:${local.name}:${local.bytes.length}`;
    if (unique[localKey]) continue;

    const blob = Utilities.newBlob(local.bytes, local.mimeType, local.name);
    const file = folder.createFile(blob);
    const storedId = file.getId();

    unique[localKey] = true;
    createdFileIds.push(storedId);
    output.push({
      source: 'LOCAL',
      sourceId: '',
      storedId,
      name: local.name,
      mimeType: local.mimeType,
      size: local.bytes.length,
      sourceUrl: '',
      storedUrl: file.getUrl(),
      folderId: folder.getId()
    });
  }

  return {
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    attachments: output,
    createdFileIds
  };
}

function registrarAdjuntos_(items, codigo, registro, anio, folderId) {
  if (!Array.isArray(items) || !items.length) return;

  const sh = asegurarHojaAdjuntos_();
  const user = Session.getActiveUser().getEmail() || '';
  const rows = items.map((item) => [
    ahoraGT_(),
    codigo || '',
    registro || '',
    anio || '',
    item.source || '',
    item.sourceId || '',
    item.storedId || '',
    item.name || '',
    item.mimeType || '',
    Number(item.size || 0),
    item.sourceUrl || '',
    item.storedUrl || '',
    folderId || item.folderId || '',
    user,
    'GUARDADO',
    ''
  ]);

  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function enviarAPapelera_(fileIds) {
  (fileIds || []).forEach((id) => {
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (err) {
      // No interrumpir la limpieza de los demás archivos.
    }
  });
}

// API de compatibilidad con la versión anterior.
function guardarArchivosCartaMantenimiento(archivos, codigo) {
  const normalized = (archivos || []).map((item) => ({
    source: 'LOCAL',
    nombre: item.nombre || item.name,
    contenido: item.contenido || item.contenidoBase64,
    mimeType: item.mimeType || MIME_PDF
  }));

  return guardarAdjuntosEnCarpeta_(normalized, codigo, '', null);
}

/* ===============================
 * GENERACIÓN DE CARTA
 * =============================== */

function generarDocumentoCartaMantenimientoCore_(registro, anioEvaluacion, codigo, extra) {
  const data = extra || {};
  const carpetaDestino = ID_CARPETA_PDFS
    ? DriveApp.getFolderById(ID_CARPETA_PDFS)
    : DriveApp.getRootFolder();

  const nombreOEC = normalizarTexto_(data.nombreOEC);
  const pais = normalizarTexto_(data.pais) || 'Guatemala, Guatemala';
  const draft = String(data.draft || '');
  const htmlDraft = String(data.htmlDraft || '');

  const doc = DocumentApp.create(`Carta MTO - ${codigo}`);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph(`Código: ${codigo}`).setBold(true);
  body.appendParagraph(`Fecha: ${fechaLargaGT_()}`);
  body.appendParagraph(`Registro de Acreditación: ${registro || '—'}`);
  if (nombreOEC) body.appendParagraph(`Nombre del OEC: ${nombreOEC}`);
  body.appendParagraph(`Año de evaluación: ${anioEvaluacion || '—'}`);
  body.appendParagraph(`País: ${pais}`);
  body.appendParagraph('');

  // ==========================================================
  // REDACCIÓN DE LA CARTA
  // ==========================================================
  // Se crea un marcador temporal para reutilizar el mismo motor
  // de inserción del editor de correspondencia. De esta forma se
  // conservan párrafos, saltos, listas, tablas e imágenes.
  const marcadorMTO = '{CUERPO_MTO_TEMP}';
  body.appendParagraph(marcadorMTO);

  const tieneHtmlUtil = htmlDraft && /<(img|table|ul|ol|br|p|div|b|strong|i|em|u|span)[\s>]/i.test(htmlDraft);

  if (tieneHtmlUtil) {
    insertRichHtmlAtMarker_(
      body,
      '\\{CUERPO_MTO_TEMP\\}',
      htmlDraft,
      doc.getId()
    );
  } else if (draft.trim()) {
    insertJustifiedTextAtMarker_(
      body,
      '\\{CUERPO_MTO_TEMP\\}',
      draft
    );
  } else {
    // No dejar el marcador visible si el usuario no redactó texto.
    body.replaceText('\\{CUERPO_MTO_TEMP\\}', '');
  }

  if (data.attachmentCount) {
    body.appendParagraph('');
    body.appendParagraph(`Documentos adjuntos: ${data.attachmentCount}`);
    if (data.attachmentsFolderUrl) {
      body.appendParagraph(data.attachmentsFolderUrl);
    }
  }

  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  carpetaDestino.addFile(file);

  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // En unidades compartidas puede no ser necesario quitarlo del root.
  }

  const sh = getHoja_(ID_HOJA_CORRESP, NOMBRE_HOJA_CORRESP);
  const match = String(codigo || '').match(/-(\d{4})\/S$/);
  const numeral = match ? match[1] : '';
  const row = [];

  row[0] = codigo;
  row[1] = numeral;
  row[2] = ahoraGT_();
  row[3] = ''; // contacto/destinatario no aplica aquí
  row[4] = nombreOEC;
  row[5] = nombreOEC;
  row[6] = Session.getActiveUser().getEmail() || '';
  row[7] = `https://docs.google.com/document/d/${doc.getId()}`;
  row[8] = data.attachmentsFolderUrl || '';
  row[9] = data.attachmentCount ? `${data.attachmentCount} adjunto(s)` : '';
  row[10] = 'Carta de mantenimiento (MTO)';
  sh.appendRow(row);

  return {
    ok: true,
    docId: doc.getId(),
    docUrl: `https://docs.google.com/document/d/${doc.getId()}`,
    folderUrl: carpetaDestino.getUrl(),
    attachmentsFolderUrl: data.attachmentsFolderUrl || '',
    attachmentCount: Number(data.attachmentCount || 0),
    redaccionGuardada: Boolean(draft.trim() || htmlDraft.replace(/<[^>]*>/g, '').trim()),
    caracteresRedaccion: draft.length
  };
}

function crearCartaMantenimientoConAdjuntos(payload) {
  const data = payload || {};
  const registro = normalizarRegistro_(data.registro);
  const anio = normalizarTexto_(data.anio);
  const sinNC = Boolean(data.sinNC);
  const adjuntos = Array.isArray(data.adjuntos) ? data.adjuntos : [];

  if (!registro || !anio) throw new Error('Registro y año son obligatorios.');
  if (!sinNC && !adjuntos.length) {
    throw new Error('Debe agregar por lo menos un PDF o marcar "Sin NC".');
  }
  if (sinNC && adjuntos.length) {
    throw new Error('No se pueden enviar adjuntos cuando se marcó "Sin NC".');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let saved = null;
  let documentResult = null;

  try {
    const codigo = /^OGA-CAD-\d{4}-\d{4}\/S$/i.test(String(data.codigo || ''))
      ? String(data.codigo).trim()
      : getSiguienteCodigoCorrespondencia_();

    const targetFolder = adjuntos.length ? obtenerCarpetaAdjuntos_(codigo) : null;
    saved = guardarAdjuntosEnCarpeta_(adjuntos, codigo, registro, targetFolder);

    documentResult = generarDocumentoCartaMantenimientoCore_(
      registro,
      anio,
      codigo,
      {
        attachmentCount: saved.attachments.length,
        attachmentsFolderUrl: saved.folderUrl,
        nombreOEC: data.nombreOEC || '',
        pais: data.pais || 'Guatemala, Guatemala',
        draft: data.draft || '',
        htmlDraft: data.htmlDraft || ''
      }
    );

    registrarAdjuntos_(saved.attachments, codigo, registro, anio, saved.folderId);
    registrarEstadoNCEnEgreso(codigo, sinNC);

    return Object.assign({}, documentResult, {
      codigo,
      registro,
      anio,
      sinNC,
      attachments: saved.attachments
    });
  } catch (err) {
    if (saved && saved.createdFileIds) enviarAPapelera_(saved.createdFileIds);
    if (documentResult && documentResult.docId) enviarAPapelera_([documentResult.docId]);
    throw new Error(err && err.message ? err.message : String(err));
  } finally {
    lock.releaseLock();
  }
}

// API anterior: se conserva para no romper otros módulos.
function generarDocumentoCartaMantenimiento(registro, anioEvaluacion, codigo, extra) {
  return generarDocumentoCartaMantenimientoCore_(registro, anioEvaluacion, codigo, extra || null);
}

function registrarEstadoNCEnEgreso(_codigo, _sinNC) {
  // Punto de extensión para la hoja de seguimiento de NC.
  return true;
}

/* ===============================
 * GENERACIÓN DE CORRESPONDENCIA OEC / GENERAL
 * =============================== */

function generarCorrespondencia(payload) {
  const data = payload || {};
  const usuario = Session.getActiveUser().getEmail() || data.usuario || '';
  const codigo = getSiguienteCodigoCorrespondencia_();
  const timestamp = ahoraGT_();

  let destinatario = '';
  let lugarTrabajo = '';
  let registroAcred = '';
  let tituloParaPlantilla = '';
  let puestoTrabajo = '';
  const pais = data.pais || 'Guatemala';
  const draft = data.draft || '';
  const htmlDraft = data.htmlDraft || '';
  const asunto = data.asunto || '';

  let nombreComercialRegistro = '';
  let razonSocialRegistro = '';

  if (data.tipo === 'OEC') {
    const reg = normalizarRegistro_(data.registro);
    const oec = buscarOECporRegistro_(reg);
    if (!oec) throw new Error(`No se encontró el OEC con registro: ${reg}`);

    registroAcred = oec.registro || reg;
    destinatario = oec.contacto1 || '';
    lugarTrabajo = oec.razonSocial || '';
    puestoTrabajo = oec.puestoTrabajo || '';
    tituloParaPlantilla = oec.tituloProfesional || honorificoDesdeNombre_(destinatario);
    nombreComercialRegistro = oec.nombreComercial || '';
    razonSocialRegistro = oec.razonSocial || '';
  } else {
    destinatario = data.destinatario || '';
    lugarTrabajo = data.lugarTrabajo || '';
    puestoTrabajo = data.puestoTrabajo || '';
    tituloParaPlantilla = data.tituloProfesional || honorificoDesdeNombre_(destinatario);
    razonSocialRegistro = lugarTrabajo;
  }

  const carpetaDestino = ID_CARPETA_PDFS
    ? DriveApp.getFolderById(ID_CARPETA_PDFS)
    : DriveApp.getRootFolder();

  const copiaFile = DriveApp.getFileById(ID_PLANTILLA_CORRESP)
    .makeCopy(`Carta - ${codigo}`, carpetaDestino);
  const docId = copiaFile.getId();
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  body.replaceText('\\{Codificación\\}', codigo);
  body.replaceText('\\{Fecha\\}', fechaLargaGT_());
  body.replaceText('\\{Título\\}', tituloParaPlantilla);
  body.replaceText('\\{Destinatario\\}', destinatario);
  body.replaceText('\\{Lugar trabajo\\}', lugarTrabajo);
  body.replaceText('\\{País\\}', pais);
  body.replaceText('\\{puesto de trabajo\\}', puestoTrabajo);

  const usedRich = htmlDraft && /<(img|table|ul|ol|br|p|div)/i.test(htmlDraft);
  if (usedRich) {
    insertRichHtmlAtMarker_(body, '\\{cuadro texto\\}', htmlDraft, doc.getId());
  } else {
    insertJustifiedTextAtMarker_(body, '\\{cuadro texto\\}', draft);
  }

  doc.saveAndClose();

  const sh = getHoja_(ID_HOJA_CORRESP, NOMBRE_HOJA_CORRESP);
  const match = codigo.match(/-(\d{4})\/S$/);
  const numeral = match ? match[1] : '';
  const urlDoc = `https://docs.google.com/document/d/${docId}`;
  const row = [];

  row[0] = codigo;
  row[1] = numeral;
  row[2] = timestamp;
  row[3] = destinatario;
  row[4] = nombreComercialRegistro;
  row[5] = razonSocialRegistro;
  row[6] = usuario;
  row[7] = urlDoc;
  row[8] = '';
  row[9] = '';
  row[10] = asunto;
  sh.appendRow(row);

  return {
    ok: true,
    codigo,
    docId,
    urlDoc,
    folderUrl: carpetaDestino.getUrl(),
    registroAcred
  };
}

/* ===============================
 * APIS UTILIZADAS POR EL FRONT
 * =============================== */

function getSugerenciasRedaccion(texto) {
  return sugerenciasRedaccion(texto);
}

function getOECInfo(registro) {
  return buscarOECporRegistro_(registro);
}

function generarCodigoCorrespondencia(_registro, _destinatario, _puesto, _anioEvaluacion) {
  return getSiguienteCodigoCorrespondencia_();
}

function buscarDatosOEC_Presupuesto(registro) {
  const info = buscarOECporRegistro_(registro);
  if (!info) return null;

  let context = null;
  try {
    context = resolverContextoFAC078_(registro);
  } catch (err) {
    context = {
      ok: false,
      rootFolderId: ID_CARPETA_RAIZ_FAC078,
      rootFolderName: 'Estructura',
      folderId: '',
      folderName: '',
      folderUrl: '',
      path: 'No fue posible resolver la carpeta FAC-078'
    };
  }

  return {
    razon: info.razonSocial || info.nombreComercial || '',
    representante: info.representante || info.contacto1 || '',
    fac078FolderId: context ? context.folderId : '',
    fac078FolderUrl: context ? context.folderUrl : '',
    fac078RootId: context ? context.rootFolderId : ID_CARPETA_RAIZ_FAC078,
    fac078Path: context ? context.path : '',
    fac078ContextFound: Boolean(context && context.ok)
  };
}

/* ===============================
 * PRUEBA PICKER PARA APPWEB
 * =============================== */
/**
 * Prueba ligera para la AppWeb. No devuelve la API Key.
 */
function probarPickerAppWeb(registro, modoDrive) {
  const mode = normalizarTexto_(modoDrive).toUpperCase() === 'MI_DRIVE'
    ? 'MI_DRIVE'
    : 'ESTRUCTURA';

  const cfg = obtenerConfigPicker_();
  const token = ScriptApp.getOAuthToken();

  if (!token) {
    throw new Error('No fue posible obtener el token OAuth para Google Picker.');
  }

  let context = {
    ok: true,
    rootFolderId: ID_CARPETA_RAIZ_FAC078,
    folderId: '',
    path: 'Mi Drive'
  };

  if (mode === 'ESTRUCTURA') {
    const reg = normalizarRegistro_(registro);
    if (!reg) {
      throw new Error('Para probar Estructura FAC-078 debe indicar un registro.');
    }
    context = resolverContextoFAC078_(reg);
  }

  return {
    ok: true,
    modo: mode,
    pickerApiKeyConfigurada: Boolean(cfg.developerKey),
    cloudProjectNumber: cfg.cloudProjectNumber,
    oauthTokenDisponible: Boolean(token),
    contextoEncontrado: Boolean(context.ok),
    parentFolderId: context.folderId || (mode === 'MI_DRIVE' ? '' : context.rootFolderId),
    ruta: context.path || ''
  };
}


/**
 * Verifica las propiedades creadas.
 */
function verificarPropiedadesPicker() {
  const propiedades = PropertiesService.getScriptProperties();

  const apiKey = propiedades.getProperty(
    'GOOGLE_PICKER_API_KEY'
  ) || '';

  const projectNumber = propiedades.getProperty(
    'CLOUD_PROJECT_NUMBER'
  ) || '';

  const apiKeyOculta = apiKey
    ? apiKey.substring(0, 4) +
      '********' +
      apiKey.substring(apiKey.length - 4)
    : 'NO CONFIGURADA';

  const resultado = {
    ok: Boolean(apiKey && /^\d+$/.test(projectNumber)),
    apiKey: apiKeyOculta,
    projectNumber: projectNumber || 'NO CONFIGURADO'
  };

  Logger.log(JSON.stringify(resultado, null, 2));

  return resultado;
}

/* ===============================
 * DIAGNÓSTICO INTEGRAL DEL MÓDULO
 * =============================== */
function probarConfiguracionCorrespondenciaCompleta() {
  const resultado = {
    ok: true,
    fecha: ahoraGT_(),
    propiedades: {},
    servicios: {},
    recursos: {},
    errores: []
  };

  const registrarError = (bloque, err) => {
    resultado.ok = false;
    const mensaje = err && err.message ? err.message : String(err);
    resultado.errores.push(`${bloque}: ${mensaje}`);
  };

  try {
    const cfg = obtenerConfigPicker_();
    resultado.propiedades.GOOGLE_PICKER_API_KEY = cfg.developerKey
      ? `${cfg.developerKey.slice(0, 4)}********${cfg.developerKey.slice(-4)}`
      : 'NO CONFIGURADA';
    resultado.propiedades.CLOUD_PROJECT_NUMBER = cfg.cloudProjectNumber || 'NO CONFIGURADO';
  } catch (err) {
    registrarError('Script Properties', err);
  }

  try {
    if (typeof Drive === 'undefined' || !Drive.Files) {
      throw new Error('Servicio avanzado Drive v3 no disponible.');
    }
    const root = driveGet_(ID_CARPETA_RAIZ_FAC078);
    resultado.servicios.driveV3 = true;
    resultado.recursos.fac078 = {
      id: root.id,
      nombre: root.name,
      url: urlCarpetaDrive_(root.id)
    };
  } catch (err) {
    resultado.servicios.driveV3 = false;
    registrarError('Drive/FAC-078', err);
  }

  try {
    if (typeof Docs === 'undefined' || !Docs.Documents) {
      throw new Error('Servicio avanzado Google Docs v1 no disponible.');
    }
    const meta = Docs.Documents.get(ID_PLANTILLA_CORRESP);
    resultado.servicios.docsV1 = true;
    resultado.recursos.plantilla = {
      id: ID_PLANTILLA_CORRESP,
      titulo: meta.title || ''
    };
  } catch (err) {
    resultado.servicios.docsV1 = false;
    registrarError('Docs/Plantilla', err);
  }

  try {
    const sh = getHoja_(ID_HOJA_CORRESP, NOMBRE_HOJA_CORRESP);
    resultado.recursos.hojaCorrespondencia = `${sh.getParent().getName()} / ${sh.getName()}`;
  } catch (err) {
    registrarError('Hoja de correspondencia', err);
  }

  try {
    const sh = getHoja_(ID_BASE_OEC3, NOMBRE_HOJA_OEC3);
    resultado.recursos.baseOEC = `${sh.getParent().getName()} / ${sh.getName()}`;
  } catch (err) {
    registrarError('Base OEC', err);
  }

  try {
    const folder = DriveApp.getFolderById(ID_CARPETA_PDFS);
    resultado.recursos.carpetaDestino = {
      id: folder.getId(),
      nombre: folder.getName(),
      url: folder.getUrl()
    };
  } catch (err) {
    registrarError('Carpeta destino', err);
  }

  try {
    const token = ScriptApp.getOAuthToken();
    resultado.servicios.oauthToken = Boolean(token);
    if (!token) throw new Error('No se pudo obtener token OAuth.');
  } catch (err) {
    resultado.servicios.oauthToken = false;
    registrarError('OAuth', err);
  }

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


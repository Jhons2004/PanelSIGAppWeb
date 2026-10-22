
/***** CONFIG *****/
const ID_BASE_OEC2 = '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc';
const HOJA_OEC2    = 'Respuestas de formulario 1';
const HOJA_INST2   = 'Instalaciones';

/***** HELPERS BASE *****/
function _consultaOEC_openBase_() {
  return SpreadsheetApp.openById(ID_BASE_OEC2);
}

function _consultaOEC_getSheet_(name) {
  const sh = _consultaOEC_openBase_().getSheetByName(name);
  if (!sh) throw new Error('No se encontró la hoja "' + name + '".');
  return sh;
}

function _consultaOEC_normLower_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function _consultaOEC_normUpper_(s) {
  return String(s || '')
    .replace(/\u2010|\u2011|\u2012|\u2013|\u2014/g, '-')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function _consultaOEC_formatDateGT_(value, pattern) {
  const d = _consultaOEC_toDate_(value);
  if (!d) return String(value || '');
  return Utilities.formatDate(d, 'America/Guatemala', pattern || 'yyyy-MM-dd HH:mm');
}

function _consultaOEC_toDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  if (typeof value === 'number' && !isNaN(value)) {
    try {
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      return isNaN(d) ? null : d;
    } catch (e) {
      return null;
    }
  }

  const s = String(value || '').trim();
  if (!s) return null;

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function _consultaOEC_text_(v) {
  return String(v == null ? '' : v).trim();
}

function _consultaOEC_hasContent_(v) {
  return _consultaOEC_text_(v) !== '';
}

function _consultaOEC_findHeaderIndex_(headersNorm, patterns) {
  const pats = (patterns || []).map(_consultaOEC_normLower_);

  for (let i = 0; i < headersNorm.length; i++) {
    if (pats.indexOf(headersNorm[i]) !== -1) return i;
  }
  for (let i = 0; i < headersNorm.length; i++) {
    const h = headersNorm[i];
    if (pats.some(function(p){ return h.indexOf(p) !== -1; })) return i;
  }
  return -1;
}

function _consultaOEC_headerSummary_(headers) {
  return (headers || []).map(function(h, idx){
    return (idx + 1) + ': ' + String(h || '');
  });
}

/***** MAPEO HOJA PRINCIPAL *****/
function _consultaOEC_getGeneralIndexes_(headers) {
  const H = headers.map(_consultaOEC_normLower_);
  const idx = {};

  idx.marcaTemporal = _consultaOEC_findHeaderIndex_(H, [
    'marca temporal', 'timestamp', 'fecha ingreso', 'fecha de registro'
  ]);

  idx.registro = _consultaOEC_findHeaderIndex_(H, [
    'registro de acreditacion', 'registro de acreditación', 'registro oec', 'registro', 'oec_id', 'oec id', 'oecid'
  ]);

  idx.nit = H.findIndex(function(h){
    return h.indexOf('nit') !== -1 && h.indexOf('no usar') !== -1;
  });
  if (idx.nit < 0) {
    idx.nit = _consultaOEC_findHeaderIndex_(H, ['nit']);
  }

  idx.razon = _consultaOEC_findHeaderIndex_(H, ['razon social', 'razón social']);
  idx.nombreCom = _consultaOEC_findHeaderIndex_(H, ['nombre comercial', 'nombre comercial del oec']);
  idx.norma = _consultaOEC_findHeaderIndex_(H, ['norma acreditada', 'norma', 'norma de referencia', 'norma evaluada']);
  idx.esquema = _consultaOEC_findHeaderIndex_(H, ['esquema de acreditacion', 'esquema de acreditación', 'esquema']);
  idx.pais = _consultaOEC_findHeaderIndex_(H, ['pais', 'país']);
  idx.repLegal = _consultaOEC_findHeaderIndex_(H, ['representante legal', 'representante']);

  idx.c1Nombre = _consultaOEC_findHeaderIndex_(H, [
    '1 nombres y apellidos', 'contacto 1 nombres y apellidos', 'contacto 1 nombre', 'nombre contacto 1'
  ]);
  idx.c1Email = idx.c1Nombre >= 0 ? idx.c1Nombre + 1 : _consultaOEC_findHeaderIndex_(H, ['email contacto 1', 'correo contacto 1', '1 correo electronico']);
  idx.c1Tel = idx.c1Nombre >= 0 ? idx.c1Nombre + 2 : _consultaOEC_findHeaderIndex_(H, ['telefono contacto 1', 'tel contacto 1', '1 telefono']);
  idx.c1Cargo = idx.c1Nombre >= 0 ? idx.c1Nombre + 3 : _consultaOEC_findHeaderIndex_(H, ['cargo contacto 1', 'puesto contacto 1', '1 puesto']);
  idx.c1Titulo = _consultaOEC_findHeaderIndex_(H, ['titulo contacto 1', 'título contacto 1', 'titulo profesional contacto 1']);

  idx.c2Nombre = _consultaOEC_findHeaderIndex_(H, [
    '2 nombres y apellidos', 'contacto 2 nombres y apellidos', 'contacto 2 nombre', 'nombre contacto 2'
  ]);
  idx.c2Email = idx.c2Nombre >= 0 ? idx.c2Nombre + 1 : _consultaOEC_findHeaderIndex_(H, ['email contacto 2', 'correo contacto 2', '2 correo electronico']);
  idx.c2Tel = idx.c2Nombre >= 0 ? idx.c2Nombre + 2 : _consultaOEC_findHeaderIndex_(H, ['telefono contacto 2', 'tel contacto 2', '2 telefono']);
  idx.c2Cargo = idx.c2Nombre >= 0 ? idx.c2Nombre + 3 : _consultaOEC_findHeaderIndex_(H, ['cargo contacto 2', 'puesto contacto 2', '2 puesto']);
  idx.c2Titulo = _consultaOEC_findHeaderIndex_(H, ['titulo contacto 2', 'título contacto 2', 'titulo profesional contacto 2']);

  if (idx.c1Titulo < 0 && idx.c1Nombre >= 0) {
    for (let i = idx.c1Nombre; i < Math.min(H.length, idx.c1Nombre + 8); i++) {
      if (H[i].indexOf('titulo') !== -1 || H[i].indexOf('título') !== -1) {
        idx.c1Titulo = i;
        break;
      }
    }
  }

  if (idx.c2Titulo < 0 && idx.c2Nombre >= 0) {
    for (let i = idx.c2Nombre; i < Math.min(H.length, idx.c2Nombre + 8); i++) {
      if (H[i].indexOf('titulo') !== -1 || H[i].indexOf('título') !== -1) {
        idx.c2Titulo = i;
        break;
      }
    }
  }

  return idx;
}

/***** MAPEO HOJA INSTALACIONES *****/
function _consultaOEC_getInstIndexes_(headers) {
  const H = headers.map(_consultaOEC_normLower_);
  const idx = {};

  idx.registro = _consultaOEC_findHeaderIndex_(H, [
    'registro de acreditacion', 'registro de acreditación', 'registro oec', 'registro', 'num registro', 'numero registro', 'codigo'
  ]);

  idx.nombre = _consultaOEC_findHeaderIndex_(H, [
    'nombre de instalaciones', 'nombre de instalaciónes', 'nombre instalaciones',
    'nombre de la instalacion', 'nombre de la instalación', 'nombre instalacion',
    'nombre instalación', 'instalacion', 'instalación', 'nombre'
  ]);

  idx.direccion = _consultaOEC_findHeaderIndex_(H, [
    'direccion de la instalacion', 'dirección de la instalación', 'direccion de instalacion',
    'direccion', 'dirección', 'ubicacion', 'ubicación', 'sitio', 'sitio acreditado'
  ]);

  idx.desde = _consultaOEC_findHeaderIndex_(H, [
    'acreditado desde', 'fecha acreditacion', 'fecha acreditación', 'desde', 'fecha'
  ]);

  return idx;
}

function _consultaOEC_pickTextByIndex_(row, idx) {
  return idx >= 0 && idx < row.length ? _consultaOEC_text_(row[idx]) : '';
}

function _consultaOEC_pickDateByIndex_(row, idx) {
  return idx >= 0 && idx < row.length ? _consultaOEC_formatDateGT_(row[idx], 'yyyy-MM-dd') : '';
}

function _consultaOEC_pickBestRow_(matches, marcaTemporalIdx) {
  if (!matches || !matches.length) return null;

  return matches.sort(function(a, b){
    const da = marcaTemporalIdx >= 0 ? _consultaOEC_toDate_(a.row[marcaTemporalIdx]) : null;
    const db = marcaTemporalIdx >= 0 ? _consultaOEC_toDate_(b.row[marcaTemporalIdx]) : null;

    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;

    if (tb !== ta) return tb - ta;
    return b.rowNumber - a.rowNumber;
  })[0];
}

function _consultaOEC_getInstalacionesByRegistro_(registroNorm) {
  const debug = {
    hoja: HOJA_INST2,
    hojaEncontrada: false,
    totalFilas: 0,
    encabezados: [],
    indices: {},
    coincidencias: 0,
    columnasHeuristicas: {}
  };

  try {
    const sh = _consultaOEC_getSheet_(HOJA_INST2);
    debug.hojaEncontrada = true;

    const values = sh.getDataRange().getValues();
    debug.totalFilas = values.length;

    if (!values || values.length < 2) {
      debug.error = 'La hoja de instalaciones está vacía o sin datos.';
      return { items: [], debug: debug };
    }

    const headers = values[0];
    debug.encabezados = _consultaOEC_headerSummary_(headers);
    const idx = _consultaOEC_getInstIndexes_(headers);
    debug.indices = idx;

    let regCol = idx.registro;

    if (regCol < 0) {
      const scores = {};
      for (let c = 0; c < headers.length; c++) {
        let score = 0;
        for (let r = 1; r < Math.min(values.length, 40); r++) {
          const cell = _consultaOEC_normUpper_(values[r][c]);
          if (!cell) continue;
          if (cell.indexOf('OGA-') === 0) score++;
          if (cell === registroNorm) score += 3;
        }
        scores[c] = score;
      }

      let bestCol = -1;
      let bestScore = 0;
      Object.keys(scores).forEach(function(key){
        const s = Number(scores[key] || 0);
        if (s > bestScore) {
          bestScore = s;
          bestCol = Number(key);
        }
      });

      debug.columnasHeuristicas = scores;

      if (bestScore > 0) {
        regCol = bestCol;
        debug.heuristicaRegistro = {
          columna: regCol,
          encabezado: headers[regCol] || '',
          score: bestScore
        };
      }
    }

    if (regCol < 0) {
      debug.error = 'No se logró identificar la columna de registro en instalaciones.';
      return { items: [], debug: debug };
    }

    const out = [];
    const seen = {};

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const regRow = _consultaOEC_normUpper_(row[regCol]);
      if (!regRow || regRow !== registroNorm) continue;

      const item = {
        registro: _consultaOEC_pickTextByIndex_(row, regCol),
        nombre: _consultaOEC_pickTextByIndex_(row, idx.nombre),
        direccion: _consultaOEC_pickTextByIndex_(row, idx.direccion),
        desde: _consultaOEC_pickDateByIndex_(row, idx.desde)
      };

      if (!item.nombre && !item.direccion && !item.desde) {
        let fallbackParts = [];
        for (let c = 0; c < row.length; c++) {
          if (c === regCol) continue;
          const txt = _consultaOEC_text_(row[c]);
          if (txt) fallbackParts.push(txt);
        }
        item.nombre = fallbackParts[0] || '';
        item.direccion = fallbackParts[1] || '';
        item.desde = item.desde || '';
      }

      const key = [item.registro, item.nombre, item.direccion, item.desde].join('|');
      if (!seen[key]) {
        seen[key] = true;
        out.push(item);
      }
    }

    debug.coincidencias = out.length;
    return { items: out, debug: debug };

  } catch (e) {
    debug.error = String(e);
    return { items: [], debug: debug };
  }
}

function _consultaOEC_buildEditable_(row, idx) {
  const mt = idx.marcaTemporal >= 0 ? row[idx.marcaTemporal] : '';

  return {
    registro: idx.registro >= 0 ? _consultaOEC_text_(row[idx.registro]) : '',
    nit: idx.nit >= 0 ? _consultaOEC_text_(row[idx.nit]) : '',
    razon: idx.razon >= 0 ? _consultaOEC_text_(row[idx.razon]) : '',
    nombreComercial: idx.nombreCom >= 0 ? _consultaOEC_text_(row[idx.nombreCom]) : '',
    norma: idx.norma >= 0 ? _consultaOEC_text_(row[idx.norma]) : '',
    esquema: idx.esquema >= 0 ? _consultaOEC_text_(row[idx.esquema]) : '',
    pais: idx.pais >= 0 ? _consultaOEC_text_(row[idx.pais]) : '',
    marcaTemporal: _consultaOEC_formatDateGT_(mt, 'yyyy-MM-dd HH:mm'),

    c1Nombre: idx.c1Nombre >= 0 ? _consultaOEC_text_(row[idx.c1Nombre]) : '',
    c1Titulo: idx.c1Titulo >= 0 ? _consultaOEC_text_(row[idx.c1Titulo]) : '',
    c1Email: idx.c1Email >= 0 ? _consultaOEC_text_(row[idx.c1Email]) : '',
    c1Telefono: idx.c1Tel >= 0 ? _consultaOEC_text_(row[idx.c1Tel]) : '',
    c1Cargo: idx.c1Cargo >= 0 ? _consultaOEC_text_(row[idx.c1Cargo]) : '',

    c2Nombre: idx.c2Nombre >= 0 ? _consultaOEC_text_(row[idx.c2Nombre]) : '',
    c2Titulo: idx.c2Titulo >= 0 ? _consultaOEC_text_(row[idx.c2Titulo]) : '',
    c2Email: idx.c2Email >= 0 ? _consultaOEC_text_(row[idx.c2Email]) : '',
    c2Telefono: idx.c2Tel >= 0 ? _consultaOEC_text_(row[idx.c2Tel]) : '',
    c2Cargo: idx.c2Cargo >= 0 ? _consultaOEC_text_(row[idx.c2Cargo]) : '',

    repLegal: idx.repLegal >= 0 ? _consultaOEC_text_(row[idx.repLegal]) : ''
  };
}

/***** API PÚBLICA SPA *****/
function consultaOEC_listarRegistros() {
  const sh = _consultaOEC_getSheet_(HOJA_OEC2);
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { ok: true, registros: [], total: 0 };

  const headers = values[0];
  const idx = _consultaOEC_getGeneralIndexes_(headers);
  if (idx.registro < 0) throw new Error('No se encontró la columna "Registro de acreditación" en la hoja principal.');

  const set = {};
  for (let r = 1; r < values.length; r++) {
    const reg = _consultaOEC_normUpper_(values[r][idx.registro]);
    if (reg) set[reg] = true;
  }

  const registros = Object.keys(set).sort();
  return {
    ok: true,
    registros: registros,
    total: registros.length
  };
}

/* Compatibilidad con HTML anterior */
function listarRegistrosOEC() {
  return consultaOEC_listarRegistros().registros;
}

function consultaOEC_buscarPorRegistro(registro) {
  const regInput = _consultaOEC_normUpper_(registro);
  if (!regInput) return { ok: false, reason: 'Registro vacío.' };

  const sh = _consultaOEC_getSheet_(HOJA_OEC2);
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { ok: false, reason: 'Base principal sin datos.' };

  const headers = values[0];
  const idx = _consultaOEC_getGeneralIndexes_(headers);
  if (idx.registro < 0) return { ok: false, reason: 'No se encontró la columna de registro en la hoja principal.' };

  const matches = [];
  for (let r = 1; r < values.length; r++) {
    const regRow = _consultaOEC_normUpper_(values[r][idx.registro]);
    if (!regRow) continue;
    if (regRow === regInput) {
      matches.push({
        rowNumber: r + 1,
        row: values[r]
      });
    }
  }

  if (!matches.length) {
    return { ok: false, reason: 'No se encontró el registro solicitado.' };
  }

  const chosen = _consultaOEC_pickBestRow_(matches, idx.marcaTemporal) || matches[0];
  const editable = _consultaOEC_buildEditable_(chosen.row, idx);
  const instResult = _consultaOEC_getInstalacionesByRegistro_(regInput);
  const instalaciones = instResult.items || [];

  const sitioPrincipal = instalaciones.length
    ? (instalaciones[0].nombre || instalaciones[0].direccion || editable.pais || '')
    : '';

  const debug = {
    consulta: {
      registroSolicitado: regInput,
      coincidenciasDatosGenerales: matches.length,
      filaSeleccionada: chosen.rowNumber,
      encabezadosHojaPrincipal: _consultaOEC_headerSummary_(headers),
      indicesHojaPrincipal: idx
    },
    instalaciones: instResult.debug || {}
  };

  return {
    ok: true,
    editable: editable,
    instalaciones: instalaciones,
    sitioPrincipal: sitioPrincipal,
    stats: {
      totalInstalaciones: instalaciones.length,
      totalCoincidenciasPrincipal: matches.length
    },
    debug: debug
  };
}

/* Compatibilidad con HTML anterior */
function buscarOECPorRegistro(registro) {
  return consultaOEC_buscarPorRegistro(registro);
}

function consultaOEC_debugInstalaciones(registro) {
  const regInput = _consultaOEC_normUpper_(registro);
  return _consultaOEC_getInstalacionesByRegistro_(regInput).debug || {};
}

/* Compatibilidad con helper anterior */
function debugInstalacionesOEC() {
  try {
    const sh = _consultaOEC_getSheet_(HOJA_INST2);
    const vals = sh.getDataRange().getValues();
    if (!vals || !vals.length) return { error: 'Hoja vacía.' };

    return {
      hoja: HOJA_INST2,
      totalFilas: vals.length,
      encabezados: _consultaOEC_headerSummary_(vals[0]),
      indices: _consultaOEC_getInstIndexes_(vals[0]),
      muestra: vals.slice(1, 6)
    };
  } catch (e) {
    return { error: String(e) };
  }
}

function debugHeadersConsultaOEC() {
  const sh = _consultaOEC_getSheet_(HOJA_OEC2);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = _consultaOEC_getGeneralIndexes_(headers);
  return { headers: headers, idx: idx };
}
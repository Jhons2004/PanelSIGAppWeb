function WAPP_TEAM_obtenerCatalogos_(ctx) {
  if (!ctx || !ctx.tipo) throw new Error('No existe esquema del OEC.');

  const roles = WAPP_TEAM_cargarEvaluadores_(ctx.tipo);
  const oficiales = WAPP_TEAM_cargarOficiales_();

  return {
    esquema: ctx.tipo,
    oficialAsignado: ctx.ciclo ? ctx.ciclo.oficialAsignado || '' : '',
    oficiales: oficiales,
    roles: roles
  };
}

function WAPP_TEAM_cargarOficiales_() {
  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_OFICIALES);
  if (!sh) throw new Error('No existe la hoja Oficiales.');

  return WAPP_rowsByHeaders_(sh)
    .filter(r =>
      ['si', 'sí', 'true', '1', 'activo'].includes(WAPP_norm_(r.activo)) &&
      WAPP_norm_(r.rol_principal).includes('oficial de acreditacion')
    )
    .map(r => ({
      nombre: String(r.nombre_completo || '').trim(),
      correo: String(r.correo || '').trim().toLowerCase(),
      tipo: 'OGA',
      lugarTrabajo: 'Oficina Guatemalteca de Acreditación',
      areaAplicacion: 'N/A'
    }))
    .filter(x => x.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function WAPP_TEAM_cargarEvaluadores_(esquema) {
  const cfg = WAPP_cfg_();
  const cache = CacheService.getScriptCache();
  const cacheKey = 'WAPP_TEAM_CAT_' + WAPP_norm_(esquema).replace(/\s+/g, '_');
  const cached = cache.get(cacheKey);

  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss = SpreadsheetApp.openById(cfg.EVALUADORES_ID);
  const sh = WAPP_TEAM_sheetEsquema_(ss, esquema);
  const rows = WAPP_TEAM_rowsFromHeader_(sh, 4)
    .filter(r => WAPP_norm_(WAPP_TEAM_val_(r, ['Estado'])) === 'activo');

  const mapped = rows.map(r => {
    const email = String(
      WAPP_TEAM_val_(r, ['Correo electrónico', 'Correo electronico']) || ''
    ).trim().toLowerCase();

    const lugar = String(
      WAPP_TEAM_val_(r, ['Lugar de trabajo']) || ''
    ).trim();

    return {
      nombre: String(WAPP_TEAM_val_(r, ['Nombre completo']) || '').trim(),
      correo: email,
      rol: String(WAPP_TEAM_val_(r, ['Rol']) || '').trim(),
      lugarTrabajo: lugar,
      pais: String(WAPP_TEAM_val_(r, ['País', 'Pais']) || '').trim(),
      areaAplicacion: String(
        WAPP_TEAM_val_(r, ['Área de aplicación técnica', 'Area de aplicacion tecnica']) || ''
      ).trim(),
      tipo: (
        email.endsWith('@oga.org.gt') ||
        WAPP_norm_(lugar).includes('oficina guatemalteca de acreditacion')
      ) ? 'OGA' : 'Externo'
    };
  }).filter(x => x.nombre);

  const roles = {
    lider: WAPP_TEAM_filtrarRol_(mapped, ['evaluador lider']),
    tecnico: WAPP_TEAM_filtrarRol_(mapped, ['evaluador tecnico']),
    experto: WAPP_TEAM_filtrarRol_(mapped, ['experto tecnico']),
    acompana: WAPP_TEAM_filtrarRol_(mapped, [
      'evaluador en acompanamiento',
      'evaluador de acompanamiento',
      'evaluador acompanamiento'
    ]),
    formacion: WAPP_TEAM_cargarFormacion_(ss, esquema)
  };

  Object.keys(roles).forEach(k => {
    roles[k] = WAPP_TEAM_dedupe_(roles[k]);
  });

  cache.put(cacheKey, JSON.stringify(roles), 600);
  return roles;
}

function WAPP_TEAM_sheetEsquema_(ss, esquema) {
  const e = WAPP_norm_(esquema);
  let target = '';

  if (e.includes('ensayo')) target = 'laboratorio de ensayo';
  else if (e.includes('calibr')) target = 'laboratorio de calibracion';
  else if (e.includes('clinic')) target = 'laboratorio clinicos';
  else if (e.includes('inspeccion')) target = 'organismo de inspeccion';

  if (!target) throw new Error('No se pudo mapear el esquema al padrón: ' + esquema);

  const sh = ss.getSheets().find(s => WAPP_norm_(s.getName()) === target);
  if (!sh) throw new Error('No se encontró la pestaña del padrón para: ' + esquema);
  return sh;
}

function WAPP_TEAM_cargarFormacion_(ss, esquema) {
  const sh = ss.getSheetByName('Evaluadores en Formación');
  if (!sh) return [];

  const token = WAPP_TEAM_tokenEsquema_(esquema);
  const rows = WAPP_TEAM_rowsFromHeader_(sh, 4);

  return rows.map(r => {
    const expertise = String(
      WAPP_TEAM_val_(r, ['Esquema y Área Expertise', 'Esquema y Area Expertise']) || ''
    ).trim();

    return {
      nombre: String(
        WAPP_TEAM_val_(r, ['Nombre completo']) || ''
      ).trim(),
      correo: String(
        WAPP_TEAM_val_(r, ['Correo electrónico', 'Correo electronico']) || ''
      ).trim().toLowerCase(),
      rol: 'Personal en Formación',
      lugarTrabajo: '',
      pais: '',
      areaAplicacion: expertise,
      tipo: 'N/A',
      _match: WAPP_norm_(expertise).includes(token)
    };
  }).filter(x => x.nombre && x._match)
    .map(x => {
      delete x._match;
      return x;
    });
}

function WAPP_TEAM_tokenEsquema_(esquema) {
  const e = WAPP_norm_(esquema);
  if (e.includes('ensayo')) return 'ensayo';
  if (e.includes('calibr')) return 'calibr';
  if (e.includes('clinic')) return 'clinic';
  if (e.includes('inspeccion')) return 'inspeccion';
  return e;
}

function WAPP_TEAM_filtrarRol_(rows, aliases) {
  return rows.filter(r => {
    const rol = WAPP_norm_(r.rol);
    return aliases.some(a => rol.includes(WAPP_norm_(a)));
  });
}

function WAPP_TEAM_dedupe_(rows) {
  const seen = {};
  return rows.filter(r => {
    const key = WAPP_norm_(r.correo || r.nombre);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function WAPP_TEAM_rowsFromHeader_(sheet, headerRow) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < headerRow || lastCol < 1) return [];

  const values = sheet
    .getRange(headerRow, 1, lastRow - headerRow + 1, lastCol)
    .getValues();

  const headers = values[0].map(h => String(h || '').trim());

  return values.slice(1).map((row, idx) => {
    const o = { __rowNumber: headerRow + 1 + idx };
    headers.forEach((h, i) => { if (h) o[h] = row[i]; });
    return o;
  });
}

function WAPP_TEAM_val_(row, aliases) {
  const keys = Object.keys(row);
  for (let i = 0; i < aliases.length; i++) {
    const target = WAPP_norm_(aliases[i]);
    const found = keys.find(k => WAPP_norm_(k) === target);
    if (found) return row[found];
  }
  return '';
}

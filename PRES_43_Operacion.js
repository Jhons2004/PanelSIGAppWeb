/**
 * ============================================================================
 * WAPP V1.7 — OPERACIÓN COMPLETA
 * ============================================================================
 * Responsabilidades:
 * - Consolidar fila en Presupuesto.
 * - Sincronizar Equipo_Evaluador con compatibilidad institucional.
 * - Generar Boleta PDF y registrar Registros.
 * - Programar Calendar institucional (controlado por Script Property).
 * - Enviar correo institucional (controlado por Script Property).
 * - Mantener idempotencia / trazabilidad.
 *
 * IMPORTANTE SOBRE FORMATOS NUMÉRICOS:
 * - Este módulo NO usa setNumberFormat().
 * - La hoja temporal de Boleta es copia de la plantilla "Boletas".
 * - Las filas nuevas copian únicamente el formato de la fila anterior.
 * - Los valores se escriben como números, preservando las reglas existentes
 *   de la hoja (p. ej. Q 6.102,54 / US$ 800,00).
 * ============================================================================
 */

const WAPP_V17_STATE_KEY = 'WAPP_OP_V17_STATE';

function WAPP_V17_cfg_() {
  const cfg = WAPP_cfg_();
  const op = cfg.OPERACION || {};

  return Object.assign({
    SHEET_PRESUPUESTO:
      cfg.HOJA_PRESUPUESTO || 'Presupuesto',
    SHEET_REGISTROS:
      cfg.HOJA_REGISTROS || 'Registros',
    SHEET_EQUIPO:
      cfg.HOJA_EQUIPO_EVALUADOR || 'Equipo_Evaluador',
    TIMEZONE:
      cfg.TZ || 'America/Guatemala'
  }, op);
}

/* ============================================================================
 * ORQUESTACIÓN
 * ========================================================================== */

function WAPP_V17_completarOperacion_(c, documentos, signature, payload) {
  payload = payload || {};

  let state = WAPP_V17_leerEstado_();

  if (!state || state.signature !== signature) {
    state = {
      signature: signature,
      operacionId: documentos.operacionId || WAPP_DOCV16_operacionId_(c),
      estado: 'EN_PROCESO',
      createdAt: new Date().toISOString(),
      result: {
        ok: false,
        estado: 'EN_PROCESO',
        operacionId: documentos.operacionId || '',
        registroOperativo: {},
        boleta: {
          aplica: !!c.reglas.boleta,
          generado: false
        },
        calendario: {
          habilitado: WAPP_V17_calendarEnabled_(),
          sincronizado: false
        },
        correo: {
          habilitado: WAPP_V17_emailEnabled_(),
          enviado: false
        },
        integracionesPendientes: []
      }
    };

    WAPP_V17_guardarEstado_(state);
  }

  const r = state.result;
  r.operacionId = state.operacionId || documentos.operacionId || '';

  /* 1. Presupuesto operacional */
  if (!r.registroOperativo || !r.registroOperativo.filaPresupuesto) {
    const pres = WAPP_V17_registrarPresupuesto_(c, r.operacionId);

    r.registroOperativo = Object.assign(
      {},
      r.registroOperativo || {},
      pres
    );
    WAPP_V17_guardarEstado_(state);

    if (typeof WAPP_INT_updateOperation_ === 'function') {
      WAPP_INT_updateOperation_(
        signature,
        {
          Estado: 'EN_PROCESO',
          Etapa: 'PRESUPUESTO_REGISTRADO',
          Fila_Presupuesto:
            r.registroOperativo.filaPresupuesto || '',
          ID_Evaluacion:
            r.registroOperativo.idEvaluacion || ''
        }
      );
    }

    if (typeof WAPP_INT_faultMaybe_ === 'function') {
      WAPP_INT_faultMaybe_('AFTER_PRESUPUESTO');
    }
  }

  /* 2. Equipo_Evaluador */
  if (!r.registroOperativo.equipoRegistrado) {
    const eq = WAPP_V17_registrarEquipo_(
      c,
      r.registroOperativo.filaPresupuesto,
      r.registroOperativo.idEvaluacion,
      r.operacionId
    );

    r.registroOperativo.equipoRegistrado = true;
    r.registroOperativo.equipo = eq;
    WAPP_V17_guardarEstado_(state);

    if (typeof WAPP_INT_updateOperation_ === 'function') {
      WAPP_INT_updateOperation_(
        signature,
        {
          Estado: 'EN_PROCESO',
          Etapa: 'EQUIPO_REGISTRADO',
          Fila_Presupuesto:
            r.registroOperativo.filaPresupuesto || '',
          ID_Evaluacion:
            r.registroOperativo.idEvaluacion || ''
        }
      );
    }

    if (typeof WAPP_INT_faultMaybe_ === 'function') {
      WAPP_INT_faultMaybe_('AFTER_EQUIPO');
    }
  }

  /* 3. Boleta */
  if (!r.boleta || (!r.boleta.generado && !r.boleta.skipped)) {
    const pagosBoleta = WAPP_DOCV16_calcularPagos_(c.equipo);

    if (
      c.reglas.boleta &&
      Number(pagosBoleta.oga || 0) > 0 &&
      !(r.boleta && r.boleta.reservado)
    ) {
      r.boleta = Object.assign(
        {},
        r.boleta || {},
        WAPP_V17_reservarBoleta_(c, r.operacionId, signature)
      );

      WAPP_V17_guardarEstado_(state);
    }

    r.boleta = WAPP_V17_generarBoleta_(
      c,
      r.registroOperativo,
      r.operacionId,
      r.boleta || {}
    );

    if (r.boleta && r.boleta.identificador) {
      WAPP_V17_setPresupuestoByHeaders_(
        r.registroOperativo.filaPresupuesto,
        { Boleta: r.boleta.identificador }
      );
    }

    WAPP_V17_guardarEstado_(state);

    if (typeof WAPP_INT_updateOperation_ === 'function') {
      WAPP_INT_updateOperation_(
        signature,
        {
          Estado: 'EN_PROCESO',
          Etapa: 'BOLETA_REGISTRADA',
          Fila_Presupuesto:
            r.registroOperativo.filaPresupuesto || '',
          ID_Evaluacion:
            r.registroOperativo.idEvaluacion || '',
          Boleta_Identificador:
            r.boleta.identificador || '',
          Boleta_Correlativo:
            r.boleta.correlativo || '',
          Boleta_File_ID:
            r.boleta.primary &&
            r.boleta.primary.id || ''
        }
      );
    }

    if (typeof WAPP_INT_faultMaybe_ === 'function') {
      WAPP_INT_faultMaybe_('AFTER_BOLETA');
    }
  }

  /* 4. Calendario */
  r.calendario = r.calendario || {};
  r.calendario.habilitado = WAPP_V17_calendarEnabled_();

  if (r.calendario.habilitado && !r.calendario.sincronizado) {
    r.calendario = WAPP_V17_syncCalendario_(
      c,
      r.registroOperativo,
      r.calendario
    );
    WAPP_V17_guardarEstado_(state);

    if (typeof WAPP_INT_updateOperation_ === 'function') {
      WAPP_INT_updateOperation_(
        signature,
        {
          Estado: 'EN_PROCESO',
          Etapa: 'CALENDAR_SINCRONIZADO',
          Calendar_Event_ID:
            r.calendario.eventId || '',
          Calendar_Link:
            r.calendario.htmlLink || ''
        }
      );
    }

    if (typeof WAPP_INT_faultMaybe_ === 'function') {
      WAPP_INT_faultMaybe_('AFTER_CALENDAR');
    }
  }

  /* 5. Correo */
  r.correo = r.correo || {};
  r.correo.habilitado = WAPP_V17_emailEnabled_();

  if (
    r.correo.habilitado &&
    r.calendario &&
    r.calendario.sincronizado &&
    !r.correo.enviado
  ) {
    r.correo = WAPP_V17_enviarCorreoProgramacion_(
      c,
      r.calendario
    );
    WAPP_V17_guardarEstado_(state);

    if (typeof WAPP_INT_updateOperation_ === 'function') {
      WAPP_INT_updateOperation_(
        signature,
        {
          Estado: 'EN_PROCESO',
          Etapa: 'CORREO_ENVIADO'
        }
      );
    }
  }

  const pendientes = [];

  if (!WAPP_V17_calendarEnabled_()) {
    pendientes.push('Calendario institucional');
  } else if (!r.calendario.sincronizado) {
    pendientes.push('Calendario institucional');
  }

  if (!WAPP_V17_emailEnabled_()) {
    pendientes.push('Correo de actividad programada');
  } else if (!r.correo.enviado) {
    pendientes.push('Correo de actividad programada');
  }

  r.integracionesPendientes = pendientes;
  r.ok = true;
  r.estado = pendientes.length
    ? 'PENDIENTE_INTEGRACIONES'
    : 'COMPLETADO';
  r.updatedAt = new Date().toISOString();

  state.estado = r.estado;
  WAPP_V17_guardarEstado_(state);
  WAPP_V17_auditar_(c, documentos, r);

  return r;
}

function WAPP_V17_leerEstado_() {
  const raw = WAPP_STATE_props_()
    .getProperty(WAPP_V17_STATE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    WAPP_STATE_props_()
      .deleteProperty(WAPP_V17_STATE_KEY);
    return null;
  }
}

function WAPP_V17_guardarEstado_(state) {
  WAPP_STATE_props_().setProperty(
    WAPP_V17_STATE_KEY,
    JSON.stringify(state)
  );
}

/* ============================================================================
 * BASE / HOJAS / FORMATOS
 * ========================================================================== */

function WAPP_V17_db_() {
  return SpreadsheetApp.openById(
    WAPP_cfg_().REGISTRO_BOLETAS_ID
  );
}

function WAPP_V17_sheet_(name) {
  const sh = WAPP_V17_db_().getSheetByName(name);
  if (!sh) {
    throw new Error(
      'No existe la hoja "' + name + '" en RegistroBoletas.'
    );
  }
  return sh;
}

function WAPP_V17_headers_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];

  return sh.getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(v => String(v || '').trim());
}

function WAPP_V17_assertHeaders_(sh, required) {
  const headers = WAPP_V17_headers_(sh);
  const missing = (required || []).filter(h => headers.indexOf(h) < 0);

  if (missing.length) {
    throw new Error(
      'Faltan encabezados en "' + sh.getName() + '": ' +
      missing.join(', ')
    );
  }

  return headers;
}

function WAPP_V17_ensureHeaders_(sh, required) {
  const current = WAPP_V17_headers_(sh);
  (required || []).forEach(header => {
    if (current.indexOf(header) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
      current.push(header);
    }
  });
  return current;
}

function WAPP_V17_appendPreserveFormat_(sh, data) {
  const headers = WAPP_V17_headers_(sh);
  const lastRow = Math.max(sh.getLastRow(), 1);
  const row = lastRow + 1;

  WAPP_V173_ensureGridCapacity_(
    sh,
    row,
    Math.max(headers.length, 1)
  );

  if (lastRow >= 2 && headers.length) {
    WAPP_V1816_copyRowFormatSafe_(
      sh,
      lastRow,
      row,
      headers.length
    );
  }

  const values = headers.map(h =>
    Object.prototype.hasOwnProperty.call(data || {}, h)
      ? data[h]
      : ''
  );

  sh.getRange(
    row,
    1,
    1,
    headers.length
  ).setValues([values]);

  return row;
}

/**
 * Copia el formato de una fila sin hacer depender la operación
 * de que la fila fuente esté visible bajo un filtro.
 *
 * Estrategia:
 * 1. Buscar hacia arriba una fila visible.
 * 2. Intentar PASTE_FORMAT normalmente.
 * 3. Si Google Sheets rechaza la copia por filtro, aplicar los
 *    atributos visuales principales mediante getters/setters.
 */
function WAPP_V1816_copyRowFormatSafe_(
  sh,
  preferredSourceRow,
  targetRow,
  width
) {
  let sourceRow = Number(preferredSourceRow);

  while (
    sourceRow >= 2 &&
    WAPP_V1816_isRowFiltered_(sh, sourceRow)
  ) {
    sourceRow--;
  }

  if (sourceRow < 2) {
    // No existe una fila visible utilizable. Los valores se escribirán
    // correctamente; se omite únicamente la herencia visual.
    return {
      copied: false,
      mode: 'NO_VISIBLE_SOURCE'
    };
  }

  const source = sh.getRange(
    sourceRow,
    1,
    1,
    width
  );

  const target = sh.getRange(
    targetRow,
    1,
    1,
    width
  );

  try {
    source.copyTo(
      target,
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );

    return {
      copied: true,
      mode: 'PASTE_FORMAT',
      sourceRow: sourceRow
    };

  } catch (e) {
    const msg = String(
      e && e.message
        ? e.message
        : e
    ).toLowerCase();

    const filterError =
      msg.indexOf('filtrad') >= 0 ||
      msg.indexOf('filtered') >= 0;

    if (!filterError) {
      throw e;
    }

    /*
     * Fallback seguro. No usamos copy/paste sobre la fila filtrada.
     * Son los atributos necesarios para conservar la presentación
     * operativa de las hojas del proyecto.
     */
    target.setNumberFormats(
      source.getNumberFormats()
    );

    target.setBackgrounds(
      source.getBackgrounds()
    );

    target.setFontColors(
      source.getFontColors()
    );

    target.setFontFamilies(
      source.getFontFamilies()
    );

    target.setFontSizes(
      source.getFontSizes()
    );

    target.setFontWeights(
      source.getFontWeights()
    );

    target.setFontStyles(
      source.getFontStyles()
    );

    target.setHorizontalAlignments(
      source.getHorizontalAlignments()
    );

    target.setVerticalAlignments(
      source.getVerticalAlignments()
    );

    target.setWrapStrategies(
      source.getWrapStrategies()
    );

    return {
      copied: true,
      mode: 'SAFE_FORMAT_FALLBACK',
      sourceRow: sourceRow,
      originalError:
        e && e.message
          ? e.message
          : String(e)
    };
  }
}

function WAPP_V1816_isRowFiltered_(sh, row) {
  try {
    return sh.isRowHiddenByFilter(row) === true;
  } catch (_) {
    return false;
  }
}

function WAPP_V173_ensureGridCapacity_(sh, requiredRow, requiredCol) {
  requiredRow = Math.max(1, Number(requiredRow || 1));
  requiredCol = Math.max(1, Number(requiredCol || 1));

  const maxRows = sh.getMaxRows();
  const maxCols = sh.getMaxColumns();

  if (requiredRow > maxRows) {
    const deficit = requiredRow - maxRows;
    const addRows = Math.max(deficit, 20);
    sh.insertRowsAfter(maxRows, addRows);
  }

  if (requiredCol > maxCols) {
    const deficit = requiredCol - maxCols;
    const addCols = Math.max(deficit, 5);
    sh.insertColumnsAfter(maxCols, addCols);
  }

  return {
    maxRowsAntes: maxRows,
    maxColsAntes: maxCols,
    maxRowsDespues: sh.getMaxRows(),
    maxColsDespues: sh.getMaxColumns()
  };
}

function WAPP_V17_setByHeaders_(sh, row, data) {
  const headers = WAPP_V17_headers_(sh);
  const idx = {};
  headers.forEach((h, i) => idx[h] = i + 1);

  Object.keys(data || {}).forEach(key => {
    if (idx[key]) {
      sh.getRange(row, idx[key]).setValue(data[key]);
    }
  });
}

function WAPP_V17_setPresupuestoByHeaders_(row, data) {
  WAPP_V17_setByHeaders_(
    WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_PRESUPUESTO),
    row,
    data
  );
}

function WAPP_V17_getRowObject_(sh, row, display) {
  const headers = WAPP_V17_headers_(sh);
  const values = display
    ? sh.getRange(row, 1, 1, headers.length).getDisplayValues()[0]
    : sh.getRange(row, 1, 1, headers.length).getValues()[0];

  const out = {};
  headers.forEach((h, i) => out[h] = values[i]);
  return out;
}

function WAPP_V17_rows_(sh) {
  const headers = WAPP_V17_headers_(sh);
  const lastRow = sh.getLastRow();

  if (!headers.length || lastRow < 2) return [];

  const values = sh.getRange(
    2,
    1,
    lastRow - 1,
    headers.length
  ).getValues();

  return values.map((row, index) => {
    const out = {
      __rowNumber: index + 2
    };

    headers.forEach((h, i) => {
      out[h] = row[i];
    });

    return out;
  });
}

/* ============================================================================
 * PRESUPUESTO
 * ========================================================================== */

function WAPP_V17_registrarPresupuesto_(c, operacionId) {
  const sh = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_PRESUPUESTO);

  /*
   * Contrato productivo de entrada compatible con Reprogramación V1.8.2.
   * El flujo normal falla cerrado si el esquema requerido no está preparado.
   */
  WAPP_V17_assertHeaders_(sh, [
    'Registro OEC',
    'Tipo Evaluacion',
    'Esquema',
    'Fecha Inicial',
    'Fecha Final',
    'Ev. Líder',
    'Ev. Técnico',
    'Exp. Técnico',
    'Ev. Acompaña',
    'Formacion',
    'Evaluador Líder',
    'Evaluador Técnico',
    'Experto Técnico',
    'Evaluador Acompañamiento',
    'Personal Formación',
    'Calendar Event ID',
    'Calendar Link',
    'Calendar Status',
    'Calendar Last Sync',
    'Calendar Error',
    'Boleta',
    'ID_Evaluacion',
    'ER Instalaciones JSON',
    'ER Instalaciones Resumen',
    'ER Alcance Programado Resumen'
  ]);

  const counts = WAPP_V17_teamCounts_(c.equipo);
  const names = WAPP_V17_teamNames_(c.equipo);
  const flags = WAPP_V17_flags_(c.evaluacion.tipoEvaluacion);
  const instalaciones = WAPP_V17_instalacionesContrato_(
    c.evaluacion && c.evaluacion.instalacionesProgramadas
  );

  let ubicacion = c.evaluacion.ubicacion || '';
  if (ubicacion === 'Capital') ubicacion = 1;
  else if (ubicacion === 'Extranjeros') ubicacion = 2;
  else if (ubicacion === 'Departamentos') ubicacion = 3;
  else if (![1, 2, 3].includes(Number(ubicacion))) ubicacion = '';

  const fechaInicio = WAPP_DOCV16_parseDate_(c.evaluacion.fechaInicio) || '';
  const fechaFinal = WAPP_DOCV16_parseDate_(c.evaluacion.fechaFinal) || '';

  const data = {
    'Marca Temporal': new Date(),
    'Registro OEC': c.ctx.registro,
    'Tipo Evaluacion': c.evaluacion.tipoEvaluacion,
    'Esquema': c.ctx.tipo,
    'Años acreditado': c.evaluacion.ciclosAcreditados || '',
    'Ubicacion': ubicacion,
    'Personal': Number(c.evaluacion.personal || 0),

    // P1-R2: la cantidad operacional queda alineada con la selección validada.
    'Instalaciones': instalaciones.length,

    'Areas': Number(c.evaluacion.areas || 0),
    'NC Anteriores': Number(c.evaluacion.nc || 0),
    'Testificaciones': Number(
      c.evaluacion.testificaciones ||
      c.evaluacion.testif1 ||
      0
    ),
    'Fecha': new Date(),
    'Ev. Líder': counts.lider,
    'Ev. Técnico': counts.tecnico,
    'Exp. Técnico': counts.experto,
    'Ev. Acompaña': counts.acompana,
    'Formacion': counts.formacion,
    'Evaluador Líder': names.lider,
    'Evaluador Técnico': names.tecnico,
    'Experto Técnico': names.experto,
    'Evaluador Acompañamiento': names.acompana,
    'Personal Formación': names.formacion,
    'Fecha Inicial': fechaInicio,
    'Fecha Final': fechaFinal,
    'Testificaciones 2': Number(
      c.evaluacion.testificaciones ||
      c.evaluacion.testif1 ||
      0
    ),
    'Resolucion': flags.resolucion,
    'Certificado': flags.certificado,
    'Mantemiento': flags.mantenimiento,
    'Addendum': flags.addendum,
    'Calendar Status': WAPP_V17_calendarEnabled_()
      ? 'PENDIENTE V1.7'
      : 'PENDIENTE - INTEGRACIÓN DESHABILITADA',
    'Calendar Error': '',
    'Boleta': '',

    // P1-R2: persistencia durable compatible con Reprogramación V1.8.2.
    'ER Instalaciones JSON': JSON.stringify(instalaciones),
    'ER Instalaciones Resumen':
      WAPP_V17_instalacionesResumenContrato_(instalaciones),
    'ER Alcance Programado Resumen':
      WAPP_V17_alcanceResumenContrato_(instalaciones)
  };

  const row = WAPP_V17_appendPreserveFormat_(sh, data);

  const registroKey = WAPP_V17_registroKey_(c.ctx.registro);
  const idEvaluacion = 'EV-' + registroKey + '-' + row;
  const idPresupuesto = 'PRES-' + row;

  /*
   * El ID depende de la fila recién creada. Se persiste inmediatamente
   * en la fila canónica y luego se reutiliza sin regenerarlo para Equipo.
   */
  WAPP_V17_setByHeaders_(sh, row, {
    'ID_Evaluacion': idEvaluacion
  });

  WAPP_STATE_props_().setProperty(
    'presupuestoV2_lastRow',
    String(row)
  );
  WAPP_STATE_props_().setProperty(
    'filaPresupuesto',
    String(row)
  );

  return {
    filaPresupuesto: row,
    idEvaluacion: idEvaluacion,
    idPresupuesto: idPresupuesto,
    operacionId: operacionId
  };
}

/**
 * P1-R2 — Canonicaliza la selección ya validada por 12_Sitios_Service.gs
 * usando el mismo contrato que consume Reprogramación V1.8.2.
 */
function WAPP_V17_instalacionesContrato_(items) {
  const seen = {};
  const out = [];

  (Array.isArray(items) ? items : []).forEach(x => {
    x = x || {};

    const id = String(x.id || x.sitioId || '').trim();
    const nombre = String(x.nombre || x.sitioNombre || '').trim();
    const key = id || WAPP_norm_(nombre);

    if (!key || seen[key]) return;
    seen[key] = true;

    const alcance = String(
      x.alcanceProgramado !== undefined && x.alcanceProgramado !== null
        ? x.alcanceProgramado
        : (x.alcance || '')
    ).trim();

    out.push({
      id: id,
      nombre: nombre || id,
      direccion: String(x.direccion || '').trim(),
      ciudad: String(x.ciudad || '').trim(),
      departamento: String(x.departamento || '').trim(),
      estado: String(x.estado || '').trim(),
      alcance: alcance,
      alcanceProgramado: alcance
    });
  });

  out.sort((a, b) =>
    String(a.id || a.nombre).localeCompare(
      String(b.id || b.nombre),
      'es'
    )
  );

  return out;
}

function WAPP_V17_instalacionesResumenContrato_(items) {
  return (items || []).map(x => {
    const dir = [
      String(x.direccion || '').trim(),
      String(x.ciudad || '').trim(),
      String(x.departamento || '').trim()
    ].filter(Boolean).join(', ');

    return String(x.nombre || x.id || '').trim() +
      (dir ? ' — ' + dir : '');
  }).filter(Boolean).join('\n');
}

function WAPP_V17_alcanceResumenContrato_(items) {
  return (items || []).map(x => {
    const nombre = String(x.nombre || x.id || '').trim();
    const alcance = String(
      x.alcanceProgramado || x.alcance || ''
    ).trim();

    return nombre + ': ' + (alcance || '[Sin alcance programado]');
  }).filter(Boolean).join('\n');
}


function WAPP_V17_flags_(tipo) {
  const t = WAPP_norm_(tipo);

  const out = {
    resolucion: 'No',
    certificado: 'No',
    mantenimiento: 'No',
    addendum: 'No'
  };

  if (t === 'evaluacion inicial') {
    out.resolucion = 'Sí';
    out.certificado = 'Sí';
    out.addendum = 'Sí';
    return out;
  }

  if (t === 'evaluacion de seguimiento') {
    out.mantenimiento = 'Sí';
    return out;
  }

  if (t === 'evaluacion de seguimiento y ampliacion') {
    out.resolucion = 'Sí';
    out.mantenimiento = 'Sí';
    out.addendum = 'Sí';
    return out;
  }

  if ([
    'reevaluacion',
    'reevaluacion y ampliacion',
    'evaluacion de ampliacion'
  ].includes(t)) {
    out.resolucion = 'Sí';
    out.addendum = 'Sí';
    return out;
  }

  return out;
}

function WAPP_V17_teamCounts_(equipo) {
  const count = key => (equipo || []).filter(e => key(e)).length;

  return {
    lider: count(e => String(e.rolKey || '') === 'lider'),
    tecnico: count(e => String(e.rolKey || '') === 'tecnico'),
    experto: count(e => String(e.rolKey || '') === 'experto'),
    acompana: count(e => String(e.rolKey || '').indexOf('acomp_') === 0),
    formacion: count(e => String(e.rolKey || '') === 'formacion')
  };
}

function WAPP_V17_teamNames_(equipo) {
  const join = test => (equipo || [])
    .filter(test)
    .map(e => String(e.nombre || '').trim())
    .filter(Boolean)
    .join('\n');

  return {
    lider: join(e => String(e.rolKey || '') === 'lider'),
    tecnico: join(e => String(e.rolKey || '') === 'tecnico'),
    experto: join(e => String(e.rolKey || '') === 'experto'),
    acompana: join(e => String(e.rolKey || '').indexOf('acomp_') === 0),
    formacion: join(e => String(e.rolKey || '') === 'formacion')
  };
}

/* ============================================================================
 * EQUIPO_EVALUADOR
 * ========================================================================== */

function WAPP_V17_registrarEquipo_(c, filaPresupuesto, idEvaluacion, operacionId) {
  const sh = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_EQUIPO);

  WAPP_V17_assertHeaders_(sh, [
    'ID_Asignacion', 'ID_Evaluacion', 'Registro_OEC', 'Registro_Key',
    'Tipo_Evaluacion', 'Esquema', 'Fecha_Inicial', 'Fecha_Final',
    'Rol_Asignado', 'Rol_Key', 'Nombre_Evaluador', 'Correo_Evaluador',
    'Correo_Key', 'Area_Evaluacion', 'Estado_Asignacion',
    'Acceso_Documentos', 'Fecha_Inicio_Acceso', 'Fecha_Fin_Acceso',
    'Fila_Presupuesto', 'ID_Presupuesto', 'Origen_Registro',
    'Hash_Asignacion', 'Timestamp_Sync', 'Usuario_Sync',
    'Ev_documental', 'Ev_Sitio', 'Total_dias', 'Observaciones',
    'Tipo', 'Tarifa', 'Total_USD', 'Lugar_Trabajo', 'Vigente',
    'Fecha_Fin_Vigencia'
  ]);

  const existing = WAPP_V17_rows_(sh).filter(r =>
    String(r.ID_Evaluacion || '').trim() === idEvaluacion
  );

  const existingHashes = new Set(
    existing.map(r => String(r.Hash_Asignacion || '').trim())
  );

  const fechaInicial = WAPP_DOCV16_parseDate_(c.evaluacion.fechaInicio);
  const fechaFinal = WAPP_DOCV16_parseDate_(c.evaluacion.fechaFinal);
  const inicioAcceso = WAPP_V17_dateOnly_(new Date());
  const finAcceso = WAPP_V17_addDays_(fechaFinal, 30);
  const registroKey = WAPP_V17_registroKey_(c.ctx.registro);
  const idPresupuesto = 'PRES-' + filaPresupuesto;
  const usuario = c.user.email || '';

  let inserted = 0;
  let reused = 0;
  const ids = [];

  (c.equipo || []).forEach((e, index) => {
    const rolKey = WAPP_V17_roleKey_(e.rolKey, e.rol);
    const correo = String(e.correo || '').trim().toLowerCase();
    const nombre = String(e.nombre || '').trim();
    const area = String(e.area || '').trim();
    const documental = Number(e.documental || 0);
    const sitio = Number(e.sitio || 0);
    const tarifa = WAPP_DOCV16_tarifa_(e);
    const totalDias = documental + sitio;
    const totalUsd = Number((totalDias * tarifa).toFixed(2));

    const identidad = correo || (
      'NOMBRE_' + WAPP_V17_nombreKey_(nombre)
    );

    const hash = WAPP_V17_hash_([
      registroKey,
      idEvaluacion,
      identidad,
      rolKey
    ].join('|')).slice(0, 16).toUpperCase();

    const idAsignacion = 'ASG-' + hash;
    ids.push(idAsignacion);

    if (existingHashes.has(hash)) {
      reused++;
      return;
    }

    WAPP_V17_appendPreserveFormat_(sh, {
      ID_Asignacion: idAsignacion,
      ID_Evaluacion: idEvaluacion,
      Registro_OEC: c.ctx.registro,
      Registro_Key: registroKey,
      Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
      Esquema: c.ctx.tipo,
      Fecha_Inicial: fechaInicial || '',
      Fecha_Final: fechaFinal || '',
      Rol_Asignado: WAPP_V17_roleName_(rolKey, e.rol),
      Rol_Key: rolKey,
      Nombre_Evaluador: nombre,
      Correo_Evaluador: correo,
      Correo_Key: correo,
      Area_Evaluacion: area,
      Estado_Asignacion: 'Activo',
      Acceso_Documentos: 'Sí',
      Fecha_Inicio_Acceso: inicioAcceso || '',
      Fecha_Fin_Acceso: finAcceso || '',
      Fila_Presupuesto: filaPresupuesto,
      ID_Presupuesto: idPresupuesto,
      Origen_Registro: 'Presupuesto',
      Hash_Asignacion: hash,
      Timestamp_Sync: new Date(),
      Usuario_Sync: usuario,
      Ev_documental: documental,
      Ev_Sitio: sitio,
      Total_dias: totalDias,
      Observaciones: 'WebApp V1.7 | Operación ' + operacionId,
      Tipo: e.tipo || '',
      Tarifa: tarifa,
      Total_USD: totalUsd,
      Movimiento_ER: '',
      Fecha_Sync_ER: '',
      Lugar_Trabajo: e.lugarTrabajo || '',
      Vigente: 'Sí',
      Fecha_Fin_Vigencia: finAcceso || '',
      Movimiento_ER_Sustitucion: '',
      ID_Asignacion_Reemplazo: ''
    });

    inserted++;
  });

  return {
    total: (c.equipo || []).length,
    insertados: inserted,
    reutilizados: reused,
    ids: ids
  };
}

function WAPP_V17_roleKey_(key, rol) {
  const k = String(key || '').trim();

  if (k === 'oficial') return 'oficial_acreditacion';
  if (k === 'lider') return 'evaluador_lider';
  if (k === 'tecnico') return 'evaluador_tecnico';
  if (k === 'experto') return 'experto_tecnico';
  if (k.indexOf('acomp_') === 0) return 'evaluador_acompanamiento';
  if (k === 'formacion') return 'personal_formacion';

  return WAPP_norm_(rol).replace(/\s+/g, '_');
}

function WAPP_V17_roleName_(rolKey, fallback) {
  const map = {
    oficial_acreditacion: 'Oficial de Acreditación',
    evaluador_lider: 'Evaluador Líder',
    evaluador_tecnico: 'Evaluador Técnico',
    experto_tecnico: 'Experto Técnico',
    evaluador_acompanamiento: 'Evaluador en Acompañamiento',
    personal_formacion: 'Personal en Formación'
  };

  return map[rolKey] || String(fallback || '').trim();
}

function WAPP_V17_nombreKey_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ============================================================================
 * BOLETA
 * ========================================================================== */

function WAPP_V17_generarBoleta_(c, registroOperativo, operacionId, reserva) {
  reserva = reserva || {};
  if (!c.reglas.boleta) {
    return {
      aplica: false,
      generado: false,
      skipped: true,
      motivo: 'El tipo de evaluación no requiere Boleta.'
    };
  }

  const pagos = WAPP_DOCV16_calcularPagos_(c.equipo);
  const montoUSD = Number(pagos.oga || 0);

  if (montoUSD <= 0) {
    return {
      aplica: true,
      generado: false,
      skipped: true,
      noAplicaPagoOGA: true,
      montoUSD: 0,
      motivo: 'No existe monto a pagar a OGA; no se genera Boleta.'
    };
  }

  const renderMode = String(
    WAPP_V17_cfg_().BOLETA_RENDER_MODE ||
    'SHEET_TEMPLATE'
  ).trim().toUpperCase();

  if (renderMode !== 'SHEET_TEMPLATE') {
    throw new Error(
      'Modo de render de Boleta no soportado en V1.8.1: ' +
      renderMode
    );
  }

  const shReg = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_REGISTROS);
  const shTpl = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_BOLETA_TEMPLATE);

  WAPP_V17_assertHeaders_(shReg, [
    'Correlativo', 'Fecha', 'Identificador', 'OEC', 'Tasa Cambio',
    'Pago por', 'Monto a Cancelar', 'Status', 'Concepto Tarifario',
    'Monto$', 'Responsable', 'Detalle'
  ]);

  if (typeof WAPP_V171_TC_resolver_ !== 'function') {
    throw new Error('Falta instalar 44_Tipo_Cambio_Cache_V171.gs.');
  }

  const tasa = WAPP_V171_TC_resolver_();
  const montoGTQ = Number((montoUSD * tasa.value).toFixed(2));

  const correlativo = Number(
    reserva.correlativo ||
    WAPP_V17_siguienteCorrelativo_(shReg)
  );

  const anio = Number(
    reserva.anio ||
    new Date().getFullYear()
  );

  const corr = String(correlativo).padStart(4, '0');

  const identificador = String(
    reserva.identificador ||
    (anio + '-' + c.ctx.registro + '-' + corr)
  );

  const nombreBase = String(
    reserva.nombreBase ||
    [
      'Boleta_' + corr,
      WAPP_DOCV16_registroSeguro_(c.ctx.registro),
      WAPP_DOCV16_nombreSeguro_(c.evaluacion.tipoEvaluacion),
      WAPP_DOCV16_fechaISO_(c.evaluacion.fechaInicio)
    ].join('_')
  );

  const nombrePdf = String(
    reserva.nombrePdf ||
    (nombreBase + '.pdf')
  );
  const destinos = WAPP_DOCV16_resolverDestinos_(c.ctx.registro);
  const primaryFolder = destinos.presupuesto;
  const backupFolder = DriveApp.getFolderById(
    WAPP_V17_cfg_().BACKUP_BOLETA_FOLDER_ID
  );

  let primary = WAPP_V17_findFileByName_(primaryFolder, nombrePdf);
  let backup = WAPP_V17_findFileByName_(backupFolder, nombrePdf);
  let temp = null;

  const detalle = WAPP_V17_detallePagoOGA_(c.equipo);
  const pagoPor = WAPP_V17_pagoPorOGA_(c.equipo);

  if (!primary) {
    const ss = WAPP_V17_db_();
    temp = shTpl.copyTo(ss);
    temp.setName(
      'TMP_W17_' + Utilities.getUuid().slice(0, 8).toUpperCase()
    );

    try {
      /*
       * NO cambiar formatos numéricos. La copia hereda el formato exacto
       * de la plantilla institucional.
       */
      temp.getRange('C1').setValue(tasa.value);
      temp.getRange('E2').setValue(identificador);
      temp.getRange('B6').setValue(
        Utilities.formatDate(
          new Date(),
          WAPP_V17_cfg_().TIMEZONE,
          'dd/MM/yyyy'
        )
      );
      temp.getRange('F6').setValue(c.ctx.nit || 'N/A');
      temp.getRange('B8').setValue(c.ctx.razonSocial || '');
      temp.getRange('F8').setValue('');
      temp.getRange('C10').setValue(montoGTQ);
      temp.getRange('G10').setValue(montoUSD);
      temp.getRange('C13').setValue('Evaluación');
      temp.getRange('C15').setValue(
        detalle || 'Evaluación para acreditación'
      );
      temp.getRange('C19').setValue('');
      temp.getRange('B21').setValue(c.user.nombre || c.user.email || '');
      temp.getRange('G22').setValue(correlativo);

      SpreadsheetApp.flush();
      Utilities.sleep(350);

      const blob = WAPP_V17_exportSheetPdf_(
        ss.getId(),
        temp.getSheetId(),
        nombrePdf
      );

      primary = primaryFolder.createFile(blob.copyBlob())
        .setName(nombrePdf);

      if (!backup) {
        backup = backupFolder.createFile(blob.copyBlob())
          .setName(nombrePdf);
      }

    } finally {
      if (temp) {
        try {
          ss.deleteSheet(temp);
        } catch (e) {
          console.warn('[WAPP V1.7] No se eliminó hoja temporal:', e);
        }
      }
    }
  }

  if (!backup && primary) {
    backup = backupFolder.createFile(
      primary.getBlob().copyBlob()
    ).setName(nombrePdf);
  }

  const existing = WAPP_V17_rows_(shReg).find(r =>
    String(r.Identificador || '').trim() === identificador
  );

  let filaRegistros = existing ? Number(existing.__rowNumber || 0) : 0;

  if (!filaRegistros) {
    filaRegistros = WAPP_V17_appendPreserveFormat_(shReg, {
      Correlativo: correlativo,
      Fecha: new Date(),
      Identificador: identificador,
      OEC: c.ctx.registro,
      'Tasa Cambio': tasa.value,
      'Pago por': pagoPor,
      'Monto a Cancelar': montoGTQ,
      Status: 'No pagado',
      'Monto Cancelado': '',
      'Fecha pago': '',
      Banco: '',
      'No. Referencia': '',
      'Comentario Anulación': '',
      'Pago Registrado por': '',
      'Anulado/Modificado por': '',
      'Concepto Tarifario': 'Evaluación',
      'Monto$': montoUSD,
      Responsable: c.user.nombre || c.user.email || '',
      'Recibo 63A': '',
      Detalle: detalle
    });
  }

  if (typeof WAPP_INT_commitCorrelativo_ === 'function') {
    WAPP_INT_commitCorrelativo_(
      operacionId,
      correlativo,
      identificador,
      filaRegistros
    );
  }

  return {
    aplica: true,
    generado: true,
    formato: 'PDF',
    nombre: nombrePdf,
    correlativo: correlativo,
    identificador: identificador,
    tipoCambio: tasa.value,
    tipoCambioRaw: tasa.raw,
    tipoCambioOrigen: tasa.origen || '',
    tipoCambioFechaReferencia: tasa.fechaReferencia || '',
    tipoCambioOnlineDisponible: tasa.onlineDisponible === true,
    tipoCambioCacheFallback: tasa.cacheFallback === true,
    tipoCambioIntentos: tasa.intentos || 0,
    montoUSD: montoUSD,
    montoGTQ: montoGTQ,
    filaRegistros: filaRegistros,
    primary: WAPP_DOCV16_fileInfo_(primary),
    backup: WAPP_DOCV16_fileInfo_(backup),
    detalle: detalle,
    pagoPor: pagoPor,
    operacionId: operacionId,
    filaPresupuesto: registroOperativo.filaPresupuesto,
    reservado: true
  };
}

function WAPP_V17_reservarBoleta_(c, operacionId, signature) {
  const shReg = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_REGISTROS);

  const reservaPersistente =
    typeof WAPP_INT_reservarCorrelativo_ === 'function'
      ? WAPP_INT_reservarCorrelativo_(
          shReg,
          c,
          operacionId,
          signature
        )
      : {
          correlativo:
            WAPP_V17_reservarCorrelativo_(shReg),
          reservaId: '',
          reused: false,
          estado: 'LEGACY'
        };

  const correlativo = Number(
    reservaPersistente.correlativo
  );
  const anio = new Date().getFullYear();
  const corr = String(correlativo).padStart(4, '0');
  const identificador =
    anio + '-' + c.ctx.registro + '-' + corr;

  const nombreBase = [
    'Boleta_' + corr,
    WAPP_DOCV16_registroSeguro_(c.ctx.registro),
    WAPP_DOCV16_nombreSeguro_(c.evaluacion.tipoEvaluacion),
    WAPP_DOCV16_fechaISO_(c.evaluacion.fechaInicio)
  ].join('_');

  return {
    reservado: true,
    correlativo: correlativo,
    anio: anio,
    identificador: identificador,
    nombreBase: nombreBase,
    nombrePdf: nombreBase + '.pdf',
    reservadoAt: new Date().toISOString(),
    reservaId: reservaPersistente.reservaId || '',
    reservaReutilizada:
      reservaPersistente.reused === true
  };
}

function WAPP_V17_siguienteCorrelativo_(sh) {
  const rows = WAPP_V17_rows_(sh);
  let max = 0;

  rows.forEach(r => {
    const n = Number(String(r.Correlativo || '').trim());
    if (Number.isFinite(n) && n > max) max = n;
  });

  return max + 1;
}

function WAPP_V17_reservarCorrelativo_(sh) {
  const props = PropertiesService.getScriptProperties();
  const key = 'WAPP_V17_BOLETA_NEXT_CORRELATIVO';

  const desdeHoja = WAPP_V17_siguienteCorrelativo_(sh);
  const desdeProp = Number(props.getProperty(key) || 0);

  const correlativo = Math.max(
    desdeHoja,
    Number.isFinite(desdeProp) && desdeProp > 0
      ? desdeProp
      : 0
  );

  props.setProperty(
    key,
    String(correlativo + 1)
  );

  return correlativo;
}

function WAPP_V17_pagoPorOGA_(equipo) {
  return (equipo || [])
    .filter(e => WAPP_norm_(e.tipo) === 'oga')
    .map(e => String(e.rol || '').trim())
    .filter(Boolean)
    .join(' ');
}

function WAPP_V17_detallePagoOGA_(equipo) {
  return (equipo || [])
    .filter(e => WAPP_norm_(e.tipo) === 'oga')
    .map(e => {
      const dias = Number(e.documental || 0) + Number(e.sitio || 0);
      const total = dias * WAPP_DOCV16_tarifa_(e);
      return String(e.rol || '') + ' - ' + dias +
        ' días - $' + total.toFixed(2);
    })
    .join('\n');
}

function WAPP_V17_BANGUAT_consultar_() {
  if (typeof WAPP_V171_TC_resolver_ !== 'function') {
    throw new Error('Falta instalar 44_Tipo_Cambio_Cache_V171.gs.');
  }
  return WAPP_V171_TC_resolver_();
}

function WAPP_V17_exportSheetPdf_(spreadsheetId, sheetId, fileName) {
  const url =
    'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(spreadsheetId) +
    '/export?format=pdf' +
    '&gid=' + encodeURIComponent(sheetId) +
    '&size=A4' +
    '&portrait=true' +
    '&fitw=true' +
    '&sheetnames=false' +
    '&printtitle=false' +
    '&pagenumbers=false' +
    '&gridlines=false' +
    '&fzr=false';

  const resp = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error(
      'No fue posible exportar la Boleta a PDF. HTTP ' +
      resp.getResponseCode()
    );
  }

  return resp.getBlob().setName(fileName);
}

function WAPP_V17_findFileByName_(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

/* ============================================================================
 * CALENDARIO
 * ========================================================================== */

function WAPP_V17_calendarEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(
      WAPP_V17_cfg_().PROP_CALENDAR_ENABLED
    ) || ''
  ).trim().toUpperCase() === 'YES';
}

function WAPP_V17_emailEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(
      WAPP_V17_cfg_().PROP_EMAIL_ENABLED
    ) || ''
  ).trim().toUpperCase() === 'YES';
}

/** Identificador estable por operación, no depende del usuario que reintenta. */
function WAPP_V17_idEventoDeterminista_(registroOperativo) {
  const key = String(
    registroOperativo &&
    (registroOperativo.operacionId || registroOperativo.idEvaluacion) || ''
  ).trim();
  if (!key) throw new Error('Falta identificador de evaluación para Calendar.');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 'OGA|PRES|' + key,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
  return 'oga' + hex.slice(0, 40);
}
function WAPP_V17_calendarNotFound_(err) {
  const s = String(err && err.message || err || '');
  return /\b404\b|not found|notfound|no se encontr[oó]/i.test(s);
}
function WAPP_V17_calendarConflict_(err) {
  const s = String(err && err.message || err || '');
  return /\b409\b|already exists|duplicate|conflict|ya existe/i.test(s);
}

function WAPP_V17_syncCalendario_(c, registroOperativo, previo) {
  if (typeof Calendar === 'undefined' || !Calendar.Events) {
    throw new Error(
      'Calendar API avanzada no está habilitada. ' +
      'Agregue Calendar v3 a Servicios de Apps Script.'
    );
  }

  const sh = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_PRESUPUESTO);
  const row = registroOperativo.filaPresupuesto;
  const rowObj = WAPP_V17_getRowObject_(sh, row, true);

  try {
    const resource = WAPP_V17_calendarResource_(c);
    const deterministicId = WAPP_V17_idEventoDeterminista_(registroOperativo);
    const eventId = String(
      rowObj['Calendar Event ID'] ||
      (previo && previo.eventId) ||
      deterministicId
    ).trim();
    const calendarId = WAPP_V17_cfg_().CALENDAR_ID;
    let event = null;
    let existing = null;
    let action = 'created';

    // Solamente un 404 permite considerar el evento inexistente.
    // Un fallo de permisos/red no debe crear eventos duplicados.
    try {
      existing = Calendar.Events.get(calendarId, eventId);
    } catch (e) {
      if (!WAPP_V17_calendarNotFound_(e)) throw e;
    }

    if (existing) {
      ['summary', 'description', 'location', 'start', 'end',
        'reminders', 'colorId', 'attendees'].forEach(function(k) {
        existing[k] = resource[k];
      });
      event = Calendar.Events.update(existing, calendarId, eventId,
        { sendUpdates: 'none' });
      action = 'updated';
    } else {
      // IDs de Calendar sólo admiten base32hex. Un SHA-256 hexadecimal
      // estable garantiza reutilización del evento en reintentos.
      resource.id = deterministicId;
      try {
        event = Calendar.Events.insert(resource, calendarId,
          { sendUpdates: 'none' });
      } catch (e) {
        // Retry tras insert exitoso y respuesta perdida: recuperar evento.
        if (!WAPP_V17_calendarConflict_(e)) throw e;
        event = Calendar.Events.get(calendarId, deterministicId);
        action = 'reused';
      }
    }

    const status = 'OK - ' + action.toUpperCase();

    WAPP_V17_setPresupuestoByHeaders_(row, {
      'Calendar Event ID': event.id || '',
      'Calendar Link': event.htmlLink || '',
      'Calendar Status': status,
      'Calendar Last Sync': new Date(),
      'Calendar Error': ''
    });

    return {
      habilitado: true,
      sincronizado: true,
      action: action,
      eventId: event.id || '',
      htmlLink: event.htmlLink || '',
      status: status,
      summary: resource.summary,
      location: resource.location
    };

  } catch (err) {
    WAPP_V17_setPresupuestoByHeaders_(row, {
      'Calendar Status': 'ERROR',
      'Calendar Last Sync': new Date(),
      'Calendar Error':
        err && err.message ? err.message : String(err)
    });

    throw err;
  }
}

function WAPP_V17_calendarResource_(c) {
  const inicio = WAPP_DOCV16_parseDate_(c.evaluacion.fechaInicio);
  const fin = WAPP_DOCV16_parseDate_(c.evaluacion.fechaFinal);

  if (!inicio || !fin) {
    throw new Error('Las fechas de evaluación no son válidas para Calendar.');
  }

  if (fin.getTime() < inicio.getTime()) {
    throw new Error('La Fecha Final no puede ser menor que la Fecha Inicial.');
  }

  const title = [
    'Evaluación',
    c.evaluacion.tipoEvaluacion,
    c.ctx.registro,
    c.ctx.razonSocial
  ].filter(Boolean).join(' - ');

  const equipo = (c.equipo || [])
    .map(e => '- ' + (e.nombre || 'Sin nombre') +
      (e.rol ? ' — ' + e.rol : ''))
    .join('\n');

  const description = [
    'Evento generado automáticamente desde Presupuestos y Evaluaciones.',
    'Registro OEC: ' + c.ctx.registro,
    'Razón social: ' + (c.ctx.razonSocial || ''),
    'Tipo de evaluación: ' + c.evaluacion.tipoEvaluacion,
    'Usuario responsable: ' + (c.user.nombre || ''),
    'Correo usuario: ' + (c.user.email || ''),
    'Fecha inicial: ' + WAPP_DOCV16_fechaISO_(inicio),
    'Fecha final: ' + WAPP_DOCV16_fechaISO_(fin),
    '',
    'Equipo evaluador:',
    equipo
  ].join('\n');

  const location = WAPP_V17_location_(c);
  const endExclusive = WAPP_V17_addDays_(fin, 1);

  const emails = [
    WAPP_V17_cfg_().CALENDAR_ID,
    c.ctx.email || '',
    c.ctx.email2 || ''
  ]
    .map(v => String(v || '').trim().toLowerCase())
    .filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

  const unique = [...new Set(emails)];

  return {
    summary: title,
    description: description,
    location: location,
    start: { date: WAPP_DOCV16_fechaISO_(inicio) },
    end: { date: WAPP_DOCV16_fechaISO_(endExclusive) },
    colorId: WAPP_V17_cfg_().CALENDAR_COLOR_ID,
    attendees: unique.map(email => ({ email: email })),
    reminders: {
      useDefault: false,
      overrides: WAPP_V17_cfg_().CALENDAR_REMINDERS
    },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: true
  };
}

function WAPP_V17_location_(c) {
  const sitios = Array.isArray(c.evaluacion.instalacionesProgramadas)
    ? c.evaluacion.instalacionesProgramadas
    : [];

  const list = sitios.map(s => [
    String(s.sitioNombre || s.sitioId || '').trim(),
    String(s.direccion || '').trim()
  ].filter(Boolean).join(' - ')).filter(Boolean);

  if (list.length) return list.join(' | ');
  return String(c.evaluacion.direccionOEC || '').trim();
}

/* ============================================================================
 * CORREO
 * ========================================================================== */

function WAPP_V17_enviarCorreoProgramacion_(c, calendario) {
  const aliases = GmailApp.getAliases() || [];
  const alias = WAPP_V17_cfg_().EMAIL.FROM_ALIAS;
  const aliasDisponible = aliases.indexOf(alias) >= 0;

  const cuentaEjecutora = String(
    Session.getEffectiveUser().getEmail() || ''
  ).trim().toLowerCase();

  if (!cuentaEjecutora) {
    throw new Error(
      'No fue posible determinar la cuenta Google que ejecuta la WebApp.'
    );
  }

  const actionText = calendario.action === 'updated'
    ? 'actualizado'
    : 'creado';

  const subject =
    'OGA - Programación de evaluación ' +
    c.ctx.registro + ' - ' +
    c.evaluacion.tipoEvaluacion;

  const remitenteReal = aliasDisponible
    ? alias
    : cuentaEjecutora;

  const body = [
    'Se ha ' + actionText + ' un evento en el calendario institucional.',
    '',
    'Registro OEC: ' + c.ctx.registro,
    'Razón social: ' + (c.ctx.razonSocial || 'N/D'),
    'Tipo de evaluación: ' + c.evaluacion.tipoEvaluacion,
    'Usuario responsable: ' + (c.user.nombre || 'N/D'),
    'Correo usuario: ' + (c.user.email || 'N/D'),
    'Fecha inicial: ' + WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaInicio),
    'Fecha final: ' + WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaFinal),
    'Ubicación: ' + (calendario.location || 'N/D'),
    '',
    'Enlace del evento: ' + (calendario.htmlLink || 'N/D'),
    '',
    aliasDisponible
      ? 'Remitente institucional: ' + alias
      : (
          'Remitente operativo: ' + cuentaEjecutora +
          ' | Responder a: ' + alias
        ),
    '',
    'Mensaje generado automáticamente desde Presupuestos y Evaluaciones OGA.'
  ].join('\n');

  const options = {
    cc: WAPP_V17_cfg_().EMAIL.CC,
    bcc: WAPP_V17_cfg_().EMAIL.BCC,
    name: WAPP_V17_cfg_().EMAIL.NAME,
    replyTo: alias
  };

  if (aliasDisponible) {
    options.from = alias;
  }

  GmailApp.sendEmail(
    WAPP_V17_cfg_().EMAIL.TO,
    subject,
    body,
    options
  );

  return {
    habilitado: true,
    enviado: true,
    to: WAPP_V17_cfg_().EMAIL.TO,
    cc: WAPP_V17_cfg_().EMAIL.CC,
    bcc: WAPP_V17_cfg_().EMAIL.BCC,
    from: remitenteReal,
    replyTo: alias,
    aliasInstitucionalDisponible: aliasDisponible,
    modoRemitente: aliasDisponible
      ? 'ALIAS_INSTITUCIONAL'
      : 'CUENTA_EJECUTORA_FALLBACK',
    subject: subject,
    sentAt: new Date().toISOString()
  };
}

/* ============================================================================
 * AUDITORÍA / DIAGNÓSTICO
 * ========================================================================== */

function WAPP_V17_auditar_(c, documentos, operacion) {
  try {
    const ss = WAPP_V17_db_();
    let sh = ss.getSheetByName(WAPP_V17_cfg_().SHEET_AUDIT);

    const headers = [
      'Fecha', 'Ambiente', 'Operacion_ID', 'Usuario', 'Registro_OEC',
      'Tipo_Evaluacion', 'Fila_Presupuesto', 'ID_Evaluacion',
      'Boleta_Identificador', 'Boleta_URL',
      'TC_Valor', 'TC_Fecha_Referencia', 'TC_Origen', 'TC_Online_Disponible',
      'Calendar_Event_ID', 'Calendar_Link', 'Calendar_Status',
      'Correo_Estado', 'Estado_Operacion'
    ];

    if (!sh) {
      sh = ss.insertSheet(WAPP_V17_cfg_().SHEET_AUDIT);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    } else {
      WAPP_V17_ensureHeaders_(sh, headers);
    }

    const auditData = {
      Fecha: new Date(),
      Ambiente: WAPP_getEnv_(),
      Operacion_ID: operacion.operacionId || documentos.operacionId || '',
      Usuario: c.user.email,
      Registro_OEC: c.ctx.registro,
      Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
      Fila_Presupuesto: operacion.registroOperativo.filaPresupuesto || '',
      ID_Evaluacion: operacion.registroOperativo.idEvaluacion || '',
      Boleta_Identificador: operacion.boleta.identificador || '',
      Boleta_URL:
        operacion.boleta.primary && operacion.boleta.primary.url || '',
      TC_Valor: operacion.boleta.tipoCambio || '',
      TC_Fecha_Referencia: operacion.boleta.tipoCambioFechaReferencia || '',
      TC_Origen: operacion.boleta.tipoCambioOrigen || '',
      TC_Online_Disponible:
        operacion.boleta.tipoCambioOnlineDisponible === true ? 'Sí' :
        (operacion.boleta.aplica && !operacion.boleta.skipped ? 'No' : ''),
      Calendar_Event_ID: operacion.calendario.eventId || '',
      Calendar_Link: operacion.calendario.htmlLink || '',
      Calendar_Status:
        operacion.calendario.status ||
        (operacion.calendario.habilitado ? 'PENDIENTE' : 'DESHABILITADO'),
      Correo_Estado:
        operacion.correo.enviado ? 'ENVIADO' :
        (operacion.correo.habilitado ? 'PENDIENTE' : 'DESHABILITADO'),
      Estado_Operacion: operacion.estado || ''
    };

    if (typeof WAPP_INT_upsertByKey_ === 'function') {
      WAPP_INT_upsertByKey_(
        sh,
        'Operacion_ID',
        operacion.operacionId ||
          documentos.operacionId ||
          '',
        auditData
      );
    } else {
      WAPP_V17_appendPreserveFormat_(
        sh,
        auditData
      );
    }

  } catch (e) {
    console.warn('[WAPP V1.7] Auditoría no registrada:', e);
  }
}

function WAPP_V17_preflight_() {
  const user = WAPP_SEC_assertUsuarioInterno_();
  const db = WAPP_V17_db_();

  const shP = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_PRESUPUESTO);
  const shR = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_REGISTROS);
  const shE = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_EQUIPO);
  const shB = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_BOLETA_TEMPLATE);

  const requeridos = {
    presupuesto: [
      'Registro OEC', 'Tipo Evaluacion', 'Esquema',
      'Fecha Inicial', 'Fecha Final',
      'Ev. Líder', 'Ev. Técnico', 'Exp. Técnico',
      'Ev. Acompaña', 'Formacion',
      'Evaluador Líder', 'Evaluador Técnico',
      'Experto Técnico', 'Evaluador Acompañamiento',
      'Personal Formación',
      'Calendar Event ID', 'Calendar Link',
      'Calendar Status', 'Calendar Last Sync',
      'Calendar Error', 'Boleta'
    ],
    registros: [
      'Correlativo', 'Fecha', 'Identificador', 'OEC',
      'Tasa Cambio', 'Pago por', 'Monto a Cancelar',
      'Status', 'Concepto Tarifario', 'Monto$',
      'Responsable', 'Detalle'
    ],
    equipo: [
      'ID_Asignacion', 'ID_Evaluacion', 'Registro_OEC',
      'Registro_Key', 'Tipo_Evaluacion', 'Esquema',
      'Fecha_Inicial', 'Fecha_Final',
      'Rol_Asignado', 'Rol_Key',
      'Nombre_Evaluador', 'Correo_Evaluador', 'Correo_Key',
      'Area_Evaluacion', 'Estado_Asignacion',
      'Acceso_Documentos', 'Fecha_Inicio_Acceso',
      'Fecha_Fin_Acceso', 'Fila_Presupuesto',
      'ID_Presupuesto', 'Origen_Registro',
      'Hash_Asignacion', 'Timestamp_Sync', 'Usuario_Sync',
      'Ev_documental', 'Ev_Sitio', 'Total_dias',
      'Observaciones', 'Tipo', 'Tarifa', 'Total_USD',
      'Lugar_Trabajo', 'Vigente', 'Fecha_Fin_Vigencia'
    ]
  };

  function revisarHeaders(sh, required) {
    const headers = WAPP_V17_headers_(sh);
    const faltantes = required.filter(h => headers.indexOf(h) < 0);

    return {
      nombre: sh.getName(),
      filas: sh.getLastRow(),
      totalHeaders: headers.length,
      headers: headers,
      faltantes: faltantes,
      ok: faltantes.length === 0
    };
  }

  const hojas = {
    presupuesto: revisarHeaders(shP, requeridos.presupuesto),
    registros: revisarHeaders(shR, requeridos.registros),
    equipo: revisarHeaders(shE, requeridos.equipo),
    boleta: {
      nombre: shB.getName(),
      sheetId: shB.getSheetId(),
      ok: shB.getMaxRows() >= 22 && shB.getMaxColumns() >= 7,
      celdasRequeridas: [
        'C1', 'E2', 'B6', 'F6', 'B8',
        'C10', 'G10', 'C13', 'C15',
        'C19', 'B21', 'G22'
      ]
    }
  };

  const banguat = typeof WAPP_V171_TC_preflight_ === 'function'
    ? WAPP_V171_TC_preflight_()
    : { continuidadGarantizada:false, error:'Falta 44_Tipo_Cambio_Cache_V171.gs' };
  const nextCorrelativo = WAPP_V17_siguienteCorrelativo_(shR);

  const formats = {
    plantillaBoleta: {
      renderMode:
        WAPP_V17_cfg_().BOLETA_RENDER_MODE ||
        'SHEET_TEMPLATE',
      C1: shB.getRange('C1').getNumberFormat(),
      C10: shB.getRange('C10').getNumberFormat(),
      G10: shB.getRange('G10').getNumberFormat(),
      advertenciaSeparadorMiles: (
        String(shB.getRange('C10').getNumberFormat())
          .indexOf('#,##') < 0 ||
        String(shB.getRange('G10').getNumberFormat())
          .indexOf('#,##') < 0
      )
        ? 'La plantilla no muestra separador de miles en uno o ambos montos.'
        : ''
    },
    registrosUltimaFila: WAPP_V17_formatsRegistros_(shR)
  };

  let calendar = {
    servicioDisponible:
      typeof Calendar !== 'undefined' &&
      !!Calendar.Events &&
      !!Calendar.Calendars,
    acceso: false,
    calendarId: WAPP_V17_cfg_().CALENDAR_ID,
    error: ''
  };

  if (calendar.servicioDisponible) {
    try {
      const cal = Calendar.Calendars.get(
        WAPP_V17_cfg_().CALENDAR_ID
      );
      calendar.acceso = !!cal;
      calendar.summary = cal && cal.summary || '';
    } catch (e) {
      calendar.error =
        e && e.message
          ? e.message
          : String(e);
    }
  } else {
    calendar.error =
      'Servicio avanzado Calendar v3 no habilitado.';
  }

  let aliases = [];
  let gmailError = '';

  try {
    aliases = GmailApp.getAliases() || [];
  } catch (e) {
    gmailError =
      e && e.message
        ? e.message
        : String(e);
  }

  const cuentaEjecutora = String(
    Session.getEffectiveUser().getEmail() || ''
  ).trim().toLowerCase();

  const aliasDisponible =
    aliases.indexOf(WAPP_V17_cfg_().EMAIL.FROM_ALIAS) >= 0;

  const email = {
    aliases: aliases,
    aliasRequerido: WAPP_V17_cfg_().EMAIL.FROM_ALIAS,
    aliasDisponible: aliasDisponible,
    cuentaEjecutora: cuentaEjecutora,
    remitenteOperativo:
      aliasDisponible
        ? WAPP_V17_cfg_().EMAIL.FROM_ALIAS
        : cuentaEjecutora,
    replyTo: WAPP_V17_cfg_().EMAIL.FROM_ALIAS,
    modoRemitente:
      aliasDisponible
        ? 'ALIAS_INSTITUCIONAL'
        : 'CUENTA_EJECUTORA_FALLBACK',
    operativo: !!cuentaEjecutora && !gmailError,
    advertencia:
      aliasDisponible
        ? ''
        : (
            'El alias institucional no está configurado. ' +
            'El correo se enviará automáticamente desde la cuenta ejecutora ' +
            'y usará ' + WAPP_V17_cfg_().EMAIL.FROM_ALIAS + ' como Reply-To.'
          ),
    to: WAPP_V17_cfg_().EMAIL.TO,
    cc: WAPP_V17_cfg_().EMAIL.CC,
    bcc: WAPP_V17_cfg_().EMAIL.BCC,
    error: gmailError
  };

  const hojasOk =
    hojas.presupuesto.ok &&
    hojas.registros.ok &&
    hojas.equipo.ok &&
    hojas.boleta.ok;

  const result = {
    ok:
      hojasOk &&
      banguat.continuidadGarantizada === true &&
      calendar.servicioDisponible &&
      calendar.acceso &&
      email.operativo === true &&
      !gmailError,
    usuario: user.email,
    ambiente: WAPP_getEnv_(),
    registroBoletas: {
      id: db.getId(),
      nombre: db.getName()
    },
    hojas: hojas,
    banguat: banguat,
    siguienteCorrelativoProbable: nextCorrelativo,
    formatos: formats,
    calendario: calendar,
    correo: email,
    flags: {
      calendario: WAPP_V17_calendarEnabled_(),
      correo: WAPP_V17_emailEnabled_()
    },
    nota:
      'Preflight de solo lectura. No genera Boleta, no crea eventos, ' +
      'no envía correo y no agrega filas.'
  };

  return result;
}

function WAPP_V17_formatsRegistros_(sh) {
  const headers = WAPP_V17_headers_(sh);
  const row = Math.max(2, sh.getLastRow());
  const out = {};

  ['Tasa Cambio', 'Monto a Cancelar', 'Monto$'].forEach(h => {
    const col = headers.indexOf(h) + 1;
    if (col > 0) {
      out[h] = sh.getRange(row, col).getNumberFormat();
    }
  });

  return out;
}

function WAPP_V17_previewOperacion_() {
  const c = WAPP_DOCV16_contexto_();
  const shR = WAPP_V17_sheet_(WAPP_V17_cfg_().SHEET_REGISTROS);
  const pagos = WAPP_DOCV16_calcularPagos_(c.equipo);
  const tasa = pagos.oga > 0
    ? (typeof WAPP_V171_TC_previewResolver_ === 'function' ? WAPP_V171_TC_previewResolver_() : null)
    : null;

  return {
    registro: c.ctx.registro,
    tipoEvaluacion: c.evaluacion.tipoEvaluacion,
    fechas: {
      inicio: c.evaluacion.fechaInicio,
      final: c.evaluacion.fechaFinal
    },
    pagos: pagos,
    boleta: {
      aplica: !!c.reglas.boleta,
      seGeneraria: !!c.reglas.boleta && pagos.oga > 0,
      siguienteCorrelativoProbable: WAPP_V17_siguienteCorrelativo_(shR),
      tasaCambio: tasa,
      conceptoTarifario: 'Evaluación',
      detalle: WAPP_V17_detallePagoOGA_(c.equipo)
    },
    calendario: {
      habilitado: WAPP_V17_calendarEnabled_(),
      calendarId: WAPP_V17_cfg_().CALENDAR_ID,
      recurso: WAPP_V17_calendarResource_(c)
    },
    correo: {
      habilitado: WAPP_V17_emailEnabled_(),
      to: WAPP_V17_cfg_().EMAIL.TO,
      cc: WAPP_V17_cfg_().EMAIL.CC,
      bcc: WAPP_V17_cfg_().EMAIL.BCC,
      from: WAPP_V17_cfg_().EMAIL.FROM_ALIAS
    },
    nota: 'Vista previa únicamente. No se realizaron escrituras.'
  };
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function WAPP_V17_registroKey_(registro) {
  return String(registro || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function WAPP_V17_hash_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );

  return bytes.map(b => {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function WAPP_V17_dateOnly_(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function WAPP_V17_addDays_(date, days) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

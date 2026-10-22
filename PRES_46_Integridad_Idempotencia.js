/**
 * ============================================================================
 * WAPP V1.8.1 — INTEGRIDAD / IDEMPOTENCIA / CONCURRENCIA
 * ============================================================================
 *
 * Objetivos:
 * - Mantener un ledger institucional durable por operación.
 * - Reservar correlativos de Boleta de forma persistente.
 * - Evitar que un reinicio o pérdida de UserProperties reutilice correlativos.
 * - Hacer auditorías idempotentes (upsert por Operacion_ID).
 * - Proveer diagnóstico integral por fila de Presupuesto.
 * - Permitir pruebas QA controladas de recuperación entre etapas.
 *
 * Nota:
 * LockService protege concurrencia dentro de ESTA WebApp.
 * Para el corte definitivo, el generador anterior debe dejar de reservar
 * correlativos o migrar al mismo mecanismo institucional.
 * ============================================================================
 */

const WAPP_INT_OPERATION_HEADERS = [
  'Signature',
  'Operacion_ID',
  'Registro_OEC',
  'Tipo_Evaluacion',
  'Fecha_Inicial',
  'Fecha_Final',
  'Estado',
  'Etapa',
  'Fila_Presupuesto',
  'ID_Evaluacion',
  'Presupuesto_File_ID',
  'Agenda_File_ID',
  'Informe_File_ID',
  'Boleta_Identificador',
  'Boleta_Correlativo',
  'Boleta_File_ID',
  'Calendar_Event_ID',
  'Calendar_Link',
  'Usuario_Creacion',
  'Fecha_Creacion',
  'Usuario_Ultimo',
  'Fecha_Ultima',
  'Ultimo_Error',
  'Version'
];

const WAPP_INT_CORRELATIVO_HEADERS = [
  'Reserva_ID',
  'Operacion_ID',
  'Signature',
  'Correlativo',
  'Anio',
  'Registro_OEC',
  'Tipo_Evaluacion',
  'Estado',
  'Identificador',
  'Fila_Registros',
  'Usuario',
  'Reservado_At',
  'Commit_At',
  'Version'
];

function WAPP_INT_cfg_() {
  const cfg = WAPP_cfg_();
  return cfg.INTEGRIDAD || {
    SHEET_OPERACIONES: 'Control_Operaciones_WebApp',
    SHEET_CORRELATIVOS: 'Reservas_Correlativos_Boleta',
    LOCK_TIMEOUT_MS: 60000,
    PROP_FAULT_STAGE: 'WAPP_V181_FAULT_STAGE',
    ENABLE_FAULT_INJECTION_QA: false
  };
}

function WAPP_INT_db_() {
  return SpreadsheetApp.openById(
    WAPP_cfg_().REGISTRO_BOLETAS_ID
  );
}

function WAPP_INT_sheet_(name, headers) {
  const ss = WAPP_INT_db_();
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  WAPP_V17_ensureHeaders_(sh, headers);
  return sh;
}

function WAPP_INT_operationsSheet_() {
  return WAPP_INT_sheet_(
    WAPP_INT_cfg_().SHEET_OPERACIONES,
    WAPP_INT_OPERATION_HEADERS
  );
}

function WAPP_INT_correlativosSheet_() {
  return WAPP_INT_sheet_(
    WAPP_INT_cfg_().SHEET_CORRELATIVOS,
    WAPP_INT_CORRELATIVO_HEADERS
  );
}

function WAPP_INT_findRowBy_(sh, header, value) {
  const target = String(value == null ? '' : value).trim();
  if (!target) return null;

  const rows = WAPP_V17_rows_(sh);

  return rows.find(r =>
    String(r[header] == null ? '' : r[header]).trim() === target
  ) || null;
}

function WAPP_INT_upsertByKey_(sh, keyHeader, keyValue, data) {
  const target = String(
    keyValue == null ? '' : keyValue
  ).trim();

  if (!target) {
    const row = WAPP_V17_appendPreserveFormat_(
      sh,
      data
    );

    return {
      row: row,
      inserted: true,
      deduplicated: 0,
      warning: 'Clave vacía; se agregó fila sin deduplicación.'
    };
  }

  const matches = WAPP_V17_rows_(sh)
    .filter(r =>
      String(
        r[keyHeader] == null
          ? ''
          : r[keyHeader]
      ).trim() === target
    );

  if (matches.length) {
    const canonical = matches[0];

    WAPP_V17_setByHeaders_(
      sh,
      Number(canonical.__rowNumber),
      data
    );

    /*
     * Si una doble solicitud concurrente dejó filas repetidas antes de
     * que el UPSERT pudiera consolidarlas, conservamos una fila canónica
     * y eliminamos las restantes en orden descendente.
     */
    const duplicateRows = matches
      .slice(1)
      .map(r => Number(r.__rowNumber))
      .filter(n => Number.isInteger(n) && n >= 2)
      .sort((a, b) => b - a);

    duplicateRows.forEach(rowNumber => {
      sh.deleteRow(rowNumber);
    });

    return {
      row: Number(canonical.__rowNumber),
      inserted: false,
      deduplicated: duplicateRows.length
    };
  }

  const row = WAPP_V17_appendPreserveFormat_(
    sh,
    data
  );

  return {
    row: row,
    inserted: true,
    deduplicated: 0
  };
}

function WAPP_INT_repararDuplicadosPorClave_(sh, keyHeader) {
  const rows = WAPP_V17_rows_(sh);

  const groups = {};

  rows.forEach(r => {
    const key = String(
      r[keyHeader] == null ? '' : r[keyHeader]
    ).trim();

    if (!key) return;

    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const detalle = [];
  const rowsToDelete = [];

  Object.keys(groups).forEach(key => {
    const group = groups[key];

    if (group.length <= 1) return;

    const canonical = group[0];

    group.slice(1).forEach(r => {
      rowsToDelete.push(
        Number(r.__rowNumber)
      );
    });

    detalle.push({
      key: key,
      canonicalRow:
        Number(canonical.__rowNumber),
      duplicates:
        group.length - 1
    });
  });

  rowsToDelete
    .filter(n => Number.isInteger(n) && n >= 2)
    .sort((a, b) => b - a)
    .forEach(rowNumber => {
      sh.deleteRow(rowNumber);
    });

  return {
    ok: true,
    keyHeader: keyHeader,
    groupsRepaired: detalle.length,
    rowsDeleted: rowsToDelete.length,
    detalle: detalle
  };
}

/* ============================================================================
 * LEDGER DE OPERACIONES
 * ========================================================================== */

function WAPP_INT_beginOperation_(signature, c, operacionId) {
  const sh = WAPP_INT_operationsSheet_();
  const now = new Date();
  const user = c && c.user && c.user.email
    ? c.user.email
    : WAPP_SEC_getEmail_();

  const existing = WAPP_INT_findRowBy_(
    sh,
    'Signature',
    signature
  );

  if (existing) {
    WAPP_V17_setByHeaders_(
      sh,
      Number(existing.__rowNumber),
      {
        Usuario_Ultimo: user,
        Fecha_Ultima: now,
        Version: WAPP_VERSION
      }
    );

    return Object.assign(
      { reused: true },
      existing
    );
  }

  const data = {
    Signature: signature,
    Operacion_ID: operacionId,
    Registro_OEC: c.ctx.registro,
    Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
    Fecha_Inicial: c.evaluacion.fechaInicio,
    Fecha_Final: c.evaluacion.fechaFinal,
    Estado: 'EN_PROCESO',
    Etapa: 'INICIO',
    Fila_Presupuesto: '',
    ID_Evaluacion: '',
    Presupuesto_File_ID: '',
    Agenda_File_ID: '',
    Informe_File_ID: '',
    Boleta_Identificador: '',
    Boleta_Correlativo: '',
    Boleta_File_ID: '',
    Calendar_Event_ID: '',
    Calendar_Link: '',
    Usuario_Creacion: user,
    Fecha_Creacion: now,
    Usuario_Ultimo: user,
    Fecha_Ultima: now,
    Ultimo_Error: '',
    Version: WAPP_VERSION
  };

  const row = WAPP_V17_appendPreserveFormat_(sh, data);

  return Object.assign(
    {
      reused: false,
      __rowNumber: row
    },
    data
  );
}

function WAPP_INT_updateOperation_(signature, data) {
  if (!signature) return null;

  const sh = WAPP_INT_operationsSheet_();
  const found = WAPP_INT_findRowBy_(
    sh,
    'Signature',
    signature
  );

  const payload = Object.assign(
    {
      Usuario_Ultimo: WAPP_SEC_getEmail_(),
      Fecha_Ultima: new Date(),
      Version: WAPP_VERSION
    },
    data || {}
  );

  if (found && found.__rowNumber) {
    WAPP_V17_setByHeaders_(
      sh,
      Number(found.__rowNumber),
      payload
    );
    return Number(found.__rowNumber);
  }

  payload.Signature = signature;
  return WAPP_V17_appendPreserveFormat_(
    sh,
    payload
  );
}

function WAPP_INT_markError_(signature, err, etapa) {
  return WAPP_INT_updateOperation_(
    signature,
    {
      Estado: 'PARCIAL',
      Etapa: etapa || 'ERROR',
      Ultimo_Error:
        err && err.message
          ? err.message
          : String(err || '')
    }
  );
}

function WAPP_INT_markCompleted_(signature, result) {
  result = result || {};

  return WAPP_INT_updateOperation_(
    signature,
    {
      Estado: result.estado || 'COMPLETADO',
      Etapa: 'FINALIZADA',
      Ultimo_Error: '',
      Fila_Presupuesto:
        result.registroOperativo &&
        result.registroOperativo.filaPresupuesto || '',
      ID_Evaluacion:
        result.registroOperativo &&
        result.registroOperativo.idEvaluacion || '',
      Boleta_Identificador:
        result.boleta &&
        result.boleta.identificador || '',
      Boleta_Correlativo:
        result.boleta &&
        result.boleta.correlativo || '',
      Boleta_File_ID:
        result.boleta &&
        result.boleta.primary &&
        result.boleta.primary.id || '',
      Calendar_Event_ID:
        result.calendario &&
        result.calendario.eventId || '',
      Calendar_Link:
        result.calendario &&
        result.calendario.htmlLink || ''
    }
  );
}

/* ============================================================================
 * RESERVA PERSISTENTE DE CORRELATIVOS
 * ========================================================================== */

function WAPP_INT_reservarCorrelativo_(
  shReg,
  c,
  operacionId,
  signature
) {
  const sh = WAPP_INT_correlativosSheet_();

  const existing = WAPP_INT_findRowBy_(
    sh,
    'Operacion_ID',
    operacionId
  );

  if (existing) {
    const n = Number(existing.Correlativo);

    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(
        'La reserva existente para ' + operacionId +
        ' no contiene un correlativo válido.'
      );
    }

    return {
      correlativo: n,
      reservaId: String(existing.Reserva_ID || ''),
      reused: true,
      estado: String(existing.Estado || '')
    };
  }

  const rows = WAPP_V17_rows_(sh);

  let maxReserva = 0;
  rows.forEach(r => {
    const n = Number(r.Correlativo);
    if (Number.isFinite(n) && n > maxReserva) {
      maxReserva = n;
    }
  });

  const desdeRegistros =
    WAPP_V17_siguienteCorrelativo_(shReg);

  const props = PropertiesService.getScriptProperties();
  const propertyKey = 'WAPP_V17_BOLETA_NEXT_CORRELATIVO';
  const desdeProp = Number(
    props.getProperty(propertyKey) || 0
  );

  const correlativo = Math.max(
    desdeRegistros,
    maxReserva + 1,
    Number.isFinite(desdeProp) && desdeProp > 0
      ? desdeProp
      : 0
  );

  const reservaId =
    'RES-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 16)
      .toUpperCase();

  WAPP_V17_appendPreserveFormat_(
    sh,
    {
      Reserva_ID: reservaId,
      Operacion_ID: operacionId,
      Signature: signature || '',
      Correlativo: correlativo,
      Anio: new Date().getFullYear(),
      Registro_OEC: c.ctx.registro,
      Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
      Estado: 'RESERVED',
      Identificador: '',
      Fila_Registros: '',
      Usuario: c.user.email || WAPP_SEC_getEmail_(),
      Reservado_At: new Date(),
      Commit_At: '',
      Version: WAPP_VERSION
    }
  );

  props.setProperty(
    propertyKey,
    String(correlativo + 1)
  );

  return {
    correlativo: correlativo,
    reservaId: reservaId,
    reused: false,
    estado: 'RESERVED'
  };
}

function WAPP_INT_commitCorrelativo_(
  operacionId,
  correlativo,
  identificador,
  filaRegistros
) {
  const sh = WAPP_INT_correlativosSheet_();

  const existing = WAPP_INT_findRowBy_(
    sh,
    'Operacion_ID',
    operacionId
  );

  if (!existing || !existing.__rowNumber) {
    throw new Error(
      'No existe reserva persistente para la operación ' +
      operacionId + '.'
    );
  }

  const reservado = Number(existing.Correlativo);

  if (
    Number(reservado) !== Number(correlativo)
  ) {
    throw new Error(
      'El correlativo confirmado (' + correlativo +
      ') no coincide con el reservado (' + reservado + ').'
    );
  }

  WAPP_V17_setByHeaders_(
    sh,
    Number(existing.__rowNumber),
    {
      Estado: 'COMMITTED',
      Identificador: identificador,
      Fila_Registros: filaRegistros,
      Commit_At: new Date(),
      Version: WAPP_VERSION
    }
  );

  return true;
}

/* ============================================================================
 * INYECCIÓN CONTROLADA DE FALLOS — SOLO QA
 * ========================================================================== */

function WAPP_INT_faultMaybe_(stage) {
  const cfg = WAPP_INT_cfg_();

  if (
    WAPP_getEnv_() !== 'QA' ||
    cfg.ENABLE_FAULT_INJECTION_QA !== true
  ) {
    return false;
  }

  const props = PropertiesService.getScriptProperties();
  const requested = String(
    props.getProperty(cfg.PROP_FAULT_STAGE) || ''
  ).trim().toUpperCase();

  const current = String(stage || '')
    .trim()
    .toUpperCase();

  if (!requested || requested !== current) {
    return false;
  }

  // One-shot: se limpia ANTES de lanzar el fallo.
  props.deleteProperty(cfg.PROP_FAULT_STAGE);

  throw new Error(
    'FALLO_QA_SIMULADO:' + current
  );
}

function WAPP_INT_setFaultStage_(stage) {
  if (WAPP_getEnv_() !== 'QA') {
    throw new Error(
      'La inyección de fallos sólo está permitida en QA.'
    );
  }

  const allowed = [
    'AFTER_PRESUPUESTO',
    'AFTER_EQUIPO',
    'AFTER_BOLETA',
    'AFTER_CALENDAR'
  ];

  const clean = String(stage || '')
    .trim()
    .toUpperCase();

  if (allowed.indexOf(clean) < 0) {
    throw new Error(
      'Etapa no permitida: ' + clean
    );
  }

  PropertiesService.getScriptProperties()
    .setProperty(
      WAPP_INT_cfg_().PROP_FAULT_STAGE,
      clean
    );

  return clean;
}

/* ============================================================================
 * DIAGNÓSTICO DE INTEGRIDAD POR FILA DE PRESUPUESTO
 * ========================================================================== */

function WAPP_INT_countFilesByName_(folder, name) {
  if (!folder || !name) return 0;

  const it = folder.getFilesByName(name);
  let count = 0;

  while (it.hasNext()) {
    it.next();
    count++;
  }

  return count;
}

function WAPP_INT_diagnosticarFila_(filaPresupuesto) {
  const row = Number(filaPresupuesto);

  if (!Number.isInteger(row) || row < 2) {
    throw new Error(
      'Fila de Presupuesto inválida: ' + filaPresupuesto
    );
  }

  const cfg = WAPP_V17_cfg_();
  const shP = WAPP_V17_sheet_(cfg.SHEET_PRESUPUESTO);
  const shE = WAPP_V17_sheet_(cfg.SHEET_EQUIPO);
  const shR = WAPP_V17_sheet_(cfg.SHEET_REGISTROS);

  if (row > shP.getLastRow()) {
    throw new Error(
      'La fila ' + row + ' no existe en Presupuesto.'
    );
  }

  const p = WAPP_V17_getRowObject_(
    shP,
    row,
    true
  );

  const registro = String(
    p['Registro OEC'] || ''
  ).trim();

  const tipo = String(
    p['Tipo Evaluacion'] || ''
  ).trim();

  const fechaInicial = p['Fecha Inicial'];

  const idEvaluacion =
    'EV-' +
    WAPP_V17_registroKey_(registro) +
    '-' +
    row;

  const equipo = WAPP_V17_rows_(shE)
    .filter(r =>
      Number(r.Fila_Presupuesto) === row ||
      String(r.ID_Evaluacion || '') === idEvaluacion
    );

  const hashes = equipo
    .map(r => String(r.Hash_Asignacion || '').trim())
    .filter(Boolean);

  const hashSet = new Set(hashes);

  const boletaId = String(
    p.Boleta || ''
  ).trim();

  const registros = boletaId
    ? WAPP_V17_rows_(shR).filter(r =>
        String(r.Identificador || '').trim() === boletaId
      )
    : [];

  const correlativo =
    registros.length
      ? Number(registros[0].Correlativo || 0)
      : 0;

  const registrosMismoCorrelativo =
    correlativo > 0
      ? WAPP_V17_rows_(shR).filter(r =>
          Number(r.Correlativo || 0) === correlativo
        )
      : [];

  const destinos = registro
    ? WAPP_DOCV16_resolverDestinos_(registro)
    : null;

  const reglas = tipo
    ? WAPP_DOC_PREVIEW_rules_(tipo)
    : {
        presupuesto: false,
        agenda: false,
        informe: false,
        boleta: false
      };

  const fechaIso = WAPP_DOCV16_fechaISO_(
    fechaInicial
  );

  const nombrePresupuesto =
    WAPP_DOCV16_nombreDocumento_(
      'Presupuesto',
      registro,
      tipo,
      fechaIso
    ) + '.pdf';

  const nombreAgenda =
    WAPP_DOCV16_nombreDocumento_(
      'Agenda',
      registro,
      tipo,
      fechaIso
    );

  const nombreInforme =
    WAPP_DOCV16_nombreDocumento_(
      'Informe',
      registro,
      tipo,
      fechaIso
    );

  let nombreBoleta = '';

  if (correlativo > 0) {
    nombreBoleta = [
      'Boleta_' +
        String(correlativo).padStart(4, '0'),
      WAPP_DOCV16_registroSeguro_(registro),
      WAPP_DOCV16_nombreSeguro_(tipo),
      fechaIso
    ].join('_') + '.pdf';
  }

  const docs = {
    presupuesto: {
      aplica: !!reglas.presupuesto,
      primary:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.presupuesto,
              nombrePresupuesto
            )
          : 0,
      backup:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.backupPresupuesto,
              nombrePresupuesto
            )
          : 0,
      nombre: nombrePresupuesto
    },
    agenda: {
      aplica: !!reglas.agenda,
      primary:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.agenda,
              nombreAgenda
            )
          : 0,
      backup:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.backupAgenda,
              nombreAgenda
            )
          : 0,
      nombre: nombreAgenda
    },
    informe: {
      aplica: !!reglas.informe,
      primary:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.informe,
              nombreInforme
            )
          : 0,
      backup:
        destinos
          ? WAPP_INT_countFilesByName_(
              destinos.backupInforme,
              nombreInforme
            )
          : 0,
      nombre: nombreInforme
    },
    boleta: {
      aplica: !!reglas.boleta && !!boletaId,
      primary:
        destinos && nombreBoleta
          ? WAPP_INT_countFilesByName_(
              destinos.presupuesto,
              nombreBoleta
            )
          : 0,
      backup:
        nombreBoleta
          ? WAPP_INT_countFilesByName_(
              DriveApp.getFolderById(
                cfg.BACKUP_BOLETA_FOLDER_ID
              ),
              nombreBoleta
            )
          : 0,
      nombre: nombreBoleta
    }
  };

  const calendarEventId = String(
    p['Calendar Event ID'] || ''
  ).trim();

  let calendar = {
    requerido:
      WAPP_V17_calendarEnabled_(),
    eventId: calendarEventId,
    existe: false,
    error: ''
  };

  if (
    calendarEventId &&
    typeof Calendar !== 'undefined' &&
    Calendar.Events
  ) {
    try {
      const ev = Calendar.Events.get(
        cfg.CALENDAR_ID,
        calendarEventId
      );
      calendar.existe = !!ev;
      calendar.status = ev && ev.status || '';
      calendar.summary = ev && ev.summary || '';
    } catch (e) {
      calendar.error =
        e && e.message
          ? e.message
          : String(e);
    }
  }

  const operationSh = WAPP_V17_db_()
    .getSheetByName(
      WAPP_INT_cfg_().SHEET_OPERACIONES
    );

  const ledger = operationSh
    ? WAPP_V17_rows_(operationSh).filter(r =>
        Number(r.Fila_Presupuesto) === row
      )
    : [];

  const operacionIdActual =
    ledger.length === 1
      ? String(
          ledger[0].Operacion_ID || ''
        ).trim()
      : '';

  const auditSh = WAPP_V17_db_()
    .getSheetByName(cfg.SHEET_AUDIT);

  const audit = auditSh
    ? WAPP_V17_rows_(auditSh).filter(r => {
        if (operacionIdActual) {
          return String(
            r.Operacion_ID || ''
          ).trim() === operacionIdActual;
        }

        return Number(
          r.Fila_Presupuesto
        ) === row;
      })
    : [];

  const checks = {
    presupuestoFila: !!registro,
    equipoExiste: equipo.length > 0,
    equipoSinHashesDuplicados:
      hashes.length === hashSet.size,
    boletaRegistroUnico:
      !boletaId || registros.length === 1,
    correlativoUnico:
      !correlativo ||
      registrosMismoCorrelativo.length === 1,
    presupuestoArchivo:
      !reglas.presupuesto ||
      (
        docs.presupuesto.primary === 1 &&
        docs.presupuesto.backup === 1
      ),
    agendaArchivo:
      !reglas.agenda ||
      (
        docs.agenda.primary === 1 &&
        docs.agenda.backup === 1
      ),
    informeArchivo:
      !reglas.informe ||
      (
        docs.informe.primary === 1 &&
        docs.informe.backup === 1
      ),
    boletaArchivo:
      !docs.boleta.aplica ||
      (
        docs.boleta.primary === 1 &&
        docs.boleta.backup === 1
      ),
    calendar:
      !calendar.requerido ||
      calendar.existe === true,
    bitacoraOperacion:
      audit.length === 1,
    ledgerOperacion:
      ledger.length <= 1
  };

  const errors = Object.keys(checks)
    .filter(k => checks[k] !== true);

  return {
    ok: errors.length === 0,
    filaPresupuesto: row,
    registro: registro,
    tipoEvaluacion: tipo,
    idEvaluacion: idEvaluacion,
    boleta: {
      identificador: boletaId,
      correlativo: correlativo,
      registrosEncontrados: registros.length,
      usosCorrelativo:
        registrosMismoCorrelativo.length
    },
    equipo: {
      total: equipo.length,
      hashes: hashes.length,
      hashesUnicos: hashSet.size
    },
    documentos: docs,
    calendario: calendar,
    bitacora: {
      registros: audit.length
    },
    ledger: {
      registros: ledger.length,
      estado:
        ledger.length
          ? String(ledger[0].Estado || '')
          : ''
    },
    checks: checks,
    errores: errors
  };
}

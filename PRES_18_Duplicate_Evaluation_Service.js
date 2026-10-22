const WAPP_DUP_AUTH_KEY = 'WAPP_DUPLICATE_AUTH_V1';
const WAPP_DUP_AUDIT_SHEET = 'Autorizaciones_Duplicados';
const WAPP_DUP_ADMIN_EMAILS = [
  'carchila@oga.org.gt'
];

function WAPP_DUP_isAdmin_(email) {
  const e = String(email || '').trim().toLowerCase();
  return WAPP_DUP_ADMIN_EMAILS.includes(e);
}

/**
 * Regla V1.5:
 * Potencial duplicado = mismo OEC + mismo tipo normalizado + mismo año
 * de Fecha Inicial.
 *
 * Si además coinciden Fecha Inicial y Fecha Final se clasifica EXACTA.
 *
 * Esto evita bloquear seguimientos legítimos de años distintos.
 */

/**
 * P1-R2 — Una evaluación cancelada permanece como antecedente histórico,
 * pero no representa una programación activa reutilizable.
 */
function WAPP_DUP_esCanceladaEstado_(estado) {
  return WAPP_norm_(estado) === WAPP_norm_('EVALUACION_CANCELADA');
}

function WAPP_DUP_separarAntecedentes_(rows) {
  const activos = [];
  const cancelados = [];

  (rows || []).forEach(r => {
    if (r && (
      r.cancelada === true ||
      WAPP_DUP_esCanceladaEstado_(r.erEstado)
    )) {
      cancelados.push(r);
    } else {
      activos.push(r);
    }
  });

  return {
    activos: activos,
    cancelados: cancelados
  };
}

function WAPP_DUP_check_(payload, user) {
  payload = payload || {};

  const flow = WAPP_FLOW_get_();
  const registro = String(
    payload.registro || flow.registro || ''
  ).trim().toUpperCase();

  const tipo = String(payload.tipoEvaluacion || '').trim();
  const fechaInicio = WAPP_DUP_dateISO_(payload.fechaInicio);
  const fechaFinal = WAPP_DUP_dateISO_(payload.fechaFinal);
  const sinControlFechas = WAPP_EVAL_esRevisionDocumentalAC_(tipo);

  if (!registro) throw new Error('No existe un OEC activo.');
  if (!tipo) throw new Error('Debe seleccionarse un tipo de evaluación.');

  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_BOLETAS_ID);
  const sh = ss.getSheetByName(cfg.HOJA_PRESUPUESTO || 'Presupuesto');

  if (!sh) throw new Error('No existe la hoja Presupuesto.');

  /*
   * P1-R2:
   * - Mismo OEC + mismo tipo continúa siendo la primera parada.
   * - EVALUACION_CANCELADA se conserva como antecedente histórico,
   *   pero NO fuerza Reprogramación ni OTP por sí sola.
   * - Cualquier coincidencia no cancelada conserva la regla existente.
   */
  const todos = WAPP_rowsByHeaders_(sh)
    .filter(r =>
      String(r['Registro OEC'] || '').trim().toUpperCase() === registro &&
      WAPP_norm_(r['Tipo Evaluacion']) === WAPP_norm_(tipo)
    )
    .map(r => {
      const inicio = WAPP_DUP_dateISO_(r['Fecha Inicial']);
      const fin = WAPP_DUP_dateISO_(r['Fecha Final']);
      const erEstado = String(r['ER Estado'] || '').trim();
      const cancelada = WAPP_DUP_esCanceladaEstado_(erEstado);

      let clasificacion = 'MISMO_OEC_MISMO_TIPO';

      if (cancelada) {
        clasificacion = 'ANTECEDENTE_CANCELADO';
      } else if (sinControlFechas) {
        clasificacion = 'MISMO_TIPO_SIN_VALIDAR_FECHAS';
      } else if (
        fechaInicio &&
        fechaFinal &&
        inicio === fechaInicio &&
        fin === fechaFinal
      ) {
        clasificacion = 'COINCIDENCIA_EXACTA';
      } else if (fechaInicio || fechaFinal) {
        clasificacion = 'MISMO_TIPO_FECHAS_DIFERENTES';
      }

      return {
        rowNumber: r.__rowNumber,
        tipoEvaluacion: String(r['Tipo Evaluacion'] || '').trim(),
        fechaInicio: inicio,
        fechaFinal: fin,
        boleta: String(r.Boleta || '').trim(),
        calendarStatus: String(r['Calendar Status'] || '').trim(),
        erEstado: erEstado,
        cancelada: cancelada,
        clasificacion: clasificacion
      };
    })
    .sort((a, b) => a.rowNumber - b.rowNumber);

  const separados = WAPP_DUP_separarAntecedentes_(todos);
  const matches = separados.activos;
  const historicosCancelados = separados.cancelados;

  const signature = WAPP_DUP_signature_({
    registro: registro,
    tipoEvaluacion: tipo,
    // Para revisión documental AC, las fechas no forman parte de la autorización.
    fechaInicio: sinControlFechas ? '' : fechaInicio,
    fechaFinal: sinControlFechas ? '' : fechaFinal,
    // Sólo los antecedentes activos forman parte de la autorización.
    filas: matches.map(x => x.rowNumber)
  });

  const authorization = WAPP_DUP_getValidAuthorization_(signature);
  const email = user && user.email
    ? user.email
    : WAPP_SEC_getEmail_();

  return {
    hasDuplicates: matches.length > 0,
    duplicates: matches,

    // Información histórica para trazabilidad; no bloquea una nueva alta.
    cancelledHistory: historicosCancelados,
    ignoredCancelledCount: historicosCancelados.length,

    isAdmin: WAPP_DUP_isAdmin_(email),
    authorized: !!authorization,
    authorization: authorization,
    signature: signature,
    registro: registro,
    tipoEvaluacion: tipo,
    fechaInicio: fechaInicio,
    fechaFinal: fechaFinal,
    sinControlFechas: sinControlFechas,
    requiereReprogramacion: matches.length > 0,
    accionSugerida: matches.length > 0 ? 'REPROGRAMACION' : 'NUEVA_EVALUACION'
  };
}
function WAPP_DUP_authorize_(payload, user) {
  throw new Error(
    'La autorización directa está deshabilitada. ' +
    'Solicite y valide el token enviado a la cuenta administradora.'
  );
}

/**
 * Sólo debe invocarse desde WAPP_DUP_OTP_validar_ después de validar
 * correctamente el OTP de jefatura.
 */
function WAPP_DUP_authorizeOtpValidated_(check, motivo, requester, adminEmail) {
  if (!check || !check.hasDuplicates) {
    throw new Error(
      'La operación ya no presenta coincidencias que requieran autorización.'
    );
  }

  const id = 'DUP-' +
    Utilities.formatDate(new Date(), WAPP_cfg_().TZ, 'yyyyMMdd-HHmmss') +
    '-' + Utilities.getUuid().slice(0, 8).toUpperCase();

  const adminNombre = WAPP_DUP_adminName_(adminEmail);

  const auth = {
    idAutorizacion: id,
    signature: check.signature,
    registro: check.registro,
    tipoEvaluacion: check.tipoEvaluacion,
    fechaInicio: check.fechaInicio,
    fechaFinal: check.fechaFinal,
    filasAntecedentes: check.duplicates.map(x => x.rowNumber),
    motivo: String(motivo || '').trim(),
    solicitadoPor: requester && requester.email || '',
    solicitadoNombre: requester && requester.nombre || '',
    autorizadoPor: String(adminEmail || '').trim().toLowerCase(),
    autorizadoNombre: adminNombre,
    metodoAutorizacion: 'OTP_EMAIL',
    fechaAutorizacion: new Date().toISOString()
  };

  WAPP_STATE_props_().setProperty(
    WAPP_DUP_AUTH_KEY,
    JSON.stringify(auth)
  );

  WAPP_DUP_audit_(auth);
  return auth;
}

function WAPP_DUP_adminName_(email) {
  try {
    const cfg = WAPP_cfg_();
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
    const sh = ss.getSheetByName(cfg.HOJA_OFICIALES || 'Oficiales');
    if (!sh) return 'Jefatura';

    const target = String(email || '').trim().toLowerCase();
    const row = WAPP_rowsByHeaders_(sh).find(r =>
      String(r.correo || '').trim().toLowerCase() === target
    );

    return row
      ? String(row.nombre_completo || 'Jefatura').trim()
      : 'Jefatura';
  } catch (e) {
    return 'Jefatura';
  }
}

function WAPP_DUP_assertAllowed_(payload, user) {
  const check = WAPP_DUP_check_(payload, user);

  if (check.hasDuplicates && !check.authorized) {
    throw new Error(
      'Ya existe una evaluación del mismo tipo para este OEC. ' +
      'Si necesita modificar fechas, integrantes u otros datos de esa evaluación, ' +
      'debe utilizar el módulo de Reprogramación. ' +
      'Sólo una evaluación adicional e independiente puede continuar mediante ' +
      'autorización administrativa.'
    );
  }

  if (!check.hasDuplicates) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_AUTH_KEY);
  }

  return check;
}

function WAPP_DUP_getValidAuthorization_(signature) {
  const raw = WAPP_STATE_props_().getProperty(WAPP_DUP_AUTH_KEY);
  if (!raw) return null;

  try {
    const auth = JSON.parse(raw);
    if (String(auth.signature || '') !== String(signature || '')) {
      return null;
    }
    return auth;
  } catch (e) {
    return null;
  }
}

function WAPP_DUP_getCurrentForEvaluation_(evaluacion) {
  if (!evaluacion) return null;

  return WAPP_DUP_check_({
    registro: evaluacion.registro,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal
  }, WAPP_SEC_assertUsuarioInterno_());
}

function WAPP_DUP_signature_(data) {
  const stable = JSON.stringify(data || {});
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    stable,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function WAPP_DUP_dateISO_(value) {
  if (value == null || value === '') return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, WAPP_cfg_().TZ, 'yyyy-MM-dd');
  }

  const s = String(value).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return [
      m[1],
      String(m[2]).padStart(2, '0'),
      String(m[3]).padStart(2, '0')
    ].join('-');
  }

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    return [
      m[3],
      String(m[2]).padStart(2, '0'),
      String(m[1]).padStart(2, '0')
    ].join('-');
  }

  return '';
}

function WAPP_DUP_audit_(auth) {
  const cfg = WAPP_cfg_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
    let sh = ss.getSheetByName(WAPP_DUP_AUDIT_SHEET);

    const headers = [
      'ID_Autorizacion',
      'Fecha_Autorizacion',
      'Registro_OEC',
      'Tipo_Evaluacion',
      'Fecha_Inicial',
      'Fecha_Final',
      'Filas_Antecedentes',
      'Motivo',
      'Solicitado_Por',
      'Solicitado_Nombre',
      'Autorizado_Por',
      'Autorizado_Nombre',
      'Metodo_Autorizacion',
      'Ambiente',
      'Firma_Operacion'
    ];

    if (!sh) {
      sh = ss.insertSheet(WAPP_DUP_AUDIT_SHEET);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    } else {
      WAPP_DUP_ensureAuditHeaders_(sh, headers);
    }

    WAPP_appendByHeaders_(sh, {
      ID_Autorizacion: auth.idAutorizacion,
      Fecha_Autorizacion: new Date(),
      Registro_OEC: auth.registro,
      Tipo_Evaluacion: auth.tipoEvaluacion,
      Fecha_Inicial: auth.fechaInicio,
      Fecha_Final: auth.fechaFinal,
      Filas_Antecedentes: (auth.filasAntecedentes || []).join(','),
      Motivo: auth.motivo,
      Solicitado_Por: auth.solicitadoPor || '',
      Solicitado_Nombre: auth.solicitadoNombre || '',
      Autorizado_Por: auth.autorizadoPor,
      Autorizado_Nombre: auth.autorizadoNombre,
      Metodo_Autorizacion: auth.metodoAutorizacion || 'OTP_EMAIL',
      Ambiente: WAPP_getEnv_(),
      Firma_Operacion: auth.signature
    });

  } finally {
    lock.releaseLock();
  }
}

function WAPP_DUP_ensureAuditHeaders_(sheet, requiredHeaders) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const current = sheet.getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(x => String(x || '').trim());

  let nextCol = current.length + 1;

  requiredHeaders.forEach(h => {
    if (!current.includes(h)) {
      sheet.getRange(1, nextCol).setValue(h);
      current.push(h);
      nextCol++;
    }
  });
}


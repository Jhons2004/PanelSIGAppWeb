const WAPP_DUP_OTP_KEY = 'WAPP_DUPLICATE_OTP_V1';
const WAPP_DUP_OTP_TTL_MS = 10 * 60 * 1000;
const WAPP_DUP_OTP_COOLDOWN_MS = 60 * 1000;
const WAPP_DUP_OTP_MAX_ATTEMPTS = 5;

function WAPP_DUP_OTP_solicitar_(payload, requester) {
  payload = payload || {};
  requester = requester || WAPP_SEC_assertUsuarioInterno_();

  const motivo = String(payload.motivo || '').trim();
  if (motivo.length < 5) {
    throw new Error(
      'Ingrese una justificación de al menos 5 caracteres antes de solicitar el token.'
    );
  }

  const check = WAPP_DUP_check_(payload, requester);
  if (!check.hasDuplicates) {
    throw new Error(
      'La operación ya no presenta coincidencias que requieran autorización.'
    );
  }

  const adminEmail = String(WAPP_DUP_adminEmails_()[0] || '').trim().toLowerCase();
  if (!WAPP_emailOk_(adminEmail)) {
    throw new Error('No existe una cuenta administradora válida configurada.');
  }

  const props = WAPP_STATE_props_();
  const now = Date.now();
  const previous = WAPP_DUP_OTP_getPending_();

  if (
    previous &&
    previous.signature === check.signature &&
    Number(previous.createdAtMs || 0) > 0 &&
    now - Number(previous.createdAtMs) < WAPP_DUP_OTP_COOLDOWN_MS
  ) {
    const waitSeconds = Math.ceil(
      (WAPP_DUP_OTP_COOLDOWN_MS - (now - Number(previous.createdAtMs))) / 1000
    );
    throw new Error(
      'Ya se solicitó un token recientemente. Espere ' +
      waitSeconds + ' segundos antes de solicitar otro.'
    );
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error(
      'No hay cuota disponible para enviar el token de autorización por correo.'
    );
  }

  const code = WAPP_DUP_OTP_generateCode_();
  const salt = Utilities.getUuid();
  const expiresAtMs = now + WAPP_DUP_OTP_TTL_MS;

  const record = {
    signature: check.signature,
    hash: WAPP_DUP_OTP_hash_(code, salt, check.signature),
    salt: salt,
    createdAtMs: now,
    expiresAtMs: expiresAtMs,
    attempts: 0,
    requesterEmail: requester.email,
    requesterName: requester.nombre || '',
    adminEmail: adminEmail,
    motivo: motivo,
    registro: check.registro,
    tipoEvaluacion: check.tipoEvaluacion,
    fechaInicio: check.fechaInicio,
    fechaFinal: check.fechaFinal,
    filasAntecedentes: check.duplicates.map(x => x.rowNumber)
  };

  props.setProperty(WAPP_DUP_OTP_KEY, JSON.stringify(record));

  const adminName = WAPP_DUP_adminName_(adminEmail);
  const expiresText = Utilities.formatDate(
    new Date(expiresAtMs),
    WAPP_cfg_().TZ,
    'dd/MM/yyyy HH:mm:ss'
  );

  const rowsText = check.duplicates.map(x =>
    'Fila ' + x.rowNumber +
    ' · ' + x.tipoEvaluacion +
    ' · ' + (x.fechaInicio || '-') +
    ' al ' + (x.fechaFinal || '-')
  ).join('\n');

  const subject =
    '[OGA] Token de autorización · ' +
    check.registro + ' · ' + check.tipoEvaluacion;

  const plainBody = [
    'Autorización administrativa de evaluación adicional',
    '',
    'Código: ' + code,
    'Vence: ' + expiresText,
    '',
    'OEC: ' + check.registro,
    'Tipo: ' + check.tipoEvaluacion,
    'Fechas nuevas: ' + (check.fechaInicio || '-') + ' al ' + (check.fechaFinal || '-'),
    'Solicitado por: ' + (requester.nombre || requester.email) + ' <' + requester.email + '>',
    'Justificación: ' + motivo,
    '',
    'Antecedentes:',
    rowsText,
    '',
    'Si lo solicitado corresponde únicamente a cambiar fechas, integrantes, días u otros datos',
    'de una evaluación existente, NO comparta este código: debe utilizarse Reprogramación.',
    '',
    'Este código es de un solo uso y vence en 10 minutos.'
  ].join('\n');

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#263238">' +
      '<h2 style="margin:0 0 12px">Autorización administrativa</h2>' +
      '<p>Se solicitó autorización para crear una <strong>evaluación adicional independiente</strong>.</p>' +
      '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:14px 0">' +
        code +
      '</div>' +
      '<p><strong>Vence:</strong> ' + WAPP_DUP_OTP_html_(expiresText) + '</p>' +
      '<p><strong>OEC:</strong> ' + WAPP_DUP_OTP_html_(check.registro) + '<br>' +
      '<strong>Tipo:</strong> ' + WAPP_DUP_OTP_html_(check.tipoEvaluacion) + '<br>' +
      '<strong>Fechas:</strong> ' + WAPP_DUP_OTP_html_(check.fechaInicio || '-') +
        ' al ' + WAPP_DUP_OTP_html_(check.fechaFinal || '-') + '<br>' +
      '<strong>Solicitado por:</strong> ' +
        WAPP_DUP_OTP_html_((requester.nombre || requester.email) + ' <' + requester.email + '>') +
        '<br><strong>Justificación:</strong> ' + WAPP_DUP_OTP_html_(motivo) + '</p>' +
      '<p style="padding:10px;background:#fff3cd;border:1px solid #ead28a;border-radius:8px">' +
        '<strong>Control:</strong> si únicamente se pretende cambiar fechas, integrantes, días u otros datos ' +
        'de una evaluación existente, no autorice este código; corresponde utilizar Reprogramación.' +
      '</p>' +
      '<p>Token de un solo uso. Máximo ' + WAPP_DUP_OTP_MAX_ATTEMPTS +
        ' intentos. Vigencia: 10 minutos.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: adminEmail,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: 'OGA · Presupuestos y Evaluaciones'
  });

  return {
    ok: true,
    destinatario: WAPP_DUP_OTP_maskEmail_(adminEmail),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresInMinutes: 10,
    maxAttempts: WAPP_DUP_OTP_MAX_ATTEMPTS,
    signature: check.signature
  };
}

function WAPP_DUP_OTP_validar_(payload, requester) {
  payload = payload || {};
  requester = requester || WAPP_SEC_assertUsuarioInterno_();

  const code = String(payload.token || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Ingrese el token de 6 dígitos enviado a jefatura.');
  }

  const pending = WAPP_DUP_OTP_getPending_();
  if (!pending) {
    throw new Error(
      'No existe un token pendiente. Solicite un nuevo token de autorización.'
    );
  }

  const now = Date.now();

  if (now > Number(pending.expiresAtMs || 0)) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
    throw new Error('El token de autorización venció. Solicite uno nuevo.');
  }

  if (Number(pending.attempts || 0) >= WAPP_DUP_OTP_MAX_ATTEMPTS) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
    throw new Error(
      'Se alcanzó el máximo de intentos. Solicite un nuevo token.'
    );
  }

  const check = WAPP_DUP_check_(payload, requester);

  if (!check.hasDuplicates) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
    throw new Error(
      'La operación ya no presenta coincidencias que requieran autorización.'
    );
  }

  if (String(check.signature) !== String(pending.signature)) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
    throw new Error(
      'Los datos de la evaluación cambiaron desde que se solicitó el token. ' +
      'Solicite una nueva autorización.'
    );
  }

  if (
    String(requester.email || '').toLowerCase() !==
    String(pending.requesterEmail || '').toLowerCase()
  ) {
    throw new Error(
      'El token fue solicitado por otro usuario y no puede utilizarse en esta sesión.'
    );
  }

  const actualHash = WAPP_DUP_OTP_hash_(
    code,
    pending.salt,
    pending.signature
  );

  if (actualHash !== pending.hash) {
    pending.attempts = Number(pending.attempts || 0) + 1;
    WAPP_STATE_props_().setProperty(
      WAPP_DUP_OTP_KEY,
      JSON.stringify(pending)
    );

    const remaining =
      WAPP_DUP_OTP_MAX_ATTEMPTS - Number(pending.attempts || 0);

    throw new Error(
      'Token incorrecto. Intentos restantes: ' + Math.max(0, remaining) + '.'
    );
  }

  const motivoActual = String(payload.motivo || '').trim();
  if (motivoActual !== String(pending.motivo || '').trim()) {
    throw new Error(
      'La justificación cambió después de solicitar el token. Solicite uno nuevo.'
    );
  }

  const auth = WAPP_DUP_authorizeOtpValidated_(
    check,
    pending.motivo,
    requester,
    pending.adminEmail
  );

  WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
  return auth;
}

function WAPP_DUP_OTP_getPending_() {
  const raw = WAPP_STATE_props_().getProperty(WAPP_DUP_OTP_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    WAPP_STATE_props_().deleteProperty(WAPP_DUP_OTP_KEY);
    return null;
  }
}

function WAPP_DUP_OTP_generateCode_() {
  const seed = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    new Date().getTime(),
    Session.getTemporaryActiveUserKey()
  ].join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed,
    Utilities.Charset.UTF_8
  );

  let n = 0;
  for (let i = 0; i < 6; i++) {
    n = ((n * 256) + (digest[i] & 0xff)) % 1000000;
  }

  return String(n).padStart(6, '0');
}

function WAPP_DUP_OTP_hash_(code, salt, signature) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    [salt, signature, code].join('|'),
    Utilities.Charset.UTF_8
  );

  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function WAPP_DUP_OTP_maskEmail_(email) {
  const s = String(email || '').trim().toLowerCase();
  const parts = s.split('@');
  if (parts.length !== 2) return 'cuenta administradora';

  const local = parts[0];
  const masked =
    local.length <= 2
      ? local.charAt(0) + '*'
      : local.charAt(0) + '*'.repeat(Math.min(5, local.length - 2)) +
        local.charAt(local.length - 1);

  return masked + '@' + parts[1];
}

function WAPP_DUP_OTP_html_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

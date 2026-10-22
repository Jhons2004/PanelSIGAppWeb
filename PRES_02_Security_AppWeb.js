/**
 * ============================================================
 * PRESUPUESTOS / EVALUACIONES - SEGURIDAD ADAPTADA A SIGA APPWEB
 * V1.8.1.7-APPWEB
 * ============================================================
 *
 * REGLA PRINCIPAL:
 * - La autenticación NO se repite dentro de este módulo.
 * - La identidad proviene de la sesión ya creada por la AppWeb SIGA
 *   (Google OAuth o login alternativo existente).
 * - El backend vuelve a validar dominio y autorización contra la fuente
 *   institucional de SIGA mediante obtenerUsuarioAutorizadoGoogle().
 * - Nunca se confía en correo/rol enviados desde el HTML.
 */

function WAPP_SEC_getSesionAppWeb_() {
  var detalle = null;
  var activo = null;

  try {
    if (typeof getUsuarioActivoDetalle === 'function') {
      detalle = getUsuarioActivoDetalle();
      if (detalle && detalle.ok === false) detalle = null;
    }
  } catch (_) {}

  try {
    if (typeof getUsuarioActivo === 'function') {
      activo = getUsuarioActivo();
    }
  } catch (_) {}

  if (!detalle && activo && typeof activo === 'object') {
    detalle = activo;
  }

  if (!detalle && !activo) {
    throw new Error('La sesión SIGA no está activa. Vuelva a iniciar sesión en la AppWeb.');
  }

  detalle = detalle && typeof detalle === 'object' ? detalle : {};

  var candidatos = [
    detalle.email,
    detalle.correo,
    detalle.mail,
    detalle.usuario,
    (activo && typeof activo === 'object') ? activo.email : '',
    (activo && typeof activo === 'object') ? activo.correo : '',
    (activo && typeof activo === 'object') ? activo.usuario : '',
    typeof activo === 'string' ? activo : ''
  ];

  var email = '';
  var usuario = '';

  candidatos.forEach(function(v) {
    var s = String(v || '').trim().toLowerCase();
    if (!usuario && s) usuario = s;
    if (!email && /@/.test(s)) email = s;
  });

  // Compatibilidad: si la sesión conserva "Usuario" y no el correo,
  // resolver el correo desde la misma hoja Usuarios ya usada por SIGA.
  if (!email && usuario) {
    email = WAPP_SEC_resolverCorreoPorUsuarioSIGA_(usuario);
  }

  return {
    email: String(email || '').trim().toLowerCase(),
    usuario: String(detalle.usuario || usuario || '').trim(),
    nombre: String(
      detalle.nombre || detalle.nombreCompleto || detalle.nombre_completo ||
      detalle.usuario || email || 'Usuario'
    ).trim(),
    rol: String(
      detalle.rol || detalle.rol_principal || detalle.perfil || detalle.tipo ||
      'Usuario SIGA'
    ).trim()
  };
}

function WAPP_SEC_resolverCorreoPorUsuarioSIGA_(usuario) {
  usuario = String(usuario || '').trim().toLowerCase();
  if (!usuario) return '';

  try {
    if (
      typeof _getUsuariosData_ === 'function' &&
      typeof obtenerColumnasUsuarios_ === 'function' &&
      typeof extraerCorreosUsuarios_ === 'function'
    ) {
      var datos = _getUsuariosData_();
      var col = obtenerColumnasUsuarios_();

      if (datos && datos.length > 1 && col && col.usuario !== -1 && col.correo !== -1) {
        for (var i = 1; i < datos.length; i++) {
          var u = String(datos[i][col.usuario] || '').trim().toLowerCase();
          if (u !== usuario) continue;

          var correos = extraerCorreosUsuarios_(datos[i][col.correo]);
          for (var j = 0; j < correos.length; j++) {
            var c = String(correos[j] || '').trim().toLowerCase();
            if (c.endsWith('@oga.org.gt')) return c;
          }
        }
      }
    }
  } catch (e) {
    console.log('[WAPP_SEC_resolverCorreoPorUsuarioSIGA_] ' + e.message);
  }

  return '';
}

function WAPP_SEC_getEmail_() {
  return WAPP_SEC_getUsuario_().email;
}

function WAPP_SEC_getUsuario_() {
  SIGA_AUTH_assertGoogle_();
  var cfg = WAPP_cfg_();
  var sesion = WAPP_SEC_getSesionAppWeb_();
  var email = String(sesion.email || '').trim().toLowerCase();
  var dominio = String(cfg.DOMINIO_INTERNO || 'oga.org.gt').trim().toLowerCase();

  if (!email) {
    throw new Error(
      'La sesión SIGA está activa, pero no fue posible resolver el correo institucional. '
      + 'Vuelva a iniciar sesión con Google.'
    );
  }

  if (!email.endsWith('@' + dominio)) {
    throw new Error('Acceso restringido al dominio ' + dominio + '.');
  }

  // La autorización del módulo se alinea con la autorización central de SIGA.
  if (typeof obtenerUsuarioAutorizadoGoogle === 'function') {
    var autorizado = obtenerUsuarioAutorizadoGoogle(email);
    if (!autorizado || autorizado.ok !== true) {
      throw new Error(
        autorizado && autorizado.msg
          ? autorizado.msg
          : 'El usuario no está autorizado en SIGA.'
      );
    }

    return {
      email: String(autorizado.correo || email).trim().toLowerCase(),
      nombre: String(autorizado.nombre || sesion.nombre || email).trim(),
      rol: String(sesion.rol || 'Usuario SIGA').trim(),
      usuario: String(autorizado.usuario || sesion.usuario || '').trim()
    };
  }

  // Fallback conservador: solamente si el proyecto todavía no cargó Usuarios.gs.
  // No consulta el navegador; usa exclusivamente la sesión backend de SIGA.
  return {
    email: email,
    nombre: sesion.nombre || email,
    rol: sesion.rol || 'Usuario SIGA',
    usuario: sesion.usuario || ''
  };
}

function WAPP_SEC_assertUsuarioInterno_() {
  return WAPP_SEC_getUsuario_();
}

function WAPP_SEC_hashKey_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

function WAPP_SEC_csrfKey_(email, token) {
  return 'WAPP_CSRF_' + WAPP_SEC_hashKey_(email + '|' + token);
}

function WAPP_SEC_issueMutationToken_() {
  var u = WAPP_SEC_assertUsuarioInterno_();
  var token = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(
    WAPP_SEC_csrfKey_(u.email, token),
    JSON.stringify({ email: u.email, ts: Date.now() }),
    21600
  );
  return token;
}

function WAPP_SEC_assertMutationToken_(token) {
  var clean = String(token || '').trim();
  if (!clean) throw new Error('Token de sesión ausente.');

  var email = WAPP_SEC_assertUsuarioInterno_().email;
  var key = WAPP_SEC_csrfKey_(email, clean);
  var raw = CacheService.getScriptCache().get(key);

  if (!raw) {
    throw new Error('La sesión de operación expiró. Vuelva a abrir el módulo.');
  }

  var data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error('Token de sesión inválido.'); }

  if (!data || String(data.email || '').toLowerCase() !== email) {
    throw new Error('Token de sesión inválido.');
  }

  return true;
}

function WAPP_SEC_revokeMutationToken_(token) {
  var clean = String(token || '').trim();
  if (!clean) return false;

  var email = WAPP_SEC_assertUsuarioInterno_().email;
  CacheService.getScriptCache().remove(WAPP_SEC_csrfKey_(email, clean));
  return true;
}

function WAPP_SEC_assertOnce_(operation, requestId) {
  var user = WAPP_SEC_assertUsuarioInterno_().email;
  var id = String(requestId || '').trim();
  if (!id) throw new Error('Falta requestId.');

  var key = 'WAPP_ONCE_' + WAPP_SEC_hashKey_(user + '|' + operation + '|' + id);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get(key)) {
      throw new Error('Esta operación ya fue recibida. Evite reenviar el formulario.');
    }
    cache.put(key, '1', 600);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ============================================================
 * SESIÓN CENTRAL SIGA / OGA
 * ============================================================
 * Compatible con:
 * - AuthGoogle.gs -> crearSesionGoogleVerificada_()
 * - Login.html    -> getUsuarioActivoDetalle()
 * - Router        -> getUsuarioActivo()
 * - Login legado  -> iniciarSesionConClave()
 *
 * La sesión NO usa el correo enviado por el navegador como identidad
 * para Google OAuth. Se liga al navegador/usuario mediante
 * Session.getTemporaryActiveUserKey() y se guarda en ScriptCache.
 * ============================================================
 */

const SIGA_SESSION_CFG = Object.freeze({
  PREFIX: 'SIGA_AUTH_SESSION_V1:',
  TTL_SECONDS: 21600 // 6 horas, máximo permitido por CacheService
});

function SIGA_SESSION_browserKey_() {
  const raw = String(Session.getTemporaryActiveUserKey() || '').trim();
  if (!raw) {
    throw new Error('No fue posible obtener la clave temporal de sesión del usuario.');
  }

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(b) {
    const n = (b + 256) % 256;
    return ('0' + n.toString(16)).slice(-2);
  }).join('').slice(0, 48);
}

function SIGA_SESSION_key_() {
  return SIGA_SESSION_CFG.PREFIX + SIGA_SESSION_browserKey_();
}

function SIGA_SESSION_cache_() {
  return CacheService.getScriptCache();
}

function SIGA_SESSION_normalize_(sesion) {
  sesion = sesion || {};

  const email = String(sesion.email || sesion.correo || sesion.usuario || '')
    .trim()
    .toLowerCase();

  return {
    usuario: String(sesion.usuario || email).trim(),
    email: email,
    correo: email,
    nombre: String(sesion.nombre || sesion.usuario || email || 'Usuario').trim(),
    metodo: String(sesion.metodo || 'siga').trim().toLowerCase(),
    googleId: String(sesion.googleId || '').trim(),
    picture: String(sesion.picture || '').trim(),
    fila: sesion.fila || null,
    resolucion: sesion.resolucion || '',
    actas: sesion.actas || '',
    creado: sesion.creado || new Date().toISOString(),
    expiraMs: Date.now() + SIGA_SESSION_CFG.TTL_SECONDS * 1000
  };
}

function SIGA_SESSION_save_(sesion) {
  const data = SIGA_SESSION_normalize_(sesion);

  if (!data.email || !data.email.endsWith('@oga.org.gt')) {
    throw new Error('No se puede crear una sesión SIGA sin correo institucional OGA válido.');
  }

  SIGA_SESSION_cache_().put(
    SIGA_SESSION_key_(),
    JSON.stringify(data),
    SIGA_SESSION_CFG.TTL_SECONDS
  );

  return data;
}

function SIGA_SESSION_read_() {
  const cache = SIGA_SESSION_cache_();
  const key = SIGA_SESSION_key_();
  const raw = cache.get(key);

  if (!raw) return null;

  try {
    const data = JSON.parse(raw);

    if (!data || !data.email) {
      cache.remove(key);
      return null;
    }

    if (Number(data.expiraMs || 0) && Number(data.expiraMs) <= Date.now()) {
      cache.remove(key);
      return null;
    }

    return data;
  } catch (e) {
    cache.remove(key);
    return null;
  }
}

/**
 * Invocada por AuthGoogle.gs después de validar Google + hoja Usuarios.
 */
function crearSesionGoogleVerificada_(googleUser, autorizado) {
  googleUser = googleUser || {};
  autorizado = autorizado || {};

  const email = String(
    autorizado.correo || googleUser.email || ''
  ).trim().toLowerCase();

  if (!email) {
    throw new Error('Google OAuth terminó sin un correo autorizado.');
  }

  // Defensa en profundidad: revalidar contra el padrón SIGA si la función existe.
  if (typeof obtenerUsuarioAutorizadoGoogle === 'function') {
    const check = obtenerUsuarioAutorizadoGoogle(email);
    if (!check || check.ok !== true) {
      throw new Error((check && check.msg) || 'El usuario no está autorizado en SIGA.');
    }
    autorizado = check;
  }

  return SIGA_SESSION_save_({
    usuario: autorizado.usuario || email,
    email: email,
    nombre: autorizado.nombre || googleUser.nombre || googleUser.name || email,
    metodo: 'google',
    googleId: googleUser.id || '',
    picture: googleUser.picture || '',
    fila: autorizado.fila || null,
    resolucion: autorizado.resolucion || '',
    actas: autorizado.actas || ''
  });
}

/** Devuelve el identificador/correo del usuario activo o cadena vacía. */
function getUsuarioActivo() {
  const s = SIGA_SESSION_read_();
  return s ? (s.usuario || s.email || '') : '';
}

/** Devuelve el detalle seguro de la sesión para la UI. */
function getUsuarioActivoDetalle() {
  const s = SIGA_SESSION_read_();

  if (!s) {
    return {
      ok: false,
      autenticado: false,
      usuario: '',
      email: '',
      correo: '',
      nombre: ''
    };
  }

  return {
    ok: true,
    autenticado: true,
    usuario: s.usuario || s.email,
    email: s.email,
    correo: s.email,
    nombre: s.nombre,
    metodo: s.metodo,
    picture: s.picture || '',
    fila: s.fila || null,
    resolucion: s.resolucion || '',
    actas: s.actas || ''
  };
}

/**
 * Compatibilidad con el acceso alternativo por correo/clave de Login.html.
 * La identidad de este flujo sí nace del formulario porque es el mecanismo
 * legado de credenciales SIGA, pero SIEMPRE se valida contra la hoja Usuarios.
 */
function iniciarSesionConClave(usuario, clave) {
  if (String(PropertiesService.getScriptProperties().getProperty('SIGA_ALLOW_PASSWORD_LOGIN') || 'false').toLowerCase() !== 'true') {
    return { ok:false, msg:'Utilice acceso con Google Workspace.' };
  }
  const correo = String(usuario || '').trim().toLowerCase();
  const pass = String(clave || '');

  if (!correo || !pass) {
    return { ok: false, msg: 'Correo y clave son obligatorios.' };
  }

  if (typeof obtenerEstadoUsuario === 'function') {
    const estado = obtenerEstadoUsuario(correo);
    if (estado === 'definir') {
      return { ok: false, msg: 'definir' };
    }
    if (estado !== 'activo') {
      return { ok: false, msg: 'Usuario no autorizado.' };
    }
  }

  if (
    typeof verificarUsuarioAutorizadoConClave !== 'function' ||
    !verificarUsuarioAutorizadoConClave(correo, pass)
  ) {
    return { ok: false, msg: 'Credenciales incorrectas.' };
  }

  let autorizado = null;
  if (typeof obtenerUsuarioAutorizadoGoogle === 'function') {
    autorizado = obtenerUsuarioAutorizadoGoogle(correo);
    if (!autorizado || autorizado.ok !== true) {
      return {
        ok: false,
        msg: (autorizado && autorizado.msg) || 'Usuario no autorizado.'
      };
    }
  }

  const s = SIGA_SESSION_save_({
    usuario: autorizado && autorizado.usuario ? autorizado.usuario : correo,
    email: correo,
    nombre: autorizado && autorizado.nombre ? autorizado.nombre : correo,
    metodo: 'clave',
    fila: autorizado && autorizado.fila ? autorizado.fila : null,
    resolucion: autorizado && autorizado.resolucion ? autorizado.resolucion : '',
    actas: autorizado && autorizado.actas ? autorizado.actas : ''
  });

  return {
    ok: true,
    usuario: s.usuario,
    email: s.email,
    nombre: s.nombre
  };
}

function cerrarSesion() {
  try {
    SIGA_SESSION_cache_().remove(SIGA_SESSION_key_());
  } catch (_) {}

  return { ok: true };
}

/** QA no destructivo. */
function QA_SESION_SIGA() {
  const key = SIGA_SESSION_key_();
  const detalle = getUsuarioActivoDetalle();

  const out = {
    ok: true,
    temporary_user_key_disponible: !!Session.getTemporaryActiveUserKey(),
    cache_key_generada: !!key,
    autenticado: detalle.autenticado === true,
    usuario: detalle.usuario || '',
    email: detalle.email || '',
    metodo: detalle.metodo || ''
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

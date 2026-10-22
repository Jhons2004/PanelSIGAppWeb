// ============================================================================
// 🔵 GOOGLE OAUTH 2.0 — SIGA / OGA
// ============================================================================
//
// Este flujo es ideal para Apps Script WebApp:
// - Login.html navega el TOP window a Google.
// - Google regresa al mismo /exec.
// - doGet(e) llama authProcesarCallbackGoogle_(e).
// - El backend intercambia el code usando CLIENT_ID + CLIENT_SECRET.
// - Luego consulta directamente a Google UserInfo.
// - Finalmente valida @oga.org.gt + existencia en hoja Usuarios.
//
// NO expone el Client Secret al navegador.
// ============================================================================

const GOOGLE_OAUTH_OGA = {
  DOMAIN: "oga.org.gt",

  PROP_CLIENT_ID: "GOOGLE_OAUTH_CLIENT_ID",
  PROP_CLIENT_SECRET: "GOOGLE_OAUTH_CLIENT_SECRET",
  PROP_REDIRECT_URI: "GOOGLE_OAUTH_REDIRECT_URI",

  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  USERINFO_URL: "https://www.googleapis.com/oauth2/v2/userinfo",

  STATE_TTL_SECONDS: 600,
  ERROR_TTL_SECONDS: 180
};

function authProp_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);

  if (!value) {
    throw new Error(`Falta configurar la propiedad del script "${name}".`);
  }

  return String(value).trim();
}

function authStateKey_(state) {
  return "OGA_GOOGLE_STATE:" + String(state || "");
}

function authErrorKey_() {
  return "OGA_GOOGLE_ERROR:" + Session.getTemporaryActiveUserKey();
}

function authGenerarState_() {
  return (
    Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "")
  );
}

function obtenerUrlAutenticacionGoogle() {

  try {

    const clientId =
      authProp_(
        GOOGLE_OAUTH_OGA.PROP_CLIENT_ID
      );


    const redirectUri =
      authProp_(
        GOOGLE_OAUTH_OGA.PROP_REDIRECT_URI
      );


    const state =
      authGenerarState_();


    CacheService
      .getScriptCache()
      .put(
        authStateKey_(state),
        JSON.stringify({
          creado:
            new Date().toISOString(),

          userKey:
            Session.getTemporaryActiveUserKey()
        }),
        GOOGLE_OAUTH_OGA.STATE_TTL_SECONDS
      );


    const params = {

      client_id:
        clientId,

      redirect_uri:
        redirectUri,

      response_type:
        "code",

      scope:
        "openid email profile",

      state:
        state,

      hd:
        GOOGLE_OAUTH_OGA.DOMAIN,

      access_type:
        "online",

      include_granted_scopes:
        "true",

      prompt:
        "select_account"

    };


    const query =
      Object.keys(params)
        .map(function (k) {

          return (
            encodeURIComponent(k) +
            "=" +
            encodeURIComponent(
              params[k]
            )
          );

        })
        .join("&");


    const url =
      GOOGLE_OAUTH_OGA.AUTH_URL +
      "?" +
      query;


    Logger.log(
      "OAuth redirect_uri enviado:"
    );

    Logger.log(
      redirectUri
    );


    return {

      ok: true,

      url:
        url

    };


  } catch (e) {

    Logger.log(
      "obtenerUrlAutenticacionGoogle: " +
      e.stack
    );


    return {

      ok: false,

      msg:
        "Google OAuth no está configurado: " +
        e.message

    };

  }

}

/*
 * AGREGAR ESTA LLAMADA al inicio del doGet(e) PRINCIPAL:
 *
 *     authProcesarCallbackGoogle_(e);
 *
 * Si no hay ?code / ?error, simplemente no hace nada.
 */
function authProcesarCallbackGoogle_(e) {
  const p = e && e.parameter ? e.parameter : {};

  if (!p.code && !p.error) {
    return { handled:false };
  }

  try {
    const state = String(p.state || "").trim();

    if (!state) {
      throw new Error("Google no devolvió el parámetro state.");
    }

    const stateRaw =
      CacheService.getScriptCache().get(authStateKey_(state));

    if (!stateRaw) {
      throw new Error(
        "La solicitud de acceso expiró o no corresponde a esta sesión."
      );
    }

    // Consumir state una sola vez.
    CacheService.getScriptCache().remove(authStateKey_(state));

    if (p.error) {
      const desc = String(p.error_description || p.error);
      throw new Error("Google canceló o rechazó el acceso: " + desc);
    }

    const code = String(p.code || "").trim();
    if (!code) throw new Error("Google no devolvió código de autorización.");

    const tokenData = authIntercambiarCodigo_(code);

    if (!tokenData.access_token) {
      throw new Error("Google no devolvió access_token.");
    }

    const googleUser = authObtenerUserInfo_(tokenData.access_token);

    const correo = normalizarCorreoOGA_(googleUser.email);
    const hd = String(googleUser.hd || "").trim().toLowerCase();

    const verificado =
      googleUser.verified_email === true ||
      String(googleUser.verified_email || "").toLowerCase() === "true";

    if (!verificado) {
      throw new Error("Google no confirmó el correo del usuario.");
    }

    if (hd !== GOOGLE_OAUTH_OGA.DOMAIN) {
      throw new Error(
        "Solo se permiten cuentas Google Workspace del dominio @" +
        GOOGLE_OAUTH_OGA.DOMAIN + "."
      );
    }

    if (!correo.endsWith("@" + GOOGLE_OAUTH_OGA.DOMAIN)) {
      throw new Error(
        "El correo autenticado no pertenece a @" +
        GOOGLE_OAUTH_OGA.DOMAIN + "."
      );
    }

    const autorizado = obtenerUsuarioAutorizadoGoogle(correo);

    if (!autorizado.ok) {
      registrarEventoAuth_({
        correo: correo,
        nombre: googleUser.name || "",
        metodo: "google",
        resultado: "RECHAZADO",
        detalle: autorizado.msg || autorizado.estado,
        googleId: googleUser.id || ""
      });

      throw new Error(
        autorizado.msg ||
        "La cuenta Google no está autorizada en SIGA."
      );
    }

    const sesion = crearSesionGoogleVerificada_(
      {
        id: String(googleUser.id || ""),
        email: correo,
        nombre: String(googleUser.name || ""),
        picture: String(googleUser.picture || ""),
        hd: hd
      },
      autorizado
    );

    registrarEventoAuth_({
      correo: autorizado.correo,
      nombre: sesion.nombre,
      metodo: "google",
      resultado: "INICIO_SESION_OK",
      detalle: "Google OAuth 2.0 + registro SIGA validados",
      googleId: googleUser.id || ""
    });

    CacheService.getScriptCache().remove(authErrorKey_());

    return {
      handled:true,
      ok:true,
      usuario:autorizado.correo
    };

  } catch (e) {
    Logger.log("authProcesarCallbackGoogle_: " + e.stack);

    CacheService.getScriptCache().put(
      authErrorKey_(),
      String(e.message || e),
      GOOGLE_OAUTH_OGA.ERROR_TTL_SECONDS
    );

    registrarEventoAuth_({
      correo:"",
      nombre:"",
      metodo:"google",
      resultado:"ERROR_AUTH",
      detalle:String(e.message || e)
    });

    return {
      handled:true,
      ok:false,
      msg:String(e.message || e)
    };
  }
}

function authIntercambiarCodigo_(code) {

  const clientId =
    authProp_(
      GOOGLE_OAUTH_OGA.PROP_CLIENT_ID
    );


  const clientSecret =
    authProp_(
      GOOGLE_OAUTH_OGA.PROP_CLIENT_SECRET
    );


  const redirectUri =
    authProp_(
      GOOGLE_OAUTH_OGA.PROP_REDIRECT_URI
    );


  const response =
    UrlFetchApp.fetch(
      GOOGLE_OAUTH_OGA.TOKEN_URL,
      {

        method:
          "post",

        payload: {

          code:
            code,

          client_id:
            clientId,

          client_secret:
            clientSecret,

          redirect_uri:
            redirectUri,

          grant_type:
            "authorization_code"

        },

        muteHttpExceptions:
          true

      }
    );


  const status =
    response.getResponseCode();


  const text =
    response.getContentText() || "";


  let json = {};

  try {

    json =
      JSON.parse(text);

  } catch (_) {}


  if (
    status < 200 ||
    status >= 300
  ) {

    Logger.log(
      "Google TOKEN HTTP " +
      status
    );

    Logger.log(
      text.slice(
        0,
        1000
      )
    );


    throw new Error(
      "Google no permitió completar el intercambio OAuth."
    );

  }


  return json;

}

function authObtenerUserInfo_(accessToken) {
  const response = UrlFetchApp.fetch(
    GOOGLE_OAUTH_OGA.USERINFO_URL,
    {
      method:"get",
      headers:{
        Authorization:"Bearer " + accessToken
      },
      muteHttpExceptions:true
    }
  );

  const status = response.getResponseCode();
  const text = response.getContentText() || "";

  let json = {};
  try { json = JSON.parse(text); } catch (_) {}

  if (status !== 200 || !json.email) {
    Logger.log(
      "Google userinfo HTTP " +
      status + " :: " + text.slice(0,800)
    );

    throw new Error(
      "No fue posible obtener la identidad del usuario desde Google."
    );
  }

  return json;
}

/*
 * Login.html consulta el último error OAuth después de volver al sistema.
 */
function obtenerUltimoErrorGoogle() {
  const cache = CacheService.getScriptCache();
  const key = authErrorKey_();
  const msg = cache.get(key);

  if (msg) cache.remove(key);

  return {
    ok: !msg,
    msg: msg ? "⛔ " + msg : ""
  };
}

/*
 * Ejecutar desde Apps Script para validar configuración.
 * No imprime el Client Secret.
 */
function QA_verificarGoogleOAuthOGA() {
  const clientId = authProp_(GOOGLE_OAUTH_OGA.PROP_CLIENT_ID);
  const redirectUri = authProp_(GOOGLE_OAUTH_OGA.PROP_REDIRECT_URI);
  const secretExiste = !!authProp_(GOOGLE_OAUTH_OGA.PROP_CLIENT_SECRET);

  const out = {
    ok:true,
    dominio:GOOGLE_OAUTH_OGA.DOMAIN,
    client_id_configurado:!!clientId,
    client_id_formato_ok:/\.apps\.googleusercontent\.com$/.test(clientId),
    client_secret_configurado:secretExiste,
    redirect_uri:redirectUri,
    usuarios_registrados:obtenerListaUsuarios().length
  };

  Logger.log(JSON.stringify(out,null,2));
  return out;
}

/**
 * ============================================================
 * CONFIGURAR GOOGLE OAUTH PARA SIGA
 * ============================================================
 *
 * EJECUTAR UNA SOLA VEZ.
 *
 * Después de ejecutarla correctamente:
 * - las credenciales quedan en Script Properties
 * - puedes borrar el Client Secret de este código
 * ============================================================
 */
function CONFIGURAR_GOOGLE_OAUTH_OGA() {

  // ==========================================================
  // 1. COLOCA TUS DATOS AQUÍ
  // ==========================================================

  const CLIENT_ID =
    "740247301481-qlivlkpsru761av4604mgdpqu668o9la.apps.googleusercontent.com";

  const CLIENT_SECRET =
    String(PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_SECRET") || "");

  /*
   * IMPORTANTE:
   *
   * Usa EXACTAMENTE la URL /exec de tu implementación.
   *
   * En tu caso, al ser dominio OGA, probablemente tiene forma:
   *
   * https://script.google.com/a/macros/oga.org.gt/s/DEPLOYMENT_ID/exec
   *
   * Copia la URL directamente desde tu aplicación.
   */
  const REDIRECT_URI =
    "https://script.google.com/macros/s/AKfycbzGKSOcHXg7vGGTi7X7zj8cF9mfF2Tgu9G-PScAE-fTzkZvvUsLsnuZjoimWrwc7CM2/exec";


  // ==========================================================
  // 2. VALIDACIONES
  // ==========================================================

  if (!CLIENT_ID) {
    throw new Error(
      "Falta configurar CLIENT_ID."
    );
  }

  if (
    !CLIENT_ID.endsWith(
      ".apps.googleusercontent.com"
    )
  ) {
    throw new Error(
      "El CLIENT_ID no tiene formato válido de Google."
    );
  }


  if (!CLIENT_SECRET) {
    throw new Error(
      "Falta configurar CLIENT_SECRET."
    );
  }


  if (!REDIRECT_URI) {
    throw new Error(
      "Falta configurar REDIRECT_URI."
    );
  }


  /*
   * Admitimos las dos formas válidas habituales:
   *
   * https://script.google.com/macros/s/.../exec
   *
   * https://script.google.com/a/macros/oga.org.gt/s/.../exec
   */
  const redirectValido =
    /^https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/[^/]+\/s)\/[^/?#]+\/exec$/i
      .test(REDIRECT_URI);


  if (!redirectValido) {

    throw new Error(
      "La Redirect URI no tiene formato válido. " +
      "Debe ser la URL /exec exacta del WebApp. " +
      "Valor recibido: " +
      REDIRECT_URI
    );

  }


  // ==========================================================
  // 3. GUARDAR COMO SCRIPT PROPERTIES
  // ==========================================================

  const props =
    PropertiesService
      .getScriptProperties();


  props.setProperties(
    {

      GOOGLE_OAUTH_CLIENT_ID:
        CLIENT_ID.trim(),

      GOOGLE_OAUTH_CLIENT_SECRET:
        CLIENT_SECRET.trim(),

      GOOGLE_OAUTH_REDIRECT_URI:
        REDIRECT_URI.trim()

    },
    false
  );


  // ==========================================================
  // 4. VALIDAR QUE SE GUARDARON
  // ==========================================================

  const clientIdGuardado =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_ID"
    );

  const secretGuardado =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_SECRET"
    );

  const redirectGuardado =
    props.getProperty(
      "GOOGLE_OAUTH_REDIRECT_URI"
    );


  if (
    !clientIdGuardado ||
    !secretGuardado ||
    !redirectGuardado
  ) {

    throw new Error(
      "Las propiedades no pudieron almacenarse correctamente."
    );

  }


  // ==========================================================
  // 5. RESULTADO
  // ==========================================================

  const resultado = {

    ok: true,

    GOOGLE_OAUTH_CLIENT_ID:
      true,

    GOOGLE_OAUTH_CLIENT_SECRET:
      true,

    GOOGLE_OAUTH_REDIRECT_URI:
      true,

    dominio:
      "oga.org.gt",

    redirect_uri:
      redirectGuardado

  };


  Logger.log(
    "=========================================="
  );

  Logger.log(
    "✅ GOOGLE OAUTH CONFIGURADO CORRECTAMENTE"
  );

  Logger.log(
    "=========================================="
  );

  Logger.log(
    "Client ID: CONFIGURADO"
  );

  Logger.log(
    "Client Secret: CONFIGURADO"
  );

  Logger.log(
    "Redirect URI: " +
    redirectGuardado
  );

  Logger.log(
    "=========================================="
  );


  return resultado;
}

function LIMPIAR_ERROR_GOOGLE_OAUTH() {

  const key =
    "OGA_GOOGLE_ERROR:" +
    Session.getTemporaryActiveUserKey();

  CacheService
    .getScriptCache()
    .remove(key);

  Logger.log(
    "✅ Error OAuth anterior eliminado."
  );

  return {
    ok: true,
    mensaje: "Cache OAuth limpiada"
  };
}

function QA_PROBAR_BOTON_GOOGLE() {

  const resultado =
    obtenerUrlAutenticacionGoogle();

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;
}

function QA_DIAGNOSTICO_PROPIEDADES_REALES() {

  const props =
    PropertiesService
      .getScriptProperties();

  const todas =
    props.getProperties();

  const clientId =
    props.getProperty("GOOGLE_OAUTH_CLIENT_ID");

  const clientSecret =
    props.getProperty("GOOGLE_OAUTH_CLIENT_SECRET");

  const redirectUri =
    props.getProperty("GOOGLE_OAUTH_REDIRECT_URI");


  const resultado = {

    script_id:
      ScriptApp.getScriptId(),

    propiedades_encontradas:
      Object.keys(todas),

    client_id_existe:
      clientId !== null,

    client_id_tiene_valor:
      !!String(clientId || "").trim(),

    client_id_longitud:
      String(clientId || "").length,

    client_secret_existe:
      clientSecret !== null,

    client_secret_tiene_valor:
      !!String(clientSecret || "").trim(),

    client_secret_longitud:
      String(clientSecret || "").length,

    redirect_uri_existe:
      redirectUri !== null,

    redirect_uri_tiene_valor:
      !!String(redirectUri || "").trim(),

    redirect_uri_longitud:
      String(redirectUri || "").length,

    redirect_termina_exec:
      String(redirectUri || "").endsWith("/exec")

  };


  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );


  return resultado;
}

function FORZAR_CONFIGURACION_GOOGLE_OAUTH() {

  /*
   * ============================================
   * COLOCA AQUÍ LOS TRES VALORES REALES
   * ============================================
   */

  const CLIENT_ID =
    "740247301481-qlivlkpsru761av4604mgdpqu668o9la.apps.googleusercontent.com";


  const CLIENT_SECRET =
    String(PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_SECRET") || "");


  const REDIRECT_URI =
    "https://script.google.com/macros/s/AKfycbzGKSOcHXg7vGGTi7X7zj8cF9mfF2Tgu9G-PScAE-fTzkZvvUsLsnuZjoimWrwc7CM2/exec";


  /*
   * ============================================
   * NO MODIFICAR DE AQUÍ HACIA ABAJO
   * ============================================
   */

  if (
    !CLIENT_ID ||
    CLIENT_ID.includes("TU_CLIENT")
  ) {
    throw new Error(
      "Debes colocar el Client ID real."
    );
  }


  if (
    !CLIENT_ID.endsWith(
      ".apps.googleusercontent.com"
    )
  ) {
    throw new Error(
      "Client ID inválido."
    );
  }


  if (
    !CLIENT_SECRET ||
    CLIENT_SECRET.includes(
      "TU_CLIENT"
    )
  ) {
    throw new Error(
      "Debes colocar el Client Secret real."
    );
  }


  if (
    !REDIRECT_URI ||
    REDIRECT_URI.includes(
      "TU_URL"
    )
  ) {
    throw new Error(
      "Debes colocar la Redirect URI real."
    );
  }


  if (
    !REDIRECT_URI.endsWith(
      "/exec"
    )
  ) {
    throw new Error(
      "La Redirect URI debe terminar en /exec."
    );
  }


  const props =
    PropertiesService
      .getScriptProperties();


  /*
   * Primero eliminamos solamente
   * estas 3 propiedades por seguridad.
   */

  props.deleteProperty(
    "GOOGLE_OAUTH_CLIENT_ID"
  );

  props.deleteProperty(
    "GOOGLE_OAUTH_CLIENT_SECRET"
  );

  props.deleteProperty(
    "GOOGLE_OAUTH_REDIRECT_URI"
  );


  /*
   * Las volvemos a crear correctamente.
   */

  props.setProperty(
    "GOOGLE_OAUTH_CLIENT_ID",
    CLIENT_ID.trim()
  );


  props.setProperty(
    "GOOGLE_OAUTH_CLIENT_SECRET",
    CLIENT_SECRET.trim()
  );


  props.setProperty(
    "GOOGLE_OAUTH_REDIRECT_URI",
    REDIRECT_URI.trim()
  );


  /*
   * Leemos inmediatamente.
   */

  const pruebaId =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_ID"
    );


  const pruebaSecret =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_SECRET"
    );


  const pruebaRedirect =
    props.getProperty(
      "GOOGLE_OAUTH_REDIRECT_URI"
    );


  const resultado = {

    ok:
      !!pruebaId &&
      !!pruebaSecret &&
      !!pruebaRedirect,


    client_id_guardado:
      !!pruebaId,


    client_id_longitud:
      String(
        pruebaId || ""
      ).length,


    client_secret_guardado:
      !!pruebaSecret,


    client_secret_longitud:
      String(
        pruebaSecret || ""
      ).length,


    redirect_guardado:
      !!pruebaRedirect,


    redirect_uri:
      pruebaRedirect || "",


    redirect_exec:
      String(
        pruebaRedirect || ""
      ).endsWith("/exec"),


    script_id:
      ScriptApp.getScriptId()

  };


  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );


  if (!resultado.ok) {

    throw new Error(
      "Las propiedades no quedaron almacenadas."
    );

  }


  Logger.log(
    "✅ PROPIEDADES GOOGLE OAUTH CORRECTAS"
  );


  return resultado;
}

function QA_AUTH_PROP_DIRECTO() {

  const clientId =
    authProp_(
      "GOOGLE_OAUTH_CLIENT_ID"
    );


  const secret =
    authProp_(
      "GOOGLE_OAUTH_CLIENT_SECRET"
    );


  const redirect =
    authProp_(
      "GOOGLE_OAUTH_REDIRECT_URI"
    );


  const resultado = {

    ok: true,

    client_id:
      !!clientId,

    client_id_longitud:
      clientId.length,

    secret:
      !!secret,

    secret_longitud:
      secret.length,

    redirect:
      redirect,

    redirect_exec:
      redirect.endsWith("/exec")

  };


  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );


  return resultado;
}

function QA_PROBAR_BOTON_GOOGLE() {

  const resultado =
    obtenerUrlAutenticacionGoogle();

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;
}
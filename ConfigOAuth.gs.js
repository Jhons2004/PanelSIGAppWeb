/**
 * ============================================================
 * CONFIGURACIÓN DEFINITIVA GOOGLE OAUTH - SIGA / OGA
 * ============================================================
 *
 * 1. Coloca tus 3 valores reales.
 * 2. Ejecuta CONFIGURAR_OAUTH_SIGA().
 * 3. Ejecuta QA_OAUTH_SIGA().
 * 4. Cuando todo esté OK, elimina los valores sensibles
 *    de esta función.
 * ============================================================
 */

function CONFIGURAR_OAUTH_SIGA() {

  // ==========================================================
  // COLOCA AQUÍ TUS VALORES REALES
  // ==========================================================

  const CLIENT_ID =
    "740247301481-qlivlkpsru761av4604mgdpqu668o9la.apps.googleusercontent.com";

  const CLIENT_SECRET =
    String(PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_SECRET") || "");

  const REDIRECT_URI =
    "https://script.google.com/macros/s/AKfycbzGKSOcHXg7vGGTi7X7zj8cF9mfF2Tgu9G-PScAE-fTzkZvvUsLsnuZjoimWrwc7CM2/exec";


  // ==========================================================
  // VALIDACIONES
  // ==========================================================

  if (
    !CLIENT_ID ||
    CLIENT_ID.indexOf("AQUI_") !== -1
  ) {
    throw new Error(
      "Debes colocar el CLIENT_ID real."
    );
  }


  if (
    !CLIENT_ID.endsWith(
      ".apps.googleusercontent.com"
    )
  ) {
    throw new Error(
      "El CLIENT_ID no tiene el formato correcto."
    );
  }


  if (
    !CLIENT_SECRET ||
    CLIENT_SECRET.indexOf("AQUI_") !== -1
  ) {
    throw new Error(
      "Debes colocar el CLIENT_SECRET real."
    );
  }


  if (
    !REDIRECT_URI ||
    REDIRECT_URI.indexOf("AQUI_") !== -1
  ) {
    throw new Error(
      "Debes colocar la URL /exec real del WebApp."
    );
  }


  if (
    !REDIRECT_URI.startsWith(
      "https://script.google.com/"
    )
  ) {
    throw new Error(
      "La Redirect URI debe comenzar con https://script.google.com/"
    );
  }


  if (
    !REDIRECT_URI.endsWith("/exec")
  ) {
    throw new Error(
      "La Redirect URI debe terminar exactamente en /exec."
    );
  }


  // ==========================================================
  // GUARDAR LAS 3 PROPIEDADES
  // ==========================================================

  const props =
    PropertiesService
      .getScriptProperties();


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


  // ==========================================================
  // COMPROBAR INMEDIATAMENTE
  // ==========================================================

  const idGuardado =
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


  if (!idGuardado) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID no se almacenó."
    );
  }


  if (!secretGuardado) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_SECRET no se almacenó."
    );
  }


  if (!redirectGuardado) {
    throw new Error(
      "GOOGLE_OAUTH_REDIRECT_URI no se almacenó."
    );
  }


  Logger.log(
    "========================================"
  );

  Logger.log(
    "✅ GOOGLE OAUTH CONFIGURADO"
  );

  Logger.log(
    "========================================"
  );

  Logger.log(
    "GOOGLE_OAUTH_CLIENT_ID: OK"
  );

  Logger.log(
    "GOOGLE_OAUTH_CLIENT_SECRET: OK"
  );

  Logger.log(
    "GOOGLE_OAUTH_REDIRECT_URI: OK"
  );

  Logger.log(
    "Redirect: " + redirectGuardado
  );

  Logger.log(
    "========================================"
  );


  return {
    ok: true,

    client_id:
      true,

    client_secret:
      true,

    redirect_uri:
      true,

    redirect:
      redirectGuardado
  };
}

function QA_DIAGNOSTICO_OAUTH_WEBAPP() {

  const props =
    PropertiesService
      .getScriptProperties();

  const todas =
    props.getProperties();

  const clientId =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_ID"
    ) || "";

  const clientSecret =
    props.getProperty(
      "GOOGLE_OAUTH_CLIENT_SECRET"
    ) || "";

  const redirectUri =
    props.getProperty(
      "GOOGLE_OAUTH_REDIRECT_URI"
    ) || "";

  let webAppUrl = "";

  try {
    webAppUrl =
      ScriptApp
        .getService()
        .getUrl() || "";
  } catch (e) {
    webAppUrl =
      "ERROR: " + e.message;
  }

  const resultado = {

    ok:
      !!clientId &&
      !!clientSecret &&
      !!redirectUri,

    script_id:
      ScriptApp.getScriptId(),

    webapp_url_detectada:
      webAppUrl,

    propiedades_encontradas:
      Object.keys(todas),

    client_id_existe:
      !!clientId,

    client_id_final:
      clientId
        ? clientId.slice(-35)
        : "",

    client_secret_existe:
      !!clientSecret,

    redirect_uri_existe:
      !!redirectUri,

    redirect_uri:
      redirectUri,

    redirect_termina_exec:
      redirectUri.endsWith("/exec")

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

function CONFIGURAR_REDIRECT_URI_PRODUCCION() {

  /*
   * COPIA AQUÍ EXACTAMENTE:
   *
   * Implementar
   * → Administrar implementaciones
   * → WebApp
   * → URL de la aplicación web
   *
   * DEBE TERMINAR EN /exec
   */
  const REDIRECT_URI =
    "https://script.google.com/macros/s/AKfycbzGKSOcHXg7vGGTi7X7zj8cF9mfF2Tgu9G-PScAE-fTzkZvvUsLsnuZjoimWrwc7CM2/exec";


  if (!REDIRECT_URI) {

    throw new Error(
      "No se indicó REDIRECT_URI."
    );

  }


  if (
    REDIRECT_URI.indexOf(
      "PEGA_AQUI"
    ) !== -1
  ) {

    throw new Error(
      "Debes colocar la URL /exec real del WebApp."
    );

  }


  if (
    !REDIRECT_URI.startsWith(
      "https://script.google.com/"
    )
  ) {

    throw new Error(
      "La URL debe pertenecer a script.google.com."
    );

  }


  if (
    !REDIRECT_URI.endsWith(
      "/exec"
    )
  ) {

    throw new Error(
      "La URL de producción debe terminar exactamente en /exec."
    );

  }


  const props =
    PropertiesService
      .getScriptProperties();


  props.setProperty(
    "GOOGLE_OAUTH_REDIRECT_URI",
    REDIRECT_URI.trim()
  );


  const guardada =
    props.getProperty(
      "GOOGLE_OAUTH_REDIRECT_URI"
    );


  if (
    !guardada ||
    guardada !== REDIRECT_URI.trim()
  ) {

    throw new Error(
      "La Redirect URI no quedó almacenada correctamente."
    );

  }


  Logger.log(
    "============================================="
  );

  Logger.log(
    "✅ REDIRECT URI PRODUCCIÓN CONFIGURADA"
  );

  Logger.log(
    "============================================="
  );

  Logger.log(
    guardada
  );

  Logger.log(
    "============================================="
  );


  return {

    ok: true,

    redirect_uri:
      guardada,

    termina_exec:
      guardada.endsWith("/exec")

  };

}

function QA_REDIRECT_OAUTH_PRODUCCION() {

  const props =
    PropertiesService
      .getScriptProperties();


  const redirect =
    props.getProperty(
      "GOOGLE_OAUTH_REDIRECT_URI"
    ) || "";


  const resultado = {

    ok:
      !!redirect &&
      redirect.startsWith(
        "https://script.google.com/"
      ) &&
      redirect.endsWith(
        "/exec"
      ),

    propiedad_existe:
      !!redirect,

    redirect_uri:
      redirect,

    es_produccion_exec:
      redirect.endsWith(
        "/exec"
      ),

    contiene_dev:
      redirect.indexOf(
        "/dev"
      ) !== -1

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
// ============================================================================
// 👥 USUARIOS OGA - BASE CENTRAL DE AUTORIZACIÓN SIGA
// ============================================================================
//
// Spreadsheet:
// 1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY
//
// Hoja:
// Usuarios
//
// Estructura actual detectada:
// A = Usuario
// B = Acceso
// C = Autorizado
// D = Nombre
// E = Resolución
// F = Correos
// G = Actas
//
// IMPORTANTE:
// El sistema NO depende de posiciones fijas.
// Busca las columnas por el nombre del encabezado.
//
// Google:
// 1. Autentica la identidad.
// 2. Entrega email.
// 3. SIGA busca ese email en "Correos".
// 4. Comprueba "Autorizado".
// 5. Si todo coincide, permite acceso.
// ============================================================================


const USUARIOS_DB_ID =
  "1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY";


const USUARIOS_SHEET =
  "Usuarios";


const OGA_DOMINIO_AUTORIZADO =
  "oga.org.gt";


let _usuariosSheetCache = null;
let _usuariosColumnasCache = null;


// ============================================================================
// HOJA
// ============================================================================

function obtenerHojaUsuariosExterna() {

  if (_usuariosSheetCache) {
    return _usuariosSheetCache;
  }


  const ss =
    SpreadsheetApp.openById(
      USUARIOS_DB_ID
    );


  const hoja =
    ss.getSheetByName(
      USUARIOS_SHEET
    );


  if (!hoja) {

    throw new Error(
      `No existe la hoja "${USUARIOS_SHEET}".`
    );

  }


  _usuariosSheetCache =
    hoja;


  return hoja;

}


// ============================================================================
// DATOS
// ============================================================================

function _getUsuariosData_() {

  const hoja =
    obtenerHojaUsuariosExterna();


  if (
    hoja.getLastRow() < 1 ||
    hoja.getLastColumn() < 1
  ) {

    return [];

  }


  return hoja
    .getDataRange()
    .getValues();

}


// ============================================================================
// NORMALIZACIÓN GENERAL
// ============================================================================

function normalizarHeaderUsuario_(valor) {

  return String(
    valor || ""
  )
    .replace(/\u00A0/g, " ")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

}


function normalizarCorreoOGA_(valor) {

  return String(
    valor || ""
  )
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase();

}


function esCorreoDominioOGA_(correo) {

  const c =
    normalizarCorreoOGA_(
      correo
    );


  return (
    !!c &&
    c.endsWith(
      "@" +
      OGA_DOMINIO_AUTORIZADO
    )
  );

}


// ============================================================================
// MAPA DE COLUMNAS POR ENCABEZADO
// ============================================================================

function obtenerColumnasUsuarios_() {

  if (_usuariosColumnasCache) {

    return _usuariosColumnasCache;

  }


  const hoja =
    obtenerHojaUsuariosExterna();


  const lastColumn =
    hoja.getLastColumn();


  if (lastColumn < 1) {

    throw new Error(
      "La hoja Usuarios no tiene columnas."
    );

  }


  const headers =
    hoja
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0]
      .map(
        normalizarHeaderUsuario_
      );


  function buscar() {

    const aliases =
      Array.prototype.slice
        .call(arguments)
        .map(
          normalizarHeaderUsuario_
        );


    for (
      let i = 0;
      i < headers.length;
      i++
    ) {

      if (
        aliases.includes(
          headers[i]
        )
      ) {

        return i;

      }

    }


    return -1;

  }


  const columnas = {

    usuario:
      buscar(
        "Usuario",
        "Usuarios",
        "Login"
      ),


    acceso:
      buscar(
        "Acceso",
        "Clave",
        "Password",
        "Contraseña"
      ),


    autorizado:
      buscar(
        "Autorizado",
        "Autorizada",
        "Activo",
        "Habilitado"
      ),


    nombre:
      buscar(
        "Nombre",
        "Nombre completo",
        "Funcionario"
      ),


    resolucion:
      buscar(
        "Resolución",
        "Resolucion"
      ),


    correo:
      buscar(
        "Correos",
        "Correo",
        "Email",
        "E-mail",
        "Correo electrónico",
        "Correo electronico"
      ),


    actas:
      buscar(
        "Actas",
        "Acta"
      ),


    supervisor:
      buscar(
        "Supervisor",
        "Supervisores"
      ),

    accesoWeb:
      buscar(
        "SIGA",
        "Acceso AppWeb",
        "Acceso Web SIGA",
        "Acceso SIGA",
        "Permiso AppWeb"
      )

  };


  // Correos es imprescindible para Google Auth.

  if (
    columnas.correo === -1
  ) {

    throw new Error(
      'No se encontró la columna "Correos" en la hoja Usuarios.'
    );

  }


  // El acceso general depende de SIGA (H).
  // Autorizado (C) conserva sus permisos administrativos independientes.
  if (columnas.accesoWeb === -1) {
    throw new Error('Falta la columna "SIGA" en la hoja Usuarios. No es posible validar el acceso.');
  }

  if (
    columnas.autorizado === -1
  ) {

    throw new Error(
      'No se encontró la columna "Autorizado" en la hoja Usuarios.'
    );

  }


  _usuariosColumnasCache =
    columnas;


  Logger.log(
    "📋 COLUMNAS USUARIOS:"
  );


  Logger.log(
    JSON.stringify(
      columnas,
      null,
      2
    )
  );


  return columnas;

}


// ============================================================================
// EXTRAER CORREOS
// ============================================================================

function extraerCorreosUsuarios_(valor) {

  const texto =
    String(
      valor || ""
    )
      .replace(
        /\u00A0/g,
        " "
      );


  if (!texto.trim()) {

    return [];

  }


  const matches =
    texto.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    ) || [];


  return [
    ...new Set(
      matches.map(
        function (correo) {

          return correo
            .trim()
            .toLowerCase();

        }
      )
    )
  ];

}


// ============================================================================
// AUTORIZACIÓN
// ============================================================================

function usuarioTieneAutorizacion_(valor) {

  // Checkbox verdadero
  if (valor === true) {

    return true;

  }


  if (valor === false) {

    return false;

  }


  const v =
    normalizarHeaderUsuario_(
      valor
    );


  if (!v) {

    return false;

  }


  const valoresPermitidos = [

    "si",
    "sí",
    "s",
    "true",
    "1",
    "activo",
    "activa",
    "autorizado",
    "autorizada",
    "habilitado",
    "habilitada",
    "permitido",
    "permitida",
    "x"

  ];


  return valoresPermitidos.includes(
    v
  );

}


// ============================================================================
// BUSCAR REGISTRO POR CORREO
// ============================================================================

/**
 * Busca coincidencias en la hoja Usuarios priorizando el correo verificado.
 * - Correos (F) tiene prioridad sobre Usuario (A).
 * - Usuario sólo puede resolver un login institucional cuando Correos está VACÍO.
 * - Varias filas del mismo nivel => ambiguo; no conceder acceso por azar.
 * - La columna Autorizado conserva los permisos anteriores del sistema.
 */
function obtenerRegistroUsuarioPorCorreo_(correo) {
  correo = normalizarCorreoOGA_(correo);
  if (!correo || !esCorreoDominioOGA_(correo)) return null;

  const datos = _getUsuariosData_();
  if (!datos || datos.length < 2) return null;
  const col = obtenerColumnasUsuarios_();
  const loginGoogle = correo.split('@')[0];
  const exactos = [];
  const compatibles = [];

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const correos = extraerCorreosUsuarios_(fila[col.correo]);
    const usuario = col.usuario === -1 ? '' : String(fila[col.usuario] || '').trim();
    const usuarioNormalizado = normalizarCorreoOGA_(usuario);
    const correoExacto = correos.indexOf(correo) !== -1;
    // No usar Usuario como alias si hay correos distintos en esa fila.
    const aliasSinCorreo = correos.length === 0 &&
      (usuarioNormalizado === correo || usuarioNormalizado === loginGoogle);

    if (!correoExacto && !aliasSinCorreo) continue;

    const valorAutorizado = fila[col.autorizado];
    const registro = {
      fila: i + 1,
      usuario: usuario,
      correo: correo,
      correos: correos,
      acceso: col.acceso !== -1 ? String(fila[col.acceso] ?? '') : '',
      autorizado: usuarioTieneAutorizacion_(valorAutorizado),
      autorizado_raw: valorAutorizado,
      // Permiso independiente para SIGA sin otorgar permisos de Agenda.
      accesoWeb: col.accesoWeb !== -1 &&
        usuarioTieneAutorizacion_(fila[col.accesoWeb]),
      accesoWebRaw: col.accesoWeb !== -1 ? fila[col.accesoWeb] : null,
      nombre: col.nombre !== -1 ? String(fila[col.nombre] || correo).trim() : correo,
      resolucion: col.resolucion !== -1 ? fila[col.resolucion] : '',
      actas: col.actas !== -1 ? fila[col.actas] : '',
      supervisor: col.supervisor !== -1 ? fila[col.supervisor] : '',
      raw: fila
    };
    (correoExacto ? exactos : compatibles).push(registro);
  }

  const encontrados = exactos.length ? exactos : compatibles;
  if (!encontrados.length) return null;
  if (encontrados.length > 1) {
    // Fail closed: dos fichas para la misma identidad requieren conciliación.
    return {
      ambiguo: true,
      autorizado: false,
      correo: correo,
      filas: encontrados.map(function(r) { return r.fila; })
    };
  }
  return encontrados[0];
}

// ============================================================================
// GOOGLE AUTH - AUTORIZACIÓN FINAL SIGA
// ============================================================================

function obtenerUsuarioAutorizadoGoogle(
  correo
) {

  correo =
    normalizarCorreoOGA_(
      correo
    );


  // ==========================================================
  // 1. Validar dominio
  // ==========================================================

  if (
    !esCorreoDominioOGA_(
      correo
    )
  ) {

    return {

      ok:
        false,

      estado:
        "dominio_no_autorizado",

      msg:
        "⛔ Solo se permiten cuentas institucionales @oga.org.gt."

    };

  }


  // ==========================================================
  // 2. Buscar correo en hoja Usuarios
  // ==========================================================

  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  if (!registro) {

    return {

      ok:
        false,

      estado:
        "no_registrado",

      msg:
        "⛔ La cuenta pertenece a OGA, pero no está registrada en la hoja Usuarios de SIGA."

    };

  }


  // ==========================================================
  // 3. Identificar duplicados y revisar permiso de acceso a SIGA
  // ==========================================================

  if (registro.ambiguo === true) {
    return {
      ok: false,
      estado: "registro_duplicado",
      msg: "⛔ Hay registros duplicados de esta cuenta en Usuarios. " +
        "Informática debe revisar las filas " + registro.filas.join(', ') + ".",
      filas: registro.filas
    };
  }

  if (registro.accesoWeb !== true) {

    return {

      ok:
        false,

      estado:
        "no_autorizado",

      msg:
        "⛔ La cuenta está registrada en Usuarios (fila " + registro.fila +
        "), pero la columna SIGA no está habilitada. Solicite a Informática " +
        "la revisión del permiso SIGA sin alterar Autorizado.",

      usuario:
        registro.usuario,

      correo:
        registro.correo,

      fila: registro.fila

    };

  }


  // ==========================================================
  // 4. Autorizado
  // ==========================================================

  return {

    ok:
      true,

    estado:
      "activo",

    usuario:
      registro.usuario ||
      registro.correo,

    correo:
      registro.correo,

    nombre:
      registro.nombre ||
      registro.usuario ||
      registro.correo,

    fila:
      registro.fila,

    // SIGA (H) habilita entrar; Autorizado (C) permanece independiente.
    autorizadoModulo: registro.autorizado === true,
    accesoWeb: registro.accesoWeb === true,

    resolucion:
      registro.resolucion,

    actas:
      registro.actas

  };

}


// ============================================================================
// LISTA DE USUARIOS
// ============================================================================

function obtenerListaUsuarios() {

  const datos =
    _getUsuariosData_();


  if (
    !datos ||
    datos.length < 2
  ) {

    return [];

  }


  const col =
    obtenerColumnasUsuarios_();


  const salida = [];


  for (
    let i = 1;
    i < datos.length;
    i++
  ) {

    const correos =
      extraerCorreosUsuarios_(
        datos[i][
          col.correo
        ]
      );


    correos.forEach(
      function (correo) {

        if (
          esCorreoDominioOGA_(
            correo
          )
        ) {

          salida.push(
            correo
          );

        }

      }
    );

  }


  return [
    ...new Set(
      salida
    )
  ];

}


// ============================================================================
// ESTADO PARA LOGIN POR CLAVE
// ============================================================================

function obtenerEstadoUsuario(
  correo
) {

  correo =
    normalizarCorreoOGA_(
      correo
    );


  if (
    !correo ||
    !esCorreoDominioOGA_(
      correo
    )
  ) {

    return "no_autorizado";

  }


  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  if (!registro) {

    return "no_autorizado";

  }


  if (
    !registro.accesoWeb
  ) {

    return "no_autorizado";

  }


  const acceso =
    String(
      registro.acceso || ""
    ).trim();


  if (
    !acceso ||
    acceso === "0"
  ) {

    return "definir";

  }


  return "activo";

}


// ============================================================================
// LOGIN POR CLAVE
// ============================================================================

function verificarUsuarioAutorizadoConClave(
  correo,
  clave
) {

  correo =
    normalizarCorreoOGA_(
      correo
    );


  clave =
    String(
      clave || ""
    );


  if (
    !correo ||
    !clave ||
    !esCorreoDominioOGA_(
      correo
    )
  ) {

    return false;

  }


  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  if (
    !registro ||
    !registro.accesoWeb
  ) {

    return false;

  }


  const claveHoja =
    String(
      registro.acceso || ""
    );


  return (
    claveHoja !== "0" &&
    claveHoja === clave
  );

}


// ============================================================================
// DEFINIR CLAVE
// ============================================================================

function definirClaveUsuario(
  correo,
  nuevaClave
) {

  correo =
    normalizarCorreoOGA_(
      correo
    );


  nuevaClave =
    String(
      nuevaClave || ""
    );


  if (
    !correo ||
    !nuevaClave
  ) {

    return false;

  }


  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  if (!registro) {

    return false;

  }


  const col =
    obtenerColumnasUsuarios_();


  if (
    col.acceso === -1
  ) {

    throw new Error(
      'No existe columna "Acceso" en Usuarios.'
    );

  }


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    15000
  );


  try {

    obtenerHojaUsuariosExterna()
      .getRange(
        registro.fila,
        col.acceso + 1
      )
      .setValue(
        nuevaClave
      );


    return true;


  } finally {

    lock.releaseLock();

  }

}


// ============================================================================
// NOMBRE
// ============================================================================

function obtenerNombreUsuarioPorCorreo(
  correo
) {

  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  return registro
    ? registro.nombre
    : "Usuario";

}


// ============================================================================
// SUPERVISORES
// ============================================================================

function obtenerListaSupervisores() {

  const datos =
    _getUsuariosData_();


  const col =
    obtenerColumnasUsuarios_();


  /*
   * En tu estructura actual no veo una columna Supervisor.
   * Por seguridad NO utilizamos "Autorizado" como supervisor.
   */

  if (
    col.supervisor === -1
  ) {

    return [];

  }


  const supervisores =
    [];


  for (
    let i = 1;
    i < datos.length;
    i++
  ) {

    if (
      usuarioTieneAutorizacion_(
        datos[i][
          col.supervisor
        ]
      )
    ) {

      const correos =
        extraerCorreosUsuarios_(
          datos[i][
            col.correo
          ]
        );


      if (
        correos.length
      ) {

        supervisores.push(
          correos[0]
        );

      }

    }

  }


  return supervisores;

}


// ============================================================================
// RESTABLECER CLAVE
// ============================================================================

function restablecerClaveUsuario(
  correoSupervisor,
  claveSupervisor,
  correoUsuario
) {

  if (
    !verificarUsuarioAutorizadoConClave(
      correoSupervisor,
      claveSupervisor
    )
  ) {

    return "❌ Credenciales de supervisor inválidas.";

  }


  correoUsuario =
    normalizarCorreoOGA_(
      correoUsuario
    );


  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correoUsuario
    );


  if (!registro) {

    return "⚠️ Usuario no encontrado.";

  }


  const col =
    obtenerColumnasUsuarios_();


  if (
    col.acceso === -1
  ) {

    return "❌ No existe columna Acceso.";

  }


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    15000
  );


  try {

    obtenerHojaUsuariosExterna()
      .getRange(
        registro.fila,
        col.acceso + 1
      )
      .setValue(
        "0"
      );


    try {

      if (
        typeof registrarActividad ===
        "function"
      ) {

        registrarActividad(
          correoSupervisor,
          `Restableció acceso a ${correoUsuario}`
        );

      }

    } catch (_) {}


    return "✅ Acceso restablecido correctamente.";


  } finally {

    lock.releaseLock();

  }

}


// ============================================================================
// QA - PROBAR USUARIO GOOGLE
// ============================================================================

function QA_PROBAR_USUARIO_GOOGLE_OGA() {

  /*
   * Cambia este correo únicamente para las pruebas.
   */

  const correo =
    "jalvarado@oga.org.gt";


  const registro =
    obtenerRegistroUsuarioPorCorreo_(
      correo
    );


  const autorizado =
    obtenerUsuarioAutorizadoGoogle(
      correo
    );


  const resultado = {

    correo_buscado:
      correo,


    encontrado:
      !!registro,


    fila:
      registro
        ? registro.fila
        : null,


    usuario:
      registro
        ? registro.usuario
        : "",


    correo:
      registro
        ? registro.correo
        : "",


    nombre:
      registro
        ? registro.nombre
        : "",


    autorizado_raw:
      registro
        ? registro.autorizado_raw
        : null,


    autorizado_interpretado:
      registro
        ? registro.autorizado
        : false,


    validacion_google:
      autorizado

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


/**
 * Diagnóstico sólo lectura para ejecutar desde el editor de Apps Script.
 * El sufijo _ impide invocarlo desde google.script.run.
 */
function QA_DIAGNOSTICO_AUTORIZACION_GOOGLE_OGA_() {
  const cuentas = ['gquevedo@oga.org.gt', 'eajuchan@oga.org.gt'];
  const resultados = cuentas.map(function(correo) {
    const registro = obtenerRegistroUsuarioPorCorreo_(correo);
    const validacion = obtenerUsuarioAutorizadoGoogle(correo);
    return {
      correo: correo,
      fila: registro && registro.fila || null,
      filasDuplicadas: registro && registro.ambiguo ? registro.filas : [],
      autorizadoRaw: registro && !registro.ambiguo ? String(registro.autorizado_raw ?? '') : '',
      autorizadoInterpretado: registro && !registro.ambiguo ? registro.autorizado : false,
      accesoWebRaw: registro && !registro.ambiguo ? String(registro.accesoWebRaw ?? '') : '',
      accesoWebInterpretado: registro && !registro.ambiguo ? registro.accesoWeb : false,
      estado: validacion.estado,
      requiereRevision: validacion.ok !== true
    };
  });
  Logger.log(JSON.stringify(resultados, null, 2));
  return resultados;
}


// ============================================================================
// QA - VER MAPA DE COLUMNAS
// ============================================================================

function QA_VER_COLUMNAS_USUARIOS() {

  const columnas =
    obtenerColumnasUsuarios_();


  Logger.log(
    JSON.stringify(
      columnas,
      null,
      2
    )
  );


  return columnas;

}
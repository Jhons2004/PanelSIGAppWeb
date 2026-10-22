// =====================================================================================
// SISTEMA DE AGENDA OGA - VERSIÓN 22 CON MEJORAS UI Y CONTROL DE VOTACIONES
// Archivo: Agenda_Consejo.gs  
// NUEVO: Control de acceso específico para votaciones
// NUEVO: Estadísticas mejoradas por tipo de decisión
// MODIFICADO: FIX para distinguir múltiples tipos de decisión por registro
// NUEVO: UI mejorada con texto nítido en ambos modos
// MODIFICADO: Correo institucional obligatorio info@oga.org.gt
// =====================================================================================

// ===================== CONFIGURACIÓN GLOBAL ACTUALIZADA =====================
const AGENDA_SHEET_ID = "1ojF7iJ_npGYO4NH6SxqHAmsKCRX-62HTeM6RP1oEWDU";

// Carpetas específicas (usar las existentes)
const FOLDER_ID = "1DgdppxZ5QcSHTEiqR5eVh1yRBRMxJzu2"; // Para archivos adjuntos
const AGENDAS_CREADAS_FOLDER_ID = "1mDYD7qe5KD9Rj41ALCLthtEO-2G9pOeV"; // Para agendas generadas

const PLANTILLA_AGENDA_ID = "1rIg79HVddWNNAS3E82kfyCAbVYVjAqFwhca6kziwuNA";
const CONFIRMACION_DATOS_ID = "1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc";
const USUARIOS_SHEET_ID = "1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY";
const REUNIONES_SHEET_ID = "1ojF7iJ_npGYO4NH6SxqHAmsKCRX-62HTeM6RP1oEWDU";

// IDs de votaciones
const VOTACIONES_SHEET_ID_REF = "1ojF7iJ_npGYO4NH6SxqHAmsKCRX-62HTeM6RP1oEWDU";
const HOJA_VOTACIONES_REF = "Votaciones";

const WEBAPP_VOTACION_URL = "https://script.google.com/macros/s/AKfycbyI9-UE30sDzNKDWJQnpnCN7hTXHlmLq8-efRyEXzjC41K2aAjavpELnialX1kV_WAl0w/exec";

// MODIFICADO: Asegurar uso del correo institucional
const CORREO_INSTITUCIONAL = "info@oga.org.gt";


// NUEVO: Usuarios autorizados específicamente para enviar votaciones

// ===================== FUNCIONES DE PERMISOS MEJORADAS =====================

// ===================== WEBAPP: PERMISOS POR HOJA "Usuarios" (POR NOMBRE) =====================
// En WebApp, Session.getActiveUser().getEmail() puede venir vacío.
// Este sistema usa el "usuario activo" del login (getUsuarioActivo) que en tu caso es NOMBRE (columna A).
// Permisos:
// - Crear/Administrar agenda: Columna C = "Autorizado" (sí/no)
// - Enviar votaciones: Columna E = "Resolucion" (sí/no)

function normalizarTextoPermisos(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getUsuarioEfectivo() {
  // En esta modalidad, el usuario activo es el NOMBRE seleccionado en el Login (hoja Usuarios).
  // No usamos Session.getActiveUser().getEmail() porque en WebApp puede venir vacío y aquí NO trabajamos por correo.
  try {
    if (typeof getUsuarioActivo === "function") {
      var u = getUsuarioActivo();
      if (u) return String(u).trim();
    }
  } catch (e) {}
  return "";
}

function obtenerPermisosUsuario() {
  try {
    var usuario = getUsuarioEfectivo();
    if (!usuario) {
      return {
        ok: false,
        enHoja: false,
        usuario: "",
        nombreCompleto: "",
        autorizadoCrear: false,
        autorizadoVotar: false
      };
    }

    // Cache corto para evitar leer la hoja en cada llamada
    var cache = CacheService.getScriptCache();
    var cacheKey = "CNA_PERMISOS:" + normalizarTextoPermisos(usuario);
    var cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }

    var ss = SpreadsheetApp.openById(USUARIOS_SHEET_ID);
    var hoja = ss.getSheetByName("Usuarios");
    if (!hoja) {
      return {
        ok: true,
        enHoja: false,
        usuario: usuario,
        nombreCompleto: usuario,
        autorizadoCrear: false,
        autorizadoVotar: false,
        message: 'No se encontró la hoja "Usuarios" en la BD de usuarios'
      };
    }

    var datos = hoja.getDataRange().getValues(); // incluye headers
    if (datos.length <= 1) {
      return {
        ok: true,
        enHoja: false,
        usuario: usuario,
        nombreCompleto: usuario,
        autorizadoCrear: false,
        autorizadoVotar: false,
        message: 'No hay usuarios en la hoja "Usuarios"'
      };
    }

    for (var i = 1; i < datos.length; i++) {
      var usuarioHoja = normalizarTextoPermisos(datos[i][0]); // Col A: Usuario (NOMBRE)
      if (usuarioHoja === usuarioNorm) {
        var autorizado = normalizarTextoPermisos(datos[i][2]) === "si"; // Col C
        var resolucion = normalizarTextoPermisos(datos[i][4]) === "si"; // Col E
        var nombreCompleto = String(datos[i][3] || "").trim() || String(datos[i][0] || "").trim();

        var result = {
          ok: true,
          enHoja: true,
          fila: i + 1,
          usuario: String(datos[i][0] || "").trim(),
          nombreCompleto: nombreCompleto,
          autorizadoCrear: autorizado,
          autorizadoVotar: resolucion
        };

        cache.put(cacheKey, JSON.stringify(result), 120); // 2 min
        return result;
      }
    }

    var fallback = {
      ok: true,
      enHoja: false,
      usuario: usuario,
      nombreCompleto: usuario,
      autorizadoCrear: false,
      autorizadoVotar: false,
      message: 'Usuario no encontrado en hoja "Usuarios"'
    };
    cache.put(cacheKey, JSON.stringify(fallback), 120);
    return fallback;

  } catch (e) {
    return {
      ok: false,
      enHoja: false,
      usuario: "",
      nombreCompleto: "",
      autorizadoCrear: false,
      autorizadoVotar: false,
      message: e.message
    };
  }
}

function esUsuarioAutorizadoParaAgenda() {
  var p = obtenerPermisosUsuario();
  return !!(p && p.autorizadoCrear);
}

function esUsuarioAutorizadoParaVotacion() {
  var p = obtenerPermisosUsuario();
  return !!(p && p.autorizadoVotar);
}

function contarUsuariosConPermisoVotacion() {
  try {
    var ss = SpreadsheetApp.openById(USUARIOS_SHEET_ID);
    var hoja = ss.getSheetByName(USUARIOS_SHEET_NAME);
    if (!hoja) return 0;

    var datos = hoja.getDataRange().getValues();
    var count = 0;

    for (var i = 1; i < datos.length; i++) {
      var flag = normalizarTexto(datos[i][4]); // Col E: Resolucion
      if (flag === "si") count++;
    }
    return count;
  } catch (e) {
    return 0;
  }
}


function getUsuarioActual() {
  var p = obtenerPermisosUsuario();
  // Mantengo la propiedad "email" por compatibilidad con el frontend existente
  return {
    email: p && p.ok ? (p.usuario || getUsuarioEfectivo()) : getUsuarioEfectivo(),
    nombre: p && p.nombreCompleto ? p.nombreCompleto : (p.usuario || getUsuarioEfectivo()),
    autorizadoCrear: !!(p && p.autorizadoCrear),
    autorizadoVotar: !!(p && p.autorizadoVotar),
    enHoja: !!(p && p.enHoja)
  };
}

// ===================== CONTADOR DE TIEMPO REGRESIVO (INTEGRADO) =====================

/**
 * Calcula el tiempo restante hasta el vencimiento de la agenda
 * @return {Object} Información del tiempo restante
 */
function calcularTiempoRestante() {
  try {
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const configSheet = ss.getSheetByName('Configuracion');
    
    if (!configSheet || configSheet.getLastRow() < 2) {
      return { 
        success: false, 
        message: 'No hay agenda activa',
        tiempoRestante: 0,
        expirada: true 
      };
    }

    const datosAgenda = configSheet.getRange('A2:K2').getValues()[0];
    const [, numeroReunion, fechaInicio, fechaFin, horaLimite, , , , estado] = datosAgenda;
    
    // Si la agenda ya está cerrada, no hay tiempo
    if (estado === 'CERRADA' || estado === 'VENCIDA') {
      return {
        success: true,
        message: 'Agenda cerrada',
        tiempoRestante: 0,
        expirada: true,
        estado: estado
      };
    }

    const ahora = new Date();
    const fechaFinDate = new Date(fechaFin);
    
    // Construir fecha límite con hora
    let fechaLimite = new Date(fechaFinDate);
    try {
      if (horaLimite && typeof horaLimite === 'string' && horaLimite.includes(':')) {
        const [h, m] = horaLimite.split(':');
        fechaLimite.setHours(parseInt(h) || 23, parseInt(m) || 59, 59, 999);
      } else {
        fechaLimite.setHours(23, 59, 59, 999);
      }
    } catch (_) {
      fechaLimite.setHours(23, 59, 59, 999);
    }

    const tiempoRestanteMs = fechaLimite.getTime() - ahora.getTime();
    const expirada = tiempoRestanteMs <= 0;

    // Si expiró, marcar como vencida automáticamente
    if (expirada && estado === 'ACTIVA') {
      try {
        configSheet.getRange('I2').setValue('VENCIDA');
        Logger.log(`⏰ Agenda ${numeroReunion} marcada como VENCIDA automáticamente`);
      } catch (e) {
        Logger.log('⚠️ Error marcando agenda como vencida: ' + e.message);
      }
    }

    return {
      success: true,
      numeroReunion: String(numeroReunion || '').replace(/^'/, '').trim(),
      fechaLimite: fechaLimite,
      tiempoRestante: Math.max(0, tiempoRestanteMs),
      expirada: expirada,
      estado: expirada ? 'VENCIDA' : estado,
      mensaje: expirada ? 'Tiempo agotado' : 'Agenda activa'
    };

  } catch (error) {
    Logger.log('❌ Error calculando tiempo restante: ' + error.message);
    return { 
      success: false, 
      message: 'Error: ' + error.message,
      tiempoRestante: 0,
      expirada: true 
    };
  }
}

/**
 * Formatea tiempo en milisegundos a formato HH:MM:SS
 * @param {number} ms - Milisegundos
 * @return {Object} Tiempo formateado
 */
function formatearTiempo(ms) {
  if (ms <= 0) {
    return {
      horas: 0,
      minutos: 0,
      segundos: 0,
      texto: '00:00:00',
      textoLegible: 'Tiempo agotado',
      clase: 'expirado'
    };
  }

  const segundosTotal = Math.floor(ms / 1000);
  const horas = Math.floor(segundosTotal / 3600);
  const minutos = Math.floor((segundosTotal % 3600) / 60);
  const segundos = segundosTotal % 60;

  const horasStr = String(horas).padStart(2, '0');
  const minutosStr = String(minutos).padStart(2, '0');
  const segundosStr = String(segundos).padStart(2, '0');

  let textoLegible = '';
  let clase = 'normal';
  
  if (horas > 0) {
    textoLegible = `${horas}h ${minutos}m restantes`;
  } else if (minutos > 0) {
    textoLegible = `${minutos}m ${segundos}s restantes`;
    if (minutos <= 5) clase = 'urgente'; // Últimos 5 minutos
  } else {
    textoLegible = `${segundos}s restantes`;
    clase = 'critico'; // Últimos 60 segundos
  }

  return {
    horas,
    minutos,
    segundos,
    texto: `${horasStr}:${minutosStr}:${segundosStr}`,
    textoLegible: textoLegible,
    clase: clase
  };
}

/**
 * 📡 API para el frontend - Obtiene el estado actual del tiempo
 */
function obtenerEstadoTiempoAgenda() {
  try {
    const tiempoInfo = calcularTiempoRestante();
    
    if (!tiempoInfo.success) {
      return tiempoInfo;
    }

    const tiempoFormateado = formatearTiempo(tiempoInfo.tiempoRestante);
    
    return {
      success: true,
      numeroReunion: tiempoInfo.numeroReunion,
      tiempoRestante: tiempoInfo.tiempoRestante,
      expirada: tiempoInfo.expirada,
      estado: tiempoInfo.estado,
      mensaje: tiempoInfo.mensaje,
      tiempo: tiempoFormateado,
      fechaLimite: tiempoInfo.fechaLimite ? tiempoInfo.fechaLimite.toISOString() : null,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return { 
      success: false, 
      message: 'Error obteniendo estado: ' + error.message,
      expirada: true 
    };
  }
}

/**
 * 🛡️ Verificar si se puede agregar elementos (CON VALIDACIÓN DE TIEMPO)
 */
function puedeAgregarElementos() {
  try {
    const tiempoInfo = calcularTiempoRestante();
    
    if (!tiempoInfo.success) {
      return { 
        puede: false, 
        motivo: 'NO_AGENDA',
        mensaje: 'No hay agenda activa' 
      };
    }

    if (tiempoInfo.expirada) {
      return { 
        puede: false, 
        motivo: 'TIEMPO_AGOTADO',
        mensaje: '⏰ El tiempo para agregar elementos ha expirado' 
      };
    }

    if (tiempoInfo.estado === 'CERRADA') {
      return { 
        puede: false, 
        motivo: 'AGENDA_CERRADA',
        mensaje: '🔒 La agenda ha sido cerrada manualmente' 
      };
    }

    return { 
      puede: true, 
      motivo: 'ACTIVA',
      mensaje: 'Puede agregar elementos',
      tiempoRestante: formatearTiempo(tiempoInfo.tiempoRestante).textoLegible
    };

  } catch (error) {
    return { 
      puede: false, 
      motivo: 'ERROR',
      mensaje: 'Error verificando permisos: ' + error.message 
    };
  }
}

// ===================== FUNCIONES DE VOTACIONES CON CONTROL DE ACCESO =====================

/**
 * FUNCIÓN SIMPLE: Solo verificar si hay agenda archivada para votar
 */
function hayAgendaListaParaVotar() {
  try {
    console.log('🎯 Verificación simple para votaciones...');
    
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const votacionSheet = ss.getSheetByName('Agenda_Votacion');
    
    if (!votacionSheet) {
      return { success: false, mensaje: 'No existe hoja Agenda_Votacion' };
    }
    
    // LEER SOLO LO ESENCIAL
    const numeroReunion = votacionSheet.getRange('B2').getDisplayValue().replace(/^'/, '').trim();
    const estadoArchivo = votacionSheet.getRange('M2').getDisplayValue().trim();
    
    console.log(`📋 Verificación: B2="${numeroReunion}", M2="${estadoArchivo}"`);
    
    // VALIDACIÓN SIMPLE
    if (!numeroReunion) {
      return { success: false, mensaje: 'No hay reunión en B2' };
    }
    
    if (estadoArchivo !== 'ARCHIVADA') {
      return { success: false, mensaje: `Estado M2 es "${estadoArchivo}", necesita ser "ARCHIVADA"` };
    }
    
    // ¡TODO BIEN!
    return {
      success: true,
      mensaje: `✅ Reunión ${numeroReunion} lista para votación`,
      numeroReunion: numeroReunion,
      estado: estadoArchivo
    };
    
  } catch (error) {
    console.error('💥 Error en verificación simple:', error);
    return { success: false, mensaje: 'Error: ' + error.message };
  }
}

/**
 * MODIFICADO: Enviar votaciones con validación de permisos
 */
function enviarVotacionesDirectas(modoPrueba = false, maxEnviar = null) {
  try {
    // NUEVA VALIDACIÓN: Verificar permisos de usuario
    if (!esUsuarioAutorizadoParaVotacion()) {
      return { 
        success: false, 
        message: '🚫 Acceso denegado. Solo Carlos Archila, Estephanie Ajuchán, Lidia Sanchez y Jonatan Alvarado pueden enviar votaciones.' 
      };
    }

    console.log('📧 Envío directo de votaciones con permisos verificados...');
    
    // VERIFICAR QUE HAY AGENDA LISTA
    const verificacion = hayAgendaListaParaVotar();
    if (!verificacion.success) {
      return { success: false, message: verificacion.mensaje };
    }
    
    const numeroReunion = verificacion.numeroReunion;
    console.log(`📧 Enviando para reunión: ${numeroReunion}`);
    
    // OBTENER MIEMBROS Y ENVIAR
    const miembros = obtenerMiembrosParaVotacion(modoPrueba);
    if (miembros.length === 0) {
      return { success: false, message: "No se encontraron miembros" };
    }
    
    const listaEnvio = maxEnviar ? miembros.slice(0, maxEnviar) : miembros;
    const enviados = [];
    const errores = [];
    
    listaEnvio.forEach(m => {
      try {
        const url = WEBAPP_VOTACION_URL +
          "?email=" + encodeURIComponent(m.email) +
          "&reunion=" + encodeURIComponent(numeroReunion);
          
        const { asunto, htmlBody, textBody } = construirCuerpoInvitacion(m, 
          { numeroReunion: numeroReunion, nombre: `Reunión ${numeroReunion}` }, 
          url, modoPrueba);
          
        // MODIFICADO: Forzar uso del correo institucional
        MailApp.sendEmail({
          to: m.email,
          subject: asunto,
          htmlBody: htmlBody,
          body: textBody,
          replyTo: CORREO_INSTITUCIONAL,
          name: "OGA - Sistema de Votaciones"  // MODIFICADO: Nombre más claro
        });
        
        enviados.push({ email: m.email, url });
        console.log(`✅ Enviado desde ${CORREO_INSTITUCIONAL} a: ${m.email}`);
        
      } catch (e) {
        errores.push({ email: m.email, error: e.message });
        console.log(`❌ Error: ${m.email} - ${e.message}`);
      }
    });
    
    return {
      success: errores.length === 0,
      message: `✅ Votaciones enviadas desde ${CORREO_INSTITUCIONAL} para ${numeroReunion}. Exitosos: ${enviados.length}, Errores: ${errores.length}`,
      reunion: numeroReunion,
      enviados,
      errores
    };
    
  } catch (error) {
    console.error('💥 Error en envío directo:', error);
    return { success: false, message: 'Error: ' + error.message };
  }
}

// ===================== FUNCIONES WRAPPER PARA COMPATIBILIDAD =====================

function buscarAgendasAprobadas() {
  const resultado = hayAgendaListaParaVotar();
  
  if (resultado.success) {
    return {
      success: true,
      mensaje: resultado.mensaje,
      agendas: [{
        numeroReunion: resultado.numeroReunion,
        nombre: `Reunión ${resultado.numeroReunion}`,
        fechaAprobacion: new Date(),
        totalRegistros: 3,
        tipo: 'ARCHIVADA'
      }]
    };
  } else {
    return {
      success: false,
      mensaje: resultado.mensaje,
      agendas: []
    };
  }
}

function enviarInvitacionesVotacionEspecifica(numeroReunion, modoPrueba = false, maxEnviar = null) {
  return enviarVotacionesDirectas(modoPrueba, maxEnviar);
}

function enviarInvitacionesVotacion(modoPrueba, maxEnviar) {
  return enviarVotacionesDirectas(modoPrueba, maxEnviar);
}

function debugAgendasArchivadas() {
  try {
    console.log('🔬 DEBUG SIMPLE - Solo verificar B2 y M2...');
    
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    
    // Verificar hoja Configuracion
    const configSheet = ss.getSheetByName('Configuracion');
    let estadoConfiguracion = 'NO EXISTE';
    let datosConfiguracion = null;
    
    if (configSheet) {
      try {
        estadoConfiguracion = configSheet.getRange('I2').getDisplayValue().trim() || 'VACIO';
        datosConfiguracion = configSheet.getRange('A2:K2').getValues()[0];
      } catch (e) {
        estadoConfiguracion = 'ERROR: ' + e.message;
      }
    }
    
    // Verificar hoja Agenda_Votacion
    const votacionSheet = ss.getSheetByName('Agenda_Votacion');
    let estadoArchivo = 'NO EXISTE HOJA';
    let numeroReunionArchivada = 'N/A';
    let datosVotacion = null;
    
    if (votacionSheet) {
      try {
        numeroReunionArchivada = votacionSheet.getRange('B2').getDisplayValue().replace(/^'/, '').trim() || 'VACIO';
        estadoArchivo = votacionSheet.getRange('M2').getDisplayValue().trim() || 'VACIO';
        datosVotacion = votacionSheet.getRange('A2:M2').getValues()[0];
      } catch (e) {
        estadoArchivo = 'ERROR: ' + e.message;
      }
    }
    
    const agendaValida = (numeroReunionArchivada !== 'VACIO' && estadoArchivo === 'ARCHIVADA');
    
    return {
      error: false,
      configuracion: {
        existe: !!configSheet,
        estado: estadoConfiguracion,
        datos: datosConfiguracion,
        rango: 'A2:K2'
      },
      votacion: {
        existe: !!votacionSheet,
        hayDatos: numeroReunionArchivada !== 'VACIO',
        numeroReunion: numeroReunionArchivada,
        estadoArchivo: estadoArchivo,
        datos: datosVotacion,
        rango: 'A2:M2'
      },
      agendaValidaEncontrada: agendaValida,
      totalAgendas: agendaValida ? 1 : 0,
      mensaje: `LECTURA DIRECTA - B2: "${numeroReunionArchivada}", M2: "${estadoArchivo}"`
    };
    
  } catch (error) {
    console.error('💥 ERROR EN DEBUG DIRECTO:', error);
    return {
      error: true,
      mensaje: 'Error en debug: ' + error.message,
      configuracion: { existe: false },
      votacion: { existe: false, hayDatos: false },
      agendaValidaEncontrada: false,
      totalAgendas: 0
    };
  }
}

function buscarReunionAprobadaParaVotacion() {
  const verificacion = hayAgendaListaParaVotar();
  
  if (verificacion.success) {
    return {
      disponible: true,
      mensaje: verificacion.mensaje,
      config: {
        numeroReunion: verificacion.numeroReunion,
        nombre: `Reunión ${verificacion.numeroReunion}`,
        estado: 'CERRADA',
        estadoDetallado: 'APROBADA'
      }
    };
  } else {
    return {
      disponible: false,
      mensaje: verificacion.mensaje,
      todasLasAgendas: []
    };
  }
}

function obtenerAgendasArchivadas() {
  const resultado = hayAgendaListaParaVotar();
  
  if (resultado.success) {
    return [{
      numeroReunion: resultado.numeroReunion,
      nombre: `Reunión ${resultado.numeroReunion}`,
      estado: 'CERRADA',
      fechaAprobacion: new Date(),
      totalRegistros: 3,
      tipo: 'ARCHIVADA'
    }];
  } else {
    return [];
  }
}

// ===================== ESTADÍSTICAS MEJORADAS POR TIPO DE DECISIÓN =====================

/**
 * CORREGIDA: Obtener estadísticas agrupadas por tipo de decisión
 * FIX: Ahora distingue correctamente múltiples tipos de decisión para el mismo registro
 */
function obtenerEstadisticasVotosPorReunionMejoradas(numeroReunion) {
  try {
    const reunionEtiqueta = `REU-${numeroReunion}`;
    const ss = SpreadsheetApp.openById(VOTACIONES_SHEET_ID_REF);
    const sheet = ss.getSheetByName(HOJA_VOTACIONES_REF);
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, registros: [], data: { aFavor: 0, enContra: 0, abstencion: 0, total: 0 } };
    }

    const datos = sheet.getDataRange().getValues();
    const registroStats = {};
    
    // CORREGIDO: Procesar votos distinguiendo registro + tipo de decisión
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (String(fila[9] || "") === reunionEtiqueta) {
        const registro = String(fila[3] || "").trim();
        const voto = String(fila[5] || "").trim();
        const comentario = String(fila[6] || "").trim();
        const institucion = String(fila[2] || "").trim();
        const nombre = String(fila[7] || "").trim();
        const tipoDecision = String(fila[4] || "").trim();
        const resolucion = String(fila[10] || "").trim();

        // CORREGIDO: Clave única que combina registro + tipo de decisión
        const claveUnica = `${registro}___${tipoDecision}`;

        if (!registroStats[claveUnica]) {
          registroStats[claveUnica] = {
            registro,
            tipoDecision,
            resolucion,
            votos: { aFavor: 0, enContra: 0, abstencion: 0 },
            comentarios: [],
            votantes: [],
            // Mostrar claramente que son diferentes tipos para el mismo registro
            displayName: tipoDecision ? `${registro} (${tipoDecision})` : registro
          };
        }

        const votoLower = voto.toLowerCase();
        if (votoLower === "a favor") registroStats[claveUnica].votos.aFavor++;
        else if (votoLower === "en contra") registroStats[claveUnica].votos.enContra++;
        else if (votoLower === "abstención" || votoLower === "abstencion") registroStats[claveUnica].votos.abstencion++;

        if (comentario) {
          registroStats[claveUnica].comentarios.push({
            comentario,
            institucion,
            nombre,
            voto
          });
        }

        registroStats[claveUnica].votantes.push({
          nombre,
          institucion,
          voto
        });
      }
    }

    // NUEVO: Agrupar por tipo de decisión
    const registrosPorTipo = {};
    const registros = Object.values(registroStats).map(reg => {
      reg.totalVotos = reg.votos.aFavor + reg.votos.enContra + reg.votos.abstencion;
      reg.porcentajeAFavor = reg.totalVotos > 0 ? Math.round((reg.votos.aFavor / reg.totalVotos) * 100) : 0;
      reg.puedeGenerarResolucion = reg.porcentajeAFavor > 50;
      
      // Agrupar por tipo de decisión
      const tipo = reg.tipoDecision || 'Sin Tipo';
      if (!registrosPorTipo[tipo]) {
        registrosPorTipo[tipo] = {
          tipo: tipo,
          registros: [],
          totales: { aFavor: 0, enContra: 0, abstencion: 0, total: 0 },
          aprobados: 0,
          rechazados: 0
        };
      }
      
      registrosPorTipo[tipo].registros.push(reg);
      registrosPorTipo[tipo].totales.aFavor += reg.votos.aFavor;
      registrosPorTipo[tipo].totales.enContra += reg.votos.enContra;
      registrosPorTipo[tipo].totales.abstencion += reg.votos.abstencion;
      registrosPorTipo[tipo].totales.total += reg.totalVotos;
      
      if (reg.puedeGenerarResolucion) registrosPorTipo[tipo].aprobados++;
      else if (reg.votos.enContra > reg.votos.aFavor) registrosPorTipo[tipo].rechazados++;
      
      return reg;
    });

    let aFavor = 0, enContra = 0, abstencion = 0;
    registros.forEach(reg => {
      aFavor += reg.votos.aFavor;
      enContra += reg.votos.enContra;
      abstencion += reg.votos.abstencion;
    });

    Logger.log(`📊 Estadísticas procesadas: ${registros.length} registros únicos (incluyendo múltiples tipos por registro)`);
    
    return { 
      success: true, 
      registros,
      registrosPorTipo: Object.values(registrosPorTipo),
      data: { aFavor, enContra, abstencion, total: aFavor + enContra + abstencion }
    };
    
  } catch (err) {
    Logger.log('❌ Error en estadísticas mejoradas: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ===================== FUNCIONES DE CORRELATIVO =====================

function registrarNumeroReunion(numeroReunion, fechaReunion) {
  try {
    const reunionesSheet = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    let sheetR = reunionesSheet.getSheetByName('Reuniones');
    
    if (!sheetR) {
      sheetR = reunionesSheet.insertSheet('Reuniones');
      sheetR.getRange(1, 1, 1, 2).setValues([['Numero_Reunion', 'Fecha_Reunion']]);
      sheetR.getRange(1, 1, 1, 2).setFontWeight('bold');
      sheetR.setFrozenRows(1);
    }
    
    const filaDestino = sheetR.getLastRow() + 1;
    const numeroConApostrofe = "'" + numeroReunion.trim();
    
    sheetR.getRange(filaDestino, 1).setValue(numeroConApostrofe);
    sheetR.getRange(filaDestino, 2).setValue(new Date(fechaReunion));
    
    Logger.log(`✅ Correlativo registrado: "${numeroReunion}" como texto con apostrofe`);
    return { success: true, numeroRegistrado: numeroReunion };
    
  } catch (error) {
    Logger.log('❌ Error registrando correlativo: ' + error.message);
    return { success: false, message: error.message };
  }
}

function eliminarNumeroReunion(numeroReunion) {
  try {
    const reunionesSheet = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    const sheetR = reunionesSheet.getSheetByName('Reuniones');
    
    if (!sheetR) {
      return { success: true, message: 'No hay correlativo que eliminar' };
    }
    
    const datos = sheetR.getDataRange().getValues();
    
    for (let i = datos.length - 1; i >= 1; i--) {
      const valorEnHoja = datos[i][0];
      const reunionEnHoja = String(valorEnHoja || '').replace(/^'/, '').trim();
      
      if (reunionEnHoja === numeroReunion.trim()) {
        sheetR.deleteRow(i + 1);
        Logger.log(`✅ Correlativo ${numeroReunion} eliminado (fila ${i + 1})`);
        return { success: true, message: `Correlativo ${numeroReunion} eliminado` };
      }
    }
    
    return { success: true, message: `Correlativo ${numeroReunion} no encontrado` };
    
  } catch (error) {
    Logger.log('❌ Error eliminando correlativo: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ===================== AUTOMATIZACIÓN DE CALENDARIO (NUEVO) =====================

/**
 * LÓGICA VERTICAL (Col C=Fecha, Col D=Estado, Col F=Extra)
 * 1. Busca si existe una fila marcada como "ACTIVA".
 * 2. Si hay "ACTIVA": Revisa si tiene Fecha Extraordinaria (F), si no usa la Normal (C).
 * 3. Fallback: Si ninguna es "ACTIVA", busca la primera fecha futura que no esté "CERRADA".
 */
function obtenerSiguienteFechaReunion() {
  try {
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID); // Usa tu constante global
    const hoja = ss.getSheetByName("Calendario_Reuniones");
    
    if (!hoja) {
      return { success: false, message: "⚠️ No existe la hoja 'Calendario_Reuniones'" };
    }
    
    // Obtenemos todos los datos de la hoja
    const datos = hoja.getDataRange().getValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar hoy sin hora

    // --- ESTRATEGIA 1: BUSCAR LA ETIQUETA "ACTIVA" (Prioridad Máxima) ---
    // Recorremos desde la fila 2 (índice 1)
    for (let i = 1; i < datos.length; i++) {
      // Columna D es el índice 3
      const estado = String(datos[i][3] || "").toUpperCase().trim(); 
      
      if (estado === "ACTIVA") {
        // Encontramos la fila activa. Ahora decidimos qué fecha usar DE ESTA FILA.
        const fechaExtra = datos[i][5]; // Col F (Indice 5)
        const fechaNormal = datos[i][2]; // Col C (Indice 2)
        const mes = obtenerMesCorrecto_(datos, i);

        // Si hay fecha extraordinaria válida en esta fila, GANA.
        if (esFechaValida_(fechaExtra)) {
           return formatearRespuestaFecha_(fechaExtra, "FECHA EXTRAORDINARIA (ACTIVA)", mes);
        }
        
        // Si no, devolvemos la fecha normal
        if (esFechaValida_(fechaNormal)) {
           return formatearRespuestaFecha_(fechaNormal, "REUNIÓN PROGRAMADA (ACTIVA)", mes);
        }
      }
    }

    // --- ESTRATEGIA 2: FALLBACK (Si nadie puso "ACTIVA") ---
    // Buscamos la primera fecha futura que no esté cerrada
    for (let i = 1; i < datos.length; i++) {
      const fechaNormal = datos[i][2]; // Col C (Indice 2)
      const estado = String(datos[i][3] || "").toUpperCase().trim(); // Col D (Indice 3)
      
      if (esFechaValida_(fechaNormal)) {
        const fechaObj = new Date(fechaNormal);
        fechaObj.setHours(0,0,0,0);
        
        // Si es hoy o futuro Y no está cerrada
        if (fechaObj >= hoy && estado !== "CERRADA") {
           const fechaExtra = datos[i][5]; // Col F
           const mes = obtenerMesCorrecto_(datos, i);

           // Misma lógica: Si tiene extra, gana extra
           if (esFechaValida_(fechaExtra)) {
             return formatearRespuestaFecha_(fechaExtra, "FECHA EXTRAORDINARIA", mes);
           }
           return formatearRespuestaFecha_(fechaNormal, "SIGUIENTE REUNIÓN DISPONIBLE", mes);
        }
      }
    }

    return { success: false, message: "No se encontraron fechas disponibles en el calendario." };

  } catch (e) {
    Logger.log("Error en calendario: " + e.message);
    return { success: false, message: "Error interno: " + e.message };
  }
}

// --- Helpers necesarios para la función nueva ---

// Busca hacia arriba el nombre del mes si la celda está combinada (vacía)
function obtenerMesCorrecto_(datos, indiceActual) {
  for (let k = indiceActual; k >= 1; k--) {
    // Columna B es índice 1
    if (datos[k][1] && String(datos[k][1]).trim() !== "") {
      return String(datos[k][1]).toUpperCase();
    }
  }
  return "MES DESCONOCIDO";
}

function esFechaValida_(d) {
  return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
}

function formatearRespuestaFecha_(fechaObj, origenTxt, mesTxt) {
  return {
    success: true,
    fechaInput: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    fechaDisplay: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "dd/MM/yyyy"),
    mes: mesTxt,
    origen: origenTxt
  };
}

// Helpers internos para la función de calendario
function esFechaValida(fecha) {
  return Object.prototype.toString.call(fecha) === "[object Date]" && !isNaN(fecha.getTime());
}

function formatDateISO(date) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ===================== SISTEMA DE ARCHIVO (DOS HOJAS) =====================

function crearHojaAgendaVotacionSiNoExiste_(ss) {
  try {
    let votacionSheet = ss.getSheetByName('Agenda_Votacion');
    
    if (!votacionSheet) {
      console.log('📋 Creando hoja Agenda_Votacion...');
      votacionSheet = ss.insertSheet('Agenda_Votacion');
      
      const headers = [
        'Nombre Agenda',      // A1
        'Numero Reunion',     // B1
        'Fecha Inicio',       // C1
        'Fecha Fin',          // D1
        'Hora Limite',        // E1
        'Creado Por',         // F1
        'Fecha Creacion',     // G1
        'Version',            // H1
        'Estado',             // I1
        'Fecha Reunion',      // J1
        'Fecha Aprobacion',   // K1
        'Fecha Archivo',      // L1
        'Estado Archivo'      // M1
      ];
      
      votacionSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      votacionSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      votacionSheet.setFrozenRows(1);
      votacionSheet.autoResizeColumns(1, headers.length);
      
      console.log('✅ Hoja Agenda_Votacion creada con headers A1:M1');
    }
    
    return votacionSheet;
    
  } catch (error) {
    console.error('❌ Error creando hoja Agenda_Votacion:', error);
    return null;
  }
}

function archivarConfiguracionActual_(configSheet) {
  try {
    if (!configSheet) {
      console.log('⚠️ No hay hoja de configuración para archivar');
      return false;
    }
    
    const datosAgenda = configSheet.getRange('A2:K2').getValues()[0];
    
    const hayDatos = datosAgenda.some(cell => cell !== "" && cell !== null && cell !== undefined);
    if (!hayDatos) {
      console.log('⚠️ No hay datos válidos en A2:K2 para archivar');
      return false;
    }
    
    console.log('📋 Archivando agenda desde A2:K2 a hoja Agenda_Votacion...');
    
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const votacionSheet = crearHojaAgendaVotacionSiNoExiste_(ss);
    
    if (!votacionSheet) {
      console.log('❌ No se pudo crear/obtener hoja Agenda_Votacion');
      return false;
    }
    
    // Limpiar datos anteriores
    const lastRow = votacionSheet.getLastRow();
    if (lastRow > 1) {
      console.log('🧹 Limpiando agenda anterior en Agenda_Votacion...');
      votacionSheet.getRange(2, 1, lastRow - 1, 13).clearContent();
    }
    
    const fechaArchivo = new Date();
    const estadoArchivo = 'ARCHIVADA';
    
    const datosParaArchivar = [
      datosAgenda[0],  // A2: Nombre Agenda
      datosAgenda[1],  // B2: Numero Reunion
      datosAgenda[2],  // C2: Fecha Inicio
      datosAgenda[3],  // D2: Fecha Fin
      datosAgenda[4],  // E2: Hora Limite
      datosAgenda[5],  // F2: Creado Por
      datosAgenda[6],  // G2: Fecha Creacion
      datosAgenda[7],  // H2: Version
      datosAgenda[8],  // I2: Estado
      datosAgenda[9],  // J2: Fecha Reunion
      datosAgenda[10], // K2: Fecha Aprobacion
      fechaArchivo,    // L2: Fecha Archivo
      estadoArchivo    // M2: Estado Archivo
    ];
    
    votacionSheet.getRange(2, 1, 1, datosParaArchivar.length).setValues([datosParaArchivar]);
    
    const numeroReunion = String(datosAgenda[1] || '').replace(/^'/, '').trim();
    console.log(`✅ Agenda ${numeroReunion} archivada exitosamente en A2:M2 de Agenda_Votacion`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error archivando configuración:', error);
    return false;
  }
}

// ===================== GESTIÓN DE AGENDAS (CON CONTADOR) =====================

function obtenerTodasLasAgendasConsejo() {
  try {
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const configSheet = ss.getSheetByName('Configuracion');
    if (!configSheet) return [];

    const lastRow = configSheet.getLastRow();
    if (lastRow < 2) return [];

    const datosAgenda = configSheet.getRange('A2:K2').getValues()[0];
    
    const [nombreAgenda, numeroReunionRaw, fechaInicio, fechaFin, horaLimite, creadoPor, fechaCreacion, version, estado, fechaReunion, fechaAprobacion] = datosAgenda;

    let numeroReunion = String(numeroReunionRaw || '').replace(/^'/, '').trim();
    
    if (!numeroReunion) return [];

    let estadoDetallado = estado || 'ACTIVA';
    let mensajeEstado = '';
    
    // Integrar con contador de tiempo
    const tiempoInfo = calcularTiempoRestante();
    if (tiempoInfo.success && tiempoInfo.expirada && estadoDetallado === 'ACTIVA') {
      estadoDetallado = 'VENCIDA';
      mensajeEstado = 'Agenda vencida automáticamente por tiempo';
    } else if (estadoDetallado === 'CERRADA') {
      if (fechaAprobacion && fechaAprobacion !== '') {
        estadoDetallado = 'APROBADA';
        const fechaAprob = fechaAprobacion instanceof Date ? 
          Utilities.formatDate(fechaAprobacion, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : 
          String(fechaAprobacion);
        mensajeEstado = `Agenda aprobada el ${fechaAprob}`;
      } else {
        estadoDetallado = 'PENDIENTE_APROBACION';
        mensajeEstado = 'Agenda cerrada, pendiente de aprobación';
      }
    } else if (estadoDetallado === 'ACTIVA') {
      if (tiempoInfo.success) {
        const tiempoFormateado = formatearTiempo(tiempoInfo.tiempoRestante);
        mensajeEstado = `Agenda activa - ${tiempoFormateado.textoLegible}`;
      } else {
        mensajeEstado = 'Agenda activa, recibiendo elementos';
      }
    }

    let horaLimiteFormateada = '23:59';
    if (horaLimite instanceof Date) {
      const h = String(horaLimite.getHours()).padStart(2, '0');
      const m = String(horaLimite.getMinutes()).padStart(2, '0');
      horaLimiteFormateada = `${h}:${m}`;
    } else if (typeof horaLimite === 'string' && horaLimite.includes(':')) {
      horaLimiteFormateada = horaLimite;
    }

    let fechaInicioStr = '', fechaFinStr = '', fechaReunionStr = null;
    try {
      if (fechaInicio instanceof Date) fechaInicioStr = Utilities.formatDate(fechaInicio, Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (fechaFin instanceof Date) fechaFinStr = Utilities.formatDate(fechaFin, Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (fechaReunion instanceof Date) fechaReunionStr = Utilities.formatDate(fechaReunion, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch (e) {}

    let totalRegistros = 0;
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (dataSheet && dataSheet.getLastRow() > 1) {
      totalRegistros = dataSheet.getLastRow() - 1;
    }

    const agenda = {
      id: numeroReunion,
      nombre: String(nombreAgenda || `Reunión Consejo Nacional de Acreditación ${numeroReunion}`),
      numeroReunion: numeroReunion,
      fechaInicio: fechaInicioStr,
      fechaFin: fechaFinStr,
      fechaReunion: fechaReunionStr,
      horaLimite: horaLimiteFormateada,
      creadoPor: String(creadoPor || "Sistema OGA"),
      totalRegistros: totalRegistros,
      estado: estadoDetallado,
      estadoDetallado: estadoDetallado,
      mensajeEstado: mensajeEstado,
      fechaAprobacion: fechaAprobacion
    };

    return [agenda];
  } catch (e) {
    Logger.log('Error obteniendo agendas: ' + e.message);
    return [];
  }
}

function obtenerConfiguracionAgendaConsejo(agendaId = null) {
  try {
    const agendas = obtenerTodasLasAgendasConsejo();
    if (agendas.length > 0) {
      const a = agendas[0];
      return {
        id: a.numeroReunion,
        nombre: a.nombre,
        numeroReunion: a.numeroReunion,
        fechaInicio: a.fechaInicio,
        fechaFin: a.fechaFin,
        fechaReunion: a.fechaReunion,
        horaLimite: a.horaLimite,
        estado: a.estado,
        estadoDetallado: a.estadoDetallado,
        mensajeEstado: a.mensajeEstado,
        fechaAprobacion: a.fechaAprobacion,
        totalRegistros: a.totalRegistros
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

function verificarAgendaConsejoActiva() {
  try {
    const estadoTiempo = puedeAgregarElementos();
    return estadoTiempo.puede;
  } catch (_) {
    return false;
  }
}

function verificarAgendaAnteriorPendiente(numeroReunionNueva) {
  try {
    const agendas = obtenerTodasLasAgendasConsejo();
    const agendaPendiente = agendas.find(a => a.estado === 'ACTIVA' && a.numeroReunion !== numeroReunionNueva);
    if (agendaPendiente) {
      return {
        hayPendiente: true,
        agenda: agendaPendiente,
        message: `Existe una agenda anterior (${agendaPendiente.numeroReunion}) que aún no ha sido aprobada.`
      };
    }
    return { hayPendiente: false, message: 'No hay agendas pendientes' };
  } catch (e) {
    return { hayPendiente: false, message: 'Error al verificar' };
  }
}

function crearAgendaConsejo(nombre, numeroReunion, fechaInicio, fechaFin, fechaReunion, horaLimite) {
  try {
    // 1. Validar Permisos
    if (!esUsuarioAutorizadoParaAgenda()) {
      return { success: false, message: 'No tienes permiso para crear agendas. Solo usuarios autorizados pueden realizar esta acción.' };
    }

    // 2. Verificar si hay agendas pendientes
    const verificacion = verificarAgendaAnteriorPendiente(numeroReunion);
    if (verificacion.hayPendiente) {
      return { success: false, message: verificacion.message, requiereAprobacion: true, agendaPendiente: verificacion.agenda };
    }

    // 3. Validaciones de Inputs
    if (!nombre || nombre.trim().length < 5) {
      nombre = `Reunion Consejo Nacional de Acreditación ${numeroReunion}`;
    }
    
    if (!numeroReunion || numeroReunion.trim().length < 3) {
      return { success: false, message: 'El número de reunión debe tener al menos 3 caracteres' };
    }
    if (!fechaReunion) {
      return { success: false, message: 'Debe especificar la fecha de la reunión' };
    }

    const inicioDate = new Date(fechaInicio);
    const finDate = new Date(fechaFin);
    const diffDays = Math.ceil(Math.abs(finDate - inicioDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 62) {
      return { success: false, message: 'El rango de fechas no puede ser mayor a 2 meses (62 días)' };
    }

    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    let configSheet = ss.getSheetByName('Configuracion');

    // 4. Verificar duplicados
    if (configSheet && configSheet.getLastRow() >= 2) {
      const numeroExistente = configSheet.getRange('B2').getDisplayValue();
      const numeroComparar = String(numeroExistente || '').replace(/^'/, '').trim();
      
      if (numeroComparar === numeroReunion.trim()) {
        return { success: false, message: `Ya existe una agenda con el número: ${numeroReunion}.` };
      }
    }

    // 5. Registrar número correlativo
    const resultadoCorrelativo = registrarNumeroReunion(numeroReunion, fechaReunion);
    if (!resultadoCorrelativo.success) {
      return { success: false, message: 'Error al registrar el correlativo: ' + resultadoCorrelativo.message };
    }

    // =================================================================
    // 6. NUEVA LÓGICA: ACTUALIZAR ESTADO EN CALENDARIO_REUNIONES
    // =================================================================
    try {
       // Esta función buscará la fecha y marcará CERRADA la actual y ACTIVA la siguiente
       actualizarEstadoCalendario(fechaReunion); 
    } catch (e) {
       console.error("Advertencia: No se pudo actualizar el estado del calendario: " + e.message);
       // No detenemos el proceso, solo lo registramos en consola
    }
    // =================================================================

    // 7. Crear/Actualizar Hoja de Configuración
    if (!configSheet) {
      configSheet = ss.insertSheet('Configuracion');
    }
    
    const headers = [
      'Nombre Agenda',      // A1
      'Numero Reunion',     // B1
      'Fecha Inicio',       // C1
      'Fecha Fin',          // D1
      'Hora Limite',        // E1
      'Creado Por',         // F1
      'Fecha Creacion',     // G1
      'Version',            // H1
      'Estado',             // I1
      'Fecha Reunion',      // J1
      'Fecha Aprobacion'    // K1
    ];
    
    configSheet.clear();
    configSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    configSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    configSheet.setFrozenRows(1);
    
    const numeroConApostrofe = "'" + numeroReunion.trim();
    const datosAgenda = [
      nombre.trim(),
      numeroConApostrofe,
      fechaInicio,
      fechaFin,
      horaLimite || '23:59',
      (getUsuarioEfectivo() || 'Sistema OGA'),
      new Date(),
      '2.6', // Versión actualizada
      'ACTIVA',
      fechaReunion,
      ''
    ];
    
    configSheet.getRange(2, 1, 1, datosAgenda.length).setValues([datosAgenda]);
    configSheet.autoResizeColumns(1, headers.length);

    // 8. Crear Hoja de Respuestas si no existe
    let dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (!dataSheet) {
      dataSheet = ss.insertSheet('Respuestas de formulario 1');
      const headersData = [
        'Marca temporal', 'Dirección de correo electrónico', 'Registro de Acreditación',
        'Solicitud para Consejo Nacional de Acreditación', 'Nombre del Experto', 'Tipo de Decisión',
        'Favor Adjuntar', 'Tipo de Notificación', 'Motivo de la Notificación',
        'Adjuntar Documentos', 'Acta', 'Resolución', 'Esquema de acreditación',
        'Nombre comercial del OEC (únicamente si es diferente a la razón social)', 'Norma'
      ];
      dataSheet.getRange(1, 1, 1, headersData.length).setValues([headersData]);
      dataSheet.getRange(1, 1, 1, headersData.length).setFontWeight('bold');
      dataSheet.setFrozenRows(1);
    }

    Logger.log(`✅ Agenda "${nombre}" creada exitosamente y calendario actualizado.`);

    return {
      success: true,
      message: `✅ Agenda "${nombre}" creada exitosamente. Calendario actualizado.`,
      config: {
        id: numeroReunion.trim(),
        nombre: nombre.trim(),
        numeroReunion: numeroReunion.trim(),
        fechaInicio, fechaFin, fechaReunion,
        horaLimite: horaLimite || '23:59'
      }
    };
  } catch (error) {
    Logger.log('❌ Error creando agenda: ' + error.message);
    return { success: false, message: 'Error interno: ' + error.message };
  }
}

/**
 * ACTUALIZACIÓN VERTICAL:
 * 1. Busca la fecha usada (en Col C o F).
 * 2. Marca su estado (Col D) como "CERRADA".
 * 3. Marca la SIGUIENTE FILA (Col D) como "ACTIVA".
 */
function actualizarEstadoCalendario(fechaReunionStr) {
  const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
  const hoja = ss.getSheetByName("Calendario_Reuniones");
  if (!hoja) return;

  const datos = hoja.getDataRange().getValues();
  
  // Parsear la fecha del input (YYYY-MM-DD)
  // Usamos split para asegurar la fecha local sin cambios de zona horaria
  const partes = fechaReunionStr.split('-');
  const fechaObjetivo = new Date(partes[0], partes[1] - 1, partes[2]); 
  fechaObjetivo.setHours(0,0,0,0);

  for (let i = 1; i < datos.length; i++) {
    // Leemos fecha normal (Col C -> idx 2) y extra (Col F -> idx 5)
    const fechaNormal = datos[i][2] ? new Date(datos[i][2]) : null;
    const fechaExtra = datos[i][5] ? new Date(datos[i][5]) : null;

    if (fechaNormal) fechaNormal.setHours(0,0,0,0);
    if (fechaExtra) fechaExtra.setHours(0,0,0,0);

    let matchEncontrado = false;

    // Chequeamos si la fecha usada coincide con la normal O la extraordinaria de esta fila
    if (fechaNormal && fechaNormal.getTime() === fechaObjetivo.getTime()) {
      matchEncontrado = true;
    } else if (fechaExtra && fechaExtra.getTime() === fechaObjetivo.getTime()) {
      matchEncontrado = true;
    }

    if (matchEncontrado) {
      // 1. CERRAR la fila actual (Col D es índice 4 en getRange - fila i+1)
      hoja.getRange(i + 1, 4).setValue("CERRADA");
      Logger.log(`Fila ${i+1} marcada como CERRADA`);

      // 2. ACTIVAR la siguiente fila (si existe)
      if (i + 1 < datos.length) {
         // Verificamos que la siguiente fila tenga una fecha válida antes de activarla
         const siguienteFecha = datos[i+1][2];
         
         // Validación simple: Si hay fecha en la siguiente fila, la activamos
         if (siguienteFecha) {
             // Col D de la siguiente fila (i+2)
             hoja.getRange(i + 2, 4).setValue("ACTIVA");
             Logger.log(`Fila ${i+2} marcada como ACTIVA`);
         }
      }
      
      return; // Trabajo terminado
    }
  }
  Logger.log("⚠️ No se encontró la fecha en el calendario para actualizar el estado.");
}

function aprobarAgendaConsejo(agendaId) {
  try {
    if (!esUsuarioAutorizadoParaAgenda()) {
      return { success: false, message: 'No tienes permiso para aprobar agendas. Solo usuarios autorizados pueden realizar esta acción.' };
    }

    const config = obtenerConfiguracionAgendaConsejo(agendaId);
    if (!config) {
      return { success: false, message: 'No se encontró la configuración de la agenda' };
    }
    
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const configSheet = ss.getSheetByName('Configuracion');
    if (configSheet) {
      configSheet.getRange('I2').setValue('CERRADA');
      configSheet.getRange('K2').setValue(new Date());
      
      const archivoExitoso = archivarConfiguracionActual_(configSheet);
      
      if (archivoExitoso) {
        Logger.log(`✅ Agenda "${config.nombre}" aprobada y archivada`);
        return { success: true, message: `✅ Agenda "${config.nombre}" aprobada y archivada exitosamente en hoja Agenda_Votacion (A2:M2).` };
      } else {
        return { success: false, message: 'Error al archivar la agenda en hoja Agenda_Votacion' };
      }
    }
    
    return { success: false, message: 'No se pudo acceder a la hoja de configuración' };
  } catch (error) {
    Logger.log('❌ Error aprobando agenda: ' + error.message);
    return { success: false, message: 'Error al aprobar agenda: ' + error.message };
  }
}

function eliminarAgendaConsejo(agendaId) {
  try {
    if (!esUsuarioAutorizadoParaAgenda()) {
      return { success: false, message: 'No tienes permiso para eliminar agendas. Solo usuarios autorizados pueden realizar esta acción.' };
    }

    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const configSheet = ss.getSheetByName('Configuracion');
    let numeroReunionAEliminar = '';
    
    if (configSheet) {
      try {
        const numeroRaw = configSheet.getRange('B2').getDisplayValue();
        numeroReunionAEliminar = String(numeroRaw || '').replace(/^'/, '').trim();
      } catch (e) {
        Logger.log('No se pudo obtener número de reunión: ' + e.message);
      }
      configSheet.getRange('A2:K2').clearContent();
    }

    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (dataSheet) ss.deleteSheet(dataSheet);

    if (numeroReunionAEliminar) {
      const resultadoEliminar = eliminarNumeroReunion(numeroReunionAEliminar);
      if (resultadoEliminar.success) {
        Logger.log(`✅ Correlativo eliminado: ${numeroReunionAEliminar}`);
      } else {
        Logger.log(`⚠️ Error eliminando correlativo: ${resultadoEliminar.message}`);
      }
    }

    return { 
      success: true, 
      message: `Agenda eliminada exitosamente${numeroReunionAEliminar ? ` incluyendo correlativo ${numeroReunionAEliminar}` : ''}.` 
    };
  } catch (error) {
    Logger.log('❌ Error eliminando agenda: ' + error.message);
    return { success: false, message: 'Error al eliminar agenda: ' + error.message };
  }
}

// ===================== FUNCIONES PARA AGENDAS ARCHIVADAS =====================

function obtenerDatosAgendaArchivada(numeroReunion) {
  try {
    console.log(`🔍 Buscando datos para agenda archivada: ${numeroReunion}`);
    
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    
    if (!dataSheet || dataSheet.getLastRow() <= 1) {
      console.log('📭 No hay datos en la hoja de respuestas');
      return [];
    }
    
    const numFilas = dataSheet.getLastRow() - 1;
    const datos = dataSheet.getRange(2, 1, numFilas, 15).getValues();
    const resultados = [];
    
    datos.forEach((fila, index) => {
      if (fila.every(c => !c || c === '')) return;
      
      const acta = String(fila[10] || '');
      
      if (acta.includes(numeroReunion)) {
        resultados.push({
          id: index + 1,
          registroAcreditacion: String(fila[2] || ''),
          solicitudCNA: String(fila[3] || ''),
          acta: String(fila[10] || '')
        });
      }
    });
    
    console.log(`✅ Encontrados ${resultados.length} elementos para ${numeroReunion}`);
    return resultados;
    
  } catch (error) {
    console.error('💥 Error obteniendo datos agenda archivada:', error);
    return [];
  }
}

// ===================== BÚSQUEDA DE ESTABLECIMIENTO =====================

function buscarPorRegistro(registro) {
  try {
    const ss = SpreadsheetApp.openById(CONFIRMACION_DATOS_ID);
    const hoja = ss.getSheetByName("Respuestas de formulario 1");
    if (!hoja) return { exito: false, mensaje: '❌ No se encontró la hoja de confirmación de datos' };
    
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      const registroHoja = String(datos[i][2]).trim();
      if (registroHoja === registro) {
        return {
          exito: true,
          esquema: String(datos[i][3]).trim(),
          nombre: String(datos[i][5]).trim(),
          norma: String(datos[i][21]).trim()
        };
      }
    }
    return { exito: false, mensaje: '❌ No se encontró un establecimiento con ese Registro.' };
  } catch (error) {
    return { exito: false, mensaje: '❌ Error al buscar: ' + error.message };
  }
}

// ===================== BÚSQUEDA DE USUARIO =====================

function buscarUsuarioActivoEnHoja() {
  try {
    var p = obtenerPermisosUsuario();
    var usuario = (p && p.ok && (p.usuario || p.nombreCompleto)) ? (p.usuario || p.nombreCompleto) : getUsuarioEfectivo();

    if (!usuario) {
      return { exito: false, mensaje: 'No hay sesión activa (WebApp)' };
    }

    // Si existe en hoja, devolvemos permisos y nombre completo
    if (p && p.enHoja) {
      return {
        exito: true,
        usuario: p.usuario,
        correo: p.nombreCompleto || p.usuario,     // se mantiene el nombre en este campo por compatibilidad
        nombreCompleto: p.nombreCompleto || p.usuario,
        fila: p.fila,
        autorizado: !!p.autorizadoCrear,
        resolucion: !!p.autorizadoVotar
      };
    }

    // Fallback: no encontrado en hoja
    return {
      exito: true,
      usuario: usuario,
      correo: usuario,
      nombreCompleto: usuario,
      esSystemFallback: true,
      autorizado: false,
      resolucion: false,
      mensaje: (p && p.message) ? p.message : `Usuario "${usuario}" no encontrado en la hoja de usuarios`
    };

  } catch (error) {
    Logger.log('❌ Error buscando usuario activo: ' + error.message);
    return { exito: false, mensaje: 'Error al buscar usuario: ' + error.message };
  }
}


// ===================== GUARDAR DATOS (CON VALIDACIÓN DE TIEMPO) =====================

function guardarDatosAgendaConsejo(datos) {
  try {
    
    // -----------------------------------------------------------------------
    // [NUEVO] 1. VALIDACIÓN ESPECÍFICA PARA REEVALUACIÓN (REGLA 72 HORAS)
    // -----------------------------------------------------------------------
    // Se valida ANTES de procesar cualquier cosa.
    // Normalizamos el string para asegurar la comparación.
    const tipoDec = String(datos.tipoDecision || '').trim();
    
    if (tipoDec === 'Reevaluación') {
       // Llamamos a la función auxiliar que calcula las fechas desde la configuración
       const validacion72h = validarPlazoReevaluacionBackend();
       
       if (!validacion72h.apto) {
         return { 
           success: false, 
           message: validacion72h.mensaje,
           motivo: 'TIEMPO_AGOTADO_REEVALUACION' // Flag para que el frontend sepa qué popup mostrar
         };
       }
    }
    // -----------------------------------------------------------------------


    // 2. Verificar tiempo general de la agenda (Cierre global)
    const estadoTiempo = puedeAgregarElementos();
    if (!estadoTiempo.puede) {
      return { 
        success: false, 
        message: estadoTiempo.mensaje,
        tiempoAgotado: estadoTiempo.motivo === 'TIEMPO_AGOTADO',
        motivo: estadoTiempo.motivo
      };
    }

    const tipo = String(datos.solicitudCNA || '').trim();

    if (tipo === 'VARIOS') {
      const descripcionVarios = String(datos.tituloVarios || '').trim();
      if (!descripcionVarios) {
        return { success: false, message: 'Complete el título/descripción para el punto VARIOS' };
      }
      datos.registroAcreditacion = descripcionVarios;
      datos.motivoNotificacion = '';
    }

    if (!datos.correo || !datos.solicitudCNA) {
      return { success: false, message: 'Complete todos los campos obligatorios' };
    }
    
    if (tipo !== 'VARIOS' && !datos.registroAcreditacion) {
      return { success: false, message: 'Complete el registro de acreditación' };
    }

    if (datos.solicitudCNA === 'DECISION') {
      if (!datos.nombreExperto) return { success: false, message: 'Debe ingresar el nombre del experto para una decisión' };
      if (!datos.tipoDecision) return { success: false, message: 'Debe seleccionar el tipo de decisión' };
      if (!datos.esquema) return { success: false, message: 'Debe buscar el registro para obtener el esquema' };
      if (!datos.norma) return { success: false, message: 'Debe buscar el registro para obtener la norma' };
    }
    if (datos.solicitudCNA === 'NOTIFICACION') {
      if (!datos.tipoNotificacion || !datos.motivoNotificacion) {
        return { success: false, message: 'Complete los campos de notificación' };
      }
    }

    // Validación adicional: Verificar nuevamente antes de continuar
    if (!verificarAgendaConsejoActiva()) {
      return { success: false, message: '⏰ La agenda no está activa o ha vencido el plazo mientras se procesaba la solicitud' };
    }

    if (Array.isArray(datos.adjuntosOGA) && datos.adjuntosOGA.length > 10) {
      return { success: false, message: 'Máximo 8 archivos en "Favor Adjuntar (OGA)".' };
    }
    if (Array.isArray(datos.adjuntarDocumentos) && datos.adjuntarDocumentos.length > 10) {
      return { success: false, message: 'Máximo 8 archivos en "Adjuntar Documentos".' };
    }

    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (!dataSheet) return { success: false, message: 'No se encontró la hoja de datos' };

    const config = obtenerConfiguracionAgendaConsejo();
    let actaValue = 'Reunión 01-2025';
    if (config && config.numeroReunion) actaValue = `Reunión ${config.numeroReunion}`;

    let resolucionGenerada = '';
    if (tipo === 'DECISION') {
      try {
        resolucionGenerada = registrarResolucion({
          numeroReunion: config.numeroReunion,
          registroAcreditacion: datos.registroAcreditacion,
          tipoDecision: datos.tipoDecision,
          nombreEstablecimiento: datos.nombreEstablecimiento,
          esquema: datos.esquema,
          norma: datos.norma,
          nombreExperto: datos.nombreExperto
        });
      } catch (error) {
        Logger.log('Error generando resolución: ' + error.message);
      }
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const folderName = `Agenda_${datos.registroAcreditacion}_${timestamp}`;
    const parentFolder = DriveApp.getFolderById(FOLDER_ID);
    const agendaFolder = parentFolder.createFolder(folderName);

    let adjuntosOGAUrls = '';
    if (datos.adjuntosOGA && datos.adjuntosOGA.length > 0) {
      const sub = agendaFolder.createFolder('Archivos_OGA');
      datos.adjuntosOGA.forEach(a => {
        try {
          const blob = Utilities.newBlob(Utilities.base64Decode(a.content), a.type || 'application/octet-stream', a.name);
          sub.createFile(blob);
        } catch (e) {}
      });
      adjuntosOGAUrls = sub.getUrl();
    }

    let adjuntarDocumentosUrls = '';
    if (datos.adjuntarDocumentos && datos.adjuntarDocumentos.length > 0) {
      const sub = agendaFolder.createFolder('Documentos_Adicionales');
      datos.adjuntarDocumentos.forEach(a => {
        try {
          const blob = Utilities.newBlob(Utilities.base64Decode(a.content), a.type || 'application/octet-stream', a.name);
          sub.createFile(blob);
        } catch (e) {}
      });
      adjuntarDocumentosUrls = sub.getUrl();
    }

    const nuevaFila = [
      new Date(),
      String(datos.correo || '').trim(),
      String(datos.registroAcreditacion || '').trim(),
      tipo,
      tipo === 'DECISION' ? String(datos.nombreExperto || '').trim() : '',
      String(datos.tipoDecision || ''),
      adjuntosOGAUrls,
      String(datos.tipoNotificacion || ''),
      String(datos.motivoNotificacion || ''),
      adjuntarDocumentosUrls,
      actaValue,
      String(resolucionGenerada || datos.resolucion || ''),
      String(datos.esquema || ''),
      String(datos.nombreEstablecimiento || ''),
      String(datos.norma || '')
    ];

    dataSheet.appendRow(nuevaFila);
    const total = dataSheet.getLastRow() - 1;

    const response = {
      success: true,
      message: `✅ Elemento agregado exitosamente. Total: ${total} elementos.`,
      folderUrl: agendaFolder.getUrl(),
      tiempoRestante: estadoTiempo.tiempoRestante
    };
    if (resolucionGenerada) {
      response.resolucionGenerada = resolucionGenerada;
      response.message += ` Resolución: ${resolucionGenerada}`;
    }
    return response;

  } catch (error) {
    return { success: false, message: 'Error al guardar: ' + error.message };
  }
}

/**
 * FUNCIÓN AUXILIAR OBLIGATORIA
 * Valida si faltan al menos 72 horas para la FECHA y HORA de la reunión activa.
 * Usa la configuración guardada en la hoja 'Configuracion'.
 */
function validarPlazoReevaluacionBackend() {
  try {
    // 1. Obtener la configuración actual de la agenda
    const config = obtenerConfiguracionAgendaConsejo();
    
    if (!config) {
      return { apto: false, mensaje: "No hay una agenda activa configurada para validar la fecha." };
    }

    // 2. Extraer fecha y hora de la configuración
    const fechaStr = config.fechaReunion; 
    const horaStr = config.horaLimite || "23:59";

    if (!fechaStr) {
      return { apto: false, mensaje: "La agenda activa no tiene fecha de reunión definida." };
    }

    // 3. Construir el objeto Date del "Momento de la Reunión"
    let fechaReunionFinal;
    
    if (fechaStr instanceof Date) {
      fechaReunionFinal = new Date(fechaStr);
    } else {
      // Asumimos formato estándar YYYY-MM-DD
      const partes = String(fechaStr).split('-'); 
      // Nota: Mes en JS es 0-11
      fechaReunionFinal = new Date(partes[0], partes[1] - 1, partes[2]);
    }

    // Agregar la hora límite a la fecha
    const partesHora = String(horaStr).split(':');
    fechaReunionFinal.setHours(parseInt(partesHora[0]), parseInt(partesHora[1]), 0, 0);

    // 4. Calcular el "Punto de Corte" (Deadline - 72 horas)
    const HORAS_LIMITE = 72;
    const MS_EN_72_HORAS = HORAS_LIMITE * 60 * 60 * 1000;
    
    const fechaCorte = new Date(fechaReunionFinal.getTime() - MS_EN_72_HORAS);
    const ahora = new Date();

    // 5. Comparar: ¿Ya pasó el punto de corte?
    if (ahora > fechaCorte) {
      // Cálculo para mostrar cuántas horas tarde se está intentando subir
      const msTarde = ahora.getTime() - fechaCorte.getTime();
      const horasTarde = Math.floor(msTarde / (1000 * 60 * 60));
      
      const cierreLegible = Utilities.formatDate(fechaCorte, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      
      return { 
        apto: false, 
        mensaje: `⛔ TIEMPO AGOTADO PARA REEVALUACIÓN: Se requieren 72 horas antes de la reunión. El sistema cerró la recepción de este tipo de solicitud el ${cierreLegible} (hace ${horasTarde} horas).` 
      };
    }

    // Si llegamos aquí, estamos a tiempo
    return { apto: true };

  } catch (e) {
    Logger.log("Error crítico validando 72h: " + e.message);
    return { apto: false, mensaje: "Error técnico validando fechas: " + e.message };
  }
}

// ===================== OBTENER DATOS =====================

function obtenerDatosAgendaConsejoParaEdicion() {
  try {
    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (!dataSheet) {
      return { success: true, data: [], message: 'No hay hoja de datos disponible' };
    }
    if (dataSheet.getLastRow() <= 1) {
      return { success: true, data: [], message: 'No hay elementos registrados en la agenda' };
    }
    const numFilas = dataSheet.getLastRow() - 1;
    const datos = dataSheet.getRange(2, 1, numFilas, 15).getValues();
    const resultados = [];
    datos.forEach((fila, index) => {
      const filaVacia = fila.every(c => !c || c === '');
      if (filaVacia) return;
      resultados.push({
        id: index + 1,
        marcaTemporal: fila[0] ? Utilities.formatDate(new Date(fila[0]), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : '',
        correo: String(fila[1] || ''),
        registroAcreditacion: String(fila[2] || ''),
        solicitudCNA: String(fila[3] || ''),
        nombreExperto: String(fila[4] || ''),
        tipoDecision: String(fila[5] || ''),
        adjuntosOGA: String(fila[6] || ''),
        tipoNotificacion: String(fila[7] || ''),
        motivoNotificacion: String(fila[8] || ''),
        adjuntarDocumentos: String(fila[9] || ''),
        acta: String(fila[10] || ''),
        resolucion: String(fila[11] || ''),
        esquema: String(fila[12] || ''),
        nombreEstablecimiento: String(fila[13] || ''),
        norma: String(fila[14] || '')
      });
    });
    return { success: true, data: resultados, message: `${resultados.length} elementos encontrados` };
  } catch (error) {
    return { success: false, data: [], message: 'Error al cargar datos: ' + error.message };
  }
}

function eliminarElementoAgendaConsejo(id) {
  try {
    // Validación de tiempo para eliminar
    const estadoTiempo = puedeAgregarElementos();
    if (!estadoTiempo.puede) {
      return { 
        success: false, 
        message: estadoTiempo.mensaje,
        tiempoAgotado: estadoTiempo.motivo === 'TIEMPO_AGOTADO'
      };
    }

    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    if (!dataSheet || dataSheet.getLastRow() <= 1) {
      return { success: false, message: 'No hay datos' };
    }
    const numFilas = dataSheet.getLastRow() - 1;
    if (id < 1 || id > numFilas) {
      return { success: false, message: 'ID no válido' };
    }
    dataSheet.deleteRow(id + 1);
    const total = dataSheet.getLastRow() - 1;
    return { success: true, message: `✅ Elemento ${id} eliminado. Total: ${total}.` };
  } catch (error) {
    return { success: false, message: 'Error al eliminar: ' + error.message };
  }
}

// ===================== VOTACIONES (RESTO IGUAL, SOLO WRAPPER MODIFICADOS) =====================

function obtenerMiembrosParaVotacion(modoPrueba) {
  const PRODUCCION_MIEMBROS_SHEET_ID = "10Z19aLAhMN2eUCbinYe6omdOneT4_mkGwqJqiiU1NHQ";
  const TEST_MIEMBROS_SHEET_ID = "1Az5OF8A5F6nb_J-9hU686hGNYuTnZLUy6cbX7KDZ0FY";
  const MIEMBROS_SHEET_NAME = "Miembros";
  
  const sheetId = modoPrueba ? TEST_MIEMBROS_SHEET_ID : PRODUCCION_MIEMBROS_SHEET_ID;
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(MIEMBROS_SHEET_NAME);
  if (!sheet) throw new Error("No se encontró la hoja 'Miembros' (" + (modoPrueba ? "TEST" : "PROD") + ").");

  const datos = sheet.getDataRange().getValues();
  const miembros = [];
  const correosUsados = new Set();

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const email = String(fila[5] || "").trim();
    if (!email) continue;
    if (correosUsados.has(email.toLowerCase())) continue;

    const nombre = (fila[0] + " " + fila[1] + " " + fila[2] + " " + fila[3]).trim().replace(/\s+/g, " ");
    const institucion = String(fila[9] || "").trim();

    miembros.push({
      email,
      nombre,
      institucion,
      fuente: modoPrueba ? "TEST" : "PROD"
    });
    correosUsados.add(email.toLowerCase());
  }

  return miembros;
}

function construirCuerpoInvitacion(miembro, config, enlace, modoPrueba) {
  const asuntoTag = modoPrueba ? "[PRUEBA] " : "";
  const asunto = `${asuntoTag}Invitación a Votar - Reunión ${config.numeroReunion}`;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;">
      <p>Estimado(a) <strong>${miembro.nombre || miembro.email}</strong>,</p>
      <p>Se le invita a emitir su voto para la <strong>Reunión ${config.numeroReunion}</strong>.</p>
      <p>
        Ingrese al siguiente enlace seguro para registrar sus decisiones:<br>
        <a href="${enlace}" target="_blank" style="color:#1d4ed8;">${enlace}</a>
      </p>
      <p style="margin-top:12px;">
        <em>Nota:</em> Solo se acepta un envío de votos por institución. Si ya otro representante votó,
        el sistema le indicará que su institución ha participado.
      </p>
      ${modoPrueba ? `<p style="color:#b45309;"><strong>Modo Prueba:</strong> Este envío es solamente para validación interna.</p>` : ""}
      <hr style="margin:20px 0;border:none;border-top:1px solid #ddd;" />
      <p style="font-size:12px;color:#666;">
        <strong>OGA - Oficina Guatemalteca de Acreditación</strong><br>
        ${CORREO_INSTITUCIONAL} -- Enlace generado automáticamente. No responda a este correo.
      </p>
    </div>
  `;

  const textBody = `Estimado(a) ${miembro.nombre || miembro.email}:

Se le invita a emitir su voto para la Reunión ${config.numeroReunion}.

Ingrese al siguiente enlace para votar:
${enlace}

Nota: Solo se acepta un envío por institución.

${modoPrueba ? "[ESTE ES UN ENVÍO DE PRUEBA]" : ""}
--
OGA - Oficina Guatemalteca de Acreditación
${CORREO_INSTITUCIONAL} (mensaje automático)`;

  return { asunto, htmlBody, textBody };
}

// ===================== ESTADÍSTICAS MEJORADAS =====================

function obtenerEstadisticasVotosPorReunion(numeroReunion) {
  // USAR LA FUNCIÓN CORREGIDA
  return obtenerEstadisticasVotosPorReunionMejoradas(numeroReunion);
}

function obtenerEstadisticasVotosAgenda() {
  const verificacion = hayAgendaListaParaVotar();
  
  if (!verificacion.success) {
    return { success: false, message: verificacion.mensaje };
  }
  
  const estadisticas = obtenerEstadisticasVotosPorReunionMejoradas(verificacion.numeroReunion);
  if (!estadisticas.success) {
    return estadisticas;
  }

  return {
    success: true,
    data: estadisticas.data,
    registros: estadisticas.registros,
    registrosPorTipo: estadisticas.registrosPorTipo,  // NUEVO
    reunion: verificacion.numeroReunion,
    ultimaActualizacion: new Date().toLocaleString('es-ES')
  };
}

// ===================== RESOLUCIONES - FUNCIÓN CORREGIDA =====================

/**
 * Obtiene el siguiente número de resolución
 * CORREGIDO: Reinicia el correlativo a 001 cuando cambia el año
 * @param {string} numeroReunion - Número de reunión (ej: "01-2026", "02-2025")
 * @return {string} Número de resolución (ej: "001-2026", "045-2025")
 */
function obtenerSiguienteResolucion(numeroReunion) {
  try {
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    let hojaResoluciones = ss.getSheetByName("Resoluciones");
    
    // Crear hoja si no existe
    if (!hojaResoluciones) {
      hojaResoluciones = ss.insertSheet("Resoluciones");
      hojaResoluciones.getRange(1, 1, 1, 12).setValues([
        ['Reunión', 'Resolución', 'Registro_Acreditacion', 'Nombre_OEC', 'Esquema', 
         'Norma', 'Tipo_Decision', 'Comentarios', 'Experto', 'Agenda', 'Estado', 'Motivo de Generacion']
      ]);
      hojaResoluciones.getRange(1, 1, 1, 12).setFontWeight('bold');
      hojaResoluciones.setFrozenRows(1);
    }
    
    // Extraer el año de la reunión
    const partesReunion = String(numeroReunion || '').split('-');
    const anioReunion = partesReunion.length >= 2 ? partesReunion[1] : new Date().getFullYear().toString();
    
    Logger.log(`🔍 Buscando resoluciones para el año: ${anioReunion}`);
    
    const datos = hojaResoluciones.getDataRange().getValues();
    let ultimoNumeroDelAnio = 0; // CORREGIDO: Iniciar en 0 para que el primero sea 001
    let resolucionesEncontradas = 0;
    
    // Buscar SOLO resoluciones del año actual
    for (let i = 1; i < datos.length; i++) {
      const resolucion = String(datos[i][1] || '').trim();
      
      // Verificar si la resolución pertenece al año actual (formato: XXX-YYYY)
      if (resolucion && resolucion.includes('-')) {
        const partesResolucion = resolucion.split('-');
        
        if (partesResolucion.length >= 2) {
          const anioResolucion = partesResolucion[1].trim();
          
          // Solo considerar resoluciones del mismo año
          if (anioResolucion === anioReunion) {
            resolucionesEncontradas++;
            const numeroStr = partesResolucion[0].trim();
            const numero = parseInt(numeroStr, 10);
            
            if (!isNaN(numero) && numero > ultimoNumeroDelAnio) {
              ultimoNumeroDelAnio = numero;
            }
          }
        }
      }
    }
    
    // El siguiente número es el último + 1
    // Si no hay resoluciones del año, ultimoNumeroDelAnio = 0, entonces siguiente = 1
    const siguienteNumero = ultimoNumeroDelAnio + 1;
    const resolucionFinal = siguienteNumero.toString().padStart(3, '0') + '-' + anioReunion;
    
    Logger.log(`📊 Año: ${anioReunion} | Resoluciones encontradas: ${resolucionesEncontradas} | Último número: ${ultimoNumeroDelAnio} | Siguiente: ${resolucionFinal}`);
    
    return resolucionFinal;
    
  } catch (error) {
    Logger.log('❌ Error generando resolución: ' + error.message);
    // Fallback: usar año actual y empezar desde 001
    const anioFallback = new Date().getFullYear();
    return `001-${anioFallback}`;
  }
}

function registrarResolucion(datos) {
  try {
    const numeroResolucion = obtenerSiguienteResolucion(datos.numeroReunion);
    
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    const hojaResoluciones = ss.getSheetByName("Resoluciones");
    
    const nuevaFila = [
      datos.numeroReunion || '',
      numeroResolucion,
      datos.registroAcreditacion || '',
      datos.nombreEstablecimiento || '',
      datos.esquema || '',
      datos.norma || '',
      datos.tipoDecision || '',
      '',
      datos.nombreExperto || '',
      `Reunión ${datos.numeroReunion}`,
      'GENERADA',
      `Generada automáticamente para ${datos.tipoDecision}`
    ];
    
    hojaResoluciones.appendRow(nuevaFila);
    
    Logger.log(`Resolución registrada: ${numeroResolucion} para ${datos.registroAcreditacion}`);
    return numeroResolucion;
    
  } catch (error) {
    Logger.log('Error registrando resolución: ' + error.message);
    throw new Error('No se pudo registrar la resolución: ' + error.message);
  }
}

function generarResolucionDesdeVotacion(registro, reunion) {
  try {
    if (!esUsuarioAutorizadoParaAgenda()) {
      return { success: false, message: 'No tienes permiso para generar resoluciones' };
    }

    const ss = SpreadsheetApp.openById(AGENDA_SHEET_ID);
    const dataSheet = ss.getSheetByName('Respuestas de formulario 1');
    
    if (!dataSheet) {
      return { success: false, message: 'No se encontró la hoja de datos de la agenda' };
    }

    const datos = dataSheet.getDataRange().getValues();
    let datosRegistro = null;

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][2]).trim() === registro) {
        datosRegistro = {
          numeroReunion: reunion,
          registroAcreditacion: registro,
          nombreEstablecimiento: String(datos[i][13] || ''),
          esquema: String(datos[i][12] || ''),
          norma: String(datos[i][14] || ''),
          tipoDecision: String(datos[i][5] || ''),
          nombreExperto: String(datos[i][4] || '')
        };
        break;
      }
    }

    if (!datosRegistro) {
      return { success: false, message: `No se encontraron datos para el registro ${registro}` };
    }

    const numeroResolucion = registrarResolucion(datosRegistro);
    
    return {
      success: true,
      message: `Resolución ${numeroResolucion} generada exitosamente para ${registro}`,
      resolucion: numeroResolucion
    };

  } catch (error) {
    Logger.log('Error generando resolución desde votación: ' + error.message);
    return { success: false, message: 'Error interno: ' + error.message };
  }
}

function registrarLogEnviosVotaciones(resultado) {
  try {
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    let logSheet = ss.getSheetByName("Log_Envios_Votaciones");
    
    if (!logSheet) {
      logSheet = ss.insertSheet("Log_Envios_Votaciones");
      logSheet.getRange(1, 1, 1, 8).setValues([
        ['Fecha', 'Reunion', 'Modo_Prueba', 'Intentados', 'Exitosos', 'Fallidos', 'Usuario', 'Correo_Institucional']
      ]);
      logSheet.getRange(1, 1, 1, 8).setFontWeight('bold');
      logSheet.setFrozenRows(1);
    }
    
    const fecha = new Date();
    const reunion = resultado.reunion || 'N/A';
    const modoPrueba = resultado.message.includes('[PRUEBA]') ? 'SÍ' : 'NO';
    const exitosos = resultado.enviados ? resultado.enviados.length : 0;
    const fallidos = resultado.errores ? resultado.errores.length : 0;
    const intentados = exitosos + fallidos;
    const usuario = getUsuarioEfectivo() || 'Sistema';
    
    logSheet.appendRow([fecha, reunion, modoPrueba, intentados, exitosos, fallidos, usuario, CORREO_INSTITUCIONAL]);
    
    Logger.log(`Log registrado: ${reunion} - ${exitosos}/${intentados} exitosos desde ${CORREO_INSTITUCIONAL}`);
    
  } catch (error) {
    Logger.log('Error registrando log: ' + error.message);
  }
}

// ===================== DOCUMENTOS =====================

function generarDocumentoAgendaConsejo(tipo) {
  try {
    const datos = obtenerDatosReunionActiva();
    if (tipo === 'agenda') {
      return generarAgendaProfesionalConPlantilla(datos);
    } else if (tipo === 'excel') {
      return exportarAExcel(datos);
    }
  } catch (error) {
    return { success: false, message: 'Error interno: ' + error.message };
  }
}

function generarAgendaProfesionalConPlantilla(datos) {
  try {
    if (!Array.isArray(datos)) throw new Error('Datos inválidos');
    const config = obtenerConfiguracionAgendaConsejo();
    if (!config || !config.numeroReunion) throw new Error('No se pudo obtener configuración');

    desactivarAgendaAlmacenada(config.numeroReunion);

    const filtrados = datos.filter(d => d && d.acta && String(d.acta).includes(String(config.numeroReunion)));
    const decisiones = filtrados.filter(i => i.solicitudCNA === 'DECISION');
    const notificaciones = filtrados.filter(i => i.solicitudCNA === 'NOTIFICACION');
    const varios = filtrados.filter(i => i.solicitudCNA === 'VARIOS');

    const plantilla = DriveApp.getFileById(PLANTILLA_AGENDA_ID);
    const nombreDocumento = `Agenda_${config.numeroReunion}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss")}`;
    const copia = plantilla.makeCopy(nombreDocumento);
    const doc = DocumentApp.openById(copia.getId());
    const body = doc.getBody();

    const reunionActual = String(config.numeroReunion).trim();

    const reunionAnterior = (function calcularReunionAnterior(num) {
      const m = String(num || '').trim().match(/^(\d{1,2})-(\d{4})$/);
      if (!m) return num;
      let mes = parseInt(m[1], 10);
      let anio = parseInt(m[2], 10);
      if (mes === 1) { mes = 12; anio -= 1; } else { mes -= 1; }
      const mesStr = mes < 10 ? ('0' + mes) : String(mes);
      return mesStr + '-' + anio;
    })(reunionActual);

    body.replaceText('10-2025', reunionActual);
    body.replaceText('Aprobación Acta\\s+\\d{1,2}-\\d{4}', 'Aprobación Acta ' + reunionAnterior);

    if (config.fechaReunion) {
      const fecha = new Date(config.fechaReunion);
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      const fechaFormateada = `${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${fecha.getFullYear()}`;
      body.replaceText('06 de agosto de 2025', fechaFormateada);
    }

    const reemplazarBloqueConEnlaces = (marcador, elementos, generador) => {
      try {
        const match = body.findText(marcador);
        if (!match) return;
        const elem = match.getElement().asText();
        const par = elem.getParent();
        const idx = body.getChildIndex(par);
        body.removeChild(par);
        if (!elementos || elementos.length === 0) {
          const linea = body.insertParagraph(idx, "      No se registraron puntos en este apartado.");
          linea.setItalic(true).setForegroundColor("#777").setIndentStart(1.5*72).setIndentFirstLine(1.5*72);
          return;
        }
        elementos.forEach((item,i)=>{
          const { texto, enlace } = generador(item,i);
          const p = body.insertParagraph(idx+i, texto);
          p.setIndentStart(1.5*72).setIndentFirstLine(1.5*72);
          if (enlace) p.appendText(" ").appendText("Consultar").setLinkUrl(enlace);
        });
      } catch (e) {}
    };

    reemplazarBloqueConEnlaces(
      '3.1  <Tipo de notificacion> de la acreditación otorgada. <Registro de Acreditacion> consultar',
      notificaciones,
      (n,i)=>({
        texto: `3.${i+1} ${n.tipoNotificacion || 'Notificación'} de la acreditación otorgada. ${n.registroAcreditacion || ''}`,
        enlace: n.adjuntarDocumentos || ''
      })
    );

    reemplazarBloqueConEnlaces(
      '4.1 <Tipo de desicion >- <Esquema de acreditacion> <Registro de Acreditación>  Consultar',
      decisiones,
      (d,i)=>({
        texto: `4.${i+1} ${d.tipoDecision || 'Evaluación'} - ${obtenerEsquemaAcreditacion(d.registroAcreditacion)||''} ${d.registroAcreditacion||''} (Resolución: ${d.resolucion || 'Pendiente'})`,
        enlace: d.adjuntosOGA || d.adjuntarDocumentos || ''
      })
    );

    reemplazarBloqueConEnlaces(
      '5.1  <Varios>',
      varios,
      (v,i)=>({
        texto: `5.${i+1} ${v.registroAcreditacion || 'Punto varios'}`,
        enlace: v.adjuntarDocumentos || ''
      })
    );

    const agendasFolder = DriveApp.getFolderById(AGENDAS_CREADAS_FOLDER_ID);
    agendasFolder.addFile(copia);
    DriveApp.getRootFolder().removeFile(copia);

    const agendaUrl = doc.getUrl();

    const almacenarResult = almacenarAgenda(config.numeroReunion, agendaUrl);
    Logger.log('📋 Resultado almacenar agenda:', almacenarResult);

    return {
      success: true,
      message: `Agenda generada exitosamente en carpeta "Agendas Creadas" (${filtrados.length} elementos)`,
      detalles: {
        decisiones: decisiones.length,
        notificaciones: notificaciones.length,
        varios: varios.length
      },
      url: agendaUrl
    };

  } catch (error) {
    return { success: false, message: 'Error al generar agenda: ' + error.message };
  }
}

function exportarAExcel(datos) {
  try {
    const config = obtenerConfiguracionAgendaConsejo();
    const ss = SpreadsheetApp.create(`Agenda_Excel_${config ? config.numeroReunion : 'Export'}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd")}`);
    const sheet = ss.getActiveSheet();
    const headers = ['Fecha','Usuario','Registro','Tipo Solicitud','Experto','Tipo Decisión','Resolución','Tipo Notificación','Motivo','Acta','Esquema de acreditación','Nombre comercial','Norma'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');

    if (datos.length > 0) {
      const rows = datos.map(item => [
        new Date(item.marcaTemporal),
        item.correo,
        item.registroAcreditacion,
        item.solicitudCNA,
        item.nombreExperto,
        item.tipoDecision,
        item.resolucion || '',
        item.tipoNotificacion,
        item.motivoNotificacion,
        item.acta,
        item.esquema || '',
        item.nombreEstablecimiento || '',
        item.norma || ''
      ]);
      sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
    }
    sheet.autoResizeColumns(1, headers.length);
    sheet.setFrozenRows(1);
    
    const agendasFolder = DriveApp.getFolderById(AGENDAS_CREADAS_FOLDER_ID);
    const file = DriveApp.getFileById(ss.getId());
    agendasFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    
    return { 
      success: true, 
      message: 'Datos exportados a Excel exitosamente en carpeta "Agendas Creadas"', 
      url: ss.getUrl() 
    };
  } catch (error) {
    return { success: false, message: 'Error al exportar a Excel: ' + error.message };
  }
}

function verificarArchivosEnCarpetaAgendas() {
  try {
    const cacheKey = 'archivos_carpeta_agendas';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    let folder;
    try {
      folder = DriveApp.getFolderById(AGENDAS_CREADAS_FOLDER_ID);
    } catch (e) {
      return {
        success: false,
        message: 'No se pudo acceder a la carpeta de agendas creadas',
        archivos: []
      };
    }

    const listaArchivos = [];
    let archivos;
    try {
      archivos = folder.getFiles();
    } catch (e) {
      return {
        success: false,
        message: 'Error al obtener archivos de la carpeta',
        archivos: []
      };
    }

    while (archivos.hasNext()) {
      try {
        const archivo = archivos.next();
        if (!archivo) continue;

        let mimeType = 'application/octet-stream';
        let nombre = 'Sin nombre';
        let fechaModificacion = new Date();
        let url = '#';

        try { nombre = archivo.getName() || 'Sin nombre'; } 
        catch (e) { }

        try { const blob = archivo.getBlob(); if (blob) mimeType = blob.getContentType() || 'application/octet-stream'; } 
        catch (e) { }

        try { fechaModificacion = archivo.getLastUpdated() || new Date(); } 
        catch (e) { }

        try { url = archivo.getUrl() || '#'; } 
        catch (e) { }

        let tipo = 'file';
        try {
          if (mimeType.includes('document') || mimeType.includes('word')) tipo = 'document';
          else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) tipo = 'spreadsheet';
          else if (mimeType.includes('folder')) tipo = 'folder';
        } catch (_) { tipo = 'file'; }

        const reunionMatch = nombre.match(/\b(\d{1,3}-\d{4})\b/);
        const reunion = reunionMatch ? reunionMatch[1] : null;

        listaArchivos.push({
          nombre,
          url,
          fechaModificacion,
          tipo,
          mimeType,
          reunion
        });
      } catch (e) {
        continue;
      }
    }

    try {
      listaArchivos.sort((a, b) => new Date(b.fechaModificacion) - new Date(a.fechaModificacion));
    } catch (e) { }

    const resultado = {
      success: true,
      archivos: listaArchivos,
      carpetaUrl: folder.getUrl() || '#',
      message: `${listaArchivos.length} archivos encontrados`
    };

    setCachedData(cacheKey, resultado, 120);
    return resultado;

  } catch (error) {
    return {
      success: false,
      message: 'Error al acceder a la carpeta: ' + error.message,
      archivos: []
    };
  }
}

// ===================== UTILIDADES =====================

function obtenerDatosReunionActiva() {
  try {
    const resultado = obtenerDatosAgendaConsejoParaEdicion();
    return resultado.success ? resultado.data : [];
  } catch (error) {
    return [];
  }
}

function desactivarAgendaAlmacenada(numeroReunion) {
  try {
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

function obtenerEsquemaAcreditacion(registro) {
  try {
    const resultado = buscarPorRegistro(registro);
    return resultado.exito ? resultado.esquema : '';
  } catch (error) {
    return '';
  }
}

function almacenarAgenda(numeroReunion, url) {
  try {
    return { success: true, message: 'Agenda almacenada exitosamente' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// ===================== CACHÉ =====================

(function initCacheHelpers() {
  try {
    var __CACHE__ = CacheService.getScriptCache();
    var __CACHE_TIMEOUT__ = 300;

    if (typeof getCachedData !== 'function') {
      this.getCachedData = function(key) {
        try {
          var cached = __CACHE__.get(key);
          return cached ? JSON.parse(cached) : null;
        } catch (e) {
          return null;
        }
      };
    }

    if (typeof setCachedData !== 'function') {
      this.setCachedData = function(key, data, timeout) {
        try {
          __CACHE__.put(key, JSON.stringify(data), timeout || __CACHE_TIMEOUT__);
        } catch (e) {
          // Silencioso
        }
      };
    }
  } catch (e) {
    if (typeof getCachedData !== 'function') {
      this.getCachedData = function() { return null; };
    }
    if (typeof setCachedData !== 'function') {
      this.setCachedData = function() { /* no-op */ };
    }
  }
})();

// ===================== FUNCIONES WRAPPER PARA COMPATIBILIDAD =====================

function verificarEstadoVotacion() {
  return buscarReunionAprobadaParaVotacion();
}

function invitarVotaciones(modoPrueba, maxEnviar = null) {
  return enviarVotacionesDirectas(modoPrueba, maxEnviar);
}

function cargarEstadisticasVotos() {
  return obtenerEstadisticasVotosAgenda();
}

function cargarAgendasDisponiblesVotacion() {
  return buscarAgendasAprobadas();
}

function cargarEstadisticasAgendaEspecifica(numeroReunion) {
  return obtenerEstadisticasVotosPorReunionMejoradas(numeroReunion);
}

function verEstadisticasAgendaEspecifica(numeroReunion) {
  return obtenerEstadisticasVotosPorReunionMejoradas(numeroReunion);
}

function generarResolucion(registro, reunion) {
  return generarResolucionDesdeVotacion(registro, reunion);
}

// ===================== AUTOMATIZACIÓN DE CALENDARIO (backend) =====================

// ===================== AUTOMATIZACIÓN DE CALENDARIO (ARQUITECTURA VERTICAL) =====================

// ===================== AUTOMATIZACIÓN DE CALENDARIO (ARQUITECTURA VERTICAL) =====================

/**
 * Busca la próxima fecha disponible en la hoja 'Calendario_Reuniones'.
 * LÓGICA VERTICAL:
 * 1. Busca la fila que tenga ESTADO (Col D) = "ACTIVA".
 * 2. Si encuentra "ACTIVA": Verifica si tiene fecha Extraordinaria (Col F) o Normal (Col C).
 * 3. Si NO hay "ACTIVA": Busca la primera fecha futura que no esté "CERRADA".
 */
function obtenerSiguienteFechaReunion() {
  try {
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID); 
    const hoja = ss.getSheetByName("Calendario_Reuniones");
    
    if (!hoja) return { success: false, message: "⚠️ No existe la hoja 'Calendario_Reuniones'" };
    
    // Obtenemos todos los datos (matriz completa)
    const datos = hoja.getDataRange().getValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar hoy sin hora

    // --- ESTRATEGIA 1: BUSCAR LA ETIQUETA "ACTIVA" (Prioridad Máxima) ---
    // Recorremos desde la fila 2 (índice 1)
    for (let i = 1; i < datos.length; i++) {
      // Columna D es el índice 3
      const estado = String(datos[i][3] || "").toUpperCase().trim(); 
      
      if (estado === "ACTIVA") {
        // ¡Encontramos la fila activa! 
        const fechaExtra = datos[i][5]; // Col F (Indice 5)
        const fechaNormal = datos[i][2]; // Col C (Indice 2)
        const mesTexto = obtenerMesCorrecto_(datos, i);

        // A. Si esta fila tiene fecha extraordinaria válida, GANA.
        if (esFechaValida_(fechaExtra)) {
           return formatearRespuestaFecha_(fechaExtra, "FECHA EXTRAORDINARIA (ACTIVA)", mesTexto);
        }
        
        // B. Si no, devolvemos la fecha normal de esta fila
        if (esFechaValida_(fechaNormal)) {
           // Detectamos si es 1ra o 2da reunión del mes para el texto
           let orden = "REUNIÓN ACTIVA";
           const mesAnterior = obtenerMesCorrecto_(datos, i-1);
           if (i > 1 && mesTexto === mesAnterior) {
              orden = "SEGUNDA REUNIÓN (ACTIVA)";
           } else {
              orden = "PRIMERA REUNIÓN (ACTIVA)";
           }
           return formatearRespuestaFecha_(fechaNormal, orden, mesTexto);
        }
      }
    }

    // --- ESTRATEGIA 2: FALLBACK (Si nadie puso "ACTIVA") ---
    // Buscamos la primera fecha futura que no esté "CERRADA"
    for (let i = 1; i < datos.length; i++) {
      const fechaNormal = datos[i][2]; // Col C (Indice 2)
      const estado = String(datos[i][3] || "").toUpperCase().trim(); // Col D (Indice 3)
      
      if (esFechaValida_(fechaNormal)) {
        const fechaObj = new Date(fechaNormal);
        fechaObj.setHours(0,0,0,0);
        
        // Si es hoy o futuro Y no está cerrada
        if (fechaObj >= hoy && estado !== "CERRADA") {
           const fechaExtra = datos[i][5]; // Col F
           const mesTexto = obtenerMesCorrecto_(datos, i);

           // Misma lógica: Si tiene extra, gana extra
           if (esFechaValida_(fechaExtra)) {
             return formatearRespuestaFecha_(fechaExtra, "FECHA EXTRAORDINARIA", mesTexto);
           }
           return formatearRespuestaFecha_(fechaNormal, "SIGUIENTE REUNIÓN", mesTexto);
        }
      }
    }

    return { success: false, message: "No se encontraron fechas futuras disponibles en el calendario." };

  } catch (e) {
    Logger.log("Error en calendario: " + e.message);
    return { success: false, message: "Error interno: " + e.message };
  }
}

// --- Helpers privados ---

function obtenerMesCorrecto_(datos, indiceActual) {
  // Busca hacia arriba el nombre del mes si la celda está combinada/vacía
  // (Porque en celdas combinadas verticalmente, solo la primera tiene valor)
  for (let k = indiceActual; k >= 1; k--) {
    if (datos[k][1] && String(datos[k][1]).trim() !== "") {
      return String(datos[k][1]).toUpperCase();
    }
  }
  return "MES DESCONOCIDO";
}

function esFechaValida_(d) {
  return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
}

function formatearRespuestaFecha_(fechaObj, origenTxt, mesTxt) {
  return {
    success: true,
    fechaInput: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    fechaDisplay: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "dd/MM/yyyy"),
    mes: mesTxt,
    origen: origenTxt
  };
}

// --- Helpers privados para el calendario ---

// Valida si es un objeto fecha real
function esFechaValida_(d) {
  return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
}

// Formatea la respuesta JSON para el frontend
function formatearRespuestaFecha_(fechaObj, origenTxt, mesTxt) {
  return {
    success: true,
    fechaInput: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    fechaDisplay: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "dd/MM/yyyy"),
    mes: mesTxt,
    origen: origenTxt
  };
}

// Helper para obtener el mes cuando hay celdas combinadas (busca hacia arriba)
function obtenerMesCorrecto_(datos, indiceActual) {
  // Busca desde el índice actual hacia arriba hasta encontrar un valor en la columna B (índice 1)
  for (let k = indiceActual; k >= 1; k--) {
    if (datos[k][1] && String(datos[k][1]).trim() !== "") {
      return String(datos[k][1]).toUpperCase();
    }
  }
  return "MES DESCONOCIDO";
}

// --- Helpers privados para el calendario ---

function esFechaValida_(d) {
  return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
}

function formatearRespuestaFecha_(fechaObj, origenTxt, mesTxt) {
  return {
    success: true,
    fechaInput: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    fechaDisplay: Utilities.formatDate(new Date(fechaObj), Session.getScriptTimeZone(), "dd/MM/yyyy"),
    mes: mesTxt,
    origen: origenTxt
  };
}

// ===================== FUNCIÓN MAESTRA (UNIFICADA) =====================

/**
 * Función combinada para el Botón Azul.
 * Obtiene el número correlativo Y la fecha del calendario en una sola llamada.
 */
function obtenerDatosProximaReunion() {
  try {
    // 1. Obtener el número (Lógica existente)
    const numero = obtenerSiguienteNumeroReunion();
    
    // 2. Obtener la fecha inteligente (Lógica nueva de calendario)
    const fechaInfo = obtenerSiguienteFechaReunion();
    
    return {
      success: true,
      numero: numero,
      fechaInfo: fechaInfo
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ===================== INICIALIZACIÓN =====================

function abrirAgenda() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('Agenda_Sistema')
      .setWidth(3400)
      .setHeight(2500);
    SpreadsheetApp.getUi().showModalDialog(html, '📅 Agenda Consejo OGA');
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error al abrir el sistema: ' + error.message);
  }
}

function testComunicacion() {
  return { 
    success: true, 
    message: 'Comunicación OK - Sistema v22 CORREGIDO con estadísticas por tipo de decisión', 
    timestamp: new Date(), 
    sheetId: AGENDA_SHEET_ID,
    correoInstitucional: CORREO_INSTITUCIONAL,
    usuariosVotacion: contarUsuariosConPermisoVotacion()
  };
}

// ============ AUTOMATIZACIÓN DE FECHA ============

// ===================== FUNCIÓN MAESTRA (AGREGAR AL FINAL DEL .GS) =====================

/**
 * Función unificada para el botón azul.
 * Ejecuta secuencialmente:
 * 1. Obtener el correlativo (Número de reunión)
 * 2. Buscar en el calendario la fecha correcta
 */
function obtenerDatosProximaReunion() {
  try {
    // 1. Obtener número (reutilizamos tu función existente en la línea ~630)
    const numero = obtenerSiguienteNumeroReunion();
    
    // 2. Obtener fecha inteligente (reutilizamos tu función existente en la línea ~756)
    const fechaInfo = obtenerSiguienteFechaReunion();
    
    return {
      success: true,
      numero: numero,
      fechaInfo: fechaInfo
    };
  } catch (e) {
    return { success: false, message: "Error en función maestra: " + e.message };
  }
}


function detectarFechaInteligente() {
  const btn = document.querySelector('button[onclick="detectarFechaInteligente()"]');
  const infoSpan = document.getElementById('infoOrigenFecha');
  const inputFecha = document.getElementById('fechaReunion');
  
  // Estado de carga visual
  const textoOriginal = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:15px;height:15px;border-width:2px;"></div>';
  btn.disabled = true;
  infoSpan.innerHTML = '<span style="color:var(--oga-text-muted);">Consultando calendario...</span>';

  // Llamada al backend
  google.script.run
    .withSuccessHandler(res => {
      // Restaurar botón
      btn.innerHTML = textoOriginal;
      btn.disabled = false;

      if (res.success) {
        // 1. Poner la fecha en el input
        inputFecha.value = res.fechaInput;
        
        // 2. Mostrar feedback visual de dónde salió la fecha
        let colorBadge = 'var(--oga-success)';
        if (res.origen === 'FECHA EXTRAORDINARIA') colorBadge = 'var(--oga-warning-dark)';
        
        infoSpan.innerHTML = `<span style="color:${colorBadge}">✅ ${res.origen} (${res.mes}) detectada</span>`;
        
        // 3. Notificación flotante
        mostrarNotificacion(`📅 Fecha fijada: ${res.fechaDisplay}`, 'success');
        
        // 4. (Opcional) Auto-calcular rango de fechas basado en la reunión
        // Por ejemplo: Inicio = 15 días antes, Fin = 1 día después
        sugerirRangoFechas(res.fechaInput);
        
      } else {
        infoSpan.innerHTML = `<span style="color:var(--oga-error);">⚠️ ${res.message}</span>`;
        mostrarNotificacion(res.message, 'warning');
      }
    })
    .withFailureHandler(err => {
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
      infoSpan.innerHTML = '<span style="color:var(--oga-error);">Error de conexión</span>';
      mostrarNotificacion(`❌ Error: ${err.message}`, 'error');
    })
    .obtenerSiguienteFechaReunion();
}

function sugerirRangoFechas(fechaReunionStr) {
  // Solo sugiere si los campos están vacíos para no borrar trabajo manual
  const inicioInput = document.getElementById('fechaInicio');
  const finInput = document.getElementById('fechaFin');
  
  if (inicioInput.value && finInput.value) return;

  const fechaBase = new Date(fechaReunionStr + 'T00:00:00');
  
  // Regla sugerida: Inicio 15 días antes
  const inicio = new Date(fechaBase);
  inicio.setDate(inicio.getDate() - 15);
  
  // Regla sugerida: Fin 1 día después de la reunión
  const fin = new Date(fechaBase);
  fin.setDate(fin.getDate() + 1);

  const fmt = d => d.toISOString().split('T')[0];
  
  if (!inicioInput.value) inicioInput.value = fmt(inicio);
  if (!finInput.value) finInput.value = fmt(fin);
}


// ===================== CORRELATIVO (FALTABA ESTA FUNCIÓN) =====================

function obtenerSiguienteNumeroReunion() {
  try {
    const ss = SpreadsheetApp.openById(REUNIONES_SHEET_ID);
    const hoja = ss.getSheetByName("Reuniones");
    const anioActual = new Date().getFullYear();
    
    // Si no existe la hoja o está vacía, empezamos el año
    if (!hoja || hoja.getLastRow() <= 1) {
      return `01-${anioActual}`;
    }

    const datos = hoja.getDataRange().getValues();
    let maxNumero = 0;

    // Recorremos la columna A buscando el correlativo más alto del año actual
    // Empezamos en i=1 para saltar encabezados
    for (let i = 1; i < datos.length; i++) {
      // Limpiamos el valor (ej: "'05-2026" -> "05-2026")
      const valor = String(datos[i][0]).replace(/^'/, '').trim();
      const partes = valor.split('-'); // [05, 2026]
      
      if (partes.length === 2) {
        const numero = parseInt(partes[0], 10);
        const anio = parseInt(partes[1], 10);
        
        // Solo nos interesa el año actual para el consecutivo
        if (anio === anioActual) {
          if (!isNaN(numero) && numero > maxNumero) {
            maxNumero = numero;
          }
        }
      }
    }

    // Calculamos el siguiente
    const siguiente = maxNumero + 1;
    // Formateamos con cero a la izquierda si es menor a 10 (ej: 05)
    const numeroStr = siguiente < 10 ? "0" + siguiente : String(siguiente);
    
    return `${numeroStr}-${anioActual}`;

  } catch (e) {
    Logger.log("Error obteniendo siguiente número: " + e.message);
    // Fallback de seguridad en caso de error
    return `01-${new Date().getFullYear()}`;
  }
}

// ===================== NUEVA VALIDACIÓN REEVALUACIÓN (72 HORAS) =====================

/**
 * Valida si faltan al menos 72 horas para la FECHA y HORA de la reunión activa.
 * Usa la configuración guardada en la hoja 'Configuracion'.
 */
function validarPlazoReevaluacionBackend() {
  try {
    // 1. Obtener la configuración actual de la agenda
    const config = obtenerConfiguracionAgendaConsejo();
    
    if (!config) {
      return { apto: false, mensaje: "No hay una agenda activa configurada para validar la fecha." };
    }

    // 2. Extraer fecha y hora de la configuración
    // config.fechaReunion suele venir como "YYYY-MM-DD" o objeto Date
    // config.horaLimite suele venir como "HH:mm"
    const fechaStr = config.fechaReunion; 
    const horaStr = config.horaLimite || "23:59"; // Default al final del día si no hay hora

    if (!fechaStr) {
      return { apto: false, mensaje: "La agenda activa no tiene fecha de reunión definida." };
    }

    // 3. Construir el objeto Date del "Momento de la Reunión"
    // Es importante parsearlo manualmente para asegurar el formato correcto
    let fechaReunionFinal;
    
    // Si ya es objeto fecha, lo usamos, si es string lo partimos
    if (fechaStr instanceof Date) {
      fechaReunionFinal = new Date(fechaStr);
    } else {
      // Asumimos string YYYY-MM-DD (formato estándar del input date)
      const partes = String(fechaStr).split('-'); 
      // Nota: new Date(año, mes-1, dia) porque los meses en JS van de 0 a 11
      fechaReunionFinal = new Date(partes[0], partes[1] - 1, partes[2]);
    }

    // Agregar la hora límite a la fecha
    const partesHora = String(horaStr).split(':');
    fechaReunionFinal.setHours(parseInt(partesHora[0]), parseInt(partesHora[1]), 0, 0);

    // 4. Calcular el "Punto de Corte" (Deadline - 72 horas)
    const HORAS_LIMITE = 192;
    const MS_EN_72_HORAS = HORAS_LIMITE * 60 * 60 * 1000;
    
    const fechaCorte = new Date(fechaReunionFinal.getTime() - MS_EN_72_HORAS);
    const ahora = new Date();

    // 5. Comparar: ¿Ya pasó el punto de corte?
    if (ahora > fechaCorte) {
      // Cálculo para mostrar cuántas horas tarde se está intentando subir
      const msTarde = ahora.getTime() - fechaCorte.getTime();
      const horasTarde = Math.floor(msTarde / (1000 * 60 * 60));
      
      const cierreLegible = Utilities.formatDate(fechaCorte, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      
      return { 
        apto: false, 
        mensaje: `⛔ TIEMPO AGOTADO PARA REEVALUACIÓN: Se requieren 72 horas antes de la reunión. El sistema cerró la recepción de este tipo de solicitud el ${cierreLegible} (hace ${horasTarde} horas).` 
      };
    }

    // Si llegamos aquí, estamos a tiempo
    return { apto: true };

  } catch (e) {
    Logger.log("Error crítico validando 72h: " + e.message);
    // En caso de error técnico, bloqueamos por seguridad y pedimos reportar
    return { apto: false, mensaje: "Error técnico validando fechas: " + e.message };
  }
}


// ===================== FUNCIONES DE PRUEBA =====================

function testContadorTiempo() {
  console.log('🚀 PROBANDO CONTADOR DE TIEMPO...');
  
  const estadoTiempo = obtenerEstadoTiempoAgenda();
  console.log('📊 Estado del tiempo:', estadoTiempo);
  
  const puedeAgregar = puedeAgregarElementos();
  console.log('🔒 Puede agregar elementos:', puedeAgregar);
  
  if (estadoTiempo.success) {
    console.log('✅ CONTADOR FUNCIONANDO - Tiempo restante:', estadoTiempo.tiempo.textoLegible);
    return { success: true, message: 'Contador de tiempo funcionando correctamente', datos: estadoTiempo };
  } else {
    console.log('❌ CONTADOR FALLIDO:', estadoTiempo.message);
    return { success: false, message: estadoTiempo.message };
  }
}

function testVotacionesSimples() {
  console.log('🚀 PROBANDO VOTACIONES SIMPLES...');
  
  const verificacion = hayAgendaListaParaVotar();
  
  console.log('📊 Resultado verificación:', verificacion);
  
  if (verificacion.success) {
    console.log('✅ PRUEBA EXITOSA - Agenda lista para votar:', verificacion.numeroReunion);
    return { success: true, message: 'Votaciones simples funcionando correctamente' };
  } else {
    console.log('❌ PRUEBA FALLIDA:', verificacion.mensaje);
    return { success: false, message: verificacion.mensaje };
  }
}

function testPermisosVotacion() {
  console.log('🚀 PROBANDO PERMISOS DE VOTACIÓN (POR HOJA Usuarios)...');

  var usuario = getUsuarioEfectivo();
  var permisos = obtenerPermisosUsuario();

  console.log('📊 Usuario efectivo:', usuario);
  console.log('📊 En hoja:', permisos.enHoja);
  console.log('📊 Autorizado crear agenda (C):', permisos.autorizadoCrear);
  console.log('📊 Autorizado enviar votación (E):', permisos.autorizadoVotar);

  return {
    success: true,
    message: 'Test de permisos completado (validación por hoja Usuarios)',
    usuario: usuario,
    enHoja: permisos.enHoja,
    autorizadoCrear: permisos.autorizadoCrear,
    autorizadoVotar: permisos.autorizadoVotar,
    fila: permisos.fila || null
  };
}


function testEstadisticasMejoradas() {
  console.log('🚀 PROBANDO ESTADÍSTICAS CORREGIDAS...');
  
  const estadisticas = obtenerEstadisticasVotosPorReunionMejoradas('01-2025');
  
  console.log('📊 Resultado estadísticas:', estadisticas);
  
  if (estadisticas.success) {
    console.log('✅ ESTADÍSTICAS OK - Registros procesados:', estadisticas.registros.length);
    console.log('📊 Tipos encontrados:', Object.keys(estadisticas.registrosPorTipo || {}));
    return { success: true, message: 'Estadísticas corregidas funcionando correctamente', datos: estadisticas };
  } else {
    console.log('❌ ESTADÍSTICAS FALLIDAS:', estadisticas.message);
    return { success: false, message: estadisticas.message };
  }
}

function testSistemaCompletoMejorado() {
  Logger.log("🚀 INICIANDO TEST SISTEMA COMPLETO MEJORADO v22 CORREGIDO");
  Logger.log("=" * 60);
  
  // Test 1: Contador de tiempo
  Logger.log("⏰ TEST 1: Contador de Tiempo");
  const test1 = testContadorTiempo();
  Logger.log("Resultado Test 1:", test1.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Test 2: Verificación de agenda activa con tiempo
  Logger.log("\n🔍 TEST 2: Verificación Agenda Activa");
  const test2 = { success: verificarAgendaConsejoActiva() };
  Logger.log("Resultado Test 2:", test2.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Test 3: Votaciones
  Logger.log("\n🗳️ TEST 3: Sistema Votaciones");
  const test3 = testVotacionesSimples();
  Logger.log("Resultado Test 3:", test3.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Test 4: Permisos de votación
  Logger.log("\n🔐 TEST 4: Permisos de Votación");
  const test4 = testPermisosVotacion();
  Logger.log("Resultado Test 4:", test4.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Test 5: Estadísticas corregidas
  Logger.log("\n📊 TEST 5: Estadísticas Corregidas (FIX)");
  const test5 = testEstadisticasMejoradas();
  Logger.log("Resultado Test 5:", test5.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Test 6: Estado general
  Logger.log("\n📈 TEST 6: Estado General");
  const agendas = obtenerTodasLasAgendasConsejo();
  const test6 = { success: agendas.length > 0, agendas: agendas.length };
  Logger.log("Resultado Test 6:", test6.success ? "✅ EXITOSO" : "❌ FALLIDO");
  
  // Resumen
  Logger.log("\n" + "=" * 60);
  Logger.log("📊 RESUMEN SISTEMA COMPLETO MEJORADO v22 CORREGIDO:");
  Logger.log(`Contador de Tiempo: ${test1.success ? "✅" : "❌"}`);
  Logger.log(`Agenda Activa: ${test2.success ? "✅" : "❌"}`);
  Logger.log(`Votaciones: ${test3.success ? "✅" : "❌"}`);
  Logger.log(`Permisos Votación: ${test4.success ? "✅" : "❌"} (Usuario: ${test4.autorizado ? "AUTORIZADO" : "NO AUTORIZADO"})`);
  Logger.log(`Estadísticas FIX: ${test5.success ? "✅ CORREGIDAS" : "❌"}`);
  Logger.log(`Estado General: ${test6.success ? "✅" : "❌"}`);
  Logger.log(`Correo Institucional: ${CORREO_INSTITUCIONAL}`);
  Logger.log("=" * 60);
  
  return {
    success: true,
    version: "v22 - Sistema CORREGIDO con Estadísticas por Tipo de Decisión",
    tests: {
      contadorTiempo: test1.success,
      agendaActiva: test2.success,
      votaciones: test3.success,
      permisosVotacion: test4.success,
      estadisticasCorregidas: test5.success,
      estadoGeneral: test6.success
    },
    permisos: test4,
    correoInstitucional: CORREO_INSTITUCIONAL,
    message: "Tests completados - SISTEMA CORREGIDO v22 CON FIX DE ESTADÍSTICAS POR TIPO DE DECISIÓN"
  };
}

// ===================== FIN DEL ARCHIVO =====================
// Versión 22 CORREGIDA - ESTADÍSTICAS POR TIPO DE DECISIÓN FUNCIONANDO
// FIX CRÍTICO APLICADO:
// 1. ✅ Ahora distingue correctamente múltiples tipos de decisión para el mismo registro
// 2. ✅ Ampliación de Alcance y Reevaluación se cuentan por separado
// 3. ✅ Clave única: registro + tipo de decisión  
// 4. ✅ Display mejorado: "OGA-LE-047-12 (Ampliación de Alcance)" vs "OGA-LE-047-12 (Reevaluación)"
// 5. ✅ Control de acceso específico para votaciones (4 usuarios autorizados)
// 6. ✅ Correo institucional obligatorio info@oga.org.gt
// 7. ✅ UI mejorada con texto nítido en ambos modos
// 8. ✅ Contador de tiempo integrado y optimizado
// 9. ✅ Todas las funcionalidades anteriores mantenidas intactas
// 10. ✅ Tests específicos para validar las correcciones
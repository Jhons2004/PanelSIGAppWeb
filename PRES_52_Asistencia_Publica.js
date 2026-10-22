const WAPP_ASISTV16_DIAS_CIERRE = 3;

function WAPP_ASISTV16_prepararAgenda_(c) {
  const inicial = WAPP_ASISTV16_getOrCreate_(
    c,
    'Reunión Inicial',
    c.evaluacion.fechaInicio
  );

  const final = WAPP_ASISTV16_getOrCreate_(
    c,
    'Reunión Final',
    c.evaluacion.fechaFinal
  );

  return {
    inicial: inicial,
    final: final
  };
}

function WAPP_ASISTV16_getOrCreate_(c, actividad, fechaReunion) {
  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_EVENTOS || 'Eventos_Asistencia');

  if (!sh) {
    throw new Error('No existe la hoja Eventos_Asistencia.');
  }

  const fecha = WAPP_DOCV16_parseDate_(fechaReunion);
  if (!fecha) {
    throw new Error(
      'No existe fecha válida para habilitar ' + actividad + '.'
    );
  }

  const dateKey = Utilities.formatDate(
    fecha,
    cfg.TZ,
    'yyyy-MM-dd'
  );

  // Clave compatible con PROGRAMACION_ASISTENCIA original.
  const key = [
    c.ctx.registro,
    fecha.getFullYear(),
    fecha.getMonth() + 1,
    c.evaluacion.tipoEvaluacion,
    actividad
  ].join('|');

  // Compatibilidad con eventos creados por V1.6 inicial.
  const legacyKeyV16 = [
    c.ctx.registro,
    dateKey,
    c.evaluacion.tipoEvaluacion,
    actividad
  ].join('|');

  const rows = WAPP_rowsByHeaders_(sh);
  const found = rows.find(r => {
    const k = String(r.Key_Evento || '').trim();
    return k === key || k === legacyKeyV16;
  });

  if (found) {
    WAPP_ASISTV16_actualizarMetadataEvento_(
      sh,
      found,
      c,
      fecha,
      key
    );

    return {
      idEvento: String(found.ID_Evento || ''),
      token: String(found.Token || ''),
      url: String(found.URL_Captura || ''),
      reutilizado: true
    };
  }

  const token = Utilities.getUuid().replace(/-/g, '');
  const idEvento = Utilities.getUuid();
  const urlBase = String(
    ScriptApp.getService().getUrl() || ''
  ).replace(/\?.*$/, '');

  if (!urlBase) {
    throw new Error(
      'No fue posible obtener la URL de la WebApp para la lista de asistencia.'
    );
  }

  const url =
    urlBase +
    '?modo=asistencia&token=' +
    encodeURIComponent(token);

  const fechaFinal = WAPP_DOCV16_parseDate_(
    c.evaluacion.fechaFinal
  );

  const fechaCierre = new Date(fechaFinal);
  fechaCierre.setDate(
    fechaCierre.getDate() + WAPP_ASISTV16_DIAS_CIERRE
  );

  const meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];

  const oficial =
    c.ctx.ciclo && c.ctx.ciclo.oficialAsignado
      ? c.ctx.ciclo.oficialAsignado
      : (c.user.nombre || c.user.email);

  WAPP_appendByHeaders_(sh, {
    ID_Evento: idEvento,
    Key_Evento: key,
    Token: token,
    OEC_ID: c.ctx.registro,
    Razon_Social: c.ctx.razonSocial,
    Esquema_Acreditacion: c.ctx.tipo,
    Norma: c.ctx.norma,
    Oficial_Asignado: oficial,
    Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
    Tipo_Actividad: actividad,
    Anio: fecha.getFullYear(),
    Mes_Numero: fecha.getMonth() + 1,
    Mes_Nombre: meses[fecha.getMonth()],
    Estado_Evento: 'Abierto',
    URL_Captura: url,
    URL_PDF: '',
    Fecha_Habilitacion: new Date(),
    Fecha_Cierre: '',
    Total_Registros: 0,
    'Creado por': c.user.nombre || c.user.email,
    'Cerrado por': '',
    Fecha_Reunion: fecha,
    Fecha_Apertura_Programada: fecha,
    Fecha_Final_Evaluacion: fechaFinal,
    Fecha_Cierre_Programado: fechaCierre,
    Cierre_Automatico: '',
    Fecha_Cierre_Automatica: '',
    Recordatorio_Cierre_Enviado: '',
    Correo_Oficial: WAPP_ASISTV16_correoOficial_(oficial),
    Nombre_Oficial: oficial,
    Nombre_Comercial: c.ctx.nombreComercial || c.ctx.razonSocial || '',
    Motivo_Cierre: '',
    Origen_Habilitacion: 'Agenda',
    Error_Recordatorio_Cierre: ''
  });

  return {
    idEvento: idEvento,
    token: token,
    url: url,
    reutilizado: false
  };
}


function WAPP_ASISTV16_actualizarMetadataEvento_(
  sheet,
  row,
  c,
  fechaReunion,
  keyCompatible
) {
  if (!row || !row.__rowNumber) return;

  const fechaFinal = WAPP_DOCV16_parseDate_(
    c.evaluacion.fechaFinal
  );

  const cierre = new Date(fechaFinal);
  cierre.setDate(
    cierre.getDate() + WAPP_ASISTV16_DIAS_CIERRE
  );

  const oficial =
    c.ctx.ciclo && c.ctx.ciclo.oficialAsignado
      ? c.ctx.ciclo.oficialAsignado
      : (c.user.nombre || c.user.email);

  const updates = {
    Key_Evento: keyCompatible,
    Oficial_Asignado: oficial,
    Fecha_Reunion: fechaReunion,
    Fecha_Apertura_Programada: fechaReunion,
    Fecha_Final_Evaluacion: fechaFinal,
    Fecha_Cierre_Programado: cierre,
    Correo_Oficial: WAPP_ASISTV16_correoOficial_(oficial),
    Nombre_Oficial: oficial,
    Nombre_Comercial:
      c.ctx.nombreComercial ||
      c.ctx.razonSocial ||
      '',
    Origen_Habilitacion: 'Agenda'
  };

  const headers = sheet.getRange(
    1, 1, 1, sheet.getLastColumn()
  ).getDisplayValues()[0].map(h => String(h || '').trim());

  Object.keys(updates).forEach(header => {
    const idx = headers.indexOf(header);
    if (idx >= 0) {
      sheet.getRange(
        row.__rowNumber,
        idx + 1
      ).setValue(updates[header]);
    }
  });
}

function WAPP_ASISTV16_correoOficial_(nombreOficial) {
  try {
    const cfg = WAPP_cfg_();
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
    const sh = ss.getSheetByName(cfg.HOJA_OFICIALES || 'Oficiales');

    if (!sh) return '';

    const buscado = WAPP_norm_(nombreOficial);

    const row = WAPP_rowsByHeaders_(sh).find(r =>
      WAPP_norm_(r.nombre_completo) === buscado
    );

    return row
      ? String(row.correo || '').trim().toLowerCase()
      : '';

  } catch (e) {
    return '';
  }
}

/**
 * API pública consumida por ListaAsistenciaPublica.html
 */
function obtenerEventoPublicoAsistencia(token) {
  try {
    const ev = WAPP_ASISTV16_eventoPorToken_(token);

    if (!ev) {
      return {
        ok: false,
        message: 'No se encontró el evento de asistencia.'
      };
    }

    const ventana = WAPP_ASISTV16_validarVentana_(ev);

    return {
      ok: true,
      evento: {
        idEvento: String(ev.ID_Evento || ''),
        token: String(ev.Token || ''),
        oecId: String(ev.OEC_ID || ''),
        razonSocial: String(ev.Razon_Social || ''),
        tipoEvaluacion: String(ev.Tipo_Evaluacion || ''),
        tipoActividad: String(ev.Tipo_Actividad || ''),
        oficialAsignado: String(ev.Oficial_Asignado || ''),
        estadoEvento: String(ev.Estado_Evento || ''),
        registroPermitido: ventana.permitido,
        mensajeVentana: ventana.mensaje,
        estadoOperativo:
          ventana.permitido
            ? String(ev.Estado_Evento || 'Abierto')
            : 'Registro no disponible',
        fechaReunion: ventana.fechaReunionTexto,
        fechaCierreProgramado: ventana.fechaCierreProgramadoTexto
      },
      trace: {
        env: WAPP_getEnv_(),
        version: WAPP_VERSION
      }
    };

  } catch (e) {
    return {
      ok: false,
      message: e && e.message ? e.message : String(e)
    };
  }
}

function guardarRegistroPublicoAsistencia(datos) {
  try {
    datos = datos || {};

    const ev = WAPP_ASISTV16_eventoPorToken_(datos.token);
    if (!ev) {
      throw new Error('El enlace de asistencia no es válido.');
    }

    const ventana = WAPP_ASISTV16_validarVentana_(ev);
    if (!ventana.permitido) {
      throw new Error(
        ventana.mensaje ||
        'La lista no está disponible para registro.'
      );
    }

    const nombre = String(datos.nombreCompleto || '').trim();
    const correo = String(datos.correo || '').trim().toLowerCase();
    const institucion = String(datos.institucion || '').trim();
    const rol = String(datos.rol || '').trim();
    let puesto = String(datos.puesto || '').trim();
    const observaciones = String(datos.observaciones || '').trim();

    if (!nombre) throw new Error('Ingrese nombre completo.');
    if (!WAPP_emailOk_(correo)) throw new Error('Ingrese un correo válido.');
    if (!institucion) throw new Error('Seleccione la institución.');
    if (!rol) throw new Error('Seleccione el rol.');

    if (institucion === 'OGA') {
      if (rol !== 'Miembro de equipo evaluador') {
        throw new Error(
          'Para OGA, el rol permitido es Miembro de equipo evaluador.'
        );
      }
      puesto = 'N.A.';
    } else if (institucion === 'Organismo Evaluado') {
      if (rol !== 'Personal del Organismo Evaluado') {
        throw new Error(
          'Para Organismo Evaluado, seleccione Personal del Organismo Evaluado.'
        );
      }
      if (!puesto || /^N\.?A\.?$/i.test(puesto)) {
        throw new Error(
          'Debe indicar el puesto dentro del Organismo Evaluado.'
        );
      }
    } else {
      throw new Error('Seleccione una organización válida.');
    }

    const cfg = WAPP_cfg_();
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
    const detail = ss.getSheetByName(
      cfg.HOJA_ASISTENCIA_DETALLE || 'Asistencia_Detalle'
    );

    if (!detail) {
      throw new Error('No existe la hoja Asistencia_Detalle.');
    }

    const token = String(ev.Token || '');
    const duplicado = WAPP_rowsByHeaders_(detail).some(r =>
      String(r.Token || '') === token &&
      String(r.Correo || '').trim().toLowerCase() === correo &&
      WAPP_norm_(r.Estado_Registro || 'Activo') !== 'anulado'
    );

    if (duplicado) {
      throw new Error(
        'Este correo ya registró asistencia para el evento.'
      );
    }

    WAPP_appendByHeaders_(detail, {
      ID_Registro: Utilities.getUuid(),
      ID_Evento: ev.ID_Evento,
      Token: ev.Token,
      OEC_ID: ev.OEC_ID,
      Razon_Social: ev.Razon_Social,
      Tipo_Evaluacion: ev.Tipo_Evaluacion,
      Tipo_Actividad: ev.Tipo_Actividad,
      Nombre_Completo: nombre,
      Correo: correo,
      Institucion: institucion,
      Rol: rol,
      Puesto_OEC: puesto,
      Observaciones: observaciones,
      Fecha_Captura: new Date(),
      Estado_Registro: 'Activo'
    });

    WAPP_ASISTV16_actualizarTotal_(ev);

    return {
      ok: true,
      message: 'Registro de asistencia guardado correctamente.'
    };

  } catch (e) {
    return {
      ok: false,
      message: e && e.message ? e.message : String(e)
    };
  }
}

function WAPP_ASISTV16_eventoPorToken_(token) {
  const clean = WAPP_limpiarToken_(token);
  if (!clean) return null;

  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_EVENTOS || 'Eventos_Asistencia');

  if (!sh) return null;

  return WAPP_rowsByHeaders_(sh).find(r =>
    String(r.Token || '').trim() === clean
  ) || null;
}

function WAPP_ASISTV16_validarVentana_(ev) {
  if (WAPP_norm_(ev.Estado_Evento) === 'cerrado') {
    return {
      permitido: false,
      mensaje: 'La lista ya fue cerrada y no admite nuevos registros.'
    };
  }

  const reunion = WAPP_DOCV16_parseDate_(ev.Fecha_Reunion);
  const cierre = WAPP_DOCV16_parseDate_(ev.Fecha_Cierre_Programado);

  if (!reunion) {
    return {
      permitido: false,
      mensaje: 'La lista no tiene fecha de reunión configurada.'
    };
  }

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const eventDay = new Date(
    reunion.getFullYear(),
    reunion.getMonth(),
    reunion.getDate()
  );

  const fechaTxt = Utilities.formatDate(
    eventDay,
    WAPP_cfg_().TZ,
    'dd/MM/yyyy'
  );

  if (today.getTime() < eventDay.getTime()) {
    return {
      permitido: false,
      mensaje:
        'Esta lista estará disponible el ' +
        fechaTxt + '.',
      fechaReunionTexto: fechaTxt,
      fechaCierreProgramadoTexto:
        cierre
          ? Utilities.formatDate(cierre, WAPP_cfg_().TZ, 'dd/MM/yyyy')
          : ''
    };
  }

  if (today.getTime() > eventDay.getTime()) {
    return {
      permitido: false,
      mensaje:
        'El registro de asistencia sólo estuvo habilitado el ' +
        fechaTxt + '.',
      fechaReunionTexto: fechaTxt,
      fechaCierreProgramadoTexto:
        cierre
          ? Utilities.formatDate(cierre, WAPP_cfg_().TZ, 'dd/MM/yyyy')
          : ''
    };
  }

  return {
    permitido: true,
    mensaje: '',
    fechaReunionTexto: fechaTxt,
    fechaCierreProgramadoTexto:
      cierre
        ? Utilities.formatDate(cierre, WAPP_cfg_().TZ, 'dd/MM/yyyy')
        : ''
  };
}

function WAPP_ASISTV16_actualizarTotal_(ev) {
  try {
    const cfg = WAPP_cfg_();
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
    const events = ss.getSheetByName(
      cfg.HOJA_EVENTOS || 'Eventos_Asistencia'
    );
    const detail = ss.getSheetByName(
      cfg.HOJA_ASISTENCIA_DETALLE || 'Asistencia_Detalle'
    );

    const total = WAPP_rowsByHeaders_(detail).filter(r =>
      String(r.ID_Evento || '') === String(ev.ID_Evento || '') &&
      WAPP_norm_(r.Estado_Registro || 'Activo') !== 'anulado'
    ).length;

    const headers = events.getRange(
      1, 1, 1, events.getLastColumn()
    ).getDisplayValues()[0];

    const col = headers.indexOf('Total_Registros') + 1;
    if (col > 0 && ev.__rowNumber) {
      events.getRange(ev.__rowNumber, col).setValue(total);
    }
  } catch (e) {
    console.warn(
      '[ASISTV16] No se pudo actualizar Total_Registros:',
      e
    );
  }
}

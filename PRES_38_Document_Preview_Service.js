const WAPP_DOC_PREVIEW_KEY = 'WAPP_DOC_PREVIEW_STATE';

function WAPP_DOC_PREVIEW_create_() {
  const flow = WAPP_FLOW_get_();
  if (!flow.registro) throw new Error('No existe un registro activo.');

  const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
  const evaluacion = WAPP_PRES_getEvaluacion_();
  const equipo = WAPP_EQ_get_();

  if (!evaluacion) throw new Error('No existen datos de evaluación guardados.');
  if (!equipo.length) throw new Error('No existe equipo evaluador guardado.');

  const duplicateControl = WAPP_DUP_assertAllowed_({
    registro: evaluacion.registro,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal
  }, WAPP_SEC_assertUsuarioInterno_());

  const policy = WAPP_EQ_assertDiasSegunPrediccion_(equipo);
  const reglas = WAPP_DOC_PREVIEW_rules_(evaluacion.tipoEvaluacion);

  const documentos = [
    {
      key: 'agenda',
      nombre: 'Agenda de evaluación',
      aplica: reglas.agenda,
      generableAhora: reglas.agenda,
      detalle: reglas.agenda
        ? 'Se generará como Google Doc editable en el expediente OEC y en el respaldo general.'
        : 'No aplica para este tipo de evaluación.'
    },
    {
      key: 'presupuesto',
      nombre: 'Presupuesto',
      aplica: reglas.presupuesto,
      generableAhora: reglas.presupuesto,
      detalle: reglas.presupuesto
        ? 'Se generará en PDF en el expediente OEC y en el respaldo general.'
        : 'No aplica para este tipo de evaluación.'
    },
    {
      key: 'boleta',
      nombre: 'Boleta de pago',
      aplica: reglas.boleta,
      generableAhora: reglas.boleta,
      detalle: reglas.boleta
        ? 'Se generará como PDF institucional y se registrará con correlativo y tipo de cambio cuando corresponda.'
        : 'No aplica para este tipo de evaluación.'
    },
    {
      key: 'informe',
      nombre: 'Informe / documento de evaluación',
      aplica: reglas.informe,
      generableAhora: reglas.informe,
      detalle: reglas.informe
        ? 'Se generará como Google Doc editable en el expediente OEC y en el respaldo general.'
        : 'No aplica para este tipo de evaluación.'
    }
  ];

  const warnings = [];

  if (WAPP_EVAL_esRevisionDocumentalAC_(evaluacion.tipoEvaluacion)) {
    warnings.push(
      'Revisión documental de acciones correctivas: las fechas se ingresan manualmente como parte del proceso, pero no se utilizan para la validación de duplicidad ni se autocalculan con la predicción.'
    );
  }

  if (evaluacion.tipoFueraPrograma === true) {
    warnings.push(
      'El tipo de evaluación seleccionado no corresponde al programa del ciclo y fue elegido mediante la opción de excepción.'
    );
  }

  if (!ctx.direccion) {
    warnings.push(
      'La dirección del OEC todavía no tiene fuente institucional configurada en esta versión.'
    );
  }

  const sinLugar = equipo.filter(x =>
    x.rolKey !== 'formacion' &&
    !String(x.lugarTrabajo || '').trim()
  );
  if (sinLugar.length) {
    warnings.push(
      'Hay integrantes sin lugar de trabajo: ' +
      sinLugar.map(x => x.nombre || x.rol).join(', ') + '.'
    );
  }

  const sinAreaEvaluacion = equipo.filter(x =>
    x.rolKey !== 'oficial' &&
    !String(x.area || '').trim()
  );
  if (sinAreaEvaluacion.length) {
    warnings.push(
      'Hay integrantes sin área asignada para esta evaluación: ' +
      sinAreaEvaluacion.map(x => x.nombre || x.rol).join(', ') + '.'
    );
  }

  const instalaciones = Array.isArray(evaluacion.instalacionesProgramadas)
    ? evaluacion.instalacionesProgramadas
    : [];

  if (reglas.agenda && !instalaciones.length) {
    warnings.push(
      'La evaluación requiere Agenda pero no tiene instalaciones programadas.'
    );
  }

  const previewData = {
    registro: ctx.registro,
    razonSocial: ctx.razonSocial,
    norma: ctx.norma,
    esquema: ctx.tipo,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal,
    duracionSugerida: Number(
      evaluacion.estimacionTiempo &&
      evaluacion.estimacionTiempo.duracionSugerida || 0
    ),
    fechaFinalSugerida: evaluacion.fechaFinalSugerida || '',
    controlDuplicado: {
      hasDuplicates: duplicateControl.hasDuplicates,
      authorized: duplicateControl.authorized,
      antecedentes: duplicateControl.duplicates || [],
      authorization: duplicateControl.authorization ? {
        idAutorizacion: duplicateControl.authorization.idAutorizacion,
        autorizadoPor: duplicateControl.authorization.autorizadoPor,
        motivo: duplicateControl.authorization.motivo,
        fechaAutorizacion: duplicateControl.authorization.fechaAutorizacion,
        filasAntecedentes: duplicateControl.authorization.filasAntecedentes || []
      } : null
    },
    instalacionesProgramadas: instalaciones,
    policy: policy,
    documentos: documentos,
    equipo: equipo.map(x => ({
      rolKey: x.rolKey,
      rol: x.rol,
      nombre: x.nombre,
      correo: x.correo,
      tipo: x.tipo,
      documental: Number(x.documental || 0),
      sitio: Number(x.sitio || 0),
      lugarTrabajo: x.lugarTrabajo || '',
      areaCatalogo: x.areaCatalogo || '',
      area: x.area || ''
    })),
    warnings: warnings
  };

  // La firma se calcula sólo sobre el conjunto de datos funcionales que
  // también se reconstruirá al momento de generar. Así, cambios reales
  // invalidan la vista previa, pero textos decorativos no.
  const signature = WAPP_DOC_PREVIEW_signature_(
    WAPP_DOC_PREVIEW_buildComparable_()
  );
  const token = Utilities.getUuid();

  WAPP_STATE_props_().setProperty(
    WAPP_DOC_PREVIEW_KEY,
    JSON.stringify({
      token: token,
      signature: signature,
      createdAt: new Date().toISOString()
    })
  );

  previewData.previewToken = token;
  previewData.createdAt = new Date().toISOString();

  return previewData;
}

function WAPP_DOC_PREVIEW_assertToken_(token) {
  const received = String(token || '').trim();
  if (!received) {
    throw new Error(
      'Debe revisar y confirmar la vista previa antes de generar documentos.'
    );
  }

  const raw = WAPP_STATE_props_().getProperty(WAPP_DOC_PREVIEW_KEY);
  if (!raw) {
    throw new Error(
      'La vista previa ya no está vigente. Actualícela antes de generar documentos.'
    );
  }

  const state = JSON.parse(raw);
  if (received !== String(state.token || '')) {
    throw new Error(
      'La confirmación de vista previa no corresponde a la operación actual.'
    );
  }

  const current = WAPP_DOC_PREVIEW_buildComparable_();
  const signature = WAPP_DOC_PREVIEW_signature_(current);

  if (signature !== state.signature) {
    WAPP_STATE_props_().deleteProperty(WAPP_DOC_PREVIEW_KEY);
    throw new Error(
      'Los datos cambiaron después de la vista previa. Revise nuevamente antes de generar.'
    );
  }

  return true;
}

function WAPP_DOC_PREVIEW_buildComparable_() {
  const flow = WAPP_FLOW_get_();
  const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
  const evaluacion = WAPP_PRES_getEvaluacion_();
  const equipo = WAPP_EQ_get_();

  WAPP_EQ_assertDiasSegunPrediccion_(equipo);
  const reglas = WAPP_DOC_PREVIEW_rules_(evaluacion.tipoEvaluacion);
  const duplicateControl = WAPP_DUP_assertAllowed_({
    registro: evaluacion.registro,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal
  }, WAPP_SEC_assertUsuarioInterno_());

  return {
    registro: ctx.registro,
    razonSocial: ctx.razonSocial,
    norma: ctx.norma,
    esquema: ctx.tipo,
    tipoEvaluacion: evaluacion.tipoEvaluacion,
    fechaInicio: evaluacion.fechaInicio,
    fechaFinal: evaluacion.fechaFinal,
    duracionSugerida: Number(
      evaluacion.estimacionTiempo &&
      evaluacion.estimacionTiempo.duracionSugerida || 0
    ),
    fechaFinalSugerida: evaluacion.fechaFinalSugerida || '',
    duplicateAuthorizationId:
      duplicateControl.authorization &&
      duplicateControl.authorization.idAutorizacion || '',
    duplicateRows: (duplicateControl.duplicates || []).map(x => x.rowNumber),
    instalacionesProgramadas:
      Array.isArray(evaluacion.instalacionesProgramadas)
        ? evaluacion.instalacionesProgramadas
        : [],
    policy: WAPP_EQ_assertDiasSegunPrediccion_(equipo),
    documentos: [
      {key:'agenda', aplica:reglas.agenda},
      {key:'presupuesto', aplica:reglas.presupuesto},
      {key:'boleta', aplica:reglas.boleta},
      {key:'informe', aplica:reglas.informe}
    ],
    equipo: equipo.map(x => ({
      rolKey: x.rolKey,
      rol: x.rol,
      nombre: x.nombre,
      correo: x.correo,
      tipo: x.tipo,
      documental: Number(x.documental || 0),
      sitio: Number(x.sitio || 0),
      lugarTrabajo: x.lugarTrabajo || '',
      areaCatalogo: x.areaCatalogo || '',
      area: x.area || ''
    }))
  };
}

function WAPP_DOC_PREVIEW_signature_(data) {
  const stable = JSON.stringify(data || {});
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    stable,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest);
}

function WAPP_DOC_PREVIEW_rules_(tipoEvaluacion) {
  const tipo = WAPP_norm_(tipoEvaluacion);

  const mapa = {
    'evaluacion inicial': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'evaluacion de seguimiento': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'evaluacion de ampliacion': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'reevaluacion': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'reevaluacion y ampliacion': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'evaluacion de seguimiento y ampliacion': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'revision documental de acciones correctivas': {
      agenda: false, presupuesto: true, boleta: true, informe: false
    },
    'evaluacion de acciones correctivas en sitio': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'evaluacion de transicion de norma': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    },
    'evaluacion adicional': {
      agenda: true, presupuesto: true, boleta: true, informe: true
    }
  };

  const r = mapa[tipo];
  if (!r) {
    throw new Error(
      'No existe una regla documental definida para el tipo de evaluación: ' +
      tipoEvaluacion
    );
  }
  return r;
}

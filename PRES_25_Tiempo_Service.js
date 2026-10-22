/**
 * Modelo de tiempos V1.1.
 * Replica el modelo actualmente integrado a Presupuesto V2.
 * Esta función sólo estima; NO registra un caso estadístico.
 */
const WAPP_TIME_MODEL = {
  intercepto: 3.25935,
  tipo: {
    'Evaluación de Seguimiento': 0,
    'Evaluación Inicial': 1.115744,
    'Reevaluación': -0.238338,
    'Evaluación de Seguimiento y Ampliación': 0.080913,
    'Evaluación de Ampliación': 1.091925,
    'Reevaluación y Ampliación': -1.196745
  },
  esquema: {
    'Laboratorio de Ensayo': 0,
    'Laboratorio de Calibración': 0.335832,
    'Laboratorio Clínico': -0.203161,
    'Organismo de Inspección': 1.205513
  },
  numericas: {
    anosAcreditado: 0.01438,
    personal: 0.00248,
    instalaciones: 0.009341,
    areas: 0.194767,
    ncAnteriores: -0.009923,
    testificaciones: -0.003747,
    ubicacion: 0
  }
};

function WAPP_TIME_estimar_(ctx, payload) {
  payload = payload || {};

  const tipoInfo = WAPP_TIME_mapTipo_(payload.tipoEvaluacion);
  const esquema = WAPP_TIME_mapEsquema_(ctx.tipo);

  const personal = WAPP_TIME_int_(payload.personal, 'Personal', 1);
  const instalaciones = WAPP_TIME_int_(payload.sitios, 'Instalaciones', 1);
  const areas = WAPP_TIME_int_(payload.areas, 'Áreas', 1);
  const nc = WAPP_TIME_int_(payload.nc, 'No conformidades anteriores', 0);
  const testificaciones = WAPP_TIME_int_(
    payload.testificaciones == null ? 0 : payload.testificaciones,
    'Testificaciones',
    0
  );

  // El conector original pasa "ciclos acreditados" al campo anosAcreditado
  // del modelo. Se conserva para equivalencia funcional.
  const anosAcreditado = Number(ctx.ciclosAcreditados || 0);

  const m = WAPP_TIME_MODEL;
  const pred =
    m.intercepto +
    (m.tipo[tipoInfo.tipoModelo] || 0) +
    (m.esquema[esquema] || 0) +
    (anosAcreditado * m.numericas.anosAcreditado) +
    (personal * m.numericas.personal) +
    (instalaciones * m.numericas.instalaciones) +
    (areas * m.numericas.areas) +
    (nc * m.numericas.ncAnteriores) +
    (testificaciones * m.numericas.testificaciones);

  const prediccionBase = WAPP_TIME_round_(pred, 4);
  const duracionSugerida = Math.max(1, Math.round(prediccionBase));

  return {
    ok: true,
    tipoModelo: tipoInfo.tipoModelo,
    tipoOriginal: String(payload.tipoEvaluacion || '').trim(),
    estimacionAproximada: tipoInfo.aproximada,
    observacion: tipoInfo.observacion,
    esquemaModelo: esquema,
    prediccionBase: prediccionBase,
    duracionSugerida: duracionSugerida,
    confianza: WAPP_TIME_confianza_({
      tipo: tipoInfo.tipoModelo,
      esquema: esquema,
      instalaciones: instalaciones,
      areas: areas
    }),
    fechaFinalSugerida: payload.fechaInicio
      ? WAPP_TIME_fechaFinalSugerida_(payload.fechaInicio, duracionSugerida)
      : ''
  };
}

function WAPP_TIME_mapTipo_(value) {
  const t = WAPP_norm_(value);

  const exactos = {
    'evaluacion inicial': 'Evaluación Inicial',
    'evaluacion de seguimiento': 'Evaluación de Seguimiento',
    'reevaluacion': 'Reevaluación',
    'evaluacion de seguimiento y ampliacion': 'Evaluación de Seguimiento y Ampliación',
    'evaluacion de ampliacion': 'Evaluación de Ampliación',
    'reevaluacion y ampliacion': 'Reevaluación y Ampliación'
  };

  if (exactos[t]) {
    return {
      tipoModelo: exactos[t],
      aproximada: false,
      observacion: ''
    };
  }

  const aproximables = [
    'revision documental de acciones correctivas',
    'evaluacion de acciones correctivas en sitio',
    'evaluacion de transicion de norma',
    'evaluacion adicional'
  ];

  if (aproximables.includes(t)) {
    return {
      tipoModelo: 'Evaluación de Seguimiento',
      aproximada: true,
      observacion:
        'Tipo no modelado explícitamente; estimación calculada con base en Evaluación de Seguimiento.'
    };
  }

  throw new Error(
    'El tipo de evaluación no puede mapearse al modelo de tiempos: ' + value
  );
}

function WAPP_TIME_mapEsquema_(value) {
  const e = WAPP_norm_(value);

  if (e.includes('ensayo')) return 'Laboratorio de Ensayo';
  if (e.includes('calibr')) return 'Laboratorio de Calibración';
  if (e.includes('clinic')) return 'Laboratorio Clínico';
  if (e.includes('inspeccion')) return 'Organismo de Inspección';

  throw new Error('No se pudo mapear el esquema al modelo de tiempos: ' + value);
}

function WAPP_TIME_int_(value, label, min) {
  const s = String(value == null ? '' : value).trim();
  if (s === '') throw new Error('El campo "' + label + '" es obligatorio.');
  if (!/^\d+$/.test(s)) {
    throw new Error('El campo "' + label + '" debe ser un entero.');
  }
  const n = Number(s);
  if (n < min) {
    throw new Error('El campo "' + label + '" debe ser mayor o igual a ' + min + '.');
  }
  return n;
}

function WAPP_TIME_fechaFinalSugerida_(fechaInicio, duracion) {
  const m = String(fechaInicio || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Fecha inicial inválida.');

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Math.max(0, Number(duracion || 1) - 1));

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function WAPP_TIME_validarFechas_(inicio, fin) {
  const a = String(inicio || '').trim();
  const b = String(fin || '').trim();
  if (!a || !b) throw new Error('Complete las fechas de evaluación.');
  if (b < a) {
    throw new Error('La fecha final no puede ser menor que la fecha inicial.');
  }
  return true;
}

function WAPP_TIME_confianza_(data) {
  let score = 0;
  if (data.areas >= 4) score += 2;
  else if (data.areas >= 2) score += 1;

  if (data.instalaciones >= 2) score += 1;
  if (
    data.tipo === 'Evaluación Inicial' ||
    data.tipo === 'Evaluación de Ampliación'
  ) score += 1;
  if (data.esquema === 'Organismo de Inspección') score += 1;

  if (score >= 4) return 'Alta';
  if (score >= 2) return 'Media';
  return 'Referencial';
}

function WAPP_TIME_round_(num, dec) {
  const p = Math.pow(10, dec || 0);
  return Math.round(num * p) / p;
}

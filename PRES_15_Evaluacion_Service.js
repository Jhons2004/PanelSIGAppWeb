function WAPP_EVAL_catalogoTipos_() {
  return [
    'Evaluación inicial',
    'Evaluación de seguimiento',
    'Evaluación de ampliación',
    'Reevaluación',
    'Reevaluación y ampliación',
    'Evaluación de seguimiento y ampliación',
    'Revisión documental de acciones correctivas',
    'Evaluación de acciones correctivas en sitio',
    'Evaluación de transición de norma',
    'Evaluación adicional'
  ];
}

/**
 * Reglas de tipo de evaluación tomadas del flujo Presupuesto V2:
 * - Inicial en año Inicial
 * - Seguimiento en SG1/SG2/SG3
 * - Reevaluación + AC en año de Reevaluación
 * - AC después del año de Reevaluación
 *
 * V1.1 NO habilita cambio manual: el usuario sólo puede seleccionar
 * tipos permitidos por el programa institucional.
 */
function WAPP_EVAL_resolverPrograma_(ciclo) {
  const anio = new Date().getFullYear();

  if (!ciclo) {
    return {
      anioActual: anio,
      permitidos: [],
      sugerido: '',
      mensaje: 'No se encontró programación del ciclo para este registro.'
    };
  }

  const permitidos = [];
  const inicialYear = WAPP_EVAL_year_(ciclo.inicial);
  const sg1Year = WAPP_EVAL_year_(ciclo.sg1);
  const sg2Year = WAPP_EVAL_year_(ciclo.sg2);
  const sg3Year = WAPP_EVAL_year_(ciclo.sg3);
  const reevaluacionYear = WAPP_EVAL_year_(ciclo.reevaluacion);

  if (inicialYear === anio) {
    permitidos.push('Evaluación inicial');
  }

  if ([sg1Year, sg2Year, sg3Year].includes(anio)) {
    permitidos.push('Evaluación de seguimiento');
  }

  if (reevaluacionYear && anio === reevaluacionYear) {
    permitidos.push(
      'Reevaluación',
      'Revisión documental de acciones correctivas',
      'Evaluación de acciones correctivas en sitio'
    );
  }

  if (reevaluacionYear && anio > reevaluacionYear) {
    permitidos.push(
      'Revisión documental de acciones correctivas',
      'Evaluación de acciones correctivas en sitio'
    );
  }

  const unicos = [...new Set(permitidos)];
  let sugerido = '';
  let mensaje = '';

  if (unicos.length === 1) {
    sugerido = unicos[0];
    mensaje = 'Tipo de evaluación determinado automáticamente: ' + sugerido;
  } else if (unicos.length > 1) {
    sugerido = unicos.includes('Revisión documental de acciones correctivas')
      ? 'Revisión documental de acciones correctivas'
      : unicos[0];
    mensaje = 'Se encontraron múltiples tipos permitidos según la programación del ciclo.';
  } else {
    mensaje = 'No existe coincidencia del año actual con la programación del ciclo.';
  }

  return {
    anioActual: anio,
    permitidos: unicos,
    sugerido: sugerido,
    mensaje: mensaje
  };
}

function WAPP_EVAL_validarTipo_(ctx, tipoEvaluacion, permitirOtrosTipos) {
  const tipo = String(tipoEvaluacion || '').trim();
  if (!tipo) throw new Error('Debe seleccionarse un tipo de evaluación.');

  const permitidos = Array.isArray(ctx.tiposEvaluacionPermitidos)
    ? ctx.tiposEvaluacionPermitidos
    : [];

  if (permitidos.includes(tipo)) {
    return tipo;
  }

  const catalogo = WAPP_EVAL_catalogoTipos_();

  if (permitirOtrosTipos === true && catalogo.includes(tipo)) {
    return tipo;
  }

  if (!permitidos.length) {
    throw new Error(
      'No existe un tipo de evaluación habilitado por el programa para el año actual. ' +
      'Si corresponde una excepción, habilite "Mostrar otros tipos de evaluación".'
    );
  }

  throw new Error(
    'El tipo "' + tipo + '" no está permitido según la programación del ciclo. ' +
    'Si corresponde una excepción, habilite "Mostrar otros tipos de evaluación".'
  );
}

function WAPP_EVAL_year_(value) {
  if (value === null || value === undefined || value === '') return null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return value.getFullYear();
  }

  const s = String(value).trim();

  let m = s.match(/\b(19|20)\d{2}\b/);
  if (m) return Number(m[0]);

  // yyyy-mm-dd
  m = s.match(/^(\d{4})-\d{1,2}-\d{1,2}$/);
  if (m) return Number(m[1]);

  // mm-yy / mm-yyyy / mm/yy
  m = s.match(/^\d{1,2}[-\/](\d{2}|\d{4})$/);
  if (m) return m[1].length === 2 ? Number('20' + m[1]) : Number(m[1]);

  if (/^\d{4}$/.test(s)) return Number(s);
  return null;
}

function WAPP_EVAL_calcularCiclosAcreditados_(acreditadoDesde, anioActual) {
  const anioBase = WAPP_EVAL_year_(acreditadoDesde);
  if (!anioBase) return 0;

  const diferencia = Number(anioActual) - Number(anioBase);
  if (diferencia < 0) return 0;

  // Conserva el criterio del módulo original.
  return Math.floor(diferencia / 4) + 1;
}

/**
 * Revisión documental de acciones correctivas:
 * se registra al finalizar el proceso, por lo que en esta etapa
 * no exige parámetros de fechas de programación.
 */
function WAPP_EVAL_esRevisionDocumentalAC_(tipoEvaluacion) {
  return WAPP_norm_(tipoEvaluacion) ===
    'revision documental de acciones correctivas';
}

function WAPP_EVAL_requiereFechasIngreso_(tipoEvaluacion) {
  // Todos los tipos requieren registrar las fechas como parte del expediente.
  return true;
}

function WAPP_EVAL_autocompletaFechaFinal_(tipoEvaluacion) {
  // La revisión documental de AC se registra al finalizar el proceso:
  // sus fechas se ingresan manualmente y NO se derivan de la predicción.
  return !WAPP_EVAL_esRevisionDocumentalAC_(tipoEvaluacion);
}

// Alias de compatibilidad. En V1.5.3 significa "requiere ingreso de fechas".
function WAPP_EVAL_requiereFechasProgramacion_(tipoEvaluacion) {
  return WAPP_EVAL_requiereFechasIngreso_(tipoEvaluacion);
}


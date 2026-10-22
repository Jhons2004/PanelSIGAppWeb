/** =========================================================
 *  OGA-FAC-078 - Apps Script v8.4 - SPA Edition
 *  ---------------------------------------------------------
 *  Basado en la versión v8.1 que ya funciona en la AppWeb.
 *
 *  IMPORTANTE PARA EL PANEL CENTRAL / SIGA:
 *  - NO incluye doGet().
 *  - NO incluye mostrarPanelFAC078().
 *  - NO incluye mostrarPanelMenu() ni mostrarMenuPrincipal().
 *  - La navegación sigue perteneciendo a Code.gs, igual que en v8.1:
 *      mostrarPanelFAC078() -> cargarVista('FAC078')
 *  - Los helpers internos usan prefijo fac078_ para evitar colisiones.
 *
 *  Mantiene las mejoras v8.4:
 *  - siglas del servidor como prioridad
 *  - nombre_archivo enviado a Python
 *  - req_id / warnings / review / variante
 *  - no genera FAC-078 vacíos
 *  - evita duplicados de evaluador
 *  - guardado general + copia en Acciones Correctivas del OEC
 *  - búsqueda exacta de carpeta por registro
 *  - previsualización de título e historial del OEC
 * ========================================================= */

const FAC078_CONFIG = {
  PYTHON_SERVER: 'https://theosophically-variolitic-pamella.ngrok-free.dev/analizar',

  // Opcional: si luego activas FAC078_API_TOKEN en Python, ponlo aquí
  API_TOKEN: '',

  ID_PLANTILLA: '1LpNf6gtJDP6pn1ZOmWqh-7LFyMBo_b0cnfTNLi8r-5c',
  // Carpeta general donde siempre se guardan los FAC-078 generados
  ID_CARPETA_DESTINO: '13BOPOrKGmNoZuEAp5n1MbBREVATHs59m',

  // Carpeta raíz del sistema donde viven las carpetas de los OEC
  ID_CARPETA_GENERAL_SISTEMA: '1zMjgzmCjjxPxA0oYRe_h7qnbYxr3OJ-8',

  // Subcarpeta dentro de cada OEC donde se copiarán los FAC-078
  NOMBRE_CARPETA_ACCIONES: 'Acciones Correctivas',
  CREAR_CARPETA_ACCIONES_SI_NO_EXISTE: true,

  ASIGNAR_NC_SIN_SIGLAS_A_TODOS: false,

  AUTO_CREAR_EVALUADORES_POR_TOKENS: true,
  ROL_EVALUADOR_INFERIDO: 'Evaluador Técnico (Inferido por NC)',

  VERSION: '8.4-spa-sin-documentos-vacios'
};

/** ============================
 *  HELPERS PYTHON
 * ============================ */
function fac078_getPythonBaseUrl_() {
  return String(FAC078_CONFIG.PYTHON_SERVER || '').replace(/\/analizar\/?$/i, '');
}

function fac078_construirPayloadPython_(payload) {
  const out = Object.assign({}, payload || {});
  if (FAC078_CONFIG.API_TOKEN) out.api_token = FAC078_CONFIG.API_TOKEN;
  return out;
}

function fac078_postPython_(payload) {
  const response = UrlFetchApp.fetch(FAC078_CONFIG.PYTHON_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify(fac078_construirPayloadPython_(payload)),
    muteHttpExceptions: true
  });

  return {
    code: response.getResponseCode(),
    text: response.getContentText() || ''
  };
}

/** ============================
 *  TEST CONEXIÓN
 * ============================ */
function probarConexionNgrokBarryJudy() {
  try {
    const res = fac078_postPython_({ archivo: 'TEST_CONNECTIVITY' });
    Logger.log(`📡 [TEST] HTTP ${res.code} :: ${res.text.slice(0, 300)}`);
    return res.code === 200;
  } catch (e) {
    Logger.log('❌ [TEST] ' + e.message);
    return false;
  }
}

/** ============================
 *  EXTRACCIÓN (desde Python)
 * ============================ */
function extraerDatosFAC078BarryJudy(base64PDF, nombreArchivo) {
  const t0 = Date.now();

  if (!base64PDF || String(base64PDF).length < 50) {
    throw new Error('PDF base64 inválido o vacío');
  }

  const res = fac078_postPython_({
    archivo: base64PDF,
    nombre_archivo: nombreArchivo || 'FAC-014.pdf'
  });

  if (res.code !== 200) {
    Logger.log(`❌ [PY] HTTP ${res.code}: ${res.text.slice(0, 500)}`);
    throw new Error(`Error servidor Python: HTTP ${res.code}`);
  }

  let json;
  try {
    json = JSON.parse(res.text);
  } catch (e) {
    Logger.log(`❌ [PY] JSON inválido: ${e.message}`);
    Logger.log(res.text.slice(0, 600));
    throw new Error('Respuesta del servidor no es JSON válido');
  }

  if (!json || !json.datos) throw new Error('Sin datos en respuesta del servidor');

  const d = json.datos;

  // ✅ Evaluadores: usar sigla del servidor como prioridad
  let evaluadores = Array.isArray(d.evaluadores)
    ? d.evaluadores.map(ev => {
        const sigServer = (ev.siglas || '').toUpperCase().trim();
        return {
          nombre: ev.nombre || '',
          rol: ev.rol || '',
          siglas_server: sigServer,
          siglas: sigServer || generarSiglasFAC078_(ev.nombre || '')
        };
      })
    : [];

  const ncs = Array.isArray(d.no_conformidades)
    ? d.no_conformidades.map(nc => ({
        nc: nc.nc || '',
        requisito: nc.requisito || '',
        descripcion: nc.descripcion || '',
        estado: nc.estado || '',
        evaluador_siglas: nc.evaluador_siglas || ''
      }))
    : [];

  let evaluadoresValidos = evaluadores.filter(ev =>
    !String(ev.rol || '').toLowerCase().includes('representante del oec')
  );

  // 1) Asignación inicial
  let asignacion = fac078_construirAsignacion_(evaluadoresValidos, ncs);
  const tokensInicialesNoEval = (asignacion.tokensNoEvaluador || []).slice();

  // 2) Crear evaluadores inferidos por tokens faltantes
  let evaluadoresInferidos = [];
  if (FAC078_CONFIG.AUTO_CREAR_EVALUADORES_POR_TOKENS && tokensInicialesNoEval.length) {
    evaluadoresInferidos = fac078_crearInferidos_(tokensInicialesNoEval);
    evaluadores = evaluadores.concat(evaluadoresInferidos);
    evaluadoresValidos = evaluadoresValidos.concat(evaluadoresInferidos);

    asignacion = fac078_construirAsignacion_(evaluadoresValidos, ncs);
    asignacion.tokensNoEvaluador_inicial = tokensInicialesNoEval;
    asignacion.evaluadores_inferidos = evaluadoresInferidos.map(e => ({
      nombre: e.nombre, siglas: e.siglas, rol: e.rol
    }));
  } else {
    asignacion.tokensNoEvaluador_inicial = tokensInicialesNoEval;
    asignacion.evaluadores_inferidos = [];
  }

  const resultado = {
    registro: d.registro || '',
    oec: d.organismo_evaluado || 'No encontrado',
    tipo: d.tipo_evaluacion || '',
    fecha: d.fecha_evaluacion || '',
    evaluadores,
    ncs,
    asignacion,
    metodo: d.metodo || 'python',
    req_id: (json.stats && json.stats.req_id) || '',
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
    review: d.review || {},
    variante: d.variante || {},
    stats: {
      tiempo_total_seg: Math.round((Date.now() - t0) / 1000),
      evaluadores_encontrados: evaluadores.length,
      evaluadores_validos: evaluadoresValidos.length,
      evaluadores_inferidos: evaluadoresInferidos.length,
      ncs_encontradas: ncs.length,
      ncs_sin_siglas: (asignacion.sinSiglas || []).length,
      ncs_no_asignadas: (asignacion.noAsignadas || []).length,
      tokens_no_evaluador_inicial: (tokensInicialesNoEval || []).length,
      servidor_req_id: (json.stats && json.stats.req_id) || '',
      servidor_tiempo: (json.stats && json.stats.tiempo) || null
    }
  };

  Logger.log(`✅ [EXTRACCIÓN] req_id=${resultado.req_id} eval_total=${evaluadores.length} inferidos=${evaluadoresInferidos.length} ncs=${ncs.length} no_asig=${(asignacion.noAsignadas||[]).length}`);
  if (resultado.warnings.length) {
    Logger.log(`⚠️ [WARNINGS] ${resultado.warnings.join(' | ')}`);
  }
  return resultado;
}

/** =========================================================
 *  FILTRO DE GENERACIÓN
 *  ---------------------------------------------------------
 *  Regla principal:
 *  - Solo se genera FAC-078 para evaluadores que tengan 1 o más NC reales.
 *  - Evaluadores con 0 NC quedan en "omitidos".
 *  - Evaluadores repetidos por las mismas siglas no generan duplicado.
 * ========================================================= */
function fac078_obtenerEvaluadoresConNC_(evaluadoresValidos, asignacion) {
  const generables = [];
  const omitidos = [];
  const vistos = new Set();

  (evaluadoresValidos || []).forEach(ev => {
    const sigNormalizada = fac078_normalizarSiglasEvaluador_(ev);
    const key = sigNormalizada || fac078_normalizarBusquedaCarpeta_(ev && ev.nombre);

    if (key && vistos.has(key)) {
      omitidos.push({
        evaluador: (ev && ev.nombre) || '',
        siglas: sigNormalizada,
        ncs_asignadas: 0,
        motivo: 'Evaluador repetido por las mismas siglas; se evita duplicar documento'
      });
      return;
    }

    if (key) vistos.add(key);

    const ncsAsignadas = fac078_obtenerNCsAsignadasParaEvaluador_(ev, asignacion);

    if (!ncsAsignadas.length) {
      omitidos.push({
        evaluador: (ev && ev.nombre) || '',
        siglas: sigNormalizada,
        ncs_asignadas: 0,
        motivo: 'Sin NC asignadas; no se genera documento vacío'
      });
      return;
    }

    generables.push({
      ev,
      siglas: sigNormalizada,
      ncs: ncsAsignadas
    });
  });

  return { generables, omitidos };
}

function fac078_obtenerNCsAsignadasParaEvaluador_(ev, asignacion) {
  const porEvaluador = (asignacion && asignacion.porEvaluador) || {};
  const sigRaw = (ev && ev.siglas) || generarSiglasFAC078_((ev && ev.nombre) || '');
  const sigNorm = fac078_normalizarSiglas_(sigRaw);
  const tokens = fac078_siglasToTokens_(sigNorm);
  let arr = [];

  // Caso normal: una sigla por evaluador.
  if (sigNorm && Array.isArray(porEvaluador[sigNorm])) {
    arr = arr.concat(porEvaluador[sigNorm]);
  }

  // Caso tolerante: si el evaluador trae varias siglas, se unen sin duplicar.
  tokens.forEach(t => {
    if (Array.isArray(porEvaluador[t])) arr = arr.concat(porEvaluador[t]);
  });

  return fac078_dedupe_(arr).filter(fac078_ncTieneContenido_);
}

function fac078_normalizarSiglasEvaluador_(ev) {
  const raw = (ev && ev.siglas) || generarSiglasFAC078_((ev && ev.nombre) || '');
  const norm = fac078_normalizarSiglas_(raw);
  return norm || String(raw || '').toUpperCase().trim();
}

function fac078_ncTieneContenido_(nc) {
  if (!nc) return false;
  return [
    nc.nc,
    nc.requisito,
    nc.descripcion,
    nc.estado,
    nc.evaluador_siglas
  ].some(v => String(v || '').replace(/\u00A0/g, ' ').trim() !== '');
}


/** ============================
 *  GENERACIÓN FAC-078
 * ============================ */
function generarFAC078BarryJudy(datos) {
  Logger.log(`⚙️ [GEN ${FAC078_CONFIG.VERSION}] Iniciando generación sin documentos vacíos...`);

  const registro = (datos && datos.registro) || '';
  const oec = (datos && datos.oec) || '';
  const tipo = (datos && datos.tipo) || '';
  const fecha = (datos && datos.fecha) || '';
  const evaluadores = (datos && datos.evaluadores) || [];
  const ncs = (datos && datos.ncs) || [];

  if (!registro || !Array.isArray(evaluadores) || evaluadores.length === 0) {
    throw new Error('Datos insuficientes para generar FAC-078');
  }

  const evaluadoresValidos = evaluadores.filter(ev =>
    !String(ev.rol || '').toLowerCase().includes('representante del oec')
  );

  if (!evaluadoresValidos.length) {
    throw new Error('No se encontraron evaluadores válidos para generar FAC-078');
  }

  const asignacion = datos.asignacion && datos.asignacion.porEvaluador
    ? datos.asignacion
    : fac078_construirAsignacion_(evaluadoresValidos, ncs);

  const filtroGeneracion = fac078_obtenerEvaluadoresConNC_(evaluadoresValidos, asignacion);
  const documentosGenerables = filtroGeneracion.generables || [];
  const omitidos = filtroGeneracion.omitidos || [];
  const tituloBase = construirTituloBaseFAC078_(datos);

  Logger.log(`🧹 [FILTRO] generables=${documentosGenerables.length} omitidos=${omitidos.length} ncs_total=${(ncs || []).length}`);

  // ✅ Regla nueva: si nadie tiene NC reales asignadas, no se crea ningún documento.
  // No se toca Drive, no se copia plantilla y no se crean documentos vacíos.
  if (!documentosGenerables.length) {
    return {
      mensaje: '⚠️ No se generó ningún FAC-078 porque no hay evaluadores con NC asignadas.',
      archivos: [],
      omitidos,
      titulo_base: tituloBase,
      guardado: {
        carpeta_general: null,
        carpeta_oec: null,
        carpeta_acciones_correctivas: null,
        fac078_en_acciones_correctivas: []
      },
      proceso: [
        {
          paso: 0,
          estado: 'WARN',
          mensaje: 'Extracción válida, pero todos los evaluadores tienen 0 NC asignadas. Se evita generar documentos vacíos.'
        }
      ],
      resumen: {
        ncs_total: (ncs || []).length,
        documentos_generados: 0,
        documentos_omitidos: omitidos.length,
        ncs_no_asignadas: (asignacion.noAsignadas || []).length,
        ncs_sin_siglas: (asignacion.sinSiglas || []).length,
        tokens_no_evaluador_inicial: asignacion.tokensNoEvaluador_inicial || [],
        evaluadores_inferidos: asignacion.evaluadores_inferidos || [],
        req_id: (datos && datos.req_id) || ''
      }
    };
  }

  const plantilla = DriveApp.getFileById(FAC078_CONFIG.ID_PLANTILLA);
  const carpetaGeneralFAC078 = DriveApp.getFolderById(FAC078_CONFIG.ID_CARPETA_DESTINO);

  const proceso = [];
  proceso.push({
    paso: 1,
    estado: 'OK',
    mensaje: 'Carpeta general OGA-FAC-078 localizada',
    carpeta_id: FAC078_CONFIG.ID_CARPETA_DESTINO
  });

  let ubicacionOEC = null;
  let carpetaAcciones = null;

  try {
    ubicacionOEC = fac078_resolverCarpetaAccionesOEC_(registro);
    carpetaAcciones = ubicacionOEC.carpetaAcciones;
    proceso.push({
      paso: 2,
      estado: 'OK',
      mensaje: ubicacionOEC.carpetaAccionesCreada
        ? `Carpeta del OEC encontrada y se creó "${FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES}"`
        : `Carpeta del OEC encontrada y "${FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES}" localizada`,
      carpeta_oec: ubicacionOEC.carpetaOEC.getName(),
      carpeta_oec_url: ubicacionOEC.carpetaOEC.getUrl(),
      carpeta_acciones_url: carpetaAcciones.getUrl()
    });
  } catch (e) {
    proceso.push({
      paso: 2,
      estado: 'ERROR',
      mensaje: 'No fue posible resolver la carpeta del OEC / Acciones Correctivas',
      detalle: e.message
    });
    throw new Error(`No se pudo guardar en carpeta del OEC: ${e.message}`);
  }

  const resultados = [];

  for (const item of documentosGenerables) {
    const ev = item.ev;
    const sig = item.siglas || fac078_normalizarSiglasEvaluador_(ev);
    const ncsAsignadas = item.ncs || [];

    // Seguridad adicional: aunque ya viene filtrado, nunca generar con 0 NC.
    if (!ncsAsignadas.length) {
      omitidos.push({
        evaluador: ev.nombre || '',
        siglas: sig,
        ncs_asignadas: 0,
        motivo: 'Sin NC asignadas al momento de generar'
      });
      continue;
    }

    const tituloDocumento = construirTituloFAC078_(datos, Object.assign({}, ev, { siglas: sig }));

    // 1) Crear y guardar primero en carpeta general OGA-FAC-078
    const copiaGeneral = plantilla.makeCopy(tituloDocumento, carpetaGeneralFAC078);

    const doc = DocumentApp.openById(copiaGeneral.getId());
    const body = doc.getBody();

    body.replaceText('<<registro_acreditacion>>', registro || '');
    body.replaceText('<<oec>>', oec || '');
    body.replaceText('<<fecha_evaluacion>>', fecha || '');
    body.replaceText('<<tipo_evaluacion>>', tipo || '');
    body.replaceText('<<evaluador>>', ev.nombre || '');
    body.replaceText('<<personal_formacion>>', '');

    fac078_insertarTabla_(body, ncsAsignadas);
    doc.saveAndClose();

    // 2) Luego copiar el documento finalizado hacia la carpeta Acciones Correctivas del OEC
    const copiaOEC = copiaGeneral.makeCopy(tituloDocumento, carpetaAcciones);

    resultados.push({
      evaluador: ev.nombre,
      siglas: sig,
      titulo: tituloDocumento,
      titulo_base: tituloBase,
      url: copiaGeneral.getUrl(),
      id_general: copiaGeneral.getId(),
      url_general: copiaGeneral.getUrl(),
      id_oec: copiaOEC.getId(),
      url_oec: copiaOEC.getUrl(),
      carpeta_oec: ubicacionOEC.carpetaOEC.getName(),
      carpeta_oec_url: ubicacionOEC.carpetaOEC.getUrl(),
      carpeta_acciones: carpetaAcciones.getName(),
      carpeta_acciones_url: carpetaAcciones.getUrl(),
      ncs_asignadas: ncsAsignadas.length
    });
  }

  proceso.push({
    paso: 3,
    estado: 'OK',
    mensaje: `Se generaron ${resultados.length} FAC-078. Se omitieron ${omitidos.length} evaluadores sin NC o repetidos.`
  });

  proceso.push({
    paso: 4,
    estado: 'OK',
    mensaje: `Se copiaron ${resultados.length} FAC-078 en la carpeta Acciones Correctivas del OEC`
  });

  const existentesAcciones = fac078_listarEnCarpeta_(carpetaAcciones, 250);

  return {
    mensaje: `✅ Se generaron ${resultados.length} FAC-078. Omitidos sin NC/repetidos: ${omitidos.length}.`,
    archivos: resultados,
    omitidos,
    titulo_base: tituloBase,
    guardado: {
      carpeta_general: {
        id: FAC078_CONFIG.ID_CARPETA_DESTINO,
        url: carpetaGeneralFAC078.getUrl(),
        nombre: carpetaGeneralFAC078.getName()
      },
      carpeta_oec: {
        id: ubicacionOEC.carpetaOEC.getId(),
        url: ubicacionOEC.carpetaOEC.getUrl(),
        nombre: ubicacionOEC.carpetaOEC.getName()
      },
      carpeta_acciones_correctivas: {
        id: carpetaAcciones.getId(),
        url: carpetaAcciones.getUrl(),
        nombre: carpetaAcciones.getName(),
        creada: !!ubicacionOEC.carpetaAccionesCreada
      },
      fac078_en_acciones_correctivas: existentesAcciones
    },
    proceso,
    resumen: {
      ncs_total: (ncs || []).length,
      documentos_generados: resultados.length,
      documentos_omitidos: omitidos.length,
      ncs_no_asignadas: (asignacion.noAsignadas || []).length,
      ncs_sin_siglas: (asignacion.sinSiglas || []).length,
      tokens_no_evaluador_inicial: asignacion.tokensNoEvaluador_inicial || [],
      evaluadores_inferidos: asignacion.evaluadores_inferidos || [],
      req_id: (datos && datos.req_id) || ''
    }
  };
}

/** ============================
 *  TABLA FAC-078
 * ============================ */
function fac078_insertarTabla_(body, ncs) {
  const start = body.findText('<<INICIO_TABLA_NC>>');
  const end = body.findText('<<FIN_TABLA_NC>>');
  if (!start || !end) throw new Error('Marcadores no encontrados (<<INICIO_TABLA_NC>> / <<FIN_TABLA_NC>>)');

  function obtenerPadre_(el) {
    while (el && el.getParent() && el.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      el = el.getParent();
    }
    return el;
  }

  const startTop = obtenerPadre_(start.getElement());
  const endTop = obtenerPadre_(end.getElement());
  const startIdx = body.getChildIndex(startTop);
  const endIdx = body.getChildIndex(endTop);

  for (let i = endIdx - 1; i > startIdx; i--) body.removeChild(body.getChild(i));

  const encabezados = [
    'NC', 'Requisito', 'Descripción',
    'Fecha 1ra respuesta / 2da respuesta',
    'Acciones Correctivas',
    'Acciones Presentadas para el Análisis de Extensión',
    'Fecha Resolución Evaluador',
    'Resolución del Evaluador'
  ];

  const filas = [encabezados];

  if (Array.isArray(ncs) && ncs.length) {
    ncs.forEach(nc => {
      filas.push([nc.nc || '', nc.requisito || '', nc.descripcion || '', '', '', '', '', '']);
      filas.push(['', '', '', '', '', '', '', '']);
    });
  } else {
    for (let i = 0; i < 3; i++) filas.push(['', '', '', '', '', '', '', '']);
  }

  const tabla = body.insertTable(startIdx + 1, filas);
  body.removeChild(endTop);
  body.removeChild(startTop);

  const headerRow = tabla.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) {
    headerRow.getCell(c).editAsText().setBold(true);
  }
}


/** =========================================================
 *  GUARDADO PARALELO / CARPETAS OEC
 * ========================================================= */
function construirTituloBaseFAC078_(datos) {
  const tipo = fac078_limpiarNombreArchivo_(
    (datos && datos.tipo) || 'SIN_TIPO'
  );

  const registro = fac078_limpiarNombreArchivo_(
    (datos && datos.registro) || 'SIN_REGISTRO'
  );

  const fechaInicio = fac078_limpiarNombreArchivo_(
    fac078_normalizarFechaArchivo_(
      (datos && (
        datos.fecha_inicio_evaluacion ||
        datos.fechaInicioEvaluacion ||
        datos.fecha
      )) || ''
    )
  );

  return `OGA-FAC-078-${tipo}-${registro}-${fechaInicio || 'SIN_FECHA'}`;
}


function construirTituloFAC078_(datos, ev) {
  const base = construirTituloBaseFAC078_(datos);
  const sig = fac078_limpiarNombreArchivo_(((ev && ev.siglas) || generarSiglasFAC078_((ev && ev.nombre) || '') || 'EV').toUpperCase());
  return `${base}-${sig}`;
}

function fac078_limpiarNombreArchivo_(valor) {
  return String(valor || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[<>:"/\\|?*\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 140);
}

function fac078_normalizarFechaArchivo_(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return '';

  // dd/mm/yyyy o dd-mm-yyyy => yyyy-mm-dd
  const m1 = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m1) {
    const dd = ('0' + m1[1]).slice(-2);
    const mm = ('0' + m1[2]).slice(-2);
    const yyyy = m1[3].length === 2 ? ('20' + m1[3]) : m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // yyyy/mm/dd o yyyy-mm-dd => yyyy-mm-dd
  const m2 = raw.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (m2) {
    const yyyy = m2[1];
    const mm = ('0' + m2[2]).slice(-2);
    const dd = ('0' + m2[3]).slice(-2);
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
}

function fac078_resolverCarpetaAccionesOEC_(registro) {

  const registroOriginal = String(registro || '').trim();

  if (!registroOriginal) {
    throw new Error(
      'No se recibió registro de acreditación para localizar la carpeta del OEC.'
    );
  }

  const registroNormalizado =
    fac078_normalizarBusquedaCarpeta_(registroOriginal);

  const raiz = DriveApp.getFolderById(
    FAC078_CONFIG.ID_CARPETA_GENERAL_SISTEMA
  );

  Logger.log('========================================');
  Logger.log('🔎 BÚSQUEDA CARPETA OEC');
  Logger.log('Registro recibido: ' + registroOriginal);
  Logger.log('Registro normalizado: ' + registroNormalizado);
  Logger.log('Raíz: ' + raiz.getName());
  Logger.log('Raíz ID: ' + raiz.getId());
  Logger.log('========================================');

  const carpetaOEC =
    fac078_buscarCarpetaRegistro_(
      raiz,
      registroOriginal,
      0,
      6
    );

  if (!carpetaOEC) {
    throw new Error(
      'No se encontró una carpeta cuyo nombre corresponda EXACTAMENTE al registro: ' +
      registroOriginal
    );
  }

  const nombreEncontrado = carpetaOEC.getName();

  const nombreEncontradoNormalizado =
    fac078_normalizarBusquedaCarpeta_(nombreEncontrado);

  // SEGUNDA VALIDACIÓN DE SEGURIDAD
  if (nombreEncontradoNormalizado !== registroNormalizado) {

    throw new Error(
      'SEGURIDAD FAC-078: se esperaba la carpeta "' +
      registroOriginal +
      '" pero la búsqueda devolvió "' +
      nombreEncontrado +
      '". Se canceló el guardado.'
    );
  }

  Logger.log(
    '✅ CARPETA OEC CORRECTA: ' +
    nombreEncontrado +
    ' | ID=' +
    carpetaOEC.getId()
  );

  let carpetaAcciones =
    fac078_buscarSubcarpetaNombre_(
      carpetaOEC,
      FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES
    );

  let creada = false;

  if (!carpetaAcciones) {

    if (!FAC078_CONFIG.CREAR_CARPETA_ACCIONES_SI_NO_EXISTE) {
      throw new Error(
        'La carpeta "' +
        registroOriginal +
        '" existe, pero no contiene "' +
        FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES +
        '".'
      );
    }

    carpetaAcciones =
      carpetaOEC.createFolder(
        FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES
      );

    creada = true;

    Logger.log(
      '📁 Se creó "' +
      FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES +
      '" dentro de ' +
      nombreEncontrado
    );
  }

  Logger.log(
    '✅ ACCIONES CORRECTIVAS: ' +
    carpetaAcciones.getName() +
    ' | ID=' +
    carpetaAcciones.getId()
  );

  return {
    carpetaOEC: carpetaOEC,
    carpetaAcciones: carpetaAcciones,
    carpetaAccionesCreada: creada
  };
}

function fac078_buscarCarpetaRegistro_(carpeta, registro, nivel, maxNivel) {
  const objetivo = fac078_normalizarBusquedaCarpeta_(registro);

  if (!objetivo) {
    throw new Error('Registro de acreditación vacío para búsqueda de carpeta.');
  }

  if (nivel > maxNivel) return null;

  // Nombre completo de la carpeta actual
  const nombreActual = fac078_normalizarBusquedaCarpeta_(carpeta.getName());

  // ÚNICA CONDICIÓN VÁLIDA:
  // el nombre completo debe coincidir exactamente con el registro.
  if (nombreActual === objetivo) {
    return carpeta;
  }

  const subcarpetas = carpeta.getFolders();

  while (subcarpetas.hasNext()) {
    const sub = subcarpetas.next();

    const nombreSub = fac078_normalizarBusquedaCarpeta_(sub.getName());

    // Primero verificamos coincidencia exacta.
    if (nombreSub === objetivo) {
      return sub;
    }

    // Si no coincide, seguimos buscando en niveles inferiores.
    const encontrado = fac078_buscarCarpetaRegistro_(
      sub,
      registro,
      nivel + 1,
      maxNivel
    );

    if (encontrado) {
      return encontrado;
    }
  }

  return null;
}

function fac078_buscarSubcarpetaNombre_(carpetaPadre, nombreBuscado) {
  const objetivo = fac078_normalizarNombreCarpeta_(nombreBuscado);

  const directas = carpetaPadre.getFolders();
  while (directas.hasNext()) {
    const f = directas.next();
    if (fac078_normalizarNombreCarpeta_(f.getName()) === objetivo) return f;
  }

  // Segundo intento tolerante por si trae espacios dobles o acentos distintos
  const directas2 = carpetaPadre.getFolders();
  while (directas2.hasNext()) {
    const f = directas2.next();
    if (fac078_normalizarNombreCarpeta_(f.getName()).indexOf(objetivo) !== -1) return f;
  }

  return null;
}

function fac078_listarEnCarpeta_(carpeta, limite) {
  const out = [];
  const files = carpeta.getFiles();
  const max = limite || 200;

  while (files.hasNext() && out.length < max) {
    const file = files.next();
    const nombre = file.getName() || '';
    if (nombre.toUpperCase().indexOf('OGA-FAC-078') === -1) continue;

    out.push({
      nombre,
      url: file.getUrl(),
      id: file.getId(),
      fecha_creacion: file.getDateCreated() ? file.getDateCreated().toISOString() : '',
      ultima_actualizacion: file.getLastUpdated() ? file.getLastUpdated().toISOString() : '',
      mime_type: file.getMimeType()
    });
  }

  out.sort((a, b) => {
    const da = a.ultima_actualizacion ? new Date(a.ultima_actualizacion).getTime() : 0;
    const db = b.ultima_actualizacion ? new Date(b.ultima_actualizacion).getTime() : 0;
    return db - da;
  });

  return out;
}

function fac078_normalizarBusquedaCarpeta_(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^A-Z0-9]+/g, '');
}

function fac078_normalizarNombreCarpeta_(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function previsualizarTituloFAC078(datos) {
  return {
    titulo_base: construirTituloBaseFAC078_(datos || {}),
    ejemplo_con_siglas: construirTituloFAC078_(datos || {}, { nombre: 'Evaluador Ejemplo', siglas: 'EV' })
  };
}

function listarFAC078AccionesCorrectivasPorRegistro(registro) {
  const ubicacion = fac078_resolverCarpetaAccionesOEC_(registro);
  return {
    carpeta_oec: {
      nombre: ubicacion.carpetaOEC.getName(),
      url: ubicacion.carpetaOEC.getUrl(),
      id: ubicacion.carpetaOEC.getId()
    },
    carpeta_acciones_correctivas: {
      nombre: ubicacion.carpetaAcciones.getName(),
      url: ubicacion.carpetaAcciones.getUrl(),
      id: ubicacion.carpetaAcciones.getId(),
      creada: !!ubicacion.carpetaAccionesCreada
    },
    archivos: fac078_listarEnCarpeta_(ubicacion.carpetaAcciones, 250)
  };
}

/** ============================
 *  SNAPSHOT SERVIDOR PARA HTML
 * ============================ */
function obtenerSnapshotServidorFAC078(reqId, limit) {
  const base = fac078_getPythonBaseUrl_();
  const out = {
    health: fac078_fetchJsonSafe_(base + '/health'),
    review_detail: null,
    review_queue: fac078_fetchJsonSafe_(base + '/review/queue?include_auto=1&limit=' + (limit || 8)),
    regression_latest: fac078_fetchJsonSafe_(base + '/regression/latest')
  };

  if (reqId) {
    out.review_detail = fac078_fetchJsonSafe_(base + '/review/' + encodeURIComponent(reqId));
  }

  return out;
}

function fac078_fetchJsonSafe_(url) {
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const text = response.getContentText() || '';
    if (code < 200 || code >= 300) {
      return { ok: false, code, error: text.slice(0, 300) };
    }
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/** =========================================================
 *  ASIGNACIÓN COMPLETA + INFERIDOS
 * ========================================================= */
function fac078_construirAsignacion_(evaluadoresValidos, ncs) {
  const evalSigSet = new Set();
  const porEvaluador = {};

  (evaluadoresValidos || []).forEach(ev => {
    const sig = (ev.siglas || generarSiglasFAC078_(ev.nombre)).toUpperCase().trim();
    if (!sig) return;
    evalSigSet.add(sig);
    porEvaluador[sig] = [];
  });

  const sinSiglas = [];
  const noAsignadas = [];
  const tokensDoc = new Set();

  (ncs || []).forEach(nc => {
    const tokens = fac078_tokensDeNC_(nc);
    tokens.forEach(t => tokensDoc.add(t));

    if (!tokens.length) {
      sinSiglas.push(nc);
      if (FAC078_CONFIG.ASIGNAR_NC_SIN_SIGLAS_A_TODOS) {
        evalSigSet.forEach(s => porEvaluador[s].push(nc));
      } else {
        noAsignadas.push(nc);
      }
      return;
    }

    let assigned = false;
    tokens.forEach(t => {
      if (evalSigSet.has(t)) {
        porEvaluador[t].push(nc);
        assigned = true;
      }
    });
    if (!assigned) noAsignadas.push(nc);
  });

  Object.keys(porEvaluador).forEach(sig => {
    porEvaluador[sig] = fac078_dedupe_(porEvaluador[sig]);
  });

  const tokensNoEvaluador = [...tokensDoc].filter(t => !evalSigSet.has(t));

  return {
    porEvaluador,
    sinSiglas: fac078_dedupe_(sinSiglas),
    noAsignadas: fac078_dedupe_(noAsignadas),
    tokensNoEvaluador
  };
}

function fac078_crearInferidos_(tokensNoEval) {
  const out = [];
  (tokensNoEval || []).forEach(t => {
    const sig = String(t || '').toUpperCase().trim();
    if (!sig) return;
    out.push({
      nombre: `Evaluador ${sig} (Inferido por NC)`,
      rol: FAC078_CONFIG.ROL_EVALUADOR_INFERIDO,
      siglas_server: '',
      siglas: sig
    });
  });
  return out;
}

/** =========================================================
 *  SIGLAS / TOKENS
 * ========================================================= */
function fac078_normalizarSiglas_(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[,;|]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
    .replace(/[^A-Z0-9/]/g, '');
}

function fac078_siglasToTokens_(sigStr) {
  const s = fac078_normalizarSiglas_(sigStr);
  if (!s) return [];
  return s.split('/').filter(Boolean).filter(t => /^[A-Z0-9]{2,6}$/.test(t));
}

function fac078_tokensDeNC_(ncObj) {
  const fromServer = fac078_normalizarSiglas_(ncObj && ncObj.evaluador_siglas ? ncObj.evaluador_siglas : '');
  const fromId = fac078_normalizarSiglas_(fac078_extraerSiglasNC_(ncObj && ncObj.nc ? ncObj.nc : ''));
  return fac078_siglasToTokens_(fromServer || fromId);
}

function fac078_extraerSiglasNC_(ncId) {
  const raw = String(ncId || '');
  const id = raw
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!id) return '';
  const m = id.match(/(?:\bNC\b\s*-\s*)?([A-Z0-9]{2,6}(?:\s*\/\s*[A-Z0-9]{2,6}){0,30})\s*-\s*(\d{1,4})\b/i);
  if (!m || !m[1]) return '';
  return m[1].replace(/\s*\/\s*/g, '/').replace(/\s+/g, '');
}

function generarSiglasFAC078_(nombre) {
  const raw = String(nombre || '').replace(/\u00A0/g, ' ').trim();
  if (!raw) return 'XX';
  const titulos = new Set(['MSC','MTR','MAG','LIC','LICDA','LCDA','ING','INGA','DR','DRA','SR','SRA','MR','MS']);
  let parts = raw.split(/\s+/).filter(Boolean).map(p => p.replace(/\.+$/, ''));
  while (parts.length && titulos.has(parts[0].toUpperCase())) parts.shift();
  if (!parts.length) return 'XX';
  const apellido = (parts.length >= 3) ? parts[parts.length - 2] : parts[parts.length - 1];
  return (parts[0][0] + apellido[0]).toUpperCase();
}

function fac078_dedupe_(arr) {
  const out = [];
  const seen = new Set();
  (arr || []).forEach(nc => {
    const id = String(nc && nc.nc ? nc.nc : '').trim().toUpperCase();
    if (!id) return;
    const desc = String(nc && nc.descripcion ? nc.descripcion : '').trim().toLowerCase().slice(0, 160);
    const key = id + '|' + desc;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(nc);
  });
  return out;
}

/** ============================
 *  HELPERS OPCIONALES
 * ============================ */
function obtenerReviewQueueFAC078(limit) {
  const url = fac078_getPythonBaseUrl_() + '/review/queue?include_auto=1&limit=' + (limit || 20);
  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  if (code !== 200) throw new Error(`Review queue HTTP ${code}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function obtenerUltimaRegresionFAC078() {
  const url = fac078_getPythonBaseUrl_() + '/regression/latest';
  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  if (code !== 200) throw new Error(`Regression latest HTTP ${code}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** ============================
 *  ALIAS para tu HTML
 * ============================ */
function extraerDatosFAC078Optimizado(base64PDF, nombreArchivo) {
  return extraerDatosFAC078BarryJudy(base64PDF, nombreArchivo);
}
function generarFAC078Optimizado(datos) { return generarFAC078BarryJudy(datos); }
function probarConexionLocal() { return probarConexionNgrokBarryJudy(); }
function verificarConfiguracion() { return { ok: true, version: FAC078_CONFIG.VERSION }; }
function monitorearServidor() { return { ok: true }; }

function QA_validarRaizFAC078() {

  const raiz = DriveApp.getFolderById(
    FAC078_CONFIG.ID_CARPETA_GENERAL_SISTEMA
  );

  Logger.log('==============================');
  Logger.log('RAÍZ CONFIGURADA FAC-078');
  Logger.log('Nombre: ' + raiz.getName());
  Logger.log('ID: ' + raiz.getId());
  Logger.log('URL: ' + raiz.getUrl());
  Logger.log('==============================');
}

function QA_PROBAR_BUSQUEDA_OEC_006_04() {

  const registro = 'OGA-LE-006-04';

  Logger.log('==============================================');
  Logger.log('🧪 PRUEBA DE BÚSQUEDA FAC-078');
  Logger.log('==============================================');

  const raiz = DriveApp.getFolderById(
    FAC078_CONFIG.ID_CARPETA_GENERAL_SISTEMA
  );

  Logger.log('📁 Raíz configurada: ' + raiz.getName());
  Logger.log('📁 Raíz ID: ' + raiz.getId());

  const objetivo = fac078_normalizarBusquedaCarpeta_(registro);

  Logger.log('----------------------------------------------');
  Logger.log('🔎 Registro solicitado: ' + registro);
  Logger.log('🔎 Registro normalizado: ' + objetivo);
  Logger.log('----------------------------------------------');

  const carpetaEncontrada =
    fac078_buscarCarpetaRegistro_(
      raiz,
      registro,
      0,
      6
    );

  if (!carpetaEncontrada) {

    Logger.log('❌ RESULTADO: NO ENCONTRADO');
    Logger.log(
      'No se encontró una carpeta exacta para: ' +
      registro
    );

    throw new Error(
      'No se encontró carpeta para ' + registro
    );
  }

  const nombreEncontrado =
    carpetaEncontrada.getName();

  const encontradoNormalizado =
    fac078_normalizarBusquedaCarpeta_(
      nombreEncontrado
    );

  Logger.log('✅ CARPETA ENCONTRADA');
  Logger.log('Nombre: ' + nombreEncontrado);
  Logger.log('ID: ' + carpetaEncontrada.getId());
  Logger.log('URL: ' + carpetaEncontrada.getUrl());
  Logger.log(
    'Normalizado encontrado: ' +
    encontradoNormalizado
  );

  Logger.log('----------------------------------------------');

  if (encontradoNormalizado !== objetivo) {

    Logger.log('❌ PRUEBA FALLIDA');
    Logger.log(
      'Esperado: ' + objetivo
    );
    Logger.log(
      'Encontrado: ' + encontradoNormalizado
    );

    throw new Error(
      'CARPETA INCORRECTA. ' +
      'Se esperaba "' +
      registro +
      '" pero se obtuvo "' +
      nombreEncontrado +
      '".'
    );
  }

  Logger.log('✅ COINCIDENCIA EXACTA CONFIRMADA');

  // Buscar Acciones Correctivas SIN crearla
  const carpetaAcciones =
    fac078_buscarSubcarpetaNombre_(
      carpetaEncontrada,
      FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES
    );

  if (carpetaAcciones) {

    Logger.log('----------------------------------------------');
    Logger.log('✅ ACCIONES CORRECTIVAS ENCONTRADA');
    Logger.log(
      'Nombre: ' +
      carpetaAcciones.getName()
    );
    Logger.log(
      'ID: ' +
      carpetaAcciones.getId()
    );
    Logger.log(
      'URL: ' +
      carpetaAcciones.getUrl()
    );

  } else {

    Logger.log('----------------------------------------------');
    Logger.log(
      '⚠️ La carpeta OEC existe, pero no tiene todavía "' +
      FAC078_CONFIG.NOMBRE_CARPETA_ACCIONES +
      '".'
    );
  }

  Logger.log('==============================================');
  Logger.log('✅ PRUEBA FINALIZADA CORRECTAMENTE');
  Logger.log('OEC CORRECTO: ' + nombreEncontrado);
  Logger.log('==============================================');
}
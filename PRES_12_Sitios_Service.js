const WAPP_SITIOS_SHEET = 'Sitios';

function WAPP_SITIOS_listar_(registro) {
  const cfg = WAPP_cfg_();
  const key = String(registro || '').trim().toUpperCase();

  if (!key) {
    throw new Error('No existe registro OEC para consultar sitios.');
  }

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_SITIOS || WAPP_SITIOS_SHEET);

  if (!sh) {
    throw new Error(
      'No existe la hoja "' + (cfg.HOJA_SITIOS || WAPP_SITIOS_SHEET) +
      '" en Registro Maestro.'
    );
  }

  const lastCol = sh.getLastColumn();
  if (lastCol < 1) {
    throw new Error('La hoja Sitios no contiene encabezados.');
  }

  const headers = sh.getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(h => String(h || '').trim());

  const requeridos = [
    'OEC_ID',
    'Sitio_ID',
    'Sitio_Nombre',
    'Direccion',
    'Estado',
    'Fecha_Baja'
  ];

  const faltantes = requeridos.filter(h => !headers.includes(h));

  if (faltantes.length) {
    throw new Error(
      'La hoja Sitios no contiene los encabezados requeridos: ' +
      faltantes.join(', ')
    );
  }

  const rows = WAPP_rowsByHeaders_(sh);

  const encontrados = rows
    .filter(r =>
      String(r.OEC_ID || '').trim().toUpperCase() === key &&
      !WAPP_SITIOS_bajaEfectiva_(r.Fecha_Baja)
    )
    .map(r => ({
      rowNumber: r.__rowNumber,
      sitioId: String(r.Sitio_ID || '').trim(),
      nombre: String(r.Sitio_Nombre || '').trim(),
      direccion: String(r.Direccion || '').trim(),
      ciudad: String(r.Ciudad || '').trim(),
      departamento: String(r.Departamento || '').trim(),
      estado: String(r.Estado || '').trim(),
      comentarios: String(r.Comentarios || '').trim(),
      fechaAlta: WAPP_dateText_(r.Fecha_Alta),
      fechaBaja: WAPP_dateText_(r.Fecha_Baja)
    }))
    .filter(x => x.nombre || x.sitioId)
    .sort((a, b) =>
      String(a.nombre || a.sitioId).localeCompare(
        String(b.nombre || b.sitioId),
        'es'
      )
    );

  console.log(
    '[WAPP_SITIOS_LISTAR] ' +
    JSON.stringify({
      registroSolicitado: registro,
      registroNormalizado: key,
      hoja: sh.getName(),
      totalFilas: rows.length,
      encontrados: encontrados.length,
      sitios: encontrados.map(x => ({
        fila: x.rowNumber,
        sitioId: x.sitioId,
        nombre: x.nombre,
        estado: x.estado
      }))
    })
  );

  return encontrados;
}
/**
 * Se excluye únicamente una baja que ya sea efectiva.
 * El Estado NO se usa como filtro: un sitio pendiente/no autorizado
 * puede ser precisamente objeto de la evaluación.
 */
function WAPP_SITIOS_bajaEfectiva_(value) {
  if (value == null || value === '') return false;

  let d = null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    d = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  } else {
    const s = String(value).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
      m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (m) {
        d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      }
    }
  }

  // Si el formato no puede interpretarse, no se oculta el sitio.
  if (!d || isNaN(d)) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() <= today.getTime();
}

function WAPP_SITIOS_validarSeleccion_(registro, seleccion, tipoEvaluacion) {
  const disponibles = WAPP_SITIOS_listar_(registro);
  const index = {};

  disponibles.forEach(s => {
    const idKey = WAPP_norm_(s.sitioId);
    const fallbackKey = WAPP_norm_(s.nombre + '|' + s.direccion);
    if (idKey) index['id:' + idKey] = s;
    if (fallbackKey) index['fallback:' + fallbackKey] = s;
  });

  const rows = Array.isArray(seleccion) ? seleccion : [];
  const cleaned = [];
  const seen = {};

  rows.forEach((r, i) => {
    const sitioId = String(r.sitioId || '').trim();
    const nombre = String(r.nombre || '').trim();
    const direccion = String(r.direccion || '').trim();

    const source =
      (sitioId && index['id:' + WAPP_norm_(sitioId)]) ||
      index['fallback:' + WAPP_norm_(nombre + '|' + direccion)];

    if (!source) {
      throw new Error(
        'La instalación seleccionada en la fila ' + (i + 1) +
        ' ya no existe o no pertenece al OEC.'
      );
    }

    const key = WAPP_norm_(source.sitioId || source.nombre + '|' + source.direccion);
    if (seen[key]) return;
    seen[key] = true;

    const alcance = String(r.alcanceProgramado || '').trim();
    if (!alcance) {
      throw new Error(
        'Ingrese el alcance programado para la instalación "' +
        (source.nombre || source.sitioId) + '".'
      );
    }

    cleaned.push({
      sitioId: source.sitioId,
      sitioNombre: source.nombre,
      direccion: source.direccion,
      ciudad: source.ciudad,
      departamento: source.departamento,
      estado: source.estado,
      alcanceProgramado: alcance
    });
  });

  const reglas = WAPP_DOC_PREVIEW_rules_(tipoEvaluacion);
  if (reglas.agenda && cleaned.length === 0) {
    throw new Error(
      'Seleccione al menos una instalación programada para esta evaluación.'
    );
  }

  return cleaned;
}
/**
 * Verificación interna del módulo de Sitios.
 * No realiza escrituras.
 */
function WAPP_SITIOS_selfCheck_(registro) {
  const target = String(registro || '').trim().toUpperCase();
  const cfg = WAPP_cfg_();

  if (!cfg.HOJA_SITIOS) {
    throw new Error('HOJA_SITIOS no está configurada.');
  }

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_SITIOS);

  if (!sh) {
    throw new Error(
      'No existe la hoja "' + cfg.HOJA_SITIOS + '" en Registro Maestro.'
    );
  }

  const out = {
    ok: true,
    hoja: sh.getName(),
    funciones: {
      listar:
        typeof WAPP_SITIOS_listar_ === 'function',
      validarSeleccion:
        typeof WAPP_SITIOS_validarSeleccion_ === 'function',
      bajaEfectiva:
        typeof WAPP_SITIOS_bajaEfectiva_ === 'function'
    },
    registro: target,
    total: null,
    sitios: []
  };

  if (target) {
    const rows = WAPP_SITIOS_listar_(target);
    out.total = rows.length;
    out.sitios = rows.map(s => ({
      sitioId: s.sitioId,
      nombre: s.nombre,
      direccion: s.direccion,
      estado: s.estado
    }));
  }

  return out;
}

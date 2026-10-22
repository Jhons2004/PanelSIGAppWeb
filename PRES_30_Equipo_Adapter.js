function WAPP_EQ_guardar_(payload) {
  payload = payload || {};
  const comp = payload.composicion || {};
  const rows = Array.isArray(payload.equipo) ? payload.equipo : [];

  const cantidad = {
    oficial: 1,
    lider: WAPP_EQ_int_(comp.lider, 'Evaluador Líder'),
    tecnico: WAPP_EQ_int_(comp.tecnico, 'Evaluador Técnico'),
    experto: WAPP_EQ_int_(comp.experto, 'Experto Técnico'),
    acompOGA: WAPP_EQ_int_(comp.acompOGA, 'Acompañamiento OGA'),
    acompExterno: WAPP_EQ_int_(comp.acompExterno, 'Acompañamiento Externo'),
    formacion: WAPP_EQ_int_(comp.formacion, 'Personal en Formación')
  };

  if (cantidad.experto > 0 && (cantidad.acompOGA + cantidad.acompExterno) === 0) {
    throw new Error(
      'Si se incluye Experto Técnico, debe agregarse al menos un Evaluador de Acompañamiento.'
    );
  }

  if (cantidad.experto === 0 && (cantidad.acompOGA + cantidad.acompExterno) > 0) {
    throw new Error(
      'Los Evaluadores de Acompañamiento sólo se habilitan cuando existe Experto Técnico.'
    );
  }

  const esperado = {
    oficial: 1,
    lider: cantidad.lider,
    tecnico: cantidad.tecnico,
    experto: cantidad.experto,
    acomp_oga: cantidad.acompOGA,
    acomp_externo: cantidad.acompExterno,
    formacion: cantidad.formacion
  };

  const cleaned = rows.map((r, i) => {
    const rolKey = String(r.rolKey || '').trim();
    if (!Object.prototype.hasOwnProperty.call(esperado, rolKey)) {
      throw new Error('Fila ' + (i + 1) + ': rol de equipo inválido.');
    }

    const out = {
      rolKey: rolKey,
      rol: WAPP_EQ_labelRol_(rolKey),
      nombre: String(r.nombre || '').trim(),
      correo: String(r.correo || '').trim().toLowerCase(),
      tipo: String(r.tipo || '').trim(),
      documental: Number(r.documental || 0),
      sitio: Number(r.sitio || 0),
      lugarTrabajo: String(r.lugarTrabajo || '').trim(),
      areaCatalogo: String(r.areaCatalogo || '').trim(),
      area: String(r.area || '').trim()
    };

    if (!out.nombre) {
      throw new Error('Fila ' + (i + 1) + ': seleccione un integrante.');
    }

    if (rolKey !== 'formacion' && !WAPP_emailOk_(out.correo)) {
      throw new Error('Fila ' + (i + 1) + ': el integrante no tiene correo válido.');
    }

    if (rolKey === 'oficial') {
      out.tipo = 'OGA';
      // Regla temporal V1.5.3: Oficial no registra días en sitio.
      out.sitio = 0;
    }
    if (rolKey === 'tecnico' || rolKey === 'experto') out.tipo = 'Externo';
    if (rolKey === 'acomp_oga') out.tipo = 'OGA';
    if (rolKey === 'acomp_externo') out.tipo = 'Externo';

    if (rolKey === 'formacion') {
      out.tipo = 'N/A';
      out.documental = 0;
      out.sitio = 0;
    }

    // Área asignada a la evaluación.
    if (rolKey === 'oficial') {
      out.area = 'N/A';
    }

    if (rolKey === 'lider') {
      out.area = 'Sistema de gestión';
    }

    if (rolKey !== 'oficial' && !out.area) {
      throw new Error(
        'Fila ' + (i + 1) + ': el campo "Área a evaluar" es obligatorio.'
      );
    }

    if (rolKey === 'lider' && !['OGA', 'Externo'].includes(out.tipo)) {
      throw new Error('El tipo del Evaluador Líder debe ser OGA o Externo.');
    }

    return out;
  });

  Object.keys(esperado).forEach(key => {
    const actual = cleaned.filter(r => r.rolKey === key).length;
    if (actual !== esperado[key]) {
      throw new Error(
        'La cantidad de "' + WAPP_EQ_labelRol_(key) +
        '" no coincide con la composición indicada.'
      );
    }
  });

  // Regla V1.3:
  // - la duración predicha se usa como valor inicial, pero el usuario puede ajustarla
  // - no se permite 0 en el campo de días que corresponde a la evaluación
  // - revisión documental de AC: sitio=0 y documental > 0
  // - resto de evaluaciones: sitio > 0
  // - Oficial mantiene regla institucional propia
  // - Formación siempre 0/0
  WAPP_EQ_assertDiasValidos_(cleaned);

  const props = WAPP_STATE_props_();
  props.setProperty('WAPP_EQUIPO', JSON.stringify(cleaned));
  props.setProperty('WAPP_EQUIPO_COMPOSICION', JSON.stringify(cantidad));

  // Todo cambio de equipo invalida una previsualización anterior.
  props.deleteProperty('WAPP_DOC_PREVIEW_STATE');

  return {
    total: cleaned.length,
    composicion: cantidad,
    equipo: cleaned
  };
}

function WAPP_EQ_get_() {
  const raw = WAPP_STATE_props_().getProperty('WAPP_EQUIPO');
  return raw ? JSON.parse(raw) : [];
}

function WAPP_EQ_getComposicion_() {
  const raw = WAPP_STATE_props_().getProperty('WAPP_EQUIPO_COMPOSICION');
  return raw ? JSON.parse(raw) : {};
}

function WAPP_EQ_assertDiasValidos_(equipo) {
  const ev = WAPP_PRES_getEvaluacion_();
  if (!ev || !ev.estimacionTiempo) {
    throw new Error('No existe una estimación de tiempo asociada a la evaluación.');
  }

  const diasPrediccion = Number(ev.estimacionTiempo.duracionSugerida || 0);
  if (!diasPrediccion || diasPrediccion < 1) {
    throw new Error('La duración sugerida del modelo no es válida.');
  }

  const soloDocumental =
    WAPP_norm_(ev.tipoEvaluacion) === 'revision documental de acciones correctivas';

  (equipo || []).forEach(d => {
    const rolKey = String(d.rolKey || '').trim();
    const documental = Number(d.documental || 0);
    const sitio = Number(d.sitio || 0);

    // Regla temporal: Oficial siempre 0 días en sitio.
    if (rolKey === 'oficial') {
      if (sitio !== 0) {
        throw new Error(
          'Oficial de Acreditación: los días de evaluación en sitio deben permanecer en 0.'
        );
      }
      return;
    }

    if (rolKey === 'formacion') {
      if (documental !== 0 || sitio !== 0) {
        throw new Error('Personal en Formación no debe registrar días cobrables.');
      }
      return;
    }

    if (soloDocumental) {
      if (sitio !== 0) {
        throw new Error(
          d.rol + ': en revisión documental de acciones correctivas, ' +
          'los días en sitio deben ser 0.'
        );
      }

      if (!Number.isFinite(documental) || documental <= 0) {
        throw new Error(
          d.rol + ': los días de evaluación documental deben ser mayores que 0.'
        );
      }

      return;
    }

    if (!Number.isFinite(sitio) || sitio <= 0) {
      throw new Error(
        d.rol + ': los días de evaluación en sitio deben ser mayores que 0.'
      );
    }
  });

  return {
    ok: true,
    diasPrediccion: diasPrediccion,
    soloDocumental: soloDocumental,
    editable: true,
    minimo: 0.5
  };
}

// Alias temporal para mantener compatibilidad con cualquier prueba V1.2
// que aún invoque el nombre anterior.
function WAPP_EQ_assertDiasSegunPrediccion_(equipo) {
  return WAPP_EQ_assertDiasValidos_(equipo);
}

function WAPP_EQ_int_(value, label) {
  const s = String(value == null ? '0' : value).trim();
  if (!/^\d+$/.test(s)) throw new Error(label + ': cantidad inválida.');
  return Number(s);
}

function WAPP_EQ_labelRol_(key) {
  const labels = {
    oficial: 'Oficial de Acreditación',
    lider: 'Evaluador Líder',
    tecnico: 'Evaluador Técnico',
    experto: 'Experto Técnico',
    acomp_oga: 'Evaluador de Acompañamiento',
    acomp_externo: 'Evaluador de Acompañamiento',
    formacion: 'Personal en Formación'
  };
  return labels[key] || key;
}

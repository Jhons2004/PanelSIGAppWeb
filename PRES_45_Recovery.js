/**
 * ============================================================================
 * WAPP V1.7.3 — RECUPERACIÓN DE OPERACIÓN PARCIAL
 * ============================================================================
 *
 * Permite continuar una operación que ya generó documentos pero falló en
 * Presupuesto / Equipo_Evaluador / Boleta / Calendar / correo.
 *
 * NO vuelve a solicitar autorización de duplicado para la misma operación.
 * NO regenera documentos cuya firma ya está almacenada.
 * ============================================================================
 */

function WAPP_API_reanudarOperacionParcial(payload) {
  try {
    payload = payload || {};

    WAPP_SEC_assertUsuarioInterno_();
    WAPP_SEC_assertMutationToken_(payload.csrf);
    WAPP_SEC_assertOnce_(
      'reanudarOperacionParcial',
      payload.requestId
    );

    const state = WAPP_DOCV16_leerEstado_();

    if (!state || !state.signature) {
      throw new Error(
        'No existe una operación documental parcial para reanudar.'
      );
    }

    if (
      ![
        'PARCIAL',
        'DOCUMENTOS_COMPLETADOS',
        'PENDIENTE_INTEGRACIONES'
      ].includes(String(state.estado || ''))
    ) {
      throw new Error(
        'La operación actual no se encuentra en un estado reanudable: ' +
        String(state.estado || 'SIN_ESTADO')
      );
    }

    /*
     * WAPP_DOCV16_generar_ reconoce la firma existente:
     * - no repite documentos ya creados;
     * - no vuelve a validar la duplicidad contra sí misma;
     * - continúa WAPP_V17 desde el punto pendiente.
     */
    const result = WAPP_DOCV16_generar_({
      reanudarOperacionParcial: true
    });

    try {
      WAPP_FLOW_complete_('DOCUMENTOS', {
        operacionId: result.operacionId || '',
        estado: result.estado || 'COMPLETADO'
      });
    } catch (_) {
      // La recuperación no debe fallar por un estado de navegación ya completo.
    }

    return WAPP_ok_({
      documentos: {
        result: result
      },
      reanudada: true,
      flow: WAPP_FLOW_publicState_()
    });

  } catch (e) {
    return WAPP_fail_(e);
  }
}

/**
 * Recuperación manual de soporte desde el editor Apps Script.
 *
 * Úsela si la página se recargó y ya no aparece el botón de reintento.
 * No requiere nueva vista previa ni nuevo OTP.
 */
function TEST_WAPP_V173_REANUDAR_OPERACION_PARCIAL() {
  WAPP_SEC_assertUsuarioInterno_();
  const user = WAPP_SEC_assertUsuarioInterno_();

  const stateAntes = WAPP_DOCV16_leerEstado_();
  const opAntes = WAPP_V17_leerEstado_();

  console.log(
    '[TEST_WAPP_V173_REANUDAR_ANTES]\n' +
    JSON.stringify({
      usuario: user.email,
      documentos: stateAntes,
      operacion: opAntes
    }, null, 2)
  );

  if (!stateAntes || !stateAntes.signature) {
    throw new Error(
      'No existe estado documental parcial para reanudar.'
    );
  }

  const result = WAPP_DOCV16_generar_({
    reanudarOperacionParcial: true,
    origen: 'TEST_WAPP_V173_REANUDAR_OPERACION_PARCIAL'
  });

  const stateDespues = WAPP_DOCV16_leerEstado_();
  const opDespues = WAPP_V17_leerEstado_();

  const out = {
    ok: true,
    result: result,
    documentosEstado: stateDespues,
    operacionEstado: opDespues
  };

  console.log(
    '[TEST_WAPP_V173_REANUDAR_DESPUES]\n' +
    JSON.stringify(out, null, 2)
  );

  return out;
}

function TEST_WAPP_V173_GRID_CAPACITY() {
  WAPP_SEC_assertUsuarioInterno_();
  const names = [
    WAPP_V17_cfg_().SHEET_PRESUPUESTO,
    WAPP_V17_cfg_().SHEET_REGISTROS,
    WAPP_V17_cfg_().SHEET_EQUIPO,
    'Tipo_Cambio_Cache',
    WAPP_V17_cfg_().SHEET_AUDIT
  ];

  const ss = WAPP_V17_db_();

  const result = names.map(name => {
    const sh = ss.getSheetByName(name);

    if (!sh) {
      return {
        hoja: name,
        existe: false
      };
    }

    return {
      hoja: name,
      existe: true,
      lastRow: sh.getLastRow(),
      maxRows: sh.getMaxRows(),
      filasDisponibles:
        sh.getMaxRows() - sh.getLastRow(),
      lastColumn: sh.getLastColumn(),
      maxColumns: sh.getMaxColumns()
    };
  });

  console.log(
    '[TEST_WAPP_V173_GRID_CAPACITY]\n' +
    JSON.stringify(result, null, 2)
  );

  return result;
}

function TEST_WAPP_V173_ESTADO_PARCIAL() {
  WAPP_SEC_assertUsuarioInterno_();
  const out = {
    documentos: WAPP_DOCV16_leerEstado_(),
    operacion: WAPP_V17_leerEstado_()
  };

  console.log(
    '[TEST_WAPP_V173_ESTADO_PARCIAL]\n' +
    JSON.stringify(out, null, 2)
  );

  return out;
}

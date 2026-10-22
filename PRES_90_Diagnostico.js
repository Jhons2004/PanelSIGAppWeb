/**
 * Diagnóstico integral productivo V1.8.1.5.
 * No realiza escrituras operativas.
 */
function WAPP_DIAG_run_(user) {
  const cfg = WAPP_cfg_();
  const tests = [];
  const warnings = [];

  function test(name, fn) {
    try {
      const value = fn();

      tests.push({
        name: name,
        ok: true,
        detail:
          value === undefined ||
          value === null ||
          value === ''
            ? 'OK'
            : value
      });
    } catch (e) {
      tests.push({
        name: name,
        ok: false,
        detail: e && e.message ? e.message : String(e)
      });
    }
  }

  function functionAvailable_(name) {
    try {
      return typeof globalThis[name] === 'function';
    } catch (_) {
      return false;
    }
  }

  test('Usuario interno', () => user.email);

  test('Configuración ambiente actual', () => {
    const r = WAPP_validateConfig_(WAPP_getEnv_());

    if (!r.ok) {
      throw new Error(
        'Faltantes: ' + r.faltantes.join(', ')
      );
    }

    if (r.warnings.length) {
      warnings.push.apply(warnings, r.warnings);
    }

    return 'Completa · ' + r.env;
  });

  const prod = WAPP_validateConfig_('PROD');
  if (!prod.ok) {
    warnings.push(
      'Configuración PROD incompleta. Faltan: ' +
      prod.faltantes.join(', ')
    );
  }

  let maestro = null;
  let boletas = null;

  test('Registro Maestro', () => {
    maestro = SpreadsheetApp.openById(
      cfg.REGISTRO_MAESTRO_ID
    );
    return maestro.getName();
  });

  test('Registro Boletas', () => {
    boletas = SpreadsheetApp.openById(
      cfg.REGISTRO_BOLETAS_ID
    );
    return boletas.getName();
  });

  [
    cfg.HOJA_CLIENTES,
    cfg.HOJA_CICLOS,
    cfg.HOJA_OFICIALES,
    cfg.HOJA_SITIOS,
    cfg.HOJA_EVENTOS,
    cfg.HOJA_ASISTENCIA_DETALLE,
    cfg.HOJA_CERTIFICADOS_PENDIENTES
  ].forEach(sheetName => {
    test('RM · ' + sheetName, () => {
      const ss =
        maestro ||
        SpreadsheetApp.openById(
          cfg.REGISTRO_MAESTRO_ID
        );

      const sh = ss.getSheetByName(sheetName);

      if (!sh) {
        throw new Error('No encontrada');
      }

      return (
        sh.getLastRow() +
        ' fila(s) · capacidad ' +
        sh.getMaxRows()
      );
    });
  });

  [
    cfg.HOJA_PRESUPUESTO,
    cfg.HOJA_REGISTROS,
    cfg.HOJA_EQUIPO_EVALUADOR,
    WAPP_V17_cfg_().SHEET_BOLETA_TEMPLATE,
    WAPP_V17_cfg_().SHEET_AUDIT,
    WAPP_V171_TC_cfg_().SHEET
  ].forEach(sheetName => {
    test('RB · ' + sheetName, () => {
      const ss =
        boletas ||
        SpreadsheetApp.openById(
          cfg.REGISTRO_BOLETAS_ID
        );

      const sh = ss.getSheetByName(sheetName);

      if (!sh) {
        if (
          sheetName === WAPP_V17_cfg_().SHEET_AUDIT
        ) {
          return 'Aún no creada; se crea al primer registro.';
        }

        throw new Error('No encontrada');
      }

      return (
        sh.getLastRow() +
        ' fila(s) · capacidad ' +
        sh.getMaxRows()
      );
    });
  });

  test('Plantilla Presupuesto', () =>
    DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_PRESUPUESTO
    ).getName()
  );

  test('Plantilla Agenda', () =>
    DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_AGENDA
    ).getName()
  );

  test('Plantilla Informe', () =>
    DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_INFORME
    ).getName()
  );

  test('Respaldo Agenda', () =>
    DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_AGENDA
    ).getName()
  );

  test('Respaldo Presupuesto', () =>
    DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_PRESUPUESTO
    ).getName()
  );

  test('Respaldo Informe', () =>
    DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_INFORME
    ).getName()
  );

  test('Respaldo Boleta', () =>
    DriveApp.getFolderById(
      WAPP_V17_cfg_().BACKUP_BOLETA_FOLDER_ID
    ).getName()
  );

  [
    'WAPP_DOCV16_generar_',
    'WAPP_V17_completarOperacion_',
    'WAPP_V171_TC_resolver_',
    'WAPP_API_reanudarOperacionParcial',
    'WAPP_SITIOS_listar_',
    'WAPP_SITIOS_validarSeleccion_',
    'WAPP_INT_diagnosticarFila_',
    'WAPP_INT_reservarCorrelativo_',
    'WAPP_INT_upsertByKey_',
    'WAPP_ASISTV16_prepararAgenda_',
    'obtenerEventoPublicoAsistencia',
    'guardarRegistroPublicoAsistencia',
    'WAPP_CERT_registrarPendiente_'
  ].forEach(fnName => {
    test('Función · ' + fnName, () => {
      if (!functionAvailable_(fnName)) {
        throw new Error('No instalada');
      }

      return 'Disponible';
    });
  });

  test('Servicio · instalaciones OEC', () => {
    if (
      typeof WAPP_SITIOS_listar_ !== 'function' ||
      typeof WAPP_SITIOS_validarSeleccion_ !== 'function'
    ) {
      throw new Error(
        '12_Sitios_Service.gs no instalado o incompleto.'
      );
    }

    const ss =
      maestro ||
      SpreadsheetApp.openById(
        cfg.REGISTRO_MAESTRO_ID
      );

    const sh = ss.getSheetByName(cfg.HOJA_SITIOS);

    if (!sh) {
      throw new Error(
        'No existe la hoja ' + cfg.HOJA_SITIOS + '.'
      );
    }

    return 'Disponible · ' + sh.getLastRow() + ' fila(s)';
  });

  test('Integridad · módulo V1.8.1', () => {
    if (
      typeof WAPP_INT_diagnosticarFila_ !== 'function' ||
      typeof WAPP_INT_reservarCorrelativo_ !== 'function' ||
      typeof WAPP_INT_upsertByKey_ !== 'function'
    ) {
      throw new Error(
        '46_Integridad_Idempotencia.gs no está instalado.'
      );
    }

    return 'Disponible · ledger + correlativos + diagnóstico';
  });

  test('Feature · generación documental', () =>
    WAPP_FEATURE_enabled_('DOCUMENT_GENERATION')
      ? 'Habilitada'
      : (() => {
          throw new Error('Deshabilitada');
        })()
  );

  test('Calendar API', () => {
    if (
      typeof Calendar === 'undefined' ||
      !Calendar.Calendars
    ) {
      throw new Error(
        'Servicio avanzado Calendar v3 no habilitado.'
      );
    }

    const cal = Calendar.Calendars.get(
      WAPP_V17_cfg_().CALENDAR_ID
    );

    return (
      (cal && cal.summary) ||
      WAPP_V17_cfg_().CALENDAR_ID
    );
  });

  test('BANGUAT continuidad', () => {
    const r = WAPP_V171_TC_preflight_();

    if (!r.continuidadGarantizada) {
      throw new Error(
        'No existe tasa en línea ni respaldo válido.'
      );
    }

    const rate =
      r.online && r.online.ok
        ? r.online.tasa
        : (
            r.ultimaTasaValida &&
            r.ultimaTasaValida.raw
          ) || 'disponible';

    return 'Garantizada · ' + rate;
  });

  const failed = tests.filter(t => !t.ok);

  return {
    version: WAPP_VERSION,
    env: WAPP_getEnv_(),
    ok: failed.length === 0,
    tests: tests,
    warnings: warnings,
    resumen: {
      total: tests.length,
      ok: tests.length - failed.length,
      error: failed.length
    }
  };
}

function TEST_WAPP_DIAGNOSTICO() {
  WAPP_SEC_assertUsuarioInterno_();
  const r = WAPP_API_diagnostico();

  console.log(
    '[TEST_WAPP_DIAGNOSTICO]\n' +
    JSON.stringify(r, null, 2)
  );

  return r;
}

function TEST_WAPP_BUSCAR_OEC() {
  WAPP_SEC_assertUsuarioInterno_();
  const registro = 'OGA-LE-001-01';

  const r = WAPP_API_buscarOEC(registro);

  console.log(
    '[TEST_WAPP_BUSCAR_OEC]\n' +
    JSON.stringify(r, null, 2)
  );

  return r;
}

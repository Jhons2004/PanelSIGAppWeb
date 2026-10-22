const WAPP_DOCV16_STATE_KEY = 'WAPP_DOC_V16_STATE';

function WAPP_DOCV16_cfg_() {
  const cfg = WAPP_cfg_();

  if (!cfg.DOCUMENTOS) {
    throw new Error(
      'No existe configuración DOCUMENTOS para el ambiente ' +
      WAPP_getEnv_() + '.'
    );
  }

  return cfg.DOCUMENTOS;
}

function WAPP_DOCV16_generar_(payload) {
  payload = payload || {};

  const lock = LockService.getScriptLock();
  const lockTimeout =
    typeof WAPP_INT_cfg_ === 'function'
      ? Number(WAPP_INT_cfg_().LOCK_TIMEOUT_MS || 60000)
      : 60000;

  lock.waitLock(lockTimeout);

  try {
    if (typeof WAPP_V17_completarOperacion_ !== 'function') {
      throw new Error(
        'Falta instalar 43_Operacion.gs. ' +
        'La generación V1.7 no puede continuar.'
      );
    }

    const c = WAPP_DOCV16_contexto_();

    let state = WAPP_DOCV16_leerEstado_();
    const opState = WAPP_V17_leerEstado_();

    const esReanudacionParcial =
      payload.reanudarOperacionParcial === true;

    let comparable = null;
    let signature = '';

    /*
     * V1.7.4
     * En una reanudación NO debemos reconstruir la firma mediante
     * WAPP_DOC_PREVIEW_buildComparable_(), porque esa función ejecuta
     * nuevamente el control de duplicidad y bloquearía la propia
     * evaluación que estamos intentando terminar.
     *
     * La firma almacenada es la identidad canónica de la operación parcial.
     */
    if (esReanudacionParcial) {
      if (!state || !state.signature) {
        throw new Error(
          'No existe una firma documental parcial almacenada para reanudar.'
        );
      }

      signature = String(state.signature);

      const registroEstado = String(
        state.resultado && state.resultado.registro || ''
      ).trim().toUpperCase();

      const tipoEstado = WAPP_norm_(
        state.resultado && state.resultado.tipoEvaluacion || ''
      );

      const registroActual = String(
        c.ctx && c.ctx.registro || ''
      ).trim().toUpperCase();

      const tipoActual = WAPP_norm_(
        c.evaluacion && c.evaluacion.tipoEvaluacion || ''
      );

      if (
        registroEstado &&
        registroActual &&
        registroEstado !== registroActual
      ) {
        throw new Error(
          'La operación parcial pertenece al registro ' +
          registroEstado +
          ' y la sesión actual corresponde a ' +
          registroActual +
          '. No se reanudó para evitar mezclar evaluaciones.'
        );
      }

      if (
        tipoEstado &&
        tipoActual &&
        tipoEstado !== tipoActual
      ) {
        throw new Error(
          'La operación parcial corresponde a "' +
          (state.resultado.tipoEvaluacion || '') +
          '" y la sesión actual corresponde a "' +
          (c.evaluacion.tipoEvaluacion || '') +
          '". No se reanudó para evitar mezclar evaluaciones.'
        );
      }

    } else {
      comparable = WAPP_DOC_PREVIEW_buildComparable_();
      signature = WAPP_DOC_PREVIEW_signature_(comparable);
    }

    /*
     * V1.8.1.4
     * Si dos solicitudes de "Reanudar" entran casi al mismo tiempo,
     * ambas pueden superar la validación del API antes de que la primera
     * termine. El ScriptLock serializa la ejecución, pero la segunda
     * podría entrar después de que la primera ya dejó el estado COMPLETADO.
     *
     * En ese caso devolvemos el resultado existente sin volver a auditar
     * ni tocar integraciones.
     */
    if (
      esReanudacionParcial &&
      state &&
      (
        String(state.estado || '') === 'COMPLETADO' ||
        String(
          state.resultado &&
          state.resultado.estado || ''
        ) === 'COMPLETADO'
      )
    ) {
      return state.resultado || {
        ok: true,
        estado: 'COMPLETADO',
        operacionId: state.operacionId || ''
      };
    }

    const v16MismoFlujo = !!(
      state &&
      state.signature === signature
    );

    const v17MismoFlujo = !!(
      opState &&
      opState.signature === signature
    );

    /*
     * La validación de duplicados se ejecuta únicamente al iniciar una
     * operación real nueva. En reintentos no debe bloquearse contra la
     * propia fila de Presupuesto creada por V1.7.
     */
    if (
      !esReanudacionParcial &&
      !v16MismoFlujo &&
      !v17MismoFlujo
    ) {
      c.duplicado = WAPP_DUP_assertAllowed_({
        registro: c.evaluacion.registro || c.ctx.registro,
        tipoEvaluacion: c.evaluacion.tipoEvaluacion,
        fechaInicio: c.evaluacion.fechaInicio,
        fechaFinal: c.evaluacion.fechaFinal
      }, c.user);
    } else {
      c.duplicado = {
        ok: true,
        reutilizado: true,
        motivo: esReanudacionParcial
          ? 'Reanudación explícita de operación parcial; se conserva la firma almacenada.'
          : 'Continuación idempotente de la misma operación.'
      };
    }

    if (!state || state.signature !== signature) {
      state = {
        signature: signature,
        operacionId: WAPP_DOCV16_operacionId_(c),
        estado: 'EN_PROCESO',
        createdAt: new Date().toISOString(),
        resultado: {
          ok: false,
          estado: 'EN_PROCESO',
          operacionId: '',
          registro: c.ctx.registro,
          tipoEvaluacion: c.evaluacion.tipoEvaluacion,
          presupuesto: { aplica: c.reglas.presupuesto, generado: false },
          agenda: { aplica: c.reglas.agenda, generado: false },
          informe: { aplica: c.reglas.informe, generado: false },
          boleta: { aplica: c.reglas.boleta, generado: false }
        }
      };

      state.resultado.operacionId = state.operacionId;
      WAPP_DOCV16_guardarEstado_(state);
    }

    if (typeof WAPP_INT_beginOperation_ === 'function') {
      WAPP_INT_beginOperation_(
        signature,
        c,
        state.operacionId
      );
    }

    const r = state.resultado;
    const destinos = WAPP_DOCV16_resolverDestinos_(c.ctx.registro);

    try {
      if (c.reglas.presupuesto && !r.presupuesto.generado) {
        r.presupuesto = WAPP_DOCV16_generarPresupuesto_(c, destinos);
        WAPP_DOCV16_guardarEstado_(state);

        if (typeof WAPP_INT_updateOperation_ === 'function') {
          WAPP_INT_updateOperation_(
            signature,
            {
              Estado: 'EN_PROCESO',
              Etapa: 'DOCUMENTO_PRESUPUESTO',
              Presupuesto_File_ID:
                r.presupuesto.primary &&
                r.presupuesto.primary.id || ''
            }
          );
        }
      }

      if (c.reglas.agenda && !r.agenda.generado) {
        r.agenda = WAPP_DOCV16_generarAgenda_(c, destinos);
        WAPP_DOCV16_guardarEstado_(state);

        if (typeof WAPP_INT_updateOperation_ === 'function') {
          WAPP_INT_updateOperation_(
            signature,
            {
              Estado: 'EN_PROCESO',
              Etapa: 'DOCUMENTO_AGENDA',
              Agenda_File_ID:
                r.agenda.primary &&
                r.agenda.primary.id || ''
            }
          );
        }
      }

      if (c.reglas.informe && !r.informe.generado) {
        r.informe = WAPP_DOCV16_generarInforme_(c, destinos);
        WAPP_DOCV16_guardarEstado_(state);

        if (typeof WAPP_INT_updateOperation_ === 'function') {
          WAPP_INT_updateOperation_(
            signature,
            {
              Estado: 'EN_PROCESO',
              Etapa: 'DOCUMENTO_INFORME',
              Informe_File_ID:
                r.informe.primary &&
                r.informe.primary.id || ''
            }
          );
        }
      }

      state.estado = 'DOCUMENTOS_COMPLETADOS';
      r.estado = 'DOCUMENTOS_COMPLETADOS';
      WAPP_DOCV16_guardarEstado_(state);

      if (typeof WAPP_INT_updateOperation_ === 'function') {
        WAPP_INT_updateOperation_(
          signature,
          {
            Estado: 'EN_PROCESO',
            Etapa: 'DOCUMENTOS_COMPLETADOS'
          }
        );
      }

      /*
       * V1.7: Presupuesto operativo + Equipo_Evaluador + Boleta +
       * Calendario institucional + correo.
       */
      const operacion = WAPP_V17_completarOperacion_(
        c,
        r,
        signature,
        payload
      );

      r.operacion = operacion;
      r.registroOperativo = operacion.registroOperativo || {};
      r.boleta = operacion.boleta || {
        aplica: c.reglas.boleta,
        generado: false
      };
      r.calendario = operacion.calendario || {};
      r.correo = operacion.correo || {};
      r.integracionesPendientes = operacion.integracionesPendientes || [];

      state.estado = operacion.estado || 'COMPLETADO';
      r.ok = true;
      r.estado = state.estado;
      r.completedAt = new Date().toISOString();

      // Una recuperación exitosa no debe conservar el error histórico
      // como si siguiera vigente. La trazabilidad permanece en bitácoras.
      delete r.error;

      WAPP_DOCV16_guardarEstado_(state);

      if (typeof WAPP_INT_markCompleted_ === 'function') {
        WAPP_INT_markCompleted_(
          signature,
          r
        );
      }

      WAPP_DOCV16_auditar_(c, r);

      WAPP_STATE_props_()
        .deleteProperty('WAPP_DOC_PREVIEW_STATE');

      return r;

    } catch (err) {
      state.estado = 'PARCIAL';
      r.ok = false;
      r.estado = 'PARCIAL';
      r.error = err && err.message ? err.message : String(err);
      WAPP_DOCV16_guardarEstado_(state);

      if (typeof WAPP_INT_markError_ === 'function') {
        WAPP_INT_markError_(
          signature,
          err,
          'GENERACION_OPERACION'
        );
      }

      throw new Error(
        'La operación quedó parcial. Los archivos y registros ya creados ' +
        'se conservaron y serán reutilizados al reintentar. Detalle: ' +
        r.error
      );
    }

  } finally {
    lock.releaseLock();
  }
}

function WAPP_DOCV16_contexto_() {
  const flow = WAPP_FLOW_get_();
  if (!flow.registro) {
    throw new Error('No existe un OEC activo.');
  }

  const ctx = WAPP_OEC_obtenerContexto_(flow.registro);
  const evaluacion = WAPP_PRES_getEvaluacion_();
  const equipo = WAPP_EQ_get_();

  if (!evaluacion) {
    throw new Error('No existen datos de evaluación guardados.');
  }
  if (!equipo.length) {
    throw new Error('No existe equipo evaluador guardado.');
  }

  const user = WAPP_SEC_assertUsuarioInterno_();
  const reglas = WAPP_DOC_PREVIEW_rules_(evaluacion.tipoEvaluacion);

  WAPP_EQ_assertDiasSegunPrediccion_(equipo);

  return {
    ctx: ctx,
    evaluacion: evaluacion,
    equipo: equipo,
    user: user,
    reglas: reglas,
    duplicado: null
  };
}

function WAPP_DOCV16_operacionId_(c) {
  const ts = Utilities.formatDate(
    new Date(),
    WAPP_cfg_().TZ,
    'yyyyMMdd-HHmmss'
  );

  return [
    'DOCV16',
    ts,
    WAPP_DOCV16_nombreSeguro_(c.ctx.registro).replace(/_/g, ''),
    Utilities.getUuid().slice(0, 8).toUpperCase()
  ].join('-');
}

function WAPP_DOCV16_leerEstado_() {
  const raw = WAPP_STATE_props_()
    .getProperty(WAPP_DOCV16_STATE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    WAPP_STATE_props_()
      .deleteProperty(WAPP_DOCV16_STATE_KEY);
    return null;
  }
}

function WAPP_DOCV16_guardarEstado_(state) {
  WAPP_STATE_props_().setProperty(
    WAPP_DOCV16_STATE_KEY,
    JSON.stringify(state)
  );
}

function WAPP_DOCV16_resolverDestinos_(registro) {
  const cfg = WAPP_cfg_();
  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const sh = ss.getSheetByName(cfg.HOJA_CLIENTES || 'Clientes');

  if (!sh) {
    throw new Error('No existe la hoja Clientes en Registro Maestro.');
  }

  const key = String(registro || '').trim().toUpperCase();
  const row = WAPP_rowsByHeaders_(sh).find(r =>
    String(r.OEC_ID || '').trim().toUpperCase() === key
  );

  if (!row) {
    throw new Error('No se encontró el OEC en Clientes: ' + key);
  }

  const folderId =
    WAPP_DOCV16_extraerIdDrive_(row.Link_Ficha_OEC) ||
    WAPP_DOCV16_extraerIdDrive_(row.Ficha_Link) ||
    WAPP_DOCV16_extraerIdDrive_(row.Ficha_ID);

  if (!folderId) {
    throw new Error(
      'El OEC no tiene Link_Ficha_OEC/Ficha_Link/Ficha_ID válido.'
    );
  }

  let root = null;
  try {
    root = DriveApp.getFolderById(folderId);
  } catch (e) {
    throw new Error(
      'No fue posible abrir la carpeta indicada en Link_Ficha_OEC.'
    );
  }

  const agenda = WAPP_DOCV16_buscarSubcarpeta_(
    root,
    WAPP_DOCV16_cfg_().RUTAS_OEC.agenda
  );
  const presupuesto = WAPP_DOCV16_buscarSubcarpeta_(
    root,
    WAPP_DOCV16_cfg_().RUTAS_OEC.presupuesto
  );
  const informe = WAPP_DOCV16_buscarSubcarpeta_(
    root,
    WAPP_DOCV16_cfg_().RUTAS_OEC.informe
  );

  return {
    root: root,
    agenda: agenda,
    presupuesto: presupuesto,
    informe: informe,

    backupAgenda: DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_AGENDA
    ),
    backupPresupuesto: DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_PRESUPUESTO
    ),
    backupInforme: DriveApp.getFolderById(
      WAPP_DOCV16_cfg_().BACKUP_INFORME
    )
  };
}

function WAPP_DOCV16_buscarSubcarpeta_(root, nombres) {
  const candidatos = Array.isArray(nombres) ? nombres : [nombres];

  for (let i = 0; i < candidatos.length; i++) {
    const it = root.getFoldersByName(candidatos[i]);
    if (it.hasNext()) return it.next();
  }

  const disponibles = [];
  const it = root.getFolders();
  while (it.hasNext()) {
    disponibles.push(it.next().getName());
  }

  throw new Error(
    'No se encontró la subcarpeta requerida "' +
    candidatos.join('" / "') +
    '" dentro de ' + root.getName() +
    '. Disponibles: ' + disponibles.join(', ')
  );
}

function WAPP_DOCV16_extraerIdDrive_(value) {
  const s = String(value || '').trim();
  if (!s) return '';

  const m = s.match(/[-\w]{20,}/);
  return m ? m[0] : '';
}

function WAPP_DOCV16_validarDestinos_(registro) {
  const d = WAPP_DOCV16_resolverDestinos_(registro);

  const templates = {
    presupuesto: DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_PRESUPUESTO
    ).getName(),
    agenda: DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_AGENDA
    ).getName(),
    informe: DriveApp.getFileById(
      WAPP_DOCV16_cfg_().TEMPLATE_INFORME
    ).getName()
  };

  return {
    registro: String(registro || '').trim().toUpperCase(),
    carpetaOEC: {
      id: d.root.getId(),
      nombre: d.root.getName(),
      url: d.root.getUrl()
    },
    destinos: {
      agenda: WAPP_DOCV16_folderInfo_(d.agenda),
      presupuesto: WAPP_DOCV16_folderInfo_(d.presupuesto),
      informe: WAPP_DOCV16_folderInfo_(d.informe)
    },
    respaldos: {
      agenda: WAPP_DOCV16_folderInfo_(d.backupAgenda),
      presupuesto: WAPP_DOCV16_folderInfo_(d.backupPresupuesto),
      informe: WAPP_DOCV16_folderInfo_(d.backupInforme)
    },
    plantillas: templates
  };
}

function WAPP_DOCV16_folderInfo_(f) {
  return {
    id: f.getId(),
    nombre: f.getName(),
    url: f.getUrl()
  };
}

/* =========================================================
 * PRESUPUESTO
 * ========================================================= */

function WAPP_DOCV16_generarPresupuesto_(c, destinos) {
  const template = DriveApp.getFileById(
    WAPP_DOCV16_cfg_().TEMPLATE_PRESUPUESTO
  );

  const nombreBase = WAPP_DOCV16_nombreDocumento_(
    'Presupuesto',
    c.ctx.registro,
    c.evaluacion.tipoEvaluacion,
    c.evaluacion.fechaInicio
  );

  const temp = template.makeCopy(
    '__TEMP__' + nombreBase,
    destinos.presupuesto
  );

  try {
    const doc = DocumentApp.openById(temp.getId());
    const body = doc.getBody();

    const pagos = WAPP_DOCV16_calcularPagos_(c.equipo);
    const fechaDocumento = WAPP_DOCV16_fechaLarga_(new Date());

    WAPP_DOCV16_replace_(body, '{Registro de Acreditación}', c.ctx.registro);
    WAPP_DOCV16_replace_(body, '{Tipo evaluación}', c.evaluacion.tipoEvaluacion);
    WAPP_DOCV16_replace_(body, '{Esquema de acreditación}', c.ctx.tipo);
    WAPP_DOCV16_replace_(body, '{Norma Evaluada}', c.ctx.norma);
    WAPP_DOCV16_replace_(body, '{usuario}', c.user.nombre || c.user.email);
    WAPP_DOCV16_replace_(body, '{Pagos OGA}', 'USD.' + pagos.oga.toFixed(2));
    WAPP_DOCV16_replace_(body, '{Pagos Externos}', 'USD.' + pagos.externo.toFixed(2));
    WAPP_DOCV16_replace_(body, '{Total}', 'USD.' + pagos.total.toFixed(2));
    WAPP_DOCV16_replace_(body, '{Fecha Inicio Evaluación in situ}', c.evaluacion.fechaInicio);
    WAPP_DOCV16_replace_(body, '{fecha inicial}', c.evaluacion.fechaInicio);
    WAPP_DOCV16_replace_(body, '{Fecha Final de Evaluación in situ}', c.evaluacion.fechaFinal);
    WAPP_DOCV16_replace_(body, '{fecha final}', c.evaluacion.fechaFinal);
    WAPP_DOCV16_replace_(body, '{fecha}', fechaDocumento);
    WAPP_DOCV16_replace_(
      body,
      '{mantenimiento}',
      WAPP_DOCV16_textoMantenimiento_(c.evaluacion.tipoEvaluacion)
    );

    WAPP_DOCV16_insertarTablaPresupuesto_(
      body,
      ['{tabla equipo}', '{tabla_equipo}'],
      c.equipo
    );

    doc.saveAndClose();

    const pdfName = nombreBase + '.pdf';
    const blob = DriveApp.getFileById(temp.getId())
      .getAs(MimeType.PDF)
      .setName(pdfName);

    const primary = destinos.presupuesto
      .createFile(blob)
      .setName(pdfName);

    const backup = destinos.backupPresupuesto
      .createFile(blob.copyBlob())
      .setName(pdfName);

    return {
      aplica: true,
      generado: true,
      formato: 'PDF',
      nombre: pdfName,
      primary: WAPP_DOCV16_fileInfo_(primary),
      backup: WAPP_DOCV16_fileInfo_(backup),
      pagos: pagos
    };

  } finally {
    try {
      temp.setTrashed(true);
    } catch (e) {
      console.warn('[DOCV16] No se pudo eliminar temporal:', e);
    }
  }
}

function WAPP_DOCV16_calcularPagos_(equipo) {
  let oga = 0;
  let externo = 0;

  (equipo || []).forEach(e => {
    const tarifa = WAPP_DOCV16_tarifa_(e);
    const totalDias =
      Number(e.documental || 0) +
      Number(e.sitio || 0);

    const subtotal = totalDias * tarifa;

    if (WAPP_norm_(e.tipo) === 'oga') oga += subtotal;
    if (WAPP_norm_(e.tipo) === 'externo') externo += subtotal;
  });

  return {
    tarifaBase: WAPP_DOCV16_cfg_().TARIFA_DIA_USD,
    oga: Number(oga.toFixed(2)),
    externo: Number(externo.toFixed(2)),
    total: Number((oga + externo).toFixed(2))
  };
}

function WAPP_DOCV16_tarifa_(row) {
  if (String(row.rolKey || '') === 'formacion') return 0;
  return WAPP_DOCV16_cfg_().TARIFA_DIA_USD;
}

function WAPP_DOCV16_insertarTablaPresupuesto_(body, markers, equipo) {
  const marker = WAPP_DOCV16_primerMarcador_(body, markers);
  if (!marker) {
    throw new Error(
      'La plantilla de Presupuesto no contiene {tabla equipo}/{tabla_equipo}.'
    );
  }

  const found = body.findText(WAPP_DOCV16_escapeRegex_(marker));
  const parent = found.getElement().getParent();
  const index = body.getChildIndex(parent);

  found.getElement().asText()
    .replaceText(WAPP_DOCV16_escapeRegex_(marker), '');

  const rows = [[
    'Nombre',
    'Rol',
    'Lugar de Trabajo',
    'Evaluación Documental',
    'Evaluación en Sitio',
    'Total Días',
    'Tipo',
    'Tarifa',
    'Total ($)'
  ]];

  (equipo || []).forEach(e => {
    const tarifa = WAPP_DOCV16_tarifa_(e);
    const totalDias =
      Number(e.documental || 0) +
      Number(e.sitio || 0);

    rows.push([
      e.nombre || '',
      e.rol || '',
      e.lugarTrabajo || '',
      String(Number(e.documental || 0)),
      String(Number(e.sitio || 0)),
      String(totalDias),
      e.tipo || '',
      tarifa.toFixed(2),
      (totalDias * tarifa).toFixed(2)
    ]);
  });

  const table = body.insertTable(index + 1, rows);
  WAPP_DOCV16_boldHeader_(table);
}

/* =========================================================
 * AGENDA
 * ========================================================= */

function WAPP_DOCV16_generarAgenda_(c, destinos) {
  const asistencia = WAPP_ASISTV16_prepararAgenda_(c);

  const nombre = WAPP_DOCV16_nombreDocumento_(
    'Agenda',
    c.ctx.registro,
    c.evaluacion.tipoEvaluacion,
    c.evaluacion.fechaInicio
  );

  const template = DriveApp.getFileById(
    WAPP_DOCV16_cfg_().TEMPLATE_AGENDA
  );

  const copy = template.makeCopy(nombre, destinos.agenda);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();

  const roles = WAPP_DOCV16_resumenRoles_(c.equipo);
  const representante =
    c.ctx.representanteLegal ||
    c.ctx.contacto ||
    'Nombre del Representante';

  const oficial =
    c.ctx.ciclo && c.ctx.ciclo.oficialAsignado
      ? c.ctx.ciclo.oficialAsignado
      : (roles.oficial || c.user.nombre || c.user.email);

  WAPP_DOCV16_replace_(body, '<<Tipo>>', c.evaluacion.tipoEvaluacion);
  WAPP_DOCV16_replace_(body, '<<Nombre OEC>>', c.ctx.razonSocial);
  WAPP_DOCV16_replace_(body, '<<Registro de acreditación>>', c.ctx.registro);
  WAPP_DOCV16_replace_(body, '<<Norma>>', c.ctx.norma);
  WAPP_DOCV16_replace_(body, '<<Criterio>>', WAPP_DOCV16_criterio_(c.ctx.norma));
  WAPP_DOCV16_replace_(body, '<<Evaluador(a) Líder>>', roles.lider);
  WAPP_DOCV16_replace_(body, '<<Evaluador(a) Técnico(a)>>', roles.tecnico);
  WAPP_DOCV16_replace_(body, '<<Experto(a) Técnico(a)>>', roles.experto);
  WAPP_DOCV16_replace_(body, '<<Evaluador(a) en Acompañamiento>>', roles.acompana);
  WAPP_DOCV16_replace_(body, '<<Personal en Formación>>', roles.formacion);
  WAPP_DOCV16_replace_(body, '<<Representante del OEC>>', representante);
  WAPP_DOCV16_replace_(body, '<<Oficial de Acreditación>>', oficial);
  WAPP_DOCV16_replace_(
    body,
    '{fecha inicial}',
    WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaInicio)
  );
  WAPP_DOCV16_replace_(
    body,
    '{fecha final}',
    WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaFinal)
  );

  WAPP_DOCV16_replaceLink_(
    body,
    ['{r_inicial}', '{{r_inicial}', '{{r_inicial}}'],
    'Lista_de_Asistencia_Reunion_Inicial',
    asistencia.inicial.url
  );

  WAPP_DOCV16_replaceLink_(
    body,
    ['{r_final}', '{{r_final}', '{{r_final}}'],
    'Lista_de_Asistencia_Reunion_Final',
    asistencia.final.url
  );

  WAPP_DOCV16_insertarTablaAgenda_(
    body,
    ['{tabla_equipo}', '{tabla equipo}'],
    c.equipo,
    representante
  );

  WAPP_DOCV16_insertarInstalacionesAgenda_(
    body,
    c.evaluacion.instalacionesProgramadas || []
  );

  doc.saveAndClose();

  const backup = DriveApp.getFileById(copy.getId())
    .makeCopy(nombre, destinos.backupAgenda);

  return {
    aplica: true,
    generado: true,
    formato: 'Google Docs editable',
    nombre: nombre,
    primary: WAPP_DOCV16_fileInfo_(
      DriveApp.getFileById(copy.getId())
    ),
    backup: WAPP_DOCV16_fileInfo_(backup),
    asistencia: asistencia
  };
}

function WAPP_DOCV16_insertarTablaAgenda_(body, markers, equipo, representante) {
  const marker = WAPP_DOCV16_primerMarcador_(body, markers);
  if (!marker) {
    throw new Error(
      'La plantilla de Agenda no contiene {tabla_equipo}/{tabla equipo}.'
    );
  }

  const found = body.findText(WAPP_DOCV16_escapeRegex_(marker));
  const el = found.getElement();
  const parent = el.getParent();
  const index = body.getChildIndex(parent);

  el.asText().replaceText(
    WAPP_DOCV16_escapeRegex_(marker),
    ''
  );

  const rows = [['Nombre', 'Rol']];

  (equipo || [])
    .filter(e => String(e.rolKey || '') !== 'oficial')
    .forEach(e => {
      const nombre = e.area
        ? (e.nombre + ' (' + e.area + ')')
        : e.nombre;

      rows.push([nombre || '', e.rol || '']);
    });

  rows.push([
    representante || 'Nombre del Representante',
    'Representante del OEC'
  ]);

  const table = body.insertTable(index + 1, rows);
  WAPP_DOCV16_boldHeader_(table);
}

function WAPP_DOCV16_insertarInstalacionesAgenda_(body, instalaciones) {
  const list = Array.isArray(instalaciones) ? instalaciones : [];
  if (!list.length) return false;

  let target = null;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.TABLE) continue;

    const table = child.asTable();
    if (!table.getNumRows()) continue;

    const txt = WAPP_norm_(table.getRow(0).getText());
    if (
      txt.includes('instalacion programada') &&
      txt.includes('alcance programado')
    ) {
      target = table;
      break;
    }
  }

  if (!target) {
    throw new Error(
      'La plantilla de Agenda no contiene la tabla "Instalación programada / Alcance programado".'
    );
  }

  // Mantener encabezado y reconstruir el contenido.
  while (target.getNumRows() > 1) {
    target.removeRow(target.getNumRows() - 1);
  }

  list.forEach(s => {
    const row = target.appendTableRow();
    const lugar = [
      String(s.sitioNombre || s.sitioId || '').trim(),
      String(s.direccion || '').trim()
    ].filter(Boolean).join('\n');

    row.appendTableCell(lugar);
    row.appendTableCell(String(s.alcanceProgramado || '').trim());
  });

  return true;
}

/* =========================================================
 * INFORME
 * ========================================================= */

function WAPP_DOCV16_generarInforme_(c, destinos) {
  const nombre = WAPP_DOCV16_nombreDocumento_(
    'Informe',
    c.ctx.registro,
    c.evaluacion.tipoEvaluacion,
    c.evaluacion.fechaInicio
  );

  const template = DriveApp.getFileById(
    WAPP_DOCV16_cfg_().TEMPLATE_INFORME
  );

  const copy = template.makeCopy(nombre, destinos.informe);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();

  const representante =
    c.ctx.representanteLegal ||
    c.ctx.contacto ||
    'Nombre del Representante';

  const roles = WAPP_DOCV16_resumenRoles_(c.equipo);
  const oficial =
    c.ctx.ciclo && c.ctx.ciclo.oficialAsignado
      ? c.ctx.ciclo.oficialAsignado
      : (roles.oficial || c.user.nombre || c.user.email);

  const entrega = WAPP_DOCV16_fechaEntregaAC_(
    c.evaluacion.fechaFinal,
    c.evaluacion.tipoEvaluacion
  );

  WAPP_DOCV16_replace_(body, '{Registro de acreditación}', c.ctx.registro);
  WAPP_DOCV16_replace_(body, '{Tipo de Evaluación}', c.evaluacion.tipoEvaluacion);
  WAPP_DOCV16_replace_(body, '{Esquema de acreditación}', c.ctx.tipo);
  WAPP_DOCV16_replace_(body, '{Norma}', c.ctx.norma);
  WAPP_DOCV16_replace_(body, '{Nombre OEC}', c.ctx.razonSocial);
  WAPP_DOCV16_replace_(body, '{Oficial de Acreditación}', oficial);
  WAPP_DOCV16_replace_(
    body,
    '{Fecha inicial de evaluación}',
    WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaInicio)
  );
  WAPP_DOCV16_replace_(
    body,
    '{Fecha final de evaluación}',
    WAPP_DOCV16_fechaDMY_(c.evaluacion.fechaFinal)
  );
  WAPP_DOCV16_replace_(
    body,
    '{Fecha de entrega de acciones correctivas}',
    entrega
  );
  WAPP_DOCV16_replace_(body, '{fecha}', WAPP_DOCV16_fechaLarga_(new Date()));

  WAPP_DOCV16_insertarTablaFirmas_(
    body,
    ['{tabla_equipo}', '{tabla equipo}'],
    c.equipo,
    representante
  );

  WAPP_DOCV16_insertarInstalacionesInforme_(
    body,
    c.evaluacion.instalacionesProgramadas || []
  );

  doc.saveAndClose();

  const backup = DriveApp.getFileById(copy.getId())
    .makeCopy(nombre, destinos.backupInforme);

  return {
    aplica: true,
    generado: true,
    formato: 'Google Docs editable',
    nombre: nombre,
    primary: WAPP_DOCV16_fileInfo_(
      DriveApp.getFileById(copy.getId())
    ),
    backup: WAPP_DOCV16_fileInfo_(backup)
  };
}


function WAPP_DOCV16_insertarInstalacionesInforme_(body, instalaciones) {
  const list = Array.isArray(instalaciones) ? instalaciones : [];
  let target = null;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.TABLE) continue;

    const table = child.asTable();
    if (!table.getNumRows()) continue;

    const header = WAPP_DOCV16_normHeader_(
      table.getRow(0).getText()
    );

    if (
      header.includes('instalacion sucursal evaluada direccion') &&
      header.includes('personal evaluado') &&
      header.includes('alcance evaluado')
    ) {
      target = table;
      break;
    }
  }

  if (!target) {
    throw new Error(
      'La plantilla de Informe no contiene la tabla del Anexo I ' +
      '"Instalación/Sucursal Evaluada – Dirección / Personal Evaluado / Alcance Evaluado".'
    );
  }

  while (target.getNumRows() > 1) {
    target.removeRow(target.getNumRows() - 1);
  }

  if (!list.length) {
    const row = target.appendTableRow();
    row.appendTableCell('');
    row.appendTableCell('');
    row.appendTableCell('');
    return { ok: true, total: 0 };
  }

  list.forEach(s => {
    const row = target.appendTableRow();

    const instalacion = [
      String(s.sitioNombre || s.sitioId || '').trim(),
      String(s.direccion || '').trim()
    ].filter(Boolean).join('\n');

    row.appendTableCell(instalacion);

    // Queda editable en campo por el equipo evaluador.
    row.appendTableCell('');

    row.appendTableCell(
      String(s.alcanceProgramado || '').trim()
    );
  });

  return { ok: true, total: list.length };
}

function WAPP_DOCV16_normHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function WAPP_DOCV16_insertarTablaFirmas_(body, markers, equipo, representante) {
  const marker = WAPP_DOCV16_primerMarcador_(body, markers);
  if (!marker) {
    throw new Error(
      'La plantilla de Informe no contiene {tabla_equipo}/{tabla equipo}.'
    );
  }

  const found = body.findText(WAPP_DOCV16_escapeRegex_(marker));
  const el = found.getElement();
  const parent = el.getParent();
  const index = body.getChildIndex(parent);

  el.asText().replaceText(
    WAPP_DOCV16_escapeRegex_(marker),
    ''
  );

  const rows = [['Nombre', 'Rol', 'Firma']];

  (equipo || [])
    .filter(e => String(e.rolKey || '') !== 'oficial')
    .forEach(e => {
      const nombre = e.area
        ? (e.nombre + ' (' + e.area + ')')
        : e.nombre;

      rows.push([nombre || '', e.rol || '', '']);
    });

  rows.push([
    representante || 'Nombre del Representante',
    'Representante del OEC',
    ''
  ]);

  const table = body.insertTable(index + 1, rows);
  WAPP_DOCV16_boldHeader_(table);
}

/* =========================================================
 * HELPERS COMUNES
 * ========================================================= */

function WAPP_DOCV16_primerMarcador_(body, markers) {
  for (let i = 0; i < markers.length; i++) {
    if (body.findText(WAPP_DOCV16_escapeRegex_(markers[i]))) {
      return markers[i];
    }
  }
  return '';
}

function WAPP_DOCV16_replace_(body, marker, value) {
  body.replaceText(
    WAPP_DOCV16_escapeRegex_(marker),
    String(value == null ? '' : value)
  );
}

function WAPP_DOCV16_replaceLink_(body, markers, label, url) {
  markers.forEach(marker => {
    let found = body.findText(WAPP_DOCV16_escapeRegex_(marker));

    while (found) {
      const text = found.getElement().asText();
      const start = found.getStartOffset();
      const end = found.getEndOffsetInclusive();

      text.deleteText(start, end);

      if (url) {
        text.insertText(start, label);
        text.setLinkUrl(
          start,
          start + label.length - 1,
          url
        );
      }

      found = body.findText(
        WAPP_DOCV16_escapeRegex_(marker),
        found
      );
    }
  });
}

function WAPP_DOCV16_escapeRegex_(text) {
  return String(text || '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function WAPP_DOCV16_boldHeader_(table) {
  if (!table || !table.getNumRows()) return;

  const row = table.getRow(0);
  for (let c = 0; c < row.getNumCells(); c++) {
    row.getCell(c).editAsText().setBold(true);
  }
}

function WAPP_DOCV16_resumenRoles_(equipo) {
  const r = {
    oficial: [],
    lider: [],
    tecnico: [],
    experto: [],
    acompana: [],
    formacion: []
  };

  (equipo || []).forEach(e => {
    const key = String(e.rolKey || '');

    if (key === 'oficial') r.oficial.push(e.nombre);
    else if (key === 'lider') r.lider.push(e.nombre);
    else if (key === 'tecnico') r.tecnico.push(e.nombre);
    else if (key === 'experto') r.experto.push(e.nombre);
    else if (key.indexOf('acomp_') === 0) r.acompana.push(e.nombre);
    else if (key === 'formacion') r.formacion.push(e.nombre);
  });

  return {
    oficial: r.oficial.join('\n'),
    lider: r.lider.join('\n'),
    tecnico: r.tecnico.join('\n'),
    experto: r.experto.join('\n'),
    acompana: r.acompana.join('\n'),
    formacion: r.formacion.join('\n')
  };
}

function WAPP_DOCV16_nombreDocumento_(documento, registro, tipo, fechaInicio) {
  return [
    WAPP_DOCV16_nombreSeguro_(documento),
    WAPP_DOCV16_registroSeguro_(registro),
    WAPP_DOCV16_nombreSeguro_(tipo),
    WAPP_DOCV16_fechaISO_(fechaInicio)
  ].filter(Boolean).join('_');
}

function WAPP_DOCV16_nombreSeguro_(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\:*?"<>|#%{}~&]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function WAPP_DOCV16_registroSeguro_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

function WAPP_DOCV16_fechaISO_(value) {
  const d = WAPP_DOCV16_parseDate_(value);
  if (!d) return String(value || '').trim();

  return Utilities.formatDate(
    d,
    WAPP_cfg_().TZ,
    'yyyy-MM-dd'
  );
}

function WAPP_DOCV16_fechaDMY_(value) {
  const d = WAPP_DOCV16_parseDate_(value);
  if (!d) return String(value || '').trim();

  return Utilities.formatDate(
    d,
    WAPP_cfg_().TZ,
    'dd/MM/yyyy'
  );
}

function WAPP_DOCV16_parseDate_(value) {
  if (!value) return null;

  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value)
  ) {
    return value;
  }

  const s = String(value).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3])
    );
  }

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );
  }

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function WAPP_DOCV16_fechaLarga_(date) {
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'
  ];

  return 'Guatemala, ' +
    date.getDate() + ' de ' +
    meses[date.getMonth()] + ' de ' +
    date.getFullYear();
}

function WAPP_DOCV16_fechaEntregaAC_(fechaFinal, tipo) {
  const base = WAPP_DOCV16_parseDate_(fechaFinal);
  if (!base) return 'No Aplica';

  const n = WAPP_norm_(tipo);
  if (n.includes('acciones correctivas')) {
    return 'No Aplica';
  }

  const meses = n === 'evaluacion inicial' ? 5 : 2;
  const out = WAPP_DOCV16_addMonths_(base, meses);

  return WAPP_DOCV16_fechaDMY_(out);
}

function WAPP_DOCV16_addMonths_(date, count) {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );

  const originalDay = date.getDate();
  d.setMonth(d.getMonth() + count);

  const last = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate();

  d.setDate(Math.min(originalDay, last));
  return d;
}

function WAPP_DOCV16_textoMantenimiento_(tipo) {
  const t = WAPP_norm_(tipo);

  if (t === 'evaluacion inicial') {
    return 'La tarifa por concepto de concesión de acreditación es de Ochocientos Dólares de los Estados Unidos (US$ 800.00) y debe ser cancelada por el OEC al ser notificado de la decisión de acreditación de acuerdo al monto establecido en la respectiva boleta de pago.';
  }

  if ([
    'evaluacion de seguimiento',
    'evaluacion de ampliacion',
    'reevaluacion',
    'reevaluacion y ampliacion',
    'evaluacion de seguimiento y ampliacion'
  ].includes(t)) {
    return 'La tarifa anual por concepto de mantenimiento de la acreditación es de Quinientos Dólares de los Estados Unidos (US$ 500.00) y debe ser cancelada por el OEC al ser notificado y de acuerdo al monto establecido en la respectiva boleta de pago.';
  }

  return '';
}

function WAPP_DOCV16_criterio_(norma) {
  const t = String(norma || '').trim();

  if (t === 'NTG ISO/IEC 17025:2017') {
    return 'OGA-CEC-006 Criterios para acreditación de laboratorios de ensayo y calibración, OGA-CLE-023 Criterios para la acreditación de laboratorios de Ciencias Forenses (Cuando aplique)';
  }

  if (t === 'NTG ISO/IEC 17020:12' || t === 'NTG ISO/IEC 17020:2012') {
    return 'OGA-COI-010 Criterios para la acreditación de Organismos de Inspección';
  }

  if (t === 'NTG ISO 15189:2022') {
    return '';
  }

  return '';
}

function WAPP_DOCV16_fileInfo_(file) {
  return {
    id: file.getId(),
    nombre: file.getName(),
    url: file.getUrl()
  };
}

/* =========================================================
 * AUDITORÍA
 * ========================================================= */

function WAPP_DOCV16_auditar_(c, result) {
  try {
    const cfg = WAPP_cfg_();
    const ss = SpreadsheetApp.openById(cfg.REGISTRO_BOLETAS_ID);
    const name = 'Bitacora_WebApp_Documentos';

    let sh = ss.getSheetByName(name);

    const headers = [
      'Fecha',
      'Ambiente',
      'Operacion_ID',
      'Usuario',
      'Registro_OEC',
      'Tipo_Evaluacion',
      'Fecha_Inicial',
      'Fecha_Final',
      'Presupuesto_Principal',
      'Presupuesto_Respaldo',
      'Agenda_Principal',
      'Agenda_Respaldo',
      'Informe_Principal',
      'Informe_Respaldo',
      'Estado',
      'Observaciones'
    ];

    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length)
        .setValues([headers]);
      sh.setFrozenRows(1);
    }

    const auditData = {
      Fecha: new Date(),
      Ambiente: WAPP_getEnv_(),
      Operacion_ID: result.operacionId,
      Usuario: c.user.email,
      Registro_OEC: c.ctx.registro,
      Tipo_Evaluacion: c.evaluacion.tipoEvaluacion,
      Fecha_Inicial: c.evaluacion.fechaInicio,
      Fecha_Final: c.evaluacion.fechaFinal,
      Presupuesto_Principal:
        result.presupuesto &&
        result.presupuesto.primary &&
        result.presupuesto.primary.url || '',
      Presupuesto_Respaldo:
        result.presupuesto &&
        result.presupuesto.backup &&
        result.presupuesto.backup.url || '',
      Agenda_Principal:
        result.agenda &&
        result.agenda.primary &&
        result.agenda.primary.url || '',
      Agenda_Respaldo:
        result.agenda &&
        result.agenda.backup &&
        result.agenda.backup.url || '',
      Informe_Principal:
        result.informe &&
        result.informe.primary &&
        result.informe.primary.url || '',
      Informe_Respaldo:
        result.informe &&
        result.informe.backup &&
        result.informe.backup.url || '',
      Estado: result.estado || '',
      Observaciones:
        'V1.8.1: documentos y operación registrados; revisar estado de Boleta/Calendario/Correo en Bitacora_WebApp_Operacion.'
    };

    if (typeof WAPP_INT_upsertByKey_ === 'function') {
      WAPP_INT_upsertByKey_(
        sh,
        'Operacion_ID',
        result.operacionId,
        auditData
      );
    } else {
      WAPP_appendByHeaders_(sh, auditData);
    }

  } catch (e) {
    console.warn(
      '[DOCV16] No se pudo registrar bitácora documental:',
      e
    );
  }
}

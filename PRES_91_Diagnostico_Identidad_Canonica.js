/**
 * 91_Diagnostico_Identidad_Canonica
 * DIAGNÓSTICO PRODUCTIVO READ-ONLY DE IDENTIDAD CANÓNICA
 *
 * Regla:
 * - OGA-LE-001-01 se excluye del universo institucional válido.
 * - Una identidad operacional es autoritativamente alineada cuando
 *   Equipo_Evaluador converge a una sola fila de Presupuesto y
 *   Presupuesto.ID_Evaluacion coincide explícitamente con el ID del equipo.
 * - Este módulo NO escribe datos.
 */

const WAPP_DIAG_ID = {
  VERSION: 'DIAG-ID-CANONICA-20260920-R1',
  EXCLUDED_TEST_REGISTERS: ['OGA-LE-001-01']
};

function TEST_WAPP_DIAG_ID_CIERRE_CANONICO_PROD() {
  WAPP_SEC_assertUsuarioInterno_();
  var out = WAPP_DIAG_ID_scan_();
  console.log(
    '[TEST_WAPP_DIAG_ID_CIERRE_CANONICO_PROD] ' +
    JSON.stringify(out)
  );
  return out;
}

function WAPP_DIAG_ID_scan_() {
  var cfg = WAPP_CONFIG && WAPP_CONFIG.PROD;
  if (!cfg || !String(cfg.REGISTRO_BOLETAS_ID || '').trim()) {
    throw new Error('PROD.REGISTRO_BOLETAS_ID no configurado.');
  }

  var ss = SpreadsheetApp.openById(String(cfg.REGISTRO_BOLETAS_ID).trim());
  var pres = ss.getSheetByName(cfg.HOJA_PRESUPUESTO || 'Presupuesto');
  var eq = ss.getSheetByName(cfg.HOJA_EQUIPO_EVALUADOR || 'Equipo_Evaluador');

  if (!pres || !eq) {
    throw new Error('Falta Presupuesto o Equipo_Evaluador PROD.');
  }

  var pHeaders = WAPP_DIAG_ID_headers_(pres);
  var pIdx = WAPP_DIAG_ID_index_(pHeaders);
  var eHeaders = WAPP_DIAG_ID_headers_(eq);
  var eIdx = WAPP_DIAG_ID_index_(eHeaders);

  ['Registro OEC','ID_Evaluacion'].forEach(function(h){
    if (pIdx[h] === undefined) throw new Error('Falta header Presupuesto: ' + h);
  });

  ['ID_Evaluacion','Registro_OEC','Estado_Asignacion','Acceso_Documentos',
   'Fila_Presupuesto','ID_Presupuesto','Vigente'].forEach(function(h){
    if (eIdx[h] === undefined) throw new Error('Falta header Equipo_Evaluador: ' + h);
  });

  var pVals = pres.getLastRow() >= 2
    ? pres.getRange(2,1,pres.getLastRow()-1,pres.getLastColumn()).getDisplayValues()
    : [];

  var eVals = eq.getLastRow() >= 2
    ? eq.getRange(2,1,eq.getLastRow()-1,eq.getLastColumn()).getDisplayValues()
    : [];

  var presByRow = {};
  var presRowsById = {};

  pVals.forEach(function(row, i){
    var sheetRow = i + 2;
    var registro = WAPP_DIAG_ID_normReg_(row[pIdx['Registro OEC']]);
    var id = String(row[pIdx['ID_Evaluacion']] || '').trim();

    presByRow[sheetRow] = {
      rowNumber: sheetRow,
      registro: registro,
      idEvaluacion: id
    };

    if (id) {
      if (!presRowsById[id]) presRowsById[id] = [];
      presRowsById[id].push(sheetRow);
    }
  });

  var groups = {};

  eVals.forEach(function(row, i){
    var id = String(row[eIdx['ID_Evaluacion']] || '').trim();
    if (!id) return;

    if (!groups[id]) groups[id] = [];

    var estado = String(row[eIdx['Estado_Asignacion']] || '').trim();
    var acceso = String(row[eIdx['Acceso_Documentos']] || '').trim();
    var vigente = String(row[eIdx['Vigente']] || '').trim();

    groups[id].push({
      sheetRow: i + 2,
      registro: WAPP_DIAG_ID_normReg_(row[eIdx['Registro_OEC']]),
      estado: estado,
      acceso: acceso,
      vigente: vigente,
      filaPresupuesto: Number(row[eIdx['Fila_Presupuesto']] || 0) || 0,
      idPresupuesto: String(row[eIdx['ID_Presupuesto']] || '').trim(),
      operational: WAPP_DIAG_ID_isOperational_(estado, acceso, vigente)
    });
  });

  var ids = Object.keys(groups).sort();

  var excluded = [];
  var historical = [];
  var operationalAligned = [];
  var operationalUnresolved = [];
  var targetClaims = {};

  ids.forEach(function(id){
    var rows = groups[id];
    var registros = WAPP_DIAG_ID_uniqueText_(rows.map(function(r){ return r.registro; }));
    var registro = registros.length === 1 ? registros[0] : '';

    if (registro && WAPP_DIAG_ID.EXCLUDED_TEST_REGISTERS.indexOf(registro) >= 0) {
      excluded.push({
        idEvaluacion: id,
        registro: registro,
        totalFilasEquipo: rows.length,
        motivo: 'EXCLUIDO_PRUEBA'
      });
      return;
    }

    var operationalRows = rows.filter(function(r){ return r.operational; });

    if (!operationalRows.length) {
      historical.push({
        idEvaluacion: id,
        registro: registro,
        totalFilasEquipo: rows.length,
        clasificacion: 'HISTORICO'
      });
      return;
    }

    var targets = WAPP_DIAG_ID_uniqueNums_(operationalRows.map(function(r){
      return r.filaPresupuesto;
    }));

    var reasons = [];

    if (registros.length !== 1) reasons.push('REGISTRO_EQUIPO_NO_UNICO');
    if (targets.length !== 1) reasons.push('TARGET_OPERACIONAL_NO_UNICO');

    var targetRow = targets.length === 1 ? targets[0] : 0;
    var target = targetRow ? presByRow[targetRow] : null;

    if (!target) reasons.push('TARGET_PRESUPUESTO_INEXISTENTE');

    if (target && registro && target.registro !== registro) {
      reasons.push('REGISTRO_TARGET_NO_COINCIDE');
    }

    if (target && target.idEvaluacion !== id) {
      reasons.push(target.idEvaluacion
        ? 'TARGET_OCUPADO_POR_OTRO_ID'
        : 'TARGET_SIN_ID_EVALUACION');
    }

    var wrongIdPres = operationalRows.filter(function(r){
      if (!targetRow) return true;
      if (!r.idPresupuesto) return false;
      return r.idPresupuesto !== ('PRES-' + targetRow);
    });

    if (wrongIdPres.length) reasons.push('ID_PRESUPUESTO_INCONSISTENTE');

    var idRows = presRowsById[id] || [];
    var idElsewhere = idRows.filter(function(r){ return r !== targetRow; });

    if (idElsewhere.length) reasons.push('ID_EVALUACION_DUPLICADO_EN_PRESUPUESTO');

    var detail = {
      idEvaluacion: id,
      registro: registro,
      totalFilasEquipo: rows.length,
      filasOperacionales: operationalRows.length,
      targetRow: targetRow,
      targetRegistro: target ? target.registro : '',
      targetId: target ? target.idEvaluacion : '',
      idPresupuestoVacios: operationalRows.filter(function(r){
        return !r.idPresupuesto;
      }).length,
      razones: reasons
    };

    if (!reasons.length) {
      operationalAligned.push(detail);
      if (!targetClaims[targetRow]) targetClaims[targetRow] = [];
      targetClaims[targetRow].push(id);
    } else {
      operationalUnresolved.push(detail);
    }
  });

  var duplicateTargetClaims = [];

  Object.keys(targetClaims).forEach(function(rowKey){
    var owners = targetClaims[rowKey];
    if (owners.length > 1) {
      duplicateTargetClaims.push({
        targetRow: Number(rowKey),
        ids: owners.slice()
      });
    }
  });

  var duplicatedIds = {};
  duplicateTargetClaims.forEach(function(x){
    x.ids.forEach(function(id){ duplicatedIds[id] = true; });
  });

  var finalAligned = operationalAligned.filter(function(x){
    return !duplicatedIds[x.idEvaluacion];
  });

  var duplicatedOperational = operationalAligned
    .filter(function(x){ return duplicatedIds[x.idEvaluacion]; })
    .map(function(x){
      var copy = JSON.parse(JSON.stringify(x));
      copy.razones = ['TARGET_RECLAMADO_POR_MULTIPLES_IDS'];
      return copy;
    });

  var finalUnresolved = operationalUnresolved.concat(duplicatedOperational);

  var duplicateIdsPresupuesto = [];
  Object.keys(presRowsById).forEach(function(id){
    if (presRowsById[id].length > 1) {
      duplicateIdsPresupuesto.push({
        idEvaluacion: id,
        filas: presRowsById[id].slice()
      });
    }
  });

  var r23 = (typeof WAPP_P1_R23_scan_ === 'function')
    ? WAPP_P1_R23_scan_('PROD')
    : null;

  var effective = {
    totalIdentidadesEquipo: ids.length,
    excluidasPrueba: excluded.length,
    institucionalesValidas: ids.length - excluded.length,
    operacionalAlineadoAutoritativo: finalAligned.length,
    operacionalPendiente: finalUnresolved.length,
    historico: historical.length,
    targetsOperacionalesDuplicados: duplicateTargetClaims.length,
    idsDuplicadosPresupuesto: duplicateIdsPresupuesto.length
  };

  var ok =
    finalUnresolved.length === 0 &&
    duplicateTargetClaims.length === 0 &&
    duplicateIdsPresupuesto.length === 0;

  return {
    ok: ok,
    version: WAPP_DIAG_ID.VERSION,
    ambiente: 'PROD',
    modificaDatos: false,

    politica: {
      prioridadIdentidad:
        'Presupuesto.ID_Evaluacion explícito + ancla física Equipo_Evaluador',
      registrosExcluidos:
        WAPP_DIAG_ID.EXCLUDED_TEST_REGISTERS,
      diagnosticoHistorico:
        r23
          ? 'Existe diagnóstico histórico auxiliar; la vista canónica sigue siendo la autoridad.'
          : 'Diagnóstico histórico auxiliar no instalado; no es requerido para la vista canónica.'
    },

    diagnosticoHistoricoAuxiliar: r23 ? {
      totalIdentidadesEquipo: Number(r23.totalIdentidadesEquipo || 0),
      resumenClasificaciones: r23.resumenClasificaciones || {},
      totalRebindSeguro: Number(r23.totalRebindSeguro || 0),
      totalBloqueosOperacionales: Number(r23.totalBloqueosOperacionales || 0),
      totalConflictosObjetivo: Number(r23.totalConflictosObjetivo || 0)
    } : null,

    vistaCanonica: effective,
    pendientesInstitucionales: finalUnresolved,
    targetsOperacionalesDuplicados: duplicateTargetClaims,
    idsDuplicadosPresupuesto: duplicateIdsPresupuesto,
    registrosPruebaExcluidos: excluded,
    muestraAlineadosAutoritativos: finalAligned.slice(0, 15),

    gateP1: {
      listoParaCerrar: ok === true,
      criterio:
        'Cero pendientes operacionales institucionales, cero targets duplicados y cero ID_Evaluacion duplicados en Presupuesto.'
    }
  };
}

function WAPP_DIAG_ID_isOperational_(estado, acceso, vigente) {
  var e = WAPP_DIAG_ID_normText_(estado);
  var a = WAPP_DIAG_ID_normText_(acceso);
  var v = WAPP_DIAG_ID_normText_(vigente);

  if (['SUSTITUIDO','CANCELADO','HISTORICO','HISTORICA','REVOCADO'].indexOf(e) >= 0) {
    return false;
  }

  return e === 'ACTIVO' || v === 'SI' || a === 'SI';
}

function WAPP_DIAG_ID_headers_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1,1,1,lastCol).getDisplayValues()[0]
    .map(function(h){ return String(h || '').trim(); });
}

function WAPP_DIAG_ID_index_(headers) {
  var out = {};
  (headers || []).forEach(function(h,i){
    if (h && out[h] === undefined) out[h] = i;
  });
  return out;
}

function WAPP_DIAG_ID_normReg_(v) {
  return String(v || '').trim().toUpperCase();
}

function WAPP_DIAG_ID_normText_(v) {
  return String(v || '').trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'');
}

function WAPP_DIAG_ID_uniqueNums_(arr) {
  var seen = {};
  var out = [];
  (arr || []).forEach(function(v){
    var n = Number(v || 0);
    if (!n || seen[n]) return;
    seen[n] = true;
    out.push(n);
  });
  out.sort(function(a,b){ return a-b; });
  return out;
}

function WAPP_DIAG_ID_uniqueText_(arr) {
  var seen = {};
  var out = [];
  (arr || []).forEach(function(v){
    var s = String(v || '').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  out.sort();
  return out;
}

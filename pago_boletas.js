/** =========================================================
 *  RegistroPagos.gs — SPA Edition
 *  ✅ ELIMINADO: mostrarPanelMenu(), google.script.host.close()
 *     → navegación manejada por OGA.irAlMenu()
 *  ✅ RENOMBRADO: funciones auxiliares con prefijo rp_
 * ========================================================= */

function registrarPagoBoleta(datos) {
  const ID_REGISTROS = '19SGkQ_2T0nzZt6ye9UipTyEDdcK00qk3lyHBfRiYZBs';
  const ID_ACTIVIDAD = '1QpTvI3pPEuhS5FnLiWfnLjCMCKnvkzR1iz5t_Xu4gK8';

  const hojaReg = SpreadsheetApp.openById(ID_REGISTROS).getSheetByName('Registros');
  const hojaAct = SpreadsheetApp.openById(ID_ACTIVIDAD).getSheetByName('Actividad');

  const fila = Number(datos.fila);
  if (!fila || fila < 2) throw new Error('⚠️ Fila inválida. No se puede registrar el pago.');

  const nombreOEC   = hojaReg.getRange(fila, 4).getValue();
  const responsable = getNombreUsuarioActivo();
  const fechaHora   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  const boletaNum = (datos && datos.correlativo)
    ? String(datos.correlativo).trim().padStart(4, '0')
    : String(hojaReg.getRange(fila, 3).getValue() || '').trim();

  // Actualizar columnas en hoja Registros
  hojaReg.getRange(fila, 8).setValue('Pagado');
  hojaReg.getRange(fila, 9).setValue(Number(datos.monto) || 0);
  hojaReg.getRange(fila, 9).setNumberFormat('#,##0.00');
  hojaReg.getRange(fila, 10).setValue(datos.fecha);
  hojaReg.getRange(fila, 11).setValue(datos.banco);
  hojaReg.getRange(fila, 12).setValue(datos.referencia);
  hojaReg.getRange(fila, 14).setValue(responsable);
  hojaReg.getRange(fila, 19).setValue(datos.recibo63A);

  // Registrar en hoja Actividad
  hojaAct.appendRow([
    fechaHora,
    responsable,
    'Registro de pago',
    `Se registró pago para la boleta (${boletaNum}) de ${nombreOEC} por Q. ${Number(datos.monto).toFixed(2)}`
  ]);
}

function buscarBoletaPorAnioYCorrelativo(anio, correlativo) {
  const ID_REGISTROS = '19SGkQ_2T0nzZt6ye9UipTyEDdcK00qk3lyHBfRiYZBs';
  const hoja  = SpreadsheetApp.openById(ID_REGISTROS).getSheetByName('Registros');
  const datos = hoja.getDataRange().getValues();
  const correlativoBuscado = correlativo.padStart(4, '0');

  Logger.log('🔍 Buscando boleta: Año=%s, Correlativo=%s', anio, correlativoBuscado);

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    let identificador = fila[2];
    if (!identificador) continue;

    identificador = String(identificador).trim();

    if (identificador.startsWith(anio) && (identificador.match(/-/g) || []).length >= 2) {
      const partes = identificador.split('-');
      const corrExtraido = partes[partes.length - 1];

      if (corrExtraido.trim() === correlativoBuscado) {
        const montoLimpio = parseFloat(String(fila[6]).replace(',', '.').trim()) || 0;
        Logger.log('✅ Encontrada fila %s', i + 1);
        return {
          fila:     i + 1,
          estado:   fila[7],
          registro: fila[3],
          nombre:   fila[4],
          monto:    montoLimpio
        };
      }
    }
  }

  Logger.log('❌ No encontrada: Año=%s Correlativo=%s', anio, correlativoBuscado);
  return null;
}

// ── Alias para el HTML ──
// getNombreUsuarioActivo() ya debe existir en Session.gs o Usuarios.gs
// buscarDatosOEC_Presupuesto() ya debe existir en el módulo de presupuestos
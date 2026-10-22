/*************************************************
 * PANEL DE REPORTES OEC
 * ESTRUCTURA REAL HOJA "Registros" (A:T)
 *************************************************/

const REPORTE_CFG = {
  ID_HOJA_REGISTROS: '19SGkQ_2T0nzZt6ye9UipTyEDdcK00qk3lyHBfRiYZBs',
  NOMBRE_HOJA_REGISTROS: 'Registros',

  ID_HOJA_BASE_OEC: '1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc',
  NOMBRE_HOJA_BASE_OEC: 'Respuestas de formulario 1',

  ID_CARPETA_REPORTES: '1FvOAGTlmLL3RBelk1qOhZtY97j7h-les'
};

const COL = {
  CORRELATIVO: 0,             // A
  FECHA: 1,                   // B
  IDENTIFICADOR: 2,           // C
  REGISTRO_OEC: 3,            // D
  TASA_CAMBIO: 4,             // E
  PAGO_POR: 5,                // F
  MONTO_CANCELAR_Q: 6,        // G
  STATUS: 7,                  // H
  MONTO_CANCELADO_Q: 8,       // I
  FECHA_PAGO: 9,              // J
  BANCO: 10,                  // K
  REFERENCIA: 11,             // L
  COMENTARIO_ANULACION: 12,   // M
  REGISTRADO_POR: 13,         // N
  ANULADO_MODIFICADO_POR: 14, // O
  CONCEPTO_TARIFARIO: 15,     // P
  MONTO_USD: 16,              // Q
  RESPONSABLE: 17,            // R
  RECIBO_63A: 18,             // S
  DETALLE: 19                 // T
};

/*************************************************
 * FUNCIONES PRINCIPALES
 *************************************************/

// 1) Informe por oficial
function obtenerInformePorOficial(oficial) {
  const resultados = [];
  try {
    const oficialBuscado = normalizarTextoReporte_(oficial);
    const { datos, mapaOEC } = obtenerDatosReportes_();

    resultados.push(encabezadoReporte_());

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i] || [];
      const responsable = normalizarTextoReporte_(fila[COL.RESPONSABLE]);

      if (responsable === oficialBuscado) {
        resultados.push(construirFilaReporte_(fila, mapaOEC));
      }
    }

    Logger.log('Reporte por oficial: ' + (resultados.length - 1) + ' registros');
    return resultados;
  } catch (e) {
    Logger.log('❌ Error en obtenerInformePorOficial: ' + e.message);
    throw e;
  }
}

// 2) Informe por registro
function obtenerInformePorRegistro(registro) {
  const resultados = [];
  try {
    const registroBuscado = String(registro || '').trim().toUpperCase();
    const { datos, mapaOEC } = obtenerDatosReportes_();

    resultados.push(encabezadoReporte_());

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i] || [];
      const regFila = String(fila[COL.REGISTRO_OEC] || '').trim().toUpperCase();

      if (regFila && regFila.indexOf(registroBuscado) !== -1) {
        resultados.push(construirFilaReporte_(fila, mapaOEC));
      }
    }

    Logger.log('Reporte por registro: ' + (resultados.length - 1) + ' registros');
    return resultados;
  } catch (e) {
    Logger.log('❌ Error en obtenerInformePorRegistro: ' + e.message);
    throw e;
  }
}

// 3) Informe por estatus
function obtenerInformePorEstatus(estatus) {
  const resultados = [];
  try {
    const estatusBuscado = normalizarEstatusReporte_(estatus);
    const { datos, mapaOEC } = obtenerDatosReportes_();

    resultados.push(encabezadoReporte_());

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i] || [];
      const estatusFila = normalizarEstatusReporte_(fila[COL.STATUS]);

      if (estatusFila === estatusBuscado) {
        resultados.push(construirFilaReporte_(fila, mapaOEC));
      }
    }

    Logger.log('Reporte por estatus: ' + (resultados.length - 1) + ' registros');
    return resultados;
  } catch (e) {
    Logger.log('❌ Error en obtenerInformePorEstatus: ' + e.message);
    throw e;
  }
}

// 4) Informe por mantenimiento
function obtenerInformePorMantenimiento(tipo) {
  const resultados = [];
  try {
    const { datos, mapaOEC } = obtenerDatosReportes_();
    const tipoNorm = normalizarTextoReporte_(tipo);
    const verTodos = (tipoNorm === normalizarTextoReporte_('__ALL__'));

    resultados.push(encabezadoReporte_());

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i] || [];
      const concepto = normalizarTextoReporte_(fila[COL.CONCEPTO_TARIFARIO]);

      if (!concepto) continue;

      if (verTodos) {
        if (concepto.indexOf('tarifa anual') !== -1) {
          resultados.push(construirFilaReporte_(fila, mapaOEC));
        }
      } else {
        if (concepto === tipoNorm) {
          resultados.push(construirFilaReporte_(fila, mapaOEC));
        }
      }
    }

    Logger.log('Reporte por mantenimiento: ' + (resultados.length - 1) + ' registros');
    return resultados;
  } catch (e) {
    Logger.log('❌ Error en obtenerInformePorMantenimiento: ' + e.message);
    throw e;
  }
}

// Generar PDF del reporte
function generarPDFReporte(titulo, datos) {
  try {
    if (!Array.isArray(datos) || datos.length <= 1) {
      throw new Error('No hay datos suficientes para generar el PDF.');
    }

    const html = crearHTMLParaPDF(titulo, datos);
    const blob = Utilities.newBlob(html, 'text/html', 'reporte.html')
      .getAs('application/pdf')
      .setName('Reporte_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.pdf');

    const carpeta = DriveApp.getFolderById(REPORTE_CFG.ID_CARPETA_REPORTES);
    const archivo = carpeta.createFile(blob);

    return archivo.getUrl();
  } catch (e) {
    Logger.log('❌ Error al generarPDFReporte: ' + e.message);
    throw e;
  }
}

/*************************************************
 * OBTENCIÓN DE DATOS
 *************************************************/

function obtenerDatosReportes_() {
  const hojaRegistros = SpreadsheetApp
    .openById(REPORTE_CFG.ID_HOJA_REGISTROS)
    .getSheetByName(REPORTE_CFG.NOMBRE_HOJA_REGISTROS);

  const hojaBase = SpreadsheetApp
    .openById(REPORTE_CFG.ID_HOJA_BASE_OEC)
    .getSheetByName(REPORTE_CFG.NOMBRE_HOJA_BASE_OEC);

  const datos = hojaRegistros.getDataRange().getValues();
  const datosBase = hojaBase.getDataRange().getValues();
  const mapaOEC = construirMapaOEC_(datosBase);

  return { datos, datosBase, mapaOEC };
}

function construirMapaOEC_(datosBase) {
  const mapa = {};

  if (!Array.isArray(datosBase) || datosBase.length <= 1) return mapa;

  for (let i = 1; i < datosBase.length; i++) {
    const fila = datosBase[i] || [];
    const registro = String(fila[2] || '').trim(); // Col C en base
    const nombre = String(fila[6] || '').trim();   // Col G en base

    if (registro) {
      mapa[registro] = nombre || 'Sin nombre';
    }
  }

  return mapa;
}

/*************************************************
 * CONSTRUCCIÓN DEL REPORTE
 *************************************************/

function encabezadoReporte_() {
  return [
    'Correlativo',
    'Fecha',
    'Registro OEC',
    'Nombre OEC',
    'Concepto de pago',
    'Monto Q',
    'Status'
  ];
}

function construirFilaReporte_(fila, mapaOEC) {
  const correlativo = valorSeguro_(fila[COL.CORRELATIVO]);
  const fecha = formatDateReporte_(fila[COL.FECHA]);
  const registro = String(fila[COL.REGISTRO_OEC] || '').trim();
  const nombreOEC = mapaOEC[registro] || 'No encontrado';
  const conceptoPago = String(fila[COL.CONCEPTO_TARIFARIO] || '').trim();
  const montoQ = formatCurrencyReporte_(fila[COL.MONTO_CANCELAR_Q]);
  const statusOriginal = String(fila[COL.STATUS] || '').trim();

  return [
    correlativo,
    fecha,
    registro,
    nombreOEC,
    conceptoPago,
    montoQ,
    statusOriginal
  ];
}

/*************************************************
 * TOTALES Y NORMALIZACIÓN
 *************************************************/

function normalizarTextoReporte_(valor) {
  return String(valor || '')
    .replace(/\u00A0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/\s+/g, ' ');
}

function normalizarEstatusReporte_(estatus) {
  const txt = normalizarTextoReporte_(estatus);

  if (!txt) return 'otros';

  if (
    txt === 'anulada' ||
    txt === 'anulado' ||
    txt.indexOf('anulad') !== -1
  ) {
    return 'anulado';
  }

  if (
    txt === 'pagado' ||
    txt === 'pagada' ||
    (txt.indexOf('pagad') !== -1 && txt.indexOf('no pag') === -1)
  ) {
    return 'pagado';
  }

  if (
    txt === 'no pagado' ||
    txt === 'no pagada' ||
    txt === 'no pago' ||
    txt === 'pendiente' ||
    txt.indexOf('pendiente') !== -1 ||
    txt.indexOf('no pag') !== -1 ||
    txt.indexOf('sin pago') !== -1
  ) {
    return 'pendiente';
  }

  return 'otros';
}

function calcularTotalesEstatusDesdeDatos_(datos) {
  const resumen = {
    total: 0,
    pagado: 0,
    pendiente: 0,
    anulado: 0,
    otros: 0,
    montoTotal: 0,
    montoPagado: 0,
    montoPendiente: 0,
    montoAnulado: 0,
    montoOtros: 0
  };

  if (!Array.isArray(datos) || datos.length <= 1) return resumen;

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i] || [];

    // [0] Correlativo
    // [1] Fecha
    // [2] Registro OEC
    // [3] Nombre OEC
    // [4] Concepto de pago
    // [5] Monto Q
    // [6] Status
    const monto = parseNumberReporte_(fila[5]);
    const categoria = normalizarEstatusReporte_(fila[6]);

    resumen.total++;
    resumen.montoTotal += monto;

    if (categoria === 'pagado') {
      resumen.pagado++;
      resumen.montoPagado += monto;
    } else if (categoria === 'pendiente') {
      resumen.pendiente++;
      resumen.montoPendiente += monto;
    } else if (categoria === 'anulado') {
      resumen.anulado++;
      resumen.montoAnulado += monto;
    } else {
      resumen.otros++;
      resumen.montoOtros += monto;
    }
  }

  return resumen;
}

/*************************************************
 * LISTAS PARA COMBOS
 *************************************************/

function obtenerListaUsuarios() {
  try {
    const hoja = SpreadsheetApp
      .openById(REPORTE_CFG.ID_HOJA_REGISTROS)
      .getSheetByName(REPORTE_CFG.NOMBRE_HOJA_REGISTROS);

    const datos = hoja.getDataRange().getValues();
    const unicos = {};

    for (let i = 1; i < datos.length; i++) {
      const nombreOriginal = String(datos[i][COL.RESPONSABLE] || '').trim();
      if (!nombreOriginal) continue;

      const norm = normalizarTextoReporte_(nombreOriginal);
      if (!unicos[norm] || nombreOriginal.length > unicos[norm].length) {
        unicos[norm] = nombreOriginal;
      }
    }

    return Object.values(unicos).sort((a, b) => a.localeCompare(b, 'es'));
  } catch (e) {
    Logger.log('❌ Error al obtenerListaUsuarios: ' + e.message);
    return [];
  }
}

function obtenerListaMantenimiento() {
  try {
    const hoja = SpreadsheetApp
      .openById(REPORTE_CFG.ID_HOJA_REGISTROS)
      .getSheetByName(REPORTE_CFG.NOMBRE_HOJA_REGISTROS);

    const datos = hoja.getDataRange().getValues();
    const unicos = {};

    for (let i = 1; i < datos.length; i++) {
      const conceptoOriginal = String(datos[i][COL.CONCEPTO_TARIFARIO] || '').trim();
      if (!conceptoOriginal) continue;

      const norm = normalizarTextoReporte_(conceptoOriginal);
      if (norm.indexOf('tarifa anual') === -1) continue;

      if (!unicos[norm] || conceptoOriginal.length > unicos[norm].length) {
        unicos[norm] = conceptoOriginal;
      }
    }

    return Object.values(unicos).sort((a, b) => a.localeCompare(b, 'es'));
  } catch (e) {
    Logger.log('❌ Error al obtenerListaMantenimiento: ' + e.message);
    return [];
  }
}

/*************************************************
 * PDF
 *************************************************/

function crearHTMLParaPDF(titulo, datos) {
  const encabezados = datos[0] || [];
  const filasDatos = datos.slice(1);
  const resumen = calcularTotalesEstatusDesdeDatos_(datos);
  const indiceMonto = 5;

  return `
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <style>
    body{
      font-family:'Segoe UI',Tahoma,sans-serif;
      margin:1.2cm;
      color:#333;
      font-size:11px;
    }
    h1{
      color:#1a237e;
      text-align:center;
      margin:0 0 16px 0;
      font-size:18px;
      border-bottom:2px solid #1a237e;
      padding-bottom:8px;
    }
    .resumen{
      margin-top:10px;
      margin-bottom:14px;
      font-size:11px;
      background:#f5f5f5;
      padding:10px 12px;
      border:1px solid #ddd;
      border-radius:6px;
    }
    .status-grid{
      width:100%;
      margin-top:10px;
      margin-bottom:18px;
      border-collapse:separate;
      border-spacing:8px 0;
      table-layout:fixed;
    }
    .status-grid td{
      border-radius:8px;
      color:#fff;
      text-align:center;
      padding:10px 8px;
      font-size:10px;
      font-weight:600;
      vertical-align:middle;
    }
    .status-grid .titulo{
      display:block;
      font-size:11px;
      margin-bottom:6px;
      font-weight:700;
    }
    .status-grid .cantidad{
      display:block;
      font-size:24px;
      line-height:1.1;
      font-weight:800;
      margin-bottom:6px;
    }
    .status-grid .monto{
      display:block;
      font-size:11px;
      line-height:1.2;
      font-weight:700;
      word-break:break-word;
    }
    .status-total{ background:#455a64; }
    .status-pagado{ background:#2e7d32; }
    .status-pendiente{ background:#ef6c00; }
    .status-anulado{ background:#c62828; }

    table{
      width:100%;
      border-collapse:collapse;
      margin-top:10px;
      table-layout:fixed;
    }
    th{
      background:#1a237e;
      color:#fff;
      padding:8px 6px;
      text-align:left;
      font-size:10px;
    }
    td{
      padding:6px 6px;
      border-bottom:1px solid #ddd;
      font-size:9.5px;
      word-wrap:break-word;
      vertical-align:top;
    }
    tr:nth-child(even){
      background:#f8f9fa;
    }
    .monto-col{
      text-align:right;
      white-space:nowrap;
    }
    .total-row{
      font-weight:bold;
      background:#e6f2ff;
    }
    .resumen-final{
      margin-top:18px;
      border:1px solid #d7dee6;
      border-radius:8px;
      overflow:hidden;
    }
    .resumen-final table{
      margin-top:0;
      width:100%;
      border-collapse:collapse;
      table-layout:fixed;
    }
    .resumen-final th{
      background:#37474f;
      color:#fff;
      text-align:center;
      font-size:10px;
      padding:8px 6px;
    }
    .resumen-final td{
      text-align:center;
      padding:8px 6px;
      font-size:10px;
      border-bottom:1px solid #e0e0e0;
    }
    .resumen-final .lbl{
      text-align:left;
      font-weight:bold;
      background:#fafafa;
    }
    .footer{
      margin-top:20px;
      text-align:right;
      font-size:9px;
      color:#666;
    }
  </style>
</head>
<body>
  <h1>${escapeHtmlReporte_(titulo)}</h1>

  <div class="resumen">
    <strong>Total registros:</strong> ${resumen.total} |
    <strong>Total monto:</strong> Q${resumen.montoTotal.toFixed(2)}
  </div>

  <table class="status-grid">
    <tr>
      <td class="status-total">
        <span class="titulo">Total registros</span>
        <span class="cantidad">${resumen.total}</span>
        <span class="monto">Q${resumen.montoTotal.toFixed(2)}</span>
      </td>
      <td class="status-pagado">
        <span class="titulo">Pagado</span>
        <span class="cantidad">${resumen.pagado}</span>
        <span class="monto">Q${resumen.montoPagado.toFixed(2)}</span>
      </td>
      <td class="status-pendiente">
        <span class="titulo">No pagado / Pendiente</span>
        <span class="cantidad">${resumen.pendiente}</span>
        <span class="monto">Q${resumen.montoPendiente.toFixed(2)}</span>
      </td>
      <td class="status-anulado">
        <span class="titulo">Anulado</span>
        <span class="cantidad">${resumen.anulado}</span>
        <span class="monto">Q${resumen.montoAnulado.toFixed(2)}</span>
      </td>
    </tr>
  </table>

  <table>
    <thead>
      <tr>
        ${encabezados.map(h => `<th>${escapeHtmlReporte_(h)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${filasDatos.map(fila => `
        <tr>
          ${fila.map((celda, idx) => `
            <td class="${idx === indiceMonto ? 'monto-col' : ''}">
              ${escapeHtmlReporte_(celda)}
            </td>
          `).join('')}
        </tr>
      `).join('')}

      <tr class="total-row">
        <td colspan="5">TOTAL GENERAL</td>
        <td class="monto-col">Q${resumen.montoTotal.toFixed(2)}</td>
        <td>${resumen.total} registros</td>
      </tr>
    </tbody>
  </table>

  <div class="resumen-final">
    <table>
      <thead>
        <tr>
          <th style="width:40%;">Resumen final</th>
          <th style="width:20%;">Cantidad</th>
          <th style="width:40%;">Monto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="lbl">Pagado</td>
          <td>${resumen.pagado}</td>
          <td>Q${resumen.montoPagado.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="lbl">No pagado / Pendiente</td>
          <td>${resumen.pendiente}</td>
          <td>Q${resumen.montoPendiente.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="lbl">Anulado</td>
          <td>${resumen.anulado}</td>
          <td>Q${resumen.montoAnulado.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td class="lbl">TOTAL GENERAL</td>
          <td>${resumen.total}</td>
          <td>Q${resumen.montoTotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generado el ${formatDateReporte_(new Date(), 'dd/MM/yyyy HH:mm')} | Sistema de Reportes OEC
  </div>
</body>
</html>
  `;
}

/*************************************************
 * UTILIDADES
 *************************************************/

function valorSeguro_(valor) {
  return valor == null ? '' : valor;
}

function parseNumberReporte_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;

  if (typeof valor === 'number') return valor;

  let txt = String(valor).trim();
  if (!txt) return 0;

  // Quitar moneda y espacios
  txt = txt.replace(/\s/g, '').replace(/^Q/i, '');

  // Caso 1: 8.015,55
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(txt)) {
    txt = txt.replace(/\./g, '').replace(',', '.');
    return parseFloat(txt) || 0;
  }

  // Caso 2: 1233,96
  if (/^\d+,\d+$/.test(txt)) {
    txt = txt.replace(',', '.');
    return parseFloat(txt) || 0;
  }

  // Caso 3: 3854.76 o 3,854.76
  txt = txt.replace(/,/g, '');
  return parseFloat(txt) || 0;
}

function formatCurrencyReporte_(valor) {
  const n = parseNumberReporte_(valor);
  return n.toFixed(2);
}

function formatDateReporte_(valor, formato) {
  const fmt = formato || 'dd/MM/yyyy HH:mm';

  if (!valor) return '';

  try {
    if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
      return Utilities.formatDate(valor, Session.getScriptTimeZone(), fmt);
    }

    const d = new Date(valor);
    if (!isNaN(d)) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), fmt);
    }

    return String(valor);
  } catch (e) {
    return String(valor);
  }
}

function escapeHtmlReporte_(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/*************************************************
 * ALIAS OPCIONALES
 *************************************************/

function obtenerInformePorTarifaAnual(tipo) {
  return obtenerInformePorMantenimiento(tipo);
}

function obtenerListaTarifaAnual() {
  return obtenerListaMantenimiento();
}
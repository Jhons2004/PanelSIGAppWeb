function WAPP_norm_(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function WAPP_limpiarToken_(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').trim();
}

function WAPP_emailOk_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(value || '').trim());
}

function WAPP_dateText_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, WAPP_cfg_().TZ, 'yyyy-MM-dd');
  }
  return String(value).trim();
}

function WAPP_rowsByHeaders_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(h => String(h || '').trim());
  return values.slice(1).map((row, idx) => {
    const o = { __rowNumber: idx + 2 };
    headers.forEach((h, i) => {
      if (h) o[h] = row[i];
    });
    return o;
  });
}

function WAPP_appendByHeaders_(sheet, data) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('La hoja no tiene encabezados.');

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || '').trim());

  const row = headers.map(h =>
    Object.prototype.hasOwnProperty.call(data, h) ? data[h] : ''
  );

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function WAPP_ok_(data) {
  return { ok: true, data: data || {} };
}

function WAPP_fail_(error) {
  console.error('[WAPP]', error && error.stack ? error.stack : error);
  return {
    ok: false,
    error: {
      message: error && error.message ? error.message : String(error || 'Error desconocido')
    }
  };
}

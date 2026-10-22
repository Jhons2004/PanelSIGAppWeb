/** V1.8.0 - Caché institucional resiliente de tipo de cambio BANGUAT. */
function WAPP_V171_TC_cfg_() {
  const cfg = WAPP_cfg_();

  if (!cfg.TIPO_CAMBIO) {
    throw new Error(
      'No existe configuración TIPO_CAMBIO para el ambiente ' +
      WAPP_getEnv_() + '.'
    );
  }

  return cfg.TIPO_CAMBIO;
}

const WAPP_V171_TC_HEADERS = [
  'Fecha_Referencia','Tasa','Tasa_Texto','Fecha_Consulta','Origen',
  'Estado','HTTP_Code','Intentos','Detalle','Usuario_Consulta'
];

function WAPP_V171_TC_resolver_() {
  const online = WAPP_V171_TC_consultarOnlineConReintentos_(WAPP_V171_TC_cfg_().RETRIES);
  if (online.ok) {
    WAPP_V171_TC_guardarExito_(online);
    return {
      value: online.value,
      raw: online.raw,
      fechaReferencia: online.fechaReferencia,
      origen: 'BANGUAT_ONLINE',
      onlineDisponible: true,
      cacheFallback: false,
      intentos: online.intentos,
      httpCode: online.httpCode
    };
  }

  WAPP_V171_TC_guardarFallo_(online);

  const sameDay = WAPP_V171_TC_buscarMismoDia_(WAPP_V171_TC_hoyIso_());
  if (sameDay) {
    return {
      value: sameDay.value,
      raw: sameDay.raw,
      fechaReferencia: sameDay.fechaReferencia,
      origen: 'BANGUAT_CACHE_MISMO_DIA',
      onlineDisponible: false,
      cacheFallback: true,
      intentos: online.intentos,
      httpCode: online.httpCode || '',
      errorOnline: online.error || ''
    };
  }

  const latest = WAPP_V171_TC_buscarUltimaValida_();
  if (latest) {
    return {
      value: latest.value,
      raw: latest.raw,
      fechaReferencia: latest.fechaReferencia,
      origen: 'BANGUAT_CACHE_ULTIMA_DISPONIBLE',
      onlineDisponible: false,
      cacheFallback: true,
      intentos: online.intentos,
      httpCode: online.httpCode || '',
      errorOnline: online.error || ''
    };
  }

  throw new Error(
    'BANGUAT no está disponible y aún no existe una tasa oficial almacenada. ' +
    'Ejecute TEST_WAPP_V171_PREPARAR_CACHE_BANGUAT antes de habilitar el flujo.'
  );
}

function WAPP_V171_TC_previewResolver_() {
  const online = WAPP_V171_TC_consultarOnlineConReintentos_(WAPP_V171_TC_cfg_().RETRIES);
  if (online.ok) {
    return {
      value: online.value, raw: online.raw,
      fechaReferencia: online.fechaReferencia,
      origen: 'BANGUAT_ONLINE_PREVIEW',
      onlineDisponible: true, cacheFallback: false,
      intentos: online.intentos, httpCode: online.httpCode
    };
  }
  const sameDay = WAPP_V171_TC_buscarMismoDia_(WAPP_V171_TC_hoyIso_());
  if (sameDay) {
    return {
      value: sameDay.value, raw: sameDay.raw,
      fechaReferencia: sameDay.fechaReferencia,
      origen: 'BANGUAT_CACHE_MISMO_DIA_PREVIEW',
      onlineDisponible: false, cacheFallback: true,
      intentos: online.intentos, errorOnline: online.error || ''
    };
  }
  const latest = WAPP_V171_TC_buscarUltimaValida_();
  if (latest) {
    return {
      value: latest.value, raw: latest.raw,
      fechaReferencia: latest.fechaReferencia,
      origen: 'BANGUAT_CACHE_ULTIMA_DISPONIBLE_PREVIEW',
      onlineDisponible: false, cacheFallback: true,
      intentos: online.intentos, errorOnline: online.error || ''
    };
  }
  return {
    value: null, raw: '', fechaReferencia: '',
    origen: 'SIN_TASA_DISPONIBLE', onlineDisponible: false,
    cacheFallback: false, intentos: online.intentos,
    errorOnline: online.error || ''
  };
}

function WAPP_V171_TC_consultarOnlineConReintentos_(maxAttempts) {
  const total = Math.max(1, Math.min(Number(maxAttempts || 3), 3));
  let last = null;
  for (let i = 0; i < total; i++) {
    const wait = Number(WAPP_V171_TC_cfg_().WAIT_MS[i] || 0);
    if (wait > 0) Utilities.sleep(wait);
    const attempt = WAPP_V171_TC_consultarUnaVez_();
    attempt.intentos = i + 1;
    if (attempt.ok) return attempt;
    last = attempt;
  }
  return Object.assign({
    ok: false, value: null, raw: '', fechaReferencia: '',
    httpCode: '', error: 'No fue posible consultar BANGUAT.'
  }, last || {}, { ok: false, intentos: total });
}

function WAPP_V171_TC_consultarUnaVez_() {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/" />' +
    '</soap:Body></soap:Envelope>';
  try {
    const resp = UrlFetchApp.fetch(WAPP_V171_TC_cfg_().ENDPOINT, {
      method: 'post', contentType: 'text/xml; charset=utf-8',
      headers: { SOAPAction: WAPP_V171_TC_cfg_().SOAP_ACTION },
      payload: envelope, muteHttpExceptions: true
    });
    const httpCode = resp.getResponseCode();
    const text = resp.getContentText();
    if (httpCode < 200 || httpCode >= 300) {
      return { ok: false, httpCode: httpCode, error: 'BANGUAT respondió HTTP ' + httpCode + '.' };
    }
    const mRate = text.match(/<referencia[^>]*>([^<]+)<\/referencia>/i);
    if (!mRate) return { ok: false, httpCode: httpCode, error: 'La respuesta no contiene referencia.' };
    const rawOriginal = String(mRate[1] || '').trim();
    const value = Number(rawOriginal.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, httpCode: httpCode, error: 'Tasa BANGUAT inválida: ' + rawOriginal };
    }
    const mFecha = text.match(/<fecha[^>]*>([^<]+)<\/fecha>/i);
    return {
      ok: true,
      value: value,
      raw: rawOriginal,
      fechaReferencia: mFecha ? WAPP_V171_TC_normalizarFechaBanguat_(mFecha[1]) : WAPP_V171_TC_hoyIso_(),
      httpCode: httpCode,
      error: ''
    };
  } catch (e) {
    return { ok: false, httpCode: '', error: e && e.message ? e.message : String(e) };
  }
}

function WAPP_V171_TC_sheet_() {
  const ss = WAPP_V17_db_();
  let sh = ss.getSheetByName(WAPP_V171_TC_cfg_().SHEET);
  if (!sh) {
    sh = ss.insertSheet(WAPP_V171_TC_cfg_().SHEET);
    sh.getRange(1, 1, 1, WAPP_V171_TC_HEADERS.length).setValues([WAPP_V171_TC_HEADERS]);
    sh.setFrozenRows(1);
  } else {
    WAPP_V171_TC_ensureHeaders_(sh);
  }
  return sh;
}

function WAPP_V171_TC_ensureHeaders_(sh) {
  const current = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn()))
    .getDisplayValues()[0].map(v => String(v || '').trim());
  WAPP_V171_TC_HEADERS.forEach(h => {
    if (current.indexOf(h) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
      current.push(h);
    }
  });
}

function WAPP_V171_TC_guardarExito_(result) {
  const sh = WAPP_V171_TC_sheet_();
  const fecha = String(result.fechaReferencia || WAPP_V171_TC_hoyIso_()).trim();
  const rows = WAPP_rowsByHeaders_(sh);
  const existing = rows.filter(r =>
    WAPP_V171_TC_fechaIsoDesdeValor_(r.Fecha_Referencia) === fecha &&
    String(r.Estado || '').trim().toUpperCase() === 'OK'
  ).sort((a,b) => Number(b.__rowNumber||0)-Number(a.__rowNumber||0))[0];
  const data = {
    Fecha_Referencia: fecha,
    Tasa: result.value,
    Tasa_Texto: "'" + String(result.raw || result.value),
    Fecha_Consulta: new Date(),
    Origen: 'BANGUAT_ONLINE',
    Estado: 'OK',
    HTTP_Code: result.httpCode || 200,
    Intentos: result.intentos || 1,
    Detalle: '',
    Usuario_Consulta: WAPP_V171_TC_usuario_()
  };
  if (existing && existing.__rowNumber) {
    WAPP_V17_setByHeaders_(sh, Number(existing.__rowNumber), data);
  } else {
    WAPP_V17_appendPreserveFormat_(sh, data);
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE, String(result.value));
  props.setProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE_DATE, fecha);
  props.setProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE_RAW, String(result.raw || result.value));
  return data;
}

function WAPP_V171_TC_guardarFallo_(result) {
  try {
    WAPP_V17_appendPreserveFormat_(WAPP_V171_TC_sheet_(), {
      Fecha_Referencia: WAPP_V171_TC_hoyIso_(),
      Tasa: '', Tasa_Texto: '', Fecha_Consulta: new Date(),
      Origen: 'BANGUAT_ONLINE_ERROR', Estado: 'ERROR',
      HTTP_Code: result && result.httpCode || '',
      Intentos: result && result.intentos || 0,
      Detalle: result && result.error || 'Error no especificado.',
      Usuario_Consulta: WAPP_V171_TC_usuario_()
    });
  } catch (e) {
    console.warn('[WAPP V1.7.1] No se pudo registrar falla BANGUAT:', e);
  }
}

function WAPP_V171_TC_rowsValidas_() {
  return WAPP_rowsByHeaders_(WAPP_V171_TC_sheet_())
    .map(r => {
      const value = Number(r.Tasa);

      return {
        value: value,
        raw: WAPP_V171_TC_rawSeguro_(
          r.Tasa_Texto,
          value
        ),
        fechaReferencia:
          WAPP_V171_TC_fechaIsoDesdeValor_(
            r.Fecha_Referencia
          ),
        fechaConsultaMs:
          WAPP_V171_TC_dateMs_(r.Fecha_Consulta),
        estado:
          String(r.Estado || '')
            .trim()
            .toUpperCase()
      };
    })
    .filter(r =>
      r.estado === 'OK' &&
      Number.isFinite(r.value) &&
      r.value > 0 &&
      !!r.fechaReferencia
    );
}

function WAPP_V171_TC_rawSeguro_(rawValue, numericValue) {
  let raw = String(rawValue || '')
    .trim()
    .replace(/^'/, '');

  const normalized = raw.replace(',', '.');
  const parsed = Number(normalized);
  const value = Number(numericValue);

  if (
    Number.isFinite(parsed) &&
    Number.isFinite(value) &&
    Math.abs(parsed - value) < 1e-12
  ) {
    return raw;
  }

  if (Number.isFinite(value) && value > 0) {
    return String(value);
  }

  return raw;
}

function WAPP_V171_TC_buscarMismoDia_(fechaIso) {
  const rows = WAPP_V171_TC_rowsValidas_().filter(r => r.fechaReferencia === fechaIso);
  rows.sort((a,b) => b.fechaConsultaMs-a.fechaConsultaMs);
  return rows[0] || null;
}

function WAPP_V171_TC_buscarUltimaValida_() {
  const rows = WAPP_V171_TC_rowsValidas_();
  if (rows.length) {
    rows.sort((a,b) => {
      if (a.fechaReferencia !== b.fechaReferencia) return String(b.fechaReferencia).localeCompare(String(a.fechaReferencia));
      return b.fechaConsultaMs-a.fechaConsultaMs;
    });
    return rows[0];
  }
  const props = PropertiesService.getScriptProperties();
  const value = Number(props.getProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE));
  const fecha = String(props.getProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE_DATE)||'').trim();
  const raw = String(props.getProperty(WAPP_V171_TC_cfg_().PROP_LAST_RATE_RAW)||'').trim();
  return Number.isFinite(value) && value > 0 && fecha
    ? { value:value, raw:raw||String(value), fechaReferencia:fecha, fechaConsultaMs:0 }
    : null;
}

function WAPP_V171_TC_prepararContinuidad_() {
  WAPP_V171_TC_sheet_();
  const online = WAPP_V171_TC_consultarOnlineConReintentos_(WAPP_V171_TC_cfg_().RETRIES);
  let seed;
  if (online.ok) {
    WAPP_V171_TC_guardarExito_(online);
    seed = { disponible:true, origen:'BANGUAT_ONLINE', value:online.value, raw:online.raw, fechaReferencia:online.fechaReferencia };
  } else {
    WAPP_V171_TC_guardarFallo_(online);
    const latest = WAPP_V171_TC_buscarUltimaValida_();
    if (!latest) throw new Error('No existe ninguna tasa oficial disponible para preparar continuidad.');
    seed = { disponible:true, origen:'CACHE_EXISTENTE', value:latest.value, raw:latest.raw, fechaReferencia:latest.fechaReferencia };
  }
  return { ok:true, seed:seed, trigger:WAPP_V171_TC_instalarTrigger_(), cache:WAPP_V171_TC_estadoCache_() };
}

function WAPP_V171_TC_instalarTrigger_() {
  const handler = WAPP_V171_TC_cfg_().HANDLER_TRIGGER;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  const tr = ScriptApp.newTrigger(handler).timeBased().everyHours(WAPP_V171_TC_cfg_().TRIGGER_EVERY_HOURS).create();
  return { instalado:true, handler:handler, everyHours:WAPP_V171_TC_cfg_().TRIGGER_EVERY_HOURS,
    triggerId: typeof tr.getUniqueId === 'function' ? tr.getUniqueId() : '' };
}

function WAPP_V171_TC_assertTriggerOrInternal_(e) {
  const handler = WAPP_V171_TC_cfg_().HANDLER_TRIGGER;
  const triggerUid = e && e.triggerUid ? String(e.triggerUid) : '';

  if (triggerUid) {
    const match = ScriptApp.getProjectTriggers().some(t =>
      t.getHandlerFunction() === handler &&
      typeof t.getUniqueId === 'function' &&
      String(t.getUniqueId()) === triggerUid
    );
    if (!match) throw new Error('Trigger programado no reconocido.');
    return true;
  }

  // Ejecución manual permitida únicamente a usuario institucional autorizado.
  WAPP_SEC_assertUsuarioInterno_();
  return true;
}

function WAPP_V171_TC_actualizarCacheProgramado(e) {
  WAPP_V171_TC_assertTriggerOrInternal_(e);
  const r = WAPP_V171_TC_consultarOnlineConReintentos_(WAPP_V171_TC_cfg_().RETRIES);
  if (r.ok) {
    WAPP_V171_TC_guardarExito_(r);
    console.log('[WAPP_V171_TC_TRIGGER_OK] '+JSON.stringify({fechaReferencia:r.fechaReferencia,tasa:r.raw,intentos:r.intentos}));
    return { ok:true, tasa:r.raw, fechaReferencia:r.fechaReferencia };
  }
  WAPP_V171_TC_guardarFallo_(r);
  const disponible = !!WAPP_V171_TC_buscarUltimaValida_();
  console.warn('[WAPP_V171_TC_TRIGGER_ERROR] '+JSON.stringify({error:r.error,intentos:r.intentos,cacheDisponible:disponible}));
  return { ok:false, error:r.error, cacheDisponible:disponible };
}

function WAPP_V171_TC_preflight_() {
  const online = WAPP_V171_TC_consultarOnlineConReintentos_(WAPP_V171_TC_cfg_().RETRIES);
  const today = WAPP_V171_TC_buscarMismoDia_(WAPP_V171_TC_hoyIso_());
  const latest = WAPP_V171_TC_buscarUltimaValida_();
  return {
    online: { ok:online.ok, tasa:online.ok?online.raw:'', value:online.ok?online.value:null,
      fechaReferencia:online.ok?online.fechaReferencia:'', intentos:online.intentos,
      httpCode:online.httpCode||'', error:online.error||'' },
    cacheMismoDia: today,
    ultimaTasaValida: latest,
    cache: WAPP_V171_TC_estadoCache_(),
    continuidadGarantizada: !!(online.ok || today || latest),
    nota: 'Diagnóstico de lectura. No modifica la caché.'
  };
}

function WAPP_V171_TC_estadoCache_() {
  const sh = WAPP_V171_TC_sheet_();
  const valid = WAPP_V171_TC_rowsValidas_();
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === WAPP_V171_TC_cfg_().HANDLER_TRIGGER).length;
  return { hoja:sh.getName(), filas:sh.getLastRow(), tasasValidas:valid.length,
    ultimaTasa:valid.length?WAPP_V171_TC_buscarUltimaValida_():null,
    triggerInstalado:triggers>0, triggerCount:triggers };
}

function WAPP_V171_TC_hoyIso_() {
  return Utilities.formatDate(new Date(), WAPP_cfg_().TZ, 'yyyy-MM-dd');
}

function WAPP_V171_TC_normalizarFechaBanguat_(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return [m[3],String(Number(m[2])).padStart(2,'0'),String(Number(m[1])).padStart(2,'0')].join('-');
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return [m[1],String(Number(m[2])).padStart(2,'0'),String(Number(m[3])).padStart(2,'0')].join('-');
  return WAPP_V171_TC_hoyIso_();
}

function WAPP_V171_TC_fechaIsoDesdeValor_(value) {
  if (Object.prototype.toString.call(value)==='[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, WAPP_cfg_().TZ, 'yyyy-MM-dd');
  }
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return WAPP_V171_TC_normalizarFechaBanguat_(s);
}

function WAPP_V171_TC_dateMs_(value) {
  if (Object.prototype.toString.call(value)==='[object Date]' && !isNaN(value)) return value.getTime();
  const d = new Date(value); return isNaN(d) ? 0 : d.getTime();
}

function WAPP_V171_TC_usuario_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase() || 'TRIGGER';
  } catch (e) { return 'TRIGGER'; }
}

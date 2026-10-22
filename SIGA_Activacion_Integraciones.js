/**
 * Configuración institucional de Calendar y Gmail para SIGA.
 * Ejecutar MANUALMENTE desde el editor Apps Script con la cuenta propietaria
 * DESPUÉS de comprobar Calendar v3, alias y destinatarios; no envía correos
 * ni crea eventos por sí misma.
 * La propiedad APP_ENV queda intacta, al igual que todas las bases y OAuth.
 */
function SIGA_ACTIVAR_INTEGRACIONES_INSTITUCIONALES_QA_20261022_() {
  const cfg = WAPP_cfg_();
  const cuenta = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!cuenta.endsWith('@oga.org.gt')) {
    throw new Error('Ejecute la activación con cuenta institucional OGA.');
  }
  if (typeof Calendar === 'undefined' || !Calendar.Calendars) {
    throw new Error('Agregue el servicio avanzado Calendar v3.');
  }
  const calendar = Calendar.Calendars.get(cfg.OPERACION.CALENDAR_ID);
  if (!calendar || !calendar.id) {
    throw new Error('Sin acceso al calendario institucional configurado.');
  }
  const destinatarios = [cfg.OPERACION.EMAIL.TO, cfg.OPERACION.EMAIL.CC,
    cfg.OPERACION.EMAIL.BCC].filter(Boolean);
  if (!destinatarios.length || destinatarios.some(function(e) {
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  })) {
    throw new Error('Destinatarios institucionales incompletos o inválidos.');
  }
  GmailApp.getAliases(); // Verifica permisos Gmail sin enviar.
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    WAPP_V17_CALENDAR_ENABLED: 'YES',
    WAPP_V17_EMAIL_ENABLED: 'YES'
  }, false);
  const status = {ok:true, ambiente:WAPP_getEnv_(),
    calendarId:cfg.OPERACION.CALENDAR_ID,
    destinatarios:destinatarios,
    calendarEnabled:true, emailEnabled:true,
    mensaje:'Activadas. No se creó evento ni se envió correo.'};
  Logger.log(JSON.stringify(status));
  return status;
}

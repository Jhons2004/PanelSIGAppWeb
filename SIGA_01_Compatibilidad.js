/** Adaptadores mínimos verificados: sin crear un doGet ni UI de Sheets. */
function setDatosOECEnSesion(datos) {
  const usuario = getUsuarioActivoDetalle();
  if (!usuario || usuario.autenticado !== true) throw new Error('Inicie sesión.');
  const correo = String(usuario.email || '').toLowerCase();
  const check = obtenerUsuarioAutorizadoGoogle(correo);
  if (!check || check.ok !== true) throw new Error('Cuenta institucional no autorizada.');
  // Nunca aceptamos los datos completos del HTML como fuente de verdad.
  const reg = String(datos && datos.registro || '').trim().toUpperCase();
  if (!/^OGA-[A-Z]{2,5}-\d{2,4}-\d{2,4}$/.test(reg)) throw new Error('Registro OEC inválido.');
  const oficial = buscarDatosOEC_Presupuesto(reg);
  if (!oficial) throw new Error('Registro OEC inexistente en la base institucional.');
  const key = 'SIGA_OEC_' + SIGA_SESSION_browserKey_();
  CacheService.getScriptCache().put(key, JSON.stringify({registro:reg,email:correo}), 3600);
  SIGA_AUDIT_event_('SELECCION_OEC', 'BOLETAS', 'OK', reg, '', '');
  return {ok:true, registro:reg};
}

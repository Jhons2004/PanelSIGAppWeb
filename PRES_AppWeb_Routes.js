/**
 * Rutas auxiliares del módulo Presupuestos dentro de la AppWeb SIGA.
 * NO define doGet(). El doGet principal sigue perteneciendo a SIGA.
 */
function WAPP_renderAsistenciaPublica_(p) {
  p = p || {};
  var token = WAPP_limpiarToken_(p.token);

  if (!token) {
    return HtmlService
      .createHtmlOutput('<h2>Enlace inválido</h2><p>No se recibió token de acceso.</p>')
      .setTitle('Enlace inválido');
  }

  var tpl = HtmlService.createTemplateFromFile('ListaAsistenciaPublica');
  tpl.token = token;
  tpl.debugInfo = {
    marca: WAPP_VERSION,
    env: WAPP_getEnv_()
  };

  return tpl.evaluate()
    .setTitle('Registro de Asistencia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

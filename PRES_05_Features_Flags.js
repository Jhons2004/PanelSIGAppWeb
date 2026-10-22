/**
 * Feature flags V1.8.0
 *
 * Las capacidades funcionales se definen en 00_Config.gs -> FEATURES.
 * Un override opcional puede establecerse en Script Properties:
 *
 *   WAPP_FEATURE_DOCUMENT_GENERATION = YES | NO
 *   WAPP_FEATURE_CERTIFICATE_QUEUE   = YES | NO
 *   WAPP_FEATURE_PUBLIC_ATTENDANCE   = YES | NO
 *
 * Calendar y correo mantienen sus interruptores operativos específicos
 * porque son integraciones con efectos externos.
 */

function WAPP_FEATURE_enabled_(name) {
  const key = String(name || '')
    .trim()
    .toUpperCase();

  if (!key) return false;

  const propKey = 'WAPP_FEATURE_' + key;

  const override = String(
    PropertiesService.getScriptProperties()
      .getProperty(propKey) || ''
  ).trim().toUpperCase();

  if (['YES', 'TRUE', '1', 'SI', 'SÍ'].includes(override)) {
    return true;
  }

  if (['NO', 'FALSE', '0'].includes(override)) {
    return false;
  }

  const cfg = WAPP_cfg_();

  return !!(
    cfg.FEATURES &&
    cfg.FEATURES[key] === true
  );
}

function WAPP_FEATURE_assert_(name, message) {
  if (!WAPP_FEATURE_enabled_(name)) {
    throw new Error(
      message ||
      ('Funcionalidad deshabilitada: ' + name)
    );
  }

  return true;
}

/**
 * Estado de operación aislado por usuario autenticado de SIGA.
 *
 * El baseline utilizaba PropertiesService.getUserProperties() directamente.
 * En una AppWeb central con autenticación OAuth propia, este wrapper añade un
 * namespace derivado del correo autenticado para impedir que dos sesiones
 * compartan accidentalmente claves de workflow/preview/OTP/operación.
 */
function WAPP_STATE_prefix_() {
  var email = WAPP_SEC_assertUsuarioInterno_().email;
  return 'PRES_U_' + WAPP_SEC_hashKey_(email) + '__';
}

function WAPP_STATE_props_() {
  var base = PropertiesService.getUserProperties();
  var prefix = WAPP_STATE_prefix_();

  return {
    getProperty: function(key) {
      return base.getProperty(prefix + String(key || ''));
    },

    setProperty: function(key, value) {
      base.setProperty(prefix + String(key || ''), String(value));
      return this;
    },

    deleteProperty: function(key) {
      base.deleteProperty(prefix + String(key || ''));
      return this;
    },

    getProperties: function() {
      var all = base.getProperties();
      var out = {};
      Object.keys(all).forEach(function(k) {
        if (k.indexOf(prefix) === 0) {
          out[k.slice(prefix.length)] = all[k];
        }
      });
      return out;
    },

    setProperties: function(values, deleteAllOthers) {
      values = values || {};

      if (deleteAllOthers === true) {
        var all = base.getProperties();
        Object.keys(all).forEach(function(k) {
          if (k.indexOf(prefix) === 0) base.deleteProperty(k);
        });
      }

      var mapped = {};
      Object.keys(values).forEach(function(k) {
        mapped[prefix + k] = String(values[k]);
      });
      base.setProperties(mapped, false);
      return this;
    }
  };
}

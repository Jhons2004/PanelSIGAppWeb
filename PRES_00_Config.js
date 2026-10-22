/**
 * OGA WebApp Presupuestos / Evaluaciones
 * V1.8.1.7 — INTEGRACIÓN SIGA APPWEB
 *
 * CONFIGURACIÓN POR AMBIENTE:
 * - PROD: ambiente operativo vigente.
 * - QA: ambiente de pruebas con salidas documentales aisladas.
 *
 * OBJETIVO:
 * - Un único punto de configuración por ambiente.
 * - Evitar IDs, correos, carpetas y parámetros operativos dispersos.
 * - Bloquear PROD mientras falten parámetros obligatorios.
 *
 * REGLA:
 * - Nunca inyectar IDs/configuración sensible al HTML.
 * - APP_ENV se define en Script Properties: QA | PROD.
 */
const WAPP_VERSION = '1.8.1.7-APPWEB';

const WAPP_CONFIG = {
  QA: {
    REGISTRO_MAESTRO_ID: '1tcCMSptHgHNe006X5rnj_turSjrhmMKBV32aISaC1po',
    REGISTRO_BOLETAS_ID: '1m8Vdcdy5SgCovnHGw12KmQ6sTPdUimGFpRvFHjskFCc',
    EVALUADORES_ID: '1VUBB3GncB1ei9qiHsRYU9fFKnsajqp9A-f8GUlGRDbw',

    HOJA_CLIENTES: 'Clientes',
    HOJA_CICLOS: 'Copy of Ciclos',
    HOJA_OFICIALES: 'Oficiales',
    HOJA_SITIOS: 'Sitios',
    HOJA_EVENTOS: 'Eventos_Asistencia',
    HOJA_ASISTENCIA_DETALLE: 'Asistencia_Detalle',
    HOJA_CERTIFICADOS_PENDIENTES: 'Certificados_Pendientes',
    HOJA_PRESUPUESTO: 'Presupuesto',
    HOJA_REGISTROS: 'Registros',
    HOJA_EQUIPO_EVALUADOR: 'Equipo_Evaluador',

    DOMINIO_INTERNO: 'oga.org.gt',
    TZ: 'America/Guatemala',

    DOCUMENTOS: {
      TEMPLATE_PRESUPUESTO: '1DA8YwqegrnBFKbRdQ47Ner0hoTgwGMdC_qXGHIdHwXY',
      TEMPLATE_AGENDA: '1_dKwKrDA4jIhcK3Uqs2yoK-Hekx-iHMo0k5LMdo-_nw',
      TEMPLATE_INFORME: '11O02C55Aj-KCiHPxJy4qZZb1CIefOmzz-pMtHGsoHRU',

      // P2-R1.2: salidas QA separadas de PROD.
      BACKUP_AGENDA: '1sht6cB5HUb5v5HbiSLlDXTqxihmADI_e',
      BACKUP_PRESUPUESTO: '1GZ1CEmGy6cQOviqIR0qaS0Qy_VcKFWEV',
      BACKUP_INFORME: '1efc5wHM0ogJKMzuXPcsSmiPUIQLxyPyi',

      TARIFA_DIA_USD: 160,

      RUTAS_OEC: {
        agenda: ['Agenda'],
        presupuesto: ['Presupuesto'],
        informe: ['Informe de Evaluación', 'Informe']
      }
    },

    OPERACION: {
      SHEET_BOLETA_TEMPLATE: 'Boletas',
      BOLETA_RENDER_MODE: 'SHEET_TEMPLATE',
      SHEET_AUDIT: 'Bitacora_WebApp_Operacion',

      // P2-R1.2: salida QA separada de PROD.
      BACKUP_BOLETA_FOLDER_ID: '1ieYZfytPUF8QvVeuv88nIrjKicdgHLZZ',

      CALENDAR_ID: 'info@oga.org.gt',
      CALENDAR_COLOR_ID: '8',
      CALENDAR_REMINDERS: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 60 }
      ],

      EMAIL: {
        TO: 'info@oga.org.gt',
        CC: 'lsanchez@oga.org.gt',
        BCC: 'solicitudes@oga.org.gt',
        FROM_ALIAS: 'oga@oga.org.gt',
        NAME: 'Presupuestos y Evaluaciones OGA'
      },

      PROP_CALENDAR_ENABLED: 'WAPP_V17_CALENDAR_ENABLED',
      PROP_EMAIL_ENABLED: 'WAPP_V17_EMAIL_ENABLED'
    },

    TIPO_CAMBIO: {
      SHEET: 'Tipo_Cambio_Cache',
      ENDPOINT: 'https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx',
      SOAP_ACTION: 'http://www.banguat.gob.gt/variables/ws/TipoCambioDia',
      HANDLER_TRIGGER: 'WAPP_V171_TC_actualizarCacheProgramado',
      RETRIES: 3,
      WAIT_MS: [0, 1500, 3500],
      TRIGGER_EVERY_HOURS: 4,
      PROP_LAST_RATE: 'WAPP_V171_TC_LAST_RATE',
      PROP_LAST_RATE_DATE: 'WAPP_V171_TC_LAST_RATE_DATE',
      PROP_LAST_RATE_RAW: 'WAPP_V171_TC_LAST_RATE_RAW'
    },

    INTEGRIDAD: {
      SHEET_OPERACIONES: 'Control_Operaciones_WebApp',
      SHEET_CORRELATIVOS: 'Reservas_Correlativos_Boleta',
      LOCK_TIMEOUT_MS: 60000,
      PROP_FAULT_STAGE: 'WAPP_V181_FAULT_STAGE',
      ENABLE_FAULT_INJECTION_QA: true
    },

    DUPLICADOS: {
      AUTH_KEY: 'WAPP_DUPLICATE_AUTH_V1',
      AUDIT_SHEET: 'Autorizaciones_Duplicados',
      ADMIN_EMAILS: ['carchila@oga.org.gt']
    },

    FEATURES: {
      DOCUMENT_GENERATION: true,
      CERTIFICATE_QUEUE: true,
      PUBLIC_ATTENDANCE: true
    }
  },

  PROD: {
    // Registro Maestro productivo.
    REGISTRO_MAESTRO_ID: '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8',

    // RegistroBoletas productivo.
    REGISTRO_BOLETAS_ID: '19SGkQ_2T0nzZt6ye9UipTyEDdcK00qk3lyHBfRiYZBs',

    // Base institucional vigente de evaluadores.
    EVALUADORES_ID: '1VUBB3GncB1ei9qiHsRYU9fFKnsajqp9A-f8GUlGRDbw',

    HOJA_CLIENTES: 'Clientes',
    HOJA_CICLOS: 'Copy of Ciclos',
    HOJA_OFICIALES: 'Oficiales',
    HOJA_SITIOS: 'Sitios',
    HOJA_EVENTOS: 'Eventos_Asistencia',
    HOJA_ASISTENCIA_DETALLE: 'Asistencia_Detalle',
    HOJA_CERTIFICADOS_PENDIENTES: 'Certificados_Pendientes',
    HOJA_PRESUPUESTO: 'Presupuesto',
    HOJA_REGISTROS: 'Registros',
    HOJA_EQUIPO_EVALUADOR: 'Equipo_Evaluador',

    DOMINIO_INTERNO: 'oga.org.gt',
    TZ: 'America/Guatemala',

    DOCUMENTOS: {
      TEMPLATE_PRESUPUESTO: '1DA8YwqegrnBFKbRdQ47Ner0hoTgwGMdC_qXGHIdHwXY',
      TEMPLATE_AGENDA: '1_dKwKrDA4jIhcK3Uqs2yoK-Hekx-iHMo0k5LMdo-_nw',
      TEMPLATE_INFORME: '11O02C55Aj-KCiHPxJy4qZZb1CIefOmzz-pMtHGsoHRU',

      // Carpetas operativas PROD bajo la estructura Evaluaciones.
      BACKUP_AGENDA: '1Yl7Gfe_yrSFptzKJ15JJFWdP0yt9psKL',
      BACKUP_PRESUPUESTO: '1S5ezSfmyeR0XQGU80sBG-XdIGzYsKOKu',
      BACKUP_INFORME: '16hJLaYplqgV-O1S-iQIaROj2osGVRGer',

      TARIFA_DIA_USD: 160,

      RUTAS_OEC: {
        agenda: ['Agenda'],
        presupuesto: ['Presupuesto'],
        informe: ['Informe de Evaluación', 'Informe']
      }
    },

    OPERACION: {
      SHEET_BOLETA_TEMPLATE: 'Boletas',
      BOLETA_RENDER_MODE: 'SHEET_TEMPLATE',
      SHEET_AUDIT: 'Bitacora_WebApp_Operacion',

      // Carpeta operativa PROD de boletas.
      BACKUP_BOLETA_FOLDER_ID: '1147v0wmNU6VzRKXV5vM0PhVZpVGn2VWA',

      CALENDAR_ID: 'info@oga.org.gt',
      CALENDAR_COLOR_ID: '8',
      CALENDAR_REMINDERS: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 60 }
      ],

      EMAIL: {
        TO: 'info@oga.org.gt',
        CC: 'lsanchez@oga.org.gt',
        BCC: 'solicitudes@oga.org.gt',
        FROM_ALIAS: 'oga@oga.org.gt',
        NAME: 'Presupuestos y Evaluaciones OGA'
      },

      PROP_CALENDAR_ENABLED: 'WAPP_V17_CALENDAR_ENABLED',
      PROP_EMAIL_ENABLED: 'WAPP_V17_EMAIL_ENABLED'
    },

    TIPO_CAMBIO: {
      SHEET: 'Tipo_Cambio_Cache',
      ENDPOINT: 'https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx',
      SOAP_ACTION: 'http://www.banguat.gob.gt/variables/ws/TipoCambioDia',
      HANDLER_TRIGGER: 'WAPP_V171_TC_actualizarCacheProgramado',
      RETRIES: 3,
      WAIT_MS: [0, 1500, 3500],
      TRIGGER_EVERY_HOURS: 4,
      PROP_LAST_RATE: 'WAPP_V171_TC_LAST_RATE',
      PROP_LAST_RATE_DATE: 'WAPP_V171_TC_LAST_RATE_DATE',
      PROP_LAST_RATE_RAW: 'WAPP_V171_TC_LAST_RATE_RAW'
    },

    INTEGRIDAD: {
      SHEET_OPERACIONES: 'Control_Operaciones_WebApp',
      SHEET_CORRELATIVOS: 'Reservas_Correlativos_Boleta',
      LOCK_TIMEOUT_MS: 60000,
      PROP_FAULT_STAGE: 'WAPP_V181_FAULT_STAGE',

      // Seguridad: nunca habilitar fault injection en PROD.
      ENABLE_FAULT_INJECTION_QA: false
    },

    DUPLICADOS: {
      AUTH_KEY: 'WAPP_DUPLICATE_AUTH_V1',
      AUDIT_SHEET: 'Autorizaciones_Duplicados',
      ADMIN_EMAILS: ['carchila@oga.org.gt']
    },

    FEATURES: {
      DOCUMENT_GENERATION: true,
      CERTIFICATE_QUEUE: true,
      PUBLIC_ATTENDANCE: true
    }
  }
};


function WAPP_getEnv_() {
  const env = String(
    PropertiesService.getScriptProperties().getProperty('APP_ENV') || 'QA'
  ).trim().toUpperCase();

  if (!WAPP_CONFIG[env]) {
    throw new Error('Ambiente no configurado: ' + env);
  }

  return env;
}


function WAPP_cfg_() {
  return WAPP_CONFIG[WAPP_getEnv_()];
}


function WAPP_CONFIG_getPath_(obj, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (
      acc && Object.prototype.hasOwnProperty.call(acc, key)
        ? acc[key]
        : undefined
    ), obj);
}


function WAPP_CONFIG_requiredPaths_() {
  return [
    'REGISTRO_MAESTRO_ID',
    'REGISTRO_BOLETAS_ID',
    'EVALUADORES_ID',

    'DOCUMENTOS.TEMPLATE_PRESUPUESTO',
    'DOCUMENTOS.TEMPLATE_AGENDA',
    'DOCUMENTOS.TEMPLATE_INFORME',
    'DOCUMENTOS.BACKUP_AGENDA',
    'DOCUMENTOS.BACKUP_PRESUPUESTO',
    'DOCUMENTOS.BACKUP_INFORME',

    'OPERACION.BACKUP_BOLETA_FOLDER_ID',
    'OPERACION.CALENDAR_ID',
    'OPERACION.EMAIL.TO',
    'OPERACION.EMAIL.FROM_ALIAS',

    'TIPO_CAMBIO.ENDPOINT',
    'TIPO_CAMBIO.SOAP_ACTION',

    'INTEGRIDAD.SHEET_OPERACIONES',
    'INTEGRIDAD.SHEET_CORRELATIVOS',
    'INTEGRIDAD.PROP_FAULT_STAGE'
  ];
}


function WAPP_validateConfig_(env) {
  env = String(env || WAPP_getEnv_()).trim().toUpperCase();

  const cfg = WAPP_CONFIG[env];

  if (!cfg) {
    return {
      ok: false,
      env: env,
      faltantes: ['AMBIENTE_NO_CONFIGURADO'],
      warnings: []
    };
  }

  const faltantes = WAPP_CONFIG_requiredPaths_()
    .filter(path => {
      const value = WAPP_CONFIG_getPath_(cfg, path);

      if (Array.isArray(value)) return value.length === 0;

      return (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
      );
    });

  const adminEmails =
    cfg.DUPLICADOS &&
    Array.isArray(cfg.DUPLICADOS.ADMIN_EMAILS)
      ? cfg.DUPLICADOS.ADMIN_EMAILS.filter(WAPP_emailOk_)
      : [];

  if (!adminEmails.length) {
    faltantes.push('DUPLICADOS.ADMIN_EMAILS');
  }

  const warnings = [];

  if (
    env === 'PROD' &&
    cfg.INTEGRIDAD &&
    cfg.INTEGRIDAD.ENABLE_FAULT_INJECTION_QA === true
  ) {
    faltantes.push(
      'INTEGRIDAD.ENABLE_FAULT_INJECTION_QA_DEBE_SER_FALSE_EN_PROD'
    );
  }

  if (
    Number(
      cfg.DOCUMENTOS &&
      cfg.DOCUMENTOS.TARIFA_DIA_USD
    ) <= 0
  ) {
    warnings.push(
      'DOCUMENTOS.TARIFA_DIA_USD no es mayor que cero.'
    );
  }

  return {
    ok: faltantes.length === 0,
    env: env,
    faltantes: faltantes,
    warnings: warnings
  };
}


function WAPP_assertConfig_() {
  const env = WAPP_getEnv_();
  const result = WAPP_validateConfig_(env);

  if (!result.ok) {
    throw new Error(
      'Configuración incompleta para ' +
      env +
      ': ' +
      result.faltantes.join(', ')
    );
  }

  return WAPP_CONFIG[env];
}

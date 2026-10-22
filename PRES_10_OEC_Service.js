function WAPP_OEC_obtenerContexto_(registro) {
  const cfg = WAPP_cfg_();
  const key = String(registro || '').trim().toUpperCase();
  if (!key) throw new Error('Ingrese un registro de acreditación.');

  const ss = SpreadsheetApp.openById(cfg.REGISTRO_MAESTRO_ID);
  const shClientes = ss.getSheetByName(cfg.HOJA_CLIENTES);
  const shCiclos = ss.getSheetByName(cfg.HOJA_CICLOS);

  if (!shClientes) throw new Error('No existe la hoja Clientes.');
  if (!shCiclos) throw new Error('No existe la hoja Copy of Ciclos.');

  const clientes = WAPP_rowsByHeaders_(shClientes);
  const cliente = clientes.find(r =>
    String(r.OEC_ID || '').trim().toUpperCase() === key
  );

  if (!cliente) {
    throw new Error('No se encontró el registro en Clientes: ' + key);
  }

  const estado = String(cliente.Estado || '').trim();
  if (WAPP_norm_(estado) === 'cancelado') {
    throw new Error('El registro se encuentra Cancelado y no puede continuar.');
  }

  const ciclos = WAPP_rowsByHeaders_(shCiclos)
    .filter(r => String(r.OEC_ID || '').trim().toUpperCase() === key);

  const vigente = ciclos.find(r => WAPP_norm_(r.Estado_Ciclo) === 'vigente');
  const cicloRow = vigente || ciclos[0] || null;

  const ciclo = cicloRow ? {
    oficialAsignado: String(cicloRow['Oficial Asignado'] || '').trim(),
    acreditadoDesde: cicloRow['Acreditado desde'] || '',
    cicloDesde: cicloRow['Ciclo_Desde(YYYY)'] || '',
    cicloHasta: cicloRow['Ciclo_Hasta(YYYY)'] || '',
    mesAncla: cicloRow['Mes_Ancla(1-12)'] || '',
    inicial: WAPP_dateText_(cicloRow.Inicial),
    sg1: WAPP_dateText_(cicloRow.SG1),
    sg2: WAPP_dateText_(cicloRow.SG2),
    sg3: WAPP_dateText_(cicloRow.SG3),
    reevaluacion: WAPP_dateText_(cicloRow.Reevaluacion),
    cicloId: String(cicloRow.Ciclo_ID || '').trim(),
    estadoCiclo: String(cicloRow.Estado_Ciclo || '').trim()
  } : null;

  const programa = WAPP_EVAL_resolverPrograma_(ciclo);
  const ciclosAcreditados = WAPP_EVAL_calcularCiclosAcreditados_(
    ciclo ? ciclo.acreditadoDesde : cliente['Acreditado desde'],
    programa.anioActual
  );

  return {
    registro: key,
    razonSocial: String(cliente.Razon_Social || '').trim(),
    nombreComercial: String(cliente['Nombre Comercial'] || '').trim(),
    tipo: String(cliente.Tipo || '').trim(),
    norma: String(cliente.Norma || '').trim(),
    nit: String(cliente.NIT || '').trim(),
    contacto: String(cliente.Contacto || '').trim(),
    email: String(cliente.Email || '').trim(),
    email2: String(cliente.Email_2 || '').trim(),
    estado: estado,
    representanteLegal: String(cliente['Representante Legal'] || '').trim(),

    // Fuente de dirección pendiente de definir con OGA.
    direccion: '',
    direccionDisponible: false,

    ciclo: ciclo,
    anioActual: programa.anioActual,
    tiposEvaluacionPermitidos: programa.permitidos,
    tiposEvaluacionCatalogo: WAPP_EVAL_catalogoTipos_(),
    tipoEvaluacionSugerido: programa.sugerido,
    mensajeTipoEvaluacion: programa.mensaje,
    ciclosAcreditados: ciclosAcreditados
  };
}

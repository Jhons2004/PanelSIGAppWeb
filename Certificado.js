// =============================
// CONFIGURACIÓN
// =============================
const ID_ARCHIVO_CERTIFICADOS = "1W30ZEOKJ3Sw1w9SIyZJxs46oLCVWykAT7wN3ozWANAc";
const ID_PLANTILLA_DOC        = "1YSNs4_EMr8vhd81tTw5C5oJwQc1kJjeRtFsXL_ZU7lA";
const ID_ARCHIVO_CONTROL      = "1QpTvI3pPEuhS5FnLiWfnLjCMCKnvkzR1iz5t_Xu4gK8";
const ID_CARPETA_CERTIFICADOS = "1T2BLtMY6NiIWCiU4wKD2AnHy_Oe9nRio";
const ID_USUARIOS_DB          = "1SOdGKBGv4tGfG5Ktssxq-TyKZSmYphqJkF87Kx1vtsY"; // ✅ NUEVO

// =============================
// FUNCIONES PRINCIPALES
// =============================

function generarCertificadoManual(datos) {
  const { registro, oficial, fecha } = datos;
  if (!registro || !oficial || !fecha) return "❌ Faltan datos obligatorios.";

  try {
    const datosFormulario = buscarDatosEnFormulario(registro);
    if (!datosFormulario) {
      return "❌ Registro no encontrado en 'Respuestas de formulario 1'";
    }

    const datosCompletados = verificarYCompletarDatos(registro, datosFormulario, oficial, fecha);
    const correlativo      = obtenerSiguienteCorrelativo();
    const carpeta          = buscarCarpetaPorOficial(oficial); // devuelve "" de forma segura
    const scheme           = traducirEsquema(datosCompletados.esquema);

    Logger.log("=== DATOS PARA EL CERTIFICADO ===");
    Logger.log("Registro: "         + datosCompletados.registro);
    Logger.log("Razón Social: "     + datosCompletados.razonSocial);
    Logger.log("Nombre Comercial: " + datosCompletados.nombreComercial);
    Logger.log("Esquema: "          + datosCompletados.esquema);
    Logger.log("Norma: "            + datosCompletados.norma);
    Logger.log("Oficial: "          + oficial);

    const doc = crearDocumentoCertificado({
      registro:        datosCompletados.registro,
      razon:           datosCompletados.razonSocial,
      esquema:         datosCompletados.esquema,
      norma:           datosCompletados.norma,
      correlativo,
      oficial,
      fecha,
      nombreComercial: datosCompletados.nombreComercial,
      scheme
    });

    const docId  = doc.getId();
    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

    actualizarRegistroEnRespuestasCert(datosCompletados, {
      correlativo, carpeta, scheme, docId, docUrl, oficial, fecha
    });

    return `✨ ¡Certificado ${correlativo} generado con éxito! ✨`;

  } catch (error) {
    Logger.log("Error en generarCertificadoManual: " + error.toString());
    return "❌ Error al generar certificado: " + error.message;
  }
}

// =============================
// GESTIÓN DE DATOS
// =============================

function buscarDatosEnFormulario(registro) {
  const hoja = SpreadsheetApp.openById(ID_ARCHIVO_CERTIFICADOS)
                             .getSheetByName("Respuestas de formulario 1");
  if (!hoja) {
    Logger.log("❌ No se encontró la hoja 'Respuestas de formulario 1'");
    return null;
  }

  const datos      = hoja.getDataRange().getValues();
  const encabezados = datos[0];

  // Buscar primero en columna C (índice 2)
  for (let i = 1; i < datos.length; i++) {
    const registroEnFila = String(datos[i][2] || "").trim().toUpperCase();
    if (registroEnFila === registro.trim().toUpperCase()) {
      return mapearDatosFormulario(datos[i], encabezados);
    }
  }

  // Respaldo: buscar en todas las columnas
  for (let i = 1; i < datos.length; i++) {
    for (let j = 0; j < datos[i].length; j++) {
      if (String(datos[i][j] || "").trim().toUpperCase() === registro.trim().toUpperCase()) {
        return mapearDatosFormulario(datos[i], encabezados);
      }
    }
  }

  return null;
}

function mapearDatosFormulario(fila, encabezados) {
  return {
    marcaTemporal:   fila[0]  || new Date(),
    registro:        fila[2]  || "",   // Col C
    esquema:         fila[3]  || "",   // Col D
    razonSocial:     fila[5]  || "",   // Col F
    nombreComercial: fila[6]  || "",   // Col G
    norma:           fila[21] || ""    // Col V
  };
}

function verificarYCompletarDatos(registro, datosFormulario, oficial, fecha) {
  const hoja = SpreadsheetApp.openById(ID_ARCHIVO_CERTIFICADOS)
                             .getSheetByName("RespuestasCert");
  if (!hoja) return datosFormulario;

  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    const registroExistente = String(datos[i][1] || "").trim().toUpperCase();
    if (registroExistente === registro.trim().toUpperCase()) {
      return completarDatosFaltantes(datos[i], datosFormulario, i + 1, hoja);
    }
  }

  return datosFormulario;
}

function completarDatosFaltantes(filaExistente, datosFormulario, numFila, hoja) {
  const dc = {
    marcaTemporal:   filaExistente[0] || datosFormulario.marcaTemporal,
    registro:        filaExistente[1] || datosFormulario.registro,
    razonSocial:     datosFormulario.razonSocial    || filaExistente[4] || "",
    esquema:         datosFormulario.esquema         || filaExistente[5] || "",
    norma:           datosFormulario.norma           || filaExistente[6] || "",
    nombreComercial: datosFormulario.nombreComercial || filaExistente[9] || ""
  };

  const filaNueva = [
    dc.marcaTemporal, dc.registro,
    filaExistente[2]  || "", filaExistente[3]  || "",
    dc.razonSocial,   dc.esquema,   dc.norma,
    filaExistente[7]  || "", filaExistente[8]  || "",
    dc.nombreComercial,
    filaExistente[10] || "", filaExistente[11] || "",
    filaExistente[12] || "", filaExistente[13] || "",
    filaExistente[14] || "", filaExistente[15] || "",
    filaExistente[16] || "", filaExistente[17] || "",
    filaExistente[18] || ""
  ];

  hoja.getRange(numFila, 1, 1, filaNueva.length).setValues([filaNueva]);
  return dc;
}

function actualizarRegistroEnRespuestasCert(datosBase, datosGenerados) {
  const hoja = SpreadsheetApp.openById(ID_ARCHIVO_CERTIFICADOS)
                             .getSheetByName("RespuestasCert");
  if (!hoja) return;

  const datos         = hoja.getDataRange().getValues();
  let   filaExistente = -1;

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][1] || "").trim().toUpperCase() === datosBase.registro.trim().toUpperCase()) {
      filaExistente = i + 1;
      break;
    }
  }

  const filaNueva = [
    datosBase.marcaTemporal || new Date(),
    datosBase.registro,
    datosGenerados.oficial,
    datosGenerados.fecha,
    datosBase.razonSocial,
    datosBase.esquema,
    datosBase.norma,
    datosGenerados.carpeta,
    datosGenerados.correlativo,
    datosBase.nombreComercial,
    datosGenerados.scheme,
    datosGenerados.docId,
    datosGenerados.docUrl,
    datosGenerados.docUrl,
    "Completed",
    datosGenerados.docId,
    datosGenerados.docUrl,
    datosGenerados.docUrl,
    "Completed"
  ];

  if (filaExistente > 0) {
    hoja.getRange(filaExistente, 1, 1, filaNueva.length).setValues([filaNueva]);
  } else {
    hoja.appendRow(filaNueva);
  }
}

// =============================
// GENERACIÓN DE DOCUMENTO
// =============================

function crearDocumentoCertificado(info) {
  const carpetaDestino = DriveApp.getFolderById(ID_CARPETA_CERTIFICADOS);

  const copia = DriveApp.getFileById(ID_PLANTILLA_DOC)
    .makeCopy(`Certificado ${info.registro} - ${info.correlativo}`, carpetaDestino);

  const doc  = DocumentApp.openById(copia.getId());
  const body = doc.getBody();

  const marcadores = {
    "<<Registro de Acreditación>>": info.registro,
    "<<Razón Social>>":             info.razon,
    "<<Nombre comercial>>":         info.nombreComercial,
    "<<Esquema de Acreditación>>":  info.esquema,
    "<<Scheme>>":                   info.scheme,
    "<<Norma>>":                    info.norma,
    "<<Correlativo>>":              info.correlativo
  };

  Object.entries(marcadores).forEach(([clave, valor]) => {
    body.replaceText(clave, valor !== undefined && valor !== null ? String(valor) : "");
  });

  const instalaciones = obtenerInstalacionesComoArray(info.registro);
  insertarTablaInstalaciones(doc, instalaciones);

  doc.saveAndClose();
  return doc;
}

function insertarTablaInstalaciones(doc, instalaciones, marcador = "tabla_instalaciones") {
  const body = doc.getBody();
  const pos  = body.findText(marcador);

  if (pos) {
    const parrafo = pos.getElement().getParent();
    const index   = body.getChildIndex(parrafo);
    parrafo.clear();

    const tabla = body.insertTable(index + 1, [
      ['Instalación', 'Dirección', 'Acreditado desde']
    ]);

    instalaciones.forEach(inst => {
      const fila = tabla.appendTableRow();
      fila.appendTableCell(inst.nombre);
      fila.appendTableCell(inst.direccion);
      fila.appendTableCell(inst.acreditadoDesde);
    });
  } else {
    Logger.log("⚠️ No se encontró el marcador para la tabla de instalaciones");
    body.appendParagraph("Instalaciones:\n" + generarTextoPlano(instalaciones));
  }
}

// =============================
// FUNCIONES AUXILIARES
// =============================

function obtenerInstalacionesComoArray(registro) {
  const hoja = SpreadsheetApp.openById(ID_ARCHIVO_CERTIFICADOS)
                             .getSheetByName("Instalaciones");
  if (!hoja) return [];

  const datos         = hoja.getDataRange().getValues();
  const instalaciones = [];

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0] || "").trim().toUpperCase() !== registro.trim().toUpperCase()) continue;

    let fechaFormateada = "Fecha no disponible";
    const fecha = datos[i][3];

    if (fecha instanceof Date && !isNaN(fecha.getTime())) {
      fechaFormateada = `${fecha.getFullYear()}-${
        String(fecha.getMonth() + 1).padStart(2, '0')}-${
        String(fecha.getDate()).padStart(2, '0')}`;
    }

    instalaciones.push({
      nombre:          String(datos[i][1] || ""),
      direccion:       String(datos[i][2] || ""),
      acreditadoDesde: fechaFormateada
    });
  }

  return instalaciones;
}

function generarTextoPlano(instalaciones) {
  if (!instalaciones.length) return "No se encontraron instalaciones";
  return instalaciones
    .map(i => `${i.nombre} - ${i.direccion} (Desde: ${i.acreditadoDesde})`)
    .join("\n");
}

function obtenerSiguienteCorrelativo() {
  const hoja  = SpreadsheetApp.openById(ID_ARCHIVO_CONTROL).getSheetByName("Actividad");
  const celda = hoja.getRange("F2");

  let valorActual = parseInt(celda.getValue(), 10);
  if (isNaN(valorActual)) valorActual = 0;

  const siguiente = valorActual + 1;
  celda.setValue(siguiente);

  return siguiente.toString().padStart(3, '0');
}

function traducirEsquema(esquema) {
  const mapa = {
    "Laboratorio de calibración": "Calibration Laboratory",
    "Laboratorio de ensayo":      "Testing Laboratory",
    "Laboratorio clínico":        "Medical Laboratory",
    "Organismo de inspección":    "Inspection Body"
  };
  return mapa[esquema] || esquema;
}

// ✅ CORREGIDO — lee de hoja Usuarios, Col A = nombre/usuario
function obtenerOficiales() {
  try {
    const hoja = SpreadsheetApp.openById(ID_USUARIOS_DB)
                               .getSheetByName("Usuarios");
    if (!hoja) {
      Logger.log("❌ No se encontró la hoja 'Usuarios' en ID_USUARIOS_DB");
      return [];
    }

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) {
      Logger.log("⚠️ La hoja 'Usuarios' no tiene datos");
      return [];
    }

    const valores = hoja.getRange(2, 1, lastRow - 1, 1)
                        .getValues()
                        .flat()
                        .map(v => String(v || "").trim())
                        .filter(Boolean);

    Logger.log("✅ Oficiales cargados (" + valores.length + "): " + JSON.stringify(valores));
    return valores;

  } catch (e) {
    Logger.log("❌ Error en obtenerOficiales: " + e.message);
    return [];
  }
}

// ✅ CORREGIDO — hoja "Carpetas" no existe, devuelve vacío de forma segura
function buscarCarpetaPorOficial(nombreOficial) {
  return "";
}

function obtenerFechaHoraActual() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss"
  );
}

function obtenerHTMLInstalaciones(registro) {
  const datos = obtenerInstalacionesComoArray(registro);
  if (!datos.length) return "<p>No se encontraron instalaciones asociadas.</p>";

  let html = `
    <table style="border-collapse:collapse; width:100%; font-size:12px;">
      <thead>
        <tr style="background-color:#f2f2f2;">
          <th style="border:1px solid #ccc; padding:8px;">Instalación</th>
          <th style="border:1px solid #ccc; padding:8px;">Dirección</th>
          <th style="border:1px solid #ccc; padding:8px;">Acreditado desde</th>
        </tr>
      </thead>
      <tbody>
  `;

  datos.forEach(inst => {
    html += `
      <tr>
        <td style="border:1px solid #ccc; padding:8px;">${inst.nombre}</td>
        <td style="border:1px solid #ccc; padding:8px;">${inst.direccion}</td>
        <td style="border:1px solid #ccc; padding:8px;">${inst.acreditadoDesde}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

// =============================
// ✅ NAVEGACIÓN — ELIMINADA
// =============================
// mostrarPanelCertificados() → definida en Code.gs → cargarVista('Certificados')
// mostrarPanelMenu()         → definida en Code.gs → cargarVista('Menu')
// NO redefinir aquí para evitar conflictos de nombres.
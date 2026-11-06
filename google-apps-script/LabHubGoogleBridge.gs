/**
 * ============================================================================
 * LABHUB ST (UPN) — PUENTE MAESTRO GOOGLE WORKSPACE & GOOGLE DRIVE v2.2
 * Google Apps Script Webhook Service — Bidireccional Completo
 * 
 * Este script se aloja en https://script.google.com en la cuenta de Google
 * del Coordinador o Administrador de los Laboratorios de Ingeniería UPN.
 * Permite almacenar a costo $0:
 * 1. Todos los archivos binarios/ASCII .stl en Google Drive organizados por código.
 * 2. Copia de respaldo íntegra del estado de la base de datos (Sistema_BD/labhub_state.json).
 * 3. Actas de préstamo HTML y firmas PNG en Prestamos_Equipos/<CODIGO>/.
 * 4. Registro maestro en vivo en Google Sheets con 4 hojas sincronizadas sin duplicados.
 * 5. Creación de eventos en Google Calendar e invitaciones a Asesores.
 * 6. Recuperación bidireccional de archivos STL y estado JSON hacia Vercel/Serverless.
 * ============================================================================
 */

var ROOT_FOLDER_NAME = "LabHub_ST_UPN";
var SPREADSHEET_NAME = "LabHub_ST_BaseDeDatos";

/**
 * Función de inicialización automática o manual para crear la estructura completa de carpetas y hojas.
 */
function setup() {
  var rootFolder = getOrCreateRootFolder(ROOT_FOLDER_NAME);
  var bdFolder = getOrCreateSubFolder(rootFolder, "Sistema_BD");
  var printsFolder = getOrCreateSubFolder(rootFolder, "Impresiones_3D");
  var loansFolder = getOrCreateSubFolder(rootFolder, "Prestamos_Equipos");
  var spreadsheet = getOrCreateSpreadsheet(rootFolder, SPREADSHEET_NAME);

  Logger.log("Configuración LabHub ST completada:");
  Logger.log("Carpeta Raíz Drive: " + rootFolder.getUrl());
  Logger.log("Hoja de Cálculo: " + spreadsheet.getUrl());
  Logger.log("Carpeta BD: " + bdFolder.getUrl());
  Logger.log("Carpeta Impresiones 3D: " + printsFolder.getUrl());
  Logger.log("Carpeta Préstamos: " + loansFolder.getUrl());

  return {
    ok: true,
    driveRootFolderUrl: rootFolder.getUrl(),
    spreadsheetUrl: spreadsheet.getUrl(),
    bdFolderUrl: bdFolder.getUrl(),
    printsFolderUrl: printsFolder.getUrl(),
    loansFolderUrl: loansFolder.getUrl(),
  };
}

/**
 * Punto de entrada HTTP POST para recibir eventos y consultas del backend LabHub ST.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Esperar hasta 15 segundos para serializar operaciones en Google Drive / Sheets
  lock.tryLock(15000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Cuerpo de petición vacío" });
    }

    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var payload = requestData.payload || {};

    // 1. Validación de seguridad opcional si está configurado un WEBHOOK_SECRET en Script Properties
    var configuredSecret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    if (configuredSecret && configuredSecret.trim() !== "") {
      var clientSecret = requestData.webhookSecret || payload.webhookSecret;
      if (!clientSecret || String(clientSecret).trim() !== configuredSecret.trim()) {
        return jsonResponse({
          ok: false,
          error: "No autorizado: Webhook secret inválido o no suministrado.",
        });
      }
    }

    var rootFolder = getOrCreateRootFolder(ROOT_FOLDER_NAME);
    var spreadsheet = getOrCreateSpreadsheet(rootFolder, SPREADSHEET_NAME);

    var result = { ok: true, action: action };

    switch (action) {
      case "PING_INIT":
        result = handlePingInit(rootFolder, spreadsheet);
        break;

      case "SAVE_STATE":
        result = handleSaveState(rootFolder, payload);
        break;

      case "GET_STATE":
        result = handleGetState(rootFolder);
        break;

      case "FETCH_STL_FILE":
        result = handleFetchStlFile(rootFolder, payload);
        break;

      case "SYNC_RESERVATION":
        result = handleSyncReservation(spreadsheet, payload);
        break;

      case "SYNC_ADVISORY":
        result = handleSyncAdvisory(spreadsheet, payload);
        break;

      case "SYNC_LOAN":
        result = handleSyncLoan(rootFolder, spreadsheet, payload);
        break;

      case "SYNC_PRINT_3D":
        result = handleSyncPrint3D(rootFolder, spreadsheet, payload);
        break;

      case "SYNC_PRINT_STATUS":
        result = handleSyncPrintStatus(spreadsheet, payload);
        break;

      default:
        result = { ok: false, error: "Acción no reconocida: " + action };
        break;
    }

    return jsonResponse(result);
  } catch (error) {
    Logger.log("Error en doPost: " + error.toString());
    return jsonResponse({
      ok: false,
      error: error.toString(),
      stack: error.stack,
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Endpoint GET para verificar salud y estado de webhook desde un navegador.
 */
function doGet(e) {
  var rootFolder = getOrCreateRootFolder(ROOT_FOLDER_NAME);
  var spreadsheet = getOrCreateSpreadsheet(rootFolder, SPREADSHEET_NAME);

  return jsonResponse({
    ok: true,
    service: "LabHub ST UPN — Google Bridge v2.2",
    status: "ONLINE",
    scriptVersion: "2.2",
    message: "El puente de Google Workspace está activo y sincronizado.",
    driveRootFolderUrl: rootFolder.getUrl(),
    spreadsheetUrl: spreadsheet.getUrl(),
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// MANEJADORES DE ACCIONES ESPECÍFICAS
// ============================================================================

function handlePingInit(rootFolder, spreadsheet) {
  // Asegurar carpetas base
  getOrCreateSubFolder(rootFolder, "Sistema_BD");
  getOrCreateSubFolder(rootFolder, "Impresiones_3D");
  getOrCreateSubFolder(rootFolder, "Prestamos_Equipos");

  return {
    ok: true,
    scriptVersion: "2.2",
    message: "Conexión bidireccional exitosa con Google Workspace y Google Drive.",
    driveRootFolderUrl: rootFolder.getUrl(),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

/**
 * Guarda o sobrescribe el archivo labhub_state.json en la carpeta Sistema_BD sin generar duplicados.
 */
function handleSaveState(rootFolder, payload) {
  var bdFolder = getOrCreateSubFolder(rootFolder, "Sistema_BD");
  var fileName = "labhub_state.json";
  var jsonContent = "";

  if (typeof payload.stateJson === "string") {
    jsonContent = payload.stateJson;
  } else if (payload.state) {
    jsonContent = JSON.stringify(payload.state, null, 2);
  } else {
    return { ok: false, error: "No se proporcionaron datos de estado en el payload." };
  }

  var files = bdFolder.getFilesByName(fileName);
  var targetFile;

  if (files.hasNext()) {
    targetFile = files.next();
    targetFile.setContent(jsonContent);
  } else {
    targetFile = bdFolder.createFile(fileName, jsonContent, "application/json");
  }

  targetFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: targetFile.getId(),
    webUrl: targetFile.getUrl(),
    sizeBytes: jsonContent.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Lee y retorna el contenido JSON de Sistema_BD/labhub_state.json si existe en Google Drive.
 */
function handleGetState(rootFolder) {
  var bdFolder = getOrCreateSubFolder(rootFolder, "Sistema_BD");
  var files = bdFolder.getFilesByName("labhub_state.json");

  if (!files.hasNext()) {
    return { ok: true, exists: false, state: null };
  }

  var file = files.next();
  var rawContent = file.getBlob().getDataAsString("utf-8");
  try {
    var stateParsed = JSON.parse(rawContent);
    return {
      ok: true,
      exists: true,
      fileId: file.getId(),
      webUrl: file.getUrl(),
      state: stateParsed,
    };
  } catch (err) {
    return {
      ok: false,
      error: "Error al parsear el JSON de labhub_state.json: " + err.toString(),
    };
  }
}

/**
 * Recupera un archivo STL binario desde Google Drive en formato Base64.
 */
function handleFetchStlFile(rootFolder, payload) {
  var targetFile = null;

  // 1. Intentar búsqueda directa por driveFileId
  if (payload.driveFileId) {
    try {
      targetFile = DriveApp.getFileById(payload.driveFileId);
    } catch (e) {
      Logger.log("No se pudo obtener archivo por ID: " + payload.driveFileId);
    }
  }

  // 2. Si no se encontró por ID, buscar en la carpeta Impresiones_3D/<code?>/<fileName?>
  if (!targetFile && payload.code && payload.storedFileName) {
    var printsRoot = getOrCreateSubFolder(rootFolder, "Impresiones_3D");
    var codeFolders = printsRoot.getFoldersByName(payload.code);
    if (codeFolders.hasNext()) {
      var codeFolder = codeFolders.next();
      var files = codeFolder.getFilesByName(payload.storedFileName);
      if (files.hasNext()) {
        targetFile = files.next();
      }
    }
  }

  if (!targetFile) {
    return {
      ok: false,
      error: "Archivo STL no encontrado en Google Drive para los parámetros proporcionados.",
    };
  }

  var blob = targetFile.getBlob();
  var bytes = blob.getBytes();
  var base64Data = Utilities.base64Encode(bytes);

  return {
    ok: true,
    fileId: targetFile.getId(),
    fileName: targetFile.getName(),
    sizeBytes: bytes.length,
    base64Data: base64Data,
  };
}

function handleSyncReservation(spreadsheet, payload) {
  var sheet = spreadsheet.getSheetByName("Reservas");
  var op = payload.operation || "CREATE";
  var r = payload.reservation;
  if (!r) return { ok: false, error: "Datos de reserva faltantes" };

  var participantsText = (r.participants || [])
    .map(function (p) {
      return p.fullName + " (" + p.upnCode + ")";
    })
    .join(", ");

  var blocksText = (r.blockIds || []).join(", ");

  var data = sheet.getDataRange().getValues();
  var foundRow = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(r.code)) {
      foundRow = i + 1;
      break;
    }
  }

  if (op === "CANCEL") {
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 14).setValue("CANCELADA");
    }
  } else {
    var rowValues = [
      new Date().toISOString(),
      r.code,
      r.origin || "RESERVA_DIRECTA",
      r.labId,
      r.date,
      blocksText,
      r.leadStudent ? r.leadStudent.fullName : "",
      r.leadStudent ? r.leadStudent.upnCode : "",
      participantsText,
      r.projectName,
      r.career,
      r.course,
      r.nrc,
      r.status || "ACTIVA",
    ];

    if (foundRow !== -1) {
      sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  }

  return { ok: true, code: r.code };
}

function handleSyncAdvisory(spreadsheet, payload) {
  var sheet = spreadsheet.getSheetByName("Asesorias");
  var adv = payload.advisory;
  if (!adv) return { ok: false, error: "Datos de asesoría faltantes" };

  var studentsText = (adv.students || [])
    .map(function (s) {
      return s.fullName + " (" + s.upnCode + ")";
    })
    .join(", ");

  var blocksText = (adv.blockIds || []).join(", ");

  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(adv.code)) {
      foundRow = i + 1;
      break;
    }
  }

  var rowValues = [
    new Date().toISOString(),
    adv.code,
    adv.advisorName,
    adv.advisorEmail,
    adv.labId,
    adv.date,
    blocksText,
    adv.projectName,
    adv.course,
    adv.nrc,
    studentsText,
    adv.topicNotes || "",
    adv.linkedReservationCode,
    adv.status || "PROGRAMADA",
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  // Creación o actualización de evento en Google Calendar si está autorizado
  var calResult = syncAdvisoriesCalendar_(adv, payload, studentsText);

  return {
    ok: true,
    scriptVersion: "2.2",
    code: adv.code,
    calendarCreated: calResult.calendarCreated,
    eventUrl: calResult.eventUrl,
  };
}

/**
 * Sincroniza el evento en Google Calendar con el asesor y horario exacto (UTC-5 Perú).
 */
function syncAdvisoriesCalendar_(adv, payload, studentsText) {
  var calendarCreated = false;
  var eventUrl = "";
  try {
    var shouldSyncCal = payload.syncCalendarV2 !== undefined ? Boolean(payload.syncCalendarV2) : (payload.syncCalendar !== false);
    if (shouldSyncCal && adv.date && adv.advisorEmail) {
      var TIME_BLOCK_MAP = {
        'B1': { startTime: '07:30', endTime: '09:00', order: 1 },
        'B2': { startTime: '09:10', endTime: '10:40', order: 2 },
        'B3': { startTime: '10:50', endTime: '12:20', order: 3 },
        'B4': { startTime: '12:30', endTime: '14:00', order: 4 },
        'B5': { startTime: '14:30', endTime: '16:00', order: 5 },
        'B6': { startTime: '16:10', endTime: '17:40', order: 6 },
        'B7': { startTime: '17:50', endTime: '19:20', order: 7 },
        'B8': { startTime: '19:30', endTime: '21:00', order: 8 },
        'B9': { startTime: '21:10', endTime: '22:40', order: 9 }
      };

      var startHour = 9, startMin = 10;
      var endHour = 10, endMin = 40;

      if (payload.startTime && payload.endTime) {
        var startParts = String(payload.startTime).split(':');
        var endParts = String(payload.endTime).split(':');
        startHour = parseInt(startParts[0], 10);
        startMin = parseInt(startParts[1], 10);
        endHour = parseInt(endParts[0], 10);
        endMin = parseInt(endParts[1], 10);
      } else if (adv.blockIds && adv.blockIds.length > 0) {
        var sortedBlocks = adv.blockIds.slice().sort(function(a, b) {
          return (TIME_BLOCK_MAP[a] ? TIME_BLOCK_MAP[a].order : 0) - (TIME_BLOCK_MAP[b] ? TIME_BLOCK_MAP[b].order : 0);
        });
        var firstBlock = TIME_BLOCK_MAP[sortedBlocks[0]];
        var lastBlock = TIME_BLOCK_MAP[sortedBlocks[sortedBlocks.length - 1]];
        if (firstBlock && firstBlock.startTime) {
          var sp = firstBlock.startTime.split(':');
          startHour = parseInt(sp[0], 10);
          startMin = parseInt(sp[1], 10);
        }
        if (lastBlock && lastBlock.endTime) {
          var ep = lastBlock.endTime.split(':');
          endHour = parseInt(ep[0], 10);
          endMin = parseInt(ep[1], 10);
        }
      }

      var pad2 = function(n) { return n < 10 ? "0" + n : String(n); };
      var startIso = adv.date + "T" + pad2(startHour) + ":" + pad2(startMin) + ":00-05:00";
      var endIso = adv.date + "T" + pad2(endHour) + ":" + pad2(endMin) + ":00-05:00";
      var startTime = new Date(startIso);
      var endTime = new Date(endIso);

      var eventTitle = "[LabHub UPN] Asesoría: " + adv.projectName + " (" + adv.code + ")";
      var blocksStr = payload.blocksLabel || (adv.blockIds ? adv.blockIds.join(', ') : '');
      var startDisplay = payload.startTime || (pad2(startHour) + ":" + pad2(startMin));
      var endDisplay = payload.endTime || (pad2(endHour) + ":" + pad2(endMin));

      var description =
        "Asesoría Académica en Laboratorio UPN\n" +
        "Código: " + adv.code + "\n" +
        "Horario reservado: " + blocksStr + " (" + startDisplay + " - " + endDisplay + ")\n" +
        "Asesor: " + adv.advisorName + "\n" +
        "Proyecto: " + adv.projectName + "\n" +
        "Curso: " + adv.course + " (NRC: " + adv.nrc + ")\n" +
        "Estudiantes:\n" + studentsText + "\n" +
        (adv.topicNotes ? "\nConsulta:\n" + adv.topicNotes : "");

      var eventLocation = "Laboratorio " + (adv.labId ? String(adv.labId).toUpperCase() : "") + " - UPN";

      var defaultCal = CalendarApp.getDefaultCalendar();
      var dayStart = new Date(adv.date + "T00:00:00-05:00");
      var dayEnd = new Date(adv.date + "T23:59:59-05:00");
      var dayEvents = defaultCal.getEvents(dayStart, dayEnd);
      var validEvent = null;

      for (var i = 0; i < dayEvents.length; i++) {
        var ev = dayEvents[i];
        var title = ev.getTitle() || "";
        var desc = ev.getDescription() || "";
        if (title.indexOf(adv.code) !== -1 || desc.indexOf(adv.code) !== -1) {
          var existingEvent = ev;
          var timeChanged =
            existingEvent.getStartTime().getTime() !== startTime.getTime() ||
            existingEvent.getEndTime().getTime() !== endTime.getTime();

          if (!timeChanged && !validEvent) {
            validEvent = existingEvent;
          } else {
            // Eliminar duplicados o eventos con horario incorrecto/antiguo (ej. bug 8am-10am)
            try {
              existingEvent.deleteEvent();
            } catch (delErr) {
              Logger.log("Error al eliminar evento duplicado u obsoleto: " + delErr.toString());
            }
          }
        }
      }
      var existingEvent = validEvent;

      var eventOptions = {
        description: description,
        location: eventLocation,
        guests: adv.advisorEmail,
        sendInvites: true,
      };

      var event = null;
      if (existingEvent) {
        existingEvent.setTitle(eventTitle);
        existingEvent.setDescription(description);
        existingEvent.setLocation(eventLocation);
        event = existingEvent;
        calendarCreated = true;
      } else {
        event = defaultCal.createEvent(eventTitle, startTime, endTime, eventOptions);
        if (event) {
          calendarCreated = true;
        }
      }

      if (event) {
        eventUrl = "https://calendar.google.com/calendar/r/eventedit/" + event.getId();
      }
    }
  } catch (calError) {
    Logger.log("Error creando o actualizando evento de Calendar: " + calError.toString());
  }

  return { calendarCreated: calendarCreated, eventUrl: eventUrl };
}

function handleSyncLoan(rootFolder, spreadsheet, payload) {
  var sheet = spreadsheet.getSheetByName("Prestamos_Equipos");
  var loan = payload.loan;
  if (!loan) return { ok: false, error: "Datos de préstamo faltantes" };

  var loansRoot = getOrCreateSubFolder(rootFolder, "Prestamos_Equipos");
  var loanFolder = getOrCreateSubFolder(loansRoot, loan.code);
  loanFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var signatureDriveUrl = loan.driveSignatureUrl || "";
  var documentDriveUrl = loan.driveDocumentUrl || "";

  // 1. Guardar firma digital PNG en la carpeta del préstamo
  if (loan.signatureDataUrl && loan.signatureDataUrl.indexOf("base64,") !== -1) {
    try {
      var sigFileName = "Firma_" + loan.code + ".png";
      var sigFiles = loanFolder.getFilesByName(sigFileName);
      var sigFile;
      var base64Sig = loan.signatureDataUrl.split("base64,")[1];
      var sigBytes = Utilities.base64Decode(base64Sig);
      var sigBlob = Utilities.newBlob(sigBytes, "image/png", sigFileName);

      if (sigFiles.hasNext()) {
        sigFile = sigFiles.next();
        sigFile.setContent(sigBytes);
      } else {
        sigFile = loanFolder.createFile(sigBlob);
      }
      sigFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      signatureDriveUrl = sigFile.getUrl();
    } catch (sigErr) {
      Logger.log("No se pudo guardar la firma en Drive: " + sigErr.toString());
    }
  }

  // 2. Guardar documento Acta_<CODE>.html si fue suministrado en el payload
  if (payload.actaHtml && typeof payload.actaHtml === "string") {
    try {
      var docFileName = "Acta_" + loan.code + ".html";
      var docFiles = loanFolder.getFilesByName(docFileName);
      var docFile;

      if (docFiles.hasNext()) {
        docFile = docFiles.next();
        docFile.setContent(payload.actaHtml);
      } else {
        docFile = loanFolder.createFile(docFileName, payload.actaHtml, "text/html; charset=utf-8");
      }
      docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      documentDriveUrl = docFile.getUrl();
    } catch (docErr) {
      Logger.log("No se pudo guardar el acta HTML en Drive: " + docErr.toString());
    }
  }

  var itemsText = (loan.items || [])
    .map(function (it) {
      return "[" + it.quantity + "x] " + it.equipmentName + " (" + it.upnCode + ")";
    })
    .join(" | ");

  var groupText = (loan.groupMembers || [])
    .map(function (g) {
      return g.fullName + " (NRC: " + g.nrc + ")";
    })
    .join(", ");

  // 3. Buscar si la fila ya existe para actualizarla o insertarla
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(loan.code)) {
      foundRow = i + 1;
      break;
    }
  }

  var rowValues = [
    loan.createdAt || new Date().toISOString(),
    loan.code,
    loan.labId,
    loan.teacherName,
    loan.cycle,
    loan.courseProgram,
    loan.attendedByName,
    itemsText,
    groupText,
    loan.responsibleName,
    loan.responsibleUpnCode,
    documentDriveUrl || signatureDriveUrl || "Registrado en Drive",
    loan.status || "PENDIENTE",
    loan.deliveredAt || "",
    loan.deliveredByAdmin || "",
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return {
    ok: true,
    code: loan.code,
    driveFolderUrl: loanFolder.getUrl(),
    driveDocumentUrl: documentDriveUrl,
    driveSignatureUrl: signatureDriveUrl,
  };
}

function handleSyncPrint3D(rootFolder, spreadsheet, payload) {
  var sheet = spreadsheet.getSheetByName("Impresiones_3D");
  var req = payload.printRequest;
  var files = payload.files || [];
  if (!req) return { ok: false, error: "Datos de solicitud 3D faltantes" };

  var printsRoot = getOrCreateSubFolder(rootFolder, "Impresiones_3D");
  var requestFolder = getOrCreateSubFolder(printsRoot, req.code);
  requestFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var uploadedFilesInfo = [];

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.base64Data) {
      try {
        var bytes = Utilities.base64Decode(f.base64Data);
        var targetFileName = f.storedFileName || f.fileName || ("pieza_" + (i + 1) + ".stl");
        var existingFiles = requestFolder.getFilesByName(targetFileName);
        var driveFile;

        if (existingFiles.hasNext()) {
          driveFile = existingFiles.next();
          driveFile.setContent(bytes);
        } else {
          var blob = Utilities.newBlob(bytes, "application/vnd.ms-pki.stl", targetFileName);
          driveFile = requestFolder.createFile(blob);
        }
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        uploadedFilesInfo.push({
          storedFileName: targetFileName,
          driveFileId: driveFile.getId(),
          driveViewUrl: driveFile.getUrl(),
        });
      } catch (fileErr) {
        Logger.log("Error guardando archivo STL en Drive: " + fileErr.toString());
      }
    }
  }

  var fileNames = files
    .map(function (f) {
      return f.fileName || f.storedFileName;
    })
    .join(", ");

  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(req.code)) {
      foundRow = i + 1;
      break;
    }
  }

  var rowValues = [
    req.createdAt || new Date().toISOString(),
    req.code,
    req.studentFullName,
    req.upnCode,
    req.teacherName,
    req.course,
    req.nrc,
    fileNames,
    requestFolder.getUrl(),
    req.status || "ENVIADO",
    req.observationComment || "",
    req.observationExpiresAt || "",
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return {
    ok: true,
    code: req.code,
    driveFolderUrl: requestFolder.getUrl(),
    files: uploadedFilesInfo,
  };
}

function handleSyncPrintStatus(spreadsheet, payload) {
  var sheet = spreadsheet.getSheetByName("Impresiones_3D");
  var code = payload.code;
  var status = payload.status;
  if (!code || !status) return { ok: false, error: "Código o estado ausente" };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(code)) {
      // Columna 10: Estado
      sheet.getRange(i + 1, 10).setValue(status);
      if (payload.observationComment !== undefined) {
        sheet.getRange(i + 1, 11).setValue(payload.observationComment);
      }
      if (payload.observationExpiresAt !== undefined) {
        sheet.getRange(i + 1, 12).setValue(payload.observationExpiresAt);
      }
      break;
    }
  }

  return { ok: true, code: code, status: status };
}

// ============================================================================
// HELPERS DE GOOGLE DRIVE Y GOOGLE SHEETS
// ============================================================================

function getOrCreateRootFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var created = DriveApp.createFolder(folderName);
  created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return created;
}

function getOrCreateSubFolder(parentFolder, subFolderName) {
  var folders = parentFolder.getFoldersByName(subFolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var created = parentFolder.createFolder(subFolderName);
  created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return created;
}

function getOrCreateSpreadsheet(folder, spreadsheetName) {
  var files = folder.getFilesByName(spreadsheetName);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

  var ss = SpreadsheetApp.create(spreadsheetName);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  setupSheetsFormat(ss);
  return ss;
}

function setupSheetsFormat(ss) {
  var sheetsDef = [
    {
      name: "Reservas",
      headers: [
        "Fecha Registro",
        "Código",
        "Origen",
        "Laboratorio",
        "Fecha Reserva",
        "Bloques",
        "Estudiante Líder",
        "Código UPN",
        "Integrantes",
        "Proyecto",
        "Carrera",
        "Curso",
        "NRC",
        "Estado",
      ],
      headerColor: "#1e3a8a",
    },
    {
      name: "Asesorias",
      headers: [
        "Fecha Registro",
        "Código",
        "Asesor Asignado",
        "Email Asesor",
        "Laboratorio",
        "Fecha",
        "Bloques",
        "Proyecto",
        "Curso",
        "NRC",
        "Estudiantes",
        "Motivo / Consulta",
        "Cód. Reserva Vinculada",
        "Estado",
      ],
      headerColor: "#b45309",
    },
    {
      name: "Prestamos_Equipos",
      headers: [
        "Fecha Registro",
        "Código Préstamo",
        "Laboratorio",
        "Docente Responsable",
        "Ciclo",
        "Carrera / Curso",
        "Asistente que Entregó",
        "Materiales y Equipos",
        "Integrantes del Grupo",
        "Alumno Responsable",
        "Cód. UPN Responsable",
        "Documento / Firma Drive",
        "Estado",
        "Fecha Devolución",
        "Recibido por Admin",
      ],
      headerColor: "#047857",
    },
    {
      name: "Impresiones_3D",
      headers: [
        "Fecha Registro",
        "Código 3D",
        "Estudiante",
        "Código UPN",
        "Docente",
        "Curso",
        "NRC",
        "Archivos STL",
        "Carpeta Google Drive",
        "Estado",
        "Observación (72h)",
        "Vencimiento 72h",
      ],
      headerColor: "#6d28d9",
    },
  ];

  sheetsDef.forEach(function (def, idx) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      if (idx === 0) {
        sheet = ss.getActiveSheet();
        sheet.setName(def.name);
      } else {
        sheet = ss.insertSheet(def.name);
      }
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(def.headers);
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setBackground(def.headerColor);
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

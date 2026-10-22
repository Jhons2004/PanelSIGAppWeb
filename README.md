# Panel SIGA App Web — Integración QA

Código centralizado de la App Web OGA con SPA, Presupuesto, autenticación Google, bitácora reutilizada y correcciones 22-10-2026.

## Despliegue local
1. Clonar este repositorio en carpeta **nueva** para no destruir los archivos locales actuales.
2. Copiar solamente `.clasp.json` desde la carpeta Apps Script original (nunca subirlo a GitHub).
3. Verificar `scriptId`, `appsscript.json` y propiedades de la aplicación en Script Properties.
4. Ejecutar `clasp push` y probar `/dev` antes de publicar.
5. Ejecutar manualmente `SIGA_ACTIVAR_INTEGRACIONES_INSTITUCIONALES_QA_20261022_` para habilitar las integraciones de Calendar/Gmail (envíos reales tras habilitar).

## Seguridad
No almacenar credenciales, cookies, tokens ni archivos `.clasp.json` aquí. Este repositorio es público; revisar la exposición de identificadores de recursos institucionales antes de utilizarlo como repositorio público definitivo.

## Estado
Integración inicial para QA, no validada contra datos reales de Google Workspace. Los usuarios deben existir y estar autorizados en el padrón.

## Nota de seguridad de OAuth
La versión de origen contenía un secreto OAuth escrito directamente en dos archivos JavaScript. Esta versión lo obtiene de `GOOGLE_OAUTH_CLIENT_SECRET` en Script Properties. **Rotar el secreto en Google Cloud Console y actualizar la propiedad** antes de operar, porque esa credencial fue incluida en archivos compartidos anteriormente. No copiar credenciales al repositorio.

## Autorización Google y SIGA (22-10-2026)

La hoja existente `Usuarios` del libro institucional define **dos permisos distintos**:

- `Correos` (F): identidad Google verificada; no se confía en un correo suministrado por el navegador.
- `SIGA` (H): **única autorización de entrada a la App Web**. Solo `Sí` / `si` / `true` / checkbox verdadero permiten acceder; vacío o `No` deniegan.
- `Autorizado` (C): permiso administrativo del sistema histórico, **no autoriza la entrada por sí solo** y no se modifica automáticamente.

La App Web da prioridad a la coincidencia exacta del correo en F; el alias de `Usuario` (A) solo aplica cuando no existe ningún correo en F. Los duplicados se rechazan. Si desaparece la columna SIGA, el sistema falla de forma cerrada.

El diagnóstico de lectura `QA_DIAGNOSTICO_AUTORIZACION_GOOGLE_OGA_` se ejecuta desde el editor de Apps Script para verificar el estado de las cuentas de prueba existentes (sin cambiar datos ni contraseñas). La prueba local simulada validó los permisos de `gquevedo@oga.org.gt` y `eajuchan@oga.org.gt`, pero no sustituye una autenticación OAuth real.

**Despliegue:** `git pull origin main`, copiar el código al proyecto CLASP conservando `.clasp.json` y el manifiesto local, ejecutar `clasp push`, probar `/dev`; publicar una nueva versión si se requiere actualizar `/exec`.

## Corrección de tokens de jefatura — 22-10-2026

**Error corregido:** `WAPP_DUP_adminEmails_ is not defined` al presionar «Solicitar token a jefatura».

- `PRES_18_Duplicate_Evaluation_Service.js` resuelve los destinatarios desde `WAPP_cfg_().DUPLICADOS.ADMIN_EMAILS`, configuración existente por ambiente, sin abrir permisos.
- `PRES_19_Duplicate_OTP_Service.js` limpia el token pendiente si `MailApp.sendEmail` falla, para permitir reintentar; nunca devuelve el OTP al navegador.
- Se conservan los límites de vencimiento de 10 minutos, cinco intentos y 60 segundos de espera.
- Pruebas locales simuladas: 12/12 satisfactorias (destinatario, estado, envío, cuota, cooldown y errores). Falta la prueba real con Gmail/Google Workspace.
- El manifiesto versionado ya incluye `https://www.googleapis.com/auth/script.send_mail`; comprobar también el manifiesto local de Apps Script.

### Actualización desde PowerShell

```powershell
$repo = "C:\Users\WINDOWS\Documents\PanelSIGAppWeb_GIT"
$app = "C:\Users\WINDOWS\Documents\OGA_APPSCRIPTWEBAPP"
git -C $repo pull --ff-only origin main
Copy-Item "$repo\PRES_18_Duplicate_Evaluation_Service.js" "$app\" -Force
Copy-Item "$repo\PRES_19_Duplicate_OTP_Service.js" "$app\" -Force
Set-Location $app
clasp status
clasp push
clasp open
```

Probar `/dev` o actualizar una implementación `/exec` versionada después de `clasp push`. Al solicitar una evaluación adicional válida, el código llega a jefatura y el solicitante solo recibe el correo enmascarado.

## Prevención de duplicados en CLASP (22-10-2026)

El error `SyntaxError: Identifier 'WAPP_DUP_AUTH_KEY' has already been declared` se produjo porque se dejó una carpeta `RESPALDO_OTP_...` **dentro** del proyecto local con una segunda copia de `PRES_18_Duplicate_Evaluation_Service.js`. Con `skipSubdirectories=false` CLASP también procesó ese respaldo.

Se incorporó `.claspignore` para excluir carpetas `RESPALDO_*`, `BACKUP_*`, `RESPALDOS_*`, carpetas auxiliares y dependencias, conservando el código normal y el manifiesto. **Siempre guardar los respaldos fuera del directorio CLASP.**

Para corregir el proyecto local existente: mover las carpetas `RESPALDO_*` fuera de `OGA_APPSCRIPTWEBAPP`, ejecutar `clasp status`, comprobar que NO se enumeren `RESPALDO_*/...`, y hacer `clasp push` sin forzar. CLASP reemplazará el contenido remoto con los archivos locales seleccionados; no se debe restaurar el respaldo dentro del proyecto.


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
# LabHub ST — Plataforma de Gestión de Laboratorios de Ingeniería (UPN)

Plataforma web integral diseñada para estudiantes, asesores y administradores de los laboratorios de **Automatización**, **Electrónica** y **Mecatrónica**.

## Módulos Principales

1. **Reserva de Uso de Laboratorio (`/reservas`)**:
   - Selección por menú desplegable entre los 3 laboratorios (**Automatización**, **Electrónica**, **Mecatrónica**).
   - Horario semanal interactivo de 9 bloques oficiales (`07:30 - 09:00` hasta `21:10 - 22:40`, Lunes a Sábado).
   - Navegación con flecha hacia la siguiente semana (**máximo 2 semanas visibles**).
   - Control de capacidad simultánea configurable por laboratorio (ej. 4 o 6 grupos por bloque), detección de clases programadas, turnos bloqueados y selección multi-bloque.
2. **Solicitud de Asesorías (`/asesorias`)**:
   - Horario individual para los **4 Asesores** indicando el laboratorio asignado en cada bloque.
   - **Registro dual automático:** cada asesoría cuenta automáticamente como una reserva activa en el laboratorio correspondiente.
   - Generación automática de invitación para **Google Calendar** (`.ics` RFC 5545 + enlace directo + notificación automática vía Google Apps Script al correo del asesor).
3. **Préstamo de Equipos (`/prestamos`)**:
   - Formato institucional **`ENTREGA DE MATERIALES Y/O EQUIPOS`**.
   - Filas dinámicas para materiales (`CANTIDAD // EQUIPO Y/O MATERIAL // CÓDIGO UPN`) e integrantes (`NOMBRES Y APELLIDOS // NRC`).
   - Lienzo de **Firma Digital** táctil/mouse para el responsable, generación de ID único y flujo de estados `PENDIENTE` $\rightarrow$ `ENTREGADO` exclusivo para administradores.
4. **Impresión 3D y Seguimiento (`/impresion-3d`)**:
   - Carga múltiple validada estrictamente para archivos **`.stl`** (binarios y ASCII) con **visor 3D interactivo** y cálculo automático de dimensiones (`mm`) y volumen (`cm³`).
   - Portal de seguimiento por código de solicitud o código UPN con los 7 estados oficiales: `ENVIADO`, `EN REVISION`, `OBSERVADO` (con comentario del administrador, **cuenta regresiva de 72 horas** y re-envío de `.stl` corregidos), `EN COLA`, `IMPRIMIENDO`, `LISTA` y `ENTREGADA`.
5. **Panel de Administración (`/admin`)**:
   - Gestión de los 4 asistentes/asesores, horarios de atención, bloqueo puntual de turnos por eventos, aforo de grupos por laboratorio, recepción de préstamos, control de cola 3D y conexión directa a **Google Drive, Google Sheets y Google Calendar**.

---

## Ejecución Rápida en Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

### Credenciales de Prueba (Panel Administrador `/admin/login`)
- **Coordinador General:** Usuario `admin` | Contraseña `upn2026`
- **Asesores (1 al 4):** Usuarios `asesor1`, `asesor2`, `asesor3`, `asesor4` | Contraseña `upn2026`

---

## Cómo Conectar con tu Cuenta de Google Drive, Sheets y Calendar (Costo $0)

Dado que Google Drive almacena archivos pero no ejecuta servidores Node.js, **LabHub ST** incluye un puente serverless gratuito mediante **Google Apps Script** ([`google-apps-script/LabHubGoogleBridge.gs`](google-apps-script/LabHubGoogleBridge.gs)) que corre directamente dentro de tu propia cuenta de Google:

1. Ingresa a [script.google.com](https://script.google.com) con tu cuenta de Google Drive y crea un **Nuevo proyecto**.
2. Pega el contenido íntegro de `google-apps-script/LabHubGoogleBridge.gs` y ejecuta una vez la función `setup()` para autorizar permisos de **Drive**, **Sheets**, **Calendar** y **Gmail**.
3. Haz clic en **Implementar $\rightarrow$ Nueva implementación $\rightarrow$ Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier persona**
4. Copia la **URL de la aplicación web** generada, entra en `http://localhost:3000/admin` $\rightarrow$ pestaña **Google Drive & Calendar**, pega la URL y presiona **Probar y Sincronizar**.
   - Todos los archivos `.stl` enviados por los alumnos se guardarán automáticamente en tu Google Drive (`LabHub_ST_UPN/Impresiones_3D/`), todos los registros se escribirán en tu Google Sheet maestro y cada asesoría creará el evento en el Google Calendar del asesor correspondiente.


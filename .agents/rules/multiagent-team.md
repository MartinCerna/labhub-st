# Directiva de Orquestación Multiagente y Generación Dinámica de Equipos

Este proyecto opera bajo una arquitectura multiagente jerárquica y autónoma. El agente principal actúa como **Arquitecto y Orquestador (Agente Padre)** y tiene la responsabilidad de **diseñar, crear y coordinar su propio equipo de subagentes (Agentes Hijos)** para distribuir y optimizar el desarrollo de cualquier funcionalidad.

---

## 1. Matriz Híbrida de Modelos según Complejidad (Gemini + Claude)

El Orquestador debe seleccionar y asignar el perfil de modelo óptimo para cada miembro del equipo según la exigencia cognitiva de la subtarea:

| Nivel | Complejidad y Rol | Modelos de Referencia | Parámetro `Model` en Subagente | Responsabilidades Principales |
| :--- | :--- | :--- | :--- | :--- |
| **Nivel 3 (Alto)** | **Arquitectura, Diseño Crítico y Orquestación** | **Gemini 4 Argon** / **Claude Opus** | `inherit` (si el padre es Argon/Opus) o `pro` | • Diseño de arquitectura y contratos de datos/APIs.<br>• Descomposición del trabajo y creación del equipo.<br>• Resolución de bugs críticos, concurrencia y seguridad.<br>• Revisión e integración final. |
| **Nivel 2 (Medio)** | **Implementación de Lógica, Backend y UI** | **Claude Sonnet** / **Gemini Pro** | `pro` | • Desarrollo de lógica de negocio y endpoints.<br>• Construcción de componentes UI complejos y estado.<br>• Integración de servicios, refactorización modular y code review. |
| **Nivel 1 (Bajo)** | **Ejecución Rápida, Boilerplate y QA/Testing** | **Gemini 3.8 Flash** | `flash` o `flash_lite` | • Escritura de tests unitarios/integración y mocks.<br>• Generación de boilerplate, esquemas CRUD simples y tipados.<br>• Ejecución de comandos en terminal, linters, builds y formateo.<br>• Búsquedas rápidas en el repositorio (`research`). |

---

## 2. Generación Dinámica de Equipos (`define_subagent` + `invoke_subagent`)

El Agente Padre no está limitado a un único subagente genérico; debe **instanciar su propio equipo a medida** de la función solicitada:

1. **Definición de Roles Especializados (`define_subagent`):**
   - Cuando una tarea requiera roles específicos que aún no existan en la conversación, el Padre debe crearlos dinámicamente con `define_subagent`:
     - Ejemplo de roles: `api-implementer`, `ui-specialist`, `test-runner`, `db-migrator`, `security-reviewer`.
   - Configurar permisos mínimos necesarios:
     - `EnableWriteTools: true` para agentes implementadores y testers.
     - `EnableWriteTools: false` para agentes de auditoría, investigación o revisión de código.

2. **Despliegue y Paralelización (`invoke_subagent`):**
   - **Trabajo en Paralelo:** Si una funcionalidad comprende partes independientes (ej. crear un servicio backend, construir un componente frontend y preparar los mocks de prueba), el Padre debe **invocar múltiples subagentes en paralelo en el mismo turno** asignando a cada uno archivos o módulos sin colisión.
   - **Trabajo Secuencial:** Si una tarea depende del contrato o archivo generado por otra, primero se ejecuta la fase de contrato y luego se despachan los subagentes implementadores.
   - **Aislamiento de Contexto:** Al invocar cada subagente, pásale únicamente:
     1. El objetivo atómico de su subtarea.
     2. Los contratos/interfaces exactos que debe respetar.
     3. Las rutas de los archivos que debe leer o crear.

3. **Comunicación y Gestión (`send_message` / `manage_subagents`):**
   - Si un subagente requiere correcciones o continúa una subtarea relacionada, reutilízalo enviándole feedback con `send_message` usando su `conversationId`.
   - Usa `manage_subagents` para supervisar el estado de los agentes activos o detener aquellos que ya no sean necesarios.

---

## 3. Flujo de Trabajo Autónomo Estándar

Ante el requerimiento de una nueva función o cambio no trivial:

1. **Fase 1 — Diseño y Contratos (Padre - Argon / Opus):**
   - Analiza el requerimiento, define los contratos (tipos, interfaces, esquemas) y divide la función en tareas atómicas clasificadas por nivel (Nivel 1, 2 o 3).
2. **Fase 2 — Creación y Despacho del Equipo:**
   - Define los perfiles de subagentes necesarios (`define_subagent`) y lanza los subagentes correspondientes (`invoke_subagent`) asignando `pro` (Nivel 2: lógica/UI) o `flash` / `flash_lite` (Nivel 1: ejecución rápida/tests/comandos).
3. **Fase 3 — Verificación y Cierre:**
   - Un subagente ejecutor (`flash`) corre linters, compilación y pruebas en terminal.
   - El Padre inspecciona los resultados, resuelve cualquier discrepancia arquitectónica y presenta el resumen final al usuario.

# Directiva de Agentes del Proyecto (`labhub-st`)

Este repositorio opera bajo una arquitectura de desarrollo multiagente jerárquica y autónoma. El agente principal actúa como **Arquitecto y Orquestador (Padre)** y debe **generar y coordinar dinámicamente su propio equipo de subagentes (Hijos)** para optimizar y distribuir las tareas de cada función.

@[Directiva Completa de Orquestación Multiagente](.agents/rules/multiagent-team.md)

---

## Reglas Operativas de Ejecución Inmediata

1. **Selección Híbrida según Complejidad (Gemini & Claude):**
   - **Nivel 3 — Arquitectura, Diseño Crítico y Orquestación:** **Gemini 4 Argon** o **Claude Opus** (Agente Padre o subagente con `Model: 'inherit'` / `'pro'`). Encargado de contratos de datos, diseño del sistema, decisiones críticas y supervisión del equipo.
   - **Nivel 2 — Lógica de Negocio, APIs y Componentes UI:** **Claude Sonnet** o **Gemini Pro** (Subagentes con `Model: 'pro'`). Encargados de implementar módulos funcionales, integraciones y refactorizaciones.
   - **Nivel 1 — Ejecución Rápida, Boilerplate, Tests y Terminal:** **Gemini 3.8 Flash** (Subagentes con `Model: 'flash'` o `'flash_lite'`). Encargados de código repetitivo, mocks, pruebas unitarias, linters, builds y comandos de consola.

2. **Creación Dinámica y Distribución de Equipos:**
   - Usa `define_subagent` para crear perfiles de especialistas adaptados a la tarea (ej. `backend-dev`, `ui-builder`, `qa-runner`, `code-reviewer`) con los permisos justos (`EnableWriteTools`).
   - Usa `invoke_subagent` para despachar las tareas. **Lanza múltiples subagentes en paralelo** cuando las subtareas no dependan entre sí ni editen el mismo archivo simultáneamente.
   - Usa `send_message` para iterar con un subagente existente y `manage_subagents` para supervisar el equipo.

3. **Integridad Arquitectónica:**
   - Ningún subagente ejecutor puede alterar los contratos o interfaces definidos por el Padre sin autorización.
   - Toda funcionalidad debe ser validada mediante pruebas o verificación en terminal por un subagente ejecutor antes de dar por concluida la tarea.

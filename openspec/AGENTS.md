# OpenSpec Agent Workflow Guide

Este documento define el protocolo mandatorio para agentes y desarrolladores que introducen, modifican o auditan capacidades en `mcp-whatsapp` utilizando **OpenSpec**.

---

## 1. Principio Fundamental: La Verdad Vive en `specs/`

* La única fuente de verdad para el comportamiento esperado del sistema es `openspec/specs/<cap>/spec.md`.
* **Queda prohibido editar archivos en `openspec/specs/` directamente.**
* Cualquier cambio, nueva capacidad o ajuste de comportamiento debe transitar por el ciclo de vida:
  $$\text{Propose} \longrightarrow \text{Apply} \longrightarrow \text{Archive}$$

---

## 2. Flujo de Trabajo Paso a Paso

### Paso 1: Proponer (`propose`)
Crea una carpeta de cambio bajo `openspec/changes/<verb-kebab>/` utilizando la CLI:
```bash
openspec new change <nombre-cambio>
```
Genera los artefactos de planificación en orden:
1. `proposal.md`: Justificación, impacto y lista de capacidades nuevas o modificadas.
2. `specs/<cap>/spec.md`: Deltas con `## ADDED Requirements` o `## MODIFIED Requirements` y al menos un `#### Scenario:` (con formato `WHEN`/`THEN`) por cada requisito.
3. `design.md`: Decisiones técnicas, riesgos y mitigaciones, alternativas consideradas y mapeo a llamadas de Whatsmeow/Node.js.
4. `tasks.md`: Lista ejecutable de tareas en formato checkbox `- [ ]`.

### Paso 2: Aplicar (`apply`)
1. Implementa los cambios de código o configuración indicados en `tasks.md`.
2. Ejecuta las pruebas unitarias y de integración correspondientes:
   ```bash
   node --test --test-concurrency=1 test/unit/chat-permissions.test.js
   make test
   ```
3. Marca cada tarea completada como `- [x]`.

### Paso 3: Validar y Archivar (`archive`)
1. Ejecuta la validación estricta de OpenSpec:
   ```bash
   openspec validate <nombre-cambio> --strict
   ```
2. Archiva el cambio para sincronizar las especificaciones maestras:
   ```bash
   openspec archive <nombre-cambio> -y
   ```
   OpenSpec fusionará automáticamente los deltas en `openspec/specs/` y moverá la carpeta a `openspec/changes/archive/`.

---

## 3. Comandos Rápidos de Consulta

* `openspec list --specs`: Lista todas las capacidades registradas con su número de requisitos.
* `openspec show <cap> --type spec`: Muestra la especificación completa de una capacidad.
* `openspec validate --specs --strict`: Valida la totalidad de las especificaciones maestras.
* `openspec doctor`: Verifica la salud de las rutas y referencias de OpenSpec.

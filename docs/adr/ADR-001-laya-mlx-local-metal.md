# ADR-001: Inferencia Local de Sistema 1 con Laya-MLX en GPU Metal

## Estado
Aceptado

## Contexto
El observador de WhatsApp procesa un flujo continuo de mensajes personales y grupales. Evaluar cada mensaje entrante (para descartar agradecimientos triviales, clasificar materias de CUCEA, evaluar intenciones de tareas o detectar avisos escolares) mediante APIs de modelos comerciales en la nube (como OpenAI o Google Gemini) introduce:
1. Latencia de red inaceptable (500 ms - 2500 ms por turno).
2. Costos de consumo recurrentes por tokens.
3. Riesgo de privacidad al enviar conversaciones de grupos escolares y familiares a servidores de terceros.
4. Caída total de la reactividad del bot si la conexión WAN tiene fluctuaciones.

## Decisión
Implementar un modelo local ligero (Laya-MLX de 322M parámetros) ejecutado en la GPU Metal del chip Apple Silicon (M1) escuchando en `http://127.0.0.1:8766/v1/systemone`.
El modelo opera como "Sistema 1" (rápido, determinista, $0 costo, latencias de 15–35 ms) para:
- Filtrado de mensajes triviales (`isTrivialMessage`).
- Clasificación de avisos escolares (`classifySchoolNotice`).
- Actionability Gate para tareas (`classifyTaskActionability`).
- Enrutamiento dinámico de complejidad para el LLM pesado (`pickModel`).

## Consecuencias
- **Positivas:** Respuestas instantáneas en <30ms; costo computacional \$0; privacidad absoluta para mensajes locales; el bot nunca satura el límite de velocidad del LLM principal.
- **Negativas:** Requiere mantener activo el daemon Python `system_one_server.py` (`com.angelzaragoza.system-one`). Si el daemon local cae, el cliente Node.js debe aplicar fallbacks heurísticos seguros sin bloquear el pipeline.

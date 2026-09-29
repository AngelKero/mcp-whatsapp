# ADR-003: Síntesis de Voz Nativa con Voz Paulina y Transcodificación Opus PTT

## Estado
Aceptado

## Contexto
Para responder con notas de voz naturales en WhatsApp cuando el interlocutor envía un mensaje de audio, se evaluaron APIs de texto a voz en la nube (ElevenLabs, OpenAI Audio, Google Cloud TTS). Estas APIs presentan costos por carácter, latencias de 1.5 a 4 segundos, y requerimiento de credenciales de red activas. Además, WhatsApp rechaza archivos de audio que no cumplan el formato estricto de notas de voz Push-to-Talk (PTT).

## Decisión
1. Utilizar el sintetizador nativo de macOS (`/usr/bin/say`) con la voz en español de México (`Paulina`) a 185 palabras por minuto.
2. Aplicar una capa de **preprocesamiento fonético** (`humanizeForTTS`):
   - Elimina etiquetas Markdown, URLs, bloques de código y emoticonos/emojis.
   - Fonetiza acrónimos tecnológicos en español mexicano (ej. API $\to$ ápi, BD $\to$ base de datos, JSON $\to$ yeison).
   - Inyecta pausas de respiración naturales mediante comas espaciadas tras signos de puntuación.
3. Transcodificar el archivo intermedio AIFF a Ogg Opus compatible con WhatsApp PTT mediante `ffmpeg`:
   `ffmpeg -y -i input.aiff -c:a libopus -b:a 32k -vbr on -application voip output.ogg`
4. Despachar el archivo a través de la herramienta `send_audio_message` con bandera `ptt: true`.

## Consecuencias
- **Positivas:** Síntesis 100% local, instantánea y con costo \$0; compatibilidad perfecta con el reproductor de forma de onda de WhatsApp en iOS y Android; sonido natural y coloquial mexicano sin sonar a robot telefónico.
- **Negativas:** Dependencia de macOS y de la presencia del binario `ffmpeg` en el sistema.

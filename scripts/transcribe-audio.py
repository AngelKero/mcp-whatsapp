import sys
import json
import mlx_whisper

if len(sys.argv) < 2:
    print(json.dumps({"error": "No audio path provided"}))
    sys.exit(1)

audio_path = sys.argv[1]
try:
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo="mlx-community/whisper-tiny-mlx",
        language="es"
    )
    text = result.get("text", "").strip()
    print(json.dumps({"text": text}))
except Exception as e:
    # Intento de fallback sin especificar repo local
    try:
        result = mlx_whisper.transcribe(audio_path, language="es")
        text = result.get("text", "").strip()
        print(json.dumps({"text": text}))
    except Exception as e2:
        print(json.dumps({"error": str(e2)}))
        sys.exit(1)

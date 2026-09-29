#!/usr/bin/env python3
"""
Microservicio Local de Decisiones Tipo Jev (System One) con Laya-MLX en Apple Silicon.
Corre en localhost:8766 y expone POST /v1/systemone para clasificaciones en milisegundos a costo $0.
"""

import sys
import json
import time
import socket
import signal
from http.server import HTTPServer, BaseHTTPRequestHandler
import laya_mlx as laya

PORT = 8766

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        super().server_bind()

print(f"🚀 [SYSTEM ONE] Cargando modelo Laya-MLX Multilingüe en Apple Silicon (Metal GPU)...")
t0 = time.time()
agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
# Warmup inicial
agent.system_one("hola", {"test": {"type": "noul", "instructions": "¿Es un saludo?"}})
print(f"✅ [SYSTEM ONE] Modelo listo en {time.time()-t0:.2f}s. Escuchando en http://127.0.0.1:{PORT}/v1/systemone")

class SystemOneHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/v1/systemone" and self.path != "/decide":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "Not Found"}')
            return

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode("utf-8"))
            state = payload.get("state", "")
            questions = payload.get("questions", {})

            if not state or not questions:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "state and questions are required"}')
                return

            t_start = time.time()
            result = agent.system_one(state, questions)
            latency_ms = round((time.time() - t_start) * 1000, 2)
            result["latency_ms"] = latency_ms

            response_bytes = json.dumps(result, ensure_ascii=False).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            err_resp = json.dumps({"error": str(e)}).encode("utf-8")
            self.wfile.write(err_resp)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "ok", "engine": "laya-mlx", "chip": "Apple M1"}')
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Log conciso
        pass

if __name__ == "__main__":
    server = ReusableHTTPServer(("127.0.0.1", PORT), SystemOneHandler)

    def shutdown_handler(signum, frame):
        print(f"\n[SYSTEM ONE] Señal {signum} recibida. Cerrando socket y liberando puerto {PORT}...")
        try:
            server.server_close()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        shutdown_handler(signal.SIGINT, None)

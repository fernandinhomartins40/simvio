"""API local de demonstração para capturas reais do app, sem dados de clientes."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path.endswith("/devices/pair"):
            data = {"device_credential": "local-screenshot-demo-only", "device_id": "demo-playstore-20261107"}
        elif self.path.endswith("/devices/heartbeat"):
            data = {"line": {"phone_number": "+5511000004321", "phone_display": "+55 11 *****-4321", "status": "active"}}
        elif self.path.endswith("/device-events"):
            data = {"outcome": "verified"}
        else:
            data = {}
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("API de demonstração em 127.0.0.1:18761", flush=True)
    HTTPServer(("127.0.0.1", 18761), Handler).serve_forever()

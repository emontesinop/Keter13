"""Arranca Poker Coach:  python run.py   (abre http://localhost:8000)

Desde el celular (misma wifi): http://<IP-de-tu-computadora>:8000
"""
import os
import socket

import uvicorn


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"\n  Poker Coach → http://localhost:{port}   ·   celular: http://{lan_ip()}:{port}\n")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)

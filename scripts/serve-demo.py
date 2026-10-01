"""Serve synthetic fixtures and extension code on loopback only; no Instagram access."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent

def artwork(index):
    palettes = [('e8c4a4','e1aa78','557969','2f5447'), ('bed8d5','91b9b5','668775','3d635a'),
                ('f0ddbb','d8be89','809477','526c52'), ('d9cbd7','b5a2b8','747f84','455d65')]
    sky, sun, hill, front = palettes[index % len(palettes)]
    center = 80 + (index * 39) % 300
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <rect width="600" height="600" fill="#{sky}"/><circle cx="{center}" cy="170" r="76" fill="#{sun}"/>
    <path d="M0 350 Q140 {220 + index % 100} 300 365 T600 310 V600 H0Z" fill="#{hill}"/>
    <path d="M0 450 Q200 340 360 460 T600 430 V600 H0Z" fill="#{front}"/>
    <path d="M270 600 Q330 490 400 440" stroke="#{sky}" stroke-width="38" opacity=".55" fill="none"/>
    <rect x="35" y="35" width="530" height="530" rx="4" fill="none" stroke="#{sky}" opacity=".45"/>
    </svg>'''.encode()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/':
            self.send_response(302); self.send_header('Location', '/your_activity/interactions/likes/'); self.end_headers(); return
        if path == '/your_activity/interactions/likes/':
            file = ROOT / 'demo/index.html'; mime = 'text/html; charset=utf-8'
        elif re.fullmatch(r'/(p|reel)/[A-Za-z0-9_-]{1,80}/', path):
            file = ROOT / 'demo/post.html'; mime = 'text/html; charset=utf-8'
        elif path in ['/extension/core.js', '/extension/content.js', '/demo/demo.js']:
            file = ROOT / path[1:]; mime = 'text/javascript; charset=utf-8'
        elif re.fullmatch(r'/art/\d{1,6}\.svg', path):
            data = artwork(int(path[5:-4])); self.respond(data, 'image/svg+xml'); return
        else:
            self.send_error(404); return
        self.respond(file.read_bytes(), mime)

    def respond(self, data, mime):
        self.send_response(200); self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data))); self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff'); self.end_headers(); self.wfile.write(data)

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=8765); args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'架空投稿デモ: http://127.0.0.1:{server.server_port}/your_activity/interactions/likes/', flush=True)
    print('Instagram通信なし・拡張導入なし。終了: Ctrl+C', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

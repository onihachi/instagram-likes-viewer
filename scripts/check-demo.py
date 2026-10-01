"""HTTP fixture smoke test, not a real-browser test."""
import importlib.util
from pathlib import Path
from http.server import ThreadingHTTPServer
import threading
from urllib.error import HTTPError
from urllib.request import build_opener, ProxyHandler

module_path = Path(__file__).with_name('serve-demo.py')
spec = importlib.util.spec_from_file_location('demo_server', module_path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
base = f'http://127.0.0.1:{server.server_port}'
opener = build_opener(ProxyHandler({}))
try:
    for path, expected, mime in [
        ('/', 'ローカルデモ'.encode(), 'text/html'),
        ('/p/POST_1/', b'<article>', 'text/html'),
        ('/reel/POST_5/', b'<video>', 'text/html'),
        ('/p/DELETED/', b'DELETED', 'text/html'),
        ('/extension/core.js', b'IGLikesCore', 'text/javascript'),
        ('/extension/content.js', b'dialog.showModal', 'text/javascript'),
        ('/demo/demo.js', b'Local-only adapter', 'text/javascript'),
        ('/art/28.svg', b'<svg', 'image/svg+xml'),
    ]:
        with opener.open(base + path, timeout=4) as response:
            assert response.status == 200
            assert response.headers['Content-Type'].startswith(mime)
            assert expected in response.read(), path
    for path in ['/../../package.json', '/extension/manifest.json', '/author/', '/p/%2e%2e/']:
        try: opener.open(base + path, timeout=4)
        except HTTPError as error: assert error.code == 404
        else: raise AssertionError(path)
    print('Local synthetic HTTP fixtures, asset MIME, allowlisted paths: PASS (no browser / no Instagram)')
finally:
    server.shutdown(); server.server_close(); thread.join()

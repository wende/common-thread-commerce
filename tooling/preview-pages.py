#!/usr/bin/env python3
"""Serve only the two experiment pages and their linked source/report files."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    '/glovo-race/': ('glovo/tooling/glovo-race.html', 'text/html; charset=utf-8'),
    '/': ('shop-agent.html', 'text/html; charset=utf-8'),
    '/shop-agent.html': ('shop-agent.html', 'text/html; charset=utf-8'),
    '/glovo.html': ('glovo.html', 'text/html; charset=utf-8'),
    '/shopping.js': ('shopping.js', 'text/javascript; charset=utf-8'),
    '/glovo.js': ('glovo.js', 'text/javascript; charset=utf-8'),
    '/shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md': (
        'shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md', 'text/plain; charset=utf-8'),
    '/glovo/reports/EXPERIMENT_REPORT_2026-10-05.md': (
        'glovo/reports/EXPERIMENT_REPORT_2026-10-05.md', 'text/plain; charset=utf-8'),
}
for name, mime in {
    'data.json': 'application/json',
    'race.mp4': 'video/mp4',
    'race.gif': 'image/gif',
    'poster.jpg': 'image/jpeg',
    'contact-sheet.jpg': 'image/jpeg',
    'steps.zip': 'application/zip',
    'native-capture.json': 'application/json',
    'native-baseline.zip': 'application/zip',
}.items():
    ROUTES[f'/glovo-race/{name}'] = (f'output/glovo-race/{name}', mime)
for lane, count in [('bare', 12), ('adapter', 6)]:
    for index in range(count):
        name = f'{lane}-{index:02d}.jpg'
        ROUTES[f'/glovo-race/real-steps/{name}'] = (f'output/glovo-race/real-steps/{name}', 'image/jpeg')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond()

    def do_HEAD(self):
        self.respond(head=True)

    def respond(self, head=False):
        route = ROUTES.get(urlsplit(self.path).path)
        if route is None:
            self.send_error(404)
            return
        payload = (ROOT / route[0]).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', route[1])
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        if not head:
            self.wfile.write(payload)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8095)
    options = parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', options.port), Handler).serve_forever()

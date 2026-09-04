"""Serve the static app for local development and browser tests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    os.chdir(Path(__file__).resolve().parent.parent)
    # Browsers open parallel asset connections, including the offline precache.
    ThreadingHTTPServer.request_queue_size = 128
    with ThreadingHTTPServer(('127.0.0.1', 4173), Handler) as server:
        print('ARES: http://127.0.0.1:4173/', flush=True)
        server.serve_forever()

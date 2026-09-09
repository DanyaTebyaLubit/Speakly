"""Локальный запуск Speakly без file:// и без сторонних зависимостей."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # При локальной разработке браузер всегда получает актуальные файлы.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    handler = partial(Handler, directory=str(root))
    try:
        with ThreadingHTTPServer(("127.0.0.1", 4173), handler) as server:
            print("Speakly: http://127.0.0.1:4173/", flush=True)
            print("Оставьте это окно открытым. Ctrl+C — остановить сервер.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        print(f"Не удалось запустить сервер: {error}", flush=True)
        raise SystemExit(1)

"""Local mockup server. No external AI requests are made by this prototype."""
import argparse
import json
import mimetypes
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

from .analysis import ROOT, extract_rules, compare, compatibility
from .stencils import extract_stencil, MAX_ARCHIVE

STATIC = ROOT / "static"
USER_ASSETS = Path(os.environ.get("SERVER_VALIDATOR_DATA_DIR", str(ROOT/".local"))) / "assets"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Documents, filenames and query strings are intentionally absent from logs.
        print(f"{self.command} {urlparse(self.path).path} {args[1] if len(args)>1 else ''}")

    def send_json(self, data, status=200):
        self.send_bytes(json.dumps(data,ensure_ascii=False).encode(), "application/json; charset=utf-8", status)

    def send_bytes(self, data, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type",content_type)
        self.send_header("Content-Length",str(len(data)))
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/health": return self.send_json({"app":"server-validator","status":"ok","mode":"mockup","ai_connected":False})
        if path == "/api/catalog":
            assets = []
            for folder,prefix in [(STATIC/"assets/dell", "/assets/dell/"), (USER_ASSETS,"/user-assets/")]:
                manifest = folder/"manifest.json"
                if manifest.exists(): assets += [dict(a,url=prefix+a["file"]) for a in json.loads(manifest.read_text())]
            unique = {}
            for asset in assets: unique.setdefault(asset["id"],asset)
            return self.send_json({"assets":list(unique.values()),"servers":json.loads((ROOT/"data/servers.json").read_text())["servers"]})
        base = USER_ASSETS if path.startswith("/user-assets/") else STATIC
        relative = path.removeprefix("/user-assets/") if base == USER_ASSETS else path.lstrip("/") or "index.html"
        file = (base / relative).resolve()
        if not file.is_relative_to(base.resolve()) or not file.is_file(): return self.send_json({"error":"파일을 찾을 수 없습니다."},404)
        return self.send_bytes(file.read_bytes(),mimetypes.guess_type(file.name)[0] or "application/octet-stream")

    def do_POST(self):
        # Browser POSTs must originate from this same local app. No cross-site writes.
        if self.headers.get("Origin") and urlparse(self.headers["Origin"]).netloc != self.headers.get("Host"): return self.send_json({"error":"다른 사이트에서의 요청은 허용하지 않습니다."},403)
        path = urlparse(self.path).path
        try:
            size = int(self.headers.get("Content-Length","0"))
            limit = MAX_ARCHIVE if path == "/api/stencil" else 1024*1024
            if size <= 0 or size > limit: return self.send_json({"error":"요청 크기 한도를 초과했습니다."},413)
            body = self.rfile.read(size)
            if path == "/api/stencil":
                name = Path(parse_qs(urlparse(self.path).query).get("name",["stencil.vssx"])[0]).name
                if Path(name).suffix.lower() not in {".vssx",".vsdx"}: raise ValueError("VSSX/VSDX 파일만 선택하세요.")
                with tempfile.TemporaryDirectory() as temp:
                    source = Path(temp)/name; source.write_bytes(body)
                    result = extract_stencil(source,USER_ASSETS)
                return self.send_json(result)
            payload = json.loads(body)
            if path == "/api/analyze":
                for key in ["requirement","quote"]:
                    if not isinstance(payload.get(key),str) or not payload[key].strip(): raise ValueError("요구사항과 견적 원문을 모두 입력하세요.")
                    if len(payload[key]) > 60000: raise ValueError("문서당 최대 60,000자까지 입력할 수 있습니다.")
                requirement = extract_rules(payload["requirement"],"requirement")
                quote = extract_rules(payload["quote"],"quote")
                return self.send_json({"requirement":requirement,"quote":quote,"comparison":compare(requirement,quote,payload.get("policy")),"compatibility":compatibility(quote)})
            if path == "/api/compare":
                return self.send_json({"comparison":compare(payload["requirement"],payload["quote"],payload.get("policy")),"compatibility":compatibility(payload["quote"],payload.get("placement"))})
            return self.send_json({"error":"지원하지 않는 요청입니다."},404)
        except (ValueError,KeyError,TypeError) as error: return self.send_json({"error":str(error)},400)
        except Exception:
            return self.send_json({"error":"파일 또는 분석 처리에 실패했습니다. 지원 형식과 파일 크기를 확인하세요."},500)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--host",default="127.0.0.1"); parser.add_argument("--port",default=8000,type=int)
    args=parser.parse_args()
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f"Server Validator mockup listening on {args.host}:{args.port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__ == "__main__": main()

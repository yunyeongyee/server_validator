"""FastAPI backend for the local Korean server-validation workflow."""
import argparse
import json
import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .analysis import ROOT, compare, compatibility
from .ai import ai_status, extract_document, research
from .stencils import extract_stencil, MAX_ARCHIVE
from .images import export_png, validate_raster

STATIC = ROOT / "static"
WEB = ROOT / "web"
USER_ASSETS = Path(os.environ.get("SERVER_VALIDATOR_DATA_DIR", str(ROOT / ".local"))) / "assets"
USER_ASSETS.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Server Validator", version="0.2.0")


@app.middleware("http")
async def browser_policy(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("origin"):
        if urlparse(request.headers["origin"]).netloc != request.headers.get("host"):
            return JSONResponse({"error": "다른 사이트에서의 요청은 허용하지 않습니다."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    return response


@app.exception_handler(ValueError)
async def value_error(request, error):
    return JSONResponse({"error": str(error)}, status_code=400)


class AnalyzeRequest(BaseModel):
    requirement: str = Field(min_length=1, max_length=60000)
    quote: str = Field(min_length=1, max_length=60000)
    policy: dict = Field(default_factory=dict)
    engine: str = "auto"

    @field_validator("requirement", "quote")
    @classmethod
    def nonempty(cls, value):
        if not value.strip(): raise ValueError("두 문서의 원문을 모두 입력하세요.")
        return value

    @field_validator("engine")
    @classmethod
    def valid_engine(cls, value):
        if value not in {"auto", "rules", "openai"}: raise ValueError("지원하지 않는 분석 방식입니다.")
        return value


class CompareRequest(BaseModel):
    requirement: dict
    quote: dict
    policy: dict = Field(default_factory=dict)
    placement: dict = Field(default_factory=dict)


@app.get("/api/health")
def health():
    return {"app": "server-validator", "status": "ok", "mode": "mockup", "stack": "FastAPI + React/TypeScript + Pillow", **ai_status()}


@app.get("/api/catalog")
def catalog():
    unique = {}
    for folder, prefix in [(STATIC / "assets/dell", "/assets/dell/"), (USER_ASSETS, "/user-assets/")]:
        manifest = folder / "manifest.json"
        if manifest.exists():
            for asset in json.loads(manifest.read_text(encoding="utf-8")):
                unique.setdefault(asset["id"], dict(asset, url=prefix + asset["file"]))
    return {"assets": list(unique.values()), "servers": json.loads((ROOT / "data/servers.json").read_text(encoding="utf-8"))["servers"]}


@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest):
    requirement = extract_document(payload.requirement, "requirement", payload.engine)
    quote = extract_document(payload.quote, "quote", payload.engine)
    return {"requirement": requirement, "quote": quote, "comparison": compare(requirement, quote, payload.policy), "compatibility": compatibility(quote)}


@app.post("/api/compare")
def recompare(payload: CompareRequest):
    try:
        return {"comparison": compare(payload.requirement, payload.quote, payload.policy), "compatibility": compatibility(payload.quote, payload.placement)}
    except (KeyError, TypeError):
        raise HTTPException(400, "추출 항목 형식이 올바르지 않습니다.") from None


@app.post("/api/stencil")
async def import_stencil(request: Request, name: str = "stencil.vssx"):
    name = Path(name.replace("\\", "/")).name
    if Path(name).suffix.lower() not in {".vssx", ".vsdx"}: raise ValueError("VSSX/VSDX 파일을 선택하세요.")
    with tempfile.TemporaryDirectory(prefix="sv-stencil-") as temp:
        source = Path(temp) / name
        size = 0
        with source.open("wb") as handle:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_ARCHIVE: raise HTTPException(413, "스텐실은 128MB 이하만 가져올 수 있습니다.")
                handle.write(chunk)
        if not size: raise ValueError("빈 파일입니다.")
        return await run_in_threadpool(extract_stencil, source, USER_ASSETS)


@app.post("/api/research")
def investigate(payload: dict):
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip() or len(question) > 8000: raise ValueError("확인 질문을 입력하세요.")
    return research(question)


@app.post("/api/images")
async def import_image(request: Request, name: str, category: str, model: str = "", view: str = "", mount: str = ""):
    if category not in {"server", "disk", "psu", "filler", "card", "other"}: raise ValueError("이미지 분류를 확인하세요.")
    if mount not in {"", "PCIe", "OCP", "LOM"} or view not in {"", "front", "rear"}: raise ValueError("이미지 형식을 확인하세요.")
    if category == "server" and not model.strip(): raise ValueError("서버 이미지의 모델을 입력하세요.")
    original = Path(name.replace("\\", "/")).name
    extension = Path(original).suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}: raise ValueError("실제 PNG/JPG/WebP 이미지를 선택하세요.")
    image_id = uuid.uuid4().hex
    target = USER_ASSETS / (image_id + extension)
    size = 0
    try:
        with target.open("wb") as handle:
            async for chunk in request.stream():
                size += len(chunk)
                if size > 20 * 1024 * 1024: raise ValueError("이미지는 20MB 이하만 추가할 수 있습니다.")
                handle.write(chunk)
        await run_in_threadpool(validate_raster, target)
        asset = {"id": image_id, "name": Path(original).stem, "file": target.name, "category": category, "model": model.upper() or None, "view": view or None, "mount": mount or None, "source": "사용자 실제 이미지 · " + original, "url": "/user-assets/" + target.name}
        manifest = USER_ASSETS / "manifest.json"
        previous = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
        previous.append(asset)
        manifest.write_text(json.dumps(previous, ensure_ascii=False, indent=2), encoding="utf-8", newline="\r\n")
        return asset
    except Exception as error:
        target.unlink(missing_ok=True)
        if isinstance(error, ValueError): raise
        raise ValueError("이미지 파일을 검증하지 못했습니다.") from None


@app.post("/api/export/png")
def compose_png(payload: dict):
    png = export_png(payload, catalog()["assets"], STATIC, USER_ASSETS)
    return Response(png, media_type="image/png", headers={"Content-Disposition": 'attachment; filename="server-composition-draft.png"'})


app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")
app.mount("/user-assets", StaticFiles(directory=USER_ASSETS), name="user-assets")


@app.get("/{path:path}")
def frontend(path: str):
    candidate = (WEB / (path or "index.html")).resolve()
    if candidate.is_relative_to(WEB.resolve()) and candidate.is_file(): return FileResponse(candidate)
    if "." not in Path(path).name and (WEB / "index.html").exists(): return FileResponse(WEB / "index.html")
    raise HTTPException(404, "웹 화면을 찾을 수 없습니다. frontend에서 npm ci와 npm run build를 실행하세요.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, access_log=False)


if __name__ == "__main__": main()

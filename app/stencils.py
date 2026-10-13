"""Extract real embedded stencil artwork, with master names and provenance."""
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VISIO = "http://schemas.microsoft.com/office/visio/2012/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024


def extract_stencil(source, target):
    source, target = Path(source), Path(target)
    if source.stat().st_size > MAX_ARCHIVE: raise ValueError("스텐실은 128MB 이하만 가져올 수 있습니다.")
    target.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or sum(i.file_size for i in infos) > MAX_EXPANDED: raise ValueError("스텐실 압축 해제 크기 한도를 초과했습니다.")
        def xml(name):
            data = archive.read(name)
            if len(data) > 12 * 1024 * 1024 or b"<!DOCTYPE" in data.upper(): raise ValueError("지원하지 않는 XML 구조입니다.")
            return ET.fromstring(data)
        names = {}
        master_index = "visio/masters/masters.xml"
        master_rels = "visio/masters/_rels/masters.xml.rels"
        if master_index in archive.namelist() and master_rels in archive.namelist():
            targets = {e.attrib["Id"]: e.attrib["Target"] for e in xml(master_rels) if e.attrib.get("TargetMode") != "External"}
            for master in xml(master_index):
                link = master.find(f"{{{VISIO}}}Rel")
                rid = link.attrib.get(f"{{{REL}}}id") if link is not None else None
                filename = targets.get(rid)
                if not filename: continue
                relationship_file = "visio/masters/_rels/" + posixpath.basename(filename) + ".rels"
                if relationship_file not in archive.namelist(): continue
                for relation in xml(relationship_file):
                    if relation.attrib.get("TargetMode") == "External": continue
                    media = posixpath.normpath(posixpath.join("visio/masters", relation.attrib.get("Target", "")))
                    if media.startswith("visio/media/"):
                        names.setdefault(media, []).append(master.attrib.get("Name", master.attrib.get("NameU", "이미지")))
        jobs = []
        for media in infos:
            if not media.filename.startswith("visio/media/"): continue
            ext = Path(media.filename).suffix.lower()
            if ext not in {".emf", ".wmf", ".png", ".jpg", ".jpeg"}: continue
            if media.file_size > 32 * 1024 * 1024: continue
            data = archive.read(media)
            jobs.append((media.filename, ext, data, names.get(media.filename, [Path(media.filename).stem])))
    if not jobs: raise ValueError("포함된 지원 이미지가 없습니다. Visio에서 전면·후면을 PNG로 내보내 가져오세요. XML 도형을 임의로 재현하지 않습니다.")
    converter = shutil.which("inkscape")
    def render(job):
        media, ext, data, masters = job
        image_id = hashlib.sha256(data).hexdigest()[:20]
        output_ext = ".png" if ext in {".emf", ".wmf"} else ext
        out = target / (image_id + output_ext)
        if not out.exists():
            if ext in {".emf", ".wmf"}:
                if not converter: return None
                with tempfile.TemporaryDirectory(prefix="dell-stencil-") as temp:
                    original = Path(temp)/("original"+ext); original.write_bytes(data)
                    environment = dict(os.environ)
                    environment["XDG_CONFIG_HOME"] = temp
                    environment["XDG_CACHE_HOME"] = temp
                    result = subprocess.run([converter, str(original), "--export-type=png", "--export-width=1800", "--export-filename="+str(out)], env=environment, capture_output=True, timeout=45)
                    if result.returncode or not out.exists(): return None
            else: out.write_bytes(data)
        name = masters[0]
        category = "server" if re.search(r"\bXR\d+|\bR\d{3}\b", name, re.I) and re.search(r"Front|Rear", name, re.I) else "psu" if re.search("PSU|Power Supply",name,re.I) else "filler" if re.search("Blank|Filler",name,re.I) else "disk" if re.search("SATA|SAS|SSD|Drive",name,re.I) else "other"
        model = re.search(r"\b(?:XR\d+[a-z]*|R\d{3})\b",name,re.I)
        return {"id": image_id, "name": name, "aliases": masters, "file": out.name, "category": category, "model": model[0].upper() if model else None, "view": "rear" if re.search("Rear",name,re.I) else "front" if re.search("Front",name,re.I) else None, "mount": "OCP" if re.search("OCP",name,re.I) else "PCIe" if re.search("PCIe",name,re.I) else None, "source": source.name, "source_sha256": digest, "embedded_path": media, "note": "원본 스텐실의 내장 이미지입니다. 전체 마스터의 XML 도형/텍스트와 회전은 별도일 수 있습니다. 장착 지원을 보증하지 않습니다."}
    with ThreadPoolExecutor(max_workers=4) as pool: assets = [a for a in pool.map(render,jobs) if a]
    existing_file = target / "manifest.json"
    previous = json.loads(existing_file.read_text()) if existing_file.exists() else []
    merged = {a["id"]:a for a in previous}
    merged.update({a["id"]:a for a in assets})
    existing_file.write_text(json.dumps(list(merged.values()),ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\r\n")
    return {"imported": len(assets), "unsupported": len(jobs)-len(assets), "assets": assets}

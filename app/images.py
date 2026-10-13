"""Pillow composition of actual artwork; no server illustration is generated."""
import io
import math
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


def validate_raster(path):
    with Image.open(path) as image:
        if image.width * image.height > 40_000_000: raise ValueError("이미지 픽셀 수 한도를 초과했습니다.")
        image.verify()


def export_png(payload, assets, static, user_assets):
    asset_map = {a["id"]: a for a in assets}
    def load(asset_id):
        asset = asset_map.get(asset_id)
        if not asset: raise ValueError("선택한 실제 이미지가 보관함에 없습니다.")
        folder = user_assets if asset["url"].startswith("/user-assets/") else static / "assets/dell"
        path = (folder / asset["file"]).resolve()
        if not path.is_relative_to(folder.resolve()): raise ValueError("이미지 경로가 올바르지 않습니다.")
        validate_raster(path)
        with Image.open(path) as image: return image.convert("RGBA")
    canvas = Image.new("RGBA", (2000, 800), "#fafbfd")
    base = ImageOps.contain(load(payload.get("image_id")), (1920, 400))
    canvas.alpha_composite(base, (40 + (1920 - base.width)//2, 200 + (400 - base.height)//2))
    candidates = [os.environ.get("SV_FONT_PATH", ""), "C:/Windows/Fonts/malgun.ttf", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    font_path = next((p for p in candidates if p and Path(p).is_file()), None)
    font = ImageFont.truetype(font_path, 18) if font_path else ImageFont.load_default()
    draw = ImageDraw.Draw(canvas)
    boxes = payload.get("boxes", [])
    if not isinstance(boxes, list) or len(boxes) > 100: raise ValueError("배치 영역이 올바르지 않습니다.")
    for b in boxes:
        vals = [b.get(f) for f in ["x", "y", "w", "h"]]
        if any(isinstance(v, bool) or not isinstance(v, (float, int)) for v in vals): raise ValueError("좌표가 올바르지 않습니다.")
        x, y, w, h = vals
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x+w > 1000 or y+h > 400: raise ValueError("좌표가 편집 범위를 벗어났습니다.")
        rect = (int(x*2), int(y*2), int((x+w)*2), int((y+h)*2))
        if b.get("assetId"):
            part = ImageOps.contain(load(b["assetId"]), (max(1,int(w*2)), max(1,int(h*2))))
            canvas.alpha_composite(part, (rect[0]+(int(w*2)-part.width)//2,rect[1]+(int(h*2)-part.height)//2))
        else:
            if b.get("kind") == "PSU" and b.get("part") is None:
                for edge in [rect[1],rect[3]]:
                    for px in range(rect[0],rect[2],16): draw.line((px,edge,min(px+10,rect[2]),edge),fill="#94a8c6",width=2)
                for edge in [rect[0],rect[2]]:
                    for py in range(rect[1],rect[3],16): draw.line((edge,py,edge,min(py+10,rect[3])),fill="#94a8c6",width=2)
                draw.text((rect[0]+8,rect[1]+8),"EMPTY",font=font,fill="#72859c")
            else: draw.rectangle(rect, outline="#94a8c6", width=2)
        lx = float(b.get("lx", x+w/2))*2
        ly = float(b.get("ly", max(15,y-18)))*2
        if not (0 <= lx <= 2000 and 0 <= ly <= 800): raise ValueError("라벨 좌표를 확인하세요.")
        line_width = b.get("lineWidth", 1)
        line_style = b.get("lineStyle", "solid")
        if isinstance(line_width, bool) or line_width not in (1, 2, 3, 4) or line_style not in ("solid", "dashed"):
            raise ValueError("연결선 굵기 또는 종류가 올바르지 않습니다.")
        if b.get("connector", True):
            start = ((x+w/2)*2, y*2)
            end = (lx, ly)
            width = int(line_width * 2)
            if line_style == "solid":
                draw.line((*start, *end), fill="#6a86ad", width=width)
            else:
                distance = math.dist(start, end)
                for offset in range(0, math.ceil(distance), 20):
                    a, z = offset / distance, min(offset + 12, distance) / distance
                    draw.line((start[0]+(end[0]-start[0])*a, start[1]+(end[1]-start[1])*a,
                               start[0]+(end[0]-start[0])*z, start[1]+(end[1]-start[1])*z), fill="#6a86ad", width=width)
        text = str(b.get("label", b.get("name", "")))[:100]
        bounds = draw.textbbox((0,0),text,font=font)
        tw = bounds[2] - bounds[0]
        draw.rounded_rectangle((lx-tw/2-10,ly-24,lx+tw/2+10,ly+8),radius=5,fill="white",outline="#c8d7ed")
        draw.text((lx-tw/2,ly-22),text,font=font,fill="#3b5578",stroke_width=1 if b.get("bold") else 0)
    watermark = "XR practice - NOT quotation server" if payload.get("practice") else "Composition draft - compatibility unverified"
    draw.text((40,750),watermark,font=font,fill="#71839b")
    result = io.BytesIO(); canvas.convert("RGB").save(result,format="PNG")
    return result.getvalue()

#!/usr/bin/env python3
"""Bake Super Mario–style poke-world board assets via airouter (t2i + rembg + VL QA).

Only talks to airouter (default http://192.168.223.101:20101).
Vision model: local ollama qwen3-vl:32b.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # casual/poke-world
REPO = ROOT.parents[1]  # tetris repo root
OUT_TILES = ROOT / "assets" / "tiles"
OUT_DECO = ROOT / "assets" / "deco"
OUT_BG = ROOT / "assets" / "bg"

# Load .env from repo root (never OS-export required)
_env = REPO / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
T2I = "t2i_z_image_turbo_v1"
REMBG_WF = "i2ij_birefnet_remove_background_v1"
VL_MODEL = os.environ.get("AIROUTER_VL_MODEL", "qwen3-vl:32b")
MAGENTA = "solid flat hot magenta #FF00FF background, no gradient, no shadows on background"

STYLE = (
    "official Super Mario Bros game art style, Nintendo EAD sprite sheet quality, "
    "chunky rounded 3D plastic look, vibrant saturated colors, clean game asset, "
    "centered subject, no watermark, no UI, no Pokemon, no characters "
)

TILES: dict[str, tuple[str, str]] = {
    # name: (size, prompt body)
    "brick.png": (
        "512x512",
        "classic brown-orange Mario brick block cube with mortar lines and corner bolts, single block",
    ),
    "question.png": (
        "512x512",
        "classic yellow Mario question mark ? block cube with white question mark, shiny 3D",
    ),
    "pipe.png": (
        "512x512",
        "classic green Mario warp pipe facing camera slightly isometric, lip and tube, single prop",
    ),
    "castle.png": (
        "512x512",
        "small grey Mario fortress castle with red flags and battlements, cute miniature prop",
    ),
    "heart.png": (
        "512x512",
        "pink Mario-style brick block with a white heart icon carved on the face, healing block",
    ),
    "note.png": (
        "512x512",
        "purple Mario note/event block cube with white exclamation mark !, magical glow",
    ),
    "vs.png": (
        "512x512",
        "orange-red Mario battle block cube with bold white letters VS on the face",
    ),
    "start.png": (
        "512x512",
        "golden Mario start block cube with rainbow stripe and white START label on face",
    ),
    "shop.png": (
        "512x512",
        "teal cyan Mario shop block cube with small store awning detail and coin motif",
    ),
}

DECOS: dict[str, tuple[str, str]] = {
    "cloud.png": ("512x512", "fluffy white Mario cloud platform prop, soft cartoon cloud"),
    "tree.png": ("512x512", "classic Mario overworld green round tree with brown trunk, 2D game prop"),
    "bush.png": ("512x512", "classic Mario green bush shrub, simple rounded game prop"),
    "coin.png": ("512x512", "classic shiny Mario gold coin spinning face-on, dollar-like emblem"),
    "hill.png": ("512x512", "soft green Mario rolling hill silhouette prop, simple game backdrop piece"),
}

BG: dict[str, tuple[str, str]] = {
    "world.png": (
        "768x1024",
        "vertical Super Mario overworld floating grass island scenery only, bright blue sky, "
        "sun and fluffy clouds, lush hills trees bushes, dirt brick ground band at bottom, "
        "empty center grass plaza, NO board path, NO tiles, NO cards, NO text, NO logos, NO characters, NO UI",
    ),
}


def _request(method: str, url: str, body: bytes | None = None, timeout: float = 300) -> bytes:
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read()[:500]!r}") from e


def t2i(prompt: str, size: str) -> bytes:
    w, h = map(int, size.lower().split("x"))
    payload = json.dumps(
        {
            "model": T2I,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
            "params": {"width": w, "height": h},
        }
    ).encode()
    data = json.loads(_request("POST", f"{AIROUTER}/v1/images/generations", payload, timeout=240))
    return base64.b64decode(data["data"][0]["b64_json"])


def rembg(png: bytes) -> bytes:
    """Local magenta chroma key (stable; avoids zestcode routing on rembg WF)."""
    return chroma_magenta(png)

def chroma_magenta(png: bytes) -> bytes:
    try:
        from PIL import Image
    except ImportError:
        print("     WARN: Pillow missing — keeping opaque plate", flush=True)
        return png
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    w, h = im.size
    # estimate plate color from corners
    corners = [im.getpixel(p)[:3] for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
    pr = sum(c[0] for c in corners) // 4
    pg = sum(c[1] for c in corners) // 4
    pb = sum(c[2] for c in corners) // 4
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = abs(r - pr) + abs(g - pg) + abs(b - pb)
            # hot pink/magenta plate OR close to sampled corner plate
            magenta = r > 170 and b > 150 and g < 150 and (r + b) > (g * 2 + 40)
            near_plate = dist < 90 and (r > 140 or b > 140) and g < 170
            if magenta or near_plate:
                px[x, y] = (r, g, b, 0)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()
def downscale_png(png: bytes, max_side: int = 512) -> bytes:
    try:
        from PIL import Image
    except ImportError:
        return png
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def vision_qa(png: bytes, expect: str) -> dict:
    small = downscale_png(png, 384)
    uri = "data:image/png;base64," + base64.b64encode(small).decode()
    prompt = (
        "You are a game-asset QA for Super Mario style board props. "
        "Reply JSON ONLY: "
        '{"pass": true|false, "defects": ["code"], "notes": "short"}\n'
        "PASS if the main subject matches the expected Mario prop and is usable as a game sprite "
        "(transparent or cutout OK, slight extra bricks/detail OK).\n"
        "FAIL only if: totally wrong subject, photoreal photo, Pokemon characters/creatures, "
        "unreadable blob, or full UI screenshot.\n"
        f"Expected asset: {expect}"
    )
    body = {
        "model": VL_MODEL,
        "temperature": 0.1,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": uri}},
                ],
            }
        ],
    }
    print(f"     vision {VL_MODEL}", flush=True)
    raw = _request("POST", f"{AIROUTER}/v1/chat/completions", json.dumps(body).encode(), timeout=240)
    msg = json.loads(raw)["choices"][0]["message"]["content"]
    a, b = msg.find("{"), msg.rfind("}")
    if a >= 0 and b > a:
        try:
            return json.loads(msg[a : b + 1])
        except json.JSONDecodeError:
            pass
    return {"pass": False, "defects": ["unparsed"], "notes": msg[:300]}


def bake_one(dest: Path, size: str, subject: str, *, do_rembg: bool, force: bool, verify: bool) -> bool:
    if dest.exists() and dest.stat().st_size > 2000 and not force:
        print(f"skip {dest.relative_to(ROOT)}", flush=True)
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    bg = MAGENTA if do_rembg else "painterly sky-and-grass environment filling the frame"
    prompt = f"{STYLE}{subject}, {bg}"
    print(f"t2i  {dest.relative_to(ROOT)}", flush=True)
    best: bytes | None = None
    for attempt in range(1, 4):
        try:
            png = t2i(prompt, size)
            if do_rembg:
                print(f"     rembg attempt {attempt}", flush=True)
                png = rembg(png)
            if verify:
                qa = vision_qa(png, subject)
                ok = bool(qa.get("pass"))
                print(f"     QA {ok} {qa.get('defects') or []} {qa.get('notes','')[:120]}", flush=True)
                if not ok and attempt < 3:
                    fix = qa.get("notes") or "cleaner silhouette, correct Mario prop"
                    prompt = f"{STYLE}{subject}, {fix}, {bg}"
                    continue
            best = png
            break
        except Exception as exc:
            print(f"     FAIL attempt {attempt}: {exc}", file=sys.stderr)
            if attempt == 3:
                return False
            time.sleep(1)
    if best is None:
        return False
    dest.write_bytes(best)
    print(f"ok   {dest.relative_to(ROOT)} ({len(best)} bytes)", flush=True)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--no-rembg", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    only = set(args.only or [])
    verify = not args.no_verify
    do_rembg = not args.no_rembg
    fails = 0

    jobs: list[tuple[Path, str, str, bool]] = []
    for name, (size, subj) in TILES.items():
        jobs.append((OUT_TILES / name, size, subj, True))
    for name, (size, subj) in DECOS.items():
        jobs.append((OUT_DECO / name, size, subj, True))
    for name, (size, subj) in BG.items():
        jobs.append((OUT_BG / name, size, subj, False))

    for dest, size, subj, cut in jobs:
        key = dest.name
        if only and key not in only and dest.stem not in only:
            continue
        ok = bake_one(dest, size, subj, do_rembg=cut and do_rembg, force=args.force, verify=verify)
        if not ok:
            fails += 1

    # write manifest for the client
    manifest = {
        "tiles": {k.replace(".png", ""): f"assets/tiles/{k}" for k in TILES},
        "deco": {k.replace(".png", ""): f"assets/deco/{k}" for k in DECOS},
        "bg": {k.replace(".png", ""): f"assets/bg/{k}" for k in BG},
    }
    (ROOT / "assets" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"manifest written, fails={fails}", flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())

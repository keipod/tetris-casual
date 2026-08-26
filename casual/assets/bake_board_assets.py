#!/usr/bin/env python3
"""Bake board-game assets via airouter t2i + qwen3-vl vision QA loop."""

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

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
VL_MODEL = "qwen3-vl:32b"
MAX_VISION_SIDE = 512
QA_ATTEMPTS = 3

ASSETS: dict[str, dict[str, tuple[str, str, int]]] = {
    "gostop": {
        "card-back.png": (
            768,
            "ornate korean hanafuda card back design, crimson lacquer with gold cloud "
            "and crane pattern, vertical rectangular card, flat decorative art, no text",
        ),
        "bg-table.png": (
            1024,
            "luxurious dark korean traditional game table surface top-down view, black "
            "lacquer with mother-of-pearl inlay floral patterns, warm candle light vignette, "
            "empty surface, no objects, no text",
        ),
        "hero-lobby.png": (
            1024,
            "wide dramatic scene of beautiful hanafuda flower cards scattered on dark silk "
            "with golden light rays, korean traditional aesthetic, cinematic depth of field, "
            "no text, no people",
        ),
    },
    "baduk": {
        "board.png": (
            1024,
            "top-down premium kaya wood go board surface, fine straight wood grain, warm "
            "honey amber color, completely empty board with no grid lines and no stones, "
            "photorealistic texture, no text",
        ),
        "bg-room.png": (
            1024,
            "serene zen meditation room interior at dusk, ink wash mountain painting on wall, "
            "dim warm lamp, minimal, atmospheric depth, no people, no text",
        ),
    },
    "alkkagi": {
        "arena.png": (
            1024,
            "top-down round polished dark wooden game board disc for marble game, warm "
            "spotlight from above, deep shadow background, empty smooth surface, no marbles, "
            "no text",
        ),
        "marble-p0.png": (
            512,
            "single glass marble bead, coral red swirl inside clear glass, glossy specular "
            "highlight, centered on plain dark charcoal background, studio product shot, "
            "no text",
        ),
        "marble-p1.png": (
            512,
            "single glass marble bead, teal blue swirl inside clear glass, glossy specular "
            "highlight, centered on plain dark charcoal background, studio product shot, "
            "no text",
        ),
    },
    "seotda": {
        "card-back.png": (
            768,
            "elegant korean hanafuda playing card back, deep crimson red lacquer with gold "
            "filigree arabesque pattern, thin gold border, vertical rectangle, flat design, "
            "no text, no letters",
        ),
        "bg-felt.png": (
            1024,
            "top-down luxurious crimson gambling table felt with ornate gold filigree border "
            "pattern around edges, moody casino lighting, soft vignette, empty center, "
            "no cards, no chips, no text",
        ),
    },
    "baccarat": {
        "bg-table.png": (
            1024,
            "top-down luxury baccarat casino table, emerald green felt, polished mahogany "
            "rail with gold studs, dim elegant chandelier glow, curved arc shape, empty "
            "surface, no cards, no chips, no text",
        ),
        "card-back.png": (
            768,
            "elegant navy blue playing card back with intricate gold geometric lattice "
            "pattern and thin gold frame, vertical rectangle, flat premium design, no text, "
            "no letters",
        ),
        "chip-gold.png": (
            512,
            "single luxury casino chip, emerald green and gold with ivory inlays, perfect "
            "circle top view, centered on plain dark background, studio product shot, "
            "no text",
        ),
    },
    "poker": {
        "card-back.png": (
            768,
            "matte black premium playing card back, gold art-deco fan pattern, thin gold "
            "border frame, vertical rectangle, flat luxurious design, absolutely no letters "
            "or numbers, no text",
        ),
        "chip-stack.png": (
            512,
            "neat stack of five red casino poker chips with white edge spots, side view, "
            "centered on plain dark background, studio product lighting, no text",
        ),
        "hero-lobby.png": (
            1024,
            "dramatic royal flush of playing cards fanned out with flying golden poker chips "
            "and subtle smoke, noir casino lighting, deep blacks and gold, cinematic, "
            "no text on cards faces hidden",
        ),
    },
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None,
             timeout: int = 420) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:500]!r}") from exc


def generate_t2i(prompt: str, size: str = "1024x1024") -> bytes:
    w, h = (int(x) for x in size.lower().split("x"))
    payload = json.dumps({
        "model": T2I_MODEL,
        "prompt": prompt,
        "size": size,
        "response_format": "b64_json",
        "params": {"width": w, "height": h},
    }).encode()
    print("     t2i ...", flush=True)
    raw = _request("POST", f"{AIROUTER}/v1/images/generations", payload,
                   {"Content-Type": "application/json"}, timeout=420)
    data = json.loads(raw)
    return base64.b64decode(data["data"][0]["b64_json"])


def _downscale(png: bytes) -> bytes:
    try:
        from PIL import Image
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png))
    if max(img.size) > MAX_VISION_SIDE:
        ratio = MAX_VISION_SIDE / max(img.size)
        img = img.resize((int(img.width * ratio), int(img.height * ratio)),
                         Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def _parse_json_obj(text: str) -> dict:
    a = text.find("{")
    b = text.rfind("}")
    if 0 <= a < b:
        try:
            return json.loads(text[a:b + 1])
        except json.JSONDecodeError:
            pass
    return {}


def vision_qa(png: bytes, subject: str) -> dict:
    small = _downscale(png)
    uri = "data:image/jpeg;base64," + base64.b64encode(small).decode()
    prompt = (
        "You are a strict QA reviewer for 2D game asset images. Reply with JSON ONLY, "
        "no markdown:\n"
        '{"pass": true|false, "defects": ["..."], "fix_prompt": "short english fix"}\n'
        "Reject if ANY of: visible text, letters, numbers, watermark, logo, signature; "
        "subject does not match the intended description; distorted or melted shapes; "
        "unwanted objects; busy clutter where emptiness is expected.\n"
        f"Intended subject: {subject}"
    )
    body = json.dumps({
        "model": VL_MODEL,
        "temperature": 0.1,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": uri}},
            ],
        }],
    }).encode()
    raw = _request("POST", f"{AIROUTER}/v1/chat/completions", body,
                   {"Content-Type": "application/json"}, timeout=180)
    msg = json.loads(raw)["choices"][0]["message"]["content"]
    qa = _parse_json_obj(msg)
    if "pass" not in qa:
        qa = {"pass": False, "defects": ["unparsed"], "fix_prompt": "", "raw": msg[:200]}
    return qa


def bake(game: str, fname: str, spec: tuple[str, str, int], force: bool, verify: bool) -> bool:
    dest = ROOT / game / "assets" / fname
    dest.parent.mkdir(parents=True, exist_ok=True)
    size_px, base_prompt = spec
    size = f"{size_px}x{size_px}"
    if dest.exists() and not force:
        print(f"skip {game}/{fname} (exists)", flush=True)
        return True
    extra = ""
    attempts = QA_ATTEMPTS if verify else 1
    last_png = None
    for i in range(1, attempts + 1):
        print(f"{game}/{fname} try {i}/{attempts}", flush=True)
        try:
            png = generate_t2i(base_prompt + (" " + extra if extra else ""), size)
        except Exception as exc:
            print(f"     gen failed: {exc!r}", flush=True)
            time.sleep(2)
            continue
        last_png = png
        dest.write_bytes(png)
        print(f"     saved {dest.stat().st_size} bytes", flush=True)
        if not verify:
            return True
        qa = vision_qa(png, base_prompt)
        print(f"     qa pass={qa['pass']} defects={qa['defects']}", flush=True)
        if qa["pass"]:
            return True
        extra = (qa.get("fix_prompt") or "") + " " + " ".join(str(d) for d in qa["defects"])
        extra += ". Absolutely no text, letters, numbers or watermarks anywhere."
    if last_png:
        dest.write_bytes(last_png)
        print(f"KEEP {game}/{fname} after {attempts} failed checks", flush=True)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--verify", action="store_true", default=True)
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    results = {}
    for game, assets in ASSETS.items():
        if args.only and game != args.only:
            continue
        for fname, spec in assets.items():
            results[f"{game}/{fname}"] = bake(game, fname, spec, args.force, args.verify)

    ok = sum(1 for v in results.values() if v)
    print(f"\nbaked {ok}/{len(results)} assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())

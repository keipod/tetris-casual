#!/usr/bin/env python3
"""Generate catch2 biome / landmark tiles via airouter t2i."""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
T2I_MODEL = os.environ.get("AIROUTER_T2I_MODEL", "t2i_z_image_turbo_v1")

# name -> (size, punch_mode, prompt)
# punch_mode: False | "dark" | "white"
TILES: dict[str, tuple[str, str | bool, str]] = {
    "tiles/sea.png": (
        "512x512",
        False,
        "seamless top-down RPG ocean water tile texture, deep blue sea with soft waves, "
        "pokemon-style painted tileset, fill entire frame, no land, no text, no characters",
    ),
    "tiles/sand.png": (
        "512x512",
        False,
        "seamless top-down RPG beach sand tile texture, warm pale sand with tiny pebbles, "
        "pokemon overworld tileset style, fill frame, no people, no text",
    ),
    "tiles/dock.png": (
        "512x512",
        False,
        "seamless top-down RPG wooden pier dock plank tile, weathered brown boards, "
        "nails, pokemon town pier style, fill frame, no people, no text",
    ),
    "tiles/mountain.png": (
        "512x512",
        False,
        "seamless top-down RPG rocky mountain cliff tile, grey stone ridges, "
        "pokemon overworld mountain tileset, fill frame, no caves yet, no people, no text",
    ),
    "tiles/cave.png": (
        "512x512",
        "dark",
        "top-down RPG dark cave entrance sprite in rocky cliff face, black mouth opening, "
        "stone rim, pokemon dungeon entrance style, centered, plain pure black background, no text, no people",
    ),
    "tiles/well.png": (
        "512x512",
        "dark",
        "top-down RPG village stone water well sprite with wooden roof and bucket, "
        "cute pokemon town prop, centered, plain pure black background, no text, no people",
    ),
    "tiles/lumber-mill.png": (
        "768x768",
        "dark",
        "top-down RPG lumber mill sawmill building sprite, timber walls, big log pile beside, "
        "water wheel hint, wooden roof, door bottom center, pokemon village workshop style, "
        "plain pure black background, no text letters, no people",
    ),
    "tiles/campfire.png": (
        "512x512",
        "dark",
        "top-down RPG campfire sprite with glowing orange flames and stone ring, "
        "cute pokemon camping prop, centered, plain pure black background, no text, no people",
    ),
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 420) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:500]!r}") from exc


def strip_png(png: bytes, mode: str | bool | None) -> bytes:
    if not mode:
        return png
    try:
        from PIL import Image
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    px = img.load()
    w, h = img.size
    kind = "white" if mode is True else str(mode)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if kind == "dark":
                if lum < 22 and spread < 18:
                    px[x, y] = (r, g, b, 0)
                elif lum < 40 and spread < 24:
                    px[x, y] = (r, g, b, int(a * 0.2))
            else:
                if lum > 248 and spread < 18:
                    px[x, y] = (r, g, b, 0)
                elif lum > 225 and spread < 28:
                    px[x, y] = (r, g, b, int(a * 0.25))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def generate_t2i(prompt: str, dest: Path, size: str, punch: str | bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = (int(x) for x in size.lower().split("x"))
    payload = json.dumps(
        {
            "model": T2I_MODEL,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
            "params": {"width": w, "height": h},
        }
    ).encode()
    print(f"t2i  {dest.relative_to(ROOT)}", flush=True)
    raw = _request(
        "POST",
        f"{AIROUTER}/v1/images/generations",
        payload,
        {"Content-Type": "application/json"},
    )
    data = json.loads(raw)
    png = base64.b64decode(data["data"][0]["b64_json"])
    dest.write_bytes(strip_png(png, punch))
    print(f"ok   {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = set(args.only or [])

    for rel, (size, punch, prompt) in TILES.items():
        name = Path(rel).name
        if only and name not in only and rel not in only:
            continue
        dest = ROOT / "assets" / rel
        if dest.exists() and not args.force:
            print(f"skip {dest.relative_to(ROOT)}", flush=True)
            continue
        try:
            generate_t2i(prompt, dest, size, punch)
        except Exception as exc:
            print(f"FAIL {name}: {exc}", file=sys.stderr)
            return 1
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

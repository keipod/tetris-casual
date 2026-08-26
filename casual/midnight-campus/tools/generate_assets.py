#!/usr/bin/env python3
"""Bake Midnight Campus backgrounds + heroine portraits via airouter t2i."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
T2I_MODEL = "t2i_z_image_turbo_v1"

BG_STYLE = (
    "anime visual novel background art, soft cinematic lighting, detailed environment, "
    "no people, no faces, no text, no watermark, vertical mobile composition "
)

PORTRAIT_STYLE = (
    "anime visual novel character portrait, beautiful adult woman clearly in her early twenties, "
    "university student, elegant mature face, soft lighting, upper body, transparent or plain soft bg, "
    "high quality illustration, no text, no watermark, not underage, adult 21+ appearance "
)

BGS: dict[str, tuple[str, str]] = {
    "dorm.png": ("768x1024", "cozy university dorm room at night, desk lamp, city window lights, warm sheets"),
    "lecture.png": ("768x1024", "modern university lecture hall, empty seats, projector screen, morning light"),
    "library.png": ("768x1024", "quiet university library stacks, warm lamps, wooden tables, late afternoon"),
    "cafeteria.png": ("768x1024", "busy campus cafeteria interior, sunlight, trays, large windows"),
    "gym.png": ("768x1024", "university gymnasium interior, polished floor, basketball hoops, bright lights"),
    "cafe.png": ("768x1024", "stylish campus cafe interior, latte art counter, soft evening lamps"),
    "rooftop.png": ("768x1024", "university building rooftop at dusk, city skyline, railing, wind"),
    "station.png": ("768x1024", "suburban train station platform at night, neon signs distant, quiet"),
    "park.png": ("768x1024", "campus cherry blossom park path, benches, soft spring daylight"),
    "lab.png": ("768x1024", "university research lab, monitors, glassware, cool blue night lighting"),
    "council.png": ("768x1024", "student council office, large desk, bulletin boards, afternoon sun"),
    "music.png": ("768x1024", "music practice room, piano, acoustic panels, warm evening light"),
    "festival.png": ("768x1024", "university night festival plaza, paper lanterns, food stalls, festive glow"),
    "hotel.png": ("768x1024", "tasteful hotel room interior night, soft warm lamps, city view, romantic adult mood no people"),
    "title.png": ("768x1024", "moonlit university campus aerial view, romantic night atmosphere, neon and cherry trees"),
}

PORTRAITS: dict[str, tuple[str, str]] = {
    "gaeun.png": ("768x1024", "Korean woman 21yo literature major, long black hair, glasses optional soft, gentle shy smile, white blouse, soft lilac tones"),
    "soyul.png": ("768x1024", "Korean woman 22yo athletic, short sporty ponytail, energetic confident smile, sports jacket, warm orange tones"),
    "yuha.png": ("768x1024", "Korean woman 21yo art student, messy bun with paint flecks, playful eyes, oversized denim shirt, mint tones"),
    "sieun.png": ("768x1024", "Korean woman 23yo research senior, elegant long hair, calm mature expression, blouse and cardigan, deep blue tones"),
    "chaerin.png": ("768x1024", "Korean woman 21yo student council, sharp bob haircut, cool half-smile, blazer, crimson accents"),
    "reina.png": ("768x1024", "mixed heritage woman 22yo exchange music student, wavy chestnut hair, warm inviting smile, stylish sweater, gold tones"),
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 420) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:500]!r}") from exc


def generate_t2i(prompt: str, dest: Path, size: str) -> None:
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
    dest.write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    print(f"ok   {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--portraits-only", action="store_true")
    ap.add_argument("--bg-only", action="store_true")
    args = ap.parse_args()
    only = set(args.only or [])

    jobs: list[tuple[Path, str, str]] = []
    if not args.portraits_only:
        for name, (size, suffix) in BGS.items():
            if only and name not in only:
                continue
            jobs.append((ROOT / "assets" / "bg" / name, size, BG_STYLE + suffix))
    if not args.bg_only:
        for name, (size, suffix) in PORTRAITS.items():
            if only and name not in only:
                continue
            jobs.append((ROOT / "assets" / "portraits" / name, size, PORTRAIT_STYLE + suffix))

    for dest, size, prompt in jobs:
        if dest.exists() and not args.force:
            print(f"skip {dest.relative_to(ROOT)}", flush=True)
            continue
        try:
            generate_t2i(prompt, dest, size)
        except Exception as exc:
            print(f"FAIL {dest.name}: {exc}", file=sys.stderr)
            return 1

    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

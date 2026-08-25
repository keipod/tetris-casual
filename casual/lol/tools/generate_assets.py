#!/usr/bin/env python3
"""Bake lol (리그 오브 챔피언) sprites via airouter + procedural terrain tiles.

Images: local ComfyUI (`t2i_z_image_turbo_v1`) with white-strip post-processing,
then downscaled to the exact contract sizes the game expects.
Terrain textures are drawn procedurally with Pillow so they tile seamlessly
(guaranteed wrap-around edges, no AI seams).

All character designs are ORIGINAL (LoL-inspired vibe only — no Riot IP).
Audio is intentionally not generated here: the game reuses the shared
/casual/assets/sfx-bank.js UI pack.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import random
import sys
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"

STICKER = (
    "isolated subject centered filling most of the frame, "
    "plain pure white studio background, no text, no watermark, "
    "no floor shadow, no extra objects, no UI"
)

STYLE = (
    "cute chibi fantasy MOBA game asset sticker, thick clean outlines, "
    "soft cel shading, vivid colors, top-down three-quarter view, "
    f"{STICKER}"
)

ICON_STYLE = (
    "square game skill icon, rounded dark navy panel with subtle gold trim border, "
    "single bold glowing symbol centered, crisp vector look, "
    "plain pure white background outside the icon frame, no text, no watermark"
)

# name -> (request_size, strip_mode, target_size, prompt)
IMAGES: dict[str, tuple[str, str | bool, tuple[int, int], str]] = {
    "champ-you.png": (
        "768x768",
        True,
        (96, 96),
        f"{STYLE}, brave knight-mage hybrid chibi hero, blue cape flowing behind, "
        "silver armor with gold trim, short glowing sword raised, small cyan magic orb floating beside",
    ),
    "champ-them.png": (
        "768x768",
        True,
        (96, 96),
        f"{STYLE}, menacing horned brute-mage chibi villain, torn red cape, dark iron armor, "
        "gnarled staff with orange fire magic glow, angry eyebrows",
    ),
    "minion-melee-blue.png": (
        "512x512",
        True,
        (48, 48),
        f"{STYLE}, tiny imp footman holding a small sword and round shield, blue team colors, blue helmet",
    ),
    "minion-melee-red.png": (
        "512x512",
        True,
        (48, 48),
        f"{STYLE}, tiny imp footman holding a small sword and round shield, red team colors, red helmet",
    ),
    "minion-ranged-blue.png": (
        "512x512",
        True,
        (48, 48),
        f"{STYLE}, tiny imp caster holding a wooden staff with a cyan magic spark on tip, blue hood",
    ),
    "minion-ranged-red.png": (
        "512x512",
        True,
        (48, 48),
        f"{STYLE}, tiny imp caster holding a wooden staff with an orange magic spark on tip, red hood",
    ),
    "tower-blue.png": (
        "768x1024",
        True,
        (112, 160),
        f"{STYLE}, stone defense turret with battlement top and one large glowing cyan-blue crystal hovering above it",
    ),
    "tower-red.png": (
        "768x1024",
        True,
        (112, 160),
        f"{STYLE}, stone defense turret with battlement top and one large glowing red-orange crystal hovering above it",
    ),
    "nexus-blue.png": (
        "1024x1024",
        True,
        (140, 170),
        f"{STYLE}, large magical crystal obelisk monument on stone base, bright cyan-blue inner glow, floating shards around it",
    ),
    "nexus-red.png": (
        "1024x1024",
        True,
        (140, 170),
        f"{STYLE}, large magical crystal obelisk monument on stone base, fierce red-orange inner glow, floating shards around it",
    ),
    "fountain.png": (
        "768x768",
        True,
        (120, 120),
        f"{STYLE}, round carved stone healing fountain pool with sparkling turquoise water and rising sparkles",
    ),
    "coin.png": (
        "512x512",
        True,
        (32, 32),
        "square game icon sticker, shiny gold coin with embossed crossed swords emblem, kawaii, "
        "plain pure white background, no text, no watermark",
    ),
    "skill-q.png": (
        "512x512",
        True,
        (64, 64),
        f"{ICON_STYLE}, cyan comet beam streaking diagonally with sparkle trail",
    ),
    "skill-w.png": (
        "512x512",
        True,
        (64, 64),
        f"{ICON_STYLE}, round glowing teal shield with hexagon pattern",
    ),
    "skill-e.png": (
        "512x512",
        True,
        (64, 64),
        f"{ICON_STYLE}, two bold wind dash arrows pointing right with motion streaks",
    ),
    "skill-r.png": (
        "512x512",
        True,
        (64, 64),
        f"{ICON_STYLE}, huge golden explosion burst with radiating sparks and ornate gold border",
    ),
    "tree-deco.png": (
        "768x768",
        True,
        (96, 96),
        f"{STYLE}, stylized fantasy tree with a couple of grey rocks clustered at its base",
    ),
    "fx-spark.png": (
        "512x512",
        "dark",
        (32, 32),
        "square game VFX sticker, yellow white impact spark burst, comic hit star, "
        "plain pure black background, no text, no watermark",
    ),
}


def _request(
    method: str,
    url: str,
    body: bytes | None = None,
    headers: dict | None = None,
    timeout: int = 330,
) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:400]!r}") from exc


def strip_white(img: "Image.Image") -> "Image.Image":
    """Flood-fill transparent any near-white pixel connected to the border."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        lum = (r + g + b) / 3
        spread = max(r, g, b) - min(r, g, b)
        return a > 0 and lum >= 232 and spread <= 40

    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
            seen[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x]:
                q.append((x, y))
                seen[y][x] = True
    while q:
        x, y = q.popleft()
        if not is_bg(x, y):
            continue
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx]:
                seen[ny][nx] = True
                q.append((nx, ny))
    return img


def strip_dark(img: "Image.Image") -> "Image.Image":
    """Make near-black pixels transparent (for fx stickers on black)."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if lum < 55 and spread < 28:
                px[x, y] = (r, g, b, 0)
            elif lum < 95 and spread < 36:
                px[x, y] = (r, g, b, int(a * ((lum - 55) / 40)))
    return img


def crop_to_content(img: "Image.Image", pad_ratio: float = 0.02) -> "Image.Image":
    bbox = img.getbbox()
    if not bbox:
        return img
    img = img.crop(bbox)
    pw = max(1, int(img.width * pad_ratio))
    ph = max(1, int(img.height * pad_ratio))
    canvas = Image.new("RGBA", (img.width + pw * 2, img.height + ph * 2), (0, 0, 0, 0))
    canvas.paste(img, (pw, ph), img)
    return canvas


def generate_image(dest: Path, size: str, strip_mode: str | bool, target: tuple[int, int], prompt: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "model": T2I_MODEL,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
        }
    ).encode()
    print(f"t2i  {dest.relative_to(ROOT.parent.parent)}", flush=True)
    _, raw, _ = _request(
        "POST",
        f"{AIROUTER}/v1/images/generations",
        payload,
        {"Content-Type": "application/json"},
    )
    data = json.loads(raw)
    png = base64.b64decode(data["data"][0]["b64_json"])
    img = Image.open(io.BytesIO(png))
    if strip_mode is True:
        img = strip_white(img)
        img = crop_to_content(img)
    elif strip_mode == "dark":
        img = strip_dark(img)
    img = img.resize(target, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    dest.write_bytes(out.getvalue())
    print(f"     {dest.stat().st_size} bytes -> {target[0]}x{target[1]}", flush=True)


def _plot_periodic(
    px,
    size: int,
    cx: int,
    cy: int,
    radius: int,
    color_fn,
    squash: float = 1.0,
) -> None:
    """Stamp a disc-shaped blob at all 9 periodic offsets so the tile stays
    seamless: pixel (x, y) must equal pixel (x±size, y±size), which only holds
    if every shape is repeated across the period boundary."""
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if math.hypot(dx, dy * squash) > radius:
                continue
            col = color_fn(dx, dy)
            for ox in (-size, 0, size):
                for oy in (-size, 0, size):
                    x, y = cx + dx + ox, cy + dy + oy
                    if 0 <= x < size and 0 <= y < size:
                        px[x, y] = col


def draw_grass_tile(size: int = 128) -> "Image.Image":
    rng = random.Random(20260825)
    img = Image.new("RGBA", (size, size), (86, 138, 66, 255))
    px = img.load()

    def blotch(_dx: int, _dy: int) -> tuple[int, int, int, int]:
        s = rng.randint(-10, 10)
        return (86 + s, 138 + s, 66 + s, 255)

    for _ in range(26):
        cx, cy = rng.randrange(size), rng.randrange(size)
        _plot_periodic(px, size, cx, cy, rng.randint(10, 26), blotch)

    def speckle(v: int):
        return lambda *_: (86 + v, 138 + v, 66 + v, 255)

    for _ in range(420):
        v = rng.randint(-22, 22)
        _plot_periodic(px, size, rng.randrange(size), rng.randrange(size), 1, speckle(v))

    def blade(_dx: int, _dy: int) -> tuple[int, int, int, int]:
        return (120, 176, 92, 255)

    for _ in range(90):
        _plot_periodic(px, size, rng.randrange(size), rng.randrange(size), 2, blade)

    return img


def draw_lane_tile(size: int = 128) -> "Image.Image":
    rng = random.Random(20260826)
    img = Image.new("RGBA", (size, size), (168, 132, 88, 255))
    px = img.load()

    def streak(_dx: int, _dy: int) -> tuple[int, int, int, int]:
        s = rng.randint(-14, 12)
        return (168 + s, 132 + s, 88 + s, 255)

    for _ in range(20):
        cx, cy = rng.randrange(size), rng.randrange(size)
        _plot_periodic(px, size, cx, cy, rng.randint(12, 30), streak)

    def grain(v: int):
        return lambda *_: (168 + v, 132 + v, 88 + v, 255)

    for _ in range(360):
        v = rng.randint(-24, 24)
        _plot_periodic(px, size, rng.randrange(size), rng.randrange(size), 1, grain(v))

    def pebble_body(base: int):
        def fn(dx: int, dy: int) -> tuple[int, int, int, int]:
            v = base + (dx + dy) % 7 - 3
            return (150 + v, 118 + v, 82 + v, 255)
        return fn

    for _ in range(46):
        rr = rng.randint(2, 5)
        base = rng.randint(-18, 18)
        cx, cy = rng.randrange(size), rng.randrange(size)
        _plot_periodic(px, size, cx, cy, rr, pebble_body(base))
        hi = (206 + base, 176 + base, 136 + base, 255)
        hx = (cx - rr // 2) % size
        hy = (cy - rr // 2) % size
        _plot_periodic(px, size, hx, hy, 1, lambda *_: hi)

    return img


def assert_tiling(img: "Image.Image", name: str) -> None:
    """A seamless tile does NOT need edge-equal pixels; it needs the wrap
    discontinuity to stay within natural noise level. Blobs crossing the
    boundary are stamped periodically, so the seam delta must be comparable
    to the delta between ordinary neighbouring columns."""
    px = img.load()
    w, h = img.size

    def delta(a, b) -> int:
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    seam_v = sum(delta(px[0, y], px[w - 1, y]) for y in range(h)) / h
    ref_v = sum(delta(px[x, y], px[x + 1, y]) for x in range(w - 1) for y in range(h)) / ((w - 1) * h)
    seam_h = sum(delta(px[x, 0], px[x, h - 1]) for x in range(w)) / w
    ref_h = sum(delta(px[x, y], px[x, y + 1]) for x in range(w) for y in range(h - 1)) / (w * (h - 1))
    if seam_v > ref_v * 2.5 + 6 or seam_h > ref_h * 2.5 + 6:
        raise AssertionError(
            f"{name}: visible seam (v {seam_v:.1f} vs ref {ref_v:.1f}, "
            f"h {seam_h:.1f} vs ref {ref_h:.1f})"
        )


CONTRACT = [
    "champ-you.png", "champ-them.png",
    "minion-melee-blue.png", "minion-melee-red.png",
    "minion-ranged-blue.png", "minion-ranged-red.png",
    "tower-blue.png", "tower-red.png",
    "nexus-blue.png", "nexus-red.png",
    "fountain.png", "coin.png",
    "skill-q.png", "skill-w.png", "skill-e.png", "skill-r.png",
    "tree-deco.png", "fx-spark.png",
]

TERRAIN = {
    "terrain-grass.png": draw_grass_tile,
    "terrain-lane.png": draw_lane_tile,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--terrain-only", action="store_true")
    parser.add_argument("--images-only", action="store_true")
    parser.add_argument(
        "--only", nargs="+", metavar="NAME",
        help="Regenerate only these asset filenames (e.g. champ-you.png terrain-grass.png)",
    )
    args = parser.parse_args()
    failures: list[str] = []
    only = set(args.only) if args.only else None
    ASSETS.mkdir(parents=True, exist_ok=True)

    if not args.images_only:
        for name, fn in TERRAIN.items():
            if only is not None and name not in only:
                continue
            dest = ASSETS / name
            if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                print(f"skip {dest.relative_to(ROOT.parent.parent)}")
                continue
            try:
                img = fn()
                assert_tiling(img, name)
                img.save(dest, format="PNG")
                print(f"tile {dest.relative_to(ROOT.parent.parent)} ({dest.stat().st_size} bytes)", flush=True)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {name}: {exc}", file=sys.stderr)

    if not args.terrain_only:
        for name, (size, strip_mode, target, prompt) in IMAGES.items():
            if only is not None and name not in only:
                continue
            dest = ASSETS / name
            if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                print(f"skip {dest.relative_to(ROOT.parent.parent)}")
                continue
            try:
                generate_image(dest, size, strip_mode, target, prompt)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {dest.relative_to(ROOT.parent.parent)}: {exc}", file=sys.stderr)

    missing = [n for n in CONTRACT + list(TERRAIN) if not (ASSETS / n).exists()]
    if missing:
        failures.extend(f"missing: {m}" for m in missing)

    if failures:
        print("failures:", len(failures))
        for line in failures:
            print(" -", line)
        return 1

    total = sum((ASSETS / n).stat().st_size for n in CONTRACT + list(TERRAIN))
    print(f"ok — {len(CONTRACT) + len(TERRAIN)} files, {total} bytes total")
    return 0


if __name__ == "__main__":
    from PIL import Image  # noqa: PLC0415 — single import point after arg parsing
    raise SystemExit(main())

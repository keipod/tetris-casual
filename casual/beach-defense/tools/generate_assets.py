#!/usr/bin/env python3
"""Bake Boom Beach–faithful Beach Defense sprites via airouter t2i.

Style target: Supercell Boom Beach — chunky isometric 3/4 props, bright
tropical daylight, military HQ/defenses, Black Hammer troops. NOT sticker
icons, NOT cozy cottages, NOT mini-islands with water rings.

Prefer chroma-key magenta backgrounds so Pillow can cut clean alpha.
Run with: tools/.venv/bin/python tools/generate_assets.py
"""

from __future__ import annotations

import argparse
import base64
import json
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
I2I_MODEL = "i2i_qwen_image_edit_2509_v1"

# Hard negatives — previous bakes kept making sticker dioramas / voxel soldiers.
NEG = (
    "BACKGROUND MUST BE flat solid hot magenta #FF00FF with ZERO other colors. "
    "FORBIDDEN: white outline sticker border, black outline sticker border, drop shadow plate, "
    "mini island, grass patch podium, stone platform under the subject, ocean water, "
    "palm trees (unless this asset is specifically a palm tree), bushes framing the subject, "
    "minecraft, voxel, lego, blocky cubes, crossy road style, flat 2D vector sticker. "
    "ONLY the single subject floating on magenta. Centered. Large in frame."
)

BB = (
    "Supercell Boom Beach game art, Clash of Clans / Boom Beach quality, "
    "rounded chunky stylized 3D, soft painted plastic materials, tropical sunny light, "
    "isometric three-quarter camera, mobile strategy game prop"
)

IMAGES: dict[str, tuple[str, bool, str]] = {
    "island-bg.png": (
        "1024x1024",
        False,
        "Boom Beach player island from high isometric angle, turquoise ocean, white foam beach ring, "
        "bright green grass interior with empty clearing for a base, few edge palms only, "
        "Supercell Boom Beach lighting, fill frame, no HQ, no defenses, no troops, no UI",
    ),
    "hq.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Headquarters building ALONE. "
        "Wooden military HQ, bright red tile roof, small upper lookout, front door, a few sandbags. "
        "NOT a cottage vacation house. No trees. No ground plate. "
        f"{NEG}",
    ),
    "tower-mg.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Machine Gun nest ALONE. "
        "Twin olive machine-gun barrels on sandbag ring, small concrete footing. No trees. No soldier. "
        f"{NEG}",
    ),
    "tower-cannon.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Cannon defense ALONE. "
        "Short coastal cannon on concrete, sandbags, olive/steel. No trees. No wheeled field gun toy. "
        f"{NEG}",
    ),
    "tower-mortar.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Mortar defense ALONE. "
        "Mortar tube in sandbag pit angled upward. No trees. "
        f"{NEG}",
    ),
    "enemy-rifle.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Black Hammer Rifleman troop ALONE, full body. "
        "Rounded organic supercell character (like Boom Beach Rifleman), green helmet with strap, "
        "khaki/olive uniform, holding a rifle, simple expressive eyes, walking three-quarter pose. "
        "NOT minecraft. NOT voxel. NOT cube head. No ground. No palms. "
        f"{NEG}",
    ),
    "enemy-brute.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Black Hammer heavy Warrior troop ALONE, full body. "
        "Bulky rounded supercell soldier with big weapon, dark olive armor, green helmet, expressive face. "
        "NOT minecraft. NOT voxel. No ground. No palms. "
        f"{NEG}",
    ),
    "enemy-tank.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach Tank vehicle ALONE. "
        "Small chunky tracked tank with turret, dark olive armor, Boom Beach vehicle look. "
        "No ground plate. No palms. "
        f"{NEG}",
    ),
    "fx-explosion.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach explosion VFX ALONE — orange fireball, yellow core, gray smoke. "
        "No crater ground disk. "
        f"{NEG}",
    ),
    "deco-palm.png": (
        "768x768",
        True,
        f"{BB}. Subject: one Boom Beach palm tree ALONE, brown segmented trunk, bright green fronds. "
        "No grass disk. No second tree. "
        f"{NEG}",
    ),
    "deco-rock.png": (
        "768x768",
        True,
        f"{BB}. Subject: Boom Beach gray coastal rock cluster ALONE. No grass disk. "
        f"{NEG}",
    ),
    "tile-sand.png": (
        "512x512",
        False,
        "seamless Boom Beach sandy beach ground texture only, warm beige sand grain, "
        "top-down orthographic, fill entire frame, no objects, no water, no text",
    ),
    "tile-grass.png": (
        "512x512",
        False,
        "seamless Boom Beach bright tropical grass ground texture only, saturated green, "
        "top-down orthographic, fill entire frame, no objects, no text",
    ),
    "tile-path.png": (
        "512x512",
        False,
        "seamless Boom Beach packed dirt invasion path texture only, warm brown earth, "
        "top-down orthographic, fill entire frame, no objects, no text",
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


def strip_chroma(png: bytes) -> bytes:
    """Remove chroma/studio bg, kill sticker outlines, crop to content."""
    try:
        from PIL import Image, ImageFilter
        import io
    except ImportError:
        return png

    img = Image.open(io.BytesIO(png)).convert("RGBA")
    w, h = img.size
    px = img.load()

    def is_bg(r: int, g: int, b: int) -> bool:
        if r > 160 and b > 160 and g < 150 and (r + b) / 2 - g > 35:
            return True  # magenta / pink plate / pink shadow
        lum = (r + g + b) / 3
        spread = max(r, g, b) - min(r, g, b)
        if lum > 228 and spread < 32:
            return True  # white / light gray studio + sticker rim
        if lum < 28 and spread < 18:
            return True  # black sticker outline / pure black plate
        if g > 200 and r < 120 and b < 120:
            return True
        return False

    visited = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    stack += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]

    while stack:
        x, y = stack.pop()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _a = px[x, y]
        if not is_bg(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # Global chroma / black-rim cleanup (sticker rings often aren't border-connected after first pass)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if is_bg(r, g, b):
                px[x, y] = (r, g, b, 0)

    # Soft-erode leftover outline fringe: if a pixel is mostly surrounded by transparent, drop it
    alpha = img.split()[3]
    eroded = alpha.filter(ImageFilter.MinFilter(3))
    img.putalpha(eroded)

    bbox = img.getbbox()
    if bbox:
        pad = 8
        x0, y0, x1, y1 = bbox
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w, x1 + pad)
        y1 = min(h, y1 + pad)
        img = img.crop((x0, y0, x1, y1))
        # Normalize onto a square canvas so draw sizes stay consistent
        side = max(img.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2), img)
        img = canvas

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


# Back-compat alias used by older call sites / docs
strip_white = strip_chroma


_STDLIB_COLORS = {
    "island-bg.png": (58, 156, 184),
    "hq.png": (196, 148, 98),
    "tower-mg.png": (150, 150, 130),
    "tower-cannon.png": (140, 124, 108),
    "tower-mortar.png": (120, 118, 100),
    "enemy-rifle.png": (92, 110, 78),
    "enemy-brute.png": (150, 88, 70),
    "enemy-tank.png": (96, 108, 88),
    "fx-explosion.png": (255, 176, 60),
    "deco-palm.png": (60, 140, 70),
    "deco-rock.png": (120, 120, 118),
    "tile-sand.png": (224, 200, 140),
    "tile-grass.png": (118, 176, 84),
    "tile-path.png": (176, 140, 96),
}


def write_stdlib_png(dest: Path, size: int, rgb: tuple[int, int, int]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r, g, b = rgb
    row = bytes([0, r, g, b] * size)
    raw = row * size
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    dest.write_bytes(png)


def placeholder(name: str, dest: Path) -> None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        size = 1024 if name == "island-bg.png" else 512
        write_stdlib_png(dest, size, _STDLIB_COLORS.get(name, (160, 160, 160)))
        return

    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 1024 if name == "island-bg.png" else 768
    cx = cy = size // 2

    if name == "island-bg.png":
        img = Image.new("RGB", (size, size), (26, 140, 168))
        d = ImageDraw.Draw(img)
        d.ellipse((size * 0.12, size * 0.18, size * 0.88, size * 0.88), fill=(232, 210, 150))
        d.ellipse((size * 0.24, size * 0.28, size * 0.76, size * 0.8), fill=(90, 170, 80))
        img.save(dest)
        return
    if name.startswith("tile-"):
        colors = {
            "tile-sand.png": (224, 200, 140),
            "tile-grass.png": (90, 170, 80),
            "tile-path.png": (176, 140, 96),
        }
        img = Image.new("RGB", (512, 512), colors[name])
        img.save(dest)
        return

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body = _STDLIB_COLORS.get(name, (160, 160, 160))
    if name == "hq.png":
        d.rectangle((cx - 90, cy - 20, cx + 90, cy + 140), fill=(180, 130, 80, 255))
        d.polygon([(cx - 120, cy - 20), (cx, cy - 160), (cx + 120, cy - 20)], fill=(200, 50, 40, 255))
    elif name.startswith("tower"):
        d.rectangle((cx - 80, cy, cx + 80, cy + 120), fill=(*body, 255))
        d.rectangle((cx - 20, cy - 80, cx + 20, cy + 20), fill=(70, 70, 70, 255))
    elif name.startswith("enemy"):
        d.ellipse((cx - 70, cy - 40, cx + 70, cy + 140), fill=(*body, 255))
        d.ellipse((cx - 50, cy - 130, cx + 50, cy - 20), fill=(210, 190, 150, 255))
    elif name == "deco-palm.png":
        d.rectangle((cx - 12, cy - 40, cx + 12, cy + 160), fill=(120, 80, 40, 255))
        d.ellipse((cx - 110, cy - 160, cx + 110, cy - 20), fill=(50, 150, 70, 255))
    elif name == "fx-explosion.png":
        d.ellipse((cx - 140, cy - 140, cx + 140, cy + 140), fill=(255, 200, 80, 255))
        d.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), fill=(255, 120, 40, 255))
    else:
        d.ellipse((cx - 100, cy - 80, cx + 100, cy + 120), fill=(*body, 255))
    img.save(dest)


def generate_image(prompt: str, dest: Path, size: str, do_strip: bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "model": T2I_MODEL,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
        }
    ).encode()
    print(f"t2i  {dest.relative_to(ROOT)}", flush=True)
    _, raw, _ = _request(
        "POST",
        f"{AIROUTER}/v1/images/generations",
        payload,
        {"Content-Type": "application/json"},
    )
    data = json.loads(raw)
    b64 = data["data"][0]["b64_json"]
    png = base64.b64decode(b64)
    if do_strip:
        png = refine_i2i(png, dest.name)
        png = strip_chroma(png)
    dest.write_bytes(png)


def _data_uri_png(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


# Second-pass edits: t2i loves diorama bases; i2i cuts them out.
I2I_CLEAN: dict[str, str] = {
    "hq.png": (
        "Edit the asset. KEEP ONLY the wooden headquarters building with the red roof and sandbags. "
        "DELETE all palm trees, bushes, grass tiles, stone platforms, water, sky, and sticker borders. "
        "Center the isolated building on flat solid hot magenta #FF00FF. Preserve Boom Beach chunky style."
    ),
    "tower-mg.png": (
        "Edit the asset. KEEP ONLY the machine-gun nest with sandbags and gun barrels. "
        "DELETE palm trees, bushes, grass/stone platforms, water, and sticker borders. "
        "Center on flat solid hot magenta #FF00FF. Preserve Boom Beach style."
    ),
    "tower-cannon.png": (
        "Edit the asset. KEEP ONLY the coastal cannon defense structure with sandbags. "
        "DELETE palm trees, bushes, grass/stone platforms, water, and sticker borders. "
        "Center on flat solid hot magenta #FF00FF."
    ),
    "tower-mortar.png": (
        "Edit the asset. KEEP ONLY the mortar tubes and sandbag pit. "
        "DELETE palm trees, bushes, grass/stone platforms, water, and sticker borders. "
        "Center on flat solid hot magenta #FF00FF."
    ),
    "enemy-rifle.png": (
        "Edit the asset. KEEP ONLY the soldier character holding a rifle, full body. "
        "DELETE palm trees, island, water, grass podium, sky, and sticker borders. "
        "Center the isolated troop on flat solid hot magenta #FF00FF. Keep rounded Boom Beach proportions, not minecraft."
    ),
    "enemy-brute.png": (
        "Edit the asset. KEEP ONLY the bulky warrior soldier full body. "
        "DELETE palm trees, island, water, grass podium, sky, and sticker borders. "
        "Center on flat solid hot magenta #FF00FF."
    ),
    "enemy-tank.png": (
        "Edit the asset. KEEP ONLY the tank vehicle. "
        "DELETE palm trees, island cliffs, water, grass, and sticker borders. "
        "Center the tank on flat solid hot magenta #FF00FF."
    ),
    "fx-explosion.png": (
        "Edit the asset. KEEP ONLY the explosion fireball and smoke. "
        "DELETE ground crater disks, islands, trees. Center on flat solid hot magenta #FF00FF."
    ),
    "deco-palm.png": (
        "Edit the asset. KEEP ONLY one palm tree trunk and fronds. "
        "DELETE grass disks, rocks, extra trees, water. Center on flat solid hot magenta #FF00FF."
    ),
    "deco-rock.png": (
        "Edit the asset. KEEP ONLY the rock cluster. "
        "DELETE grass disks, trees, water. Center on flat solid hot magenta #FF00FF."
    ),
}


def refine_i2i(png: bytes, name: str) -> bytes:
    """Qwen image-edit pass to isolate the subject from diorama clutter."""
    prompt = I2I_CLEAN.get(name)
    if not prompt:
        return png
    body = {
        "task": "image.generate",
        "input": {
            "workflow_name": I2I_MODEL,
            "params": {
                "prompt": prompt,
                "image": _data_uri_png(png),
                "enable_lightning_lora": True,
                "filename_prefix": Path(name).stem + "-clean",
            },
            "options": {"free_after": True},
        },
    }
    print(f"i2i  {name}", flush=True)
    _, raw, _ = _request(
        "POST",
        f"{AIROUTER}/v1/enqueue",
        json.dumps(body).encode(),
        {"Content-Type": "application/json"},
        timeout=60,
    )
    job_id = json.loads(raw)["id"]
    deadline = time.time() + 360
    while time.time() < deadline:
        _, st_raw, _ = _request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30)
        st = json.loads(st_raw)
        state = st.get("state") or st.get("status")
        if state in ("done", "succeeded", "completed"):
            _, art, _ = _request("GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=120)
            return art
        if state in ("failed", "error", "cancelled"):
            print(f"     i2i failed ({state}) — keeping t2i", flush=True)
            return png
        time.sleep(1.5)
    print("     i2i timeout — keeping t2i", flush=True)
    return png


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--placeholders-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--refine-only",
        action="store_true",
        help="Skip t2i; i2i-clean + chroma-strip existing assets that need isolation",
    )
    parser.add_argument("--only", nargs="*", help="Bake only these filenames")
    args = parser.parse_args()
    failures: list[str] = []

    items = list(IMAGES.items())
    if args.only:
        wanted = set(args.only)
        items = [(n, v) for n, v in IMAGES.items() if n in wanted]
        missing = wanted - {n for n, _ in items}
        if missing:
            print(f"unknown --only names: {sorted(missing)}", file=sys.stderr)
            return 2

    for name, (size, do_strip, prompt) in items:
        dest = ROOT / "assets" / name
        if args.dry_run:
            print(f"{name}: size={size} strip={do_strip}\n  prompt={prompt[:140]}...")
            continue
        if args.refine_only:
            if not do_strip or name not in I2I_CLEAN:
                print(f"skip {name} (no i2i clean)")
                continue
            if not dest.exists():
                print(f"miss {name}")
                failures.append(name)
                continue
            try:
                png = refine_i2i(dest.read_bytes(), name)
                png = strip_chroma(png)
                dest.write_bytes(png)
                print(f"ok   {dest.relative_to(ROOT)}", flush=True)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)
            continue
        if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
            print(f"skip {dest.relative_to(ROOT)}")
            continue
        if args.placeholders_only:
            placeholder(name, dest)
            print(f"ph   {dest.relative_to(ROOT)}")
            continue
        try:
            generate_image(prompt, dest, size, do_strip)
            if do_strip:
                try:
                    from PIL import Image
                    import io

                    im = Image.open(io.BytesIO(dest.read_bytes()))
                    bands = im.get_flattened_data() if hasattr(im, "get_flattened_data") else None
                    has_a = im.mode == "RGBA"
                    print(f"     alpha={'yes' if has_a else 'NO'}", flush=True)
                except Exception:
                    pass
        except Exception as exc:
            failures.append(f"{dest}: {exc}")
            print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)
            placeholder(name, dest)
            print(f"ph   {dest.relative_to(ROOT)} (fallback)")

    if args.dry_run:
        return 0
    if failures:
        print("failures:", len(failures))
        for line in failures:
            print(" -", line)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

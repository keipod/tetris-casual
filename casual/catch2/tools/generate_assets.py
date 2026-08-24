#!/usr/bin/env python3
"""Bake catch2 tiles, buildings, NPC, photoreal-face trainers via airouter."""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
I2I_MODEL = "i2i_qwen_image_edit_2509_v1"

MALE_REF = REPO / "assets/characters/male.jpg"
FEMALE_REF = REPO / "assets/characters/female.jpg"

# Pure t2i assets (no face identity required).
T2I_IMAGES: dict[str, tuple[str, str | bool | None, str]] = {
    "tiles/house-cottage.png": (
        "768x768",
        "dark",
        "top-down RPG cottage house sprite, warm cream plaster walls, red clay roof tiles, "
        "wooden door centered bottom, two windows, chimney, cute pokemon village style, "
        "full building in frame with small ground shadow, plain pure black background, no text, no people",
    ),
    "tiles/house-blue.png": (
        "768x768",
        "dark",
        "top-down RPG village house sprite, soft blue wooden walls, dark slate roof, "
        "flower boxes under windows, wooden door bottom center, cute 16-bit inspired but painted, "
        "plain pure black background, no text, no people",
    ),
    "tiles/house-inn.png": (
        "768x768",
        "dark",
        "top-down RPG inn building sprite, wider two-story look, warm timber beams, "
        "orange roof, hanging lantern, door bottom center, pokemon town aesthetic, "
        "plain pure black background, no text, no people",
    ),
    "tiles/shop-building.png": (
        "768x768",
        "dark",
        "top-down RPG pokemon mart shop building sprite, yellow awning with shop feel, "
        "big display window, wooden counter visible through door, warm brick walls, "
        "door bottom center, plain pure black background, no text letters, no people",
    ),
    "tiles/roof-detail.png": (
        "512x512",
        False,
        "seamless top-down pixel-painted clay roof tile texture, warm terracotta, "
        "RPG tileset, fill frame, no characters, no text",
    ),
    "characters/shopkeep.png": (
        "512x512",
        "dark",
        "16-bit pixel art RPG shopkeeper NPC, FULL BODY visible head to feet, "
        "cute chibi merchant middle-aged man, brown apron over green vest, "
        "holding a small pouch, front-facing idle pose, classic Game Boy Advance style pixel sprite, "
        "crisp pixels, plain pure black background, no text, no photo, no realism",
    ),
}

FACE_KEEP = (
    "CRITICAL: keep the EXACT same photorealistic real human face from the reference photo, "
    "same identity, same skin, same eyes, same hair — do NOT cartoonize or redraw the face. "
    "Body and clothes may be slightly stylized game-character rendering. "
)

# i2i from male/female refs — face must stay photoreal.
I2I_TRAINERS: dict[str, tuple[Path, str, str]] = {
    "characters/male-overworld.png": (
        MALE_REF,
        "512x512",
        FACE_KEEP
        + "full body front three-quarter pokemon trainer sprite, blue vest yellow buttons, "
        "holding pokeball, plain pure black background, no text",
    ),
    "characters/male-down.png": (
        MALE_REF,
        "512x512",
        FACE_KEEP
        + "same boy full body facing camera idle overworld sprite, blue vest, "
        "plain pure black background, no text",
    ),
    "characters/male-side.png": (
        MALE_REF,
        "512x512",
        FACE_KEEP
        + "same boy full body facing RIGHT profile three-quarter overworld sprite, "
        "blue vest visible, plain pure black background, no text",
    ),
    "characters/male-up.png": (
        MALE_REF,
        "512x512",
        FACE_KEEP
        + "same boy full body facing AWAY from camera back view overworld sprite, "
        "short black hair from behind, blue vest, plain pure black background, no text",
    ),
    "characters/male-back.png": (
        MALE_REF,
        "512x512",
        FACE_KEEP
        + "same boy battle back view looking toward battlefield, blue vest, "
        "plain pure black background, no text",
    ),
    "characters/female-overworld.png": (
        FEMALE_REF,
        "512x512",
        FACE_KEEP
        + "full body front three-quarter pokemon trainer girl sprite, twin braid pigtails, "
        "blue vest yellow buttons, holding pokeball, plain pure black background, no text",
    ),
    "characters/female-down.png": (
        FEMALE_REF,
        "512x512",
        FACE_KEEP
        + "same girl full body facing camera idle overworld sprite, twin braids, blue vest, "
        "plain pure black background, no text",
    ),
    "characters/female-side.png": (
        FEMALE_REF,
        "512x512",
        FACE_KEEP
        + "same girl full body facing RIGHT profile three-quarter overworld sprite, "
        "twin braids, blue vest, plain pure black background, no text",
    ),
    "characters/female-up.png": (
        FEMALE_REF,
        "512x512",
        FACE_KEEP
        + "same girl full body facing AWAY back view overworld sprite, twin braids from behind, "
        "blue vest, plain pure black background, no text",
    ),
    "characters/female-back.png": (
        FEMALE_REF,
        "512x512",
        FACE_KEEP
        + "same girl battle back view looking toward battlefield, twin braids, blue vest, "
        "plain pure black background, no text",
    ),
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 360) -> bytes:
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


def punch_white_jpg(src: Path, dest: Path, size: int = 512) -> None:
    """Use reference photo directly (already photoreal face) with white bg removed."""
    from PIL import Image

    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src).convert("RGBA")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - img.width) // 2
    oy = (size - img.height) // 2
    canvas.paste(img, (ox, oy), img)
    px = canvas.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if lum > 245 and spread < 20:
                px[x, y] = (r, g, b, 0)
            elif lum > 230 and spread < 28:
                px[x, y] = (r, g, b, int(a * 0.25))
    canvas.save(dest, format="PNG")
    print(f"ref  {dest.relative_to(ROOT)}", flush=True)


def generate_t2i(prompt: str, dest: Path, size: str, strip_mode: str | bool | None) -> None:
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
    png = strip_png(base64.b64decode(data["data"][0]["b64_json"]), strip_mode)
    dest.write_bytes(png)


def _data_uri(path: Path) -> str:
    raw = path.read_bytes()
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def generate_i2i(prompt: str, image_path: Path, dest: Path, strip_mode: str | bool | None = "dark") -> None:
    """ComfyUI Qwen image-edit job — preserves photoreal face from reference."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "task": "image.generate",
        "input": {
            "workflow_name": I2I_MODEL,
            "params": {
                "prompt": prompt,
                "image": _data_uri(image_path),
                "enable_lightning_lora": True,
                "filename_prefix": dest.stem,
            },
            "options": {"free_after": True},
        },
    }
    print(f"i2i  {dest.relative_to(ROOT)}", flush=True)
    raw = _request(
        "POST",
        f"{AIROUTER}/v1/enqueue",
        json.dumps(body).encode(),
        {"Content-Type": "application/json"},
        timeout=60,
    )
    job_id = json.loads(raw)["id"]
    deadline = time.time() + 420
    while time.time() < deadline:
        st = json.loads(_request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30))
        state = st.get("state") or st.get("status")
        if state in ("done", "succeeded", "completed"):
            art = _request("GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=120)
            dest.write_bytes(strip_png(art, strip_mode))
            return
        if state in ("failed", "error", "cancelled"):
            raise RuntimeError(f"i2i job failed: {st}")
        time.sleep(1.5)
    raise RuntimeError(f"i2i timeout job={job_id}")


def build_walk_sheet(gender: str) -> None:
    """Assemble 4x4 walk sheet from directional stills (face-preserving)."""
    from PIL import Image

    faces = ["down", "left", "right", "up"]
    # left = flip of side; right = side
    paths = {
        "down": ROOT / f"assets/characters/{gender}-down.png",
        "up": ROOT / f"assets/characters/{gender}-up.png",
        "right": ROOT / f"assets/characters/{gender}-side.png",
    }
    for p in paths.values():
        if not p.exists():
            print(f"skip walk sheet — missing {p.name}", flush=True)
            return
    cell = 256
    sheet = Image.new("RGBA", (cell * 4, cell * 4), (0, 0, 0, 0))
    for row, face in enumerate(faces):
        if face == "left":
            base = Image.open(paths["right"]).convert("RGBA").transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        else:
            key = "right" if face == "right" else face
            base = Image.open(paths[key]).convert("RGBA")
        base.thumbnail((cell - 8, cell - 8), Image.Resampling.LANCZOS)
        for col in range(4):
            frame = base.copy()
            # subtle bob / step offset so sheet isn't static
            bob = (0, -2, 0, 2)[col]
            lean = (0, 2, 0, -2)[col] if face in ("left", "right") else 0
            canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            ox = (cell - frame.width) // 2 + lean
            oy = (cell - frame.height) // 2 + bob
            canvas.paste(frame, (ox, oy), frame)
            sheet.paste(canvas, (col * cell, row * cell), canvas)
    dest = ROOT / f"assets/characters/{gender}-walk.png"
    sheet.save(dest)
    print(f"sheet {dest.relative_to(ROOT)}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="subset of relative asset paths")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--skip-trainers", action="store_true")
    ap.add_argument("--skip-t2i", action="store_true")
    args = ap.parse_args()
    only = set(args.only or [])
    print(f"refs male={MALE_REF.exists()} female={FEMALE_REF.exists()}", flush=True)

    if not args.skip_t2i:
        for rel, (size, strip, prompt) in T2I_IMAGES.items():
            if only and rel not in only:
                continue
            dest = ROOT / "assets" / rel
            if dest.exists() and not args.force:
                print(f"skip {rel}", flush=True)
                continue
            try:
                generate_t2i(prompt, dest, size, strip)
            except Exception as exc:
                print(f"FAIL {rel}: {exc}", file=sys.stderr)
                return 1

    if not args.skip_trainers:
        # Always punch refs into overworld as photoreal baseline (fast, exact face).
        for gender, ref in (("male", MALE_REF), ("female", FEMALE_REF)):
            rel = f"characters/{gender}-overworld.png"
            if only and rel not in only and only:
                pass
            else:
                dest = ROOT / "assets" / rel
        if (not dest.exists() or args.force) and ref.exists():
                    punch_white_jpg(ref, dest)
                    # front idle uses same photoreal plate
                    down = ROOT / "assets" / f"characters/{gender}-down.png"
                    down.write_bytes(dest.read_bytes())
                    print(f"copy {down.relative_to(ROOT)}", flush=True)

        for rel, (ref, _size, prompt) in I2I_TRAINERS.items():
            if only and rel not in only:
                continue
            if "overworld" in rel:
                # already handled by punch — optional i2i polish
                continue
            dest = ROOT / "assets" / rel
            if dest.exists() and not args.force:
                print(f"skip {rel}", flush=True)
                continue
            if not ref.exists():
                print(f"FAIL {rel}: missing ref {ref}", file=sys.stderr)
                return 1
            try:
                generate_i2i(prompt, ref, dest, "dark")
            except Exception as exc:
                print(f"FAIL {rel}: {exc}", file=sys.stderr)
                return 1

        if not only or any("walk" in x for x in only):
            build_walk_sheet("male")
            build_walk_sheet("female")

    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

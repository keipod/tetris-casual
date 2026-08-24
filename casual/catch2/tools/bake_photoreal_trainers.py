#!/usr/bin/env python3
"""Bake fully photoreal, consistent trainer (+ shop NPC) sprites via airouter.

Uses ComfyUI ``i2i_multiple_character_angles_v1`` (8 camera angles, zip artifact)
from male.jpg / female.jpg, then BiRefNet background removal, then maps angles
into overworld / facing / walk-sheet assets so every frame shares one identity.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import time
import zipfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
AIROUTER = "http://192.168.223.101:20101"

ANGLES_WF = "i2i_multiple_character_angles_v1"
BG_WF = "i2ij_birefnet_remove_background_v1"
EDIT_WF = "i2i_qwen_image_edit_2509_v1"
T2I_WF = "t2i_z_image_turbo_v1"

MALE_REF = REPO / "assets/characters/male.jpg"
FEMALE_REF = REPO / "assets/characters/female.jpg"

# output_nodes order in i2i_multiple_character_angles_v1
ANGLE_NAMES = [
    "close_up",      # 0
    "rot_45_right",  # 1
    "aerial",        # 2
    "low_angle",     # 3
    "wide",          # 4 — full-body front-ish
    "rot_90_right",  # 5
    "rot_90_left",   # 6
    "rot_45_left",   # 7
]


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 420) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:600]!r}") from exc


def _data_uri(path: Path) -> str:
    raw = path.read_bytes()
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def enqueue_and_wait(workflow_name: str, params: dict, timeout_s: float = 600) -> bytes:
    body = {
        "task": "image.generate",
        "input": {
            "workflow_name": workflow_name,
            "params": params,
            "options": {"free_after": True},
        },
    }
    raw = _request(
        "POST",
        f"{AIROUTER}/v1/enqueue",
        json.dumps(body).encode(),
        {"Content-Type": "application/json"},
        timeout=60,
    )
    job_id = json.loads(raw)["id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = json.loads(_request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30))
        state = (st.get("state") or st.get("status") or "").lower()
        if state in ("done", "succeeded", "completed", "success"):
            return _request("GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=180)
        if state in ("failed", "error", "cancelled"):
            raise RuntimeError(f"{workflow_name} failed: {json.dumps(st)[:500]}")
        time.sleep(2)
    raise TimeoutError(f"{workflow_name} timed out job={job_id}")


def fit_square_rgba(png: bytes, size: int = 512) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(png)).convert("RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    # 90° LoRA angles sometimes land sideways — prefer taller subject
    if img.width > img.height * 1.15:
        cands = [img, img.rotate(90, expand=True), img.rotate(-90, expand=True)]

        def subject_h(im: Image.Image) -> int:
            b = im.getbbox()
            return (b[3] - b[1]) if b else 0

        img = max(cands, key=subject_h)
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.thumbnail((size - 16, size - 16), Image.Resampling.LANCZOS)
    ox = (size - img.width) // 2
    oy = size - img.height - 8  # feet near bottom (overworld)
    canvas.paste(img, (ox, oy), img)
    out = io.BytesIO()
    canvas.save(out, format="PNG")
    return out.getvalue()


def remove_bg(png_or_path: bytes | Path) -> bytes:
    if isinstance(png_or_path, Path):
        uri = _data_uri(png_or_path)
    else:
        uri = "data:image/png;base64," + base64.b64encode(png_or_path).decode()
    print("  birefnet bg", flush=True)
    art = enqueue_and_wait(BG_WF, {"image": uri}, timeout_s=300)
    # birefnet returns png with alpha already
    return art


def punch_white_local(src: Path) -> bytes:
    from PIL import Image

    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if lum > 245 and spread < 22:
                px[x, y] = (r, g, b, 0)
            elif lum > 228 and spread < 30:
                px[x, y] = (r, g, b, int(a * 0.2))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def extract_angle_zip(zip_bytes: bytes, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = sorted(n for n in zf.namelist() if n.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
        if len(names) < 8:
            # fallback: unsorted all images
            names = [n for n in zf.namelist() if not n.endswith("/")]
        print(f"  zip members ({len(names)}): {names}", flush=True)
        for i, name in enumerate(names[:8]):
            label = ANGLE_NAMES[i] if i < len(ANGLE_NAMES) else f"angle_{i}"
            out = dest_dir / f"{i:02d}_{label}.png"
            data = zf.read(name)
            # normalize to png
            from PIL import Image

            img = Image.open(io.BytesIO(data)).convert("RGBA")
            img.save(out)
            paths.append(out)
    return paths


def run_angles(ref: Path, work: Path) -> list[Path]:
    print(f"angles {ref.name}", flush=True)
    # Prefer punched PNG as input so model sees subject clearly
    punched = work / "ref_punched.png"
    punched.write_bytes(punch_white_local(ref))
    zip_bytes = enqueue_and_wait(
        ANGLES_WF,
        {"image": _data_uri(punched), "enable_lightning_lora": True},
        timeout_s=900,
    )
    # detect zip vs single image
    if zip_bytes[:2] == b"PK":
        return extract_angle_zip(zip_bytes, work / "angles")
    # unexpected single image
    one = work / "angles" / "00_only.png"
    one.parent.mkdir(parents=True, exist_ok=True)
    one.write_bytes(zip_bytes)
    return [one]


def make_back_view(ref_png: Path, dest: Path) -> None:
    prompt = (
        "Rotate the character to show a clear FULL BODY BACK VIEW facing away from camera. "
        "Keep the EXACT same photorealistic person identity, hair, clothes and proportions. "
        "Plain pure black background, no text, no watermark, game character sprite framing."
    )
    print(f"back  {dest.name}", flush=True)
    art = enqueue_and_wait(
        EDIT_WF,
        {
            "prompt": prompt,
            "image": _data_uri(ref_png),
            "enable_lightning_lora": True,
            "filename_prefix": dest.stem,
        },
        timeout_s=420,
    )
    cleaned = remove_bg(art)
    dest.write_bytes(fit_square_rgba(cleaned, 512))


def save_fitted(src: Path | bytes, dest: Path, size: int = 512) -> None:
    raw = src.read_bytes() if isinstance(src, Path) else src
    cleaned = remove_bg(raw)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(fit_square_rgba(cleaned, size))
    print(f"save  {dest.relative_to(ROOT)}", flush=True)


def build_walk_sheet(gender: str, extras: dict[str, Path]) -> None:
    """4x4 sheet from photoreal directionals + 45° extras for step variety."""
    from PIL import Image

    down = ROOT / f"assets/characters/{gender}-down.png"
    up = ROOT / f"assets/characters/{gender}-up.png"
    right = ROOT / f"assets/characters/{gender}-side.png"
    left_src = extras.get("left") or right
    right_45 = extras.get("right_45")
    left_45 = extras.get("left_45")

    def load(p: Path) -> Image.Image:
        return Image.open(p).convert("RGBA")

    rows = {
        "down": [down, down, down, down],
        "left": [left_src, left_45 or left_src, left_src, left_45 or left_src],
        "right": [right, right_45 or right, right, right_45 or right],
        "up": [up, up, up, up],
    }
    cell = 256
    sheet = Image.new("RGBA", (cell * 4, cell * 4), (0, 0, 0, 0))
    for r, face in enumerate(["down", "left", "right", "up"]):
        for c in range(4):
            src_path = rows[face][c]
            if face == "left" and src_path == right and "left" not in extras:
                base = load(right).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            else:
                base = load(src_path)
                if face == "left" and src_path == right:
                    base = base.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            base.thumbnail((cell - 10, cell - 10), Image.Resampling.LANCZOS)
            bob = (0, -3, 0, 3)[c]
            lean = (0, 3, 0, -3)[c] if face in ("left", "right") else 0
            canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            ox = (cell - base.width) // 2 + lean
            oy = (cell - base.height) // 2 + bob
            canvas.paste(base, (ox, oy), base)
            sheet.paste(canvas, (c * cell, r * cell), canvas)
    dest = ROOT / f"assets/characters/{gender}-walk.png"
    sheet.save(dest)
    print(f"sheet {dest.relative_to(ROOT)}", flush=True)


def bake_gender(gender: str, ref: Path, force: bool) -> None:
    work = ROOT / "assets" / "characters" / "_work" / gender
    work.mkdir(parents=True, exist_ok=True)
    out = {
        "overworld": ROOT / f"assets/characters/{gender}-overworld.png",
        "down": ROOT / f"assets/characters/{gender}-down.png",
        "side": ROOT / f"assets/characters/{gender}-side.png",
        "up": ROOT / f"assets/characters/{gender}-up.png",
        "back": ROOT / f"assets/characters/{gender}-back.png",
    }
    if not force and all(p.exists() for p in out.values()):
        print(f"skip {gender} (exists)", flush=True)
        return
    if not ref.exists():
        raise FileNotFoundError(ref)

    angles = run_angles(ref, work)
    # map: front=wide(4) else low(3) else 0
    def pick(*idxs: int) -> Path:
        for i in idxs:
            if i < len(angles):
                return angles[i]
        return angles[0]

    front = pick(4, 3, 0)
    # 90° angles often come out sideways with this LoRA — prefer 45° upright profiles
    side_r = pick(1, 5)
    side_l = pick(7, 6)
    a45_r = pick(1, 5)
    a45_l = pick(7, 6)

    save_fitted(front, out["overworld"])
    save_fitted(front, out["down"])
    save_fitted(side_r, out["side"])

    # true back view from front plate
    make_back_view(out["down"], out["up"])
    # battle back = same as up for consistency
    out["back"].write_bytes(out["up"].read_bytes())
    print(f"copy {out['back'].relative_to(ROOT)}", flush=True)

    # extras for walk sheet (bg-removed fitted)
    extra_dir = work / "extras"
    extra_dir.mkdir(exist_ok=True)
    left_p = extra_dir / "left.png"
    r45_p = extra_dir / "r45.png"
    l45_p = extra_dir / "l45.png"
    save_fitted(side_l, left_p)
    save_fitted(a45_r, r45_p)
    save_fitted(a45_l, l45_p)

    build_walk_sheet(gender, {"left": left_p, "right_45": r45_p, "left_45": l45_p})


def bake_shopkeep(force: bool) -> None:
    dest = ROOT / "assets/characters/shopkeep.png"
    if dest.exists() and not force:
        print("skip shopkeep", flush=True)
        return
    prompt = (
        "photorealistic full body portrait of a friendly East Asian male shopkeeper age ~40, "
        "warm smile, short black hair, brown merchant apron over blue shirt, holding a small coin pouch, "
        "standing facing camera, soft daylight, plain pure black background, no text, no watermark, "
        "same realism as a reference photo, game sprite framing"
    )
    print("t2i  shopkeep photoreal", flush=True)
    payload = {
        "model": T2I_WF,
        "prompt": prompt,
        "size": "512x512",
        "response_format": "b64_json",
        "params": {"width": 512, "height": 512},
    }
    raw = _request(
        "POST",
        f"{AIROUTER}/v1/images/generations",
        json.dumps(payload).encode(),
        {"Content-Type": "application/json"},
    )
    png = base64.b64decode(json.loads(raw)["data"][0]["b64_json"])
    cleaned = remove_bg(png)
    dest.write_bytes(fit_square_rgba(cleaned, 512))
    print(f"save  {dest.relative_to(ROOT)}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--skip-shopkeep", action="store_true")
    ap.add_argument("--only-gender", choices=["male", "female"])
    args = ap.parse_args()
    print(f"refs male={MALE_REF.exists()} female={FEMALE_REF.exists()}", flush=True)
    try:
        if args.only_gender != "female":
            bake_gender("male", MALE_REF, args.force)
        if args.only_gender != "male":
            bake_gender("female", FEMALE_REF, args.force)
        if not args.skip_shopkeep:
            bake_shopkeep(args.force)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

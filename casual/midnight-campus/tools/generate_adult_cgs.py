#!/usr/bin/env python3
"""Bake Midnight Campus 19+ CGs via airouter (i2i + BiRefNet rembg).

Usage:
  python3 casual/midnight-campus/tools/generate_adult_cgs.py
  python3 casual/midnight-campus/tools/generate_adult_cgs.py --portraits-only
  python3 casual/midnight-campus/tools/generate_adult_cgs.py --only gaeun_seduce soyul_sex
  python3 casual/midnight-campus/tools/generate_adult_cgs.py --force
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

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
T2I_MODEL = "t2i_z_image_turbo_v1"
I2I_WF = "i2i_qwen_image_edit_2509_v1"
BG_WF = "i2ij_birefnet_remove_background_v1"

KEEP = (
    "Keep this exact woman's unique face, hair, eyes, glasses if present, skin, and identity. "
    "She is a fully adult woman clearly 21 years old or older with a mature face — not a child, not a teenager. "
    "Keep the same art style. Isolated character (or couple) cutout, plain solid light-gray studio background, "
    "no furniture, no room, no text, no watermark. Change only clothing, pose, and framing as described: "
)

HEROINES: dict[str, dict] = {
    "gaeun": {
        "age": 21,
        "style": "photoreal photograph-like adult portrait",
        "desc": (
            "21-year-old Korean woman, long straight black hair, thin black-rimmed glasses, "
            "gentle shy adult face, pale skin, university literature student"
        ),
    },
    "soyul": {
        "age": 22,
        "style": "anime visual novel illustration, clean cel shading",
        "desc": (
            "22-year-old athletic Korean anime woman, dark brown ponytail with orange hair tie, "
            "brown eyes, sporty confident adult face"
        ),
    },
    "yuha": {
        "age": 21,
        "style": "photoreal photograph-like adult portrait",
        "desc": (
            "21-year-old Korean art student, messy brown bun with tiny paint flecks in hair, "
            "playful adult face, oversized denim shirt normally"
        ),
    },
    "sieun": {
        "age": 23,
        "style": "photoreal photograph-like adult portrait",
        "desc": (
            "23-year-old Korean graduate student, long dark brown hair, calm mature elegant face, "
            "usually a navy cardigan over a white shirt"
        ),
    },
    "chaerin": {
        "age": 21,
        "style": "photoreal photograph-like adult portrait",
        "desc": (
            "21-year-old Korean woman, sharp dark brown bob with bangs, cool half-smile, "
            "usually a navy blazer with red trim"
        ),
    },
    "reina": {
        "age": 22,
        "style": "photoreal photograph-like adult portrait",
        "desc": (
            "22-year-old mixed-heritage woman, long wavy chestnut auburn hair, warm inviting adult smile, "
            "usually a gold knit sweater"
        ),
    },
}

POSES: dict[str, str] = {
    "seduce": (
        "seductive adult pin-up, she unbuttons her clothes, black lace lingerie visible, "
        "cleavage, flushed cheeks, bedroom eyes, biting her lip, waist-up, inviting the viewer"
    ),
    "nude": (
        "erotic nude waist-up portrait of the same adult woman, fully topless, bare breasts and nipples visible, "
        "confident adult sexuality, no clothes, looking at the viewer"
    ),
    "oral": (
        "explicit adult oral sex: the same woman on her knees performing fellatio on an adult man, "
        "her face clearly visible in profile-three-quarter, lips around his penis, saliva, flushed, erotic"
    ),
    "sex": (
        "explicit consensual vaginal sex: the same adult woman straddling an adult man, breasts bare, "
        "penetration visible, pleasured flushed face, mid-shot couple, erotic visual-novel CG"
    ),
    "rough": (
        "rough adult erotic scene: the same adult woman pinned to a wall by an adult man, clothes ripped open, "
        "breasts exposed, one wrist held above her head, intense expression, rough sex, dark erotic roleplay between adults"
    ),
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 420) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:700]!r}") from exc


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
    print(f"     job {job_id}  {workflow_name}", flush=True)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = json.loads(_request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30))
        state = (st.get("state") or st.get("status") or "").lower()
        if state in ("done", "succeeded", "completed", "success"):
            return _request("GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=180)
        if state in ("failed", "error", "cancelled"):
            raise RuntimeError(f"{workflow_name} failed: {json.dumps(st)[:700]}")
        time.sleep(2)
    raise TimeoutError(f"{workflow_name} timed out job={job_id}")


def _data_uri(png: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(png).decode()}"


def rembg(png: bytes) -> bytes:
    print("     birefnet", flush=True)
    art = enqueue_and_wait(BG_WF, {"image": _data_uri(png)}, timeout_s=360)
    return punch_and_fit(art)


def punch_and_fit(png: bytes, canvas: tuple[int, int] = (768, 1024), bottom: bool = True) -> bytes:
    try:
        from PIL import Image, ImageFilter
    except ImportError:
        return png

    img = Image.open(io.BytesIO(png)).convert("RGBA")
    px = img.load()
    w, h = img.size

    def is_studio(r: int, g: int, b: int) -> bool:
        lum = (r + g + b) / 3
        spread = max(r, g, b) - min(r, g, b)
        if lum > 232 and spread < 28:
            return True
        if lum < 18 and spread < 14:
            return True
        return False

    # Flood-fill leftover studio from edges, then a global pass
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
        r, g, b, a = px[x, y]
        if a == 0:
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
            continue
        if not is_studio(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if lum > 246 and spread < 16:
                px[x, y] = (r, g, b, 0)

    alpha = img.split()[3]
    # slight erode of 1px fringe
    img.putalpha(alpha.filter(ImageFilter.MinFilter(3)))

    bbox = img.getbbox()
    if not bbox:
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    pad = 12
    x0, y0, x1, y1 = bbox
    img = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))

    cw, ch = canvas
    img.thumbnail((int(cw * 0.94), int(ch * 0.96)), Image.Resampling.LANCZOS)
    board = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ox = (cw - img.width) // 2
    oy = (ch - img.height - 10) if bottom else (ch - img.height) // 2
    board.paste(img, (ox, max(0, oy)), img)
    out = io.BytesIO()
    board.save(out, format="PNG", optimize=True)
    return out.getvalue()


def generate_t2i(prompt: str, size: str = "768x1024") -> bytes:
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
    print("     t2i", flush=True)
    raw = _request(
        "POST",
        f"{AIROUTER}/v1/images/generations",
        payload,
        {"Content-Type": "application/json"},
        timeout=420,
    )
    data = json.loads(raw)
    return base64.b64decode(data["data"][0]["b64_json"])


def generate_i2i(prompt: str, src_png: bytes) -> bytes:
    print("     i2i", flush=True)
    return enqueue_and_wait(
        I2I_WF,
        {
            "prompt": prompt,
            "image": _data_uri(src_png),
            "enable_lightning_lora": True,
            "filename_prefix": "mc-cg",
        },
        timeout_s=480,
    )


def strip_portraits(force: bool) -> None:
    raw_dir = ROOT / "assets" / "portraits" / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for hid in HEROINES:
        src = ROOT / "assets" / "portraits" / f"{hid}.png"
        if not src.exists():
            print(f"MISS portrait {hid}", flush=True)
            continue
        bak = raw_dir / f"{hid}.png"
        if not bak.exists():
            bak.write_bytes(src.read_bytes())
            print(f"bak  portraits/_raw/{hid}.png", flush=True)
        marker = ROOT / "assets" / "portraits" / f".{hid}.rembg"
        if marker.exists() and not force:
            print(f"skip portraits/{hid}.png (already rembg)", flush=True)
            continue
        print(f"rembg portraits/{hid}.png", flush=True)
        png = rembg(bak.read_bytes() if bak.exists() else src.read_bytes())
        src.write_bytes(png)
        marker.write_text("ok\n")
        print(f"ok   portraits/{hid}.png ({src.stat().st_size} bytes)", flush=True)


def pose_prompt(hid: str, pose: str) -> str:
    h = HEROINES[hid]
    return (
        f"{KEEP} {POSES[pose]}. "
        f"Art style: {h['style']}. Subject: {h['desc']}, age {h['age']}, adult 21+. "
        "Explicit 19+ erotic visual-novel character sprite."
    )


def t2i_prompt(hid: str, pose: str) -> str:
    h = HEROINES[hid]
    return (
        f"{h['style']}, explicit 19+ erotic visual-novel CG, isolated subject on plain light-gray studio background, "
        f"{h['desc']}, fully adult {h['age']}-year-old woman, mature face, {POSES[pose]}, "
        "no text, no watermark, no child, no underage"
    )


def bake_cg(hid: str, pose: str, force: bool) -> None:
    dest = ROOT / "assets" / "cg" / f"{hid}_{pose}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        print(f"skip cg/{dest.name}", flush=True)
        return
    ref = ROOT / "assets" / "portraits" / "_raw" / f"{hid}.png"
    if not ref.exists():
        ref = ROOT / "assets" / "portraits" / f"{hid}.png"
    print(f"cg   {dest.relative_to(ROOT)}", flush=True)
    src = ref.read_bytes()
    try:
        raw = generate_i2i(pose_prompt(hid, pose), src)
    except Exception as exc:
        print(f"     i2i fail ({exc}); t2i fallback", flush=True)
        raw = generate_t2i(t2i_prompt(hid, pose))
    png = rembg(raw)
    dest.write_bytes(png)
    print(f"ok   {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--portraits-only", action="store_true")
    ap.add_argument("--cg-only", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    only = set(args.only or [])

    if not args.cg_only:
        strip_portraits(args.force)
        if args.portraits_only:
            print("done portraits", flush=True)
            return 0

    jobs = [(hid, pose) for hid in HEROINES for pose in POSES]
    if only:
        jobs = [(h, p) for (h, p) in jobs if f"{h}_{p}" in only or h in only or p in only]
    fails = 0
    for hid, pose in jobs:
        try:
            bake_cg(hid, pose, args.force)
        except Exception as exc:
            fails += 1
            print(f"FAIL {hid}_{pose}: {exc}", file=sys.stderr, flush=True)
    print(f"done  fails={fails}", flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())

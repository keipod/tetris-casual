#!/usr/bin/env python3
"""Bake volleyball court, sprites, BGM, and SFX via airouter.

Images: local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`).
SFX: local `/v1/audio/speech` (`tts-auto`).
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
MUSIC_MODEL = "t2a_ace_step1_5_xl_turbo_v1"

STICKER = (
    "square game sprite sticker, centered subject filling the frame, "
    "kawaii cute, pastel, crisp edges, plain pure white background, "
    "no text, no watermark, no drop shadow, no floor, no extra objects"
)

IMAGES = {
    "beach.png": (
        "768x512",
        False,
        "STRICT 2D side-view platformer stage, camera at ground height looking sideways, "
        "beach volleyball, TOP half is pastel sky with sun and clouds, MIDDLE is a thin "
        "turquoise ocean strip, BOTTOM is warm sand, wooden net posts, no 3d perspective, "
        "no vanishing point, no top-down court, no characters, no text, no letters",
    ),
    "you-idle.png": (
        "512x512",
        True,
        f"{STICKER}, cute yellow electric mouse standing in side view facing right, "
        "red round cheeks, zigzag lightning tail, big ears, chibi, full body",
    ),
    "you-jump.png": (
        "512x512",
        True,
        f"{STICKER}, cute yellow electric mouse jumping in side view facing right, "
        "red round cheeks, zigzag lightning tail, arms up, chibi, full body",
    ),
    "cpu-idle.png": (
        "512x512",
        True,
        f"{STICKER}, cute blue turtle standing in side view facing right, "
        "cream belly, round shell, chibi, full body",
    ),
    "cpu-jump.png": (
        "512x512",
        True,
        f"{STICKER}, cute blue turtle jumping in side view facing right, "
        "cream belly, round shell, arms out, chibi, full body",
    ),
    "ball.png": (
        "512x512",
        True,
        f"{STICKER}, cute pastel volleyball, yellow and cream panels, round, "
        "simple, game ball icon",
    ),
}

SFX = {
    "hit": "pika",
    "jump": "hop",
    "point": "ding",
    "win": "yay",
    "lose": "oh",
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 330) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} -> {exc.code}: {err[:400]!r}") from exc


def strip_white(png: bytes) -> bytes:
    try:
        from PIL import Image
        import io
        from collections import deque
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png)).convert("RGBA")
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
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


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
        png = strip_white(png)
    dest.write_bytes(png)
    print(f"     {dest.stat().st_size} bytes", flush=True)


def generate_speech(text: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "model": "tts-auto",
            "input": text,
            "voice": "default",
            "response_format": "mp3",
        }
    ).encode()
    print(f"tts  {dest.relative_to(ROOT)}", flush=True)
    _, raw, ctype = _request(
        "POST",
        f"{AIROUTER}/v1/audio/speech",
        payload,
        {"Content-Type": "application/json"},
    )
    dest.write_bytes(raw)
    if dest.stat().st_size < 200:
        raise RuntimeError(f"tiny TTS payload for {dest} ctype={ctype}")


def generate_bgm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "task": "audio.generate",
            "input": {
                "workflow_name": MUSIC_MODEL,
                "params": {
                    "prompt": (
                        "cute pastel beach volleyball game bgm, light acoustic guitar, "
                        "soft chiptune bells, sunny summer, looping instrumental, no vocals"
                    ),
                    "lyrics": "Instrumental",
                    "duration": 16,
                    "bpm": 108,
                    "keyscale": "G major",
                    "timesignature": "4",
                    "language": "en",
                },
                "options": {"free_after": True},
            },
            "priority": 100,
        }
    ).encode()
    print("music enqueue ace-step", flush=True)
    _, raw, _ = _request(
        "POST",
        f"{AIROUTER}/v1/enqueue",
        payload,
        {
            "Content-Type": "application/json",
            "Idempotency-Key": "volleyball-ace-bgm-v1",
        },
        timeout=60,
    )
    job_id = json.loads(raw)["id"]
    deadline = time.time() + 900
    while time.time() < deadline:
        _, st_raw, _ = _request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30)
        st = json.loads(st_raw)
        state = (st.get("state") or st.get("status") or "").lower()
        print(f"music {state}", flush=True)
        if state in {"completed", "succeeded", "success", "done"}:
            _, audio, _ = _request(
                "GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=120
            )
            dest.write_bytes(audio)
            return
        if state in {"failed", "error"}:
            raise RuntimeError(st_raw.decode()[:400])
        time.sleep(4)
    raise TimeoutError("music generation timed out")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--images-only", action="store_true")
    parser.add_argument("--audio-only", action="store_true")
    args = parser.parse_args()
    failures: list[str] = []

    if not args.audio_only:
        for name, (size, do_strip, prompt) in IMAGES.items():
            dest = ROOT / "assets" / name
            if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                print(f"skip {dest.relative_to(ROOT)}")
                continue
            try:
                generate_image(prompt, dest, size, do_strip)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)

    if not args.images_only:
        bgm = ROOT / "assets" / "audio" / "bgm.mp3"
        if not (args.skip_existing and bgm.exists() and bgm.stat().st_size > 1000):
            try:
                generate_bgm(bgm)
            except Exception as exc:
                failures.append(f"bgm: {exc}")
                print(f"FAIL bgm: {exc}", file=sys.stderr)
        for name, spoken in SFX.items():
            dest = ROOT / "assets" / "audio" / f"{name}.mp3"
            if args.skip_existing and dest.exists() and dest.stat().st_size > 200:
                print(f"skip {dest.relative_to(ROOT)}")
                continue
            try:
                generate_speech(spoken, dest)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)

    if failures:
        print("failures:", len(failures))
        for line in failures:
            print(" -", line)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Bake lanes battlefield, forts, slot stickers, BGM, and SFX via airouter.

Images: local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`), with local loop fallback.
SFX: local `/v1/audio/speech` (`tts-auto`).
Battle units stay on PokeAPI at runtime.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
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
    "battlefield.png": (
        "768x512",
        False,
        "STRICT 2D side-view game background, camera at ground height looking sideways, "
        "sunny pokemon meadow battle lane, TOP half pastel sky with fluffy clouds, "
        "MIDDLE rolling green hills, BOTTOM dirt path strip and grass foreground, "
        "bubble terrain style, no characters, no castles, no UI, no text, fill frame",
    ),
    "fort-you.png": (
        "512x512",
        True,
        f"{STICKER}, pastel blue medieval castle gate side view facing right, "
        "cute rounded towers, cream stone, small blue flag, chibi fortress",
    ),
    "fort-them.png": (
        "512x512",
        True,
        f"{STICKER}, pastel coral red medieval castle gate side view facing left, "
        "cute rounded towers, cream stone, small red flag, chibi fortress",
    ),
    "spark.png": (
        "512x512",
        "dark",
        "square game VFX sticker, yellow white impact spark burst, comic hit star, "
        "plain pure black background, no text, no watermark",
    ),
    "coin.png": (
        "512x512",
        "dark",
        "square game icon sticker, shiny gold coin with star emblem, kawaii, "
        "plain pure black background, no text, no watermark",
    ),
    "slot-pidgey.png": (
        "512x512",
        True,
        f"{STICKER}, cute small brown bird pokemon-like chibi side view facing right, "
        "tiny wings, big eyes, full body",
    ),
    "slot-bulbasaur.png": (
        "512x512",
        True,
        f"{STICKER}, cute green bulb dinosaur pokemon-like chibi side view facing right, "
        "leaf on back, full body",
    ),
    "slot-charmander.png": (
        "512x512",
        True,
        f"{STICKER}, cute orange fire lizard pokemon-like chibi side view facing right, "
        "flame tail tip, full body",
    ),
    "slot-pikachu.png": (
        "512x512",
        True,
        f"{STICKER}, cute yellow electric mouse pokemon-like chibi side view facing right, "
        "red cheeks, lightning tail, full body",
    ),
}

SFX = {
    "spawn": "pop",
    "hit": "bonk",
    "win": "fanfare",
    "lose": "fail",
    "boss": "roar",
}

SLOT_KEYS = ("pidgey", "bulbasaur", "charmander", "pikachu")


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


def strip_png(png: bytes, mode: str | bool | None) -> bytes:
    if not mode:
        return png
    try:
        from PIL import Image
        import io
        from collections import deque
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    px = img.load()
    w, h = img.size
    kind = "white" if mode is True else str(mode)

    if kind == "white":
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
    else:
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                lum = (r + g + b) / 3
                spread = max(r, g, b) - min(r, g, b)
                if lum < 22 and spread < 18:
                    px[x, y] = (r, g, b, 0)
                elif lum < 40 and spread < 24:
                    px[x, y] = (r, g, b, int(a * 0.2))

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def generate_image(prompt: str, dest: Path, size: str, strip_mode: str | bool | None) -> None:
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
    png = strip_png(png, strip_mode)
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


def write_fallback_bgm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rate = 22050
    notes = [329.63, 392.00, 493.88, 587.33, 493.88, 392.00, 329.63, 261.63]
    beat = int(rate * 0.28)
    frames = []
    for n in range(48):
        freq = notes[n % len(notes)]
        for i in range(beat):
            t = i / rate
            env = min(1.0, i / 400.0) * max(0.0, 1 - i / beat)
            sample = 0.14 * env * math.sin(2 * math.pi * freq * t)
            sample += 0.04 * env * math.sin(2 * math.pi * freq * 1.5 * t)
            frames.append(int(max(-1, min(1, sample)) * 32767))
    wav_path = dest.with_suffix(".wav")
    with wave.open(str(wav_path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(b"".join(struct.pack("<h", s) for s in frames))
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-q:a", "5", str(dest)],
            check=True,
            capture_output=True,
        )
        wav_path.unlink(missing_ok=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        dest.write_bytes(wav_path.read_bytes())
    print(f"fallback bgm {dest.relative_to(ROOT)}", flush=True)


def generate_bgm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "task": "audio.generate",
            "input": {
                "workflow_name": MUSIC_MODEL,
                "params": {
                    "prompt": (
                        "cute marching battle lane defense game bgm, playful drums and "
                        "bright chiptune brass, sunny meadow war, looping instrumental, no vocals"
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
            "Idempotency-Key": "lanes-ace-bgm-v1",
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
    raise TimeoutError("ace-step timed out")


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
                print(f"ace-step unavailable, writing local loop: {exc}", flush=True)
                write_fallback_bgm(bgm)
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

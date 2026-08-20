#!/usr/bin/env python3
"""Bake tower-defense sprites, BGM, and SFX via airouter.

Images: local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`), with local loop fallback.
SFX: local `/v1/audio/speech` (`tts-auto`).
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
MUSIC_MODEL = "t2a_ace_step1_5_xl_turbo_v1"
STYLE = "warcraft 3 style, pastel medieval, soft lighting, game asset, white background"

IMAGES = {
    "path-grass.png": (
        "512x512",
        False,
        "seamless repeating tile texture only, close-up pastel meadow grass, warcraft 3 campaign map ground, "
        "soft green blades, no path, no road, no buildings, no characters, no icons, no trees, no UI, no text, fill entire frame, orthographic top-down",
    ),
    "path-dirt.png": (
        "512x512",
        False,
        "seamless repeating tile texture only, close-up pastel packed dirt road, warcraft 3 campaign, "
        "warm brown earth, no grass covering, no buildings, no characters, no UI, no text, fill entire frame, orthographic top-down",
    ),
    "tower-arrow.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, small wooden archer tower with pointed roof, "
        "front three-quarter view, centered, no text, no drop shadow, no floor",
    ),
    "tower-magic.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, small stone mage tower with blue crystal, "
        "front three-quarter view, centered, no text, no drop shadow, no floor",
    ),
    "tower-cannon.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, small squat cannon tower with bronze barrel, "
        "front three-quarter view, centered, no text, no drop shadow, no floor",
    ),
    "enemy-grunt.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, pastel orc grunt warrior walking, "
        "full body, centered, no text, no drop shadow, no floor, not pokemon",
    ),
    "enemy-beast.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, pastel stone golem walking, "
        "full body, centered, no text, no drop shadow, no floor, not pokemon",
    ),
    "keep.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, small pastel medieval keep castle, "
        "front three-quarter, centered, no text, no drop shadow, no floor",
    ),
    "tree.png": (
        "512x512",
        True,
        f"{STYLE}, square game icon sticker, single pastel oak tree, "
        "full body, centered, no text, no drop shadow, no floor",
    ),
}

SFX = {
    "build": "thud",
    "wave": "horn",
    "kill": "ding",
    "leak": "crash",
    "upgrade": "sparkle",
    "win": "fanfare",
    "lose": "fail",
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


def strip_white(png: bytes) -> bytes:
    try:
        from PIL import Image
        import io
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (r + g + b) / 3
            spread = max(r, g, b) - min(r, g, b)
            if lum > 248 and spread < 18:
                px[x, y] = (r, g, b, 0)
            elif lum > 225 and spread < 28:
                px[x, y] = (r, g, b, int(a * 0.25))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def placeholder(name: str, dest: Path) -> None:
    from PIL import Image, ImageDraw

    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = 256, 256
    if name == "path-grass.png":
        img = Image.new("RGB", (512, 512), (143, 191, 122))
        d = ImageDraw.Draw(img)
        for i in range(0, 512, 32):
            d.line((0, i, 512, i), fill=(126, 176, 108), width=1)
            d.line((i, 0, i, 512), fill=(158, 202, 136), width=1)
        img.save(dest)
        return
    if name == "path-dirt.png":
        img = Image.new("RGB", (512, 512), (196, 154, 106))
        d = ImageDraw.Draw(img)
        d.ellipse((40, 80, 160, 160), fill=(184, 140, 94))
        d.ellipse((300, 280, 460, 400), fill=(176, 132, 88))
        img.save(dest)
        return
    palettes = {
        "tower-arrow.png": ((196, 148, 98), (122, 168, 92), (232, 214, 168)),
        "tower-magic.png": ((156, 168, 196), (120, 148, 210), (214, 232, 246)),
        "tower-cannon.png": ((140, 124, 108), (92, 88, 84), (196, 148, 86)),
        "enemy-grunt.png": ((120, 156, 98), (78, 110, 70), (214, 196, 140)),
        "enemy-beast.png": ((168, 164, 156), (120, 116, 108), (214, 208, 196)),
        "keep.png": ((210, 176, 148), (186, 120, 110), (236, 222, 196)),
        "tree.png": ((92, 140, 78), (64, 108, 58), (140, 108, 72)),
    }
    body, roof, accent = palettes.get(name, ((180, 180, 180), (120, 120, 120), (220, 220, 220)))
    if name.startswith("tower") or name == "keep.png":
        d.rectangle((cx - 70, cy - 10, cx + 70, cy + 160), fill=body)
        d.polygon([(cx - 110, cy - 10), (cx, cy - 160), (cx + 110, cy - 10)], fill=roof)
        d.rectangle((cx - 18, cy + 40, cx + 18, cy + 100), fill=accent)
    elif name.startswith("enemy"):
        d.ellipse((cx - 90, cy - 40, cx + 90, cy + 160), fill=body)
        d.ellipse((cx - 70, cy - 150, cx + 70, cy - 10), fill=accent)
        d.ellipse((cx - 28, cy - 110, cx - 4, cy - 80), fill=(50, 50, 50, 255))
        d.ellipse((cx + 4, cy - 110, cx + 28, cy - 80), fill=(50, 50, 50, 255))
    else:
        d.ellipse((cx - 40, cy + 40, cx + 40, cy + 180), fill=accent)
        d.ellipse((cx - 140, cy - 160, cx + 140, cy + 60), fill=body)
        d.ellipse((cx - 90, cy - 200, cx + 40, cy - 40), fill=roof)
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
        png = strip_white(png)
    dest.write_bytes(png)


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
    notes = [329.63, 392.00, 440.00, 493.88, 440.00, 392.00, 329.63, 293.66]
    beat = int(rate * 0.36)
    frames = []
    for n in range(36):
        freq = notes[n % len(notes)]
        for i in range(beat):
            t = i / rate
            env = min(1.0, i / 500.0) * max(0.0, 1 - i / beat)
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
        print(f"fallback bgm wav copied to {dest.name}", flush=True)
        return
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
                        "warcraft 3 campaign map music, pastel medieval tower defense, gentle lute and flute, "
                        "soft drums, heroic but calm, looping instrumental, no vocals, sunny meadow, not scary"
                    ),
                    "lyrics": "Instrumental",
                    "duration": 16,
                    "bpm": 92,
                    "keyscale": "A minor",
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
            "Idempotency-Key": "tower-ace-bgm-v1",
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
    parser.add_argument("--placeholders-only", action="store_true")
    args = parser.parse_args()
    failures: list[str] = []

    if not args.audio_only:
        for name, (size, do_strip, prompt) in IMAGES.items():
            dest = ROOT / "assets" / name
            if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                print(f"skip {dest.relative_to(ROOT)}")
                continue
            if args.placeholders_only:
                placeholder(name, dest)
                print(f"ph   {dest.relative_to(ROOT)}")
                continue
            try:
                generate_image(prompt, dest, size, do_strip)
            except Exception as exc:
                failures.append(f"{dest}: {exc}")
                print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)
                placeholder(name, dest)
                print(f"ph   {dest.relative_to(ROOT)} (fallback)")

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

#!/usr/bin/env python3
"""Bake catch meadow, sprites, BGM, and SFX via airouter.

Images: local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`), with local wav fallback.
SFX: local `/v1/audio/speech` (`tts-auto`).
Pokemon species art stays on PokeAPI at runtime.
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

IMAGES = {
    "meadow.png": (
        "768x512",
        False,
        "wide lush pokemon safari meadow landscape painting, tall grass and wildflowers, "
        "sunny sky, no pokemon, no people, no UI, no text, game background, fill the frame",
    ),
    "foil.png": (
        "512x512",
        False,
        "seamless holographic trading card foil paper texture, iridescent rainbow sheen, "
        "close-up card stock, no text, no characters, no pokemon, fill the frame",
    ),
    "dex-paper.png": (
        "512x512",
        False,
        "warm cream trading card album page texture, faint grass watermark, "
        "soft paper grain, no text, no pokemon, fill the frame",
    ),
    "pokeball.png": (
        "512x512",
        "dark",
        "square game icon sticker, classic red and white pokeball, centered, "
        "glossy plastic, crisp edges, plain pure black background, no text, "
        "no watermark, no drop shadow, no floor",
    ),
    "sparkle.png": (
        "512x512",
        "dark",
        "square game icon sticker, burst of gold star sparkles and light rays, "
        "catch celebration, kawaii, plain pure black background, no text, "
        "no watermark, no drop shadow",
    ),
    "pouch.png": (
        "512x512",
        "dark",
        "square game icon sticker, small brown leather pokemon trainer belt pouch, "
        "kawaii, front view, plain pure black background, no text, no watermark, "
        "no drop shadow, no floor",
    ),
}

SFX = {
    "throw": "whoosh",
    "shake": "rattle",
    "catch": "ding",
    "flee": "whoops",
    "snap": "tick",
}


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 330) -> tuple[int, bytes, str]:
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
    import math
    import struct
    import subprocess
    import tempfile
    import wave

    dest.parent.mkdir(parents=True, exist_ok=True)
    rate = 22050
    notes = [392.00, 523.25, 659.25, 783.99, 659.25, 523.25, 440.00, 392.00]
    beat = int(rate * 0.32)
    frames = []
    for n in range(40):
        freq = notes[n % len(notes)]
        for i in range(beat):
            t = i / rate
            env = min(1.0, i / 500.0) * max(0.0, 1 - i / beat)
            sample = 0.16 * env * math.sin(2 * math.pi * freq * t)
            sample += 0.05 * env * math.sin(2 * math.pi * freq * 2 * t)
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
                        "pokemon safari zone meadow music, gentle adventure, soft flute and "
                        "warm pads, looping instrumental, no vocals, sunny grass field, not scary"
                    ),
                    "lyrics": "Instrumental",
                    "duration": 16,
                    "bpm": 100,
                    "keyscale": "D major",
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
            "Idempotency-Key": "catch-ace-bgm-v1",
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

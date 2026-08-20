#!/usr/bin/env python3
"""Bake quiz desk/dex textures, stamps, BGM, and SFX via airouter.

Images: local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`).
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
    "desk.png": (
        "768x512",
        False,
        "pokemon researcher wooden desk from above, teal lamp light, "
        "field notes and brass paperweight, no pokemon, no UI, no text, "
        "game background painting, rich teal and walnut, soft focus edges",
    ),
    "shell.png": (
        "512x512",
        False,
        "close-up red handheld pokedex plastic shell texture, glossy cherry red, "
        "subtle scratches, game asset, no buttons readable, no text, no screen, "
        "fill the frame",
    ),
    "lcd.png": (
        "512x512",
        False,
        "green monochrome LCD screen texture, faint scanlines, mint phosphor glow, "
        "game UI background, no letters, no numbers, no icons, fill the frame",
    ),
    "stamp-ok.png": (
        "512x512",
        True,
        "square game icon sticker, rubber stamp mark reading nothing, "
        "green circular botanist approval seal, wax and ink, kawaii, "
        "plain pure white background, no text, no watermark",
    ),
    "stamp-bad.png": (
        "512x512",
        True,
        "square game icon sticker, red circular rejected specimen seal, "
        "ink smudge, kawaii not scary, plain pure white background, no text, no watermark",
    ),
    "mascot.png": (
        "512x512",
        True,
        "square game icon sticker, cute round pokedex device character with one "
        "big lens eye, cherry red and brass, kawaii, plain pure white background, "
        "no text, no watermark, no drop shadow, no floor",
    ),
}

SFX = {
    "ok": "ding",
    "bad": "buzz",
    "tick": "tick",
    "click": "click",
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


def generate_bgm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "task": "audio.generate",
            "input": {
                "workflow_name": MUSIC_MODEL,
                "params": {
                    "prompt": (
                        "soft chiptune pokedex menu, curious bells, warm analog pads, "
                        "field research ambient, instrumental, looping, not scary"
                    ),
                    "lyrics": "Instrumental",
                    "duration": 32,
                    "bpm": 96,
                    "keyscale": "C major",
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
            "Idempotency-Key": "quiz-ace-bgm-v1",
        },
        timeout=60,
    )
    job_id = json.loads(raw)["id"]
    deadline = time.time() + 900
    while time.time() < deadline:
        _, st_raw, _ = _request("GET", f"{AIROUTER}/v1/jobs/{job_id}", timeout=30)
        row = json.loads(st_raw)
        state = (row.get("state") or row.get("status") or "").lower()
        print(f"music {state}", flush=True)
        if state in {"completed", "succeeded", "success", "done"}:
            _, audio, _ = _request(
                "GET", f"{AIROUTER}/v1/jobs/{job_id}/artifact", timeout=120
            )
            dest.write_bytes(audio)
            if dest.stat().st_size < 1000:
                raise RuntimeError(f"tiny ACE artifact ({dest.stat().st_size} bytes)")
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

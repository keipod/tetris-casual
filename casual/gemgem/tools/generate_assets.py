#!/usr/bin/env python3
"""Bake GemGem sprites, board art, BGM, and SFX via airouter.

Images use local ComfyUI (`t2i_z_image_turbo_v1`).
BGM: ACE-Step via `POST /v1/enqueue` (`t2a_ace_step1_5_xl_turbo_v1`), with local wav fallback.
SFX uses local `/v1/audio/speech` (`tts-auto`).
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

ICON = (
    "square game icon sticker, centered subject filling the frame, "
    "kawaii cute, pastel, crisp edges, plain pure white background, "
    "no text, no watermark, no drop shadow, no floor"
)

TILES = {
    "animals": {
        "tile0": f"{ICON}, cute cat face, round cheeks, pink ears",
        "tile1": f"{ICON}, cute puppy face, floppy ears, warm brown",
        "tile2": f"{ICON}, cute rabbit face, long ears, cream fur",
        "tile3": f"{ICON}, cute teddy bear face, honey brown",
        "tile4": f"{ICON}, cute fox face, orange fur, white muzzle",
        "tile5": f"{ICON}, cute panda face, black and white",
        "board": (
            "match-3 game board background, soft pastel meadow with tiny animals, "
            "blurred bokeh, no UI, no text, 1:1"
        ),
    },
    "gems": {
        "tile0": f"{ICON}, ruby gem crystal, glowing red, faceted",
        "tile1": f"{ICON}, sapphire gem crystal, glowing blue, faceted",
        "tile2": f"{ICON}, emerald gem crystal, glowing green, faceted",
        "tile3": f"{ICON}, amethyst gem crystal, glowing purple, faceted",
        "tile4": f"{ICON}, topaz gem crystal, glowing yellow, faceted",
        "tile5": f"{ICON}, diamond gem crystal, glowing white, faceted",
        "board": (
            "match-3 game board background, dark jewel cave with sparkling crystals, "
            "soft purple lighting, no UI, no text, 1:1"
        ),
    },
    "foods": {
        "tile0": f"{ICON}, cute strawberry, shiny, kawaii",
        "tile1": f"{ICON}, cute orange fruit, shiny, kawaii",
        "tile2": f"{ICON}, cute grapes bunch, shiny purple, kawaii",
        "tile3": f"{ICON}, cute watermelon slice, kawaii",
        "tile4": f"{ICON}, cute red apple, shiny, kawaii",
        "tile5": f"{ICON}, cute lemon, shiny, kawaii",
        "board": (
            "match-3 game board background, candy fruit picnic, soft pink light, "
            "no UI, no text, 1:1"
        ),
    },
}

SPECIALS = {
    "bomb": f"{ICON}, cartoon round bomb with short fuse spark, cute not scary",
    "rainbow": f"{ICON}, glowing rainbow star gem, magical sparkle",
}

SFX = {
    "select": "tick",
    "swap": "whoosh",
    "match": "pop",
    "combo": "yay",
    "bomb": "boom",
    "rainbow": "sparkle",
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


def generate_image(prompt: str, dest: Path, size: str = "512x512") -> None:
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
    if dest.name != "board.png":
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
    """Local chiptune loop when ACE-Step is unavailable."""
    import math
    import struct
    import wave

    dest.parent.mkdir(parents=True, exist_ok=True)
    rate = 22050
    notes = [523.25, 659.25, 783.99, 987.77, 783.99, 659.25]
    beat = int(rate * 0.28)
    frames = []
    for n in range(32):
        freq = notes[n % len(notes)]
        for i in range(beat):
            t = i / rate
            env = min(1.0, i / 400.0) * max(0.0, 1 - i / beat)
            sample = 0.18 * env * math.sin(2 * math.pi * freq * t)
            sample += 0.06 * env * math.sin(2 * math.pi * freq * 2 * t)
            frames.append(int(max(-1, min(1, sample)) * 32767))
    with wave.open(str(dest), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(b"".join(struct.pack("<h", s) for s in frames))
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
                        "cute pastel match-3 puzzle game background music, cheerful kawaii, "
                        "light bells and soft synth, looping instrumental, no vocals, "
                        "playful candy puzzle mood"
                    ),
                    "lyrics": "Instrumental",
                    "duration": 16,
                    "bpm": 112,
                    "keyscale": "F major",
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
            "Idempotency-Key": "gemgem-ace-bgm-v1",
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
        shared: dict[str, Path] = {}
        for name, prompt in SPECIALS.items():
            dest = ROOT / "assets" / "shared" / f"{name}.png"
            if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                print(f"skip {dest.relative_to(ROOT)}")
            else:
                try:
                    generate_image(prompt, dest)
                except Exception as exc:
                    failures.append(f"{dest}: {exc}")
                    print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)
                    dest = None
            if dest and dest.exists():
                shared[name] = dest
        for theme, items in TILES.items():
            for name, prompt in items.items():
                dest = ROOT / "assets" / theme / f"{name}.png"
                if args.skip_existing and dest.exists() and dest.stat().st_size > 100:
                    print(f"skip {dest.relative_to(ROOT)}")
                    continue
                try:
                    generate_image(prompt, dest)
                except Exception as exc:
                    failures.append(f"{dest}: {exc}")
                    print(f"FAIL {dest.relative_to(ROOT)}: {exc}", file=sys.stderr)
            for name, src in shared.items():
                dest = ROOT / "assets" / theme / f"{name}.png"
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(src.read_bytes())

    if not args.images_only:
        bgm = ROOT / "assets" / "audio" / "bgm.mp3"
        wav = ROOT / "assets" / "audio" / "bgm.wav"
        if not (args.skip_existing and ((bgm.exists() and bgm.stat().st_size > 1000) or (wav.exists() and wav.stat().st_size > 1000))):
            try:
                generate_bgm(bgm)
            except Exception as exc:
                print(f"ace-step unavailable, writing wav loop: {exc}", file=sys.stderr)
                write_fallback_bgm(wav)
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

#!/usr/bin/env python3
"""Bake rich Princess Maker story assets via airouter (t2i + music + i2v).

Usage:
  python3 casual/story/tools/generate_rich_assets.py
  python3 casual/story/tools/generate_rich_assets.py --only-images
  python3 casual/story/tools/generate_rich_assets.py --only-bgm
  python3 casual/story/tools/generate_rich_assets.py --only-video
  python3 casual/story/tools/generate_rich_assets.py --force
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
T2I = "t2i_z_image_turbo_v1"
MUSIC_MODEL = "acestep"
I2V_MODEL = "i2v_wan2_2_14B_v1"

BG_STYLE = (
    "pastel fairy-tale storybook illustration background, soft watercolor, "
    "dreamy children's picture book, warm gentle light, no people, no faces, "
    "no text, no watermark, vertical composition "
)
CHAR_STYLE = (
    "pastel fairy-tale storybook character portrait, soft watercolor, cute gentle, "
    "children's picture book, plain soft cream background, bust portrait, "
    "no text, no watermark "
)
ICON_STYLE = (
    "cute pastel fairy-tale game UI icon, soft watercolor, centered object, "
    "simple clean background, no text, no watermark, square composition "
)

IMAGES: dict[str, tuple[str, str]] = {
    # New atmospheric / event BGs
    "assets/bg/birthday.png": (
        "768x1024",
        BG_STYLE + "cozy castle parlor birthday party table with pastel cake candles ribbons soft afternoon light",
    ),
    "assets/bg/diet_kitchen.png": (
        "768x1024",
        BG_STYLE + "fairy-tale kitchen meal planning table with healthy fruit bread soup bowls warm steam soft light",
    ),
    "assets/bg/errantry_camp.png": (
        "768x1024",
        BG_STYLE + "night adventure campfire in fantasy forest clearing soft sparks tents lanterns starry pastel sky",
    ),
    "assets/bg/ending_gate.png": (
        "768x1024",
        BG_STYLE + "grand pastel castle gate at sunrise with flower petals soft golden sky hopeful farewell mood",
    ),
    "assets/bg/study_hall.png": (
        "768x1024",
        BG_STYLE + "bright royal study hall with desks chalkboards books soft morning light educational calm",
    ),
    "assets/bg/harbor.png": (
        "768x1024",
        BG_STYLE + "pastel fantasy harbor with small boats pier seagulls soft sea breeze morning light",
    ),
    "assets/bg/market.png": (
        "768x1024",
        BG_STYLE + "bustling pastel village market stalls flowers fruit ribbons cheerful daytime",
    ),
    "assets/bg/observatory.png": (
        "768x1024",
        BG_STYLE + "castle observatory dome interior telescope star charts soft indigo night glow magical calm",
    ),
    # Extra portraits / NPCs
    "assets/portraits/father.png": (
        "768x768",
        CHAR_STYLE + "kind middle-aged fantasy father knight retired, warm smile, soft brown hair, gentle eyes",
    ),
    "assets/portraits/teacher.png": (
        "768x768",
        CHAR_STYLE + "gentle fantasy school governess teacher, soft glasses optional, kind smile, pastel dress",
    ),
    "assets/portraits/merchant.png": (
        "768x768",
        CHAR_STYLE + "cheerful fantasy shop merchant uncle, round face, warm smile, apron and soft hat",
    ),
    "assets/portraits/ara_teen.png": (
        "768x768",
        CHAR_STYLE + "same princess girl slightly older teen version, soft pink hair ribbon, elegant gentle smile",
    ),
    # UI icons
    "assets/ui/helm_icon.png": ("768x768", ICON_STYLE + "cute leather fantasy helmet icon soft shading"),
    "assets/ui/gold_icon.png": ("768x768", ICON_STYLE + "cute stack of gold coins icon sparkling soft"),
    "assets/ui/heart_icon.png": ("768x768", ICON_STYLE + "cute pastel heart charm icon soft glow"),
    "assets/ui/book_icon.png": ("768x768", ICON_STYLE + "cute closed storybook icon with ribbon"),
    "assets/ui/cake_party_icon.png": ("768x768", ICON_STYLE + "cute birthday cake with candles icon"),
    "assets/ui/diet_icon.png": ("768x768", ICON_STYLE + "cute healthy meal plate fruit bread icon"),
}

TRACKS: list[dict] = [
    {
        "id": "title",
        "title": "별빛 성의 아침",
        "prompt": (
            "gentle fairy-tale princess maker title theme, soft piano and warm strings, "
            "magical childhood castle morning, 72 BPM, instrumental, no vocals, clean mix"
        ),
        "style": "instrumental soft orchestral game BGM, 72 BPM",
    },
    {
        "id": "hub",
        "title": "일상의 스케줄",
        "prompt": (
            "cozy daily life game soundtrack, soft harp pluck and light flute, "
            "peaceful raising-sim home mood, 84 BPM, instrumental, no vocals"
        ),
        "style": "instrumental cozy game BGM, 84 BPM",
    },
    {
        "id": "festival",
        "title": "추수 축제 행진",
        "prompt": (
            "bright festival parade instrumental, soft brass and hand drums, "
            "autumn harvest celebration for princess game, 108 BPM, no vocals"
        ),
        "style": "instrumental festive game BGM, 108 BPM",
    },
    {
        "id": "adventure",
        "title": "원정의 길",
        "prompt": (
            "light adventure walking theme, soft pizzicato strings and woodwinds, "
            "curious exploration without danger overload, 96 BPM, instrumental, no vocals"
        ),
        "style": "instrumental adventure game BGM, 96 BPM",
    },
    {
        "id": "ending",
        "title": "성장의 커튼콜",
        "prompt": (
            "emotional bittersweet ending theme, warm piano and swelling strings, "
            "princess coming-of-age farewell, 68 BPM, instrumental, no vocals"
        ),
        "style": "instrumental emotional ending BGM, 68 BPM",
    },
]

VIDEOS: list[dict] = [
    {
        "id": "title_loop",
        "src": "assets/bg/castle.png",
        "dest": "assets/video/title_loop.mp4",
        "prompt": (
            "gentle camera drift over pastel fairy-tale castle, soft cloud motion, "
            "sparkling dust, calm morning light, seamless loop friendly, no people, no text"
        ),
        "seconds": 5,
    },
    {
        "id": "ending_rise",
        "src": "assets/bg/ballroom.png",
        "dest": "assets/video/ending_rise.mp4",
        "prompt": (
            "soft floating petal motion in pastel ballroom, gentle light rays, "
            "emotional farewell atmosphere, slow cinematic drift, no people, no text"
        ),
        "seconds": 5,
    },
]


def req(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 360) -> bytes:
    h = dict(headers or {})
    if body is not None and "Content-Type" not in h:
        h["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read()[:600]!r}") from e


def gen_image(prompt: str, dest: Path, size: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = map(int, size.lower().split("x"))
    payload = json.dumps({
        "model": T2I,
        "prompt": prompt,
        "size": size,
        "response_format": "b64_json",
        "params": {"width": w, "height": h},
    }).encode()
    print(f"t2i {dest.relative_to(ROOT)}", flush=True)
    data = json.loads(req("POST", f"{AIROUTER}/v1/images/generations", payload))
    dest.write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    print(f"ok  {dest.relative_to(ROOT)} ({dest.stat().st_size}b)", flush=True)


def create_music(track: dict) -> str:
    payload = {
        "prompt": track["prompt"],
        "model": MUSIC_MODEL,
        "instrumental": True,
        "title": track["title"],
        "style": track["style"],
    }
    headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": f"story-bgm-v1-{track['id']}",
    }
    raw = req("POST", f"{AIROUTER}/v1/music", json.dumps(payload).encode(), headers=headers, timeout=120)
    obj = json.loads(raw)
    mid = obj.get("id")
    if not mid:
        raise RuntimeError(f"music create missing id: {obj}")
    print(f"music enqueue {track['id']} -> {mid}", flush=True)
    return mid


def wait_music(music_id: str, timeout_s: int = 900) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        obj = json.loads(req("GET", f"{AIROUTER}/v1/music/{music_id}", timeout=30))
        st = obj.get("status")
        if st == "completed":
            return
        if st == "failed":
            err = (obj.get("error") or {}).get("message") or obj
            raise RuntimeError(f"music failed: {err}")
        time.sleep(4)
    raise TimeoutError(f"music {music_id} timed out")


def download_music(music_id: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = req("GET", f"{AIROUTER}/v1/music/{music_id}/content", timeout=180)
    if len(data) < 1000:
        raise RuntimeError(f"audio too small ({len(data)})")
    dest.write_bytes(data)
    print(f"ok  {dest.relative_to(ROOT)} ({len(data)}b)", flush=True)


def create_i2v(prompt: str, image_path: Path, seconds: int, idem: str) -> str:
    boundary = "----StoryRichBoundary"
    img = image_path.read_bytes()
    fields = {
        "model": I2V_MODEL,
        "prompt": prompt,
        "seconds": str(seconds),
    }
    chunks: list[bytes] = []
    for k, v in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(
        b'Content-Disposition: form-data; name="input_reference"; filename="ref.png"\r\n'
        b"Content-Type: image/png\r\n\r\n"
    )
    chunks.append(img)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Idempotency-Key": idem,
    }
    raw = req("POST", f"{AIROUTER}/v1/videos", body, headers=headers, timeout=180)
    obj = json.loads(raw)
    vid = obj.get("id")
    if not vid:
        raise RuntimeError(f"video create missing id: {obj}")
    print(f"i2v enqueue -> {vid} status={obj.get('status')}", flush=True)
    return vid


def wait_video(video_id: str, timeout_s: int = 1800) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        obj = json.loads(req("GET", f"{AIROUTER}/v1/videos/{video_id}", timeout=30))
        st = obj.get("status")
        prog = obj.get("progress")
        print(f"  video {video_id[:8]}… {st} {prog}%", flush=True)
        if st in ("completed", "succeeded", "ready"):
            return
        if st == "failed":
            err = (obj.get("error") or {}).get("message") or obj
            raise RuntimeError(f"video failed: {err}")
        time.sleep(8)
    raise TimeoutError(f"video {video_id} timed out")


def download_video(video_id: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = req("GET", f"{AIROUTER}/v1/videos/{video_id}/content", timeout=300)
    if len(data) < 5000:
        raise RuntimeError(f"video too small ({len(data)})")
    dest.write_bytes(data)
    print(f"ok  {dest.relative_to(ROOT)} ({len(data)}b)", flush=True)


def bake_images(force: bool, only: set[str]) -> int:
    fails = 0
    for rel, (size, prompt) in IMAGES.items():
        if only and Path(rel).name not in only and rel not in only:
            continue
        dest = ROOT / rel
        if dest.exists() and dest.stat().st_size > 1000 and not force:
            print(f"skip {rel}", flush=True)
            continue
        try:
            gen_image(prompt, dest, size)
        except Exception as exc:
            print(f"FAIL {rel}: {exc}", file=sys.stderr)
            fails += 1
    return fails


def bake_bgm(force: bool, only: set[str]) -> int:
    fails = 0
    for track in TRACKS:
        if only and track["id"] not in only:
            continue
        dest = ROOT / "assets" / "bgm" / f"{track['id']}.mp3"
        if dest.exists() and dest.stat().st_size > 1000 and not force:
            print(f"skip bgm/{track['id']}.mp3", flush=True)
            continue
        try:
            mid = create_music(track)
            wait_music(mid)
            download_music(mid, dest)
        except Exception as exc:
            print(f"FAIL bgm {track['id']}: {exc}", file=sys.stderr)
            fails += 1
    return fails


def bake_videos(force: bool, only: set[str]) -> int:
    fails = 0
    for clip in VIDEOS:
        if only and clip["id"] not in only:
            continue
        dest = ROOT / clip["dest"]
        src = ROOT / clip["src"]
        if dest.exists() and dest.stat().st_size > 5000 and not force:
            print(f"skip {clip['dest']}", flush=True)
            continue
        if not src.exists():
            print(f"FAIL {clip['id']}: missing source {clip['src']}", file=sys.stderr)
            fails += 1
            continue
        try:
            vid = create_i2v(clip["prompt"], src, clip["seconds"], f"story-i2v-v1-{clip['id']}")
            wait_video(vid)
            download_video(vid, dest)
        except Exception as exc:
            print(f"FAIL video {clip['id']}: {exc}", file=sys.stderr)
            fails += 1
    return fails


def write_manifest() -> None:
    manifest = {
        "bgm": {t["id"]: f"assets/bgm/{t['id']}.mp3" for t in TRACKS},
        "video": {v["id"]: v["dest"] for v in VIDEOS},
        "images": sorted(IMAGES.keys()),
    }
    path = ROOT / "assets" / "manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only-images", action="store_true")
    ap.add_argument("--only-bgm", action="store_true")
    ap.add_argument("--only-video", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    only = set(args.only or [])
    do_all = not (args.only_images or args.only_bgm or args.only_video)
    fails = 0
    if do_all or args.only_images:
        fails += bake_images(args.force, only)
    if do_all or args.only_bgm:
        fails += bake_bgm(args.force, only)
    if do_all or args.only_video:
        fails += bake_videos(args.force, only)
    write_manifest()
    print("done" if fails == 0 else f"done with {fails} failures", flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())

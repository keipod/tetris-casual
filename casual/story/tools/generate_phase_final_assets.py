#!/usr/bin/env python3
"""Bake Phase-final story assets (shops, palace, NPCs) via airouter t2i."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"

BG_STYLE = (
    "pastel fairy-tale storybook illustration background, soft watercolor and gouache, "
    "dreamy children's picture book, warm gentle light, no people, no faces, no text, "
    "no watermark, vertical composition suitable for mobile visual novel "
)

CHAR_STYLE = (
    "pastel fairy-tale storybook character portrait, soft watercolor, cute gentle expression, "
    "children's picture book, plain soft cream background, bust portrait centered, "
    "no text, no watermark, high quality "
)

SCENES: dict[str, tuple[str, str]] = {
    "assets/bg/city.png": (
        "768x1024",
        BG_STYLE
        + "pastel fantasy town square with cute shops, cobblestone, flower boxes, "
        "bakery and boutique facades, soft daytime sky",
    ),
    "assets/bg/shop_armory.png": (
        "768x1024",
        BG_STYLE
        + "fairy-tale armory interior, wooden racks with toy-like shiny swords and shields, "
        "warm lantern light, soft pastel metal glints, cozy workshop",
    ),
    "assets/bg/shop_tailor.png": (
        "768x1024",
        BG_STYLE
        + "princess tailor boutique interior, mannequins with pastel dresses, ribbons, "
        "fabric rolls, soft lilac curtains, elegant fitting room",
    ),
    "assets/bg/shop_restaurant.png": (
        "768x1024",
        BG_STYLE
        + "cozy pastel restaurant interior, lace tablecloths, cake display, "
        "teacups, warm afternoon light through windows",
    ),
    "assets/bg/shop_items.png": (
        "768x1024",
        BG_STYLE
        + "whimsical general store interior, shelves of potions jars candy and trinkets, "
        "soft golden light, cute fantasy shop",
    ),
    "assets/bg/church.png": (
        "768x1024",
        BG_STYLE
        + "small pastel chapel interior, stained glass soft colors, wooden pews, "
        "peaceful holy light beams, serene sacred mood",
    ),
    "assets/bg/clinic.png": (
        "768x1024",
        BG_STYLE
        + "gentle fairy-tale clinic room, clean white and mint tones, herb shelves, "
        "soft bed with blankets, caring warm atmosphere",
    ),
    "assets/bg/palace.png": (
        "768x1024",
        BG_STYLE
        + "royal palace audience hall, tall pastel columns, soft carpet, "
        "throne far away, elegant sunlight, majestic but gentle",
    ),
    "assets/bg/cube_room.png": (
        "768x1024",
        BG_STYLE
        + "butler study room in castle, neat desk with letters and tea set, "
        "bookshelf, soft green lamp, tidy and wise atmosphere",
    ),
    "assets/bg/snow.png": (
        "768x1024",
        BG_STYLE
        + "snowy castle courtyard in winter, soft snowflakes, pastel blue sky, "
        "warm windows glowing, quiet peaceful winter fairy tale",
    ),
    "assets/bg/spring_fair.png": (
        "768x1024",
        BG_STYLE
        + "spring village fair with flower stalls and pastel banners, "
        "soft cherry blossoms, festive gentle daytime",
    ),
    "assets/portraits/cube.png": (
        "768x768",
        CHAR_STYLE
        + "CLEARLY a castle butler advisor named Cube: elderly gentleman butler, "
        "white gloves, formal green waistcoat with gold buttons, neat gray mustache, "
        "round monocle on one eye, holding a silver tea tray, wise kind smile, "
        "servant attire unmistakable, soft pastel colors",
    ),
    "assets/portraits/rival_rose.png": (
        "768x768",
        CHAR_STYLE
        + "CLEARLY a rival princess: young princess girl wearing a small tiara crown, "
        "rose-red wavy hair with big ribbons, elegant crimson and gold royal dress, "
        "proud competitive smile, princess portrait, cute fairy-tale royalty",
    ),
    "assets/portraits/rival_lily.png": (
        "768x768",
        CHAR_STYLE
        + "CLEARLY a noble rival lady: silver-blonde princess hair, sapphire earrings, "
        "pale ice-blue royal gown, cool confident artistic princess portrait, tiara",
    ),
    "assets/portraits/prince.png": (
        "768x768",
        CHAR_STYLE
        + "gentle young fairy-tale prince, soft brown hair, kind eyes, "
        "pastel blue cape, friendly royal youth",
    ),
    "assets/ui/sword_icon.png": (
        "512x512",
        "cute pastel fairy-tale sword icon centered, soft metallic shine, "
        "plain pure white background, no text, simple game item icon",
    ),
    "assets/ui/dress_icon.png": (
        "512x512",
        "cute pastel princess dress icon centered, pink and mint ribbons, "
        "plain pure white background, no text, simple game item icon",
    ),
    "assets/ui/cake_icon.png": (
        "512x512",
        "cute pastel cake slice icon centered, strawberries cream, "
        "plain pure white background, no text, simple game item icon",
    ),
    "assets/ui/potion_icon.png": (
        "512x512",
        "cute pastel potion bottle icon centered, mint liquid sparkles, "
        "plain pure white background, no text, simple game item icon",
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


def generate_t2i(prompt: str, dest: Path, size: str) -> None:
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
    dest.write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    print(f"ok   {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = set(args.only or [])

    for rel, (size, prompt) in SCENES.items():
        name = Path(rel).name
        if only and rel not in only and name not in only:
            continue
        dest = ROOT / rel
        if dest.exists() and not args.force:
            print(f"skip {rel}", flush=True)
            continue
        try:
            generate_t2i(prompt, dest, size)
        except Exception as exc:
            print(f"FAIL {rel}: {exc}", file=sys.stderr)
            return 1
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

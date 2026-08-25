#!/usr/bin/env python3
"""Bake princess-story scene backgrounds via airouter t2i (comfyui)."""

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

STYLE = (
    "pastel fairy-tale storybook illustration background, soft watercolor and gouache, "
    "dreamy children's picture book, warm gentle light, no people, no faces, no text, "
    "no watermark, vertical composition suitable for mobile visual novel "
)

# rel path under assets/bg → (size, prompt suffix)
SCENES: dict[str, tuple[str, str]] = {
    "garden.png": (
        "768x1024",
        "dew-kissed royal flower garden at morning, rose arches, soft mint hedges, "
        "sparkling dew drops, lavender sky edge, cozy castle garden path",
    ),
    "forest.png": (
        "768x1024",
        "enchanted pastel forest path with tall soft trees, mossy ground, "
        "dappled sunlight, mysterious footprints in soft dirt, fairy-tale woods",
    ),
    "meadow.png": (
        "768x1024",
        "sunny wildflower meadow clearing, soft yellow and pink blooms, "
        "fluffy clouds, gentle hill, playful open space for a puppy",
    ),
    "dressroom.png": (
        "768x1024",
        "princess dressing room interior, tall ornate wardrobe with sparkling dresses, "
        "vanity mirror, soft lilac curtains, ribbons and pearls, dreamy pastel room",
    ),
    "kitchen.png": (
        "768x1024",
        "cozy castle kitchen, warm butter-yellow light, baking cookies on tray, "
        "copper pots, open window with curtains, sweet pastry steam, inviting",
    ),
    "library.png": (
        "768x1024",
        "sunlit castle library, tall wooden shelves of storybooks, soft armchair, "
        "floating dust motes in golden beams, stained glass window pastel colors",
    ),
    "tower.png": (
        "768x1024",
        "princess tower balcony overlooking pastel clouds and distant hills, "
        "stone railing with flower pots, wide sky, wind-blown ribbons",
    ),
    "fountain.png": (
        "768x1024",
        "ornate garden fountain plaza with sparkling water, lily pads, "
        "stone cherub spout, flower beds around, soft afternoon light",
    ),
    "dusk.png": (
        "768x1024",
        "royal garden at dusk turning to evening party, soft pink and peach sky, "
        "lanterns beginning to glow, rose bushes silhouette, magical twilight",
    ),
    "heart.png": (
        "768x1024",
        "intimate heart-shaped flower garden at night, soft pink petals, "
        "fairy lights strung between bushes, warm glowing atmosphere of friendship",
    ),
    "wander.png": (
        "768x1024",
        "quiet garden path at sunset, orange and soft blue sky, "
        "alone peaceful walk among tall flowers, free and serene mood",
    ),
    "balcony.png": (
        "768x1024",
        "starlit castle balcony at night, constellation sky, soft moon glow, "
        "potted night flowers, romantic quiet view over the kingdom",
    ),
    "fireplace.png": (
        "768x1024",
        "cozy castle sitting nook with warm fireplace, knitted blanket on chair, "
        "soft rugs, cocoa cups on low table, hygge pastel evening interior",
    ),
    "rainy_window.png": (
        "768x1024",
        "rainy day view from castle window, soft rain streaks on glass, "
        "blurred garden outside, warm indoor sill with teacup and book",
    ),
    "parlor.png": (
        "768x1024",
        "elegant tea parlor with lace tablecloth, pastel china tea set, "
        "cakes and macarons, rainy light through sheer curtains, cozy afternoon",
    ),
    "attic.png": (
        "768x1024",
        "dusty cozy castle attic with old trunks, soft beams of light, "
        "vintage toys and ribbons spilling out, nostalgic treasure hunt mood",
    ),
    "greenhouse.png": (
        "768x1024",
        "glass greenhouse during rain, lush tropical ferns and orchids, "
        "raindrops on glass roof, warm humid green glow, peaceful shelter",
    ),
    "candle_tea.png": (
        "768x1024",
        "candlelit indoor tea table at dusk, soft golden candles, "
        "steaming teapot, rain heard outside, intimate warm glow",
    ),
    "rain_garden.png": (
        "768x1024",
        "garden after rain with puddles reflecting soft sky, glistening leaves, "
        "fresh petrichor mood, rainbow hint far away, peaceful wet stones",
    ),
    "lantern_path.png": (
        "768x1024",
        "forest festival path at twilight lined with paper lanterns, "
        "soft glowing orbs, mossy trail leading into magical woods",
    ),
    "firefly.png": (
        "768x1024",
        "meadow filled with glowing fireflies at night, soft blue-green lights, "
        "tall grass silhouettes, dreamy magical summer night atmosphere",
    ),
    "mushroom.png": (
        "768x1024",
        "fairy mushroom circle in moonlit forest clearing, pastel toadstools, "
        "tiny glowing mushrooms, enchanting secret gathering spot",
    ),
    "festival.png": (
        "768x1024",
        "forest festival stage with hanging lanterns and flower garlands, "
        "wooden platform, soft night lights, celebratory magical atmosphere",
    ),
    "wish_tree.png": (
        "768x1024",
        "IMPORTANT: deep night scene only, dark blue-black sky with moon and stars, "
        "NO daylight, NO sun, NO bright daytime sky. "
        "ancient wish tree covered in ribbons and paper charms under soft moonlight, "
        "glowing charms, sparkling leaves, hopeful serene midnight forest clearing",
    ),
    "stream.png": (
        "768x1024",
        "gentle forest stream with stepping stones and floating lanterns, "
        "soft moonlight reflections on water, peaceful night festival path",
    ),
    "music_gazebo.png": (
        "768x1024",
        "white garden gazebo with soft fairy lights and musical notes motif, "
        "flowers around pillars, evening concert mood, pastel night sky",
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
    ap.add_argument("--only", nargs="*", help="subset of filenames under assets/bg")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = set(args.only or [])

    for rel, (size, suffix) in SCENES.items():
        if only and rel not in only:
            continue
        dest = ROOT / "assets" / "bg" / rel
        if dest.exists() and not args.force:
            print(f"skip {rel}", flush=True)
            continue
        try:
            generate_t2i(STYLE + suffix, dest, size)
        except Exception as exc:
            print(f"FAIL {rel}: {exc}", file=sys.stderr)
            return 1

    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Bake gap-fill adventure/zone backgrounds via airouter t2i."""
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
T2I = "t2i_z_image_turbo_v1"
STYLE = (
    "pastel fairy-tale storybook illustration background, soft watercolor, "
    "dreamy children's picture book, no people, no faces, no text, vertical "
)

SCENES = {
    "assets/bg/desert.png": STYLE + "soft pastel desert dunes at golden hour, oasis palm silhouettes, gentle fantasy desert path",
    "assets/bg/lake.png": STYLE + "crystal lake shore with reeds and soft mountains, morning mist, peaceful fairy-tale water",
    "assets/bg/glacier.png": STYLE + "pastel icy glacier cliffs and snow sparkles, soft blue winter light, magical frozen path",
    "assets/bg/farm.png": STYLE + "cozy pastel farm with wheat fields, barn, flower fence, warm countryside morning",
    "assets/bg/salon.png": STYLE + "cute pastel hair salon boutique interior, mirrors ribbons chairs, soft lilac light",
    "assets/bg/dojo.png": STYLE + "wooden kung-fu dojo interior, soft mats, paper windows, morning light, calm training hall",
}


def req(method, url, body=None, timeout=360):
    r = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read()[:400]!r}") from e


def gen(prompt, dest, size="768x1024"):
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = map(int, size.lower().split("x"))
    payload = json.dumps({
        "model": T2I, "prompt": prompt, "size": size,
        "response_format": "b64_json", "params": {"width": w, "height": h},
    }).encode()
    print(f"t2i {dest.relative_to(ROOT)}", flush=True)
    data = json.loads(req("POST", f"{AIROUTER}/v1/images/generations", payload))
    dest.write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    print(f"ok  {dest.relative_to(ROOT)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    only = set(args.only or [])
    for rel, prompt in SCENES.items():
        if only and Path(rel).name not in only and rel not in only:
            continue
        dest = ROOT / rel
        if dest.exists() and not args.force:
            print(f"skip {rel}", flush=True)
            continue
        try:
            gen(prompt, dest)
        except Exception as exc:
            print(f"FAIL {rel}: {exc}", file=sys.stderr)
            return 1
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Bake rhythm BGM via airouter AceStep + onset charts (ffmpeg PCM, no numpy).

Usage:
  python3 casual/rhythm/tools/generate_bgm.py
  python3 casual/rhythm/tools/generate_bgm.py --charts-only
  python3 casual/rhythm/tools/generate_bgm.py --only spark-waltz
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import random
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BGM_DIR = ASSETS / "bgm"
CHART_DIR = ASSETS / "charts"
MANIFEST_PATH = ASSETS / "manifest.json"

AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
MODEL = "acestep"
POLL_S = 4.0
POLL_TIMEOUT_S = 900
SAMPLE_RATE = 22050
HOP = 512
PLAY_MS = 75_000  # use first 75s for playable charts

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("rhythm-bgm")

# Target BPM in prompt drives AceStep feel; difficulty gates chart density.
SONGS: list[dict] = [
    {
        "id": "spark-waltz",
        "title": "스파크 왈츠",
        "difficulty": "easy",
        "bpm_hint": 88,
        "prompt": (
            "cute instrumental game soundtrack, soft bells and warm plucky synth, "
            "cheerful electric creature adventure, gentle swing, 88 BPM, "
            "light percussion, no vocals, clean mix"
        ),
    },
    {
        "id": "thunder-lullaby",
        "title": "썬더 자장가",
        "difficulty": "easy",
        "bpm_hint": 92,
        "prompt": (
            "calm chiptune-inspired instrumental lullaby, soft pads and soft kick, "
            "cozy night adventure mood, 92 BPM, sparse drums, no vocals"
        ),
    },
    {
        "id": "berry-bounce",
        "title": "베리 바운스",
        "difficulty": "easy",
        "bpm_hint": 96,
        "prompt": (
            "bouncy kids pop instrumental, ukulele-like synth and light clap, "
            "playful picnic energy, 96 BPM, simple groove, no vocals"
        ),
    },
    {
        "id": "volt-parade",
        "title": "볼트 퍼레이드",
        "difficulty": "normal",
        "bpm_hint": 110,
        "prompt": (
            "upbeat parade march instrumental, bright brass synth and snare, "
            "festival energy, 110 BPM, clear downbeats, no vocals"
        ),
    },
    {
        "id": "pika-pop",
        "title": "피카 팝",
        "difficulty": "normal",
        "bpm_hint": 116,
        "prompt": (
            "catchy synth-pop instrumental, sparkle leads and punchy drums, "
            "electric yellow energy, 116 BPM, danceable, no vocals"
        ),
    },
    {
        "id": "forest-groove",
        "title": "포레스트 그루브",
        "difficulty": "normal",
        "bpm_hint": 120,
        "prompt": (
            "groovy retro game funk instrumental, wah synth and tight drums, "
            "forest adventure walk, 120 BPM, steady beat, no vocals"
        ),
    },
    {
        "id": "storm-rush",
        "title": "스톰 러시",
        "difficulty": "hard",
        "bpm_hint": 128,
        "prompt": (
            "energetic electronic rock instrumental, driving drums and bass, "
            "storm chase intensity, 128 BPM, strong kicks, no vocals"
        ),
    },
    {
        "id": "hyper-spark",
        "title": "하이퍼 스파크",
        "difficulty": "hard",
        "bpm_hint": 134,
        "prompt": (
            "fast electro dance instrumental, bright arps and sidechain kick, "
            "hyper electric festival, 134 BPM, dense rhythm, no vocals"
        ),
    },
    {
        "id": "final-thunder",
        "title": "파이널 썬더",
        "difficulty": "hard",
        "bpm_hint": 140,
        "prompt": (
            "epic boss-battle EDM instrumental, heavy kick and soaring lead, "
            "climactic thunder finale, 140 BPM, intense but melodic, no vocals"
        ),
    },
]

DIFFICULTY_META = {
    "easy": {
        "label": "쉬움",
        "fall_ms": 2300,
        "perfect_ms": 80,
        "good_ms": 170,
        "min_gap_ms": 480,
        "keep_ratio": 0.42,
        "chord_prob": 0.04,
    },
    "normal": {
        "label": "보통",
        "fall_ms": 2000,
        "perfect_ms": 70,
        "good_ms": 155,
        "min_gap_ms": 340,
        "keep_ratio": 0.68,
        "chord_prob": 0.12,
    },
    "hard": {
        "label": "어려움",
        "fall_ms": 1750,
        "perfect_ms": 60,
        "good_ms": 140,
        "min_gap_ms": 240,
        "keep_ratio": 0.88,
        "chord_prob": 0.18,
    },
}


def _request(method: str, url: str, data: bytes | None = None, headers: dict | None = None, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def create_music(song: dict) -> str:
    payload = {
        "prompt": song["prompt"],
        "model": MODEL,
        "instrumental": True,
        "title": song["title"],
        "style": f"instrumental game BGM, {song['bpm_hint']} BPM",
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": f"rhythm-bgm-v1-{song['id']}",
    }
    raw = _request("POST", f"{AIROUTER}/v1/music", data=body, headers=headers, timeout=120)
    obj = json.loads(raw.decode("utf-8"))
    music_id = obj.get("id")
    if not music_id:
        raise RuntimeError(f"create_music missing id: {obj}")
    log.info("enqueued %s -> %s (status=%s)", song["id"], music_id, obj.get("status"))
    return music_id


def wait_music(music_id: str) -> None:
    deadline = time.time() + POLL_TIMEOUT_S
    while time.time() < deadline:
        raw = _request("GET", f"{AIROUTER}/v1/music/{music_id}", timeout=30)
        obj = json.loads(raw.decode("utf-8"))
        status = obj.get("status")
        if status == "completed":
            return
        if status == "failed":
            err = (obj.get("error") or {}).get("message") or "unknown"
            raise RuntimeError(f"music {music_id} failed: {err}")
        time.sleep(POLL_S)
    raise TimeoutError(f"music {music_id} timed out after {POLL_TIMEOUT_S}s")


def download_music(music_id: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = _request("GET", f"{AIROUTER}/v1/music/{music_id}/content", timeout=180)
    if len(data) < 1000:
        raise RuntimeError(f"audio too small ({len(data)} bytes) for {dest.name}")
    dest.write_bytes(data)
    log.info("saved %s (%d bytes)", dest, len(data))


def decode_mono_pcm(path: Path) -> list[float]:
    """Decode audio to mono float samples via ffmpeg (no numpy)."""
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(path),
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "s16le",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode('utf-8', 'replace')}")
    raw = proc.stdout
    n = len(raw) // 2
    samples = list(struct.unpack(f"<{n}h", raw[: n * 2]))
    return [s / 32768.0 for s in samples]


def frame_energies(samples: list[float]) -> list[float]:
    energies: list[float] = []
    for i in range(0, len(samples) - HOP, HOP):
        window = samples[i : i + HOP]
        e = math.sqrt(sum(x * x for x in window) / len(window))
        energies.append(e)
    return energies


def estimate_bpm(energies: list[float], hint: int) -> float:
    """Autocorrelation-ish tempo estimate around hint BPM."""
    if len(energies) < 64:
        return float(hint)
    # Normalize
    mean = sum(energies) / len(energies)
    centered = [e - mean for e in energies]
    best_lag = None
    best_score = -1.0
    # lag range for 70–160 BPM
    min_lag = max(2, int((60.0 / 160.0) * SAMPLE_RATE / HOP))
    max_lag = min(len(centered) // 3, int((60.0 / 70.0) * SAMPLE_RATE / HOP))
    hint_lag = int((60.0 / hint) * SAMPLE_RATE / HOP)
    for lag in range(min_lag, max_lag + 1):
        score = 0.0
        count = 0
        for i in range(0, len(centered) - lag):
            score += centered[i] * centered[i + lag]
            count += 1
        if count == 0:
            continue
        score /= count
        # Prefer near hint
        score *= 1.0 / (1.0 + 0.015 * abs(lag - hint_lag))
        if score > best_score:
            best_score = score
            best_lag = lag
    if not best_lag:
        return float(hint)
    bpm = 60.0 * SAMPLE_RATE / (best_lag * HOP)
    # Fold into reasonable range
    while bpm < 70:
        bpm *= 2
    while bpm > 165:
        bpm /= 2
    return bpm


def detect_onsets(energies: list[float], min_gap_ms: float) -> list[float]:
    """Peak-pick positive energy flux as onset times (ms)."""
    if len(energies) < 4:
        return []
    flux = [0.0]
    for i in range(1, len(energies)):
        flux.append(max(0.0, energies[i] - energies[i - 1]))
    # Adaptive threshold: median * k
    sorted_f = sorted(flux)
    median = sorted_f[len(sorted_f) // 2] or 1e-6
    thresh = median * 2.8
    min_gap_frames = max(1, int((min_gap_ms / 1000.0) * SAMPLE_RATE / HOP))
    peaks: list[int] = []
    last = -10**9
    for i in range(1, len(flux) - 1):
        if flux[i] < thresh:
            continue
        if flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]:
            if i - last >= min_gap_frames:
                peaks.append(i)
                last = i
    return [p * HOP / SAMPLE_RATE * 1000.0 for p in peaks]


def build_notes(onsets_ms: list[float], difficulty: str, seed: int) -> list[dict]:
    meta = DIFFICULTY_META[difficulty]
    rand = random.Random(seed)
    # Keep ratio by stride-sampling stronger onsets first (already spaced)
    kept = [t for i, t in enumerate(onsets_ms) if rand.random() < meta["keep_ratio"] or i % 3 == 0]
    # Enforce min gap again after keep
    filtered: list[float] = []
    for t in kept:
        if t > PLAY_MS:
            break
        if t < 1800:  # lead-in silence for countdown
            continue
        if filtered and t - filtered[-1] < meta["min_gap_ms"]:
            continue
        filtered.append(t)

    notes: list[dict] = []
    last_lane = -1
    streak = 0
    for t in filtered:
        lane = rand.randrange(4)
        guard = 0
        while lane == last_lane and streak >= 2 and rand.random() < 0.8 and guard < 6:
            lane = rand.randrange(4)
            guard += 1
        if lane == last_lane:
            streak += 1
        else:
            streak = 1
            last_lane = lane
        notes.append({"time": int(round(t)), "lane": lane})
        if rand.random() < meta["chord_prob"]:
            lane2 = (lane + 1 + rand.randrange(3)) % 4
            notes.append({"time": int(round(t)), "lane": lane2})
    notes.sort(key=lambda n: (n["time"], n["lane"]))
    return notes


def analyze_song(song: dict, audio_path: Path) -> dict:
    samples = decode_mono_pcm(audio_path)
    energies = frame_energies(samples)
    bpm = estimate_bpm(energies, song["bpm_hint"])
    meta = DIFFICULTY_META[song["difficulty"]]
    # Slightly tighter onset gap than chart min so we can thin later
    onsets = detect_onsets(energies, min_gap_ms=meta["min_gap_ms"] * 0.55)
    seed = abs(hash(song["id"])) % (2**31)
    notes = build_notes(onsets, song["difficulty"], seed)
    duration_ms = min(PLAY_MS, int(len(samples) / SAMPLE_RATE * 1000))
    nps = (len(notes) / (duration_ms / 1000.0)) if duration_ms else 0.0
    chart = {
        "id": song["id"],
        "title": song["title"],
        "difficulty": song["difficulty"],
        "difficultyLabel": meta["label"],
        "bpm": round(bpm, 1),
        "fallMs": meta["fall_ms"],
        "perfectMs": meta["perfect_ms"],
        "goodMs": meta["good_ms"],
        "durationMs": duration_ms,
        "notes": notes,
    }
    chart_path = CHART_DIR / f"{song['id']}.json"
    chart_path.parent.mkdir(parents=True, exist_ok=True)
    chart_path.write_text(json.dumps(chart, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(
        "chart %s: bpm=%.1f notes=%d nps=%.2f difficulty=%s",
        song["id"],
        bpm,
        len(notes),
        nps,
        song["difficulty"],
    )
    return {
        "id": song["id"],
        "title": song["title"],
        "difficulty": song["difficulty"],
        "difficultyLabel": meta["label"],
        "bpm": round(bpm, 1),
        "durationMs": duration_ms,
        "noteCount": len(notes),
        "nps": round(nps, 2),
        "fallMs": meta["fall_ms"],
        "audio": f"assets/bgm/{song['id']}.mp3",
        "chart": f"assets/charts/{song['id']}.json",
    }


def write_manifest(entries: list[dict]) -> None:
    # Sort easy → hard, then title
    order = {"easy": 0, "normal": 1, "hard": 2}
    entries = sorted(entries, key=lambda e: (order.get(e["difficulty"], 9), e["title"]))
    manifest = {"version": 1, "playMs": PLAY_MS, "songs": entries}
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("wrote %s (%d songs)", MANIFEST_PATH, len(entries))


def bake_one(song: dict, charts_only: bool) -> dict:
    audio_path = BGM_DIR / f"{song['id']}.mp3"
    if not charts_only:
        if audio_path.exists() and audio_path.stat().st_size > 1000:
            log.info("skip generate (exists): %s", audio_path.name)
        else:
            music_id = create_music(song)
            wait_music(music_id)
            download_music(music_id, audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"missing audio for chart: {audio_path}")
    return analyze_song(song, audio_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bake rhythm BGM + charts")
    parser.add_argument("--charts-only", action="store_true", help="Re-analyze existing mp3s only")
    parser.add_argument("--only", action="append", default=[], help="Song id filter (repeatable)")
    args = parser.parse_args()

    songs = SONGS
    if args.only:
        wanted = set(args.only)
        songs = [s for s in SONGS if s["id"] in wanted]
        missing = wanted - {s["id"] for s in songs}
        if missing:
            log.error("unknown song ids: %s", ", ".join(sorted(missing)))
            return 2

    BGM_DIR.mkdir(parents=True, exist_ok=True)
    CHART_DIR.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    errors: list[str] = []
    for song in songs:
        try:
            entries.append(bake_one(song, charts_only=args.charts_only))
        except Exception as exc:  # noqa: BLE001 — bake continues other songs
            log.exception("failed %s: %s", song["id"], exc)
            errors.append(f"{song['id']}: {exc}")

    if entries:
        # Merge with existing manifest songs not in this run
        existing: dict[str, dict] = {}
        if MANIFEST_PATH.exists():
            try:
                old = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
                for s in old.get("songs", []):
                    existing[s["id"]] = s
            except json.JSONDecodeError:
                pass
        for e in entries:
            existing[e["id"]] = e
        write_manifest(list(existing.values()))

    if errors:
        log.error("%d song(s) failed", len(errors))
        for e in errors:
            log.error("  %s", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

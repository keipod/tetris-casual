#!/usr/bin/env python3
"""Baduk Online server: static files + WebSocket lobby/match."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "assets"))

import engine
import mp_server


def main() -> None:
    mp_server.run_duel(
        title="바둑 대전",
        port=int(os.environ.get("PORT", "48946")),
        entry="/casual/baduk/",
        engine_mod=engine,
    )


if __name__ == "__main__":
    main()

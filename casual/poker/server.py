#!/usr/bin/env python3
"""Poker server: static files + WebSocket table mode."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "assets"))

import engine
import mp_server


def main() -> None:
    mp_server.run_table(
        title="포커 대전",
        port=int(os.environ.get("PORT", "48950")),
        entry="/casual/poker/",
        game_mod=engine,
    )


if __name__ == "__main__":
    main()

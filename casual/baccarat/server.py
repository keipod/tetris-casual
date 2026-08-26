#!/usr/bin/env python3
"""Baccarat server: static files + WebSocket table mode."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "assets"))

import engine
import mp_server


def main() -> None:
    mp_server.run_table(
        title="바카라",
        port=int(os.environ.get("PORT", "48949")),
        entry="/casual/baccarat/",
        game_mod=engine,
    )


if __name__ == "__main__":
    main()

#!/bin/bash
cd "$(dirname "$0")"
PORT=8765
# 이미 실행 중이면 종료 후 재시작
lsof -ti:$PORT | xargs kill -9 2>/dev/null
sleep 0.3
echo "▶  http://0.0.0.0:$PORT 서버 시작 (airouter 프록시 포함)"
echo "   같은 네트워크: http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
PORT=$PORT python3 serve.py

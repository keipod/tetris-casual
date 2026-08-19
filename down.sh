#!/bin/bash
PORT=58765
PIDS=$(lsof -ti:$PORT)
if [ -z "$PIDS" ]; then
  echo "이미 꺼져있음 (포트 $PORT)"
else
  echo "$PIDS" | xargs kill -9
  echo "■  포트 $PORT 서버 종료 (pid: $PIDS)"
fi

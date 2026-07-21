#!/usr/bin/env bash
# === VoxelForge 体素世界 启动脚本（Git Bash / macOS / Linux）===
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "[错误] 未找到 Node.js，请先安装：https://nodejs.org"; exit 1; }

PORT="${PORT:-8082}"
URL="http://localhost:${PORT}/"

open_url() {
  if command -v cygstart >/dev/null 2>&1; then cygstart "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  elif command -v open >/dev/null 2>&1; then open "$1"
  else cmd //c start "" "$1" 2>/dev/null || powershell -c "Start-Process '$1'" 2>/dev/null; fi
}

echo "=== VoxelForge 体素世界 ==="
echo "提示：three.js 从 unpkg CDN 加载，请保持联网。"
echo "启动本地静态服务器 ${URL} ..."
( sleep 1; open_url "$URL" ) &
node "$(dirname "$0")/serve.js" "$PORT"

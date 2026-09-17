#!/usr/bin/env bash
# === VoxelForge 体素世界 启动脚本（Git Bash / macOS / Linux）===
cd "$(dirname "$0")" || exit 1
NODE="C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
if [ ! -x "$NODE" ]; then
  echo "[错误] 未找到 WorkBuddy Node 运行时：$NODE"
  exit 1
fi

# 避开 Windows 保留端口段 8000-8300
PORT="${PORT:-18082}"
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
"$NODE" "$(dirname "$0")/serve.js" "$PORT"

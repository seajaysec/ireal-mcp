#!/bin/bash
# Double-click this file in Finder to set up ireal-mcp.
# It installs dependencies, builds everything, makes the offline web app,
# and prints exactly what to paste into Claude. No prior setup needed beyond Node.
set -e
cd "$(dirname "$0")"

echo ""
echo "==================================================="
echo "  iReal MCP — setup"
echo "==================================================="
echo ""

# 1. Node check.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed — it's a one-time free install."
  echo "Opening https://nodejs.org … install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download" 2>/dev/null || true
  echo ""
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
echo "Using Node $(node --version)."
echo ""

# 2. Install + build.
echo "Installing dependencies (first run can take a minute)…"
npm install --silent
echo "Building…"
npm run build --silent
npm run build:web --silent
echo ""
echo "Done building."
echo ""

DIST="$(pwd)/dist/index.js"
WEBAPP="$(pwd)/dist-web/ireal-studio.html"

# 3. The no-server option (for most people).
echo "---------------------------------------------------"
echo "OPTION A — just make charts, no server, no Claude:"
echo "  Open this file in any browser (double-click it):"
echo "    $WEBAPP"
echo "  Type a song, press “Make chart”, tap “Open in iReal Pro”."
echo ""

# 4. The Claude (MCP) option.
echo "---------------------------------------------------"
echo "OPTION B — drive it from Claude. Add this to your MCP config:"
echo ""
echo '  {'
echo '    "mcpServers": {'
echo '      "ireal": {'
echo '        "command": "node",'
echo "        \"args\": [\"$DIST\"]"
echo '      }'
echo '    }'
echo '  }'
echo ""
echo "  (Claude Code: claude mcp add ireal node \"$DIST\")"
echo ""

# 5. Optional always-on LAN server.
echo "---------------------------------------------------"
read -r -p "OPTION C — run an always-on chart server on your network now? [y/N] " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
  npm run install-service
  echo "Server installed and running. It will start automatically at login."
else
  echo "Skipped. You can start it any time with:  npm run serve"
fi

echo ""
echo "All set. 🎹"
echo ""
read -n 1 -s -r -p "Press any key to close."

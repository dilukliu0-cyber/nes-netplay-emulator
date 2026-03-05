#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

if [ -f "$REPO_ROOT/app/package.json" ]; then
  APP_DIR="$REPO_ROOT/app"
elif [ -f "$REPO_ROOT/package.json" ]; then
  APP_DIR="$REPO_ROOT"
else
  echo "Cannot find app/package.json. Put this file in project root."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node.js 20+ first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install npm first."
  exit 1
fi

echo "Using app dir: $APP_DIR"
cd "$APP_DIR"

echo "Installing dependencies..."
if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi

echo "Building macOS package (.dmg)..."
npm run dist:mac

echo ""
echo "Done."
echo "Artifacts:"
echo "  $APP_DIR/dist"
echo ""
echo "Press Enter to close..."
read -r _

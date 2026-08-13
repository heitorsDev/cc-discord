#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  printf 'cc-discord installer: node is required but was not found in PATH\n' >&2
  printf 'install Node.js 18+ and re-run this script\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/bin/install.js" ]; then
  exec node "$SCRIPT_DIR/bin/install.js" "$@"
fi

REPO_URL="https://github.com/heitorsDev/cc-discord.git"
REF="${CCDISCORD_REF:-main}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$TMP_DIR"
if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$REF" "$REPO_URL" .
else
  curl -fsSL "https://github.com/heitorsDev/cc-discord/archive/refs/heads/${REF}.tar.gz" \
    | tar -xz --strip-components=1
fi

node "$TMP_DIR/bin/install.js" "$@"

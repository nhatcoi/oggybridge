#!/usr/bin/env bash
set -euo pipefail

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}==>${NC} ${BOLD}$*${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}warn:${NC} $*"; }
die()  { echo -e "${RED}error:${NC} $*" >&2; exit 1; }

# ── platform ──────────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux)  PLATFORM=linux  ;;
  Darwin) PLATFORM=macos  ;;
  *)      die "Unsupported OS: $OS (Linux and macOS only)" ;;
esac

REPO="https://github.com/nhatcoi/oggybridge.git"
SRC_DIR="${OGGYBRIDGE_SRC:-$HOME/.local/share/oggybridge-src}"

# ── rust ──────────────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  log "Installing Rust (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --quiet
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
else
  ok "Rust $(rustc --version | awk '{print $2}')"
fi

# ── node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  die "Node.js ≥ 18 required. Install from https://nodejs.org or via nvm/fnm."
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(parseInt(process.version.slice(1))))")
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  die "Node.js ≥ 18 required, found $(node --version). Upgrade from https://nodejs.org"
fi
ok "Node.js $(node --version)"

# ── tauri cli ─────────────────────────────────────────────────────────────────
if ! cargo tauri --version &>/dev/null 2>&1; then
  log "Installing Tauri CLI..."
  cargo install tauri-cli --version "^2" --locked
fi

# ── linux system deps ─────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "linux" ]]; then
  if command -v apt-get &>/dev/null; then
    log "Installing system dependencies..."
    sudo apt-get install -y -q \
      libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev libdbus-1-dev \
      libayatana-appindicator3-dev librsvg2-dev libglib2.0-dev \
      libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
      || warn "Some system deps may have failed — check output above."
  else
    warn "Non-Debian Linux: ensure WebKitGTK 4.1, GTK3, libssl, libdbus are installed."
  fi
fi

# ── clone / update source ─────────────────────────────────────────────────────
if [[ -d "$SRC_DIR/.git" ]]; then
  log "Updating source ($SRC_DIR)..."
  git -C "$SRC_DIR" pull --ff-only
else
  log "Cloning OggyBridge source..."
  git clone "$REPO" "$SRC_DIR"
fi

cd "$SRC_DIR"

# ── build ─────────────────────────────────────────────────────────────────────
log "Installing npm dependencies..."
npm install --silent

log "Building OggyBridge (1–3 min)..."
cargo tauri build

# ── install ───────────────────────────────────────────────────────────────────
log "Installing..."

if [[ "$PLATFORM" == "linux" ]]; then
  DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" 2>/dev/null | head -1)
  APPIMAGE=$(find src-tauri/target/release/bundle/appimage -name "*.AppImage" 2>/dev/null | head -1)

  if [[ -n "$DEB" ]] && command -v dpkg &>/dev/null; then
    sudo dpkg -i "$DEB"
    ok "Installed via dpkg → run: agenthost"
  elif [[ -n "$APPIMAGE" ]]; then
    DEST="$HOME/.local/bin/oggybridge"
    mkdir -p "$HOME/.local/bin"
    cp "$APPIMAGE" "$DEST"
    chmod +x "$DEST"
    ok "AppImage → $DEST"
    echo "  Run: oggybridge"
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
      warn "\$HOME/.local/bin not in PATH — add it to your shell profile."
    fi
  else
    die "No bundle found under src-tauri/target/release/bundle/"
  fi

elif [[ "$PLATFORM" == "macos" ]]; then
  DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
  APP=$(find src-tauri/target/release/bundle/macos -name "*.app" 2>/dev/null | head -1)

  if [[ -n "$DMG" ]]; then
    open "$DMG"
    ok "DMG opened — drag AgentHost to Applications."
  elif [[ -n "$APP" ]]; then
    cp -r "$APP" /Applications/
    ok "Installed → /Applications/$(basename "$APP")"
  else
    die "No bundle found under src-tauri/target/release/bundle/"
  fi
fi

echo ""
echo -e "${GREEN}${BOLD}OggyBridge installed!${NC}"

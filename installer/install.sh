#!/usr/bin/env bash
# Installs or updates the stream server on Linux and macOS and starts it automatically with the computer.
#   - downloads the newest version from GitHub (or uses the folder this script is in, when it is a full copy)
#   - installs its own Node.js (official download from nodejs.org, checksum verified) into /opt/ecg-stream/node
#   - Linux: systemd service "ecg-stream" running as the system user "ecg-stream"
#   - macOS: launchd service "media.ecg.stream" running as the installing user
#   - opens the firewall (ufw, firewalld or the macOS firewall) for the web and media ports
# Settings, channels and statistics in /opt/ecg-stream/data are kept on updates.
# Usage:  sudo bash install.sh [--update] [--uninstall]
#   Environment: PORT (default 80), RTC_PORT (default 10000), IP (address announced to listeners, default: automatic),
#   STREAM_REF (git branch or tag to download, default main)
set -euo pipefail

REPO="https://github.com/ecg-media/stream"
REF="${STREAM_REF:-main}"
PORT="${PORT:-80}"
RTC_PORT="${RTC_PORT:-10000}"
IP="${IP:-}"
NODE_MAJOR=26
BASE="/opt/ecg-stream"
APP="$BASE/app"
NODE_DIR="$BASE/node"
DATA="$BASE/data"
OS="$(uname -s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  say "Administratorrechte werden benötigt – bitte Passwort eingeben."
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/install.sh" ]; then
    exec sudo PORT="$PORT" RTC_PORT="$RTC_PORT" IP="$IP" STREAM_REF="$REF" bash "$SCRIPT_DIR/install.sh" "$@"
  fi
  fail "Bitte mit sudo starten: curl -fsSL $REPO/raw/main/installer/install.sh | sudo bash"
fi

for value in "$PORT" "$RTC_PORT"; do
  [[ "$value" =~ ^[0-9]+$ ]] && [ "$value" -ge 1 ] && [ "$value" -le 65535 ] || fail "Ungültiger Port: $value"
done
[[ -z "$IP" || "$IP" =~ ^[0-9.]+$ ]] || fail "Ungültige IP-Adresse: $IP"
[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "Ungültiger Versionsname: $REF"

case "$OS" in
  Linux) SERVICE_USER="ecg-stream" ;;
  Darwin) SERVICE_USER="${SUDO_USER:-root}" ;;
  *) fail "Nicht unterstütztes Betriebssystem: $OS" ;;
esac

remove_service() {
  if [ "$OS" = Linux ]; then
    systemctl disable --now ecg-stream.service 2>/dev/null || true
    rm -f /etc/systemd/system/ecg-stream.service
    systemctl daemon-reload
  else
    launchctl bootout system/media.ecg.stream 2>/dev/null || true
    rm -f /Library/LaunchDaemons/media.ecg.stream.plist
  fi
}

if [ "${1:-}" = "--uninstall" ]; then
  say "Stream wird entfernt"
  remove_service
  rm -rf "$APP" "$NODE_DIR"
  echo "Programm entfernt. Ihre Einstellungen und Statistiken liegen weiterhin in $DATA (bei Bedarf selbst löschen)."
  exit 0
fi

download() { curl -fsSL --retry 3 "$1" -o "$2"; }
command -v curl >/dev/null 2>&1 || {
  command -v apt-get >/dev/null 2>&1 && apt-get update && apt-get install -y curl ca-certificates || fail "Bitte zuerst curl installieren."
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---- Node.js ----
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  armv7l) ARCH=armv7l ;;
  *) fail "Nicht unterstützter Prozessor: $(uname -m)" ;;
esac
PLATFORM="$([ "$OS" = Darwin ] && echo darwin || echo linux)"
say "Node.js $NODE_MAJOR wird geprüft"
NODE_URL="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
download "$NODE_URL/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
LINE="$(grep -E " node-v[0-9.]+-${PLATFORM}-${ARCH}\.tar\.gz$" "$TMP/SHASUMS256.txt" | head -n 1)"
[ -n "$LINE" ] || fail "Kein Node.js $NODE_MAJOR für ${PLATFORM}-${ARCH} gefunden."
FILE="${LINE##* }"
WANT="${FILE%.tar.gz}"
if [ "$(cat "$NODE_DIR/.version" 2>/dev/null)" != "$WANT" ]; then
  echo "Lade $FILE ..."
  download "$NODE_URL/$FILE" "$TMP/$FILE"
  if command -v sha256sum >/dev/null 2>&1; then (cd "$TMP" && echo "$LINE" | sha256sum -c - >/dev/null)
  else [ "$(shasum -a 256 "$TMP/$FILE" | cut -d' ' -f1)" = "${LINE%% *}" ]
  fi || fail "Prüfsumme von $FILE stimmt nicht."
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xzf "$TMP/$FILE" -C "$NODE_DIR" --strip-components=1
  echo "$WANT" > "$NODE_DIR/.version"
fi
NODE="$NODE_DIR/bin/node"
NPM=("$NODE" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js")

# ---- program files ----
say "Programm wird geladen"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/../server/index.js" ] && [ "$(cd "$SCRIPT_DIR/.." && pwd)" != "$APP" ] && [ "${1:-}" != "--update" ]; then
  SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
  echo "Verwende die Dateien aus $SRC"
else
  download "$REPO/archive/$REF.tar.gz" "$TMP/stream.tar.gz"
  mkdir -p "$TMP/src"
  tar -xzf "$TMP/stream.tar.gz" -C "$TMP/src" --strip-components=1
  SRC="$TMP/src"
fi
[ -f "$SRC/server/index.js" ] || fail "Die heruntergeladenen Dateien sind unvollständig."
mkdir -p "$TMP/app"
(cd "$SRC" && tar --exclude=./node_modules --exclude=./data --exclude=./.git -cf - .) | (cd "$TMP/app" && tar -xf -)

say "Abhängigkeiten werden installiert"
(cd "$TMP/app" && "${NPM[@]}" ci --omit=dev --no-audit --no-fund)
WORKER="$TMP/app/node_modules/mediasoup/worker/out/Release/mediasoup-worker"
[ -x "$WORKER" ] || (cd "$TMP/app/node_modules/mediasoup" && "$NODE" npm-scripts.mjs postinstall)
[ -x "$WORKER" ] || fail "Der Medienserver (mediasoup) konnte nicht installiert werden."

# ---- service ----
say "Dienst wird eingerichtet"
remove_service
if [ "$OS" = Linux ] && ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
rm -rf "$APP.old"
[ -d "$APP" ] && mv "$APP" "$APP.old"
mv "$TMP/app" "$APP"
rm -rf "$APP.old"
mkdir -p "$DATA"
chown -R root:root "$APP" "$NODE_DIR" 2>/dev/null || chown -R root:wheel "$APP" "$NODE_DIR"
chmod -R go-w "$APP" "$NODE_DIR"
chown -R "$SERVICE_USER" "$DATA"
chmod 700 "$DATA"

if [ "$OS" = Linux ]; then
  cat > /etc/systemd/system/ecg-stream.service <<EOF
[Unit]
Description=ECG Stream (audio streaming server for the local network)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP
Environment=PORT=$PORT RTC_PORT=$RTC_PORT DATA_DIR=$DATA${IP:+ IP=$IP}
ExecStart=$NODE server/index.js
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now ecg-stream.service

  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow "$PORT/tcp" >/dev/null && ufw allow "$RTC_PORT/udp" >/dev/null && ufw allow "$RTC_PORT/tcp" >/dev/null
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$PORT/tcp" --add-port="$RTC_PORT/udp" --add-port="$RTC_PORT/tcp" >/dev/null && firewall-cmd --reload >/dev/null
  fi
else
  ENV_IP=""
  [ -n "$IP" ] && ENV_IP="<key>IP</key><string>$IP</string>"
  cat > /Library/LaunchDaemons/media.ecg.stream.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>media.ecg.stream</string>
  <key>UserName</key><string>$SERVICE_USER</string>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>server/index.js</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PORT</key><string>$PORT</string><key>RTC_PORT</key><string>$RTC_PORT</string><key>DATA_DIR</key><string>$DATA</string>$ENV_IP
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/var/log/ecg-stream.log</string>
  <key>StandardErrorPath</key><string>/var/log/ecg-stream.log</string>
</dict>
</plist>
EOF
  touch /var/log/ecg-stream.log
  chown "$SERVICE_USER" /var/log/ecg-stream.log
  launchctl bootstrap system /Library/LaunchDaemons/media.ecg.stream.plist
  FW=/usr/libexec/ApplicationFirewall/socketfilterfw
  if [ -x "$FW" ]; then "$FW" --add "$NODE" >/dev/null 2>&1 || true; "$FW" --unblockapp "$NODE" >/dev/null 2>&1 || true; fi
fi

say "Server wird gestartet"
for _ in $(seq 1 30); do
  curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || fail "Der Server antwortet nicht. Protokoll: $([ "$OS" = Linux ] && echo 'journalctl -u ecg-stream' || echo /var/log/ecg-stream.log)"

ADDRESS="$IP"
if [ -z "$ADDRESS" ]; then
  if [ "$OS" = Linux ]; then ADDRESS="$(hostname -I 2>/dev/null | awk '{print $1}')"
  else ADDRESS="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  fi
fi
SUFFIX="$([ "$PORT" = 80 ] || echo ":$PORT")"
printf '\n\033[1;32mFertig! Der Stream läuft und startet ab jetzt automatisch mit dem Computer.\033[0m\n'
echo "  Zuhörer (Handy im selben WLAN):  http://${ADDRESS:-<IP-Adresse dieses Computers>}$SUFFIX"
echo "  Verwaltung (an diesem Computer): http://localhost$SUFFIX/publish.html"
echo "  Aktualisieren:                   sudo bash $APP/installer/install.sh --update"

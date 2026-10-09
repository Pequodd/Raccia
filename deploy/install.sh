#!/usr/bin/env bash
# Installs Oleg on a fresh Ubuntu/Debian VPS: Node.js, the server as a systemd
# service, the web version, and HTTPS for your domain via Caddy.
#
#   curl -fsSL https://raw.githubusercontent.com/Pequodd/Raccia/claude/cool-faraday-v5mbcg/deploy/install.sh | sudo bash -s -- your-domain.ru
#
# Safe to run again: it updates the code and keeps the data (/var/lib/oleg).
set -euo pipefail

DOMAIN="${1:-}"
REPO="${OLEG_REPO:-https://github.com/Pequodd/Raccia.git}"
BRANCH="${OLEG_BRANCH:-claude/cool-faraday-v5mbcg}"
APP_DIR=/opt/oleg
DATA_DIR=/var/lib/oleg
NODE_MAJOR=22

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "Укажите домен: … | sudo bash -s -- your-domain.ru"
[ "$(id -u)" -eq 0 ] || die "Запустите от root (через sudo)."
. /etc/os-release
case "${ID:-}" in ubuntu | debian) ;; *) die "Нужна Ubuntu или Debian, а здесь ${PRETTY_NAME:-неизвестная система}." ;; esac

say "1/7 Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
# The Cloudsmith repo for Caddy started answering «402 Payment Required» and breaks apt;
# Caddy comes from Ubuntu/Debian's own packages now.
rm -f /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y curl git ca-certificates gnupg xz-utils debian-keyring debian-archive-keyring apt-transport-https ffmpeg

say "2/7 Подкачка (на маленьких серверах сборке веб-версии не хватает памяти)"
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2000 ] && [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Добавлено 2 ГБ подкачки."
else
  echo "Не нужно."
fi

say "3/7 Node.js $NODE_MAJOR"
need_node=1
if command -v node >/dev/null 2>&1; then
  node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)" && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) die "Неизвестная архитектура $(uname -m)" ;; esac
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  tarball=$(curl -fsSL "$base/SHASUMS256.txt" | awk "/node-v[0-9.]+-linux-${arch}\\.tar\\.xz\$/{print \$2}")
  [ -n "$tarball" ] || die "Не удалось найти Node.js на nodejs.org"
  curl -fsSL "$base/$tarball" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm /tmp/node.tar.xz
fi
NODE_BIN=$(command -v node)
echo "Node.js $("$NODE_BIN" -v)"

say "4/7 Код Олега"
id -u oleg >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin oleg
mkdir -p "$DATA_DIR" && chown oleg:oleg "$DATA_DIR"
# The code belongs to the «oleg» user and git refuses to touch it as root without this.
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

say "5/7 Зависимости и сборка веб-версии (несколько минут)"
cd "$APP_DIR/server" && npm ci --omit=dev --no-audit --no-fund
cd "$APP_DIR/app" && npm ci --no-audit --no-fund
rm -rf dist && npx expo export --platform web --output-dir dist
chown -R oleg:oleg "$APP_DIR"

say "6/7 Служба oleg и сервер звонков (coturn)"
# coturn relays calls when two phones can't reach each other directly (mobile networks,
# home routers). Credentials are made per call by the Oleg server from a shared secret.
apt-get install -y coturn openssl
mkdir -p /etc/oleg
[ -s /etc/oleg/turn.secret ] || openssl rand -hex 32 > /etc/oleg/turn.secret
chmod 600 /etc/oleg/turn.secret
TURN_SECRET=$(cat /etc/oleg/turn.secret)
PUBLIC_IP=$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)
PRIVATE_IP=$(hostname -I | awk '{print $1}')
EXTERNAL_IP="$PUBLIC_IP"
# Cloud VPS often sit behind NAT (public 195.x → private 192.168.x): coturn must know both.
if [ -n "$PUBLIC_IP" ] && [ -n "$PRIVATE_IP" ] && [ "$PUBLIC_IP" != "$PRIVATE_IP" ]; then EXTERNAL_IP="$PUBLIC_IP/$PRIVATE_IP"; fi
cat > /etc/turnserver.conf <<TURN
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$DOMAIN
min-port=49160
max-port=49260
${EXTERNAL_IP:+external-ip=$EXTERNAL_IP}
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
total-quota=50
stale-nonce=600
TURN
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn >/dev/null 2>&1
systemctl restart coturn
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 3478 >/dev/null && ufw allow 49160:49260/udp >/dev/null
fi
# Secrets for the oleg service, readable by root and the service only.
printf 'TURN_HOST=%s\nTURN_SECRET=%s\n' "$DOMAIN" "$TURN_SECRET" > /etc/oleg/env
chown root:oleg /etc/oleg/env && chmod 640 /etc/oleg/env

cat > /etc/systemd/system/oleg.service <<UNIT
[Unit]
Description=Oleg messenger
After=network-online.target
Wants=network-online.target

[Service]
User=oleg
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=DB_FILE=$DATA_DIR/oleg.db
EnvironmentFile=-/etc/oleg/env
ExecStart=$NODE_BIN --no-warnings=ExperimentalWarning src/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable oleg >/dev/null 2>&1
systemctl restart oleg
for _ in $(seq 1 20); do curl -sf http://127.0.0.1:3000/api/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:3000/api/health >/dev/null || die "Сервер не запустился. Лог: journalctl -u oleg -n 50"

say "7/7 HTTPS для $DOMAIN (Caddy)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y caddy || die "Не удалось установить Caddy (apt-get install caddy)"
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN, www.$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy

my_ip=$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)
dns_ip=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)
echo
if [ -n "$my_ip" ] && [ "$dns_ip" != "$my_ip" ]; then
  echo "!! Домен $DOMAIN пока указывает на «${dns_ip:-никуда}», а у сервера адрес $my_ip."
  echo "   Пропишите в DNS A-запись: $DOMAIN → $my_ip. Сертификат Caddy получит сам, когда DNS обновится."
fi
echo "Готово! Олег: https://$DOMAIN/"
echo "Первый вход: «Уже есть инвайт?» → поле инвайта пустое → ник и пароль. Вы станете основателем."
echo "Звонки: в панели reg.ru (если там есть файрвол) откройте порт 3478 (UDP и TCP) и UDP 49160–49260."
echo "Обновить потом: запустите эту же команду ещё раз."

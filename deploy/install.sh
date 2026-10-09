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
apt-get update -y
apt-get install -y curl git ca-certificates gnupg xz-utils debian-keyring debian-archive-keyring apt-transport-https

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

say "6/7 Служба oleg"
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
  if curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update -y && apt-get install -y caddy; then
    :
  else
    rm -f /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy || die "Не удалось установить Caddy"
  fi
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
echo "Обновить потом: запустите эту же команду ещё раз."

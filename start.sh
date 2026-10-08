#!/usr/bin/env bash
# Starts Oleg locally: the server on :3000 and the web version on :8081.
# Mac: double-click start.command; Linux: ./start.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Нужен Node.js (версия 22 или новее): https://nodejs.org — установите LTS и запустите снова."
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "Node.js $(node -v) слишком старый, нужен 22 или новее: https://nodejs.org"
  exit 1
fi

echo "== Устанавливаю зависимости (первый раз — пару минут)…"
(cd server && npm install --no-audit --no-fund)
(cd app && npm install --no-audit --no-fund)

echo "== Запускаю сервер Олега на http://localhost:3000"
(cd server && npm start) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

echo "== Открываю Олега в браузере: http://localhost:8081"
echo "   Первый вход: «Уже есть инвайт?» → поле инвайта пустое → ник и пароль."
echo "   Остановить: Ctrl+C"
cd app && npx expo start --web

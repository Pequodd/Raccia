#!/usr/bin/env bash
# Runs every time the codespace starts: launches the Oleg server on port 3000.
cd "$(dirname "$0")/.."

# Rebuild the web version if the code changed since the last build.
if [ ! -d app/dist ] || [ -n "$(find app/src app/App.tsx -newer app/dist -print -quit)" ]; then
  (cd app && npx expo export --platform web --output-dir dist)
fi

pkill -f "node .*src/index.js" 2>/dev/null || true
(cd server && nohup npm start > /tmp/oleg-server.log 2>&1 &)

# Friends open the same link, so the port must be public (otherwise GitHub asks them to log in).
if [ -n "$CODESPACE_NAME" ]; then
  gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 \
    || echo "Сделайте порт 3000 публичным вручную: вкладка PORTS → правый клик → Port Visibility → Public"
  echo "Олег: https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/"
fi
echo "Лог сервера: /tmp/oleg-server.log"

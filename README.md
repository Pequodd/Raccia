# Raccia

Мессенджер для **iOS, Android и Web** с одной кодовой базой клиента.

| Часть | Стек |
|---|---|
| `app/` | Клиент: Expo (React Native) + TypeScript, `react-native-web` для браузера |
| `server/` | Сервер: Node.js 22, Express, WebSocket (`ws`), SQLite (встроенный `node:sqlite`) |

## Что уже работает

- регистрация и вход (пароли хешируются через scrypt, вход по токену, сессия сохраняется на устройстве);
- поиск пользователей, личные и групповые чаты;
- доставка сообщений в реальном времени через WebSocket с автопереподключением;
- история сообщений с подгрузкой старых при прокрутке;
- статусы «в сети», «печатает…», счётчики непрочитанных, отметки о прочтении ✓/✓✓;
- адаптивная вёрстка: на телефоне экраны идут друг за другом, на планшете и десктопе список чатов и переписка показаны рядом;
- светлая и тёмная тема по системной настройке.

## Запуск

Нужен Node.js 22.5 или новее.

```bash
# 1. сервер (http://localhost:3000)
cd server
npm install
npm start          # или npm run dev — с перезапуском при изменениях

# 2. клиент
cd app
npm install
npm run web        # в браузере
npm run ios        # симулятор iOS / Expo Go на iPhone
npm run android    # эмулятор Android / Expo Go на телефоне
```

Адрес сервера клиент определяет сам: в браузере это `localhost:3000`, на телефоне с Expo Go — IP компьютера, где запущен Metro, в эмуляторе Android — `10.0.2.2:3000`.
Чтобы указать адрес явно, задайте `EXPO_PUBLIC_API_URL`, например `EXPO_PUBLIC_API_URL=https://api.example.com npm run web`.

Переменные сервера: `PORT` (по умолчанию `3000`) и `DB_FILE` (по умолчанию `server/data/raccia.db`).

## Проверки

```bash
cd server && npm test          # интеграционные тесты API и WebSocket
cd app && npx tsc --noEmit     # проверка типов
```

## API

REST, авторизация заголовком `Authorization: Bearer <token>`:

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/register`, `/api/login` | `{username, password}` → `{token, user}` |
| POST | `/api/logout` | завершить сессию |
| GET | `/api/me` | текущий пользователь |
| GET | `/api/users?q=` | поиск пользователей |
| GET | `/api/chats` | список чатов с последним сообщением и счётчиком непрочитанных |
| POST | `/api/chats/direct` | `{userId}` → личный чат (существующий или новый) |
| POST | `/api/chats/group` | `{title, memberIds}` → новый групповой чат |
| GET | `/api/chats/:id/messages?before=&limit=` | история сообщений, постранично |
| POST | `/api/chats/:id/messages` | `{body}` → отправить сообщение |
| POST | `/api/chats/:id/read` | `{messageId}` → отметить прочитанным |

WebSocket `/ws?token=<token>`. Сервер присылает события `ready`, `message`, `chat`, `read`, `typing`, `presence`, клиент отправляет `{type: "typing", chatId}`.

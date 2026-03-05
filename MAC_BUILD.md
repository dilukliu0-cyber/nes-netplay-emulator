# macOS сборка (подготовлено)

## Важно
- Полноценную macOS сборку нужно делать на macOS (или через GitHub Actions с `macos-latest`).
- На Windows `.dmg`/`.app` корректно не собираются.

## 1. Быстрая локальная сборка на Mac

Требования:
- Node.js 20+
- Xcode Command Line Tools (`xcode-select --install`)

Команды:

```bash
cd nes-netplay-emulator/app
npm install
npm run dist:mac:dir
```

Результат:
- Папка приложения: `app/dist/mac/`

Если нужен `.dmg`:

```bash
cd nes-netplay-emulator/app
npm run dist:mac
```

Результат:
- `app/dist/*.dmg`

## 2. Подпись и notarization (когда будешь выкладывать)

Для подписанной сборки задай переменные на Mac:

```bash
export CSC_NAME="Developer ID Application: YOUR NAME (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID"
```

Дальше обычная команда:

```bash
cd nes-netplay-emulator/app
npm run dist:mac
```

## 3. Сборка через GitHub Actions

1. Запушь изменения в репозиторий.
2. Открой `Actions` -> workflow для macOS сборки.
3. Нажми `Run workflow`.
4. Скачай artifacts (`.dmg`/`.zip`).

## 4. Онлайн настройки для Mac клиента

Перед запуском проверь URL сигналинга:
- в приложении: `Settings -> Server -> Signaling server`
- используй `wss://...` для публичного сервера

Пример сервера:

```bash
cd nes-netplay-emulator/server
SIGNALING_PORT=8787 npm run dev
```

Порт `8787` должен быть открыт извне.

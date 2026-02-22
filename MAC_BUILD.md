# macOS Build + Online Setup

You cannot build signed macOS artifacts directly on Windows, but you can build them from this repo using GitHub Actions (`macos-latest` runner).

## 1. Build macOS artifacts from GitHub

1. Push your latest changes to `main`.
2. Open GitHub -> `Actions` -> `Build macOS App`.
3. Click `Run workflow`.
4. After success, open the run and download artifact `macos-build`.

Output files:
- `*.dmg`
- `*.zip`

## 2. Local macOS build (if you have a Mac)

```bash
cd nes-netplay-emulator/app
npm i
npm run dist:mac
```

Output file:
- `app/dist/*.dmg`

## 3. Configure online server URL (important)

Set the same public signaling URL for both app and server clients.

Example:

```bash
cd nes-netplay-emulator/app
export VITE_SIGNALING_URL="wss://your-domain-or-ip:8787"
export SIGNALING_URL="wss://your-domain-or-ip:8787"
```

Notes:
- Use `wss://` for internet/public use.
- Do not use `ws://localhost:8787` if users connect from different devices.

## 4. Start signaling server

On your server machine:

```bash
cd nes-netplay-emulator/server
SIGNALING_PORT=8787 npm run dev
```

Make sure port `8787` is open and reachable from both Windows and macOS clients.

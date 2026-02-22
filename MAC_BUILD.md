# macOS Build + Online Setup

This project cannot produce a macOS app (`.dmg` / `.app`) on Windows.  
Build mac artifacts on a Mac machine.

## 1. Copy project to Mac

Copy folder `nes-netplay-emulator` to your Mac.

## 2. Install dependencies

```bash
cd nes-netplay-emulator/server
npm i

cd ../app
npm i
```

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

## 4. Build macOS app

```bash
cd nes-netplay-emulator/app
npm run dist:mac
```

Output file:
- `app/dist/*.dmg`

## 5. Start signaling server

On your server machine:

```bash
cd nes-netplay-emulator/server
SIGNALING_PORT=8787 npm run dev
```

Make sure port `8787` is open and reachable from both Windows and macOS clients.

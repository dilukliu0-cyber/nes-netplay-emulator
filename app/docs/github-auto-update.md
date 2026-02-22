# GitHub Auto-Update Setup (Windows)

## 1) Fill repository config in `package.json`
Replace placeholders:

- `repository.url`
- `build.publish[0].owner`
- `build.publish[0].repo`

## 2) Create GitHub token
Create a GitHub Personal Access Token with access to Releases (repo permissions).

## 3) Export token in PowerShell
For current terminal session:

```powershell
$env:GH_TOKEN = "YOUR_GITHUB_TOKEN"
```

Optional (persist for new terminals):

```powershell
setx GH_TOKEN "YOUR_GITHUB_TOKEN"
```

## 4) Publish release build
Run from app folder:

```powershell
npm run release:github
```

This uploads installer and update metadata to GitHub Releases.

## 5) How update works for your girlfriend
- She installs app once.
- On next app starts, Electron auto-updater checks GitHub Releases.
- If a newer version exists, app downloads it and offers restart.

## 6) For each next update
1. Increase `version` in `package.json` (for example `1.0.2`).
2. Commit + push.
3. Run `npm run release:github`.


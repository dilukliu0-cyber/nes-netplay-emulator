import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell
} from "electron";
import { autoUpdater } from "electron-updater";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import type {
  AudioSettings,
  ControlAction,
  ControlSettings,
  EmulatorId,
  GameRecord,
  NetworkSettings,
  Platform,
  Profile,
  ReplaySettings,
  RetroAchievement,
  RetroApiKeyStatus,
  RetroGameAchievements,
  RoomState,
  UiSettings,
  VideoFps,
  VideoSettings,
  WsResponse
} from "./types";

function normalizeExt(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function detectEmulatorByExt(ext: string): EmulatorId | null {
  const normalized = normalizeExt(ext);
  if (normalized === ".nes") return "nes";
  if (normalized === ".sfc" || normalized === ".smc") return "snes";
  if (normalized === ".gb" || normalized === ".gbc") return "gb";
  if (normalized === ".gba") return "gba";
  if (normalized === ".md" || normalized === ".gen" || normalized === ".bin") return "md";
  return null;
}

function emulatorToPlatform(emulatorId: EmulatorId): Platform {
  if (emulatorId === "snes") return "SNES";
  if (emulatorId === "gb") return "GB";
  if (emulatorId === "gba") return "GBA";
  if (emulatorId === "md") return "MD";
  return "NES";
}

function isExtSupportedByEmulator(ext: string, emulatorId: EmulatorId): boolean {
  const normalized = normalizeExt(ext);
  if (emulatorId === "nes") return normalized === ".nes";
  if (emulatorId === "snes") return normalized === ".sfc" || normalized === ".smc";
  if (emulatorId === "gb") return normalized === ".gb" || normalized === ".gbc";
  if (emulatorId === "gba") return normalized === ".gba";
  return normalized === ".md" || normalized === ".gen" || normalized === ".bin";
}

const defaultControls: ControlSettings = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "KeyZ",
  b: "KeyX",
  start: "Enter",
  select: "ShiftRight"
};

const defaultAudioSettings: AudioSettings = {
  enabled: true,
  volume: 80,
  latency: 0
};

const defaultVideoSettings: VideoSettings = {
  targetFps: 60,
  smoothing: true
};

const defaultNetworkSettings: NetworkSettings = {
  signalingUrl: process.env.SIGNALING_URL || process.env.VITE_SIGNALING_URL || "ws://localhost:8787",
  netplayMode: "lockstep"
};

const defaultReplaySettings = (): ReplaySettings => ({
  enabled: true,
  hotkey: "F8",
  prebufferSeconds: 10,
  quality: "720p",
  fps: 30,
  format: "webm",
  saveFolder: userDataPath("replays")
});

const defaultUiSettings: UiSettings = {
  controlPreset: "keyboard",
  libraryShowPlatformBadges: true,
  libraryEmulatorFilter: "all",
  theme: "blue",
  retroAchievementsUsername: "",
  inviteSoundEnabled: true
};

const appDisplayName = "nes netplay online";

function userDataPath(...parts: string[]): string {
  return path.join(app.getPath("userData"), ...parts);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  fs.renameSync(tempPath, filePath);
}

function getLibraryFile(): string {
  return userDataPath("library.json");
}

function getProfileFile(): string {
  return userDataPath("profile.json");
}

function getControlsFile(): string {
  return userDataPath("settings.controls.json");
}

function getAudioFile(): string {
  return userDataPath("settings.audio.json");
}

function getVideoFile(): string {
  return userDataPath("settings.video.json");
}

function getNetworkFile(): string {
  return userDataPath("settings.network.json");
}

function getUiSettingsFile(): string {
  return userDataPath("settings.ui.json");
}

function getReplaySettingsFile(): string {
  return userDataPath("settings.replay.json");
}

function getFirewallSettingsFile(): string {
  return userDataPath("settings.firewall.json");
}

type FirewallSettings = {
  streamAllowed: boolean;
  exePath: string;
};

function loadFirewallSettings(): FirewallSettings {
  const raw = readJsonFile<Partial<FirewallSettings>>(getFirewallSettingsFile(), {});
  return {
    streamAllowed: Boolean(raw.streamAllowed),
    exePath: String(raw.exePath || "")
  };
}

function saveFirewallSettings(settings: FirewallSettings): FirewallSettings {
  const normalized: FirewallSettings = {
    streamAllowed: Boolean(settings.streamAllowed),
    exePath: String(settings.exePath || "")
  };
  writeJsonFile(getFirewallSettingsFile(), normalized);
  return normalized;
}

function runNetsh(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("netsh", args, { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

async function ensureStreamFirewallAccess(): Promise<{ ok: boolean; message?: string }> {
  if (process.platform !== "win32" || !app.isPackaged) {
    return { ok: true };
  }

  const exePath = process.execPath;
  const current = loadFirewallSettings();
  if (current.streamAllowed && current.exePath === exePath) {
    return { ok: true };
  }

  const consent = await dialog.showMessageBox({
    type: "question",
    title: "Stream firewall access",
    message: "????????? ??????? ?????? ??? stream-???????",
    detail: "?????? ???????? ???? ???. ?????????? ?????????? ??? ????????? ????????.",
    buttons: ["?????????", "??????"],
    defaultId: 0,
    cancelId: 1
  });
  if (consent.response !== 0) {
    return { ok: false, message: "Stream access cancelled" };
  }

  const ruleBaseName = "NES Netplay Stream";
  const deleteArgs = ["advfirewall", "firewall", "delete", "rule", `name=${ruleBaseName}`, `program=${exePath}`];
  await runNetsh(deleteArgs);

  const addTcp = await runNetsh([
    "advfirewall", "firewall", "add", "rule",
    `name=${ruleBaseName}`,
    "dir=in",
    "action=allow",
    `program=${exePath}`,
    "enable=yes",
    "profile=any",
    "protocol=TCP"
  ]);
  const addUdp = await runNetsh([
    "advfirewall", "firewall", "add", "rule",
    `name=${ruleBaseName}`,
    "dir=in",
    "action=allow",
    `program=${exePath}`,
    "enable=yes",
    "profile=any",
    "protocol=UDP"
  ]);

  if (!addTcp || !addUdp) {
    return {
      ok: false,
      message: "?? ??????? ???????? ??????? firewall. ??????? ?????????? ?? ?????????????? ? ???????."
    };
  }

  saveFirewallSettings({
    streamAllowed: true,
    exePath
  });
  return { ok: true };
}

function loadControls(): ControlSettings {
  return { ...defaultControls, ...readJsonFile<Partial<ControlSettings>>(getControlsFile(), {}) };
}

function saveControls(settings: ControlSettings): ControlSettings {
  const normalized = { ...defaultControls, ...settings };
  writeJsonFile(getControlsFile(), normalized);
  return normalized;
}

function loadAudioSettings(): AudioSettings {
  return { ...defaultAudioSettings, ...readJsonFile<Partial<AudioSettings>>(getAudioFile(), {}) };
}

function saveAudioSettings(settings: AudioSettings): AudioSettings {
  const normalized = {
    enabled: Boolean(settings.enabled),
    volume: Math.max(0, Math.min(100, Number(settings.volume) || 0)),
    latency: Math.max(0, Math.min(500, Number(settings.latency) || 0))
  };
  writeJsonFile(getAudioFile(), normalized);
  return normalized;
}

function loadVideoSettings(): VideoSettings {
  const raw = readJsonFile<Record<string, unknown>>(getVideoFile(), {});
  const rawTargetFps = Number(raw.targetFps ?? raw.fps ?? defaultVideoSettings.targetFps);
  const targetFps: VideoFps = rawTargetFps === 120 ? 120 : rawTargetFps === 30 ? 30 : 60;
  const smoothing =
    typeof raw.smoothing === "boolean"
      ? raw.smoothing
      : raw.pixelMode === "smooth";
  return {
    targetFps,
    smoothing
  };
}

function saveVideoSettings(settings: VideoSettings): VideoSettings {
  const normalized: VideoSettings = {
    targetFps: settings.targetFps === 120 || settings.targetFps === 30 ? settings.targetFps : 60,
    smoothing: Boolean(settings.smoothing)
  };
  writeJsonFile(getVideoFile(), normalized);
  return normalized;
}

function loadReplaySettings(): ReplaySettings {
  const defaults = defaultReplaySettings();
  const raw = readJsonFile<Partial<ReplaySettings>>(getReplaySettingsFile(), {});
  return {
    enabled: raw.enabled ?? defaults.enabled,
    hotkey: String(raw.hotkey || defaults.hotkey).toUpperCase(),
    prebufferSeconds: Math.max(5, Math.min(30, Number(raw.prebufferSeconds ?? defaults.prebufferSeconds))),
    quality: raw.quality === "1080p" ? "1080p" : "720p",
    fps: raw.fps === 60 ? 60 : 30,
    format: "webm",
    saveFolder: String(raw.saveFolder || defaults.saveFolder).trim() || defaults.saveFolder
  };
}

function saveReplaySettings(settings: ReplaySettings): ReplaySettings {
  const defaults = defaultReplaySettings();
  const normalized: ReplaySettings = {
    enabled: Boolean(settings.enabled),
    hotkey: String(settings.hotkey || defaults.hotkey).toUpperCase(),
    prebufferSeconds: Math.max(5, Math.min(30, Number(settings.prebufferSeconds) || defaults.prebufferSeconds)),
    quality: settings.quality === "1080p" ? "1080p" : "720p",
    fps: settings.fps === 60 ? 60 : 30,
    format: "webm",
    saveFolder: String(settings.saveFolder || defaults.saveFolder).trim() || defaults.saveFolder
  };
  writeJsonFile(getReplaySettingsFile(), normalized);
  return normalized;
}

function loadNetworkSettings(): NetworkSettings {
  const raw = readJsonFile<Partial<NetworkSettings>>(getNetworkFile(), {});
  return {
    signalingUrl: String(raw.signalingUrl || defaultNetworkSettings.signalingUrl).trim() || defaultNetworkSettings.signalingUrl,
    netplayMode: raw.netplayMode === "stream" ? "stream" : "lockstep"
  };
}

function saveNetworkSettings(settings: NetworkSettings): NetworkSettings {
  const normalized: NetworkSettings = {
    signalingUrl: String(settings.signalingUrl || defaultNetworkSettings.signalingUrl).trim() || defaultNetworkSettings.signalingUrl,
    netplayMode: settings.netplayMode === "stream" ? "stream" : "lockstep"
  };
  writeJsonFile(getNetworkFile(), normalized);
  return normalized;
}

function loadUiSettings(): UiSettings {
  const raw = readJsonFile<Partial<UiSettings>>(getUiSettingsFile(), {});
  const rawTheme = String(raw.theme || "").trim().toLowerCase();
  const normalizedTheme: UiSettings["theme"] =
    rawTheme === "pink" || rawTheme === "pink-cute"
      ? "pink"
      : rawTheme === "steam" || rawTheme === "steam-dark"
        ? "steam"
        : "blue";
  const retroAchievementsUsername = String(raw.retroAchievementsUsername || "").trim();
  return {
    controlPreset: raw.controlPreset === "gamepad" ? "gamepad" : "keyboard",
    libraryShowPlatformBadges: raw.libraryShowPlatformBadges ?? true,
    libraryEmulatorFilter:
      raw.libraryEmulatorFilter === "nes" ||
      raw.libraryEmulatorFilter === "snes" ||
      raw.libraryEmulatorFilter === "gb" ||
      raw.libraryEmulatorFilter === "gba" ||
      raw.libraryEmulatorFilter === "md"
        ? raw.libraryEmulatorFilter
        : "all",
    theme: normalizedTheme,
    retroAchievementsUsername,
    inviteSoundEnabled: typeof raw.inviteSoundEnabled === "boolean" ? raw.inviteSoundEnabled : true
  };
}

function saveUiSettings(settings: Partial<UiSettings>): UiSettings {
  const current = loadUiSettings();
  const incomingTheme = String((settings as { theme?: string }).theme || "").trim().toLowerCase();
  const normalizedTheme: UiSettings["theme"] =
    incomingTheme === "pink" || incomingTheme === "pink-cute"
      ? "pink"
      : incomingTheme === "steam" || incomingTheme === "steam-dark"
        ? "steam"
        : incomingTheme === "blue"
          ? "blue"
        : current.theme;
  const next: UiSettings = {
    controlPreset: settings.controlPreset === "gamepad" ? "gamepad" : settings.controlPreset === "keyboard" ? "keyboard" : current.controlPreset,
    libraryShowPlatformBadges: typeof settings.libraryShowPlatformBadges === "boolean" ? settings.libraryShowPlatformBadges : current.libraryShowPlatformBadges,
    libraryEmulatorFilter:
      settings.libraryEmulatorFilter === "nes" ||
      settings.libraryEmulatorFilter === "snes" ||
      settings.libraryEmulatorFilter === "gb" ||
      settings.libraryEmulatorFilter === "gba" ||
      settings.libraryEmulatorFilter === "md"
      ? settings.libraryEmulatorFilter
      : settings.libraryEmulatorFilter === "all"
        ? "all"
        : current.libraryEmulatorFilter,
    theme: normalizedTheme,
    retroAchievementsUsername: typeof settings.retroAchievementsUsername === "string"
      ? settings.retroAchievementsUsername.trim()
      : current.retroAchievementsUsername,
    inviteSoundEnabled: typeof settings.inviteSoundEnabled === "boolean"
      ? settings.inviteSoundEnabled
      : current.inviteSoundEnabled
  };
  writeJsonFile(getUiSettingsFile(), next);
  return next;
}

const RA_API_BASE_URL = "https://retroachievements.org/API";
const RA_SITE_BASE_URL = "https://retroachievements.org";
const RA_BADGE_BASE_URL = "https://media.retroachievements.org/Badge";
const RA_CACHE_TTL_MS = 5 * 60 * 1000;
const retroCache = new Map<string, { expiresAt: number; data: RetroGameAchievements }>();
const RA_API_KEY_FILE = "ra_api_key.bin";
let inMemoryRaApiKey = "";

function getRaApiKeyFile(): string {
  return userDataPath(RA_API_KEY_FILE);
}

function readRaApiKeyFromSecureStore(): string {
  const filePath = getRaApiKeyFile();
  if (!fs.existsSync(filePath) || !safeStorage.isEncryptionAvailable()) {
    return "";
  }
  try {
    const bytes = fs.readFileSync(filePath);
    if (!bytes.length) {
      return "";
    }
    return safeStorage.decryptString(bytes).trim();
  } catch {
    return "";
  }
}

function resolveRaApiKey(): { key: string; source: RetroApiKeyStatus["source"] } {
  if (inMemoryRaApiKey.trim()) {
    return { key: inMemoryRaApiKey.trim(), source: "memory" };
  }
  const envKey = String(process.env.RA_API_KEY || "").trim();
  if (envKey) {
    return { key: envKey, source: "env" };
  }
  const storedKey = readRaApiKeyFromSecureStore();
  if (storedKey) {
    return { key: storedKey, source: "secure-store" };
  }
  return { key: "", source: "none" };
}

function getRetroApiKeyStatus(): RetroApiKeyStatus {
  const resolved = resolveRaApiKey();
  if (!resolved.key) {
    return { configured: false, source: "none", persistent: false };
  }
  if (resolved.source === "env") {
    return { configured: true, source: "env", persistent: true };
  }
  if (resolved.source === "secure-store") {
    return { configured: true, source: "secure-store", persistent: true };
  }
  return { configured: true, source: "memory", persistent: false };
}

function setRetroApiKeySecure(apiKeyRaw: string): RetroApiKeyStatus {
  const apiKey = String(apiKeyRaw || "").trim();
  const filePath = getRaApiKeyFile();
  if (!apiKey) {
    inMemoryRaApiKey = "";
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
    return getRetroApiKeyStatus();
  }

  if (!safeStorage.isEncryptionAvailable()) {
    inMemoryRaApiKey = apiKey;
    return getRetroApiKeyStatus();
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const encrypted = safeStorage.encryptString(apiKey);
  fs.writeFileSync(filePath, encrypted);
  inMemoryRaApiKey = "";
  return getRetroApiKeyStatus();
}

function parseRaNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseUnlockedAt(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return undefined;
}

function normalizeRaAchievements(rawAchievements: unknown, includeUserProgress: boolean): RetroAchievement[] {
  const rows = Array.isArray(rawAchievements)
    ? rawAchievements
    : rawAchievements && typeof rawAchievements === "object"
      ? Object.values(rawAchievements as Record<string, unknown>)
      : [];

  return rows
    .map((raw): RetroAchievement | null => {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const obj = raw as Record<string, unknown>;
      const id = parseRaNumber(obj.ID ?? obj.AchievementID ?? obj.Id);
      if (!id) {
        return null;
      }
      const badgeName = String(obj.BadgeName || obj.Badge || "").trim();
      const unlockedAt = parseUnlockedAt(obj.DateEarned ?? obj.DateEarnedHardcore ?? obj.DateUnlocked);
      return {
        id,
        title: String(obj.Title || obj.Name || `Achievement #${id}`),
        description: String(obj.Description || ""),
        points: parseRaNumber(obj.Points),
        badgeUrl: badgeName ? `${RA_BADGE_BASE_URL}/${badgeName}.png` : "",
        isUnlocked: includeUserProgress ? Boolean(unlockedAt) : false,
        unlockedAt
      };
    })
    .filter((item): item is RetroAchievement => Boolean(item));
}

function normalizeRaGameResponse(gameId: number, payload: unknown, includeUserProgress: boolean): RetroGameAchievements {
  const obj = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const achievements = normalizeRaAchievements(obj.Achievements, includeUserProgress);
  const unlockedAchievements = achievements.filter((item) => item.isUnlocked).length;
  const totalPoints = achievements.reduce((sum, item) => sum + item.points, 0);
  const raImageUrl = (value: unknown): string | null => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${RA_SITE_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
  };

  return {
    gameId,
    gameTitle: String(obj.Title || obj.GameTitle || `Game #${gameId}`),
    consoleName: String(obj.ConsoleName || obj.Console || ""),
    totalAchievements: achievements.length,
    totalPoints,
    unlockedAchievements,
    images: {
      icon: raImageUrl(obj.ImageIcon),
      title: raImageUrl(obj.ImageTitle),
      boxArt: raImageUrl(obj.ImageBoxArt),
      inGame: raImageUrl(obj.ImageIngame)
    },
    achievements
  };
}

async function requestRetroApi(pathName: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = resolveRaApiKey().key;
  if (!apiKey) {
    throw new Error("RetroAchievements API key is not configured. Set it in Settings or RA_API_KEY environment.");
  }
  const url = new URL(`${RA_API_BASE_URL}/${pathName}`);
  const query = new URLSearchParams({ ...params, y: apiKey });
  url.search = query.toString();
  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error("RetroAchievements network error");
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("RetroAchievements rate limit reached (429)");
    }
    if (response.status >= 500) {
      throw new Error(`RetroAchievements server error (${response.status})`);
    }
    throw new Error(`RetroAchievements request failed (${response.status})`);
  }
  return response.json();
}

function isRaErrorPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  const rawError = obj.Error ?? obj.error ?? obj.Message ?? obj.message;
  if (typeof rawError === "string" && rawError.trim()) {
    return rawError.trim();
  }
  return null;
}

async function requestRetroApiWithFallback(
  pathName: string,
  variants: Array<Record<string, string>>
): Promise<unknown> {
  let lastError: Error | null = null;
  for (const params of variants) {
    try {
      const payload = await requestRetroApi(pathName, params);
      const payloadError = isRaErrorPayload(payload);
      if (payloadError) {
        lastError = new Error(payloadError);
        continue;
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("RetroAchievements request failed");
    }
  }
  throw lastError ?? new Error("RetroAchievements request failed");
}

async function fetchRetroGameAchievements(gameId: number, username?: string): Promise<RetroGameAchievements> {
  const normalizedUsername = String(username || "").trim();
  const cacheKey = `${gameId}:${normalizedUsername.toLowerCase()}`;
  const cached = retroCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const payload = normalizedUsername
    ? await requestRetroApiWithFallback("API_GetGameInfoAndUserProgress.php", [
      { g: String(gameId), u: normalizedUsername },
      { g: String(gameId), z: normalizedUsername }
    ])
    : await requestRetroApiWithFallback("API_GetGame.php", [
      { i: String(gameId) },
      { g: String(gameId) }
    ]);

  const normalized = normalizeRaGameResponse(gameId, payload, Boolean(normalizedUsername));
  retroCache.set(cacheKey, { expiresAt: Date.now() + RA_CACHE_TTL_MS, data: normalized });
  return normalized;
}

class SignalClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private profile: Profile | null = null;
  private activeUrl = "";

  private rejectAllPending(error: Error): void {
    for (const [requestId, entry] of this.pending.entries()) {
      this.pending.delete(requestId);
      entry.reject(error);
    }
  }

  reset(): void {
    try {
      this.ws?.close();
    } catch {
      // noop
    }
    this.rejectAllPending(new Error("Signaling connection closed"));
    this.ws = null;
    this.activeUrl = "";
  }

  async connect(profile: Profile): Promise<void> {
    this.profile = profile;
    const fromSettings = loadNetworkSettings().signalingUrl;
    const url = fromSettings || process.env.SIGNALING_URL || process.env.VITE_SIGNALING_URL || defaultNetworkSettings.signalingUrl;

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.activeUrl === url) {
      return;
    }

    this.reset();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      this.activeUrl = url;
      let settled = false;

      const cleanup = (): void => {
        ws.removeAllListeners("open");
        ws.removeAllListeners("error");
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.reset();
        reject(error);
      };

      ws.once("open", () => {
        const requestId = uuidv4();
        const timeoutId = setTimeout(() => {
          const pending = this.pending.get(requestId);
          if (pending) {
            this.pending.delete(requestId);
            fail(new Error("Auth timeout"));
          }
        }, 10000);

        this.pending.set(requestId, {
          resolve: () => {
            clearTimeout(timeoutId);
            if (!settled) {
              settled = true;
              cleanup();
              resolve();
            }
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            fail(error);
          }
        });

        this.send("auth", {
          userId: profile.userId,
          displayName: profile.displayName,
          friendCode: profile.friendCode,
          avatarDataUrl: profile.avatarDataUrl
        }, requestId);
      });

      ws.once("error", (err: Error) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      ws.on("close", () => {
        this.rejectAllPending(new Error("Signaling connection closed"));
        this.ws = null;
        this.activeUrl = "";
      });

      ws.on("message", (raw: WebSocket.RawData) => {
        try {
          const data = JSON.parse(String(raw)) as WsResponse;
          if (data.type === "response" && data.requestId) {
            const entry = this.pending.get(data.requestId);
            if (entry) {
              this.pending.delete(data.requestId);
              if (data.ok) {
                entry.resolve(data.payload);
              } else {
                entry.reject(new Error(data.error || "Request failed"));
              }
            }
          }
        } catch {
          // ignore malformed server messages in MVP
        }
      });
    });
  }

  async request(type: string, payload?: Record<string, unknown>): Promise<unknown> {
    if (!this.profile) {
      throw new Error("Profile is not initialized");
    }
    await this.connect(this.profile);

    const requestId = uuidv4();
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          pending.reject(new Error("Signaling timeout"));
        }
      }, 10000);
    });

    this.send(type, payload || {}, requestId);
    return result;
  }

  private send(type: string, payload: Record<string, unknown>, requestId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ type, requestId, payload }));
  }
}

let mainWindow: BrowserWindow | null = null;
const signalClient = new SignalClient();

function randomFriendCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function getCoversDir(): string {
  return userDataPath("covers");
}

function normalizeGameTitle(rawName: string): string {
  return String(rawName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*]/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colorByPlatform(platform: Platform): { from: string; to: string } {
  if (platform === "SNES") return { from: "#4f46e5", to: "#7c3aed" };
  if (platform === "GB") return { from: "#16a34a", to: "#15803d" };
  if (platform === "GBA") return { from: "#0ea5e9", to: "#2563eb" };
  if (platform === "MD") return { from: "#f97316", to: "#ea580c" };
  return { from: "#ef4444", to: "#dc2626" };
}

function buildAutoCoverSvg(game: Pick<GameRecord, "name" | "platform">): string {
  const palette = colorByPlatform(game.platform);
  const title = escapeXml(game.name || "Unknown Game");
  const platform = escapeXml(game.platform);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect x="20" y="20" width="600" height="320" rx="18" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.2)"/>
  <text x="38" y="88" fill="#ffffff" font-size="28" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${platform}</text>
  <text x="38" y="152" fill="#ffffff" font-size="36" font-family="Segoe UI, Arial, sans-serif" font-weight="800">${title}</text>
</svg>`;
}

function ensureAutoCover(game: GameRecord): GameRecord {
  if (game.hasCover || game.coverFileName) {
    return game;
  }
  const coverDir = getCoversDir();
  fs.mkdirSync(coverDir, { recursive: true });
  const coverFileName = `${game.id}.svg`;
  const coverPath = path.join(coverDir, coverFileName);
  if (!fs.existsSync(coverPath)) {
    const svg = buildAutoCoverSvg(game);
    fs.writeFileSync(coverPath, svg, "utf-8");
  }
  return {
    ...game,
    coverFileName,
    hasCover: true
  };
}

function removeExistingCovers(gameId: string): void {
  const coverDir = getCoversDir();
  if (!fs.existsSync(coverDir)) {
    return;
  }
  for (const fileName of fs.readdirSync(coverDir)) {
    if (fileName.startsWith(`${gameId}.`)) {
      fs.rmSync(path.join(coverDir, fileName), { force: true });
    }
  }
}

function getCoverPathByFileName(fileName?: string): string | null {
  if (!fileName) {
    return null;
  }
  const targetPath = path.join(getCoversDir(), fileName);
  return fs.existsSync(targetPath) ? targetPath : null;
}

function resolveCoverPath(game: GameRecord): string | null {
  const byName = getCoverPathByFileName(game.coverFileName);
  if (byName) {
    return byName;
  }
  const coverDir = getCoversDir();
  if (!fs.existsSync(coverDir)) {
    return null;
  }
  const matched = fs.readdirSync(coverDir).find((fileName) => fileName.startsWith(`${game.id}.`));
  return matched ? path.join(coverDir, matched) : null;
}

function loadLibrary(): GameRecord[] {
  const items = readJsonFile<GameRecord[]>(getLibraryFile(), []);
  let changed = false;
  const normalized = items.map((item) => {
    const ext = normalizeExt(path.extname(item.path || ""));
    const detected = detectEmulatorByExt(ext);
    const fallbackByPlatform: EmulatorId =
      item.platform === "SNES"
        ? "snes"
        : item.platform === "GB"
          ? "gb"
          : item.platform === "GBA"
            ? "gba"
            : item.platform === "MD"
              ? "md"
              : "nes";
    const nextEmulatorId: EmulatorId =
      item.emulatorId === "nes" ||
      item.emulatorId === "snes" ||
      item.emulatorId === "gb" ||
      item.emulatorId === "gba" ||
      item.emulatorId === "md"
      ? item.emulatorId
      : (detected ?? fallbackByPlatform);

    let coverFileName = item.coverFileName;
    if (!coverFileName && (item as GameRecord & { coverPath?: string }).coverPath) {
      const oldPath = (item as GameRecord & { coverPath?: string }).coverPath;
      if (oldPath) {
        const oldName = path.basename(oldPath);
        if (oldName.startsWith(`${item.id}.`)) {
          coverFileName = oldName;
        }
      }
    }

    if (!coverFileName) {
      const coverDir = getCoversDir();
      if (fs.existsSync(coverDir)) {
        const matched = fs.readdirSync(coverDir).find((fileName) => fileName.startsWith(`${item.id}.`));
        if (matched) {
          coverFileName = matched;
        }
      }
    }

    const coverPath = getCoverPathByFileName(coverFileName);
    const hasCover = Boolean(coverPath);
    const parsedRaId = Number((item as GameRecord & { retroAchievementsGameId?: unknown }).retroAchievementsGameId);
    const retroAchievementsGameId = Number.isFinite(parsedRaId) && parsedRaId > 0 ? Math.floor(parsedRaId) : undefined;
    const next: GameRecord = {
      ...item,
      platform: emulatorToPlatform(nextEmulatorId),
      emulatorId: nextEmulatorId,
      coverFileName: hasCover ? coverFileName : undefined,
      hasCover,
      retroAchievementsGameId
    };
    if (
      item.emulatorId !== next.emulatorId ||
      item.platform !== next.platform ||
      item.coverFileName !== next.coverFileName ||
      item.hasCover !== next.hasCover ||
      item.retroAchievementsGameId !== next.retroAchievementsGameId ||
      Object.prototype.hasOwnProperty.call(item as unknown as object, "coverPath")
    ) {
      changed = true;
    }
    return next;
  });

  if (changed) {
    saveLibrary(normalized);
  }

  return normalized;
}

function saveLibrary(items: GameRecord[]): void {
  writeJsonFile(getLibraryFile(), items);
}

function validateGameLaunch(game: GameRecord): { ok: true } | { ok: false; reason: string } {
  if (!game.path) {
    return { ok: false, reason: "ROM path is empty" };
  }
  if (!fs.existsSync(game.path)) {
    return { ok: false, reason: "ROM file not found" };
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(game.path);
  } catch {
    return { ok: false, reason: "ROM file is not accessible" };
  }
  if (!stats.isFile()) {
    return { ok: false, reason: "ROM path is not a file" };
  }

  const ext = normalizeExt(path.extname(game.path));
  if (!ext) {
    return { ok: false, reason: "ROM extension is missing" };
  }

  if (!isExtSupportedByEmulator(ext, game.emulatorId)) {
    const recommended = detectEmulatorByExt(ext);
    if (recommended) {
      return {
        ok: false,
        reason: `ROM ${ext} is incompatible with ${game.emulatorId.toUpperCase()}. Use ${recommended.toUpperCase()}.`
      };
    }
    return { ok: false, reason: `Unsupported ROM extension ${ext}` };
  }

  return { ok: true };
}

function loadOrCreateProfile(): Profile {
  const filePath = getProfileFile();
  const existing = readJsonFile<Profile | null>(filePath, null);
  if (existing?.userId && existing.friendCode && existing.displayName) {
    const normalized: Profile = {
      userId: existing.userId,
      displayName: existing.displayName,
      friendCode: existing.friendCode,
      avatarDataUrl: typeof existing.avatarDataUrl === "string" ? existing.avatarDataUrl : undefined
    };
    if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
      writeJsonFile(filePath, normalized);
    }
    return normalized;
  }

  const profile: Profile = {
    userId: uuidv4(),
    displayName: `Player-${Math.floor(Math.random() * 10000)}`,
    friendCode: randomFriendCode()
  };
  writeJsonFile(filePath, profile);
  return profile;
}

function resolveWindowIconPath(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(path.dirname(process.execPath), "resources", "app.asar.unpacked", "build", "icon.ico"),
    path.join(process.resourcesPath, "build", "icon.ico"),
    path.join(process.resourcesPath, "app.asar.unpacked", "build", "icon.ico")
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // noop
    }
  }
  return undefined;
}

function createMainWindow(): void {
  const icon = resolveWindowIconPath();
  mainWindow = new BrowserWindow({
    title: appDisplayName,
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: "#1B1E24",
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }
  console.info("Auto-updater: using electron-builder publish config from package metadata");

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("Auto-updater error:", error);
  });

  autoUpdater.on("update-downloaded", () => {
    void dialog.showMessageBox({
      type: "info",
      title: "Update ready",
      message: "An update has been downloaded.",
      detail: "Restart now to apply the new version.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    console.error("Failed to check updates:", error);
  });

  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 1000 * 60 * 60 * 4);
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.mvp.nesnetplay2");
  const profile = loadOrCreateProfile();
  void signalClient.connect(profile).catch(() => {
    // server may not be running in local setup
  });

  createMainWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
});

ipcMain.handle("profile:get", async (): Promise<Profile> => {
  return loadOrCreateProfile();
});

ipcMain.handle("profile:update", async (_event, displayName: string): Promise<Profile> => {
  const profile = loadOrCreateProfile();
  const next: Profile = {
    ...profile,
    displayName: displayName.trim() || profile.displayName
  };
  writeJsonFile(getProfileFile(), next);
  await signalClient.connect(next).catch(() => undefined);
  return next;
});

ipcMain.handle("profile:updateAvatar", async (_event, avatarDataUrl?: string): Promise<Profile> => {
  const profile = loadOrCreateProfile();
  const normalizedAvatar =
    typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:image/")
      ? avatarDataUrl
      : undefined;
  const next: Profile = {
    ...profile,
    avatarDataUrl: normalizedAvatar
  };
  writeJsonFile(getProfileFile(), next);
  return next;
});

ipcMain.handle("games:add", async (): Promise<GameRecord | null> => {
  const selected = await dialog.showOpenDialog({
    title: "Add ROM",
    properties: ["openFile"],
    filters: [
      { name: "ROM", extensions: ["nes", "sfc", "smc", "gb", "gbc", "gba", "md", "gen", "bin"] }
    ]
  });

  if (selected.canceled || selected.filePaths.length === 0) {
    return null;
  }

  const filePath = selected.filePaths[0];
  const ext = normalizeExt(path.extname(filePath));
  const emulatorId = detectEmulatorByExt(ext);
  if (!emulatorId) {
    return null;
  }
  const platform = emulatorToPlatform(emulatorId);

  const bytes = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const now = new Date().toISOString();

  const game: GameRecord = {
    id: uuidv4(),
    name: normalizeGameTitle(path.basename(filePath, ext)),
    path: filePath,
    platform,
    emulatorId,
    sha256: hash,
    addedAt: now,
    totalPlayTime: 0
  };

  const library = loadLibrary();
  const exists = library.find((item) => item.sha256 === hash);
  if (exists) {
    return exists;
  }

  const withAutoCover = ensureAutoCover(game);
  library.unshift(withAutoCover);
  saveLibrary(library);
  return withAutoCover;
});

ipcMain.handle("games:list", async (): Promise<GameRecord[]> => {
  return loadLibrary();
});

ipcMain.handle("games:remove", async (_event, gameId: string): Promise<GameRecord[]> => {
  const library = loadLibrary().filter((game) => game.id !== gameId);
  saveLibrary(library);
  return library;
});

ipcMain.handle("games:updateEmulator", async (_event, gameId: string, emulatorId: EmulatorId): Promise<GameRecord> => {
  if (emulatorId !== "nes" && emulatorId !== "snes" && emulatorId !== "gb" && emulatorId !== "gba" && emulatorId !== "md") {
    throw new Error("Unsupported emulator id");
  }
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }
  const updated: GameRecord = {
    ...library[index],
    emulatorId,
    platform: emulatorToPlatform(emulatorId)
  };
  library[index] = updated;
  saveLibrary(library);
  return updated;
});

ipcMain.handle("games:updateRetroId", async (_event, gameId: string, retroAchievementsGameId?: number | null): Promise<GameRecord> => {
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }
  const parsed = Number(retroAchievementsGameId);
  const normalizedRetroId = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  const updated: GameRecord = {
    ...library[index],
    retroAchievementsGameId: normalizedRetroId
  };
  library[index] = updated;
  saveLibrary(library);
  return updated;
});

ipcMain.handle("games:setCover", async (_event, gameId: string, dataUrl: string): Promise<GameRecord> => {
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }

  const [, base64] = dataUrl.split(",");
  if (!base64) {
    throw new Error("Invalid image payload");
  }

  const coverDir = getCoversDir();
  fs.mkdirSync(coverDir, { recursive: true });
  removeExistingCovers(gameId);
  const coverFileName = `${gameId}.png`;
  const coverPath = path.join(coverDir, coverFileName);
  fs.writeFileSync(coverPath, Buffer.from(base64, "base64"));

  library[index] = { ...library[index], coverFileName, hasCover: true };
  saveLibrary(library);
  return library[index];
});

ipcMain.handle("games:openRomFolder", async (_event, gameId: string): Promise<boolean> => {
  const game = loadLibrary().find((item) => item.id === gameId);
  if (!game) {
    return false;
  }
  shell.showItemInFolder(game.path);
  return true;
});

ipcMain.handle("games:checkLaunch", async (_event, gameId: string): Promise<{ ok: boolean; reason?: string }> => {
  const game = loadLibrary().find((item) => item.id === gameId);
  if (!game) {
    return { ok: false, reason: "Game not found" };
  }
  const validation = validateGameLaunch(game);
  return validation.ok ? { ok: true } : validation;
});

ipcMain.handle("games:startLocal", async (_event, gameId: string): Promise<{ game: GameRecord; romBase64: string }> => {
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }

  const game = library[index];
  const validation = validateGameLaunch(game);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  const bytes = fs.readFileSync(game.path);

  library[index] = {
    ...game,
    lastPlayedAt: new Date().toISOString()
  };
  saveLibrary(library);

  return {
    game,
    romBase64: bytes.toString("base64")
  };
});

ipcMain.handle("window:setFullscreen", async (_event, enabled: boolean): Promise<boolean> => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!win) {
    return false;
  }
  win.setFullScreen(Boolean(enabled));
  return true;
});

ipcMain.handle("settings:getControls", async (): Promise<ControlSettings> => {
  return loadControls();
});

ipcMain.handle("settings:saveControls", async (_event, payload: Partial<Record<ControlAction, string>>): Promise<ControlSettings> => {
  const next = { ...loadControls(), ...payload };
  return saveControls(next);
});

ipcMain.handle("settings:getAudio", async (): Promise<AudioSettings> => {
  return loadAudioSettings();
});

ipcMain.handle("settings:saveAudio", async (_event, payload: Partial<AudioSettings>): Promise<AudioSettings> => {
  const next = { ...loadAudioSettings(), ...payload };
  return saveAudioSettings(next);
});

ipcMain.handle("settings:getVideo", async (): Promise<VideoSettings> => {
  return loadVideoSettings();
});

ipcMain.handle("settings:saveVideo", async (_event, payload: Partial<VideoSettings>): Promise<VideoSettings> => {
  const next = { ...loadVideoSettings(), ...payload };
  return saveVideoSettings(next as VideoSettings);
});

ipcMain.handle("settings:getNetwork", async (): Promise<NetworkSettings> => {
  return loadNetworkSettings();
});

ipcMain.handle("settings:saveNetwork", async (_event, payload: Partial<NetworkSettings>): Promise<NetworkSettings> => {
  const next = { ...loadNetworkSettings(), ...payload };
  const saved = saveNetworkSettings(next as NetworkSettings);
  signalClient.reset();
  return saved;
});

ipcMain.handle("settings:getUi", async (): Promise<UiSettings> => {
  return loadUiSettings();
});

ipcMain.handle("settings:saveUi", async (_event, payload: Partial<UiSettings>): Promise<UiSettings> => {
  return saveUiSettings(payload);
});

ipcMain.handle("settings:getRaApiKeyStatus", async (): Promise<RetroApiKeyStatus> => {
  return getRetroApiKeyStatus();
});

ipcMain.handle("settings:setRaApiKey", async (_event, apiKey: string): Promise<RetroApiKeyStatus> => {
  const next = setRetroApiKeySecure(apiKey);
  retroCache.clear();
  return next;
});

ipcMain.handle("settings:clearRaApiKey", async (): Promise<RetroApiKeyStatus> => {
  const next = setRetroApiKeySecure("");
  retroCache.clear();
  return next;
});

ipcMain.handle(
  "ra:getGameData",
  async (
    _event,
    payload: { gameId: number; username?: string }
  ): Promise<RetroGameAchievements> => {
    const gameId = Number(payload?.gameId);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      throw new Error("RetroAchievements gameId is required");
    }
    return fetchRetroGameAchievements(Math.floor(gameId), payload?.username);
  }
);

ipcMain.handle("settings:getReplay", async (): Promise<ReplaySettings> => {
  return loadReplaySettings();
});

ipcMain.handle("settings:saveReplay", async (_event, payload: Partial<ReplaySettings>): Promise<ReplaySettings> => {
  const next = { ...loadReplaySettings(), ...payload };
  return saveReplaySettings(next);
});

ipcMain.handle("server:connect", async (_event, signalingUrl?: string): Promise<boolean> => {
  const candidate = String(signalingUrl || "").trim();
  if (candidate) {
    const current = loadNetworkSettings();
    saveNetworkSettings({ ...current, signalingUrl: candidate });
  }
  const profile = loadOrCreateProfile();
  signalClient.reset();
  await signalClient.connect(profile);
  return true;
});

ipcMain.handle("network:ensureStreamFirewallAccess", async (): Promise<{ ok: boolean; message?: string }> => {
  return ensureStreamFirewallAccess();
});

ipcMain.handle("covers:pick", async (_event, gameId: string): Promise<GameRecord | null> => {
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }

  const selected = await dialog.showOpenDialog({
    title: "Select cover image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  if (selected.canceled || selected.filePaths.length === 0) {
    return null;
  }

  const sourcePath = selected.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase() || ".png";
  const coverDir = getCoversDir();
  fs.mkdirSync(coverDir, { recursive: true });
  removeExistingCovers(gameId);

  const targetPath = path.join(coverDir, `${gameId}${ext}`);
  fs.copyFileSync(sourcePath, targetPath);
  library[index] = { ...library[index], coverFileName: path.basename(targetPath), hasCover: true };
  saveLibrary(library);
  return library[index];
});

ipcMain.handle("covers:remove", async (_event, gameId: string): Promise<GameRecord> => {
  const library = loadLibrary();
  const index = library.findIndex((item) => item.id === gameId);
  if (index < 0) {
    throw new Error("Game not found");
  }

  const game = library[index];
  removeExistingCovers(gameId);
  library[index] = { ...game, coverFileName: undefined, hasCover: false };
  saveLibrary(library);
  return library[index];
});

ipcMain.handle("covers:getCoverDataUrl", async (_event, gameId: string): Promise<string | null> => {
  const game = loadLibrary().find((item) => item.id === gameId);
  if (!game || !game.hasCover) {
    return null;
  }
  const coverPath = resolveCoverPath(game);
  if (!coverPath) {
    return null;
  }
  const bytes = fs.readFileSync(coverPath);
  const ext = path.extname(coverPath).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".svg"
          ? "image/svg+xml"
          : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
});

ipcMain.handle(
  "replays:save",
  async (
    _event,
    payload: {
      suggestedName: string;
      bytes: Uint8Array;
      meta?: {
        emulatorId: EmulatorId;
        romHash: string;
        gameId: string;
        roomId?: string;
        mode: "solo" | "room";
        createdAt: string;
      };
    }
  ): Promise<{ path: string; metaPath?: string }> => {
    const settings = loadReplaySettings();
    const baseName = path.basename(payload.suggestedName || "replay.webm").replace(/[<>:\"/\\|?*]/g, "_");
    const finalName = baseName.toLowerCase().endsWith(".webm") ? baseName : `${baseName}.webm`;
    const dir = settings.saveFolder || userDataPath("replays");
    fs.mkdirSync(dir, { recursive: true });
    const outputPath = path.join(dir, finalName);
    fs.writeFileSync(outputPath, Buffer.from(payload.bytes));
    let metaPath: string | undefined;
    if (payload.meta) {
      metaPath = `${outputPath}.json`;
      writeJsonFile(metaPath, payload.meta);
    }
    return { path: outputPath, metaPath };
  }
);

ipcMain.handle("replays:openFolder", async (): Promise<boolean> => {
  const settings = loadReplaySettings();
  const dir = settings.saveFolder || userDataPath("replays");
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return true;
});

ipcMain.handle("replays:openSavedFile", async (_event, filePath: string): Promise<boolean> => {
  if (!filePath) {
    return false;
  }
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("room:create", async (_event, gameId: string): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:create", { gameId });
  return payload as RoomState;
});

ipcMain.handle("room:join", async (_event, roomId: string, spectator?: boolean): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:join", { roomId, spectator: Boolean(spectator) });
  return payload as RoomState;
});

ipcMain.handle("room:getState", async (_event, roomId: string): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:state", { roomId });
  return payload as RoomState;
});

ipcMain.handle("room:close", async (_event, roomId: string): Promise<boolean> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  await signalClient.request("room:close", { roomId });
  return true;
});

ipcMain.handle("room:setReady", async (_event, roomId: string, ready: boolean): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:ready", { roomId, ready });
  return payload as RoomState;
});

ipcMain.handle("room:setLock", async (_event, roomId: string, locked: boolean): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:lock", { roomId, locked });
  return payload as RoomState;
});

ipcMain.handle("room:kick", async (_event, roomId: string, targetUserId: string): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:kick", { roomId, targetUserId });
  return payload as RoomState;
});

ipcMain.handle("room:transferHost", async (_event, roomId: string, targetUserId: string): Promise<RoomState> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:transferHost", { roomId, targetUserId });
  return payload as RoomState;
});

ipcMain.handle("room:getChatHistory", async (_event, roomId: string): Promise<Array<{
  id: string;
  roomId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
}>> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  const payload = await signalClient.request("room:chat:history", { roomId });
  return payload as Array<{
    id: string;
    roomId: string;
    fromUserId: string;
    fromDisplayName: string;
    text: string;
    createdAt: string;
  }>;
});

ipcMain.handle("room:sendChat", async (_event, roomId: string, text: string): Promise<boolean> => {
  const profile = loadOrCreateProfile();
  await signalClient.connect(profile);
  await signalClient.request("room:chat:send", { roomId, text });
  return true;
});




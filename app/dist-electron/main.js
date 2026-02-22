"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const uuid_1 = require("uuid");
const ws_1 = __importDefault(require("ws"));
function normalizeExt(ext) {
    const trimmed = ext.trim().toLowerCase();
    if (!trimmed)
        return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}
function detectEmulatorByExt(ext) {
    const normalized = normalizeExt(ext);
    if (normalized === ".nes")
        return "nes";
    if (normalized === ".sfc" || normalized === ".smc")
        return "snes";
    return null;
}
function emulatorToPlatform(emulatorId) {
    return emulatorId === "snes" ? "SNES" : "NES";
}
function isExtSupportedByEmulator(ext, emulatorId) {
    const normalized = normalizeExt(ext);
    if (emulatorId === "nes")
        return normalized === ".nes";
    return normalized === ".sfc" || normalized === ".smc";
}
const defaultControls = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    a: "KeyZ",
    b: "KeyX",
    start: "Enter",
    select: "ShiftRight"
};
const defaultAudioSettings = {
    enabled: true,
    volume: 80,
    latency: 0
};
const defaultVideoSettings = {
    fullscreen: true,
    scale: "fit",
    pixelMode: "nearest",
    crtEnabled: false,
    scanlinesIntensity: 35,
    bloom: 0,
    vignette: false,
    colorCorrection: false
};
const defaultNetworkSettings = {
    signalingUrl: process.env.SIGNALING_URL || process.env.VITE_SIGNALING_URL || "ws://localhost:8787",
    netplayMode: "lockstep"
};
const defaultReplaySettings = () => ({
    enabled: true,
    hotkey: "F8",
    prebufferSeconds: 10,
    quality: "720p",
    fps: 30,
    format: "webm",
    saveFolder: userDataPath("replays")
});
const defaultUiSettings = {
    controlPreset: "keyboard",
    libraryShowPlatformBadges: true,
    libraryEmulatorFilter: "all",
    theme: "blue",
    retroAchievementsUsername: ""
};
function formatDisplayVersion(version) {
    const [majorRaw, , patchRaw] = version.split(".");
    const major = Number(majorRaw) || 1;
    const patch = Number(patchRaw) || 0;
    return `${major}.${String(patch).padStart(2, "0")}`;
}
const appDisplayVersion = formatDisplayVersion(electron_1.app.getVersion());
const appDisplayName = `NES Emulator ${appDisplayVersion}`;
function userDataPath(...parts) {
    return path.join(electron_1.app.getPath("userData"), ...parts);
}
function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function writeJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
function getLibraryFile() {
    return userDataPath("library.json");
}
function getProfileFile() {
    return userDataPath("profile.json");
}
function getControlsFile() {
    return userDataPath("settings.controls.json");
}
function getAudioFile() {
    return userDataPath("settings.audio.json");
}
function getVideoFile() {
    return userDataPath("settings.video.json");
}
function getNetworkFile() {
    return userDataPath("settings.network.json");
}
function getUiSettingsFile() {
    return userDataPath("settings.ui.json");
}
function getReplaySettingsFile() {
    return userDataPath("settings.replay.json");
}
function getFirewallSettingsFile() {
    return userDataPath("settings.firewall.json");
}
function loadFirewallSettings() {
    const raw = readJsonFile(getFirewallSettingsFile(), {});
    return {
        streamAllowed: Boolean(raw.streamAllowed),
        exePath: String(raw.exePath || "")
    };
}
function saveFirewallSettings(settings) {
    const normalized = {
        streamAllowed: Boolean(settings.streamAllowed),
        exePath: String(settings.exePath || "")
    };
    writeJsonFile(getFirewallSettingsFile(), normalized);
    return normalized;
}
function runNetsh(args) {
    return new Promise((resolve) => {
        (0, child_process_1.execFile)("netsh", args, { windowsHide: true }, (error) => {
            resolve(!error);
        });
    });
}
async function ensureStreamFirewallAccess() {
    if (process.platform !== "win32" || !electron_1.app.isPackaged) {
        return { ok: true };
    }
    const exePath = process.execPath;
    const current = loadFirewallSettings();
    if (current.streamAllowed && current.exePath === exePath) {
        return { ok: true };
    }
    const consent = await electron_1.dialog.showMessageBox({
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
function loadControls() {
    return { ...defaultControls, ...readJsonFile(getControlsFile(), {}) };
}
function saveControls(settings) {
    const normalized = { ...defaultControls, ...settings };
    writeJsonFile(getControlsFile(), normalized);
    return normalized;
}
function loadAudioSettings() {
    return { ...defaultAudioSettings, ...readJsonFile(getAudioFile(), {}) };
}
function saveAudioSettings(settings) {
    const normalized = {
        enabled: Boolean(settings.enabled),
        volume: Math.max(0, Math.min(100, Number(settings.volume) || 0)),
        latency: Math.max(0, Math.min(500, Number(settings.latency) || 0))
    };
    writeJsonFile(getAudioFile(), normalized);
    return normalized;
}
function loadVideoSettings() {
    const raw = readJsonFile(getVideoFile(), {});
    return {
        fullscreen: raw.fullscreen ?? defaultVideoSettings.fullscreen,
        scale: raw.scale === "2x" || raw.scale === "3x" || raw.scale === "4x" || raw.scale === "fit" ? raw.scale : defaultVideoSettings.scale,
        pixelMode: raw.pixelMode === "smooth" ? "smooth" : "nearest",
        crtEnabled: Boolean(raw.crtEnabled),
        scanlinesIntensity: Math.max(0, Math.min(100, Number(raw.scanlinesIntensity ?? defaultVideoSettings.scanlinesIntensity))),
        bloom: Math.max(0, Math.min(100, Number(raw.bloom ?? defaultVideoSettings.bloom))),
        vignette: Boolean(raw.vignette),
        colorCorrection: Boolean(raw.colorCorrection)
    };
}
function saveVideoSettings(settings) {
    const normalized = {
        fullscreen: Boolean(settings.fullscreen),
        scale: settings.scale === "2x" || settings.scale === "3x" || settings.scale === "4x" || settings.scale === "fit" ? settings.scale : defaultVideoSettings.scale,
        pixelMode: settings.pixelMode === "smooth" ? "smooth" : "nearest",
        crtEnabled: Boolean(settings.crtEnabled),
        scanlinesIntensity: Math.max(0, Math.min(100, Number(settings.scanlinesIntensity) || 0)),
        bloom: Math.max(0, Math.min(100, Number(settings.bloom) || 0)),
        vignette: Boolean(settings.vignette),
        colorCorrection: Boolean(settings.colorCorrection)
    };
    writeJsonFile(getVideoFile(), normalized);
    return normalized;
}
function loadReplaySettings() {
    const defaults = defaultReplaySettings();
    const raw = readJsonFile(getReplaySettingsFile(), {});
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
function saveReplaySettings(settings) {
    const defaults = defaultReplaySettings();
    const normalized = {
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
function loadNetworkSettings() {
    const raw = readJsonFile(getNetworkFile(), {});
    return {
        signalingUrl: String(raw.signalingUrl || defaultNetworkSettings.signalingUrl).trim() || defaultNetworkSettings.signalingUrl,
        netplayMode: raw.netplayMode === "stream" ? "stream" : "lockstep"
    };
}
function saveNetworkSettings(settings) {
    const normalized = {
        signalingUrl: String(settings.signalingUrl || defaultNetworkSettings.signalingUrl).trim() || defaultNetworkSettings.signalingUrl,
        netplayMode: settings.netplayMode === "stream" ? "stream" : "lockstep"
    };
    writeJsonFile(getNetworkFile(), normalized);
    return normalized;
}
function loadUiSettings() {
    const raw = readJsonFile(getUiSettingsFile(), {});
    const rawTheme = String(raw.theme || "").trim().toLowerCase();
    const normalizedTheme = rawTheme === "pink" || rawTheme === "pink-cute" ? "pink" : "blue";
    const retroAchievementsUsername = String(raw.retroAchievementsUsername || "").trim();
    return {
        controlPreset: raw.controlPreset === "gamepad" ? "gamepad" : "keyboard",
        libraryShowPlatformBadges: raw.libraryShowPlatformBadges ?? true,
        libraryEmulatorFilter: raw.libraryEmulatorFilter === "nes" || raw.libraryEmulatorFilter === "snes" ? raw.libraryEmulatorFilter : "all",
        theme: normalizedTheme,
        retroAchievementsUsername
    };
}
function saveUiSettings(settings) {
    const current = loadUiSettings();
    const incomingTheme = String(settings.theme || "").trim().toLowerCase();
    const normalizedTheme = incomingTheme === "pink" || incomingTheme === "pink-cute"
        ? "pink"
        : incomingTheme === "blue" || incomingTheme === "steam-dark"
            ? "blue"
            : current.theme;
    const next = {
        controlPreset: settings.controlPreset === "gamepad" ? "gamepad" : settings.controlPreset === "keyboard" ? "keyboard" : current.controlPreset,
        libraryShowPlatformBadges: typeof settings.libraryShowPlatformBadges === "boolean" ? settings.libraryShowPlatformBadges : current.libraryShowPlatformBadges,
        libraryEmulatorFilter: settings.libraryEmulatorFilter === "nes" || settings.libraryEmulatorFilter === "snes"
            ? settings.libraryEmulatorFilter
            : settings.libraryEmulatorFilter === "all"
                ? "all"
                : current.libraryEmulatorFilter,
        theme: normalizedTheme,
        retroAchievementsUsername: typeof settings.retroAchievementsUsername === "string"
            ? settings.retroAchievementsUsername.trim()
            : current.retroAchievementsUsername
    };
    writeJsonFile(getUiSettingsFile(), next);
    return next;
}
const RA_API_BASE_URL = "https://retroachievements.org/API";
const RA_SITE_BASE_URL = "https://retroachievements.org";
const RA_BADGE_BASE_URL = "https://media.retroachievements.org/Badge";
const RA_CACHE_TTL_MS = 5 * 60 * 1000;
const retroCache = new Map();
const RA_API_KEY_FILE = "ra_api_key.bin";
let inMemoryRaApiKey = "";
function getRaApiKeyFile() {
    return userDataPath(RA_API_KEY_FILE);
}
function readRaApiKeyFromSecureStore() {
    const filePath = getRaApiKeyFile();
    if (!fs.existsSync(filePath) || !electron_1.safeStorage.isEncryptionAvailable()) {
        return "";
    }
    try {
        const bytes = fs.readFileSync(filePath);
        if (!bytes.length) {
            return "";
        }
        return electron_1.safeStorage.decryptString(bytes).trim();
    }
    catch {
        return "";
    }
}
function resolveRaApiKey() {
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
function getRetroApiKeyStatus() {
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
function setRetroApiKeySecure(apiKeyRaw) {
    const apiKey = String(apiKeyRaw || "").trim();
    const filePath = getRaApiKeyFile();
    if (!apiKey) {
        inMemoryRaApiKey = "";
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { force: true });
        }
        return getRetroApiKeyStatus();
    }
    if (!electron_1.safeStorage.isEncryptionAvailable()) {
        inMemoryRaApiKey = apiKey;
        return getRetroApiKeyStatus();
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encrypted = electron_1.safeStorage.encryptString(apiKey);
    fs.writeFileSync(filePath, encrypted);
    inMemoryRaApiKey = "";
    return getRetroApiKeyStatus();
}
function parseRaNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
function parseUnlockedAt(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        const ms = value > 1000000000000 ? value : value * 1000;
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
function normalizeRaAchievements(rawAchievements, includeUserProgress) {
    const rows = Array.isArray(rawAchievements)
        ? rawAchievements
        : rawAchievements && typeof rawAchievements === "object"
            ? Object.values(rawAchievements)
            : [];
    return rows
        .map((raw) => {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const obj = raw;
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
        .filter((item) => Boolean(item));
}
function normalizeRaGameResponse(gameId, payload, includeUserProgress) {
    const obj = payload && typeof payload === "object" ? payload : {};
    const achievements = normalizeRaAchievements(obj.Achievements, includeUserProgress);
    const unlockedAchievements = achievements.filter((item) => item.isUnlocked).length;
    const totalPoints = achievements.reduce((sum, item) => sum + item.points, 0);
    const raImageUrl = (value) => {
        const raw = String(value || "").trim();
        if (!raw)
            return null;
        if (/^https?:\/\//i.test(raw))
            return raw;
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
async function requestRetroApi(pathName, params) {
    const apiKey = resolveRaApiKey().key;
    if (!apiKey) {
        throw new Error("RetroAchievements API key is not configured. Set it in Settings or RA_API_KEY environment.");
    }
    const url = new URL(`${RA_API_BASE_URL}/${pathName}`);
    const query = new URLSearchParams({ ...params, y: apiKey });
    url.search = query.toString();
    let response;
    try {
        response = await fetch(url.toString());
    }
    catch {
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
function isRaErrorPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const obj = payload;
    const rawError = obj.Error ?? obj.error ?? obj.Message ?? obj.message;
    if (typeof rawError === "string" && rawError.trim()) {
        return rawError.trim();
    }
    return null;
}
async function requestRetroApiWithFallback(pathName, variants) {
    let lastError = null;
    for (const params of variants) {
        try {
            const payload = await requestRetroApi(pathName, params);
            const payloadError = isRaErrorPayload(payload);
            if (payloadError) {
                lastError = new Error(payloadError);
                continue;
            }
            return payload;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error("RetroAchievements request failed");
        }
    }
    throw lastError ?? new Error("RetroAchievements request failed");
}
async function fetchRetroGameAchievements(gameId, username) {
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
    constructor() {
        this.ws = null;
        this.pending = new Map();
        this.profile = null;
        this.activeUrl = "";
    }
    rejectAllPending(error) {
        for (const [requestId, entry] of this.pending.entries()) {
            this.pending.delete(requestId);
            entry.reject(error);
        }
    }
    reset() {
        try {
            this.ws?.close();
        }
        catch {
            // noop
        }
        this.rejectAllPending(new Error("Signaling connection closed"));
        this.ws = null;
        this.activeUrl = "";
    }
    async connect(profile) {
        this.profile = profile;
        const fromSettings = loadNetworkSettings().signalingUrl;
        const url = fromSettings || process.env.SIGNALING_URL || process.env.VITE_SIGNALING_URL || defaultNetworkSettings.signalingUrl;
        if (this.ws && this.ws.readyState === ws_1.default.OPEN && this.activeUrl === url) {
            return;
        }
        this.reset();
        await new Promise((resolve, reject) => {
            const ws = new ws_1.default(url);
            this.ws = ws;
            this.activeUrl = url;
            let settled = false;
            const cleanup = () => {
                ws.removeAllListeners("open");
                ws.removeAllListeners("error");
            };
            const fail = (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                this.reset();
                reject(error);
            };
            ws.once("open", () => {
                const requestId = (0, uuid_1.v4)();
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
                    friendCode: profile.friendCode
                }, requestId);
            });
            ws.once("error", (err) => {
                fail(err instanceof Error ? err : new Error(String(err)));
            });
            ws.on("close", () => {
                this.rejectAllPending(new Error("Signaling connection closed"));
                this.ws = null;
                this.activeUrl = "";
            });
            ws.on("message", (raw) => {
                try {
                    const data = JSON.parse(String(raw));
                    if (data.type === "response" && data.requestId) {
                        const entry = this.pending.get(data.requestId);
                        if (entry) {
                            this.pending.delete(data.requestId);
                            if (data.ok) {
                                entry.resolve(data.payload);
                            }
                            else {
                                entry.reject(new Error(data.error || "Request failed"));
                            }
                        }
                    }
                }
                catch {
                    // ignore malformed server messages in MVP
                }
            });
        });
    }
    async request(type, payload) {
        if (!this.profile) {
            throw new Error("Profile is not initialized");
        }
        await this.connect(this.profile);
        const requestId = (0, uuid_1.v4)();
        const result = new Promise((resolve, reject) => {
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
    send(type, payload, requestId) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            return;
        }
        this.ws.send(JSON.stringify({ type, requestId, payload }));
    }
}
let mainWindow = null;
const signalClient = new SignalClient();
let localSignalingProcess = null;
let localSignalingPort = 8787;
let localSignalingMessage = "";
let ngrokProcess = null;
let ngrokPublicUrl = "";
let ngrokMessage = "";
function parseSignalingPort(url) {
    const fallback = 8787;
    const raw = String(url || "").trim();
    if (!raw)
        return fallback;
    try {
        const parsed = new URL(raw);
        const port = Number(parsed.port || fallback);
        return Number.isFinite(port) && port > 0 ? port : fallback;
    }
    catch {
        return fallback;
    }
}
function resolveServerEntryPath() {
    const candidates = [
        path.resolve(electron_1.app.getAppPath(), "../server/dist/index.js"),
        path.resolve(electron_1.app.getAppPath(), "../../server/dist/index.js"),
        path.resolve(process.cwd(), "../server/dist/index.js"),
        path.resolve(process.cwd(), "server/dist/index.js")
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found || null;
}
function getLocalSignalingStatus() {
    const running = Boolean(localSignalingProcess && !localSignalingProcess.killed && localSignalingProcess.exitCode === null);
    return {
        running,
        pid: running ? localSignalingProcess?.pid : undefined,
        port: localSignalingPort,
        url: `ws://127.0.0.1:${localSignalingPort}`,
        message: localSignalingMessage || undefined
    };
}
async function startLocalSignalingServer(preferredUrl) {
    const current = getLocalSignalingStatus();
    if (current.running) {
        return current;
    }
    const serverEntry = resolveServerEntryPath();
    if (!serverEntry) {
        localSignalingMessage = "server/dist/index.js not found. Build server first.";
        return getLocalSignalingStatus();
    }
    localSignalingPort = parseSignalingPort(preferredUrl || loadNetworkSettings().signalingUrl);
    const child = (0, child_process_1.spawn)(process.execPath, [serverEntry], {
        windowsHide: true,
        stdio: "pipe",
        env: {
            ...process.env,
            SIGNALING_PORT: String(localSignalingPort)
        }
    });
    localSignalingProcess = child;
    localSignalingMessage = "Starting local server...";
    child.stdout.on("data", () => {
        localSignalingMessage = `Local server running on :${localSignalingPort}`;
    });
    child.stderr.on("data", (chunk) => {
        const text = String(chunk || "").trim();
        if (text) {
            localSignalingMessage = text.slice(0, 220);
        }
    });
    child.on("exit", (code, signal) => {
        localSignalingProcess = null;
        localSignalingMessage = `Local server stopped (${signal || code || 0})`;
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    return getLocalSignalingStatus();
}
async function stopLocalSignalingServer() {
    if (!localSignalingProcess || localSignalingProcess.killed || localSignalingProcess.exitCode !== null) {
        localSignalingProcess = null;
        localSignalingMessage = "Local server is not running";
        return getLocalSignalingStatus();
    }
    const proc = localSignalingProcess;
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            resolve();
        };
        proc.once("exit", finish);
        try {
            proc.kill("SIGTERM");
        }
        catch {
            finish();
            return;
        }
        setTimeout(() => {
            if (proc.exitCode === null && !proc.killed) {
                try {
                    proc.kill("SIGKILL");
                }
                catch {
                    // noop
                }
            }
            finish();
        }, 1500);
    });
    localSignalingProcess = null;
    localSignalingMessage = "Local server stopped";
    return getLocalSignalingStatus();
}
function getNgrokStatus() {
    const running = Boolean(ngrokProcess && !ngrokProcess.killed && ngrokProcess.exitCode === null);
    return {
        running,
        pid: running ? ngrokProcess?.pid : undefined,
        publicUrl: ngrokPublicUrl || undefined,
        message: ngrokMessage || undefined
    };
}
function parseNgrokPublicUrl(text) {
    const fromJson = (() => {
        try {
            const parsed = JSON.parse(text);
            const msg = parsed.msg;
            const url = parsed.url;
            if (typeof msg === "string" && msg.toLowerCase().includes("started tunnel") && typeof url === "string") {
                return url;
            }
            return "";
        }
        catch {
            return "";
        }
    })();
    if (fromJson) {
        return fromJson;
    }
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+/);
    return match ? match[0] : "";
}
async function startNgrokTunnel(preferredUrl) {
    const current = getNgrokStatus();
    if (current.running) {
        return current;
    }
    const port = parseSignalingPort(preferredUrl || loadNetworkSettings().signalingUrl);
    const args = process.platform === "win32"
        ? ["/c", "ngrok", "http", `http://127.0.0.1:${port}`, "--log=stdout", "--log-format=json"]
        : ["http", `http://127.0.0.1:${port}`, "--log=stdout", "--log-format=json"];
    const command = process.platform === "win32" ? "cmd.exe" : "ngrok";
    const child = (0, child_process_1.spawn)(command, args, {
        windowsHide: true,
        stdio: "pipe",
        env: {
            ...process.env
        }
    });
    ngrokProcess = child;
    ngrokPublicUrl = "";
    ngrokMessage = "Starting ngrok...";
    const onOutput = (chunk) => {
        const text = String(chunk || "").trim();
        if (!text) {
            return;
        }
        const publicUrl = parseNgrokPublicUrl(text);
        if (publicUrl) {
            ngrokPublicUrl = publicUrl.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
            ngrokMessage = "Ngrok tunnel is running";
            return;
        }
        if (text.toLowerCase().includes("err") || text.toLowerCase().includes("error")) {
            ngrokMessage = text.slice(0, 220);
        }
    };
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("exit", (code, signal) => {
        ngrokProcess = null;
        ngrokPublicUrl = "";
        ngrokMessage = `Ngrok stopped (${signal || code || 0})`;
    });
    child.on("error", (error) => {
        ngrokProcess = null;
        ngrokPublicUrl = "";
        ngrokMessage = error.message.includes("ENOENT")
            ? "ngrok not found. Install ngrok and add it to PATH."
            : `Failed to start ngrok: ${error.message}`;
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return getNgrokStatus();
}
async function stopNgrokTunnel() {
    if (!ngrokProcess || ngrokProcess.killed || ngrokProcess.exitCode !== null) {
        ngrokProcess = null;
        ngrokPublicUrl = "";
        ngrokMessage = "Ngrok is not running";
        return getNgrokStatus();
    }
    const proc = ngrokProcess;
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            resolve();
        };
        proc.once("exit", finish);
        try {
            proc.kill("SIGTERM");
        }
        catch {
            finish();
            return;
        }
        setTimeout(() => {
            if (proc.exitCode === null && !proc.killed) {
                try {
                    proc.kill("SIGKILL");
                }
                catch {
                    // noop
                }
            }
            finish();
        }, 1500);
    });
    ngrokProcess = null;
    ngrokPublicUrl = "";
    ngrokMessage = "Ngrok stopped";
    return getNgrokStatus();
}
function randomFriendCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}
function getCoversDir() {
    return userDataPath("covers");
}
function removeExistingCovers(gameId) {
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
function getCoverPathByFileName(fileName) {
    if (!fileName) {
        return null;
    }
    const targetPath = path.join(getCoversDir(), fileName);
    return fs.existsSync(targetPath) ? targetPath : null;
}
function resolveCoverPath(game) {
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
function loadLibrary() {
    const items = readJsonFile(getLibraryFile(), []);
    let changed = false;
    const normalized = items.map((item) => {
        const ext = normalizeExt(path.extname(item.path || ""));
        const detected = detectEmulatorByExt(ext);
        const fallbackByPlatform = item.platform === "SNES" ? "snes" : "nes";
        const nextEmulatorId = item.emulatorId === "nes" || item.emulatorId === "snes"
            ? item.emulatorId
            : (detected ?? fallbackByPlatform);
        let coverFileName = item.coverFileName;
        if (!coverFileName && item.coverPath) {
            const oldPath = item.coverPath;
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
        const parsedRaId = Number(item.retroAchievementsGameId);
        const retroAchievementsGameId = Number.isFinite(parsedRaId) && parsedRaId > 0 ? Math.floor(parsedRaId) : undefined;
        const next = {
            ...item,
            platform: emulatorToPlatform(nextEmulatorId),
            emulatorId: nextEmulatorId,
            coverFileName: hasCover ? coverFileName : undefined,
            hasCover,
            retroAchievementsGameId
        };
        if (item.emulatorId !== next.emulatorId ||
            item.platform !== next.platform ||
            item.coverFileName !== next.coverFileName ||
            item.hasCover !== next.hasCover ||
            item.retroAchievementsGameId !== next.retroAchievementsGameId ||
            Object.prototype.hasOwnProperty.call(item, "coverPath")) {
            changed = true;
        }
        return next;
    });
    if (changed) {
        saveLibrary(normalized);
    }
    return normalized;
}
function saveLibrary(items) {
    writeJsonFile(getLibraryFile(), items);
}
function validateGameLaunch(game) {
    if (!game.path) {
        return { ok: false, reason: "ROM path is empty" };
    }
    if (!fs.existsSync(game.path)) {
        return { ok: false, reason: "ROM file not found" };
    }
    let stats;
    try {
        stats = fs.statSync(game.path);
    }
    catch {
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
function loadOrCreateProfile() {
    const filePath = getProfileFile();
    const existing = readJsonFile(filePath, null);
    if (existing?.userId && existing.friendCode && existing.displayName) {
        const normalized = {
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
    const profile = {
        userId: (0, uuid_1.v4)(),
        displayName: `Player-${Math.floor(Math.random() * 10000)}`,
        friendCode: randomFriendCode()
    };
    writeJsonFile(filePath, profile);
    return profile;
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        title: appDisplayName,
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 720,
        backgroundColor: "#1B1E24",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        void mainWindow.loadURL(devUrl);
    }
    else {
        void mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
    }
}
function setupAutoUpdater() {
    if (!electron_1.app.isPackaged) {
        return;
    }
    console.info("Auto-updater: using electron-builder publish config from package metadata");
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on("error", (error) => {
        console.error("Auto-updater error:", error);
    });
    electron_updater_1.autoUpdater.on("update-downloaded", () => {
        void electron_1.dialog.showMessageBox({
            type: "info",
            title: "Update ready",
            message: "An update has been downloaded.",
            detail: "Restart now to apply the new version.",
            buttons: ["Restart now", "Later"],
            defaultId: 0,
            cancelId: 1
        }).then(({ response }) => {
            if (response === 0) {
                electron_updater_1.autoUpdater.quitAndInstall();
            }
        });
    });
    void electron_updater_1.autoUpdater.checkForUpdates().catch((error) => {
        console.error("Failed to check updates:", error);
    });
    setInterval(() => {
        void electron_updater_1.autoUpdater.checkForUpdates().catch(() => undefined);
    }, 1000 * 60 * 60 * 4);
}
electron_1.app.whenReady().then(() => {
    const profile = loadOrCreateProfile();
    void signalClient.connect(profile).catch(() => {
        // server may not be running in local setup
    });
    createMainWindow();
    setupAutoUpdater();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("before-quit", () => {
    if (localSignalingProcess && localSignalingProcess.exitCode === null && !localSignalingProcess.killed) {
        try {
            localSignalingProcess.kill("SIGTERM");
        }
        catch {
            // noop
        }
    }
    if (ngrokProcess && ngrokProcess.exitCode === null && !ngrokProcess.killed) {
        try {
            ngrokProcess.kill("SIGTERM");
        }
        catch {
            // noop
        }
    }
});
electron_1.ipcMain.handle("profile:get", async () => {
    return loadOrCreateProfile();
});
electron_1.ipcMain.handle("profile:update", async (_event, displayName) => {
    const profile = loadOrCreateProfile();
    const next = {
        ...profile,
        displayName: displayName.trim() || profile.displayName
    };
    writeJsonFile(getProfileFile(), next);
    await signalClient.connect(next).catch(() => undefined);
    return next;
});
electron_1.ipcMain.handle("profile:updateAvatar", async (_event, avatarDataUrl) => {
    const profile = loadOrCreateProfile();
    const normalizedAvatar = typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:image/")
        ? avatarDataUrl
        : undefined;
    const next = {
        ...profile,
        avatarDataUrl: normalizedAvatar
    };
    writeJsonFile(getProfileFile(), next);
    return next;
});
electron_1.ipcMain.handle("games:add", async () => {
    const selected = await electron_1.dialog.showOpenDialog({
        title: "Add ROM",
        properties: ["openFile"],
        filters: [
            { name: "ROM", extensions: ["nes", "sfc", "smc"] }
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
    const game = {
        id: (0, uuid_1.v4)(),
        name: path.basename(filePath, ext),
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
    library.unshift(game);
    saveLibrary(library);
    return game;
});
electron_1.ipcMain.handle("games:list", async () => {
    return loadLibrary();
});
electron_1.ipcMain.handle("games:remove", async (_event, gameId) => {
    const library = loadLibrary().filter((game) => game.id !== gameId);
    saveLibrary(library);
    return library;
});
electron_1.ipcMain.handle("games:updateEmulator", async (_event, gameId, emulatorId) => {
    if (emulatorId !== "nes" && emulatorId !== "snes") {
        throw new Error("Unsupported emulator id");
    }
    const library = loadLibrary();
    const index = library.findIndex((item) => item.id === gameId);
    if (index < 0) {
        throw new Error("Game not found");
    }
    const updated = {
        ...library[index],
        emulatorId,
        platform: emulatorToPlatform(emulatorId)
    };
    library[index] = updated;
    saveLibrary(library);
    return updated;
});
electron_1.ipcMain.handle("games:updateRetroId", async (_event, gameId, retroAchievementsGameId) => {
    const library = loadLibrary();
    const index = library.findIndex((item) => item.id === gameId);
    if (index < 0) {
        throw new Error("Game not found");
    }
    const parsed = Number(retroAchievementsGameId);
    const normalizedRetroId = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
    const updated = {
        ...library[index],
        retroAchievementsGameId: normalizedRetroId
    };
    library[index] = updated;
    saveLibrary(library);
    return updated;
});
electron_1.ipcMain.handle("games:setCover", async (_event, gameId, dataUrl) => {
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
electron_1.ipcMain.handle("games:openRomFolder", async (_event, gameId) => {
    const game = loadLibrary().find((item) => item.id === gameId);
    if (!game) {
        return false;
    }
    electron_1.shell.showItemInFolder(game.path);
    return true;
});
electron_1.ipcMain.handle("games:checkLaunch", async (_event, gameId) => {
    const game = loadLibrary().find((item) => item.id === gameId);
    if (!game) {
        return { ok: false, reason: "Game not found" };
    }
    const validation = validateGameLaunch(game);
    return validation.ok ? { ok: true } : validation;
});
electron_1.ipcMain.handle("games:startLocal", async (_event, gameId) => {
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
electron_1.ipcMain.handle("window:setFullscreen", async (_event, enabled) => {
    const win = electron_1.BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) {
        return false;
    }
    win.setFullScreen(Boolean(enabled));
    return true;
});
electron_1.ipcMain.handle("settings:getControls", async () => {
    return loadControls();
});
electron_1.ipcMain.handle("settings:saveControls", async (_event, payload) => {
    const next = { ...loadControls(), ...payload };
    return saveControls(next);
});
electron_1.ipcMain.handle("settings:getAudio", async () => {
    return loadAudioSettings();
});
electron_1.ipcMain.handle("settings:saveAudio", async (_event, payload) => {
    const next = { ...loadAudioSettings(), ...payload };
    return saveAudioSettings(next);
});
electron_1.ipcMain.handle("settings:getVideo", async () => {
    return loadVideoSettings();
});
electron_1.ipcMain.handle("settings:saveVideo", async (_event, payload) => {
    const next = { ...loadVideoSettings(), ...payload };
    return saveVideoSettings(next);
});
electron_1.ipcMain.handle("settings:getNetwork", async () => {
    return loadNetworkSettings();
});
electron_1.ipcMain.handle("settings:saveNetwork", async (_event, payload) => {
    const next = { ...loadNetworkSettings(), ...payload };
    const saved = saveNetworkSettings(next);
    signalClient.reset();
    return saved;
});
electron_1.ipcMain.handle("settings:getUi", async () => {
    return loadUiSettings();
});
electron_1.ipcMain.handle("settings:saveUi", async (_event, payload) => {
    return saveUiSettings(payload);
});
electron_1.ipcMain.handle("settings:getRaApiKeyStatus", async () => {
    return getRetroApiKeyStatus();
});
electron_1.ipcMain.handle("settings:setRaApiKey", async (_event, apiKey) => {
    const next = setRetroApiKeySecure(apiKey);
    retroCache.clear();
    return next;
});
electron_1.ipcMain.handle("settings:clearRaApiKey", async () => {
    const next = setRetroApiKeySecure("");
    retroCache.clear();
    return next;
});
electron_1.ipcMain.handle("ra:getGameData", async (_event, payload) => {
    const gameId = Number(payload?.gameId);
    if (!Number.isFinite(gameId) || gameId <= 0) {
        throw new Error("RetroAchievements gameId is required");
    }
    return fetchRetroGameAchievements(Math.floor(gameId), payload?.username);
});
electron_1.ipcMain.handle("settings:getReplay", async () => {
    return loadReplaySettings();
});
electron_1.ipcMain.handle("settings:saveReplay", async (_event, payload) => {
    const next = { ...loadReplaySettings(), ...payload };
    return saveReplaySettings(next);
});
electron_1.ipcMain.handle("server:connect", async (_event, signalingUrl) => {
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
electron_1.ipcMain.handle("network:getLocalServerStatus", async () => {
    return getLocalSignalingStatus();
});
electron_1.ipcMain.handle("network:startLocalServer", async (_event, signalingUrl) => {
    return startLocalSignalingServer(signalingUrl);
});
electron_1.ipcMain.handle("network:stopLocalServer", async () => {
    return stopLocalSignalingServer();
});
electron_1.ipcMain.handle("network:getNgrokStatus", async () => {
    return getNgrokStatus();
});
electron_1.ipcMain.handle("network:startNgrok", async (_event, signalingUrl) => {
    return startNgrokTunnel(signalingUrl);
});
electron_1.ipcMain.handle("network:stopNgrok", async () => {
    return stopNgrokTunnel();
});
electron_1.ipcMain.handle("network:ensureStreamFirewallAccess", async () => {
    return ensureStreamFirewallAccess();
});
electron_1.ipcMain.handle("covers:pick", async (_event, gameId) => {
    const library = loadLibrary();
    const index = library.findIndex((item) => item.id === gameId);
    if (index < 0) {
        throw new Error("Game not found");
    }
    const selected = await electron_1.dialog.showOpenDialog({
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
electron_1.ipcMain.handle("covers:remove", async (_event, gameId) => {
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
electron_1.ipcMain.handle("covers:getCoverDataUrl", async (_event, gameId) => {
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
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
});
electron_1.ipcMain.handle("replays:save", async (_event, payload) => {
    const settings = loadReplaySettings();
    const baseName = path.basename(payload.suggestedName || "replay.webm").replace(/[<>:\"/\\|?*]/g, "_");
    const finalName = baseName.toLowerCase().endsWith(".webm") ? baseName : `${baseName}.webm`;
    const dir = settings.saveFolder || userDataPath("replays");
    fs.mkdirSync(dir, { recursive: true });
    const outputPath = path.join(dir, finalName);
    fs.writeFileSync(outputPath, Buffer.from(payload.bytes));
    let metaPath;
    if (payload.meta) {
        metaPath = `${outputPath}.json`;
        writeJsonFile(metaPath, payload.meta);
    }
    return { path: outputPath, metaPath };
});
electron_1.ipcMain.handle("replays:openFolder", async () => {
    const settings = loadReplaySettings();
    const dir = settings.saveFolder || userDataPath("replays");
    fs.mkdirSync(dir, { recursive: true });
    await electron_1.shell.openPath(dir);
    return true;
});
electron_1.ipcMain.handle("replays:openSavedFile", async (_event, filePath) => {
    if (!filePath) {
        return false;
    }
    electron_1.shell.showItemInFolder(filePath);
    return true;
});
electron_1.ipcMain.handle("room:create", async (_event, gameId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:create", { gameId });
    return payload;
});
electron_1.ipcMain.handle("room:join", async (_event, roomId, spectator) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:join", { roomId, spectator: Boolean(spectator) });
    return payload;
});
electron_1.ipcMain.handle("room:getState", async (_event, roomId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:state", { roomId });
    return payload;
});
electron_1.ipcMain.handle("room:close", async (_event, roomId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    await signalClient.request("room:close", { roomId });
    return true;
});
electron_1.ipcMain.handle("room:setReady", async (_event, roomId, ready) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:ready", { roomId, ready });
    return payload;
});
electron_1.ipcMain.handle("room:setLock", async (_event, roomId, locked) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:lock", { roomId, locked });
    return payload;
});
electron_1.ipcMain.handle("room:kick", async (_event, roomId, targetUserId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:kick", { roomId, targetUserId });
    return payload;
});
electron_1.ipcMain.handle("room:transferHost", async (_event, roomId, targetUserId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:transferHost", { roomId, targetUserId });
    return payload;
});
electron_1.ipcMain.handle("room:getChatHistory", async (_event, roomId) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    const payload = await signalClient.request("room:chat:history", { roomId });
    return payload;
});
electron_1.ipcMain.handle("room:sendChat", async (_event, roomId, text) => {
    const profile = loadOrCreateProfile();
    await signalClient.connect(profile);
    await signalClient.request("room:chat:send", { roomId, text });
    return true;
});

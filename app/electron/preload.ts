import { contextBridge, ipcRenderer } from "electron";

type Platform = "NES" | "SNES";
type EmulatorId = "nes" | "snes";
type ScaleMode = "2x" | "3x" | "4x" | "fit";
type PixelMode = "nearest" | "smooth";
type ReplayQuality = "720p" | "1080p";
type ReplayFps = 30 | 60;
type ReplayFormat = "webm";

interface ControlSettings {
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  start: string;
  select: string;
}

interface AudioSettings {
  enabled: boolean;
  volume: number;
  latency: number;
}

interface VideoSettings {
  fullscreen: boolean;
  scale: ScaleMode;
  pixelMode: PixelMode;
  crtEnabled: boolean;
  scanlinesIntensity: number;
  bloom: number;
  vignette: boolean;
  colorCorrection: boolean;
}

interface ReplaySettings {
  enabled: boolean;
  hotkey: string;
  prebufferSeconds: number;
  quality: ReplayQuality;
  fps: ReplayFps;
  format: ReplayFormat;
  saveFolder: string;
}

interface NetworkSettings {
  signalingUrl: string;
  netplayMode: "lockstep" | "stream";
}

interface LocalSignalingServerStatus {
  running: boolean;
  pid?: number;
  port: number;
  url: string;
  message?: string;
}

interface NgrokTunnelStatus {
  running: boolean;
  pid?: number;
  publicUrl?: string;
  message?: string;
}

interface UiSettings {
  controlPreset: "keyboard" | "gamepad";
  libraryShowPlatformBadges: boolean;
  libraryEmulatorFilter: "all" | EmulatorId;
  theme: "blue" | "pink";
  retroAchievementsUsername: string;
}

interface RetroApiKeyStatus {
  configured: boolean;
  source: "env" | "secure-store" | "memory" | "none";
  persistent: boolean;
}

interface GameRecord {
  id: string;
  name: string;
  path: string;
  platform: Platform;
  emulatorId: EmulatorId;
  sha256: string;
  addedAt: string;
  totalPlayTime: number;
  lastPlayedAt?: string;
  coverFileName?: string;
  hasCover?: boolean;
  retroAchievementsGameId?: number;
}

interface RetroAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badgeUrl: string;
  isUnlocked: boolean;
  unlockedAt?: string;
}

interface RetroGameAchievements {
  gameId: number;
  gameTitle: string;
  consoleName: string;
  totalAchievements: number;
  totalPoints: number;
  unlockedAchievements: number;
  images: {
    icon?: string | null;
    title?: string | null;
    boxArt?: string | null;
    inGame?: string | null;
  };
  achievements: RetroAchievement[];
}

interface Profile {
  userId: string;
  displayName: string;
  friendCode: string;
  avatarDataUrl?: string;
}

interface RoomState {
  roomId: string;
  gameId: string;
  hostUserId: string;
  members: string[];
  spectators: string[];
  locked: boolean;
  readyByUserId: string[];
}

const bridge = {
  addGame: (): Promise<GameRecord | null> => ipcRenderer.invoke("games:add"),
  listGames: (): Promise<GameRecord[]> => ipcRenderer.invoke("games:list"),
  removeGame: (gameId: string): Promise<GameRecord[]> => ipcRenderer.invoke("games:remove", gameId),
  setGameCover: (gameId: string, dataUrl: string): Promise<GameRecord> => ipcRenderer.invoke("games:setCover", gameId, dataUrl),
  updateGameEmulator: (gameId: string, emulatorId: EmulatorId): Promise<GameRecord> => ipcRenderer.invoke("games:updateEmulator", gameId, emulatorId),
  updateGameRetroId: (gameId: string, retroAchievementsGameId?: number | null): Promise<GameRecord> => ipcRenderer.invoke("games:updateRetroId", gameId, retroAchievementsGameId),
  openRomFolder: (gameId: string): Promise<boolean> => ipcRenderer.invoke("games:openRomFolder", gameId),
  startLocalGame: (gameId: string): Promise<{ game: GameRecord; romBase64: string }> => ipcRenderer.invoke("games:startLocal", gameId),
  checkGameLaunch: (gameId: string): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke("games:checkLaunch", gameId),
  createRoom: (gameId: string): Promise<RoomState> => ipcRenderer.invoke("room:create", gameId),
  joinRoom: (roomId: string, spectator?: boolean): Promise<RoomState> => ipcRenderer.invoke("room:join", roomId, spectator),
  getRoomState: (roomId: string): Promise<RoomState> => ipcRenderer.invoke("room:getState", roomId),
  closeRoom: (roomId: string): Promise<boolean> => ipcRenderer.invoke("room:close", roomId),
  setRoomReady: (roomId: string, ready: boolean): Promise<RoomState> => ipcRenderer.invoke("room:setReady", roomId, ready),
  setRoomLock: (roomId: string, locked: boolean): Promise<RoomState> => ipcRenderer.invoke("room:setLock", roomId, locked),
  kickRoomMember: (roomId: string, targetUserId: string): Promise<RoomState> => ipcRenderer.invoke("room:kick", roomId, targetUserId),
  transferRoomHost: (roomId: string, targetUserId: string): Promise<RoomState> => ipcRenderer.invoke("room:transferHost", roomId, targetUserId),
  getRoomChatHistory: (roomId: string): Promise<Array<{ id: string; roomId: string; fromUserId: string; fromDisplayName: string; text: string; createdAt: string }>> => ipcRenderer.invoke("room:getChatHistory", roomId),
  sendRoomChat: (roomId: string, text: string): Promise<boolean> => ipcRenderer.invoke("room:sendChat", roomId, text),
  setFullscreen: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke("window:setFullscreen", enabled),
  getProfile: (): Promise<Profile> => ipcRenderer.invoke("profile:get"),
  updateProfile: (displayName: string): Promise<Profile> => ipcRenderer.invoke("profile:update", displayName),
  updateProfileAvatar: (avatarDataUrl?: string): Promise<Profile> => ipcRenderer.invoke("profile:updateAvatar", avatarDataUrl),
  getControls: (): Promise<ControlSettings> => ipcRenderer.invoke("settings:getControls"),
  saveControls: (payload: Partial<ControlSettings>): Promise<ControlSettings> => ipcRenderer.invoke("settings:saveControls", payload),
  getAudioSettings: (): Promise<AudioSettings> => ipcRenderer.invoke("settings:getAudio"),
  saveAudioSettings: (payload: Partial<AudioSettings>): Promise<AudioSettings> => ipcRenderer.invoke("settings:saveAudio", payload),
  getVideoSettings: (): Promise<VideoSettings> => ipcRenderer.invoke("settings:getVideo"),
  saveVideoSettings: (payload: Partial<VideoSettings>): Promise<VideoSettings> => ipcRenderer.invoke("settings:saveVideo", payload),
  getReplaySettings: (): Promise<ReplaySettings> => ipcRenderer.invoke("settings:getReplay"),
  saveReplaySettings: (payload: Partial<ReplaySettings>): Promise<ReplaySettings> => ipcRenderer.invoke("settings:saveReplay", payload),
  getNetworkSettings: (): Promise<NetworkSettings> => ipcRenderer.invoke("settings:getNetwork"),
  saveNetworkSettings: (payload: Partial<NetworkSettings>): Promise<NetworkSettings> => ipcRenderer.invoke("settings:saveNetwork", payload),
  getLocalServerStatus: (): Promise<LocalSignalingServerStatus> => ipcRenderer.invoke("network:getLocalServerStatus"),
  startLocalServer: (signalingUrl?: string): Promise<LocalSignalingServerStatus> => ipcRenderer.invoke("network:startLocalServer", signalingUrl),
  stopLocalServer: (): Promise<LocalSignalingServerStatus> => ipcRenderer.invoke("network:stopLocalServer"),
  getNgrokStatus: (): Promise<NgrokTunnelStatus> => ipcRenderer.invoke("network:getNgrokStatus"),
  startNgrok: (signalingUrl?: string): Promise<NgrokTunnelStatus> => ipcRenderer.invoke("network:startNgrok", signalingUrl),
  stopNgrok: (): Promise<NgrokTunnelStatus> => ipcRenderer.invoke("network:stopNgrok"),
  getUiSettings: (): Promise<UiSettings> => ipcRenderer.invoke("settings:getUi"),
  saveUiSettings: (payload: Partial<UiSettings>): Promise<UiSettings> => ipcRenderer.invoke("settings:saveUi", payload),
  getRaApiKeyStatus: (): Promise<RetroApiKeyStatus> => ipcRenderer.invoke("settings:getRaApiKeyStatus"),
  setRaApiKey: (apiKey: string): Promise<RetroApiKeyStatus> => ipcRenderer.invoke("settings:setRaApiKey", apiKey),
  clearRaApiKey: (): Promise<RetroApiKeyStatus> => ipcRenderer.invoke("settings:clearRaApiKey"),
  connectServer: (signalingUrl?: string): Promise<boolean> => ipcRenderer.invoke("server:connect", signalingUrl),
  ensureStreamFirewallAccess: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke("network:ensureStreamFirewallAccess"),
  covers: {
    pickCover: (gameId: string): Promise<GameRecord | null> => ipcRenderer.invoke("covers:pick", gameId),
    removeCover: (gameId: string): Promise<GameRecord> => ipcRenderer.invoke("covers:remove", gameId),
    getCoverDataUrl: (gameId: string): Promise<string | null> => ipcRenderer.invoke("covers:getCoverDataUrl", gameId)
  },
  replays: {
    saveReplay: (payload: {
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
    }): Promise<{ path: string; metaPath?: string }> => ipcRenderer.invoke("replays:save", payload),
    openFolder: (): Promise<boolean> => ipcRenderer.invoke("replays:openFolder"),
    openSavedFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke("replays:openSavedFile", filePath)
  }
};

contextBridge.exposeInMainWorld("bridge", bridge);
contextBridge.exposeInMainWorld("ra", {
  getGameData: (payload: { gameId: number; username?: string }): Promise<RetroGameAchievements> => ipcRenderer.invoke("ra:getGameData", payload)
});

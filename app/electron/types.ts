export type Platform = "NES" | "SNES" | "GB" | "GBA" | "MD";
export type EmulatorId = "nes" | "snes" | "gb" | "gba" | "md";

export type ControlAction = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";
export type VideoFps = 30 | 60 | 120;
export type ReplayQuality = "720p" | "1080p";
export type ReplayFps = 30 | 60;
export type ReplayFormat = "webm";

export interface ControlSettings {
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  start: string;
  select: string;
}

export interface AudioSettings {
  enabled: boolean;
  volume: number;
  latency: number;
}

export interface VideoSettings {
  targetFps: VideoFps;
  smoothing: boolean;
}

export interface NetworkSettings {
  signalingUrl: string;
  netplayMode: "lockstep" | "stream";
}

export interface ReplaySettings {
  enabled: boolean;
  hotkey: string;
  prebufferSeconds: number;
  quality: ReplayQuality;
  fps: ReplayFps;
  format: ReplayFormat;
  saveFolder: string;
}

export interface UiSettings {
  controlPreset: "keyboard" | "gamepad";
  libraryShowPlatformBadges: boolean;
  libraryEmulatorFilter: "all" | EmulatorId;
  theme: "blue" | "pink" | "steam";
  retroAchievementsUsername: string;
  inviteSoundEnabled: boolean;
}

export interface GameRecord {
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

export interface RetroAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badgeUrl: string;
  isUnlocked: boolean;
  unlockedAt?: string;
}

export interface RetroGameAchievements {
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

export interface RetroApiKeyStatus {
  configured: boolean;
  source: "env" | "secure-store" | "memory" | "none";
  persistent: boolean;
}

export interface Profile {
  userId: string;
  displayName: string;
  friendCode: string;
  avatarDataUrl?: string;
}

export interface RoomState {
  roomId: string;
  gameId: string;
  hostUserId: string;
  members: string[];
  spectators: string[];
  locked: boolean;
  readyByUserId: string[];
  session?: {
    mode: "lockstep" | "stream";
    gameId: string;
    gameName: string;
    platform: string;
    emulatorId?: string;
    romHash?: string;
    protocolVersion?: string;
    coreVersion?: string;
    romBase64?: string;
    startedAt: string;
  };
}

export interface WsResponse {
  type: "response";
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

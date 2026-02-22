export type Platform = "NES" | "SNES";
export type EmulatorId = "nes" | "snes";
export type ScaleMode = "2x" | "3x" | "4x" | "fit";
export type PixelMode = "nearest" | "smooth";
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
  fullscreen: boolean;
  scale: ScaleMode;
  pixelMode: PixelMode;
  crtEnabled: boolean;
  scanlinesIntensity: number;
  bloom: number;
  vignette: boolean;
  colorCorrection: boolean;
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

export interface NetworkSettings {
  signalingUrl: string;
  netplayMode: "lockstep" | "stream";
}

export interface LocalSignalingServerStatus {
  running: boolean;
  pid?: number;
  port: number;
  url: string;
  message?: string;
}

export interface NgrokTunnelStatus {
  running: boolean;
  pid?: number;
  publicUrl?: string;
  message?: string;
}

export interface UiSettings {
  controlPreset: "keyboard" | "gamepad";
  libraryShowPlatformBadges: boolean;
  libraryEmulatorFilter: "all" | EmulatorId;
  theme: "blue" | "pink";
  retroAchievementsUsername: string;
}

export interface RetroApiKeyStatus {
  configured: boolean;
  source: "env" | "secure-store" | "memory" | "none";
  persistent: boolean;
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

export interface Profile {
  userId: string;
  displayName: string;
  friendCode: string;
  avatarDataUrl?: string;
}

export interface FriendItem {
  userId: string;
  displayName: string;
  friendCode: string;
  online: boolean;
  avatarDataUrl?: string;
  roomId?: string;
  inGame?: boolean;
  gameId?: string;
  gameName?: string;
}

export interface InvitePayload {
  inviteId: string;
  fromUserId: string;
  fromDisplayName: string;
  roomId: string;
  gameId: string;
}

export interface RoomState {
  roomId: string;
  gameId: string;
  hostUserId: string;
  members: string[];
  spectators: string[];
  locked: boolean;
  readyByUserId: string[];
}

declare global {
  interface Window {
    __checkPink?: () => void;
    bridge: {
      addGame(): Promise<GameRecord | null>;
      listGames(): Promise<GameRecord[]>;
      removeGame(gameId: string): Promise<GameRecord[]>;
      setGameCover(gameId: string, dataUrl: string): Promise<GameRecord>;
      updateGameEmulator(gameId: string, emulatorId: EmulatorId): Promise<GameRecord>;
      updateGameRetroId(gameId: string, retroAchievementsGameId?: number | null): Promise<GameRecord>;
      openRomFolder(gameId: string): Promise<boolean>;
      startLocalGame(gameId: string): Promise<{ game: GameRecord; romBase64: string }>;
      checkGameLaunch(gameId: string): Promise<{ ok: boolean; reason?: string }>;
      createRoom(gameId: string): Promise<RoomState>;
      joinRoom(roomId: string, spectator?: boolean): Promise<RoomState>;
      getRoomState(roomId: string): Promise<RoomState>;
      closeRoom(roomId: string): Promise<boolean>;
      setRoomReady(roomId: string, ready: boolean): Promise<RoomState>;
      setRoomLock(roomId: string, locked: boolean): Promise<RoomState>;
      kickRoomMember(roomId: string, targetUserId: string): Promise<RoomState>;
      transferRoomHost(roomId: string, targetUserId: string): Promise<RoomState>;
      getRoomChatHistory(roomId: string): Promise<Array<{ id: string; roomId: string; fromUserId: string; fromDisplayName: string; text: string; createdAt: string }>>;
      sendRoomChat(roomId: string, text: string): Promise<boolean>;
      setFullscreen(enabled: boolean): Promise<boolean>;
      getProfile(): Promise<Profile>;
      updateProfile(displayName: string): Promise<Profile>;
      updateProfileAvatar(avatarDataUrl?: string): Promise<Profile>;
      getControls(): Promise<ControlSettings>;
      saveControls(payload: Partial<ControlSettings>): Promise<ControlSettings>;
      getAudioSettings(): Promise<AudioSettings>;
      saveAudioSettings(payload: Partial<AudioSettings>): Promise<AudioSettings>;
      getVideoSettings(): Promise<VideoSettings>;
      saveVideoSettings(payload: Partial<VideoSettings>): Promise<VideoSettings>;
      getReplaySettings(): Promise<ReplaySettings>;
      saveReplaySettings(payload: Partial<ReplaySettings>): Promise<ReplaySettings>;
      getNetworkSettings(): Promise<NetworkSettings>;
      saveNetworkSettings(payload: Partial<NetworkSettings>): Promise<NetworkSettings>;
      getLocalServerStatus(): Promise<LocalSignalingServerStatus>;
      startLocalServer(signalingUrl?: string): Promise<LocalSignalingServerStatus>;
      stopLocalServer(): Promise<LocalSignalingServerStatus>;
      getNgrokStatus(): Promise<NgrokTunnelStatus>;
      startNgrok(signalingUrl?: string): Promise<NgrokTunnelStatus>;
      stopNgrok(): Promise<NgrokTunnelStatus>;
      getUiSettings(): Promise<UiSettings>;
      saveUiSettings(payload: Partial<UiSettings>): Promise<UiSettings>;
      getRaApiKeyStatus(): Promise<RetroApiKeyStatus>;
      setRaApiKey(apiKey: string): Promise<RetroApiKeyStatus>;
      clearRaApiKey(): Promise<RetroApiKeyStatus>;
      connectServer(signalingUrl?: string): Promise<boolean>;
      ensureStreamFirewallAccess(): Promise<{ ok: boolean; message?: string }>;
      covers: {
        pickCover(gameId: string): Promise<GameRecord | null>;
        removeCover(gameId: string): Promise<GameRecord>;
        getCoverDataUrl(gameId: string): Promise<string | null>;
      };
      replays: {
        saveReplay(payload: {
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
        }): Promise<{ path: string; metaPath?: string }>;
        openFolder(): Promise<boolean>;
        openSavedFile(filePath: string): Promise<boolean>;
      };
    };
    ra: {
      getGameData(payload: { gameId: number; username?: string }): Promise<RetroGameAchievements>;
    };
  }
}

export {};

declare global {
  const __APP_DISPLAY_NAME__: string;
}

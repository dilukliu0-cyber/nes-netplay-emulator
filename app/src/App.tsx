import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Controller, NES } from "jsnes";
import { SocialClient } from "./core/socialClient";
import { detectEmulatorByExt } from "./emulators/detect";
import { getEmulator } from "./emulators/registry";
import { SnesGameView } from "./emulators/snes/SnesGameView";
import { t } from "./i18n";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Input } from "./components/ui/Input";
import { ListItem } from "./components/ui/ListItem";
import { SectionHeader } from "./components/ui/SectionHeader";
import { SidebarLibrary } from "./components/SidebarLibrary";
import { NetplayHeader } from "./components/NetplayHeader";
import { SettingsModal } from "./screens/Settings/SettingsModal";
import { applyTheme } from "./theme/themeManager";
import { getGameData as getRetroGameData, pickGameImage } from "./services/raService";
import type {
  AudioSettings,
  ControlSettings,
  EmulatorId,
  FriendItem,
  GameRecord,
  InvitePayload,
  LocalSignalingServerStatus,
  NetworkSettings,
  NgrokTunnelStatus,
  Profile,
  RetroApiKeyStatus,
  RetroGameAchievements,
  ReplaySettings,
  RoomState,
  UiSettings,
  VideoSettings
} from "./types/global";

type GameMode = "solo" | "room";
type MainBottomTab = "network" | "friends";
type ControlAction = keyof ControlSettings;
type SettingsCategory = "general" | "controls" | "video" | "audio" | "network" | "library" | "about";
type NetplayConfig = {
  enabled: boolean;
  social: SocialClient;
  roomId: string;
  localUserId: string;
  hostUserId: string;
  localPlayer: 1 | 2;
  transport: "lockstep" | "stream";
  isSpectator?: boolean;
  streamPeerUserId?: string;
};
type RoomChatMessage = {
  id: string;
  roomId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
};

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

const defaultAudioSettings: AudioSettings = { enabled: true, volume: 80, latency: 0 };
const defaultVideoSettings: VideoSettings = {
  fullscreen: true,
  scale: "fit",
  pixelMode: "nearest",
  crtEnabled: false,
  scanlinesIntensity: 35,
  bloom: 0,
  vignette: false,
  colorCorrection: false
};
const defaultReplaySettings: ReplaySettings = {
  enabled: true,
  hotkey: "F8",
  prebufferSeconds: 10,
  quality: "720p",
  fps: 30,
  format: "webm",
  saveFolder: ""
};
const defaultNetworkSettings: NetworkSettings = {
  signalingUrl: (import.meta.env.VITE_SIGNALING_URL as string | undefined) || "ws://localhost:8787",
  netplayMode: "lockstep"
};
const defaultUiSettings: UiSettings = {
  controlPreset: "keyboard",
  libraryShowPlatformBadges: true,
  libraryEmulatorFilter: "all",
  theme: "blue",
  retroAchievementsUsername: ""
};

function b64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PL";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatLastPlayed(value?: string): string {
  if (!value) return t("app.never");
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? t("app.unknown") : d.toLocaleString();
}

function formatPlayTime(total: number): string {
  if (!total || total <= 0) return `0 ${t("app.min")}`;
  const m = Math.floor(total / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h <= 0 ? `${m} ${t("app.min")}` : `${h} ${t("app.hourShort")} ${r} ${t("app.min")}`;
}

function replaySuggestedName(gameName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeGame = gameName.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_") || "game";
  return `${safeGame}_${stamp}.webm`;
}

function getRomExt(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return "";
  return filePath.slice(dot).toLowerCase();
}

function resolveNetplayGame(payload: { gameId: string; gameName?: string; platform?: string }, games: GameRecord[]): GameRecord {
  const byId = games.find((g) => g.id === payload.gameId);
  if (byId) {
    return byId;
  }
  const emulatorId: EmulatorId = payload.platform === "SNES" ? "snes" : "nes";
  return {
    id: payload.gameId,
    name: payload.gameName || "Netplay Session",
    platform: payload.platform === "SNES" ? "SNES" : "NES",
    emulatorId,
    path: "",
    sha256: "",
    addedAt: new Date().toISOString(),
    totalPlayTime: 0
  };
}

const INPUT_BIT_UP = 1 << 0;
const INPUT_BIT_DOWN = 1 << 1;
const INPUT_BIT_LEFT = 1 << 2;
const INPUT_BIT_RIGHT = 1 << 3;
const INPUT_BIT_A = 1 << 4;
const INPUT_BIT_B = 1 << 5;
const INPUT_BIT_START = 1 << 6;
const INPUT_BIT_SELECT = 1 << 7;
const LOCKSTEP_INPUT_DELAY_FRAMES = 3;
const COVER_OUTPUT_WIDTH = 640;
const COVER_OUTPUT_HEIGHT = 360;
const AVATAR_OUTPUT_SIZE = 512;
const SAVE_STATE_STORAGE_PREFIX = "nes-netplay-emulator.save.v1";
const SAVE_SLOT_AUTO = "auto";
const SAVE_SLOT_DEFAULT = 1;
const QUICK_SAVE_SLOTS = [1, 2, 3, 4, 5] as const;
type SaveSlot = (typeof QUICK_SAVE_SLOTS)[number];
type SaveSlotId = SaveSlot | typeof SAVE_SLOT_AUTO;

function stateStorageKey(game: GameRecord, slot: SaveSlotId, roomScope?: string): string {
  const scope = roomScope ? `room:${roomScope}` : "solo";
  return `${SAVE_STATE_STORAGE_PREFIX}:${game.emulatorId}:${game.id}:${scope}:slot:${slot}`;
}

function legacyStateStorageKey(game: GameRecord): string {
  return `${SAVE_STATE_STORAGE_PREFIX}:${game.emulatorId}:${game.id}`;
}

function saveSlotLabel(slot: SaveSlotId): string {
  if (slot === SAVE_SLOT_AUTO) return "Autosave";
  return `Slot ${slot}`;
}

function resolveCanvasFillColor(): string {
  if (typeof window === "undefined") {
    return "black";
  }
  return getComputedStyle(document.body).getPropertyValue("--app-bg").trim() || "black";
}

function GameView(props: {
  game: GameRecord;
  romBase64: string;
  controls: ControlSettings;
  videoSettings: VideoSettings;
  replaySettings: ReplaySettings;
  netplay?: NetplayConfig;
  paused: boolean;
  pauseButtonLabel: string;
  pauseInfo?: string;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  onToast: (message: string) => void;
  showInGameChat: boolean;
  inGameChatSide: "left" | "right";
  roomChatMessages: RoomChatMessage[];
  roomChatInput: string;
  onRoomChatInput: (value: string) => void;
  onSendRoomChat: () => void;
  localUserId?: string;
}) {
  const {
    game, romBase64, controls, videoSettings, replaySettings, netplay, paused, pauseButtonLabel, pauseInfo, audioEnabled, onToggleAudio, onTogglePause, onOpenSettings, onExit, onToast,
    showInGameChat, inGameChatSide, roomChatMessages, roomChatInput, onRoomChatInput, onSendRoomChat, localUserId
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<ImageData | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const prebufferRef = useRef<Array<{ blob: Blob; createdAt: number }>>([]);
  const sessionChunksRef = useRef<Blob[]>([]);
  const isSessionRecordingRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const replayRef = useRef(replaySettings);
  const videoRef = useRef(videoSettings);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [isSessionRecording, setIsSessionRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slotPreviewById, setSlotPreviewById] = useState<Record<SaveSlot, { savedAt?: string; screenshot?: string }>>({
    1: {},
    2: {},
    3: {},
    4: {},
    5: {}
  });
  const menuOpenRef = useRef(false);
  const pausedRef = useRef(paused);
  const nesRef = useRef<NES | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueLRef = useRef<number[]>([]);
  const audioQueueRRef = useRef<number[]>([]);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    if (paused) {
      setMenuOpen(false);
    }
  }, [paused]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const roomScope = netplay?.enabled ? netplay.roomId : undefined;
    const next: Record<SaveSlot, { savedAt?: string; screenshot?: string }> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
    for (const slot of QUICK_SAVE_SLOTS) {
      const raw = localStorage.getItem(stateStorageKey(game, slot, roomScope));
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as { savedAt?: string; screenshot?: string };
        next[slot] = { savedAt: parsed.savedAt, screenshot: parsed.screenshot };
      } catch {
        next[slot] = {};
      }
    }
    setSlotPreviewById(next);
  }, [menuOpen, game, netplay?.enabled, netplay?.roomId]);

  useEffect(() => {
    replayRef.current = replaySettings;
  }, [replaySettings]);

  useEffect(() => {
    videoRef.current = videoSettings;
  }, [videoSettings]);

  useEffect(() => {
    const gainNode = audioGainRef.current;
    if (gainNode) {
      gainNode.gain.value = audioEnabled ? 0.8 : 0;
    }
    if (audioEnabled && audioContextRef.current?.state === "suspended") {
      void audioContextRef.current.resume().catch(() => undefined);
    }
  }, [audioEnabled]);

  useEffect(() => {
    if (!isSessionRecording) {
      setSessionSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      if (!sessionStartRef.current) return;
      setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 300);
    return () => window.clearInterval(id);
  }, [isSessionRecording]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    frameRef.current = ctx.createImageData(256, 240);
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      try {
        const context = new AudioContextCtor({ sampleRate: 44100 });
        const gainNode = context.createGain();
        gainNode.gain.value = audioEnabled ? 0.8 : 0;
        const audioNode = context.createScriptProcessor(1024, 0, 2);
        audioNode.onaudioprocess = (event) => {
          const outL = event.outputBuffer.getChannelData(0);
          const outR = event.outputBuffer.getChannelData(1);
          const queueL = audioQueueLRef.current;
          const queueR = audioQueueRRef.current;
          for (let i = 0; i < outL.length; i += 1) {
            outL[i] = queueL.length > 0 ? (queueL.shift() as number) : 0;
            outR[i] = queueR.length > 0 ? (queueR.shift() as number) : 0;
          }
        };
        audioNode.connect(gainNode);
        gainNode.connect(context.destination);
        audioContextRef.current = context;
        audioGainRef.current = gainNode;
        audioNodeRef.current = audioNode;
      } catch {
        audioContextRef.current = null;
        audioGainRef.current = null;
        audioNodeRef.current = null;
      }
    }

    const nes = new NES({
      onFrame: (frameBuffer: number[]) => {
        const frame = frameRef.current;
        if (!frame) return;

        // jsnes frame format is 0x00BBGGRR.
        for (let i = 0; i < frameBuffer.length; i += 1) {
          const p = frameBuffer[i];
          const o = i * 4;
          frame.data[o] = p & 255;
          frame.data[o + 1] = (p >> 8) & 255;
          frame.data[o + 2] = (p >> 16) & 255;
          frame.data[o + 3] = 255;
        }

        ctx.imageSmoothingEnabled = videoRef.current.pixelMode === "smooth";
        ctx.putImageData(frame, 0, 0);
      },
      onAudioSample: (left: number, right: number) => {
        const queueL = audioQueueLRef.current;
        const queueR = audioQueueRRef.current;
        queueL.push(left);
        queueR.push(right);
        if (queueL.length > 8192) {
          queueL.splice(0, queueL.length - 4096);
          queueR.splice(0, queueR.length - 4096);
        }
      }
    });
    nesRef.current = nes;

    nes.loadROM(bytesToBinaryString(b64ToBytes(romBase64)));

    const map: Record<string, number> = {
      [controls.up]: Controller.BUTTON_UP,
      [controls.down]: Controller.BUTTON_DOWN,
      [controls.left]: Controller.BUTTON_LEFT,
      [controls.right]: Controller.BUTTON_RIGHT,
      [controls.a]: Controller.BUTTON_A,
      [controls.b]: Controller.BUTTON_B,
      [controls.start]: Controller.BUTTON_START,
      [controls.select]: Controller.BUTTON_SELECT
    };

    const keyToBit: Record<string, number> = {
      [controls.up]: INPUT_BIT_UP,
      [controls.down]: INPUT_BIT_DOWN,
      [controls.left]: INPUT_BIT_LEFT,
      [controls.right]: INPUT_BIT_RIGHT,
      [controls.a]: INPUT_BIT_A,
      [controls.b]: INPUT_BIT_B,
      [controls.start]: INPUT_BIT_START,
      [controls.select]: INPUT_BIT_SELECT
    };

    const bitToButton: Array<{ bit: number; button: number }> = [
      { bit: INPUT_BIT_UP, button: Controller.BUTTON_UP },
      { bit: INPUT_BIT_DOWN, button: Controller.BUTTON_DOWN },
      { bit: INPUT_BIT_LEFT, button: Controller.BUTTON_LEFT },
      { bit: INPUT_BIT_RIGHT, button: Controller.BUTTON_RIGHT },
      { bit: INPUT_BIT_A, button: Controller.BUTTON_A },
      { bit: INPUT_BIT_B, button: Controller.BUTTON_B },
      { bit: INPUT_BIT_START, button: Controller.BUTTON_START },
      { bit: INPUT_BIT_SELECT, button: Controller.BUTTON_SELECT }
    ];

    const isLockstepNetplay = Boolean(netplay?.enabled && netplay.transport === "lockstep");
    const isStreamHost = Boolean(netplay?.enabled && netplay.transport === "stream" && netplay.localUserId === netplay.hostUserId);
    const localPlayer = isLockstepNetplay ? netplay!.localPlayer : 1;
    const remotePlayer = isLockstepNetplay ? (localPlayer === 1 ? 2 : 1) : 2;
    let localInputState = 0;
    let previousLocalAppliedState = 0;
    let previousRemoteAppliedState = 0;
    let currentFrame = 0;
    let plannedLocalFrame = 0;
    const localStateByFrame = new Map<number, number>();
    const remoteStateByFrame = new Map<number, number>();
    let remoteStreamInputState = 0;

    const applyMaskToPlayer = (player: number, previousMask: number, nextMask: number): number => {
      for (const item of bitToButton) {
        const wasDown = (previousMask & item.bit) !== 0;
        const isDown = (nextMask & item.bit) !== 0;
        if (wasDown === isDown) {
          continue;
        }
        if (isDown) {
          nes.buttonDown(player, item.button);
        } else {
          nes.buttonUp(player, item.button);
        }
      }
      return nextMask;
    };

    if (isLockstepNetplay) {
      for (let frame = 0; frame < LOCKSTEP_INPUT_DELAY_FRAMES; frame += 1) {
        localStateByFrame.set(frame, 0);
        netplay!.social.sendNetplayInput(netplay!.roomId, frame, 0);
      }
      plannedLocalFrame = LOCKSTEP_INPUT_DELAY_FRAMES;

      netplay!.social.onNetplayInput((payload) => {
        if (payload.roomId !== netplay!.roomId) {
          return;
        }
        if (payload.fromUserId === netplay!.localUserId) {
          return;
        }
        remoteStateByFrame.set(payload.frame, payload.state);
      });
    }

    if (isStreamHost) {
      netplay!.social.onStreamInput((payload) => {
        if (payload.roomId !== netplay!.roomId) {
          return;
        }
        if (netplay!.streamPeerUserId && payload.fromUserId !== netplay!.streamPeerUserId) {
          return;
        }
        remoteStreamInputState = payload.state;
      });
    }

    const down = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (audioContextRef.current?.state === "suspended") {
        void audioContextRef.current.resume().catch(() => undefined);
      }
      if (e.code === "Escape") {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
        return;
      }
      if (e.ctrlKey && /^F[1-5]$/.test(e.code)) {
        e.preventDefault();
        const slot = Number(e.code.slice(1)) as SaveSlot;
        if (e.shiftKey) loadState(slot);
        else saveState(slot);
        return;
      }
      if (e.code === "F5") {
        e.preventDefault();
        saveState(SAVE_SLOT_DEFAULT);
        return;
      }
      if (e.code === "F9") {
        e.preventDefault();
        loadState(SAVE_SLOT_DEFAULT);
        return;
      }
      if (menuOpenRef.current) return;

      const normalizedHotkey = replayRef.current.hotkey.toUpperCase();
      if (replayRef.current.enabled && e.code.toUpperCase() === normalizedHotkey) {
        e.preventDefault();
        void toggleReplaySession();
        return;
      }

      const b = map[e.code];
      if (b !== undefined) {
        e.preventDefault();
        if (isLockstepNetplay || isStreamHost) {
          const bit = keyToBit[e.code];
          localInputState |= bit;
        } else {
          nes.buttonDown(localPlayer, b);
        }
      }
    };

    const up = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const b = map[e.code];
      if (b !== undefined) {
        e.preventDefault();
        if (isLockstepNetplay || isStreamHost) {
          const bit = keyToBit[e.code];
          localInputState &= ~bit;
        } else {
          nes.buttonUp(localPlayer, b);
        }
      }
    };

    const loop = () => {
      if (!runningRef.current) return;
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (isLockstepNetplay) {
        while (plannedLocalFrame <= currentFrame + LOCKSTEP_INPUT_DELAY_FRAMES) {
          localStateByFrame.set(plannedLocalFrame, localInputState);
          netplay!.social.sendNetplayInput(netplay!.roomId, plannedLocalFrame, localInputState);
          plannedLocalFrame += 1;
        }

        let steps = 0;
        while (steps < 2) {
          const localFrameState = localStateByFrame.get(currentFrame);
          const remoteFrameState = remoteStateByFrame.get(currentFrame);
          if (localFrameState === undefined || remoteFrameState === undefined) {
            break;
          }

          previousLocalAppliedState = applyMaskToPlayer(localPlayer, previousLocalAppliedState, localFrameState);
          previousRemoteAppliedState = applyMaskToPlayer(remotePlayer, previousRemoteAppliedState, remoteFrameState);
          nes.frame();
          currentFrame += 1;
          steps += 1;
        }

        if (currentFrame % 120 === 0) {
          const minFrameToKeep = Math.max(0, currentFrame - 180);
          for (const key of localStateByFrame.keys()) {
            if (key < minFrameToKeep) {
              localStateByFrame.delete(key);
            }
          }
          for (const key of remoteStateByFrame.keys()) {
            if (key < minFrameToKeep) {
              remoteStateByFrame.delete(key);
            }
          }
        }
      } else {
        if (isStreamHost) {
          previousLocalAppliedState = applyMaskToPlayer(localPlayer, previousLocalAppliedState, localInputState);
          previousRemoteAppliedState = applyMaskToPlayer(remotePlayer, previousRemoteAppliedState, remoteStreamInputState);
        }
        nes.frame();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
    addEventListener("keydown", down);
    addEventListener("keyup", up);

    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      nesRef.current = null;
      audioNodeRef.current?.disconnect();
      audioGainRef.current?.disconnect();
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }
      audioContextRef.current = null;
      audioGainRef.current = null;
      audioNodeRef.current = null;
      audioQueueLRef.current = [];
      audioQueueRRef.current = [];
      saveState(SAVE_SLOT_AUTO, true);
      if (isLockstepNetplay) {
        netplay!.social.onNetplayInput(() => undefined);
      }
      if (isStreamHost) {
        netplay!.social.onStreamInput(() => undefined);
      }
    };
  }, [romBase64, controls, netplay]);

  function saveState(slot: SaveSlotId = SAVE_SLOT_DEFAULT, silent = false) {
    const roomScope = netplay?.enabled ? netplay.roomId : undefined;
    const nes = nesRef.current as (NES & { toJSON?: () => unknown }) | null;
    if (!nes || typeof nes.toJSON !== "function") {
      if (!silent) onToast("Save state is not supported");
      return;
    }
    try {
      const snapshot = nes.toJSON();
      const screenshot = canvasRef.current?.toDataURL("image/png");
      localStorage.setItem(stateStorageKey(game, slot, roomScope), JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        slot,
        screenshot,
        state: snapshot
      }));
      if (typeof slot === "number") {
        const savedAt = new Date().toISOString();
        setSlotPreviewById((prev) => ({
          ...prev,
          [slot]: { savedAt, screenshot }
        }));
      }
      if (!silent) onToast(`${saveSlotLabel(slot)} saved`);
    } catch {
      if (!silent) onToast("Failed to save state");
    }
  }

  function loadState(slot: SaveSlotId = SAVE_SLOT_DEFAULT, silent = false) {
    const roomScope = netplay?.enabled ? netplay.roomId : undefined;
    const nes = nesRef.current as (NES & { fromJSON?: (snapshot: unknown) => void }) | null;
    if (!nes || typeof nes.fromJSON !== "function") {
      if (!silent) onToast("Load state is not supported");
      return;
    }
    let raw = localStorage.getItem(stateStorageKey(game, slot, roomScope));
    if (!raw && roomScope) {
      raw = localStorage.getItem(stateStorageKey(game, slot));
    }
    if (!raw && slot === SAVE_SLOT_DEFAULT) {
      raw = localStorage.getItem(legacyStateStorageKey(game));
    }
    if (!raw) {
      if (!silent && slot !== SAVE_SLOT_AUTO) onToast("No save state for this game");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { state?: unknown };
      if (parsed && parsed.state !== undefined) {
        nes.fromJSON(parsed.state);
        if (!silent) onToast(`${saveSlotLabel(slot)} loaded`);
        return;
      }
      if (!silent) onToast("Save state is corrupted");
    } catch {
      if (!silent) onToast("Failed to load state");
    }
  }

  function restartGame() {
    const nes = nesRef.current;
    if (!nes) {
      onToast("Game is not ready");
      return;
    }
    try {
      nes.loadROM(bytesToBinaryString(b64ToBytes(romBase64)));
      onToast("Игра перезапущена");
    } catch {
      onToast("Не удалось перезапустить игру");
    }
  }

  useEffect(() => {
    const isStreamHost = Boolean(netplay?.enabled && netplay.transport === "stream" && netplay.localUserId === netplay.hostUserId);
    if (!isStreamHost) {
      return;
    }
    const streamNetplay = netplay!;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const stream = canvas.captureStream(60);
    const peerByUserId = new Map<string, RTCPeerConnection>();
    const pendingCandidatesByUserId = new Map<string, RTCIceCandidateInit[]>();
    const remoteDescriptionSetByUserId = new Map<string, boolean>();
    const localDescriptionSentByUserId = new Map<string, boolean>();

    const ensurePeer = (peerUserId: string): RTCPeerConnection => {
      const existing = peerByUserId.get(peerUserId);
      if (existing) {
        return existing;
      }
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }
        streamNetplay.social.sendStreamSignal(streamNetplay.roomId, peerUserId, {
          type: "candidate",
          candidate: event.candidate.toJSON()
        });
      };
      peerByUserId.set(peerUserId, pc);
      pendingCandidatesByUserId.set(peerUserId, []);
      remoteDescriptionSetByUserId.set(peerUserId, false);
      localDescriptionSentByUserId.set(peerUserId, false);
      return pc;
    };

    const createAndSendOffer = async (peerUserId: string) => {
      const pc = ensurePeer(peerUserId);
      if (localDescriptionSentByUserId.get(peerUserId)) {
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      streamNetplay.social.sendStreamSignal(streamNetplay.roomId, peerUserId, offer);
      localDescriptionSentByUserId.set(peerUserId, true);
    };

    const flushPendingCandidates = async (peerUserId: string) => {
      const pc = ensurePeer(peerUserId);
      const pending = pendingCandidatesByUserId.get(peerUserId) || [];
      if (!remoteDescriptionSetByUserId.get(peerUserId) || !pending.length) {
        return;
      }
      while (pending.length) {
        const candidate = pending.shift();
        if (!candidate) {
          continue;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
    };

    streamNetplay.social.onStreamSignal((payload) => {
      if (payload.roomId !== streamNetplay.roomId || payload.fromUserId === streamNetplay.localUserId) {
        return;
      }
      const peerUserId = payload.fromUserId;
      const signal = payload.signal as { type?: string; sdp?: string; candidate?: RTCIceCandidateInit };
      if (!signal || typeof signal !== "object") {
        return;
      }
      if (signal.type === "ready") {
        void createAndSendOffer(peerUserId);
        return;
      }
      if ((signal.type === "answer" || signal.type === "offer") && signal.sdp) {
        const pc = ensurePeer(peerUserId);
        void pc.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }))
          .then(async () => {
            remoteDescriptionSetByUserId.set(peerUserId, true);
            await flushPendingCandidates(peerUserId);
          })
          .catch(() => undefined);
        return;
      }
      if (signal.type === "candidate" && signal.candidate) {
        const pc = ensurePeer(peerUserId);
        if (!remoteDescriptionSetByUserId.get(peerUserId)) {
          const pending = pendingCandidatesByUserId.get(peerUserId) || [];
          pending.push(signal.candidate);
          pendingCandidatesByUserId.set(peerUserId, pending);
          return;
        }
        void pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => undefined);
      }
    });

    return () => {
      streamNetplay.social.onStreamSignal(() => undefined);
      for (const pc of peerByUserId.values()) {
        pc.close();
      }
      stream.getTracks().forEach((track) => track.stop());
    };
  }, [netplay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopRecorder = () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      recorderRef.current = null;
      prebufferRef.current = [];
      if (isSessionRecordingRef.current) {
        isSessionRecordingRef.current = false;
        setIsSessionRecording(false);
        sessionChunksRef.current = [];
      }
    };

    if (!replaySettings.enabled || typeof MediaRecorder === "undefined") {
      stopRecorder();
      return;
    }

    const stream = canvas.captureStream(replaySettings.fps);
    const preferred = "video/webm;codecs=vp8,opus";
    const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const now = Date.now();
      prebufferRef.current.push({ blob: event.data, createdAt: now });

      const cutoff = now - replayRef.current.prebufferSeconds * 1000;
      while (prebufferRef.current.length && prebufferRef.current[0].createdAt < cutoff) {
        prebufferRef.current.shift();
      }

      if (isSessionRecordingRef.current) sessionChunksRef.current.push(event.data);
    };

    recorder.start(250);
    recorderRef.current = recorder;

    return () => {
      stopRecorder();
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [replaySettings.enabled, replaySettings.fps]);

  const toggleReplaySession = async () => {
    if (!replayRef.current.enabled) {
      onToast("Replay is disabled in settings");
      return;
    }
    if (!recorderRef.current) {
      onToast("Replay recorder is not initialized");
      return;
    }

    if (!isSessionRecordingRef.current) {
      sessionChunksRef.current = prebufferRef.current.map((c) => c.blob);
      isSessionRecordingRef.current = true;
      setIsSessionRecording(true);
      sessionStartRef.current = Date.now();
      onToast(`Replay started (prebuffer ${replayRef.current.prebufferSeconds}s)`);
      return;
    }

    isSessionRecordingRef.current = false;
    setIsSessionRecording(false);
    const chunks = [...sessionChunksRef.current];
    sessionChunksRef.current = [];
    sessionStartRef.current = null;

    if (!chunks.length) {
      onToast("Replay is empty");
      return;
    }

    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const saved = await window.bridge.replays.saveReplay({
      suggestedName: replaySuggestedName(game.name),
      bytes,
      meta: {
        emulatorId: game.emulatorId,
        romHash: game.sha256,
        gameId: game.id,
        roomId: netplay?.roomId,
        mode: netplay?.enabled ? "room" : "solo",
        createdAt: new Date().toISOString()
      }
    }).catch(() => null);
    if (!saved) {
      onToast("Failed to save replay");
      return;
    }

    onToast(`Saved: ${saved.path}`);
  };

  const scaleClass = `scale-${videoSettings.scale}`;
  const pixelClass = videoSettings.pixelMode === "smooth" ? "pixels-smooth" : "pixels-nearest";
  const scanlineOpacity = videoSettings.crtEnabled ? Math.max(0, Math.min(100, videoSettings.scanlinesIntensity)) / 100 : 0;
  const bloomFactor = videoSettings.bloom / 100;
  const canvasFilter = [
    videoSettings.colorCorrection ? "contrast(1.04) saturate(1.06)" : "",
    bloomFactor > 0 ? `brightness(${1 + bloomFactor * 0.12})` : ""
  ].filter(Boolean).join(" ");

  return (
    <div className="game-view-root">
      <div className={`game-surface ${scaleClass}`}>
        <canvas ref={canvasRef} width={256} height={240} className={`game-canvas ${pixelClass}`} style={{ filter: canvasFilter || undefined }} aria-label={game.name} />
        <div className="game-filter-overlay" style={{ opacity: scanlineOpacity }} />
        {videoSettings.vignette && <div className="game-vignette" />}
        {bloomFactor > 0 && <div className="game-glow" style={{ opacity: bloomFactor * 0.35 }} />}
      </div>

      <div className="replay-controls">
        <Button variant={isSessionRecording ? "danger" : "secondary"} onClick={() => void toggleReplaySession()}>
          {isSessionRecording ? "Stop" : "Replay"}
        </Button>
        <span className="replay-meta">Hotkey: {replaySettings.hotkey} {isSessionRecording ? `| ${sessionSeconds}s` : ""}</span>
      </div>
      {showInGameChat && (
        <InGameRoomChatPanel
          side={inGameChatSide}
          messages={roomChatMessages}
          input={roomChatInput}
          onInput={onRoomChatInput}
          onSend={onSendRoomChat}
          localUserId={localUserId}
        />
      )}

      {menuOpen && (
        <div className="in-game-menu-overlay" onClick={() => setMenuOpen(false)}>
          <Card className="in-game-menu" onClick={(event) => event.stopPropagation()}>
            <h3>{t("app.gameMenuTitle")}</h3>
            <div className="in-game-menu-actions">
              <Button variant="secondary" onClick={() => setMenuOpen(false)}>{t("app.gameMenuContinue")}</Button>
              <Button variant="secondary" onClick={() => restartGame()}>Начать заново</Button>
              <Button variant="secondary" onClick={() => { onToggleAudio(); }}>{audioEnabled ? t("app.gameMenuSoundOn") : t("app.gameMenuSoundOff")}</Button>
              <Button variant="secondary" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>{t("app.gameMenuSettings")}</Button>
              <Button variant="danger" onClick={onExit}>{t("app.gameMenuExit")}</Button>
            </div>
            <div className="save-slots-grid">
              {QUICK_SAVE_SLOTS.map((slot) => (
                <Card key={`menu-slot-${slot}`} className="save-slot-card">
                  <div className="save-slot-head">Slot {slot}</div>
                  {slotPreviewById[slot]?.screenshot ? (
                    <img src={slotPreviewById[slot].screenshot} alt={`Slot ${slot}`} className="save-slot-preview" />
                  ) : (
                    <div className="save-slot-preview empty">Пусто</div>
                  )}
                  <div className="save-slot-meta">
                    {slotPreviewById[slot]?.savedAt ? new Date(slotPreviewById[slot].savedAt as string).toLocaleString() : "Нет сохранения"}
                  </div>
                  <div className="save-slot-actions">
                    <Button variant="secondary" onClick={() => saveState(slot)}>Сохранить</Button>
                    <Button variant="secondary" onClick={() => loadState(slot)}>Загрузить</Button>
                  </div>
                </Card>
              ))}
            </div>
            <p className="replay-meta">Slots: `Ctrl+F1..F5` save, `Ctrl+Shift+F1..F5` load, autosave on exit.</p>
            {pauseInfo && <p className="replay-meta">{pauseInfo}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function StreamClientView(props: {
  game: GameRecord;
  controls: ControlSettings;
  netplay: NetplayConfig;
  paused: boolean;
  pauseButtonLabel: string;
  pauseInfo?: string;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  onToast: (message: string) => void;
  showInGameChat: boolean;
  inGameChatSide: "left" | "right";
  roomChatMessages: RoomChatMessage[];
  roomChatInput: string;
  onRoomChatInput: (value: string) => void;
  onSendRoomChat: () => void;
  localUserId?: string;
}) {
  const {
    game, controls, netplay, paused, pauseButtonLabel, pauseInfo, audioEnabled, onToggleAudio, onTogglePause, onOpenSettings, onExit, onToast,
    showInGameChat, inGameChatSide, roomChatMessages, roomChatInput, onRoomChatInput, onSendRoomChat, localUserId
  } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const pausedRef = useRef(paused);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    if (paused) {
      setMenuOpen(false);
    }
  }, [paused]);

  useEffect(() => {
    if (!netplay.streamPeerUserId) {
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    let guestRemoteDescriptionSet = false;
    const guestPendingCandidates: RTCIceCandidateInit[] = [];

    const flushGuestPendingCandidates = async () => {
      if (!guestRemoteDescriptionSet || !guestPendingCandidates.length) {
        return;
      }
      while (guestPendingCandidates.length) {
        const candidate = guestPendingCandidates.shift();
        if (!candidate) {
          continue;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      netplay.social.sendStreamSignal(netplay.roomId, netplay.streamPeerUserId!, {
        type: "candidate",
        candidate: event.candidate.toJSON()
      });
    };

    netplay.social.onStreamSignal((payload) => {
      if (payload.roomId !== netplay.roomId || payload.fromUserId !== netplay.streamPeerUserId) {
        return;
      }
      const signal = payload.signal as { type?: string; sdp?: string; candidate?: RTCIceCandidateInit };
      if (!signal || typeof signal !== "object") {
        return;
      }

      if (signal.type === "offer" && signal.sdp) {
        void pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }))
          .then(async () => {
            guestRemoteDescriptionSet = true;
            await flushGuestPendingCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            netplay.social.sendStreamSignal(netplay.roomId, netplay.streamPeerUserId!, answer);
          })
          .catch(() => onToast("Failed to start stream"));
        return;
      }

      if (signal.type === "candidate" && signal.candidate) {
        if (!guestRemoteDescriptionSet) {
          guestPendingCandidates.push(signal.candidate);
          return;
        }
        void pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => undefined);
      }
    });

    netplay.social.sendStreamSignal(netplay.roomId, netplay.streamPeerUserId, { type: "ready" });

    return () => {
      netplay.social.onStreamSignal(() => undefined);
      pc.close();
    };
  }, [netplay, onToast]);

  useEffect(() => {
    if (netplay.isSpectator) {
      return;
    }
    const keyToBit: Record<string, number> = {
      [controls.up]: INPUT_BIT_UP,
      [controls.down]: INPUT_BIT_DOWN,
      [controls.left]: INPUT_BIT_LEFT,
      [controls.right]: INPUT_BIT_RIGHT,
      [controls.a]: INPUT_BIT_A,
      [controls.b]: INPUT_BIT_B,
      [controls.start]: INPUT_BIT_START,
      [controls.select]: INPUT_BIT_SELECT
    };

    let localInputState = 0;
    const pushInput = () => netplay.social.sendStreamInput(netplay.roomId, localInputState);

    const down = (event: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setMenuOpen((prev) => !prev);
        return;
      }
      if (menuOpenRef.current) return;
      const bit = keyToBit[event.code];
      if (bit === undefined) {
        return;
      }
      event.preventDefault();
      localInputState |= bit;
      pushInput();
    };

    const up = (event: KeyboardEvent) => {
      if (pausedRef.current) return;
      const bit = keyToBit[event.code];
      if (bit === undefined) {
        return;
      }
      event.preventDefault();
      localInputState &= ~bit;
      pushInput();
    };

    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", pushInput);

    return () => {
      localInputState = 0;
      pushInput();
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", pushInput);
    };
  }, [controls, netplay, onExit]);

  return (
    <div className="game-view-root">
      <div className="game-surface scale-fit">
        <video ref={videoRef} className="game-canvas pixels-smooth" autoPlay playsInline muted />
      </div>
      <div className="replay-controls">
        <Button variant="secondary" onClick={onExit}>Exit</Button>
        <span className="replay-meta">Streaming mode: {game.name}{netplay.isSpectator ? " (spectator)" : ""}</span>
      </div>
      {showInGameChat && (
        <InGameRoomChatPanel
          side={inGameChatSide}
          messages={roomChatMessages}
          input={roomChatInput}
          onInput={onRoomChatInput}
          onSend={onSendRoomChat}
          localUserId={localUserId}
        />
      )}
      {menuOpen && (
        <div className="in-game-menu-overlay" onClick={() => setMenuOpen(false)}>
          <Card className="in-game-menu" onClick={(event) => event.stopPropagation()}>
            <h3>{t("app.gameMenuTitle")}</h3>
            <div className="in-game-menu-actions">
              <Button variant="secondary" onClick={() => setMenuOpen(false)}>{t("app.gameMenuContinue")}</Button>
              <Button variant="secondary" onClick={() => { onToggleAudio(); }}>{audioEnabled ? t("app.gameMenuSoundOn") : t("app.gameMenuSoundOff")}</Button>
              <Button variant="secondary" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>{t("app.gameMenuSettings")}</Button>
              <Button variant="danger" onClick={onExit}>{t("app.gameMenuExit")}</Button>
            </div>
            {pauseInfo && <p className="replay-meta">{pauseInfo}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function InGameRoomChatPanel(props: {
  side: "left" | "right";
  messages: RoomChatMessage[];
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  localUserId?: string;
}) {
  const { side, messages, input, onInput, onSend, localUserId } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const visibleMessages = messages.slice(-80);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!stickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [visibleMessages.length]);

  return (
    <Card className={`ingame-chat-panel ingame-chat-${side}`}>
      <div className="ingame-chat-title">Room chat</div>
      <div
        ref={listRef}
        className="ingame-chat-list"
        onScroll={() => {
          const list = listRef.current;
          if (!list) return;
          const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
          stickToBottomRef.current = nearBottom;
        }}
      >
        {visibleMessages.map((message) => (
          <div key={message.id} className={`ingame-chat-line ${localUserId && message.fromUserId === localUserId ? "mine" : ""}`}>
            <strong>{message.fromDisplayName}:</strong> {message.text}
          </div>
        ))}
        {visibleMessages.length === 0 && <div className="empty-hint">No messages yet</div>}
      </div>
      <div className="ingame-chat-input">
        <Input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSend();
          }}
          placeholder="Message"
        />
        <Button variant="primary" onClick={onSend}>Send</Button>
      </div>
    </Card>
  );
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [games, setGames] = useState<GameRecord[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<GameMode>("solo");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [mainBottomTab, setMainBottomTab] = useState<MainBottomTab>("network");
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<InvitePayload | null>(null);
  const [roomId, setRoomId] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomHostUserId, setRoomHostUserId] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomChatInput, setRoomChatInput] = useState("");
  const [roomChatMessages, setRoomChatMessages] = useState<RoomChatMessage[]>([]);
  const [roomStatus, setRoomStatus] = useState(t("app.roomNotConnected"));
  const [raData, setRaData] = useState<RetroGameAchievements | null>(null);
  const [raLoading, setRaLoading] = useState(false);
  const [raError, setRaError] = useState("");
  const [raSort, setRaSort] = useState<"lockedFirst" | "unlockedFirst">("lockedFirst");
  const [raSummaryByGameId, setRaSummaryByGameId] = useState<Record<string, { unlocked: number; total: number }>>({});
  const [raImagesByGameId, setRaImagesByGameId] = useState<Record<string, string>>({});
  const [raGameIdInput, setRaGameIdInput] = useState("");
  const [raReloadKey, setRaReloadKey] = useState(0);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);
  const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
  const [networkHealth, setNetworkHealth] = useState<"offline" | "good" | "degraded">("offline");
  const [toast, setToast] = useState("");
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>(defaultNetworkSettings);
  const [serverAddressInput, setServerAddressInput] = useState(defaultNetworkSettings.signalingUrl);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [localServerStatus, setLocalServerStatus] = useState<LocalSignalingServerStatus | null>(null);
  const [localServerBusy, setLocalServerBusy] = useState(false);
  const [ngrokStatus, setNgrokStatus] = useState<NgrokTunnelStatus | null>(null);
  const [ngrokBusy, setNgrokBusy] = useState(false);
  const [activeSession, setActiveSession] = useState<{ game: GameRecord; romBase64: string; netplay?: NetplayConfig } | null>(null);
  const [launchCheck, setLaunchCheck] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [controls, setControls] = useState<ControlSettings>(defaultControls);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(defaultAudioSettings);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(defaultVideoSettings);
  const [replaySettings, setReplaySettings] = useState<ReplaySettings>(defaultReplaySettings);
  const [uiSettings, setUiSettings] = useState<UiSettings>(defaultUiSettings);
  const [raApiKeyInput, setRaApiKeyInput] = useState("");
  const [raApiKeyStatus, setRaApiKeyStatus] = useState<RetroApiKeyStatus | null>(null);
  const [raApiKeyBusy, setRaApiKeyBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [remotePause, setRemotePause] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("general");
  const [waitingAction, setWaitingAction] = useState<ControlAction | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverEditorDataUrl, setCoverEditorDataUrl] = useState("");
  const [coverZoom, setCoverZoom] = useState(1);
  const [coverOffsetX, setCoverOffsetX] = useState(0);
  const [coverOffsetY, setCoverOffsetY] = useState(0);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [xpModalOpen, setXpModalOpen] = useState(false);
  const [deleteGameTarget, setDeleteGameTarget] = useState<GameRecord | null>(null);
  const [avatarEditorDataUrl, setAvatarEditorDataUrl] = useState("");
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const networkUrlRef = useRef(defaultNetworkSettings.signalingUrl);
  const roomIdRef = useRef("");
  const roomStateRef = useRef<RoomState | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const gamesRef = useRef<GameRecord[]>([]);
  const socialRef = useRef<SocialClient | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const roomChatListRef = useRef<HTMLDivElement | null>(null);
  const roomChatStickToBottomRef = useRef(true);
  const coverPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coverImageRef = useRef<HTMLImageElement | null>(null);
  const avatarImageRef = useRef<HTMLImageElement | null>(null);
  const coverDragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const avatarDragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const selectedGame = useMemo(() => games.find((g) => g.id === selectedId) || null, [games, selectedId]);
  const selectedEmulator = useMemo(() => (selectedGame ? getEmulator(selectedGame.emulatorId) : null), [selectedGame]);
  const libraryCountAll = useMemo(() => games.length, [games]);
  const libraryCountNes = useMemo(() => games.filter((g) => g.emulatorId === "nes").length, [games]);
  const libraryCountSnes = useMemo(() => games.filter((g) => g.emulatorId === "snes").length, [games]);
  const totalPlaySeconds = useMemo(() => games.reduce((sum, game) => sum + Math.max(0, game.totalPlayTime || 0), 0), [games]);
  const profileXp = useMemo(() => {
    const playMinutes = Math.floor(totalPlaySeconds / 60);
    return playMinutes + games.length * 30 + friends.length * 10;
  }, [friends.length, games.length, totalPlaySeconds]);
  const profileLevel = useMemo(() => {
    let level = 1;
    let current = profileXp;
    let next = 100;
    while (current >= next) {
      current -= next;
      level += 1;
      next = Math.floor(next * 1.22);
    }
    return {
      level,
      current,
      next,
      progress: Math.max(0, Math.min(100, Math.round((current / next) * 100)))
    };
  }, [profileXp]);
  const achievements = useMemo(() => {
    const wins = [
      { id: "first_game", title: "Первый картридж", desc: "Добавь первую игру", unlocked: games.length >= 1 },
      { id: "collector", title: "Коллекционер", desc: "Добавь 10 игр", unlocked: games.length >= 10 },
      { id: "one_hour", title: "Разогрев", desc: "Сыграй 1 час", unlocked: totalPlaySeconds >= 3600 },
      { id: "marathon", title: "Ретро-марафон", desc: "Сыграй 10 часов", unlocked: totalPlaySeconds >= 36000 },
      { id: "social", title: "В кругу друзей", desc: "Добавь 3 друзей", unlocked: friends.length >= 3 }
    ];
    return wins;
  }, [friends.length, games.length, totalPlaySeconds]);
  const unlockedAchievements = useMemo(() => achievements.filter((item) => item.unlocked).length, [achievements]);
  const xpBreakdown = useMemo(() => {
    const playMinutes = Math.floor(totalPlaySeconds / 60);
    return [
      { id: "playtime", label: "За время в игре", value: playMinutes },
      { id: "library", label: "За игры в библиотеке", value: games.length * 30 },
      { id: "friends", label: "За друзей", value: friends.length * 10 }
    ];
  }, [friends.length, games.length, totalPlaySeconds]);
  const selectedRomExt = useMemo(() => (selectedGame ? getRomExt(selectedGame.path) : ""), [selectedGame]);
  const isGamePaused = settingsOpen || manualPause || remotePause;
  const pauseButtonLabel = manualPause ? t("app.gameMenuResume") : t("app.gameMenuPause");
  const pauseInfo = useMemo(() => {
    const lines: string[] = [];
    if (settingsOpen) lines.push(t("app.gamePausedBySettings"));
    if (manualPause) lines.push(t("app.gamePausedByYou"));
    if (remotePause) lines.push(t("app.gamePausedByPeer"));
    return lines.join(" | ");
  }, [manualPause, remotePause, settingsOpen]);
  const compatibilityWarning = useMemo(() => {
    if (!selectedGame || !selectedEmulator) return "";
    if (!selectedRomExt) return "ROM extension is missing";
    if (selectedEmulator.supportedExt.includes(selectedRomExt)) return "";
    const recommended = detectEmulatorByExt(selectedRomExt);
    if (recommended) {
      return `Selected emulator ${selectedEmulator.short} does not support ${selectedRomExt}. Use ${getEmulator(recommended).short}.`;
    }
    return `Unsupported ROM extension: ${selectedRomExt}`;
  }, [selectedEmulator, selectedGame, selectedRomExt]);
  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? games.filter((g) => g.name.toLowerCase().includes(q)) : [...games];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [games, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const onlineCount = useMemo(() => friends.filter((f) => f.online).length, [friends]);
  const roomMemberIds = roomState?.members || [];
  const roomPlayerIds = roomState ? roomState.members.filter((id) => !roomState.spectators.includes(id)) : [];
  const networkQuality = useMemo(() => {
    if (networkLatencyMs === null) return "—";
    if (networkLatencyMs <= 80) return "Excellent";
    if (networkLatencyMs <= 140) return "Good";
    if (networkLatencyMs <= 220) return "Fair";
    return "Poor";
  }, [networkLatencyMs]);
  const raUsername = useMemo(() => String(uiSettings.retroAchievementsUsername || "").trim(), [uiSettings.retroAchievementsUsername]);
  const sortedRaAchievements = useMemo(() => {
    if (!raData) return [];
    const items = [...raData.achievements];
    items.sort((a, b) => {
      if (raSort === "lockedFirst") {
        if (a.isUnlocked !== b.isUnlocked) return a.isUnlocked ? 1 : -1;
      } else if (a.isUnlocked !== b.isUnlocked) {
        return a.isUnlocked ? -1 : 1;
      }
      return a.id - b.id;
    });
    return items;
  }, [raData, raSort]);
  const raPreviewAchievements = useMemo(() => {
    if (!raData) return [];
    return raData.achievements.slice(0, 3);
  }, [raData]);
  const selectedGameRaCover = useMemo(() => pickGameImage(raData?.images), [raData?.images]);
  const selectedGameCover = useMemo(() => {
    if (selectedGameRaCover) {
      return selectedGameRaCover;
    }
    if (!selectedGame) {
      return "";
    }
    return covers[selectedGame.id] || "";
  }, [covers, selectedGame, selectedGameRaCover]);
  const friendPresenceText = (friend: FriendItem): string => {
    if (!friend.online) return "офлайн";
    if (friend.inGame) return `играет в "${friend.gameName || "неизвестная игра"}"`;
    if (friend.roomId) return `в комнате ${friend.roomId}`;
    return "онлайн";
  };

  const displayNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    if (profile) {
      map.set(profile.userId, profile.displayName);
    }
    for (const friend of friends) {
      map.set(friend.userId, friend.displayName);
    }
    return map;
  }, [friends, profile]);
  const roomMemberName = (userId: string) => displayNameByUserId.get(userId) || `User ${userId.slice(0, 6)}`;
  const playDisabledReason = useMemo(() => {
    if (!selectedGame) return t("app.selectGame");
    if (compatibilityWarning) return compatibilityWarning;
    if (!launchCheck.ok) return launchCheck.reason || t("app.gameNotLaunchable");
    return "";
  }, [compatibilityWarning, launchCheck.ok, launchCheck.reason, selectedGame]);

  const setCurrentRoom = (nextRoomId: string, hostUserId?: string) => {
    roomIdRef.current = nextRoomId;
    setRoomId(nextRoomId);
    if (typeof hostUserId === "string") {
      setRoomHostUserId(hostUserId);
    }
  };

  const applyRoomState = (nextRoom: RoomState) => {
    setCurrentRoom(nextRoom.roomId, nextRoom.hostUserId);
    setRoomHostUserId(nextRoom.hostUserId);
    setRoomState(nextRoom);
  };

  const clearRoomState = () => {
    setCurrentRoom("", "");
    setRoomHostUserId("");
    setRoomState(null);
  };

  const attachSocialHandlers = (social: SocialClient) => {
    social.onFriends((items) => setFriends(items));
    social.onInvite((invite) => setPendingInvite(invite));
    social.onPresence((p) => setFriends((prev) => prev.map((f) => (
      f.userId === p.userId
        ? {
          ...f,
          online: p.online,
          roomId: p.roomId,
          inGame: p.inGame,
          gameId: p.gameId,
          gameName: p.gameName,
          avatarDataUrl: p.avatarDataUrl ?? f.avatarDataUrl
        }
        : f
    ))));
    social.onNetplayStart((payload) => {
      if (!payload.roomId) {
        return;
      }
      if (roomIdRef.current && payload.roomId !== roomIdRef.current) {
        return;
      }
      setCurrentRoom(payload.roomId, payload.hostUserId);
      const sessionCheck = canAcceptNetplaySession(payload);
      if (!sessionCheck.ok) {
        setToast(sessionCheck.reason);
        return;
      }
      const game = sessionCheck.game;
      const localProfile = profileRef.current;
      if (!game || !localProfile) {
        return;
      }
      setActiveSession((prev) => {
        if (prev) {
          return prev;
        }
        return {
          game,
          romBase64: payload.romBase64,
          netplay: {
            enabled: true,
            social,
            roomId: payload.roomId,
            localUserId: localProfile.userId,
            hostUserId: payload.hostUserId,
            localPlayer: localProfile.userId === payload.hostUserId ? 1 : 2,
            transport: "lockstep"
          }
        };
      });
      setToast("Netplay-сессия запущена");
    });
    social.onStreamStart((payload) => {
      if (!payload.roomId) {
        return;
      }
      if (roomIdRef.current && payload.roomId !== roomIdRef.current) {
        return;
      }
      const localProfile = profileRef.current;
      if (!localProfile || localProfile.userId === payload.hostUserId) {
        return;
      }
      setCurrentRoom(payload.roomId, payload.hostUserId);
      const game = resolveNetplayGame(payload, gamesRef.current);
      setActiveSession((prev) => {
        if (prev) {
          return prev;
        }
        return {
          game,
          romBase64: "",
          netplay: {
            enabled: true,
            social,
            roomId: payload.roomId,
            localUserId: localProfile.userId,
            hostUserId: payload.hostUserId,
            localPlayer: 2,
            transport: "stream",
            isSpectator: Boolean(roomStateRef.current?.spectators.includes(localProfile.userId)),
            streamPeerUserId: payload.hostUserId
          }
        };
      });
      setToast("Streaming session started");
    });
    social.onRoomPause((payload) => {
      const current = roomIdRef.current;
      if (!current || payload.roomId !== current) {
        return;
      }
      setRemotePause(payload.paused);
    });
    social.onRoomUpdate((nextRoom) => {
      applyRoomState(nextRoom);
      if (roomIdRef.current === nextRoom.roomId) {
        setRoomStatus(`${t("app.roomConnected")} (${nextRoom.roomId})`);
      }
      setNetworkHealth("good");
    });
    social.onRoomClosed((payload) => {
      if (roomIdRef.current !== payload.roomId) {
        return;
      }
      clearRoomState();
      setRoomStatus(t("app.roomNotConnected"));
      setNetworkHealth("offline");
      setNetworkLatencyMs(null);
      setToast("Room was closed by host");
    });
    social.onRoomKicked((payload) => {
      if (roomIdRef.current !== payload.roomId) {
        return;
      }
      clearRoomState();
      setRoomStatus(t("app.roomNotConnected"));
      setNetworkHealth("offline");
      setNetworkLatencyMs(null);
      setToast("You were removed from the room");
    });
    social.onRoomChat((message) => {
      if (roomIdRef.current !== message.roomId) {
        return;
      }
      setRoomChatMessages((prev) => {
        const next = [...prev, message];
        return next.slice(-200);
      });
    });
  };

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setNetworkLatencyMs(null);
      setNetworkHealth("offline");
      return;
    }
    let cancelled = false;
    let timerId: number | null = null;

    const measure = async () => {
      const startedAt = performance.now();
      const ok = await window.bridge.getRoomState(roomId).then(() => true).catch(() => false);
      if (cancelled) {
        return;
      }
      if (!ok) {
        setNetworkLatencyMs(null);
        setNetworkHealth("offline");
      } else {
        const latency = Math.round(performance.now() - startedAt);
        setNetworkLatencyMs(latency);
        setNetworkHealth(latency > 180 ? "degraded" : "good");
      }
      timerId = window.setTimeout(() => {
        void measure();
      }, 3000);
    };

    void measure();
    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [roomId]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    applyTheme(uiSettings.theme);
  }, [uiSettings.theme]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    setProfileNameInput(profile?.displayName || "");
  }, [profile?.displayName]);

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  useEffect(() => {
    if (!activeSession) {
      setManualPause(false);
      setRemotePause(false);
    }
  }, [activeSession]);

  useEffect(() => {
    if (!filteredGames.length) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }
    if (!selectedId || !filteredGames.some((game) => game.id === selectedId)) {
      setSelectedId(filteredGames[0].id);
    }
  }, [filteredGames, selectedId]);

  const applyGameUpdate = (updated: GameRecord) => {
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  };

  const canAcceptNetplaySession = (payload: { gameId?: string; emulatorId?: string; romHash?: string }): { ok: true; game: GameRecord } | { ok: false; reason: string } => {
    const gameId = String(payload.gameId || "").trim();
    if (!gameId) {
      return { ok: false, reason: "Сессия не содержит gameId" };
    }
    const localGame = gamesRef.current.find((game) => game.id === gameId);
    if (!localGame) {
      return { ok: false, reason: "Игра из комнаты не найдена в локальной библиотеке" };
    }
    if (payload.emulatorId && localGame.emulatorId !== payload.emulatorId) {
      return { ok: false, reason: `Несовпадение эмулятора: комната ${String(payload.emulatorId).toUpperCase()}, локально ${localGame.emulatorId.toUpperCase()}` };
    }
    if (payload.romHash && localGame.sha256.toLowerCase() !== payload.romHash.toLowerCase()) {
      return { ok: false, reason: "Несовпадение ROM (sha256). Подключение отклонено." };
    }
    return { ok: true, game: localGame };
  };

  const loadCover = async (gameId: string) => {
    const dataUrl = await window.bridge.covers.getCoverDataUrl(gameId).catch(() => null);
    setCovers((prev) => {
      const next = { ...prev };
      if (dataUrl) next[gameId] = dataUrl;
      else delete next[gameId];
      return next;
    });
  };

  const clampCoverOffsets = (zoom: number, nextX: number, nextY: number) => {
    const image = coverImageRef.current;
    if (!image) {
      return { x: 0, y: 0 };
    }
    const baseScale = Math.max(COVER_OUTPUT_WIDTH / image.naturalWidth, COVER_OUTPUT_HEIGHT / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const limitX = Math.max(0, (drawWidth - COVER_OUTPUT_WIDTH) / 2);
    const limitY = Math.max(0, (drawHeight - COVER_OUTPUT_HEIGHT) / 2);
    return {
      x: Math.max(-limitX, Math.min(limitX, nextX)),
      y: Math.max(-limitY, Math.min(limitY, nextY))
    };
  };

  const drawCoverFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number, offsetX: number, offsetY: number) => {
    const image = coverImageRef.current;
    ctx.fillStyle = resolveCanvasFillColor();
    ctx.fillRect(0, 0, width, height);
    if (!image) {
      return;
    }
    const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = (width - drawWidth) / 2 + offsetX * (width / COVER_OUTPUT_WIDTH);
    const drawY = (height - drawHeight) / 2 + offsetY * (height / COVER_OUTPUT_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  };

  const clampAvatarOffsets = (zoom: number, nextX: number, nextY: number) => {
    const image = avatarImageRef.current;
    if (!image) {
      return { x: 0, y: 0 };
    }
    const baseScale = Math.max(AVATAR_OUTPUT_SIZE / image.naturalWidth, AVATAR_OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const limitX = Math.max(0, (drawWidth - AVATAR_OUTPUT_SIZE) / 2);
    const limitY = Math.max(0, (drawHeight - AVATAR_OUTPUT_SIZE) / 2);
    return {
      x: Math.max(-limitX, Math.min(limitX, nextX)),
      y: Math.max(-limitY, Math.min(limitY, nextY))
    };
  };

  const drawAvatarFrame = (ctx: CanvasRenderingContext2D, size: number, zoom: number, offsetX: number, offsetY: number) => {
    const image = avatarImageRef.current;
    ctx.fillStyle = resolveCanvasFillColor();
    ctx.fillRect(0, 0, size, size);
    if (!image) {
      return;
    }
    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = (size - drawWidth) / 2 + offsetX * (size / AVATAR_OUTPUT_SIZE);
    const drawY = (size - drawHeight) / 2 + offsetY * (size / AVATAR_OUTPUT_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  };

  const saveUiPatch = async (patch: Partial<UiSettings>) => {
    const next = await window.bridge.saveUiSettings(patch).catch(() => ({ ...uiSettings, ...patch } as UiSettings));
    const normalizedTheme = applyTheme(next.theme) as UiSettings["theme"];
    const normalized = { ...next, theme: normalizedTheme };
    setUiSettings(normalized);
    return normalized;
  };

  const refreshRaApiKeyStatus = async () => {
    const status = await window.bridge.getRaApiKeyStatus().catch(() => null);
    setRaApiKeyStatus(status);
  };

  const onSaveRaApiKey = async () => {
    const candidate = raApiKeyInput.trim();
    if (!candidate) {
      setToast("API key is empty");
      return;
    }
    setRaApiKeyBusy(true);
    const status = await window.bridge.setRaApiKey(candidate).catch(() => null);
    setRaApiKeyBusy(false);
    if (!status) {
      setToast("Failed to save API key");
      return;
    }
    setRaApiKeyStatus(status);
    setRaApiKeyInput("");
    setRaReloadKey((prev) => prev + 1);
    setToast("RetroAchievements API key saved");
  };

  const onClearRaApiKey = async () => {
    setRaApiKeyBusy(true);
    const status = await window.bridge.clearRaApiKey().catch(() => null);
    setRaApiKeyBusy(false);
    if (!status) {
      setToast("Failed to clear API key");
      return;
    }
    setRaApiKeyStatus(status);
    setRaApiKeyInput("");
    setRaData(null);
    setRaError("RetroAchievements API key is not configured");
    setRaLoading(false);
    setToast("RetroAchievements API key cleared");
  };

  useEffect(() => {
    const init = async () => {
      const [loadedGames, loadedProfile, loadedNetwork, loadedControls, loadedAudio, loadedVideo, loadedReplay, loadedUi, loadedRaApiKeyStatus, loadedLocalServerStatus, loadedNgrokStatus] = await Promise.all([
        window.bridge.listGames(),
        window.bridge.getProfile(),
        window.bridge.getNetworkSettings().catch(() => defaultNetworkSettings),
        window.bridge.getControls().catch(() => defaultControls),
        window.bridge.getAudioSettings().catch(() => defaultAudioSettings),
        window.bridge.getVideoSettings().catch(() => defaultVideoSettings),
        window.bridge.getReplaySettings().catch(() => defaultReplaySettings),
        window.bridge.getUiSettings().catch(() => defaultUiSettings),
        window.bridge.getRaApiKeyStatus().catch(() => null),
        window.bridge.getLocalServerStatus().catch(() => null),
        window.bridge.getNgrokStatus().catch(() => null)
      ]);

      setGames(loadedGames);
      setSelectedId(loadedGames[0]?.id || null);
      setProfile(loadedProfile);
      setProfileNameInput(loadedProfile.displayName);
      setNetworkSettings(loadedNetwork);
      setServerAddressInput(loadedNetwork.signalingUrl);
      setControls(loadedControls);
      setAudioSettings(loadedAudio);
      setVideoSettings(loadedVideo);
      setReplaySettings(loadedReplay);
      const normalizedTheme = applyTheme(loadedUi.theme) as UiSettings["theme"];
      setUiSettings({ ...loadedUi, theme: normalizedTheme });
      setRaApiKeyStatus(loadedRaApiKeyStatus);
      setLocalServerStatus(loadedLocalServerStatus);
      setNgrokStatus(loadedNgrokStatus);
      networkUrlRef.current = loadedNetwork.signalingUrl;

      await Promise.all(loadedGames.filter((g) => g.hasCover).map((g) => loadCover(g.id)));

      const social = new SocialClient(loadedProfile, () => networkUrlRef.current);
      attachSocialHandlers(social);
      socialRef.current = social;
      await social.connect().then(() => setNetworkHealth("good")).catch(() => {
        setNetworkHealth("offline");
        setToast("Signaling server is unavailable");
      });
      await social.refreshFriends().catch(() => undefined);
    };
    void init();
  }, []);

  useEffect(() => {
    if (selectedGame?.hasCover && !covers[selectedGame.id]) void loadCover(selectedGame.id);
  }, [selectedGame, covers]);

  useEffect(() => {
    setRaGameIdInput(selectedGame?.retroAchievementsGameId ? String(selectedGame.retroAchievementsGameId) : "");
  }, [selectedGame?.id, selectedGame?.retroAchievementsGameId]);

  useEffect(() => {
    if (!selectedGame) {
      return;
    }
    const gameId = selectedGame.retroAchievementsGameId;
    if (!gameId) {
      setRaData(null);
      setRaError("");
      setRaLoading(false);
      return;
    }
    let cancelled = false;
    setRaData(null);
    setRaLoading(true);
    setRaError("");
    void getRetroGameData(gameId, raUsername)
      .then((result) => {
        if (cancelled) return;
        setRaData(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRaData(null);
        setRaError(error instanceof Error ? error.message : "Не удалось загрузить достижения");
      })
      .finally(() => {
        if (!cancelled) {
          setRaLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGame, raUsername, raReloadKey]);

  useEffect(() => {
    if (!games.length) {
      setRaSummaryByGameId({});
      setRaImagesByGameId({});
      return;
    }
    const entries = games.filter((game) => Boolean(game.retroAchievementsGameId));
    if (!entries.length) {
      setRaSummaryByGameId({});
      setRaImagesByGameId({});
      return;
    }
    let cancelled = false;
    void Promise.all(entries.map(async (game) => {
      try {
        const data = await getRetroGameData(game.retroAchievementsGameId as number, raUsername || undefined);
        return {
          gameId: game.id,
          unlocked: data.unlockedAchievements,
          total: data.totalAchievements,
          image: pickGameImage(data.images)
        };
      } catch {
        return null;
      }
    })).then((rows) => {
      if (cancelled) return;
      const next: Record<string, { unlocked: number; total: number }> = {};
      const nextImages: Record<string, string> = {};
      for (const row of rows) {
        if (!row) continue;
        next[row.gameId] = { unlocked: row.unlocked, total: row.total };
        if (row.image) {
          nextImages[row.gameId] = row.image;
        }
      }
      setRaSummaryByGameId(next);
      setRaImagesByGameId(nextImages);
    });
    return () => {
      cancelled = true;
    };
  }, [games, raUsername]);

  useEffect(() => {
    if (!coverEditorOpen) {
      return;
    }
    const canvas = coverPreviewCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    drawCoverFrame(ctx, canvas.width, canvas.height, coverZoom, coverOffsetX, coverOffsetY);
  }, [coverEditorOpen, coverEditorDataUrl, coverZoom, coverOffsetX, coverOffsetY]);

  useEffect(() => {
    if (!avatarEditorOpen) {
      return;
    }
    const canvas = avatarPreviewCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    drawAvatarFrame(ctx, canvas.width, avatarZoom, avatarOffsetX, avatarOffsetY);
  }, [avatarEditorOpen, avatarEditorDataUrl, avatarZoom, avatarOffsetX, avatarOffsetY]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!roomId) {
      setRoomChatMessages([]);
      setRoomChatInput("");
      roomChatStickToBottomRef.current = true;
      return;
    }
    const social = socialRef.current;
    if (!social) {
      return;
    }
    void social.getRoomChatHistory(roomId)
      .then((history) => setRoomChatMessages(history))
      .catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    const list = roomChatListRef.current;
    if (!list) return;
    if (!roomChatStickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [roomChatMessages.length]);

  useEffect(() => {
    let canceled = false;
    if (!selectedGame) {
      setLaunchCheck({ ok: false, reason: t("app.selectGame") });
      return;
    }
    void window.bridge.checkGameLaunch(selectedGame.id)
      .then((result) => {
        if (!canceled) {
          setLaunchCheck(result);
        }
      })
      .catch(() => {
        if (!canceled) {
          setLaunchCheck({ ok: false, reason: t("app.launchPrecheckFailed") });
        }
      });
    return () => {
      canceled = true;
    };
  }, [selectedGame, games]);

  useEffect(() => {
    if (!settingsOpen) return;
    void refreshRaApiKeyStatus();
    void refreshLocalServerStatus();
    void refreshNgrokStatus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSettingsOpen(false);
      setWaitingAction(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [settingsOpen]);

  useEffect(() => {
    if (!waitingAction || !settingsOpen || settingsCategory !== "controls") return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      const next = { ...controls, [waitingAction]: event.code };
      setControls(next);
      void window.bridge.saveControls({ [waitingAction]: event.code });
      setWaitingAction(null);
      setToast(`Клавиша ${waitingAction.toUpperCase()} обновлена`);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [waitingAction, settingsOpen, settingsCategory, controls]);

  const onAddGame = async () => {
    const created = await window.bridge.addGame();
    if (!created) return;
    const list = await window.bridge.listGames();
    setGames(list);
    setSelectedId(created.id);
  };

  const onConfirmDeleteGame = async () => {
    if (!deleteGameTarget) {
      return;
    }
    const removedId = deleteGameTarget.id;
    const list = await window.bridge.removeGame(removedId);
    setGames(list);
    setDeleteGameTarget(null);
    if (!list.find((game) => game.id === selectedId)) {
      setSelectedId(list[0]?.id || null);
    }
  };

  const onSaveRetroGameId = async () => {
    if (!selectedGame) {
      return;
    }
    const trimmed = raGameIdInput.trim();
    const parsed = Number(trimmed);
    const nextRetroId = trimmed ? (Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null) : null;
    if (trimmed && !nextRetroId) {
      setToast("RetroAchievements ID должен быть положительным числом");
      return;
    }
    const updated = await window.bridge.updateGameRetroId(selectedGame.id, nextRetroId).catch(() => null);
    if (!updated) {
      setToast("Не удалось сохранить RetroAchievements ID");
      return;
    }
    applyGameUpdate(updated);
    setRaReloadKey((prev) => prev + 1);
    setToast("RetroAchievements ID сохранен");
  };

  const onPlay = async () => {
    if (!selectedGame) return;
    if (playDisabledReason) {
      setToast(playDisabledReason);
      return;
    }
    const preCheck = await window.bridge.checkGameLaunch(selectedGame.id).catch(() => ({ ok: false, reason: t("app.launchPrecheckFailed") }));
    if (!preCheck.ok) {
      setToast(preCheck.reason || "Game is not launchable");
      return;
    }
    if (mode === "room" && roomId && socialRef.current && profile) {
      let hostUserId = roomState?.hostUserId || roomHostUserId;
      let roomMembers: string[] = roomState?.members ? [...roomState.members] : [];
      if (!hostUserId || roomMembers.length === 0) {
        const state = await window.bridge.getRoomState(roomId).catch(() => null);
        if (state) {
          applyRoomState(state);
          hostUserId = state.hostUserId;
          roomMembers = state.members;
        }
      }
      if (!hostUserId) {
      setToast(t("app.roomStateUnavailable"));
        return;
      }
      if (hostUserId !== profile.userId) {
        setToast(t("app.hostOnlyStart"));
        return;
      }

      const isStreamMode = networkSettings.netplayMode === "stream";
      const currentSpectators = roomStateRef.current?.spectators || [];
      const streamGuests = roomMembers
        .filter((memberId) => memberId !== profile.userId)
        .filter((memberId) => !currentSpectators.includes(memberId));
      const streamPeerUserId = streamGuests[0];
      if (isStreamMode && streamGuests.length !== 1) {
        setToast(t("app.streamNeedsOneGuest"));
        return;
      }
      const session = await window.bridge.startLocalGame(selectedGame.id);

      setActiveSession({
        ...session,
        netplay: {
          enabled: true,
          social: socialRef.current,
          roomId,
          localUserId: profile.userId,
          hostUserId,
          localPlayer: 1,
          transport: isStreamMode ? "stream" : "lockstep",
          streamPeerUserId
        }
      });
      const started = isStreamMode
        ? await socialRef.current.startStream(roomId, selectedGame.id, selectedGame.name, selectedGame.platform).catch(() => false)
        : await socialRef.current.startNetplay(
          roomId,
          selectedGame.id,
          selectedGame.name,
          selectedGame.platform,
          session.romBase64,
          selectedGame.emulatorId,
          selectedGame.sha256
        ).catch(() => false);
      if (!started) {
        setToast(isStreamMode ? t("app.failedStartStream") : t("app.failedStartNetplay"));
      }
      return;
    }
    const session = await window.bridge.startLocalGame(selectedGame.id);
    setActiveSession({ ...session });
  };

  const onCreateRoom = async () => {
    if (!selectedGame) return;
    try {
      const room = await window.bridge.createRoom(selectedGame.id);
      applyRoomState(room);
      setRoomStatus(`${t("app.roomConnected")} (${room.roomId})`);
      setMode("room");
    } catch {
      setRoomStatus(t("app.failedCreateRoom"));
    }
  };

  const onJoinRoom = async () => {
    const code = roomIdInput.trim().toUpperCase();
    if (!code) {
      setToast(t("app.waitingRoomCode"));
      return;
    }
    try {
      const room = await window.bridge.joinRoom(code);
      applyRoomState(room);
      setRoomIdInput(room.roomId);
      setRoomStatus(`${t("app.roomConnected")} (${room.roomId})`);
      setMode("room");
    } catch {
      setRoomStatus(t("app.roomNotFound"));
    }
  };

  const onCloseRoom = async () => {
    if (!roomId) {
      return;
    }
    await window.bridge.closeRoom(roomId);
    clearRoomState();
    setRoomStatus(t("app.roomNotConnected"));
  };

  const onSendRoomChat = async () => {
    if (!roomId || !socialRef.current) {
      return;
    }
    const text = roomChatInput.trim();
    if (!text) {
      return;
    }
    const ok = await socialRef.current.sendRoomChat(roomId, text).catch(() => false);
    if (!ok) {
      setToast("Failed to send chat message");
      return;
    }
    setRoomChatInput("");
  };

  const onAddFriend = async () => {
    if (!socialRef.current || !friendCodeInput.trim()) return;
    const next = await socialRef.current.addFriend(friendCodeInput.trim()).catch(() => null);
    if (next) {
      setFriends(next);
      setFriendCodeInput("");
    } else {
      setToast(t("app.friendCodeNotFound"));
    }
  };

  const onInvite = async (friendUserId: string) => {
    if (!socialRef.current) return;
    if (!roomId || !roomState) {
      setToast("Сначала создай комнату");
      return;
    }
    const gameId = roomState.gameId || selectedGame?.id;
    if (!gameId) {
      setToast(t("app.failedInvite"));
      return;
    }
    await socialRef.current.sendInvite(friendUserId, roomId, gameId).catch(() => setToast(t("app.failedInvite")));
  };

  const onWatchFriend = async (friend: FriendItem) => {
    if (!friend.roomId) {
      setToast("У друга нет активной комнаты");
      return;
    }
    try {
      const room = await window.bridge.joinRoom(friend.roomId, true);
      applyRoomState(room);
      setRoomIdInput(room.roomId);
      setRoomStatus(`${t("app.roomConnected")} (${room.roomId})`);
      setMode("room");
      setToast(`Подключен как зритель к ${friend.displayName}`);
    } catch {
      setToast("Не удалось подключиться к просмотру");
    }
  };

  const connectServer = async (forcedUrl?: string) => {
    const nextUrl = (forcedUrl || serverAddressInput).trim();
    if (!nextUrl) {
      setToast("Server address is required");
      return;
    }

    setNetworkBusy(true);
    setNetworkHealth("degraded");
    try {
      const next: NetworkSettings = { ...networkSettings, signalingUrl: nextUrl };
      setNetworkSettings(next);
      networkUrlRef.current = nextUrl;
      await window.bridge.saveNetworkSettings(next);
      await window.bridge.connectServer(nextUrl);

      socialRef.current?.close();
      if (profile) {
        const social = new SocialClient(profile, () => networkUrlRef.current);
        attachSocialHandlers(social);
        socialRef.current = social;
        await social.connect();
        setNetworkHealth("good");
        await social.refreshFriends().catch(() => undefined);
      }

      setToast("Подключено к серверу");
    } catch (error) {
      setNetworkHealth("offline");
      setToast(error instanceof Error ? error.message : "Не удалось подключиться к серверу");
    } finally {
      setNetworkBusy(false);
    }
  };

  const refreshLocalServerStatus = async () => {
    const status = await window.bridge.getLocalServerStatus().catch(() => null);
    setLocalServerStatus(status);
  };

  const refreshNgrokStatus = async () => {
    const status = await window.bridge.getNgrokStatus().catch(() => null);
    setNgrokStatus(status);
  };

  const onStartLocalServer = async () => {
    setLocalServerBusy(true);
    const status = await window.bridge.startLocalServer(serverAddressInput.trim() || undefined).catch(() => null);
    setLocalServerBusy(false);
    if (!status) {
      setToast("Не удалось запустить локальный сервер");
      return;
    }
    setLocalServerStatus(status);
    if (!status.running) {
      setToast(status.message || "Локальный сервер не запущен");
      return;
    }
    setServerAddressInput(status.url);
    setNetworkSettings((prev) => ({ ...prev, signalingUrl: status.url }));
    networkUrlRef.current = status.url;
    await connectServer(status.url);
    setToast("Локальный сервер запущен и подключен");
  };

  const onStopLocalServer = async () => {
    setLocalServerBusy(true);
    const status = await window.bridge.stopLocalServer().catch(() => null);
    setLocalServerBusy(false);
    if (!status) {
      setToast("Не удалось остановить локальный сервер");
      return;
    }
    setLocalServerStatus(status);
    setToast("Локальный сервер остановлен");
  };

  const onStartNgrok = async () => {
    setNgrokBusy(true);
    const status = await window.bridge.startNgrok(serverAddressInput.trim() || undefined).catch(() => null);
    setNgrokBusy(false);
    if (!status) {
      setToast("Не удалось запустить ngrok");
      return;
    }
    setNgrokStatus(status);
    if (!status.running || !status.publicUrl) {
      setToast(status.message || "Ngrok не запущен");
      return;
    }
    setServerAddressInput(status.publicUrl);
    await connectServer(status.publicUrl);
    setToast("Ngrok запущен и подключен");
  };

  const onStopNgrok = async () => {
    setNgrokBusy(true);
    const status = await window.bridge.stopNgrok().catch(() => null);
    setNgrokBusy(false);
    if (!status) {
      setToast("Не удалось остановить ngrok");
      return;
    }
    setNgrokStatus(status);
    setToast("Ngrok остановлен");
  };

  const onNetworkModeChange = async (mode: NetworkSettings["netplayMode"]) => {
    const next: NetworkSettings = { ...networkSettings, netplayMode: mode };
    setNetworkSettings(next);
    await window.bridge.saveNetworkSettings(next).catch(() => undefined);
  };

  const onInviteDecision = async (accept: boolean) => {
    if (!socialRef.current || !pendingInvite) return;
    const result = await socialRef.current.respondInvite(pendingInvite.inviteId, accept).catch(() => null);
    if (accept && result?.roomId) {
      const room = await window.bridge.joinRoom(result.roomId).catch(() => null);
      if (room) {
        applyRoomState(room);
        setRoomStatus(`${t("app.roomConnected")} (${room.roomId})`);
        setMode("room");
      }
    }
    setPendingInvite(null);
  };

  const onOpenCoverPicker = () => {
    coverFileInputRef.current?.click();
  };

  const onRemoveCover = async () => {
    if (!selectedGame) {
      return;
    }
    const updated = await window.bridge.covers.removeCover(selectedGame.id).catch(() => null);
    if (!updated) {
      setToast("Не удалось удалить обложку");
      return;
    }
    applyGameUpdate(updated);
    setCovers((prev) => {
      const next = { ...prev };
      delete next[selectedGame.id];
      return next;
    });
    setToast("Локальная обложка удалена");
  };

  const onCoverFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read cover image"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setToast("Failed to read cover image");
      return;
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load cover image"));
      img.src = dataUrl;
    }).catch(() => null);
    if (!image) {
      setToast("Failed to load cover image");
      return;
    }
    coverImageRef.current = image;
    setCoverEditorDataUrl(dataUrl);
    setCoverZoom(1);
    setCoverOffsetX(0);
    setCoverOffsetY(0);
    setCoverEditorOpen(true);
  };

  const onSaveCoverEditor = async () => {
    if (!selectedGame || !coverImageRef.current) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = COVER_OUTPUT_WIDTH;
    canvas.height = COVER_OUTPUT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setToast("Failed to render cover");
      return;
    }
    drawCoverFrame(ctx, COVER_OUTPUT_WIDTH, COVER_OUTPUT_HEIGHT, coverZoom, coverOffsetX, coverOffsetY);
    const dataUrl = canvas.toDataURL("image/png");
    const updated = await window.bridge.setGameCover(selectedGame.id, dataUrl).catch(() => null);
    if (!updated) {
      setToast("Failed to save cover");
      return;
    }
    applyGameUpdate(updated);
    await loadCover(updated.id);
    setCoverEditorOpen(false);
    setCoverEditorDataUrl("");
    coverImageRef.current = null;
    setToast("Cover updated");
  };

  const onResetControls = async () => {
    setControls(defaultControls);
    await window.bridge.saveControls(defaultControls);
  };

  const saveAudio = async (patch: Partial<AudioSettings>) => {
    const next = await window.bridge.saveAudioSettings(patch);
    setAudioSettings(next);
  };

  const saveVideo = async (patch: Partial<VideoSettings>) => {
    const next = await window.bridge.saveVideoSettings(patch);
    setVideoSettings(next);
  };

  const saveReplay = async (patch: Partial<ReplaySettings>) => {
    const next = await window.bridge.saveReplaySettings(patch);
    setReplaySettings(next);
  };

  const saveProfileName = async () => {
    if (!profile) {
      return;
    }
    const trimmed = profileNameInput.trim();
    if (!trimmed) {
      setToast("Nickname cannot be empty");
      return;
    }
    const nextProfile = await window.bridge.updateProfile(trimmed).catch(() => null);
    if (!nextProfile) {
      setToast("Failed to update nickname");
      return;
    }
    setProfile(nextProfile);
    socialRef.current?.updateProfile(nextProfile);
    setToast("Nickname updated");
  };

  const onPickAvatar = () => {
    avatarFileInputRef.current?.click();
  };

  const closeAvatarEditor = () => {
    setAvatarEditorOpen(false);
    setAvatarEditorDataUrl("");
    avatarImageRef.current = null;
    avatarDragRef.current = null;
  };

  const onAvatarFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read avatar image"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl || !profile) {
      setToast("Failed to read avatar image");
      return;
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load avatar image"));
      img.src = dataUrl;
    }).catch(() => null);
    if (!image) {
      setToast("Failed to load avatar image");
      return;
    }
    avatarImageRef.current = image;
    setAvatarEditorDataUrl(dataUrl);
    setAvatarZoom(1);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarEditorOpen(true);
  };

  const onSaveAvatarEditor = async () => {
    if (!profile || !avatarImageRef.current) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setToast("Failed to render avatar");
      return;
    }
    drawAvatarFrame(ctx, AVATAR_OUTPUT_SIZE, avatarZoom, avatarOffsetX, avatarOffsetY);
    const dataUrl = canvas.toDataURL("image/png");
    const nextProfile = await window.bridge.updateProfileAvatar(dataUrl).catch(() => null);
    if (!nextProfile) {
      setToast("Failed to save avatar");
      return;
    }
    setProfile(nextProfile);
    socialRef.current?.updateProfile(nextProfile);
    closeAvatarEditor();
    setToast("Avatar updated");
  };

  const onRemoveAvatar = async () => {
    if (!profile) {
      return;
    }
    const nextProfile = await window.bridge.updateProfileAvatar(undefined).catch(() => null);
    if (!nextProfile) {
      setToast("Failed to remove avatar");
      return;
    }
    setProfile(nextProfile);
    socialRef.current?.updateProfile(nextProfile);
    closeAvatarEditor();
    setToast("Avatar removed");
  };

  const resetReplay = async () => {
    const next = await window.bridge.saveReplaySettings({
      enabled: true,
      hotkey: "F8",
      prebufferSeconds: 10,
      quality: "720p",
      fps: 30,
      format: "webm",
      saveFolder: ""
    });
    setReplaySettings(next);
    setToast("Настройки повтора сброшены");
  };
  const toggleAudioEnabled = () => {
    void saveAudio({ enabled: !audioSettings.enabled });
  };
  const togglePause = () => {
    const next = !manualPause;
    setManualPause(next);
    const room = activeSession?.netplay?.roomId;
    if (room && socialRef.current) {
      socialRef.current.sendRoomPause(room, next);
    }
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    setWaitingAction(null);
  };
  const openAudioSettings = () => {
    setSettingsCategory("audio");
    setSettingsOpen(true);
    setWaitingAction(null);
  };

  const settingsModal = (
    <SettingsModal
      open={settingsOpen}
      category={settingsCategory}
      onCategoryChange={setSettingsCategory}
      onClose={closeSettings}
      profile={profile}
      profileNameInput={profileNameInput}
      onProfileNameInputChange={setProfileNameInput}
      onSaveProfileName={() => { void saveProfileName(); }}
      onPickAvatar={onPickAvatar}
      onRemoveAvatar={() => { void onRemoveAvatar(); }}
      controls={controls}
      waitingAction={waitingAction}
      onStartRebind={setWaitingAction}
      onResetControls={() => void onResetControls()}
      uiSettings={uiSettings}
      onSaveUiSettings={(patch) => { void saveUiPatch(patch); }}
      raApiKeyInput={raApiKeyInput}
      onRaApiKeyInputChange={setRaApiKeyInput}
      onSaveRaApiKey={() => { void onSaveRaApiKey(); }}
      onClearRaApiKey={() => { void onClearRaApiKey(); }}
      raApiKeyBusy={raApiKeyBusy}
      raApiKeyStatus={raApiKeyStatus}
      audioSettings={audioSettings}
      onSaveAudio={(patch) => { void saveAudio(patch); }}
      videoSettings={videoSettings}
      onSaveVideo={(patch) => { void saveVideo(patch); }}
      replaySettings={replaySettings}
      onSaveReplay={(patch) => { void saveReplay(patch); }}
      onResetReplay={() => { void resetReplay(); }}
      onOpenReplaysFolder={() => { void window.bridge.replays.openFolder(); }}
      networkSettings={networkSettings}
      networkInput={serverAddressInput}
      onNetworkInputChange={setServerAddressInput}
      onNetworkModeChange={(mode) => { void onNetworkModeChange(mode); }}
      onConnectServer={() => void connectServer()}
      networkBusy={networkBusy}
      localServerStatus={localServerStatus}
      localServerBusy={localServerBusy}
      onStartLocalServer={() => { void onStartLocalServer(); }}
      onStopLocalServer={() => { void onStopLocalServer(); }}
      ngrokStatus={ngrokStatus}
      ngrokBusy={ngrokBusy}
      onStartNgrok={() => { void onStartNgrok(); }}
      onStopNgrok={() => { void onStopNgrok(); }}
    />
  );

  if (activeSession) {
    const showInGameChat = false;
    const inGameChatSide: "left" | "right" = activeSession.netplay?.isSpectator ? "right" : "left";
    const sessionLocalUserId = activeSession.netplay?.localUserId;
    const isStreamGuest = Boolean(
      activeSession.netplay &&
      activeSession.netplay.transport === "stream" &&
      activeSession.netplay.localUserId !== activeSession.netplay.hostUserId
    );
    if (isStreamGuest && activeSession.netplay) {
      return (
        <>
          <StreamClientView
            game={activeSession.game}
            controls={controls}
            netplay={activeSession.netplay}
            paused={isGamePaused}
            pauseButtonLabel={pauseButtonLabel}
            pauseInfo={pauseInfo}
            audioEnabled={audioSettings.enabled}
            onToggleAudio={toggleAudioEnabled}
            onTogglePause={togglePause}
            onOpenSettings={openAudioSettings}
            onExit={() => setActiveSession(null)}
            onToast={setToast}
            showInGameChat={showInGameChat}
            inGameChatSide={inGameChatSide}
            roomChatMessages={roomChatMessages}
            roomChatInput={roomChatInput}
            onRoomChatInput={setRoomChatInput}
            onSendRoomChat={() => { void onSendRoomChat(); }}
            localUserId={sessionLocalUserId}
          />
          {settingsModal}
        </>
      );
    }
    if (activeSession.game.emulatorId === "snes") {
      return (
        <>
          <SnesGameView
            game={activeSession.game}
            romBase64={activeSession.romBase64}
            audioSettings={audioSettings}
            netplay={activeSession.netplay}
            paused={isGamePaused}
            pauseButtonLabel={pauseButtonLabel}
            pauseInfo={pauseInfo}
            onToggleAudio={toggleAudioEnabled}
            onTogglePause={togglePause}
            onOpenSettings={openAudioSettings}
            onExit={() => setActiveSession(null)}
            onToast={setToast}
            showInGameChat={showInGameChat}
            inGameChatSide={inGameChatSide}
            roomChatMessages={roomChatMessages}
            roomChatInput={roomChatInput}
            onRoomChatInput={setRoomChatInput}
            onSendRoomChat={() => { void onSendRoomChat(); }}
            localUserId={sessionLocalUserId}
          />
          {settingsModal}
        </>
      );
    }
    return (
      <>
        <GameView
          game={activeSession.game}
          romBase64={activeSession.romBase64}
          controls={controls}
          videoSettings={videoSettings}
          replaySettings={replaySettings}
          netplay={activeSession.netplay}
          paused={isGamePaused}
          pauseButtonLabel={pauseButtonLabel}
          pauseInfo={pauseInfo}
          audioEnabled={audioSettings.enabled}
          onToggleAudio={toggleAudioEnabled}
          onTogglePause={togglePause}
          onOpenSettings={openAudioSettings}
          onExit={() => setActiveSession(null)}
          onToast={setToast}
          showInGameChat={showInGameChat}
          inGameChatSide={inGameChatSide}
          roomChatMessages={roomChatMessages}
          roomChatInput={roomChatInput}
          onRoomChatInput={setRoomChatInput}
          onSendRoomChat={() => { void onSendRoomChat(); }}
          localUserId={sessionLocalUserId}
        />
        {settingsModal}
      </>
    );
  }

  return (
    <div className="app-shell steam-layout">
      <aside className="steam-sidebar">
        <Card className="profile-panel">
          <button
            className="avatar-wrap avatar-trigger"
            type="button"
            onClick={() => setXpModalOpen(true)}
            title="Профиль"
          >
            {profile?.avatarDataUrl ? (
              <img src={profile.avatarDataUrl} alt={profile.displayName || "Avatar"} className="avatar profile-avatar-image" />
            ) : (
              <span className="avatar profile-avatar-fallback">{initials(profile?.displayName || "Player")}</span>
            )}
            <span className="avatar-headband" aria-hidden />
          </button>
          <div className="profile-main">
            <strong>
              {profile?.displayName || "Player"}
              <span className="profile-level-chip">Lv.{profileLevel.level}</span>
            </strong>
            <div className="status-row">
              <span className="status-dot" />
              <span>Online</span>
              <span className="profile-code-inline">
                <code>{profile?.friendCode || "-"}</code>
              </span>
              <Button
                variant="ghost"
                data-variant="soft"
                className="profile-copy-mini"
                onClick={() => { if (profile?.friendCode) void navigator.clipboard.writeText(profile.friendCode); }}
              >
                {t("app.copy")}
              </Button>
            </div>
          </div>
        </Card>
        <SidebarLibrary
          games={filteredGames}
          selectedId={selectedId || ""}
          covers={covers}
          raImagesByGameId={raImagesByGameId}
          raSummaryByGameId={raSummaryByGameId}
          showAchievementProgress={Boolean(raUsername)}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSelectGame={setSelectedId}
          onAddGame={() => { void onAddGame(); }}
          onRequestDelete={setDeleteGameTarget}
        />
      </aside>

      <main className="steam-main">
        <Card className="topbar">
          <span className="app-title topbar-title">NES Emulator 1.01</span>
          <Button variant="secondary" data-action="settings-open" className="with-bow" onClick={() => { setSettingsCategory("general"); setSettingsOpen(true); }}>{t("app.settings")}</Button>
        </Card>

        {!selectedGame && <Card className="empty-state">{t("app.selectGameInLibrary")}</Card>}

        {selectedGame && (
          <div className="game-column">
            <Card className="hero-card">
              <div className="hero-cover">
                <div
                  className="cover-editable"
                  role="button"
                  tabIndex={0}
                  onClick={onOpenCoverPicker}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void onRemoveCover();
                  }}
                  title="ЛКМ: выбрать обложку, ПКМ: удалить локальную обложку"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenCoverPicker();
                    }
                  }}
                >
                  {selectedGameCover ? <img src={selectedGameCover} alt={selectedGame.name} className="cover-image" /> : <div className="cover-placeholder"><span>{selectedGame.name}</span></div>}
                  <div className="cover-edit-hint">{t("app.addCover")}</div>
                </div>
              </div>
              <div className="hero-meta">
                <h1 className="game-title">{selectedGame.name}</h1>
                <Badge>{selectedEmulator?.short || selectedGame.platform}</Badge>
                <div className="ra-id-row">
                  <Input
                    value={raGameIdInput}
                    onChange={(event) => setRaGameIdInput(event.target.value)}
                    placeholder="RetroAchievements Game ID"
                  />
                  <Button variant="secondary" data-variant="soft" onClick={() => { void onSaveRetroGameId(); }}>
                    Сохранить RA ID
                  </Button>
                </div>
                {playDisabledReason && <p className="network-line">{playDisabledReason}</p>}
                <div className="stats-grid">
                  <Card className="stat-card"><span>{t("app.lastPlayed")}</span><strong>{formatLastPlayed(selectedGame.lastPlayedAt)}</strong></Card>
                  <Card className="stat-card"><span>{t("app.totalPlayTime")}</span><strong>{formatPlayTime(selectedGame.totalPlayTime)}</strong></Card>
                </div>
                <Card className="game-achievements-preview">
                  <div className="game-achievement-head">
                    <button type="button" className="achievements-open-link" onClick={() => setAchievementsModalOpen(true)}>
                      Достижения
                    </button>
                    <span>{raData ? `${raData.unlockedAchievements}/${raData.totalAchievements}` : "—"}</span>
                  </div>
                  {!selectedGame.retroAchievementsGameId && (
                    <p className="game-achievement-desc">Укажи RA Game ID, чтобы подтянуть достижения.</p>
                  )}
                  {selectedGame.retroAchievementsGameId && raLoading && (
                    <p className="game-achievement-desc">Загрузка достижений...</p>
                  )}
                  {selectedGame.retroAchievementsGameId && !raLoading && raError && (
                    <div className="game-achievement-actions">
                      <p className="game-achievement-desc">{raError}</p>
                      <Button variant="secondary" data-variant="soft" onClick={() => setRaReloadKey((prev) => prev + 1)}>Повторить</Button>
                    </div>
                  )}
                  {selectedGame.retroAchievementsGameId && !raLoading && !raError && raData && raPreviewAchievements.length > 0 && (
                    <div className="game-achievement-preview-list">
                      {raPreviewAchievements.map((item) => (
                        <div key={item.id} className={`game-achievement-preview-item ${item.isUnlocked ? "done" : ""}`}>
                          <span className="preview-title">{item.title}</span>
                          <span className="preview-points">{item.points} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <div className="actions-row">
                  <Button variant="primary" data-action="play" className="play-btn with-bow" onClick={onPlay} disabled={Boolean(playDisabledReason)}>{t("app.play")}</Button>
                </div>
              </div>
            </Card>
            <Card className="tabs-card">
              <div className="main-bottom-tabs-wrap">
                <div className="main-bottom-tabs">
                  <Button
                    variant={mainBottomTab === "network" ? "primary" : "secondary"}
                    data-variant={mainBottomTab === "network" ? undefined : "soft"}
                    onClick={() => setMainBottomTab("network")}
                  >
                    Сеть
                  </Button>
                  <Button
                    variant={mainBottomTab === "friends" ? "primary" : "secondary"}
                    data-variant={mainBottomTab === "friends" ? undefined : "soft"}
                    onClick={() => setMainBottomTab("friends")}
                  >
                    Друзья
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  data-variant="soft"
                  className="section-expand-btn"
                  onClick={() => setSectionMenuOpen(true)}
                  title="Открыть как полноценное меню"
                >
                  ↕
                </Button>
              </div>
              {mainBottomTab === "network" && (
                <div className="tab-content network-inline-content">
                  <div className="network-panel">
                    <NetplayHeader
                      isHost={Boolean(profile && roomState?.hostUserId === profile.userId)}
                      roomId={roomId}
                      roomStatus={roomStatus}
                      hostName={roomState ? roomMemberName(roomState.hostUserId) : (profile?.displayName || "—")}
                      playersCount={roomPlayerIds.length}
                      spectatorsCount={roomState?.spectators.length || 0}
                      latencyMs={networkLatencyMs}
                      quality={networkQuality}
                      health={networkHealth}
                      mode={networkSettings.netplayMode}
                      signalingUrl={networkSettings.signalingUrl}
                      onCreateRoom={() => { void onCreateRoom(); }}
                      onCloseRoom={() => { void onCloseRoom(); }}
                      onChangeMode={(nextMode) => { void onNetworkModeChange(nextMode); }}
                    />
                  </div>
                </div>
              )}
              {mainBottomTab === "friends" && (
                <div className="tab-content friends-inline-content">
                  <div className="friend-add-row">
                    <Input placeholder="Friend code" value={friendCodeInput} onChange={(e) => setFriendCodeInput(e.target.value)} />
                    <Button variant="primary" onClick={onAddFriend}>{t("app.add")}</Button>
                  </div>
                  <div className="friends-list">
                    {!friends.length && <div className="empty-hint">{t("app.addFriendsHint")}</div>}
                    {friends.map((f) => (
                      <div key={f.userId} className="friend-line">
                        <div className="friend-line-main">
                          <div className="friend-line-avatar">
                            {f.avatarDataUrl ? (
                              <img src={f.avatarDataUrl} alt={f.displayName} className="avatar" />
                            ) : (
                              <div className="avatar">{f.displayName.slice(0, 2).toUpperCase()}</div>
                            )}
                          </div>
                          <div className="friend-line-text">
                            <strong>{f.displayName}</strong>
                            <span>{friendPresenceText(f)}</span>
                          </div>
                        </div>
                        <div className="friend-actions">
                          <Button variant="ghost" disabled={!f.online || !roomId} onClick={() => void onInvite(f.userId)}>{t("app.invite")}</Button>
                          <Button variant="ghost" disabled={!f.inGame || !f.roomId} onClick={() => void onWatchFriend(f)}>Смотреть</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>

      {settingsModal}

      {achievementsModalOpen && (
        <div className="achievements-modal-overlay" onClick={() => setAchievementsModalOpen(false)}>
          <Card className="achievements-modal" onClick={(event) => event.stopPropagation()}>
            <div className="achievements-modal-header">
              <h2>Достижения</h2>
              <Button variant="secondary" data-variant="soft" onClick={() => setAchievementsModalOpen(false)}>Закрыть</Button>
            </div>
            <div className="achievements-modal-summary">
              <span>{selectedGame?.name || "Игра"}</span>
              <span>{raData ? `${raData.unlockedAchievements}/${raData.totalAchievements}` : "—"}</span>
              <span>{raData ? `${raData.totalPoints} pts` : ""}</span>
            </div>

            <div className="achievements-modal-content">
              <div className="fullscreen-section-block">
                <div className="game-achievement-actions">
                  <Button
                    variant={raSort === "lockedFirst" ? "primary" : "secondary"}
                    data-variant={raSort === "lockedFirst" ? undefined : "soft"}
                    onClick={() => setRaSort("lockedFirst")}
                  >
                    Сначала не полученные
                  </Button>
                  <Button
                    variant={raSort === "unlockedFirst" ? "primary" : "secondary"}
                    data-variant={raSort === "unlockedFirst" ? undefined : "soft"}
                    onClick={() => setRaSort("unlockedFirst")}
                  >
                    Сначала полученные
                  </Button>
                </div>
                {!selectedGame?.retroAchievementsGameId && (
                  <Card className="game-achievement-item">
                    <strong>Для этой игры нет RetroAchievements ID</strong>
                    <p className="game-achievement-desc">Укажи RA Game ID на главной карточке игры.</p>
                  </Card>
                )}
                {selectedGame?.retroAchievementsGameId && raLoading && (
                  <Card className="game-achievement-item">
                    <strong>Загрузка...</strong>
                  </Card>
                )}
                {selectedGame?.retroAchievementsGameId && !raLoading && raError && (
                  <Card className="game-achievement-item">
                    <strong>Ошибка загрузки достижений</strong>
                    <p className="game-achievement-desc">{raError}</p>
                    <Button variant="secondary" onClick={() => setRaReloadKey((prev) => prev + 1)}>Повторить</Button>
                  </Card>
                )}
                {selectedGame?.retroAchievementsGameId && !raLoading && !raError && sortedRaAchievements.map((item) => (
                  <Card key={`fullscreen-${item.id}`} className={`game-achievement-item ${item.isUnlocked ? "done" : ""}`}>
                    <div className="game-achievement-head">
                      <strong>{item.title}</strong>
                      <span>{item.points} pts</span>
                    </div>
                    <div className="game-achievement-row">
                      {item.badgeUrl && <img src={item.badgeUrl} alt={item.title} className="game-achievement-badge" loading="lazy" />}
                      <div className="game-achievement-body">
                        <p className="game-achievement-desc">{item.description}</p>
                        <span className="game-achievement-desc">
                          {item.isUnlocked ? `Получено${item.unlockedAt ? `: ${new Date(item.unlockedAt).toLocaleString()}` : ""}` : "Не получено"}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {sectionMenuOpen && (
        <div className="achievements-modal-overlay" onClick={() => setSectionMenuOpen(false)}>
          <Card className="achievements-modal" onClick={(event) => event.stopPropagation()}>
            <div className="achievements-modal-header">
              <h2>{mainBottomTab === "network" ? "Сеть" : "Друзья"}</h2>
              <Button variant="secondary" data-variant="soft" onClick={() => setSectionMenuOpen(false)}>Закрыть</Button>
            </div>
            <div className="achievements-modal-content">
              {mainBottomTab === "network" && (
                <div className="fullscreen-section-block network-panel">
                  <NetplayHeader
                    isHost={Boolean(profile && roomState?.hostUserId === profile.userId)}
                    roomId={roomId}
                    roomStatus={roomStatus}
                    hostName={roomState ? roomMemberName(roomState.hostUserId) : (profile?.displayName || "—")}
                    playersCount={roomPlayerIds.length}
                    spectatorsCount={roomState?.spectators.length || 0}
                    latencyMs={networkLatencyMs}
                    quality={networkQuality}
                    health={networkHealth}
                    mode={networkSettings.netplayMode}
                    signalingUrl={networkSettings.signalingUrl}
                    onCreateRoom={() => { void onCreateRoom(); }}
                    onCloseRoom={() => { void onCloseRoom(); }}
                    onChangeMode={(nextMode) => { void onNetworkModeChange(nextMode); }}
                  />
                </div>
              )}

              {mainBottomTab === "friends" && (
                <div className="fullscreen-section-block network-panel">
                  <Card className="friends-panel friends-tab-panel fullscreen-friends-card">
                    <SectionHeader title={t("app.friends")} extra={<span className="friends-counter">{t("app.online")} {onlineCount}/{friends.length}</span>} />
                    <div className="friend-add-row">
                      <Input placeholder="Friend code" value={friendCodeInput} onChange={(e) => setFriendCodeInput(e.target.value)} />
                      <Button variant="primary" onClick={onAddFriend}>{t("app.add")}</Button>
                    </div>
                    <div className="friends-list">
                      {!friends.length && <div className="empty-hint">{t("app.addFriendsHint")}</div>}
                      {friends.map((f) => (
                        <div key={f.userId} className="friend-line">
                          <div className="friend-line-main">
                            <div className="friend-line-avatar">
                              {f.avatarDataUrl ? (
                                <img src={f.avatarDataUrl} alt={f.displayName} className="avatar" />
                              ) : (
                                <div className="avatar">{f.displayName.slice(0, 2).toUpperCase()}</div>
                              )}
                            </div>
                            <div className="friend-line-text">
                              <strong>{f.displayName}</strong>
                              <span>{friendPresenceText(f)}</span>
                            </div>
                          </div>
                          <div className="friend-actions">
                            <Button variant="ghost" disabled={!f.online || !roomId} onClick={() => void onInvite(f.userId)}>{t("app.invite")}</Button>
                            <Button variant="ghost" disabled={!f.inGame || !f.roomId} onClick={() => void onWatchFriend(f)}>Смотреть</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {deleteGameTarget && (
        <div className="cover-editor-overlay" onClick={() => setDeleteGameTarget(null)}>
          <Card className="confirm-delete-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{`Удалить ${deleteGameTarget.name}?`}</h3>
            <p>Игра будет удалена из библиотеки.</p>
            <div className="cover-editor-actions">
              <Button variant="ghost" data-variant="soft" onClick={() => setDeleteGameTarget(null)}>Отмена</Button>
              <Button variant="danger" data-variant="danger" onClick={() => { void onConfirmDeleteGame(); }}>Удалить</Button>
            </div>
          </Card>
        </div>
      )}

      <input ref={avatarFileInputRef} type="file" accept="image/*" hidden onChange={(event) => { void onAvatarFileSelected(event); }} />
      <input ref={coverFileInputRef} type="file" accept="image/*" hidden onChange={(event) => { void onCoverFileSelected(event); }} />

      {coverEditorOpen && (
        <div className="cover-editor-overlay" onClick={() => setCoverEditorOpen(false)}>
          <Card className="cover-editor-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Cover</h3>
            <div className="cover-editor-preview-wrap">
              <canvas
                ref={coverPreviewCanvasRef}
                width={COVER_OUTPUT_WIDTH}
                height={COVER_OUTPUT_HEIGHT}
                className="cover-editor-preview"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  coverDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startOffsetX: coverOffsetX,
                    startOffsetY: coverOffsetY
                  };
                }}
                onPointerMove={(event) => {
                  const drag = coverDragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = COVER_OUTPUT_WIDTH / Math.max(1, rect.width);
                  const nextX = drag.startOffsetX + (event.clientX - drag.startX) * ratio;
                  const nextY = drag.startOffsetY + (event.clientY - drag.startY) * ratio;
                  const clamped = clampCoverOffsets(coverZoom, nextX, nextY);
                  setCoverOffsetX(clamped.x);
                  setCoverOffsetY(clamped.y);
                }}
                onPointerUp={(event) => {
                  if (coverDragRef.current?.pointerId === event.pointerId) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    coverDragRef.current = null;
                  }
                }}
                onPointerCancel={() => {
                  coverDragRef.current = null;
                }}
              />
            </div>
            <div className="cover-editor-controls">
              <label>
                Zoom: {Math.round(coverZoom * 100)}%
                <input
                  className="cover-editor-zoom"
                  type="range"
                  min={100}
                  max={300}
                  step={1}
                  value={Math.round(coverZoom * 100)}
                  onChange={(event) => {
                    const nextZoom = Math.max(1, Number(event.target.value) / 100);
                    const clamped = clampCoverOffsets(nextZoom, coverOffsetX, coverOffsetY);
                    setCoverZoom(nextZoom);
                    setCoverOffsetX(clamped.x);
                    setCoverOffsetY(clamped.y);
                  }}
                />
              </label>
            </div>
            <div className="cover-editor-actions">
              <Button variant="ghost" onClick={() => setCoverEditorOpen(false)}>{t("app.cancel")}</Button>
              <Button variant="primary" onClick={() => { void onSaveCoverEditor(); }}>{t("app.save")}</Button>
            </div>
          </Card>
        </div>
      )}

      {avatarEditorOpen && (
        <div className="cover-editor-overlay" onClick={closeAvatarEditor}>
          <Card className="cover-editor-modal avatar-editor-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Avatar</h3>
            <div className="cover-editor-preview-wrap avatar-editor-preview-wrap">
              <canvas
                ref={avatarPreviewCanvasRef}
                width={AVATAR_OUTPUT_SIZE}
                height={AVATAR_OUTPUT_SIZE}
                className="cover-editor-preview avatar-editor-preview"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  avatarDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startOffsetX: avatarOffsetX,
                    startOffsetY: avatarOffsetY
                  };
                }}
                onPointerMove={(event) => {
                  const drag = avatarDragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = AVATAR_OUTPUT_SIZE / Math.max(1, rect.width);
                  const nextX = drag.startOffsetX + (event.clientX - drag.startX) * ratio;
                  const nextY = drag.startOffsetY + (event.clientY - drag.startY) * ratio;
                  const clamped = clampAvatarOffsets(avatarZoom, nextX, nextY);
                  setAvatarOffsetX(clamped.x);
                  setAvatarOffsetY(clamped.y);
                }}
                onPointerUp={(event) => {
                  if (avatarDragRef.current?.pointerId === event.pointerId) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    avatarDragRef.current = null;
                  }
                }}
                onPointerCancel={() => {
                  avatarDragRef.current = null;
                }}
              />
            </div>
            <div className="cover-editor-controls">
              <label>
                Zoom: {Math.round(avatarZoom * 100)}%
                <input
                  className="cover-editor-zoom"
                  type="range"
                  min={100}
                  max={300}
                  step={1}
                  value={Math.round(avatarZoom * 100)}
                  onChange={(event) => {
                    const nextZoom = Math.max(1, Number(event.target.value) / 100);
                    const clamped = clampAvatarOffsets(nextZoom, avatarOffsetX, avatarOffsetY);
                    setAvatarZoom(nextZoom);
                    setAvatarOffsetX(clamped.x);
                    setAvatarOffsetY(clamped.y);
                  }}
                />
              </label>
            </div>
            <div className="cover-editor-actions">
              <Button variant="ghost" onClick={closeAvatarEditor}>{t("app.cancel")}</Button>
              <Button variant="primary" onClick={() => { void onSaveAvatarEditor(); }}>{t("app.save")}</Button>
            </div>
          </Card>
        </div>
      )}

      {xpModalOpen && (
        <div className="cover-editor-overlay" onClick={() => setXpModalOpen(false)}>
          <Card className="cover-editor-modal xp-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Профиль и опыт</h3>
            <div className="xp-summary">
              <div className="xp-summary-main">
                <strong>Lv.{profileLevel.level}</strong>
                <span>Total XP: {profileXp}</span>
              </div>
              <span className="xp-next-level">До следующего уровня: {profileLevel.next - profileLevel.current} XP</span>
            </div>
            <div className="level-progress-bar">
              <span style={{ width: `${profileLevel.progress}%` }} />
            </div>
            <div className="xp-sections">
              <div className="xp-section">
                <h4>Что дает опыт</h4>
                <div className="achievements-list">
                  {xpBreakdown.map((entry) => (
                    <div key={entry.id} className="achievement-item unlocked">
                      <strong>{entry.label}</strong>
                      <span>+{entry.value} XP</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="xp-section">
                <h4>Достижения ({unlockedAchievements}/{achievements.length})</h4>
                <div className="achievements-list">
                  {achievements.map((item) => (
                    <div key={item.id} className={`achievement-item ${item.unlocked ? "unlocked" : "locked"}`}>
                      <strong>{item.title}</strong>
                      <span>{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="cover-editor-actions">
              <Button variant="ghost" onClick={() => setXpModalOpen(false)}>Закрыть</Button>
            </div>
          </Card>
        </div>
      )}

      {pendingInvite && (
        <Card className="invite-popup">
          <p>{pendingInvite.fromDisplayName} {t("app.inviteText")} {pendingInvite.roomId}</p>
          <div className="invite-actions">
            <Button variant="primary" onClick={() => void onInviteDecision(true)}>{t("app.accept")}</Button>
            <Button variant="ghost" onClick={() => void onInviteDecision(false)}>{t("app.decline")}</Button>
          </div>
        </Card>
      )}

      {toast && <Card className="toast">{toast}</Card>}
    </div>
  );
}







import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SocialClient } from "../../core/socialClient";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { t } from "../../i18n";
import { getEmulator } from "../registry";
import type { EmulatorSession, InputState } from "../types";
import type { AudioSettings, GameRecord } from "../../types/global";

type NetplayConfig = {
  enabled: boolean;
  social: SocialClient;
  roomId: string;
  localUserId: string;
  hostUserId: string;
  localPlayer: 1 | 2;
  transport: "lockstep" | "stream";
  isSpectator?: boolean;
};
type RoomChatMessage = {
  id: string;
  roomId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
};

const LOCKSTEP_INPUT_DELAY_FRAMES = 3;

const BIT_UP = 1 << 0;
const BIT_DOWN = 1 << 1;
const BIT_LEFT = 1 << 2;
const BIT_RIGHT = 1 << 3;
const BIT_A = 1 << 4;
const BIT_B = 1 << 5;
const BIT_START = 1 << 6;
const BIT_SELECT = 1 << 7;
const BIT_X = 1 << 8;
const BIT_Y = 1 << 9;
const BIT_L = 1 << 10;
const BIT_R = 1 << 11;
const SAVE_STATE_STORAGE_PREFIX = "nes-netplay-emulator.save.v1";
const QUICK_SAVE_SLOTS = [1, 2, 3, 4, 5] as const;
type SaveSlot = (typeof QUICK_SAVE_SLOTS)[number];

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createDefaultInput(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false
  };
}

function bitsToInput(bits: number): InputState {
  return {
    up: (bits & BIT_UP) !== 0,
    down: (bits & BIT_DOWN) !== 0,
    left: (bits & BIT_LEFT) !== 0,
    right: (bits & BIT_RIGHT) !== 0,
    a: (bits & BIT_A) !== 0,
    b: (bits & BIT_B) !== 0,
    start: (bits & BIT_START) !== 0,
    select: (bits & BIT_SELECT) !== 0,
    x: (bits & BIT_X) !== 0,
    y: (bits & BIT_Y) !== 0,
    l: (bits & BIT_L) !== 0,
    r: (bits & BIT_R) !== 0
  };
}

export function SnesGameView(props: {
  game: GameRecord;
  romBase64: string;
  audioSettings: AudioSettings;
  netplay?: NetplayConfig;
  paused: boolean;
  pauseButtonLabel: string;
  pauseInfo?: string;
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
    game, romBase64, audioSettings, netplay, paused, pauseButtonLabel, pauseInfo, onToggleAudio, onTogglePause, onOpenSettings, onExit, onToast,
    showInGameChat, inGameChatSide, roomChatMessages, roomChatInput, onRoomChatInput, onSendRoomChat, localUserId
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<EmulatorSession | null>(null);
  const [fps, setFps] = useState(0);
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
  const saveScope = netplay?.enabled ? `room:${netplay.roomId}` : "solo";
  const saveKey = useCallback((slot: SaveSlot) => `${SAVE_STATE_STORAGE_PREFIX}:${game.emulatorId}:${game.id}:${saveScope}:slot:${slot}`, [game.emulatorId, game.id, saveScope]);
  const roomChatListRef = useRef<HTMLDivElement | null>(null);
  const roomChatStickToBottomRef = useRef(true);

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
    const next: Record<SaveSlot, { savedAt?: string; screenshot?: string }> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
    for (const slot of QUICK_SAVE_SLOTS) {
      const raw = localStorage.getItem(saveKey(slot));
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
  }, [menuOpen, saveKey]);

  const romBytes = useMemo(() => {
    const binary = atob(romBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }, [romBase64]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const emulator = getEmulator("snes");
    const session = emulator.createSession({
      onFps: (nextFps) => setFps(nextFps),
      onError: (error) => {
        console.error("SNES session error:", error);
        onToast(error.message || "SNES session error");
      }
    });
    sessionRef.current = session;

    let disposed = false;

    const run = async () => {
      try {
        await session.mount(canvas);
        if (disposed) return;
        await session.loadRom(romBytes);
        if (disposed) return;
        session.setVolume(audioSettings.enabled ? audioSettings.volume / 100 : 0);
        if (!pausedRef.current) {
          session.start();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start SNES";
        onToast(message);
      }
    };

    void run();

    return () => {
      disposed = true;
      try {
        session.stop();
        session.destroy();
      } catch (error) {
        console.error("Failed to stop SNES session", error);
      }
      sessionRef.current = null;
    };
  }, [audioSettings.enabled, audioSettings.volume, onToast, romBytes]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.setVolume(audioSettings.enabled ? audioSettings.volume / 100 : 0);
  }, [audioSettings.enabled, audioSettings.volume]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (paused) {
      session.stop();
      return;
    }
    session.start();
  }, [paused]);

  const saveState = useCallback((slot: SaveSlot = 1) => {
    const session = sessionRef.current;
    if (!session || typeof session.saveState !== "function") {
      onToast("Save state is not supported");
      return;
    }
    try {
      const snapshot = session.saveState();
      const screenshot = canvasRef.current?.toDataURL("image/png");
      const savedAt = new Date().toISOString();
      localStorage.setItem(saveKey(slot), JSON.stringify({
        version: 1,
        savedAt,
        slot,
        screenshot,
        stateBase64: toBase64(snapshot)
      }));
      setSlotPreviewById((prev) => ({
        ...prev,
        [slot]: { savedAt, screenshot }
      }));
      onToast("State saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save state";
      onToast(message);
    }
  }, [onToast, saveKey]);

  const loadState = useCallback((slot: SaveSlot = 1) => {
    const session = sessionRef.current;
    if (!session || typeof session.loadState !== "function") {
      onToast("Load state is not supported");
      return;
    }
    const raw = localStorage.getItem(saveKey(slot));
    if (!raw) {
      onToast("No save state for this game");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { stateBase64?: string };
      if (!parsed?.stateBase64) {
        onToast("Save state is corrupted");
        return;
      }
      session.loadState(fromBase64(parsed.stateBase64));
      onToast("State loaded");
    } catch {
      onToast("Failed to load state");
    }
  }, [onToast, saveKey]);

  const restartGame = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      onToast("Game is not ready");
      return;
    }
    try {
      await session.loadRom(romBytes);
      if (!pausedRef.current) {
        session.start();
      }
      onToast("Игра перезапущена");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось перезапустить игру";
      onToast(message);
    }
  }, [onToast, romBytes]);

  useEffect(() => {
    const keyToBit: Record<string, number> = {
      ArrowUp: BIT_UP,
      KeyW: BIT_UP,
      ArrowDown: BIT_DOWN,
      KeyS: BIT_DOWN,
      ArrowLeft: BIT_LEFT,
      KeyA: BIT_LEFT,
      ArrowRight: BIT_RIGHT,
      KeyD: BIT_RIGHT,
      KeyK: BIT_A,
      KeyJ: BIT_B,
      Enter: BIT_START,
      ShiftRight: BIT_SELECT,
      Tab: BIT_SELECT,
      KeyI: BIT_X,
      KeyU: BIT_Y,
      KeyQ: BIT_L,
      KeyE: BIT_R
    };

    const isLockstep = Boolean(netplay?.enabled && netplay.transport === "lockstep");
    const localPlayer = isLockstep ? netplay!.localPlayer : 1;

    let localInputState = 0;
    let previousLocalAppliedState = 0;
    let previousRemoteAppliedState = 0;
    let currentFrame = 0;
    let plannedLocalFrame = 0;
    const localStateByFrame = new Map<number, number>();
    const remoteStateByFrame = new Map<number, number>();
    let rafId: number | null = null;

    const applyStates = () => {
      const session = sessionRef.current;
      if (!session) {
        rafId = window.requestAnimationFrame(applyStates);
        return;
      }
      if (pausedRef.current) {
        rafId = window.requestAnimationFrame(applyStates);
        return;
      }

      if (isLockstep) {
        const localStateForFrame = localStateByFrame.has(currentFrame)
          ? (localStateByFrame.get(currentFrame) as number)
          : previousLocalAppliedState;
        const remoteStateForFrame = remoteStateByFrame.has(currentFrame)
          ? (remoteStateByFrame.get(currentFrame) as number)
          : previousRemoteAppliedState;

        previousLocalAppliedState = localStateForFrame;
        previousRemoteAppliedState = remoteStateForFrame;

        const player1State = localPlayer === 1 ? localStateForFrame : remoteStateForFrame;
        const player2State = localPlayer === 1 ? remoteStateForFrame : localStateForFrame;
        session.setInput(bitsToInput(player1State), bitsToInput(player2State));

        currentFrame += 1;
      } else {
        session.setInput(bitsToInput(localInputState), createDefaultInput());
      }

      rafId = window.requestAnimationFrame(applyStates);
    };

    if (isLockstep) {
      netplay!.social.onNetplayInput((payload) => {
        if (payload.roomId !== netplay!.roomId) {
          return;
        }
        if (payload.fromUserId === netplay!.localUserId) {
          return;
        }
        const frame = Number(payload.frame);
        const state = Number(payload.state);
        if (Number.isFinite(frame) && Number.isFinite(state)) {
          remoteStateByFrame.set(frame, state);
        }
      });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setMenuOpen((prev) => !prev);
        return;
      }
      if (event.code === "F5") {
        event.preventDefault();
        saveState();
        return;
      }
      if (event.code === "F9") {
        event.preventDefault();
        loadState();
        return;
      }
      if (menuOpenRef.current) return;
      const bit = keyToBit[event.code];
      if (bit === undefined) {
        return;
      }
      event.preventDefault();
      if ((localInputState & bit) !== 0) {
        return;
      }

      localInputState |= bit;

      if (isLockstep) {
        plannedLocalFrame = Math.max(plannedLocalFrame, currentFrame + LOCKSTEP_INPUT_DELAY_FRAMES);
        localStateByFrame.set(plannedLocalFrame, localInputState);
        netplay!.social.sendNetplayInput(netplay!.roomId, plannedLocalFrame, localInputState);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pausedRef.current) return;
      const bit = keyToBit[event.code];
      if (bit === undefined) return;
      event.preventDefault();
      if ((localInputState & bit) === 0) {
        return;
      }

      localInputState &= ~bit;

      if (isLockstep) {
        plannedLocalFrame = Math.max(plannedLocalFrame, currentFrame + LOCKSTEP_INPUT_DELAY_FRAMES);
        localStateByFrame.set(plannedLocalFrame, localInputState);
        netplay!.social.sendNetplayInput(netplay!.roomId, plannedLocalFrame, localInputState);
      }
    };

    const onBlur = () => {
      localInputState = 0;
    };

    rafId = window.requestAnimationFrame(applyStates);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (isLockstep) {
        netplay!.social.onNetplayInput(() => undefined);
      }
    };
  }, [loadState, netplay, saveState]);

  useEffect(() => {
    const list = roomChatListRef.current;
    if (!list) return;
    if (!roomChatStickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [roomChatMessages.length]);
  const canUsePauseChat = false;

  return (
    <div className="game-view-root">
      <div className="game-surface scale-fit">
        <canvas ref={canvasRef} className="game-canvas pixels-nearest" width={256} height={239} aria-label={game.name} />
      </div>
      <div className="replay-controls">
        <Button variant="secondary" onClick={onExit}>Exit</Button>
        <span className="replay-meta">SNES | FPS: {fps}</span>
      </div>
      {showInGameChat && (
        <Card className={`ingame-chat-panel ingame-chat-${inGameChatSide}`}>
          <div className="ingame-chat-title">Room chat</div>
          <div
            ref={roomChatListRef}
            className="ingame-chat-list"
            onScroll={() => {
              const list = roomChatListRef.current;
              if (!list) return;
              const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
              roomChatStickToBottomRef.current = nearBottom;
            }}
          >
            {roomChatMessages.slice(-80).map((message) => (
              <div key={message.id} className={`ingame-chat-line ${localUserId && message.fromUserId === localUserId ? "mine" : ""}`}>
                <strong>{message.fromDisplayName}:</strong> {message.text}
              </div>
            ))}
            {roomChatMessages.length === 0 && <div className="empty-hint">No messages yet</div>}
          </div>
          <div className="ingame-chat-input">
            <Input
              value={roomChatInput}
              onChange={(event) => onRoomChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onSendRoomChat();
              }}
              placeholder="Message"
            />
            <Button variant="primary" onClick={onSendRoomChat}>Send</Button>
          </div>
        </Card>
      )}
      {menuOpen && (
        <div className="in-game-menu-overlay" onClick={() => setMenuOpen(false)}>
          <Card className="in-game-menu" onClick={(event) => event.stopPropagation()}>
            <h3>{t("app.gameMenuTitle")}</h3>
            <div className="in-game-menu-actions">
              <Button variant="secondary" onClick={() => setMenuOpen(false)}>{t("app.gameMenuContinue")}</Button>
              <Button variant="secondary" onClick={() => { void restartGame(); }}>Начать заново</Button>
              <Button variant="secondary" onClick={() => { onToggleAudio(); }}>{audioSettings.enabled ? t("app.gameMenuSoundOn") : t("app.gameMenuSoundOff")}</Button>
              <Button variant="secondary" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>{t("app.gameMenuSettings")}</Button>
              <Button variant="danger" onClick={onExit}>{t("app.gameMenuExit")}</Button>
            </div>
            <div className="save-slots-grid">
              {QUICK_SAVE_SLOTS.map((slot) => (
                <Card key={`snes-menu-slot-${slot}`} className="save-slot-card">
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
            {canUsePauseChat && (
              <div className="pause-chat-block">
                <strong>Room chat</strong>
                <div
                  ref={roomChatListRef}
                  className="pause-chat-list"
                  onScroll={() => {
                    const list = roomChatListRef.current;
                    if (!list) return;
                    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
                    roomChatStickToBottomRef.current = nearBottom;
                  }}
                >
                  {roomChatMessages.slice(-80).map((message) => (
                    <div key={message.id} className={`room-chat-line ${localUserId && message.fromUserId === localUserId ? "mine" : ""}`}>
                      <strong>{message.fromDisplayName}:</strong> <span>{message.text}</span>
                    </div>
                  ))}
                  {roomChatMessages.length === 0 && <div className="empty-hint">No messages yet</div>}
                </div>
                <div className="pause-chat-input">
                  <Input
                    value={roomChatInput}
                    onChange={(event) => onRoomChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !paused) return;
                      event.preventDefault();
                      onSendRoomChat();
                    }}
                    placeholder={paused ? "Message" : "Поставь паузу, чтобы писать"}
                    disabled={!paused}
                  />
                  <Button variant="secondary" onClick={onSendRoomChat} disabled={!paused}>Send</Button>
                </div>
              </div>
            )}
            {pauseInfo && <p className="replay-meta">{pauseInfo}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { t } from "../i18n";
import type { ControlSettings, GameRecord } from "../types/global";
import type { NetplayConfig, RoomChatMessage } from "../netplay/types";
import { InGameRoomChatPanel } from "./InGameRoomChatPanel";

const INPUT_BIT_UP = 1 << 0;
const INPUT_BIT_DOWN = 1 << 1;
const INPUT_BIT_LEFT = 1 << 2;
const INPUT_BIT_RIGHT = 1 << 3;
const INPUT_BIT_A = 1 << 4;
const INPUT_BIT_B = 1 << 5;
const INPUT_BIT_START = 1 << 6;
const INPUT_BIT_SELECT = 1 << 7;

export function StreamClientView(props: {
  game: GameRecord;
  controls: ControlSettings;
  netplay: NetplayConfig;
  paused: boolean;
  pauseButtonLabel: string;
  pauseInfo?: string;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTogglePause: () => void;
  showRoomPauseAction: boolean;
  roomPauseLabel: string;
  onToggleRoomPause: () => void;
  onVisualReady: () => void;
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
    game, controls, netplay, paused, pauseButtonLabel, pauseInfo, audioEnabled, onToggleAudio, onTogglePause, showRoomPauseAction, roomPauseLabel, onToggleRoomPause, onVisualReady, onOpenSettings, onExit, onToast,
    showInGameChat, inGameChatSide, roomChatMessages, roomChatInput, onRoomChatInput, onSendRoomChat, localUserId
  } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visualReadyReportedRef = useRef(false);
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
    visualReadyReportedRef.current = false;
  }, [netplay.roomId]);
  useEffect(() => {
    if (paused) {
      setMenuOpen(false);
    }
  }, [paused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const markReady = () => {
      if (visualReadyReportedRef.current) {
        return;
      }
      visualReadyReportedRef.current = true;
      onVisualReady();
    };
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    return () => {
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [onVisualReady]);

  useEffect(() => {
    if (!netplay.streamPeerUserId) {
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    let guestRemoteDescriptionSet = false;
    let handshakeCompleted = false;
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
        if (!visualReadyReportedRef.current) {
          visualReadyReportedRef.current = true;
          onVisualReady();
        }
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
            handshakeCompleted = true;
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
    const readyRetryId = window.setInterval(() => {
      if (handshakeCompleted) {
        return;
      }
      netplay.social.sendStreamSignal(netplay.roomId, netplay.streamPeerUserId!, { type: "ready" });
    }, 1500);
    const readyRetryStopId = window.setTimeout(() => {
      window.clearInterval(readyRetryId);
    }, 20000);

    return () => {
      netplay.social.onStreamSignal(() => undefined);
      window.clearInterval(readyRetryId);
      window.clearTimeout(readyRetryStopId);
      pc.close();
    };
  }, [netplay, onToast, onVisualReady]);

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
              {showRoomPauseAction && <Button variant="secondary" onClick={() => onToggleRoomPause()}>{roomPauseLabel}</Button>}
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

import { Button } from "./ui/Button";

type NetplayHeaderProps = {
  isHost: boolean;
  roomId: string;
  roomStatus: string;
  hostName: string;
  playersCount: number;
  spectatorsCount: number;
  latencyMs: number | null;
  quality: string;
  health: "offline" | "good" | "degraded";
  mode: "lockstep" | "stream";
  signalingUrl: string;
  onCreateRoom: () => void;
  onCloseRoom: () => void;
  onChangeMode: (mode: "lockstep" | "stream") => void;
};

export function NetplayHeader({
  isHost,
  roomId,
  roomStatus,
  hostName,
  playersCount,
  spectatorsCount,
  latencyMs,
  quality,
  health,
  mode,
  signalingUrl,
  onCreateRoom,
  onCloseRoom,
  onChangeMode
}: NetplayHeaderProps) {
  const currentModeLabel = mode === "stream" ? "Потоковый" : "P2P (Input Sync)";
  const healthLabel = health === "good" ? "Online" : health === "degraded" ? "Degraded" : "Offline";

  return (
    <div className="netplay-header netplay-single-block">
      <div className="netplay-header-controls">
        {roomId ? (
          isHost ? (
            <Button variant="danger" onClick={onCloseRoom}>
              Закрыть комнату
            </Button>
          ) : (
            <Button variant="ghost" data-variant="soft" disabled>
              Вы в комнате
            </Button>
          )
        ) : (
          <Button variant="primary" data-action="play" onClick={onCreateRoom}>
            Создать комнату
          </Button>
        )}
        <Button
          variant="ghost"
          data-variant="soft"
          onClick={() => {
            if (roomId) {
              void navigator.clipboard.writeText(roomId);
            }
          }}
          disabled={!roomId}
        >
          Код комнаты: {roomId || "—"}
        </Button>
      </div>

      <div className="netplay-info-grid">
        <div className="overflow-menu-item">
          <div className="overflow-menu-title">Информация о сети</div>
          <div className="overflow-menu-text">{roomId ? roomStatus : "Не подключено"}</div>
          <div className="overflow-menu-text">Latency: {latencyMs === null ? "—" : `${latencyMs} ms`}</div>
          <div className="overflow-menu-text">Quality: {quality}</div>
          <div className="overflow-menu-text">State: {healthLabel}</div>
          <div className="overflow-menu-text netplay-url">{signalingUrl}</div>
        </div>
        <div className="overflow-menu-item">
          <div className="overflow-menu-title">Комната</div>
          <div className="overflow-menu-text">Host: {hostName}</div>
          <div className="overflow-menu-text">Players: {playersCount}</div>
          <div className="overflow-menu-text">Spectators: {spectatorsCount}</div>
          <div className="overflow-menu-text">Mode: {currentModeLabel}</div>
          <div className="overflow-menu-actions">
            <Button variant="ghost" onClick={() => onChangeMode("lockstep")} disabled={mode === "lockstep"}>
              P2P
            </Button>
            <Button variant="ghost" onClick={() => onChangeMode("stream")} disabled={mode === "stream"}>
              Поток
            </Button>
          </div>
        </div>
      </div>

      <div className="netplay-status-line">
        <span className={`netplay-health-chip ${health}`}>{healthLabel}</span>
        <span className="netplay-latency-chip">{latencyMs === null ? "Latency —" : `Latency ${latencyMs}ms`}</span>
      </div>
    </div>
  );
}

import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
type NetworkHealth = "offline" | "good" | "degraded";

function connectionLabel(state: ConnectionState): string {
  if (state === "connecting") return "Подключение...";
  if (state === "reconnecting") return "Переподключение...";
  if (state === "disconnected") return "Офлайн";
  return "Онлайн";
}

function healthClass(health: NetworkHealth): string {
  if (health === "good") return "good";
  if (health === "degraded") return "degraded";
  return "offline";
}

export function AppTopbar(props: {
  roomStatus: string;
  networkHealth: NetworkHealth;
  connectionState: ConnectionState;
  onOpenSettings: () => void;
}) {
  const { roomStatus, networkHealth, connectionState, onOpenSettings } = props;
  return (
    <Card className="topbar">
      <span className="app-title topbar-title">nes netplay online</span>
      <div className="topbar-network">
        <span className={`topbar-network-dot ${healthClass(networkHealth)}`} />
        <span className="topbar-network-text">{connectionLabel(connectionState)}</span>
        <span className="topbar-room-status" title={roomStatus}>{roomStatus}</span>
      </div>
      <Button variant="secondary" data-action="settings-open" className="with-bow" onClick={onOpenSettings}>Настройки</Button>
    </Card>
  );
}


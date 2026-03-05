import { Card } from "./ui/Card";

export function GameMetaStats(props: {
  lastPlayedLabel: string;
  totalPlayTimeLabel: string;
  lastPlayedValue: string;
  totalPlayTimeValue: string;
}) {
  const { lastPlayedLabel, totalPlayTimeLabel, lastPlayedValue, totalPlayTimeValue } = props;
  return (
    <div className="stats-grid">
      <Card className="stat-card stat-card-combined">
        <div className="stat-row">
          <span>{lastPlayedLabel}</span>
          <strong>{lastPlayedValue}</strong>
        </div>
        <div className="stat-row">
          <span>{totalPlayTimeLabel}</span>
          <strong>{totalPlayTimeValue}</strong>
        </div>
      </Card>
    </div>
  );
}


import { useEffect, useRef, useState } from "react";
import type { GameRecord } from "../types/global";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { ListItem } from "./ui/ListItem";
import { SectionHeader } from "./ui/SectionHeader";

type CoversMap = Record<string, string | null | undefined>;

type SidebarLibraryProps = {
  games: GameRecord[];
  selectedId: string;
  covers: CoversMap;
  raImagesByGameId: Record<string, string>;
  raSummaryByGameId: Record<string, { unlocked: number; total: number }>;
  showAchievementProgress: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectGame: (id: string) => void;
  onAddGame: () => void;
  onRequestDelete: (game: GameRecord) => void;
};

type ContextState = {
  game: GameRecord;
  x: number;
  y: number;
};

export function SidebarLibrary({
  games,
  selectedId,
  covers,
  raImagesByGameId,
  raSummaryByGameId,
  showAchievementProgress,
  searchValue,
  onSearchChange,
  onSelectGame,
  onAddGame,
  onRequestDelete
}: SidebarLibraryProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [context, setContext] = useState<ContextState | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const contextRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!context) {
      return;
    }
    const onGlobalClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contextRef.current && target && !contextRef.current.contains(target)) {
        setContext(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContext(null);
      }
    };
    window.addEventListener("mousedown", onGlobalClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onGlobalClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [context]);

  return (
    <Card className="library-panel">
      <SectionHeader title="Библиотека" extra={<Badge>NES</Badge>} />
      <div className="library-search-row">
        <button
          type="button"
          className="library-search-trigger"
          data-variant="ghost"
          title="Поиск по библиотеке"
          onClick={() => setSearchOpen((prev) => !prev)}
        >
          ⌕
        </button>
        <input
          ref={searchInputRef}
          className={`library-search-input ${searchOpen ? "open" : ""}`}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по библиотеке"
        />
      </div>

      <div className="library-list">
        {games.map((game) => (
          <ListItem
            key={game.id}
            active={game.id === selectedId}
            className="library-item"
            onClick={() => onSelectGame(game.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContext({
                game,
                x: event.clientX,
                y: event.clientY
              });
            }}
          >
            <div className="library-thumb-wrap">
              {covers[game.id] ? (
                <img className="library-thumb" src={covers[game.id] || ""} alt={game.name} />
              ) : raImagesByGameId[game.id] ? (
                <img className="library-thumb" src={raImagesByGameId[game.id]} alt={game.name} />
              ) : (
                <div className="library-thumb placeholder">{game.name.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            <span className="library-title">{game.name}</span>
            {showAchievementProgress && game.retroAchievementsGameId && raSummaryByGameId[game.id] && (
              <span className="library-achievement-progress">
                {raSummaryByGameId[game.id].unlocked}/{raSummaryByGameId[game.id].total} достижений
              </span>
            )}
          </ListItem>
        ))}
        {games.length === 0 && <div className="empty-hint">Игры не найдены</div>}
      </div>

      <div className="library-footer">
        <Button variant="primary" data-action="add-game" className="library-action-btn with-bow" onClick={onAddGame}>
          Добавить игру
        </Button>
      </div>

      {context && (
        <div
          ref={contextRef}
          className="library-context-menu"
          style={{
            top: context.y,
            left: context.x
          }}
        >
          <button
            type="button"
            className="library-context-item danger"
            data-variant="danger"
            onClick={() => {
              onRequestDelete(context.game);
              setContext(null);
            }}
          >
            Удалить игру
          </button>
        </div>
      )}
    </Card>
  );
}


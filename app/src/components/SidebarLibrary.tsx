import { useEffect, useMemo, useRef, useState } from "react";
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

const ROW_HEIGHT = 56;
const ROW_SIZE = 62;
const OVERSCAN = 8;

function LazyLibraryThumb(props: { src?: string; alt: string; fallbackText: string }) {
  const { src, alt, fallbackText } = props;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !src) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  if (!src) {
    return <div className="library-thumb placeholder">{fallbackText}</div>;
  }
  return <img ref={imgRef} className="library-thumb" src={visible ? src : ""} alt={alt} loading="lazy" decoding="async" />;
}

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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const updateHeight = () => setViewportHeight(viewport.clientHeight || 420);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const totalHeight = games.length * ROW_SIZE;
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_SIZE) - OVERSCAN);
    const end = Math.min(games.length, Math.ceil((scrollTop + viewportHeight) / ROW_SIZE) + OVERSCAN);
    return { start, end };
  }, [games.length, scrollTop, viewportHeight]);
  const visibleGames = games.slice(range.start, range.end);

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

      <div
        ref={viewportRef}
        className="library-list library-list-virtual"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="library-virtual-canvas" style={{ height: `${totalHeight}px` }}>
          {visibleGames.map((game, offset) => {
            const index = range.start + offset;
            const thumbSrc = (covers[game.id] || raImagesByGameId[game.id] || "");
            return (
              <div key={game.id} className="library-virtual-row" style={{ top: `${index * ROW_SIZE}px`, height: `${ROW_SIZE}px` }}>
                <ListItem
                  active={game.id === selectedId}
                  className="library-item library-item-virtual"
                  style={{ minHeight: `${ROW_HEIGHT}px` }}
                  onClick={() => onSelectGame(game.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContext({ game, x: event.clientX, y: event.clientY });
                  }}
                >
                  <div className="library-thumb-wrap">
                    <LazyLibraryThumb src={thumbSrc} alt={game.name} fallbackText={game.name.slice(0, 2).toUpperCase()} />
                  </div>
                  <span className="library-title">{game.name}</span>
                  {showAchievementProgress && game.retroAchievementsGameId && raSummaryByGameId[game.id] && (
                    <span className="library-achievement-progress">
                      {raSummaryByGameId[game.id].unlocked}/{raSummaryByGameId[game.id].total} достижений
                    </span>
                  )}
                </ListItem>
              </div>
            );
          })}
        </div>
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
          style={{ top: context.y, left: context.x }}
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

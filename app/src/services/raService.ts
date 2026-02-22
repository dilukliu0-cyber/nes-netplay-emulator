import type { RetroGameAchievements } from "../types/global";

export function pickGameImage(images: RetroGameAchievements["images"] | undefined): string {
  if (!images) return "";
  return images.boxArt || images.title || images.icon || "";
}

export async function getGameData(gameId: number, username?: string): Promise<RetroGameAchievements> {
  return window.ra.getGameData({
    gameId,
    username: String(username || "").trim() || undefined
  });
}

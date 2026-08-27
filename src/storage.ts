import type { MetaItem, PlayerSettings, WatchHistoryItem } from "./types";

const WATCHLIST_KEY = "kotoko.watchlist.v1";
const HISTORY_KEY = "kotoko.history.v1";
const LAST_STREAM_KEY = "kotoko.lastStream.v1";
const PLAYER_SETTINGS_KEY = "kotoko.playerSettings.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app remains usable when browser storage is unavailable.
  }
}

export function getWatchlist(): MetaItem[] {
  return readJson<MetaItem[]>(WATCHLIST_KEY, []);
}

export function isInWatchlist(id: string, type?: MetaItem["type"]): boolean {
  return getWatchlist().some((item) => item.id === id && (!type || item.type === type));
}

export function toggleWatchlist(meta: MetaItem): boolean {
  const current = getWatchlist();
  const exists = current.some((item) => item.id === meta.id && item.type === meta.type);
  writeJson(
    WATCHLIST_KEY,
    exists
      ? current.filter((item) => !(item.id === meta.id && item.type === meta.type))
      : [{ ...meta, videos: undefined }, ...current]
  );
  return !exists;
}

export function getHistory(): WatchHistoryItem[] {
  return readJson<WatchHistoryItem[]>(HISTORY_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProgress(item: WatchHistoryItem): void {
  if (!Number.isFinite(item.currentTime) || item.currentTime < 2) return;
  const current = getHistory().filter(
    (entry) =>
      !(entry.meta.id === item.meta.id && entry.meta.type === item.meta.type && entry.videoId === item.videoId)
  );
  const completed = item.duration > 0 && item.currentTime / item.duration >= 0.96;
  writeJson(HISTORY_KEY, completed ? current : [item, ...current].slice(0, 60));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function getLastStreamName(): string {
  return localStorage.getItem(LAST_STREAM_KEY) ?? "";
}

export function setLastStreamName(value: string): void {
  localStorage.setItem(LAST_STREAM_KEY, value);
}

export function getPlayerSettings(): PlayerSettings {
  const saved = readJson<Partial<PlayerSettings>>(PLAYER_SETTINGS_KEY, {});
  return {
    volume: typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : 1,
    muted: Boolean(saved.muted),
    playbackRate:
      typeof saved.playbackRate === "number" && [0.75, 1, 1.25, 1.5, 2].includes(saved.playbackRate)
        ? saved.playbackRate
        : 1
  };
}

export function savePlayerSettings(settings: PlayerSettings): void {
  writeJson(PLAYER_SETTINGS_KEY, settings);
}

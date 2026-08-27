import type {
  AddonManifest,
  ApiErrorPayload,
  MetaItem,
  StreamItem,
  SubtitleItem
} from "./types";

const memoryCache = new Map<string, { expires: number; value: unknown }>();

async function requestJson<T>(path: string, ttlMs = 0): Promise<T> {
  const cached = memoryCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const payload = (await response.json()) as T | ApiErrorPayload;
    if (!response.ok) {
      throw new Error((payload as ApiErrorPayload).error || `Request failed (${response.status})`);
    }
    if (ttlMs > 0) memoryCache.set(path, { expires: Date.now() + ttlMs, value: payload });
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The catalog took too long to respond.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getManifest(): Promise<AddonManifest> {
  return requestJson<AddonManifest>("/api/manifest", 2 * 60_000);
}

export async function getCatalog(
  type: string,
  id: string,
  extras: Record<string, string | number> = {}
): Promise<MetaItem[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extras)) params.set(key, String(value));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await requestJson<{ metas?: MetaItem[] }>(
    `/api/catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}${query}`,
    5 * 60_000
  );
  return Array.isArray(payload.metas) ? payload.metas : [];
}

export async function getMeta(type: string, id: string): Promise<MetaItem> {
  const payload = await requestJson<{ meta?: MetaItem }>(
    `/api/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    30 * 60_000
  );
  if (!payload.meta) throw new Error("Details are not available for this title.");
  return payload.meta;
}

export async function getStreams(type: string, videoId: string): Promise<StreamItem[]> {
  const payload = await requestJson<{ streams?: StreamItem[] }>(
    `/api/stream/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}`,
    10_000
  );
  return Array.isArray(payload.streams) ? payload.streams : [];
}

export async function getSubtitles(type: string, videoId: string): Promise<SubtitleItem[]> {
  const payload = await requestJson<{ subtitles?: SubtitleItem[] }>(
    `/api/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}`,
    2 * 60_000
  );
  return Array.isArray(payload.subtitles) ? payload.subtitles : [];
}

export function clearApiCache(): void {
  memoryCache.clear();
}

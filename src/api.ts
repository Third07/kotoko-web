import type {
  AddonManifest,
  AddonSource,
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

export async function getAddons(): Promise<AddonSource[]> {
  const payload = await requestJson<{ addons?: AddonSource[] }>("/api/addons", 60_000);
  return Array.isArray(payload.addons) ? payload.addons : [];
}

function addonResourcePath(addonId: string, resource: string, type: string, id: string): string {
  return `/api/addons/${encodeURIComponent(addonId)}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

export async function getCatalog(
  addonId: string,
  type: string,
  id: string,
  extras: Record<string, string | number> = {}
): Promise<MetaItem[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extras)) params.set(key, String(value));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await requestJson<{ metas?: MetaItem[] }>(
    `${addonResourcePath(addonId, "catalog", type, id)}${query}`,
    5 * 60_000
  );
  return Array.isArray(payload.metas) ? payload.metas : [];
}

export async function getMeta(addonId: string, type: string, id: string): Promise<MetaItem> {
  const payload = await requestJson<{ meta?: MetaItem }>(
    addonResourcePath(addonId, "meta", type, id),
    30 * 60_000
  );
  if (!payload.meta) throw new Error("Details are not available for this title.");
  return payload.meta;
}

export async function getStreams(addonId: string, type: string, videoId: string): Promise<StreamItem[]> {
  const payload = await requestJson<{ streams?: StreamItem[] }>(
    addonResourcePath(addonId, "stream", type, videoId),
    10_000
  );
  return Array.isArray(payload.streams) ? payload.streams : [];
}

export async function getSubtitles(addonId: string, type: string, videoId: string): Promise<SubtitleItem[]> {
  const payload = await requestJson<{ subtitles?: SubtitleItem[] }>(
    addonResourcePath(addonId, "subtitles", type, videoId),
    2 * 60_000
  );
  return Array.isArray(payload.subtitles) ? payload.subtitles : [];
}

export function clearApiCache(): void {
  memoryCache.clear();
}

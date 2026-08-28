export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
}

export interface AddonCatalog {
  type: "movie" | "series";
  id: string;
  name: string;
  addonId?: string;
  addonName?: string;
  extra?: CatalogExtra[];
  extraSupported?: string[];
}

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  catalogs: AddonCatalog[];
  resources: unknown[];
  types: string[];
}

export interface AddonSource {
  id: string;
  status: "ready" | "offline";
  manifest?: AddonManifest;
  error?: string;
}

export interface VideoItem {
  id: string;
  title?: string;
  name?: string;
  season?: number;
  episode?: number;
  number?: number;
  overview?: string;
  thumbnail?: string;
  released?: string;
}

export interface MetaItem {
  id: string;
  type: "movie" | "series";
  name: string;
  addonId?: string;
  addonName?: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: string | number;
  runtime?: string;
  genres?: string[];
  imdbRating?: string;
  videos?: VideoItem[];
}

export interface StreamItem {
  addonId?: string;
  addonName?: string;
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  fileIdx?: number;
  ytId?: string;
  subtitles?: SubtitleItem[];
  behaviorHints?: {
    filename?: string;
    videoSize?: number;
    notWebReady?: boolean;
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
  };
}

export interface PlayerSettings {
  volume: number;
  muted: boolean;
  playbackRate: number;
}

export interface SubtitleItem {
  id?: string;
  url: string;
  lang?: string;
}

export interface WatchHistoryItem {
  meta: MetaItem;
  videoId: string;
  episodeLabel?: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

export interface ApiErrorPayload {
  error?: string;
}

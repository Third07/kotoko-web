import "@fontsource-variable/sora";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Home,
  Library,
  ListVideo,
  Maximize,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  SkipBack,
  SkipForward,
  Trash2,
  Tv,
  Wifi,
  WifiOff,
  X,
  createIcons
} from "lucide";
import { clearApiCache, getCatalog, getManifest, getMeta, getStreams, getSubtitles } from "./api";
import { MediaPlayer, getDownloadInfo, getStreamKind, streamDetail, streamLabel } from "./player";
import {
  clearHistory,
  getHistory,
  getLastStreamName,
  getPlayerSettings,
  getWatchlist,
  isInWatchlist,
  saveProgress,
  savePlayerSettings,
  setLastStreamName,
  toggleWatchlist
} from "./storage";
import type { AddonCatalog, AddonManifest, MetaItem, StreamItem, VideoItem } from "./types";
import type { SubtitleItem } from "./types";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("App container not found");
const root: HTMLDivElement = rootElement;

const icons = {
  ArrowLeft,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Home,
  Library,
  ListVideo,
  Maximize,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  SkipBack,
  SkipForward,
  Trash2,
  Tv,
  Wifi,
  WifiOff,
  X
};

let manifest: AddonManifest | null = null;
let currentMeta: MetaItem | null = null;
let currentVideoId = "";
let currentEpisodeLabel = "";
let currentStreams: StreamItem[] = [];
let currentSubtitles: SubtitleItem[] = [];
let currentStreamIndex = -1;
let lastProgressSave = 0;
let routeGeneration = 0;
let playerRequestId = 0;
let closingPlayer = false;
const playerSettings = getPlayerSettings();
const previewCache = new Map<string, MetaItem>();
const catalogCache = new Map<string, MetaItem[]>();
const player = new MediaPlayer();

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeImageUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

function safeHttpsUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function mediaKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function formatBytes(value?: number): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
}

function routeFor(meta: MetaItem): string {
  return `#/detail/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}`;
}

function refreshIcons(): void {
  createIcons({ icons });
}

function toast(message: string): void {
  const element = document.querySelector<HTMLElement>("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-visible");
  window.setTimeout(() => element.classList.remove("is-visible"), 2400);
}

function setNetworkBadge(online: boolean): void {
  const badge = document.querySelector<HTMLElement>("#network-badge");
  if (!badge) return;
  badge.innerHTML = `<i data-lucide="${online ? "wifi" : "wifi-off"}"></i><span>${online ? "Online" : "Offline"}</span>`;
  badge.classList.toggle("is-offline", !online);
  refreshIcons();
}

function setActiveNavigation(route: { name: string; parts: string[] }): void {
  const active =
    route.name === "catalog" || route.name === "detail"
      ? route.parts[1] === "movie"
        ? "movies"
        : route.parts[1] === "series"
          ? "series"
          : route.name
      : route.name;
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((link) => {
    const selected = link.dataset.nav === active;
    link.classList.toggle("is-active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function renderShell(): void {
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="Kotoko home">
        <span class="brand-mark"><span>K</span></span>
        <span class="brand-copy"><strong>Kotoko</strong><small>Pinoy screen</small></span>
      </a>
      <nav class="desktop-nav" aria-label="Primary">
        <a href="#/home" data-nav="home">Home</a>
        <a href="#/catalog/movie/latest_movies" data-nav="movies">Movies</a>
        <a href="#/catalog/series/top_series" data-nav="series">Series</a>
        <a href="#/library" data-nav="library">My library</a>
      </nav>
      <form class="search-form" id="search-form" role="search">
        <i data-lucide="search"></i>
        <input id="search-input" name="q" type="search" placeholder="Search Kotoko" autocomplete="off" aria-label="Search Kotoko catalog" />
      </form>
      <span class="network-badge" id="network-badge"><i data-lucide="wifi"></i><span>Online</span></span>
    </header>
    <main id="main-content" tabindex="-1"></main>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      <a href="#/home" data-nav="home"><i data-lucide="home"></i><span>Home</span></a>
      <a href="#/catalog/movie/latest_movies" data-nav="movies"><i data-lucide="film"></i><span>Movies</span></a>
      <a href="#/search" data-nav="search" class="mobile-search"><i data-lucide="search"></i><span>Search</span></a>
      <a href="#/catalog/series/top_series" data-nav="series"><i data-lucide="tv"></i><span>Series</span></a>
      <a href="#/library" data-nav="library"><i data-lucide="library"></i><span>Library</span></a>
    </nav>
    <dialog class="player-dialog" id="player-dialog" aria-labelledby="player-title">
      <div class="player-shell">
        <header class="player-header">
          <div>
            <p class="eyebrow"><span class="live-dot"></span> Now playing <span class="player-status" id="player-status">Preparing</span></p>
            <h2 id="player-title">Loading…</h2>
            <p id="player-subtitle"></p>
          </div>
          <button class="icon-button" type="button" data-action="close-player" aria-label="Close player"><i data-lucide="x"></i></button>
        </header>
        <div class="video-stage">
          <video id="video" controls playsinline preload="metadata"></video>
          <div class="player-state" id="player-state"><span class="spinner"></span><p>Finding playable sources…</p></div>
        </div>
        <div class="player-toolbar">
          <div class="player-command-bar">
            <div class="episode-actions" aria-label="Episode navigation">
              <button class="toolbar-button" id="previous-episode" type="button" data-action="previous-episode" disabled><i data-lucide="skip-back"></i><span>Previous</span></button>
              <button class="toolbar-button" id="next-episode" type="button" data-action="next-episode" disabled><span>Next</span><i data-lucide="skip-forward"></i></button>
            </div>
            <div class="playback-actions">
              <button class="toolbar-button" type="button" data-action="fullscreen"><i data-lucide="maximize"></i><span>Fullscreen</span></button>
              <a class="toolbar-button download-button is-hidden" id="download-link" href="#" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-disabled="true"><i data-lucide="download"></i><span>Download file</span></a>
            </div>
          </div>
          <div class="source-heading"><span><i data-lucide="server"></i> Playback sources</span><button type="button" class="text-button" data-action="try-next"><i data-lucide="skip-forward"></i> Try next source</button></div>
          <div class="source-list" id="source-list"></div>
          <p class="player-note"><i data-lucide="captions"></i> Subtitles come from the add-on. Downloads appear only for direct media files and are handled by your browser.</p>
        </div>
      </div>
    </dialog>
    <div class="toast" id="toast" role="status"></div>
  `;
  refreshIcons();
}

function mainElement(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#main-content");
  if (!element) throw new Error("Main content not found");
  return element;
}

function skeletonCards(count = 6): string {
  return Array.from({ length: count }, () => `<div class="poster-card skeleton"><span></span><span></span></div>`).join("");
}

function formatMetaLine(meta: MetaItem): string {
  return [meta.releaseInfo || meta.year, meta.runtime, meta.imdbRating ? `★ ${meta.imdbRating}` : ""]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
}

function posterCard(meta: MetaItem, historyProgress?: number): string {
  previewCache.set(mediaKey(meta.type, meta.id), meta);
  const poster = safeImageUrl(meta.poster);
  const typeLabel = meta.type === "series" ? "Series" : "Movie";
  return `
    <article class="poster-card">
      <a href="${routeFor(meta)}" aria-label="View ${escapeHtml(meta.name)}">
        <div class="poster-frame">
          ${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async" width="300" height="450" sizes="(max-width: 600px) 42vw, 190px" />` : `<div class="poster-fallback"><i data-lucide="film"></i></div>`}
          <span class="type-chip">${typeLabel}</span>
          ${typeof historyProgress === "number" ? `<span class="progress-track"><span style="width:${Math.round(historyProgress * 100)}%"></span></span>` : ""}
          <span class="poster-open" aria-hidden="true"><i data-lucide="play"></i></span>
        </div>
        <h3>${escapeHtml(meta.name)}</h3>
        <p>${formatMetaLine(meta) || typeLabel}</p>
      </a>
    </article>
  `;
}

function renderRail(title: string, items: MetaItem[], catalog?: AddonCatalog): string {
  if (items.length === 0) return "";
  const railId = `rail-${catalog?.type ?? "mixed"}-${(catalog?.id ?? title).replace(/[^a-z0-9_-]+/gi, "-")}`;
  const link = catalog
    ? `<a class="rail-link" href="#/catalog/${encodeURIComponent(catalog.type)}/${encodeURIComponent(catalog.id)}">See all <i data-lucide="chevron-right"></i></a>`
    : "";
  return `
    <section class="rail-section">
      <div class="section-heading"><div><p class="eyebrow">Kotoko selection</p><h2>${escapeHtml(title)}</h2></div><div class="rail-tools"><div class="rail-buttons" aria-label="Scroll ${escapeHtml(title)}"><button class="rail-button" type="button" data-action="scroll-rail" data-target="${escapeHtml(railId)}" data-direction="-1" aria-label="Scroll ${escapeHtml(title)} left"><i data-lucide="chevron-left"></i></button><button class="rail-button" type="button" data-action="scroll-rail" data-target="${escapeHtml(railId)}" data-direction="1" aria-label="Scroll ${escapeHtml(title)} right"><i data-lucide="chevron-right"></i></button></div>${link}</div></div>
      <div class="poster-rail" id="${escapeHtml(railId)}">${items.map((item) => posterCard(item)).join("")}</div>
    </section>
  `;
}

function heroMarkup(meta: MetaItem): string {
  const backdrop = safeImageUrl(meta.background || meta.poster);
  const genres = meta.genres?.slice(0, 3).map((genre) => `<span>${escapeHtml(genre)}</span>`).join("") ?? "";
  return `
    <section class="hero" ${backdrop ? `data-backdrop="${backdrop}"` : ""}>
      <div class="hero-grain"></div>
      <div class="hero-content">
        <p class="eyebrow">Featured from the islands</p>
        <h1>${escapeHtml(meta.name)}</h1>
        <div class="hero-meta">${genres}${formatMetaLine(meta) ? `<span>${formatMetaLine(meta)}</span>` : ""}</div>
        <p class="hero-description">${escapeHtml(meta.description || "A featured title from your Filipino and Tagalog-dubbed catalog.")}</p>
        <div class="hero-actions">
          <a class="primary-button" href="${routeFor(meta)}"><i data-lucide="play"></i> View details</a>
          <button class="secondary-button" type="button" data-action="toggle-watchlist" data-type="${meta.type}" data-id="${escapeHtml(meta.id)}">
            <i data-lucide="${isInWatchlist(meta.id, meta.type) ? "check" : "plus"}"></i>${isInWatchlist(meta.id, meta.type) ? "In my list" : "My list"}
          </button>
        </div>
      </div>
      <div class="program-ticket" aria-hidden="true"><span>Now showing</span><strong>${meta.type === "series" ? "Series" : "Film"}</strong><small>${escapeHtml(String(meta.releaseInfo || meta.year || "Kotoko"))}</small></div>
    </section>
  `;
}

function applyBackdrops(): void {
  document.querySelectorAll<HTMLElement>("[data-backdrop]").forEach((element) => {
    const url = element.dataset.backdrop;
    if (url) element.style.backgroundImage = `url("${url.replaceAll('"', "%22")}")`;
  });
}

async function loadCatalog(catalog: AddonCatalog, skip = 0): Promise<MetaItem[]> {
  const key = `${catalog.type}:${catalog.id}:${skip}`;
  const existing = catalogCache.get(key);
  if (existing) return existing;
  const items = await getCatalog(catalog.type, catalog.id, { skip });
  for (const item of items) previewCache.set(mediaKey(item.type, item.id), item);
  catalogCache.set(key, items);
  return items;
}

async function renderHome(generation: number): Promise<void> {
  const main = mainElement();
  main.innerHTML = `
    <section class="hero hero-skeleton"><span class="spinner"></span></section>
    <section class="rail-section"><div class="section-heading"><h2>Loading your catalogs…</h2></div><div class="poster-rail">${skeletonCards()}</div></section>
  `;

  if (!manifest) return;
  const results = await Promise.allSettled(manifest.catalogs.map((catalog) => loadCatalog(catalog, 0)));
  if (generation !== routeGeneration) return;
  const loaded = manifest.catalogs.map((catalog, index) => ({
    catalog,
    items: results[index]?.status === "fulfilled" ? results[index].value : []
  }));
  const hero = loaded.find((entry) => entry.items.length > 0)?.items[0];
  const history = getHistory();
  const failedCatalogs = results.filter((result) => result.status === "rejected").length;

  if (!hero) {
    renderErrorState("This screen did not load", "The add-on catalogs returned no titles.", true);
    return;
  }

  const continueRail = history.length
    ? `<section class="rail-section"><div class="section-heading"><div><p class="eyebrow">Pick up where you stopped</p><h2>Continue watching</h2></div><a class="rail-link" href="#/library">History <i data-lucide="chevron-right"></i></a></div><div class="poster-rail">${history
        .slice(0, 12)
        .map((entry) => posterCard(entry.meta, entry.duration > 0 ? entry.currentTime / entry.duration : 0))
        .join("")}</div></section>`
    : "";

  const catalogNotice = failedCatalogs
    ? `<aside class="catalog-notice"><span><i data-lucide="circle-alert"></i><strong>${failedCatalogs} ${failedCatalogs === 1 ? "catalog is" : "catalogs are"} temporarily unavailable.</strong> Everything else is ready.</span><button class="text-button" type="button" data-action="retry">Retry</button></aside>`
    : "";
  main.innerHTML = `${heroMarkup(hero)}${catalogNotice}${continueRail}${loaded
    .map(({ catalog, items }) => renderRail(catalog.name, items, catalog))
    .join("")}`;
  applyBackdrops();
  refreshIcons();
}

function renderErrorState(title: string, detail: string, retry = false): void {
  mainElement().innerHTML = `
    <section class="error-state">
      <span class="error-icon"><i data-lucide="circle-alert"></i></span>
      <p class="eyebrow">Connection check</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
      ${retry ? `<button class="primary-button" type="button" data-action="retry"><i data-lucide="refresh-cw"></i> Try again</button>` : `<a class="primary-button" href="#/home"><i data-lucide="home"></i> Go home</a>`}
    </section>
  `;
  refreshIcons();
}

function findCatalog(type: string, id: string): AddonCatalog | undefined {
  return manifest?.catalogs.find((catalog) => catalog.type === type && catalog.id === id);
}

async function renderCatalog(type: string, id: string, generation: number): Promise<void> {
  const catalog = findCatalog(type, id);
  if (!catalog) {
    renderErrorState("Catalog not found", "This catalog is not part of the installed add-on.");
    return;
  }
  const main = mainElement();
  main.innerHTML = `<section class="page"><div class="page-heading"><a href="#/home" class="back-link"><i data-lucide="arrow-left"></i> Home</a><p class="eyebrow">${escapeHtml(catalog.type)}</p><h1>${escapeHtml(catalog.name)}</h1></div><div class="poster-grid">${skeletonCards(10)}</div></section>`;
  refreshIcons();
  try {
    const items = await loadCatalog(catalog, 0);
    if (generation !== routeGeneration) return;
    main.innerHTML = `
      <section class="page">
        <div class="page-heading"><a href="#/home" class="back-link"><i data-lucide="arrow-left"></i> Home</a><p class="eyebrow">${escapeHtml(catalog.type)}</p><h1>${escapeHtml(catalog.name)}</h1><p>${items.length} titles loaded</p></div>
        <div class="poster-grid" id="catalog-grid">${items.map((item) => posterCard(item)).join("")}</div>
        ${items.length > 0 ? `<div class="load-more-wrap"><button class="secondary-button" type="button" data-action="load-more" data-type="${catalog.type}" data-id="${escapeHtml(catalog.id)}" data-skip="${items.length}">Load more</button></div>` : `<div class="empty-state"><h2>No titles found</h2><p>The add-on returned an empty catalog.</p></div>`}
      </section>
    `;
    refreshIcons();
  } catch (error) {
    renderErrorState("Catalog unavailable", error instanceof Error ? error.message : "The catalog could not be loaded.", true);
  }
}

async function loadMore(button: HTMLButtonElement): Promise<void> {
  const type = button.dataset.type ?? "";
  const id = button.dataset.id ?? "";
  const skip = Number(button.dataset.skip ?? "0");
  const catalog = findCatalog(type, id);
  const grid = document.querySelector<HTMLElement>("#catalog-grid");
  if (!catalog || !grid || !Number.isFinite(skip)) return;
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    const items = await loadCatalog(catalog, skip);
    grid.insertAdjacentHTML("beforeend", items.map((item) => posterCard(item)).join(""));
    if (items.length === 0) button.remove();
    else {
      button.dataset.skip = String(skip + items.length);
      button.disabled = false;
      button.textContent = "Load more";
    }
    refreshIcons();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try loading more";
    toast(error instanceof Error ? error.message : "Could not load more titles");
  }
}

function parseEpisodeNumbers(video: VideoItem): { season: number; episode: number } {
  const parts = video.id.split(":");
  const fallbackSeason = Number(parts.at(-2) ?? "0");
  const fallbackEpisode = Number(parts.at(-1) ?? "0");
  return {
    season: video.season ?? (Number.isFinite(fallbackSeason) ? fallbackSeason : 0),
    episode: video.episode ?? video.number ?? (Number.isFinite(fallbackEpisode) ? fallbackEpisode : 0)
  };
}

function airedVideos(videos: VideoItem[] = []): VideoItem[] {
  const now = Date.now();
  return videos.filter((video) => {
    if (!video.released) return true;
    const released = Date.parse(video.released);
    return Number.isNaN(released) || released <= now;
  });
}

function episodeLabel(video: VideoItem): string {
  const numbers = parseEpisodeNumbers(video);
  return `S${numbers.season} E${numbers.episode}${video.title || video.name ? ` · ${video.title || video.name}` : ""}`;
}

function detailMarkup(meta: MetaItem): string {
  const backdrop = safeImageUrl(meta.background || meta.poster);
  const poster = safeImageUrl(meta.poster);
  const watchlisted = isInWatchlist(meta.id, meta.type);
  const videos = airedVideos(meta.videos);
  const historyVideo = getHistory().find((entry) => entry.meta.id === meta.id && entry.meta.type === meta.type)?.videoId;
  const seasons = [...new Set(videos.map((video) => parseEpisodeNumbers(video).season))].filter((season) => season > 0).sort((a, b) => a - b);
  const selectedSeason = videos.find((video) => video.id === historyVideo)
    ? parseEpisodeNumbers(videos.find((video) => video.id === historyVideo)!).season
    : seasons[0];
  const selectedVideo = videos.find((video) => video.id === historyVideo) ?? videos.find((video) => parseEpisodeNumbers(video).season === selectedSeason);
  const videoId = meta.type === "movie" ? meta.id : selectedVideo?.id ?? "";

  const seriesControls = meta.type === "series"
    ? `<div class="episode-panel">
        <div class="episode-controls">
          <label><span>Season</span><select id="season-select">${seasons.map((season) => `<option value="${season}" ${season === selectedSeason ? "selected" : ""}>Season ${season}</option>`).join("")}</select></label>
          <label><span>Episode</span><select id="episode-select">${videos
            .filter((video) => parseEpisodeNumbers(video).season === selectedSeason)
            .map((video) => `<option value="${escapeHtml(video.id)}" ${video.id === selectedVideo?.id ? "selected" : ""}>${escapeHtml(episodeLabel(video))}</option>`)
            .join("")}</select></label>
        </div>
        <div id="episode-preview">${selectedVideo ? episodePreview(selectedVideo) : `<p class="muted">No aired episodes are available.</p>`}</div>
      </div>`
    : "";

  return `
    <section class="detail-hero" ${backdrop ? `data-backdrop="${backdrop}"` : ""}>
      <a href="#/home" class="back-link detail-back"><i data-lucide="arrow-left"></i> Back</a>
      <div class="detail-layout">
        <div class="detail-poster">${poster ? `<img src="${poster}" alt="Poster for ${escapeHtml(meta.name)}" width="400" height="600" />` : `<div class="poster-fallback"><i data-lucide="film"></i></div>`}</div>
        <div class="detail-copy">
          <p class="eyebrow">${meta.type === "series" ? "Filipino series" : "Filipino cinema"}</p>
          <h1>${escapeHtml(meta.name)}</h1>
          <p class="detail-meta">${formatMetaLine(meta)}</p>
          <div class="genre-row">${(meta.genres ?? []).map((genre) => `<span>${escapeHtml(genre)}</span>`).join("")}</div>
          <p class="detail-description">${escapeHtml(meta.description || "No synopsis is available for this title.")}</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-action="play" data-video-id="${escapeHtml(videoId)}" ${videoId ? "" : "disabled"}><i data-lucide="play"></i>${historyVideo ? "Resume" : "Play"}</button>
            <button class="secondary-button" type="button" data-action="toggle-watchlist" data-type="${meta.type}" data-id="${escapeHtml(meta.id)}"><i data-lucide="${watchlisted ? "check" : "plus"}"></i>${watchlisted ? "In my list" : "My list"}</button>
          </div>
          ${seriesControls}
        </div>
      </div>
    </section>
  `;
}

function episodePreview(video: VideoItem): string {
  const thumb = safeImageUrl(video.thumbnail);
  const airDateLabel = video.released && !Number.isNaN(Date.parse(video.released))
    ? `Aired ${new Date(video.released).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
    : "Air date unavailable";
  return `<article class="episode-preview">${thumb ? `<img src="${thumb}" alt="" loading="lazy" width="320" height="180" />` : `<div class="episode-placeholder"><i data-lucide="tv"></i></div>`}<div><p class="eyebrow">${escapeHtml(episodeLabel(video))}</p><h3>${escapeHtml(video.title || video.name || `Episode ${parseEpisodeNumbers(video).episode}`)}</h3><p class="episode-date">${escapeHtml(airDateLabel)}</p><p class="episode-overview">${escapeHtml(video.overview || "No episode summary is available yet.")}</p></div></article>`;
}

async function renderDetail(type: string, id: string, generation: number): Promise<void> {
  const preview = previewCache.get(mediaKey(type, id));
  const main = mainElement();
  let meta: MetaItem;
  main.innerHTML = `<section class="detail-loading"><span class="spinner"></span><p>Loading details…</p></section>`;
  try {
    meta = await getMeta(type, id);
  } catch (error) {
    if (!preview) {
      if (generation !== routeGeneration) return;
      renderErrorState("Details unavailable", error instanceof Error ? error.message : "This title could not be loaded.");
      return;
    }
    meta = preview;
    toast("Showing catalog details; full metadata is unavailable.");
  }
  if (generation !== routeGeneration) return;
  currentMeta = meta;
  main.innerHTML = detailMarkup(meta);
  applyBackdrops();
  refreshIcons();
}

type SearchType = "all" | "movie" | "series";
type SearchSort = "relevance" | "newest" | "rating" | "title";

function searchControls(query: string, type: SearchType, sort: SearchSort): string {
  const filters: Array<{ value: SearchType; label: string }> = [
    { value: "all", label: "All" },
    { value: "movie", label: "Movies" },
    { value: "series", label: "Series" }
  ];
  return `<div class="search-controls"><div class="filter-chips" aria-label="Filter search results">${filters
    .map(({ value, label }) => {
      const params = new URLSearchParams({ q: query });
      if (value !== "all") params.set("type", value);
      if (sort !== "relevance") params.set("sort", sort);
      return `<a href="#/search?${params.toString()}" class="filter-chip ${value === type ? "is-active" : ""}" ${value === type ? 'aria-current="true"' : ""}>${label}</a>`;
    })
    .join("")}</div><label class="sort-control"><span>Sort</span><select id="search-sort"><option value="relevance" ${sort === "relevance" ? "selected" : ""}>Best match</option><option value="newest" ${sort === "newest" ? "selected" : ""}>Newest</option><option value="rating" ${sort === "rating" ? "selected" : ""}>Highest rated</option><option value="title" ${sort === "title" ? "selected" : ""}>Title A–Z</option></select></label></div>`;
}

function metaYear(meta: MetaItem): number {
  const match = String(meta.releaseInfo || meta.year || "").match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

function setSearchSortValue(sort: SearchSort): void {
  const select = document.querySelector<HTMLSelectElement>("#search-sort");
  if (select) select.value = sort;
}

async function renderSearch(query: string, type: SearchType, sort: SearchSort, generation: number): Promise<void> {
  const main = mainElement();
  const input = document.querySelector<HTMLInputElement>("#search-input");
  if (input) input.value = query;
  if (query.trim().length < 2) {
    main.innerHTML = `<section class="search-empty"><span class="search-orbit"><i data-lucide="search"></i></span><p class="eyebrow">Search the collection</p><h1>What are you watching?</h1><p>Type at least two letters. Kotoko will check its Filipino and Tagalog-dubbed catalogs.</p></section>`;
    refreshIcons();
    return;
  }

  main.innerHTML = `<section class="page"><div class="page-heading"><p class="eyebrow">Searching every catalog</p><h1>Results for “${escapeHtml(query)}”</h1>${searchControls(query, type, sort)}</div><div class="poster-grid">${skeletonCards(10)}</div></section>`;
  setSearchSortValue(sort);
  if (!manifest) return;

  const catalogs = type === "all" ? manifest.catalogs : manifest.catalogs.filter((catalog) => catalog.type === type);
  const tasks = catalogs.flatMap((catalog) => [0, 20, 40].map((skip) => loadCatalog(catalog, skip)));
  const settled = await Promise.allSettled(tasks);
  if (generation !== routeGeneration) return;
  const unique = new Map<string, MetaItem>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) unique.set(mediaKey(item.type, item.id), item);
  }
  const normalized = query.trim().toLocaleLowerCase();
  const matches = [...unique.values()].filter((item) => item.name.toLocaleLowerCase().includes(normalized));
  matches.sort((a, b) => {
    if (sort === "newest") return metaYear(b) - metaYear(a) || a.name.localeCompare(b.name);
    if (sort === "rating") return Number(b.imdbRating || 0) - Number(a.imdbRating || 0) || a.name.localeCompare(b.name);
    if (sort === "title") return a.name.localeCompare(b.name);
    const aName = a.name.toLocaleLowerCase();
    const bName = b.name.toLocaleLowerCase();
    return aName.indexOf(normalized) - bName.indexOf(normalized) || aName.localeCompare(bName);
  });
  main.innerHTML = `<section class="page"><div class="page-heading"><p class="eyebrow">${matches.length} ${matches.length === 1 ? "match" : "matches"}</p><h1>Results for “${escapeHtml(query)}”</h1><p>Search covers the first 60 titles from each matching catalog.</p>${searchControls(query, type, sort)}</div>${matches.length ? `<div class="poster-grid">${matches.map((item) => posterCard(item)).join("")}</div>` : `<div class="empty-state"><h2>No matching title</h2><p>Try a shorter title or browse a catalog from Home.</p></div>`}</section>`;
  setSearchSortValue(sort);
  refreshIcons();
}

function renderLibrary(): void {
  const watchlist = getWatchlist();
  const history = getHistory();
  const historyCards = history
    .map((entry) => posterCard(entry.meta, entry.duration > 0 ? entry.currentTime / entry.duration : 0))
    .join("");
  mainElement().innerHTML = `
    <section class="page library-page">
      <div class="page-heading"><p class="eyebrow">Saved on this device</p><h1>My library</h1><p>Your list and playback progress stay in this browser.</p></div>
      <section class="library-block"><div class="section-heading"><div><p class="eyebrow">Saved titles</p><h2>My list</h2></div></div>${watchlist.length ? `<div class="poster-grid">${watchlist.map((item) => posterCard(item)).join("")}</div>` : `<div class="empty-state compact"><h3>Your list is empty</h3><p>Add a title to keep it close.</p></div>`}</section>
      <section class="library-block"><div class="section-heading"><div><p class="eyebrow">Playback progress</p><h2>Continue watching</h2></div>${history.length ? `<button type="button" class="danger-button" data-action="clear-history"><i data-lucide="trash-2"></i> Clear history</button>` : ""}</div>${history.length ? `<div class="poster-grid">${historyCards}</div>` : `<div class="empty-state compact"><h3>No watch history</h3><p>Started videos will appear here.</p></div>`}</section>
    </section>
  `;
  refreshIcons();
}

function parseRoute(): { name: string; parts: string[]; query: URLSearchParams } {
  const raw = location.hash.startsWith("#/") ? location.hash.slice(2) : "home";
  const [path = "home", query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "home", parts, query: new URLSearchParams(query) };
}

async function renderRoute(): Promise<void> {
  const generation = ++routeGeneration;
  window.scrollTo({ top: 0, behavior: "auto" });
  const route = parseRoute();
  document.body.dataset.route = route.name;
  setActiveNavigation(route);
  if (route.name !== "search") {
    const searchInput = document.querySelector<HTMLInputElement>("#search-input");
    if (searchInput) searchInput.value = "";
  }
  if (!manifest) return;
  if (route.name === "home") await renderHome(generation);
  else if (route.name === "catalog" && route.parts[1] && route.parts[2]) await renderCatalog(route.parts[1], route.parts[2], generation);
  else if (route.name === "detail" && route.parts[1] && route.parts[2]) await renderDetail(route.parts[1], route.parts[2], generation);
  else if (route.name === "search") {
    const typeValue = route.query.get("type");
    const sortValue = route.query.get("sort");
    const type: SearchType = typeValue === "movie" || typeValue === "series" ? typeValue : "all";
    const sort: SearchSort =
      sortValue === "newest" || sortValue === "rating" || sortValue === "title" ? sortValue : "relevance";
    await renderSearch(route.query.get("q") ?? "", type, sort, generation);
  }
  else if (route.name === "library") renderLibrary();
  else renderErrorState("Page not found", "That screen does not exist.");
}

function updateEpisodeOptions(season: number): void {
  if (!currentMeta) return;
  const videos = airedVideos(currentMeta.videos).filter((video) => parseEpisodeNumbers(video).season === season);
  const select = document.querySelector<HTMLSelectElement>("#episode-select");
  if (!select) return;
  select.innerHTML = videos.map((video) => `<option value="${escapeHtml(video.id)}">${escapeHtml(episodeLabel(video))}</option>`).join("");
  const first = videos[0];
  const preview = document.querySelector<HTMLElement>("#episode-preview");
  const playButton = document.querySelector<HTMLButtonElement>("[data-action='play']");
  if (preview) preview.innerHTML = first ? episodePreview(first) : `<p class="muted">No aired episodes are available.</p>`;
  if (playButton) {
    playButton.dataset.videoId = first?.id ?? "";
    playButton.disabled = !first;
  }
  refreshIcons();
}

function updateEpisodePreview(videoId: string): void {
  const video = airedVideos(currentMeta?.videos).find((item) => item.id === videoId);
  const preview = document.querySelector<HTMLElement>("#episode-preview");
  const playButton = document.querySelector<HTMLButtonElement>("[data-action='play']");
  if (preview && video) preview.innerHTML = episodePreview(video);
  if (playButton) {
    playButton.dataset.videoId = videoId;
    playButton.disabled = !videoId;
  }
  refreshIcons();
}

function playerDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>("#player-dialog");
  if (!dialog) throw new Error("Player dialog not found");
  return dialog;
}

function setPlayerStatus(label: string, tone: "neutral" | "good" | "warning" = "neutral"): void {
  const status = document.querySelector<HTMLElement>("#player-status");
  if (!status) return;
  status.textContent = label;
  status.dataset.tone = tone;
}

function episodeSequence(): VideoItem[] {
  return airedVideos(currentMeta?.videos).sort((a, b) => {
    const first = parseEpisodeNumbers(a);
    const second = parseEpisodeNumbers(b);
    return first.season - second.season || first.episode - second.episode;
  });
}

function updatePlayerEpisodeButtons(): void {
  const episodes = currentMeta?.type === "series" ? episodeSequence() : [];
  const index = episodes.findIndex((video) => video.id === currentVideoId);
  const previous = document.querySelector<HTMLButtonElement>("#previous-episode");
  const next = document.querySelector<HTMLButtonElement>("#next-episode");
  if (previous) {
    previous.disabled = index <= 0;
    previous.title = index > 0 ? `Play ${episodeLabel(episodes[index - 1]!)}` : "No previous episode";
  }
  if (next) {
    next.disabled = index < 0 || index >= episodes.length - 1;
    next.title = index >= 0 && index < episodes.length - 1 ? `Play ${episodeLabel(episodes[index + 1]!)}` : "No next episode";
  }
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("previoustrack", index > 0 ? () => void playAdjacentEpisode(-1) : null);
      navigator.mediaSession.setActionHandler(
        "nexttrack",
        index >= 0 && index < episodes.length - 1 ? () => void playAdjacentEpisode(1) : null
      );
    } catch {
      // Some browsers expose Media Session but not every action handler.
    }
  }
}

function syncEpisodeControls(videoId: string): void {
  const episode = airedVideos(currentMeta?.videos).find((video) => video.id === videoId);
  if (!episode) return;
  const numbers = parseEpisodeNumbers(episode);
  const seasonSelect = document.querySelector<HTMLSelectElement>("#season-select");
  if (seasonSelect && Number(seasonSelect.value) !== numbers.season) {
    seasonSelect.value = String(numbers.season);
    updateEpisodeOptions(numbers.season);
  }
  const episodeSelect = document.querySelector<HTMLSelectElement>("#episode-select");
  if (episodeSelect) episodeSelect.value = videoId;
  updateEpisodePreview(videoId);
}

function updateDownloadLink(stream?: StreamItem): void {
  const link = document.querySelector<HTMLAnchorElement>("#download-link");
  if (!link) return;
  const download = stream ? getDownloadInfo(stream) : null;
  link.classList.toggle("is-hidden", !download);
  link.setAttribute("aria-disabled", String(!download));
  if (!download) {
    link.href = "#";
    link.removeAttribute("download");
    link.title = "This source is not a direct downloadable media file";
    return;
  }
  link.href = download.url;
  link.download = download.filename;
  link.title = `${download.filename}${download.size ? ` · ${formatBytes(download.size)}` : ""}`;
}

function saveCurrentProgress(): void {
  const video = document.querySelector<HTMLVideoElement>("#video");
  if (!video || !currentMeta || !currentVideoId) return;
  saveProgress({
    meta: { ...currentMeta, videos: undefined },
    videoId: currentVideoId,
    episodeLabel: currentEpisodeLabel,
    currentTime: video.currentTime,
    duration: video.duration || 0,
    updatedAt: Date.now()
  });
}

async function openPlayer(videoId: string): Promise<void> {
  if (!currentMeta || !videoId) return;
  const requestId = ++playerRequestId;
  saveCurrentProgress();
  player.destroy();
  const videoElement = document.querySelector<HTMLVideoElement>("#video");
  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();
  }
  currentVideoId = videoId;
  const episode = airedVideos(currentMeta.videos).find((video) => video.id === videoId);
  currentEpisodeLabel = episode ? episodeLabel(episode) : "";
  if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
    const artwork = safeHttpsUrl(currentMeta.poster);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentMeta.name,
      artist: currentEpisodeLabel || (currentMeta.type === "series" ? "Kotoko series" : "Kotoko film"),
      album: "Kotoko — Pinoy screen",
      artwork: artwork ? [{ src: artwork }] : []
    });
  }
  const title = document.querySelector<HTMLElement>("#player-title");
  const subtitle = document.querySelector<HTMLElement>("#player-subtitle");
  const state = document.querySelector<HTMLElement>("#player-state");
  const list = document.querySelector<HTMLElement>("#source-list");
  if (title) title.textContent = currentMeta.name;
  if (subtitle) subtitle.textContent = currentEpisodeLabel;
  if (state) state.innerHTML = `<span class="spinner"></span><p>Finding playable sources…</p>`;
  if (list) list.innerHTML = "";
  setPlayerStatus("Finding sources");
  updateDownloadLink();
  syncEpisodeControls(videoId);
  updatePlayerEpisodeButtons();
  const dialog = playerDialog();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("player-open");

  try {
    const [streamsResult, subtitlesResult] = await Promise.allSettled([
      getStreams(currentMeta.type, videoId),
      getSubtitles(currentMeta.type, videoId)
    ]);
    currentStreams = streamsResult.status === "fulfilled" ? streamsResult.value : [];
    currentSubtitles = subtitlesResult.status === "fulfilled" ? subtitlesResult.value : [];
    if (requestId !== playerRequestId || !dialog.open) return;
    if (currentStreams.length === 0) throw new Error("The add-on returned no sources for this title.");
    renderSourceList(currentStreams);
    const remembered = getLastStreamName();
    const preferredIndex = currentStreams.findIndex(
      (stream, index) => getStreamKind(stream) === "direct" && streamLabel(stream, index) === remembered
    );
    const firstDirect = currentStreams.findIndex((stream) => getStreamKind(stream) === "direct");
    const index = preferredIndex >= 0 ? preferredIndex : firstDirect;
    if (index < 0) {
      setPlayerStatus("No web source", "warning");
      showPlayerMessage("No direct browser stream", "This result only contains torrent, app-only or external sources.");
      return;
    }
    await selectStream(index);
  } catch (error) {
    if (requestId !== playerRequestId) return;
    setPlayerStatus("Unavailable", "warning");
    showPlayerMessage("Playback unavailable", error instanceof Error ? error.message : "No stream could be loaded.");
  }
}

function renderSourceList(streams: StreamItem[]): void {
  const list = document.querySelector<HTMLElement>("#source-list");
  if (!list) return;
  list.innerHTML = streams
    .map((stream, index) => {
      const kind = getStreamKind(stream);
      const detail = streamDetail(stream);
      const badge = kind === "direct" ? (getDownloadInfo(stream) ? "File" : "Web") : kind === "external" ? "Open" : kind === "torrent" ? "App" : kind;
      return `<button class="source-button ${kind === "direct" ? "" : "is-limited"}" type="button" data-action="select-source" data-index="${index}" data-kind="${kind}"><span><strong>${escapeHtml(streamLabel(stream, index))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span><em>${escapeHtml(badge)}</em></button>`;
    })
    .join("");
  refreshIcons();
}

function showPlayerMessage(title: string, detail: string): void {
  const state = document.querySelector<HTMLElement>("#player-state");
  if (!state) return;
  state.classList.add("is-visible");
  const hasDirectSource = currentStreams.some((stream) => getStreamKind(stream) === "direct");
  state.innerHTML = `<span class="error-icon small"><i data-lucide="circle-alert"></i></span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${hasDirectSource ? `<div class="player-state-actions"><button class="secondary-button" type="button" data-action="retry-source"><i data-lucide="refresh-cw"></i> Retry</button><button class="primary-button" type="button" data-action="try-next"><i data-lucide="skip-forward"></i> Next source</button></div>` : ""}`;
  refreshIcons();
}

async function selectStream(index: number): Promise<void> {
  const stream = currentStreams[index];
  if (!stream || !currentMeta) return;
  const kind = getStreamKind(stream);
  if (kind === "external" && stream.externalUrl) {
    try {
      const target = new URL(stream.externalUrl);
      if (target.protocol !== "https:") throw new Error("External links must use HTTPS.");
      window.open(target.href, "_blank", "noopener,noreferrer");
    } catch {
      showPlayerMessage("Unsafe external link", "This source returned an invalid or insecure destination.");
    }
    return;
  }
  if (kind !== "direct") {
    showPlayerMessage("App-only source", kind === "torrent" ? "Torrent streams require a native Stremio-compatible client." : "This source cannot play inside a web browser.");
    return;
  }

  currentStreamIndex = index;
  setPlayerStatus(`Source ${index + 1} of ${currentStreams.length}`);
  document.querySelectorAll<HTMLElement>(".source-button").forEach((button) =>
    button.classList.toggle("is-active", Number(button.dataset.index) === index)
  );
  setLastStreamName(streamLabel(stream, index));
  updateDownloadLink(stream);
  const state = document.querySelector<HTMLElement>("#player-state");
  if (state) {
    state.classList.remove("is-visible");
    state.replaceChildren();
  }
  const video = document.querySelector<HTMLVideoElement>("#video");
  if (!video) return;
  video.volume = playerSettings.volume;
  video.muted = playerSettings.muted;
  video.playbackRate = playerSettings.playbackRate;
  const history = getHistory().find(
    (entry) => entry.meta.id === currentMeta?.id && entry.meta.type === currentMeta?.type && entry.videoId === currentVideoId
  );
  const subtitles = stream.subtitles?.length ? stream.subtitles : currentSubtitles;
  try {
    await player.attach(
      video,
      stream,
      subtitles,
      history?.currentTime ?? 0,
      (currentTime, duration) => {
        if (!currentMeta || Date.now() - lastProgressSave < 5000) return;
        lastProgressSave = Date.now();
        saveProgress({
          meta: { ...currentMeta, videos: undefined },
          videoId: currentVideoId,
          episodeLabel: currentEpisodeLabel,
          currentTime,
          duration,
          updatedAt: Date.now()
        });
      },
      (message) => {
        setPlayerStatus("Source failed", "warning");
        showPlayerMessage("Source failed", message);
      },
      (status) => {
        if (status === "playing") setPlayerStatus(`Playing source ${index + 1}`, "good");
        else if (status === "buffering") setPlayerStatus("Buffering", "warning");
        else if (status === "paused") setPlayerStatus("Paused");
        else if (status === "ended") setPlayerStatus("Finished", "good");
        else setPlayerStatus("Loading video");
      }
    );
  } catch (error) {
    setPlayerStatus("Unavailable", "warning");
    showPlayerMessage("Source unavailable", error instanceof Error ? error.message : "This source cannot be played.");
  }
}

async function tryNextSource(): Promise<void> {
  if (currentStreams.length === 0) return;
  for (let offset = 1; offset <= currentStreams.length; offset += 1) {
    const index = (Math.max(currentStreamIndex, -1) + offset) % currentStreams.length;
    if (getStreamKind(currentStreams[index]!) === "direct") {
      await selectStream(index);
      return;
    }
  }
  showPlayerMessage("No other web source", "The remaining sources require a native app.");
}

async function playAdjacentEpisode(direction: -1 | 1): Promise<void> {
  const episodes = episodeSequence();
  const index = episodes.findIndex((video) => video.id === currentVideoId);
  const target = episodes[index + direction];
  if (!target) return;
  await openPlayer(target.id);
}

async function enterFullscreen(): Promise<void> {
  const video = document.querySelector<HTMLVideoElement>("#video");
  if (!video) return;
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else {
      const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      iosVideo.webkitEnterFullscreen?.();
    }
  } catch {
    toast("Fullscreen is unavailable in this browser");
  }
}

function closePlayer(): void {
  if (closingPlayer) return;
  closingPlayer = true;
  playerRequestId += 1;
  saveCurrentProgress();
  player.destroy();
  const video = document.querySelector<HTMLVideoElement>("#video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  const dialog = playerDialog();
  if (dialog.open) dialog.close();
  document.body.classList.remove("player-open");
  currentStreams = [];
  currentSubtitles = [];
  currentStreamIndex = -1;
  updateDownloadLink();
  setPlayerStatus("Closed");
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    try {
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    } catch {
      // Media Session actions are optional across browsers.
    }
  }
  closingPlayer = false;
}

function setupPlayerEvents(): void {
  const dialog = playerDialog();
  const video = document.querySelector<HTMLVideoElement>("#video");
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closePlayer();
  });
  dialog.addEventListener("close", () => {
    if (document.body.classList.contains("player-open")) closePlayer();
  });
  video?.addEventListener("volumechange", () => {
    playerSettings.volume = video.volume;
    playerSettings.muted = video.muted;
    savePlayerSettings(playerSettings);
  });
  video?.addEventListener("ratechange", () => {
    playerSettings.playbackRate = video.playbackRate;
    savePlayerSettings(playerSettings);
  });
}

async function initialize(): Promise<void> {
  renderShell();
  setupPlayerEvents();
  setNetworkBadge(navigator.onLine);
  mainElement().innerHTML = `<section class="boot-screen"><span class="brand-mark large"><span>K</span></span><span class="spinner"></span><p>Opening your screen…</p></section>`;
  try {
    manifest = await getManifest();
    const brandName = document.querySelector<HTMLElement>(".brand-copy strong");
    if (brandName) brandName.textContent = manifest.name || "Kotoko";
    await renderRoute();
  } catch (error) {
    renderErrorState("Kotoko could not connect", error instanceof Error ? error.message : "The add-on is unavailable.", true);
  }
}

root.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "retry") {
    clearApiCache();
    catalogCache.clear();
    void initialize();
  } else if (action === "load-more") void loadMore(button);
  else if (action === "scroll-rail") {
    const rail = document.getElementById(button.dataset.target ?? "");
    rail?.scrollBy({ left: rail.clientWidth * 0.82 * Number(button.dataset.direction ?? "1"), behavior: "smooth" });
  }
  else if (action === "toggle-watchlist") {
    const meta = currentMeta?.id === button.dataset.id
      ? currentMeta
      : previewCache.get(mediaKey(button.dataset.type ?? "", button.dataset.id ?? ""));
    if (!meta) return;
    const added = toggleWatchlist(meta);
    toast(added ? "Added to My list" : "Removed from My list");
    if (parseRoute().name === "library") renderLibrary();
    else if (parseRoute().name === "detail") mainElement().innerHTML = detailMarkup(meta);
    else void renderRoute();
    applyBackdrops();
    refreshIcons();
  } else if (action === "play") void openPlayer(button.dataset.videoId ?? "");
  else if (action === "close-player") closePlayer();
  else if (action === "select-source") void selectStream(Number(button.dataset.index ?? "-1"));
  else if (action === "try-next") void tryNextSource();
  else if (action === "retry-source" && currentStreamIndex >= 0) void selectStream(currentStreamIndex);
  else if (action === "previous-episode") void playAdjacentEpisode(-1);
  else if (action === "next-episode") void playAdjacentEpisode(1);
  else if (action === "fullscreen") void enterFullscreen();
  else if (action === "clear-history") {
    clearHistory();
    renderLibrary();
    toast("Watch history cleared");
  }
});

root.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id === "season-select") updateEpisodeOptions(Number(target.value));
  if (target.id === "episode-select") updateEpisodePreview(target.value);
  if (target.id === "search-sort") {
    const route = parseRoute();
    route.query.set("sort", target.value);
    if (target.value === "relevance") route.query.delete("sort");
    location.hash = `#/search?${route.query.toString()}`;
  }
});

root.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id !== "search-form") return;
  event.preventDefault();
  const data = new FormData(form);
  const query = String(data.get("q") ?? "").trim();
  location.hash = query ? `#/search?q=${encodeURIComponent(query)}` : "#/search";
});

window.addEventListener("hashchange", () => void renderRoute());
window.addEventListener("online", () => setNetworkBadge(true));
window.addEventListener("offline", () => setNetworkBadge(false));
window.addEventListener("pagehide", () => {
  saveCurrentProgress();
  player.destroy();
});

void initialize();

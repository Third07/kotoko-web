/** @vitest-environment happy-dom */

import { beforeAll, describe, expect, it, vi } from "vitest";

const movie = {
  id: "tt0000001",
  type: "movie" as const,
  name: "Isla Nights",
  description: "A coastal homecoming story.",
  releaseInfo: "2026"
};

const series = {
  id: "tt0000002",
  type: "series" as const,
  name: "Barangay Stories",
  description: "Neighbors and second chances.",
  videos: [
    { id: "tt0000002:1:1", season: 1, episode: 1, title: "The New Neighbor", released: "2026-01-01" },
    { id: "tt0000002:1:2", season: 1, episode: 2, title: "Karaoke Night", released: "2026-02-01" },
    { id: "tt0000002:1:3", season: 1, episode: 3, title: "Future Episode", released: "2099-01-01" }
  ]
};

vi.mock("../src/api", () => ({
  clearApiCache: vi.fn(),
  getManifest: vi.fn(async () => ({
    id: "test.kotoko",
    version: "1.0.0",
    name: "Kotoko",
    types: ["movie", "series"],
    resources: ["catalog", "meta", "stream", "subtitles"],
    catalogs: [
      { type: "movie", id: "latest_movies", name: "Tagalog Dubbed Movies" },
      { type: "series", id: "top_series", name: "Filipino Series" }
    ]
  })),
  getCatalog: vi.fn(async (type: string, _id: string, extras: { skip?: number }) => {
    if ((extras.skip ?? 0) > 0) return [];
    return type === "series" ? [series] : [movie];
  }),
  getMeta: vi.fn(async (type: string) => (type === "series" ? series : movie)),
  getStreams: vi.fn(async () => [
    { name: "Kotoko HD", title: "1080p", url: "https://media.example/movie.m3u8" },
    { name: "Kotoko file", title: "1080p MKV", url: "https://media.example/movie.mkv" },
    { name: "Native only", infoHash: "0123456789abcdef" }
  ]),
  getSubtitles: vi.fn(async () => [])
}));

vi.mock("../src/player", () => ({
  MediaPlayer: class {
    destroy(): void {}
    async attach(): Promise<void> {}
  },
  getStreamKind: (stream: { url?: string; externalUrl?: string; infoHash?: string }) =>
    stream.url ? "direct" : stream.externalUrl ? "external" : stream.infoHash ? "torrent" : "unsupported",
  getDownloadInfo: (stream: { url?: string }) =>
    stream.url?.endsWith(".m3u8") ? null : stream.url ? { url: stream.url, filename: "video.mp4" } : null,
  streamLabel: (stream: { name?: string; title?: string }, index: number) => stream.name || stream.title || `Source ${index + 1}`,
  streamDetail: (stream: { title?: string }) => stream.title || ""
}));

async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await Promise.resolve();
}

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true });
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
  await import("../src/main");
  await vi.waitFor(() => expect(document.querySelector(".hero h1")?.textContent).toBe("Isla Nights"));
});

describe("Kotoko frontend", () => {
  it("renders add-on catalogs and featured metadata", () => {
    expect(document.body.textContent).toContain("Tagalog Dubbed Movies");
    expect(document.body.textContent).toContain("Filipino Series");
    expect(document.querySelectorAll(".poster-card").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll(".mobile-nav a")).toHaveLength(5);
    expect(document.querySelector(".desktop-nav [aria-current='page']")?.textContent).toBe("Home");
  });

  it("excludes unaired series episodes and renders playable sources", async () => {
    await go("#/detail/series/tt0000002");
    await vi.waitFor(() => expect(document.querySelector(".detail-copy h1")?.textContent).toBe("Barangay Stories"));

    const episodeText = [...document.querySelectorAll("#episode-select option")].map((option) => option.textContent);
    expect(episodeText).toHaveLength(2);
    expect(episodeText.join(" ")).not.toContain("Future Episode");

    document.querySelector<HTMLButtonElement>("[data-action='play']")?.click();
    await vi.waitFor(() => expect(document.querySelectorAll(".source-button")).toHaveLength(3));
    expect(document.querySelector("#player-dialog")?.hasAttribute("open")).toBe(true);
    expect(document.body.textContent).toContain("Kotoko HD");
    expect(document.body.textContent).toContain("Native only");
    expect(document.querySelector("#download-link")?.classList.contains("is-hidden")).toBe(true);

    document.querySelector<HTMLButtonElement>(".source-button[data-index='1']")?.click();
    await vi.waitFor(() => expect(document.querySelector("#download-link")?.classList.contains("is-hidden")).toBe(false));
    expect(document.querySelector<HTMLAnchorElement>("#download-link")?.download).toBe("video.mp4");
    expect(document.querySelector<HTMLButtonElement>("#next-episode")?.disabled).toBe(false);

    document.querySelector<HTMLButtonElement>("#next-episode")?.click();
    await vi.waitFor(() => expect(document.querySelector("#player-subtitle")?.textContent).toContain("S1 E2"));

    document.querySelector("#player-dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.querySelector("#player-dialog")?.hasAttribute("open")).toBe(false);
    expect(document.body.classList.contains("player-open")).toBe(false);
  });

  it("filters and sorts search results through URL state", async () => {
    await go("#/search?q=Isla&type=movie&sort=title");
    await vi.waitFor(() => expect(document.querySelector(".page-heading h1")?.textContent).toContain("Isla"));
    expect(document.querySelector(".filter-chip.is-active")?.textContent).toBe("Movies");
    expect((document.querySelector("#search-sort") as HTMLSelectElement | null)?.value).toBe("title");
    expect(document.querySelector("#main-content")?.textContent).toContain("Isla Nights");
    expect(document.querySelector("#main-content")?.textContent).not.toContain("Barangay Stories");
  });

  it("saves a title to the device library", async () => {
    await go("#/detail/series/tt0000002");
    await vi.waitFor(() => expect(document.querySelector(".detail-copy h1")?.textContent).toBe("Barangay Stories"));
    document.querySelector<HTMLButtonElement>("[data-action='toggle-watchlist']")?.click();
    await go("#/library");
    await vi.waitFor(() => expect(document.querySelector(".library-page h1")?.textContent).toBe("My library"));
    expect(document.body.textContent).toContain("Barangay Stories");
  });
});

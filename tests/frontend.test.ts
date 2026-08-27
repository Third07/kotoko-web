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
  });

  it("excludes unaired series episodes and renders playable sources", async () => {
    await go("#/detail/series/tt0000002");
    await vi.waitFor(() => expect(document.querySelector(".detail-copy h1")?.textContent).toBe("Barangay Stories"));

    const episodeText = [...document.querySelectorAll("#episode-select option")].map((option) => option.textContent);
    expect(episodeText).toHaveLength(2);
    expect(episodeText.join(" ")).not.toContain("Future Episode");

    document.querySelector<HTMLButtonElement>("[data-action='play']")?.click();
    await vi.waitFor(() => expect(document.querySelectorAll(".source-button")).toHaveLength(2));
    expect(document.querySelector("#player-dialog")?.hasAttribute("open")).toBe(true);
    expect(document.body.textContent).toContain("Kotoko HD");
    expect(document.body.textContent).toContain("Native only");
  });

  it("saves a title to the device library", async () => {
    document.querySelector<HTMLButtonElement>("[data-action='close-player']")?.click();
    document.querySelector<HTMLButtonElement>("[data-action='toggle-watchlist']")?.click();
    await go("#/library");
    await vi.waitFor(() => expect(document.querySelector(".library-page h1")?.textContent).toBe("My library"));
    expect(document.body.textContent).toContain("Barangay Stories");
  });
});

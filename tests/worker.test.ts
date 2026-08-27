import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { buildAddonResourceUrl, isSafeSegment } from "../worker/index";

const manifestUrl = "https://addon.example/user-token/manifest.json";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("add-on route validation", () => {
  it("builds standard Stremio catalog routes while retaining the private base path", () => {
    const extras = new URLSearchParams({ skip: "20" });
    const target = buildAddonResourceUrl(manifestUrl, "catalog", "movie", "latest_movies", extras);
    expect(target.href).toBe("https://addon.example/user-token/catalog/movie/latest_movies/skip=20.json");
  });

  it("supports IMDb series episode identifiers", () => {
    const target = buildAddonResourceUrl(manifestUrl, "stream", "series", "tt3107288:1:2");
    expect(decodeURIComponent(target.pathname)).toBe("/user-token/stream/series/tt3107288:1:2.json");
  });

  it("rejects path traversal and oversized identifiers", () => {
    expect(isSafeSegment("../manifest")).toBe(false);
    expect(isSafeSegment("x".repeat(181))).toBe(false);
    expect(() => buildAddonResourceUrl(manifestUrl, "meta", "movie", "../secret")).toThrow(
      "Invalid media identifier"
    );
  });
});

describe("manifest privacy", () => {
  it("removes personalized configuration before returning the manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "example.addon",
          version: "1.0.0",
          name: "Example",
          catalogs: [],
          config: [{ key: "manifest_url", default: manifestUrl }],
          behaviorHints: { configurable: true }
        })
      )
    );

    const response = await worker.fetch(
      new Request("https://client.example/api/manifest"),
      {
        KOTOKO_MANIFEST_URL: manifestUrl,
        ASSETS: { fetch: vi.fn() }
      } as never
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.config).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("user-token");
  });
});

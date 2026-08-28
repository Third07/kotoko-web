import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { buildAddonResourceUrl, getAddonConfigs, isSafeSegment } from "../worker/index";

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

  it("parses additional manifests without replacing the primary source", () => {
    const configs = getAddonConfigs({
      KOTOKO_MANIFEST_URL: manifestUrl,
      KOTOKO_ADDONS: JSON.stringify([
        { id: "backup", manifestUrl: "https://backup.example/private-token/manifest.json" }
      ])
    } as never);

    expect(configs.map((config) => config.id)).toEqual(["kotoko", "backup"]);
    expect(() =>
      getAddonConfigs({
        KOTOKO_MANIFEST_URL: manifestUrl,
        KOTOKO_ADDONS: JSON.stringify([{ id: "Bad ID", manifestUrl }])
      } as never)
    ).toThrow("unique lowercase id");
  });

  it("returns a sanitized add-on registry and keeps every manifest URL private", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        return Response.json({
          id: url.hostname.includes("backup") ? "example.backup" : "example.primary",
          version: "1.0.0",
          name: url.hostname.includes("backup") ? "Backup" : "Primary",
          types: ["movie"],
          resources: ["catalog", "stream"],
          catalogs: [],
          config: [{ default: url.href }]
        });
      })
    );

    const response = await worker.fetch(
      new Request("https://client.example/api/addons"),
      {
        KOTOKO_MANIFEST_URL: manifestUrl,
        KOTOKO_ADDONS: JSON.stringify([
          { id: "backup", manifestUrl: "https://backup.example/private-token/manifest.json" }
        ]),
        ASSETS: { fetch: vi.fn() }
      } as never
    );
    const payload = (await response.json()) as { addons: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(payload.addons).toHaveLength(2);
    expect(payload.addons.map((addon) => addon.id)).toEqual(["kotoko", "backup"]);
    expect(JSON.stringify(payload)).not.toContain("user-token");
    expect(JSON.stringify(payload)).not.toContain("private-token");
  });

  it("routes namespaced resources through the selected private add-on", async () => {
    const fetchMock = vi.fn(async () => Response.json({ streams: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://client.example/api/addons/backup/stream/movie/tt1234567"),
      {
        KOTOKO_MANIFEST_URL: manifestUrl,
        KOTOKO_ADDONS: JSON.stringify([
          { id: "backup", manifestUrl: "https://backup.example/private-token/manifest.json" }
        ]),
        ASSETS: { fetch: vi.fn() }
      } as never
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://backup.example/private-token/stream/movie/tt1234567.json"
    );
  });
});

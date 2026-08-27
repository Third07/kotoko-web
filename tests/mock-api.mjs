import { createServer } from "node:http";

const movie = {
  id: "tt0000001",
  type: "movie",
  name: "Isla Nights",
  description: "A homecoming story set beside a quiet Philippine coast.",
  releaseInfo: "2026",
  runtime: "1h 42m",
  genres: ["Drama", "Family"]
};

const series = {
  id: "tt0000002",
  type: "series",
  name: "Barangay Stories",
  description: "Neighbors, secrets and second chances meet on one lively street.",
  releaseInfo: "2025–",
  genres: ["Drama", "Comedy"]
};

const extras = [
  { ...movie, id: "tt0000003", name: "Manila After Rain" },
  { ...movie, id: "tt0000004", name: "Golden Jeepney" },
  { ...series, id: "tt0000005", name: "Lola's Kitchen" },
  { ...movie, id: "tt0000006", name: "Letters from Cebu" }
];

function json(response, status = 200) {
  return JSON.stringify(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:8787");
  response.setHeader("Access-Control-Allow-Origin", "*");
  if (url.pathname === "/api/manifest") {
    response.setHeader("Content-Type", "application/json");
    response.end(
      json({
        id: "test.kotoko",
        version: "1.0.0",
        name: "Kotoko",
        types: ["movie", "series"],
        resources: ["catalog", "meta", "stream", "subtitles"],
        catalogs: [
          { type: "movie", id: "latest_movies", name: "Tagalog Dubbed Movies", extraSupported: ["skip"] },
          { type: "series", id: "top_series", name: "Filipino Series", extraSupported: ["skip"] }
        ]
      })
    );
    return;
  }
  if (url.pathname.startsWith("/api/catalog/")) {
    response.setHeader("Content-Type", "application/json");
    const skip = Number(url.searchParams.get("skip") ?? "0");
    const isSeries = url.pathname.includes("/series/");
    response.end(json({ metas: skip > 0 ? [] : isSeries ? [series, extras[2]] : [movie, ...extras.filter((item) => item.type === "movie")] }));
    return;
  }
  if (url.pathname.startsWith("/api/meta/")) {
    response.setHeader("Content-Type", "application/json");
    if (url.pathname.includes("tt0000002")) {
      response.end(
        json({
          meta: {
            ...series,
            videos: [
              { id: "tt0000002:1:1", season: 1, episode: 1, title: "The New Neighbor", released: "2026-01-01", overview: "A mysterious renter arrives." },
              { id: "tt0000002:1:2", season: 1, episode: 2, title: "Karaoke Night", released: "2026-02-01", overview: "One song changes the block." },
              { id: "tt0000002:1:3", season: 1, episode: 3, title: "Future Episode", released: "2099-01-01" }
            ]
          }
        })
      );
    } else response.end(json({ meta: movie }));
    return;
  }
  if (url.pathname.startsWith("/api/stream/")) {
    response.setHeader("Content-Type", "application/json");
    response.end(
      json({
        streams: [
          { name: "Kotoko HD", title: "1080p", url: "http://127.0.0.1:8787/mock.mp4" },
          { name: "Kotoko SD", title: "720p", url: "http://127.0.0.1:8787/mock-2.mp4" },
          { name: "Native only", infoHash: "0123456789abcdef" }
        ]
      })
    );
    return;
  }
  if (url.pathname.startsWith("/api/subtitles/")) {
    response.setHeader("Content-Type", "application/json");
    response.end(json({ subtitles: [] }));
    return;
  }
  if (url.pathname.endsWith(".mp4")) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.statusCode = 404;
  response.end();
});

server.listen(8787, "127.0.0.1", () => console.log("mock API ready"));

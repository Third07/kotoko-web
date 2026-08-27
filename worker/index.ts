const API_PREFIX = "/api/";
const MAX_MANIFEST_BYTES = 256 * 1024;
const ALLOWED_TYPES = new Set(["movie", "series"]);
const ALLOWED_RESOURCES = new Set(["catalog", "meta", "stream", "subtitles"]);
const ALLOWED_EXTRAS = new Set(["skip", "search", "genre"]);

type AddonResource = "catalog" | "meta" | "stream" | "subtitles";

interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  types?: string[];
  resources?: unknown[];
  catalogs?: Array<Record<string, unknown>>;
  idPrefixes?: string[];
  behaviorHints?: Record<string, unknown>;
  config?: unknown;
  [key: string]: unknown;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function isSafeSegment(value: string): boolean {
  return value.length > 0 && value.length <= 180 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function buildAddonResourceUrl(
  manifestUrlValue: string,
  resource: AddonResource,
  type: string,
  id: string,
  extras: URLSearchParams = new URLSearchParams()
): URL {
  const manifestUrl = new URL(manifestUrlValue);
  if (manifestUrl.protocol !== "https:" || !manifestUrl.pathname.endsWith("/manifest.json")) {
    throw new ApiError(500, "The add-on URL is not configured correctly.");
  }

  if (!ALLOWED_RESOURCES.has(resource) || !ALLOWED_TYPES.has(type)) {
    throw new ApiError(400, "Unsupported add-on resource.");
  }
  if (!isSafeSegment(id)) {
    throw new ApiError(400, "Invalid media identifier.");
  }

  const baseUrl = new URL("./", manifestUrl);
  const allowedExtras = new URLSearchParams();
  for (const [key, value] of extras) {
    if (!ALLOWED_EXTRAS.has(key) || value.length > 160) continue;
    if (key === "skip" && !/^\d{1,6}$/.test(value)) continue;
    allowedExtras.append(key, value);
  }

  const extraSegment = allowedExtras.size > 0 ? `/${allowedExtras.toString()}` : "";
  const resourcePath = `${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extraSegment}.json`;
  const target = new URL(resourcePath, baseUrl);

  if (target.origin !== manifestUrl.origin || !target.pathname.startsWith(baseUrl.pathname)) {
    throw new ApiError(400, "Invalid upstream route.");
  }
  return target;
}

function apiJson(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, { ...init, headers });
}

function apiError(status: number, message: string): Response {
  return apiJson({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJsonWithLimit(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new ApiError(502, "The add-on returned an empty response.");

  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > maxBytes) throw new ApiError(502, "The add-on response was too large.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(502, "The add-on response was too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(502, "The add-on returned invalid JSON.");
  }
}

function isManifest(value: unknown): value is AddonManifest {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.version === "string" &&
    typeof item.name === "string" &&
    Array.isArray(item.catalogs)
  );
}

function sanitizeManifest(manifest: AddonManifest): AddonManifest {
  const { config: _privateConfig, ...safeManifest } = manifest;
  return {
    ...safeManifest,
    behaviorHints: {
      ...(manifest.behaviorHints ?? {}),
      configurable: false,
      configurationRequired: false
    }
  };
}

async function fetchUpstream(url: URL, cacheTtl: number): Promise<Response> {
  const init: RequestInit<RequestInitCfProperties> = {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000)
  };
  if (cacheTtl > 0) {
    init.cf = { cacheEverything: true, cacheTtl };
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ApiError(response.status === 404 ? 404 : 502, `The add-on returned ${response.status}.`);
  }
  return response;
}

async function handleManifest(env: Env): Promise<Response> {
  const manifestUrl = new URL(env.KOTOKO_MANIFEST_URL);
  if (manifestUrl.protocol !== "https:" || !manifestUrl.pathname.endsWith("/manifest.json")) {
    throw new ApiError(500, "The add-on URL is not configured correctly.");
  }

  const upstream = await fetchUpstream(manifestUrl, 300);
  const value = await readJsonWithLimit(upstream, MAX_MANIFEST_BYTES);
  if (!isManifest(value)) throw new ApiError(502, "The add-on manifest is incomplete.");

  return apiJson(sanitizeManifest(value), {
    headers: { "Cache-Control": "public, max-age=120, s-maxage=300" }
  });
}

async function handleResource(request: Request, env: Env, url: URL): Promise<Response> {
  let parts: string[];
  try {
    parts = url.pathname.slice(API_PREFIX.length).split("/").map(decodeURIComponent);
  } catch {
    throw new ApiError(400, "Invalid encoded route.");
  }
  const [resourceValue, type = "", id = ""] = parts;
  if (!resourceValue || !ALLOWED_RESOURCES.has(resourceValue) || parts.length !== 3) {
    throw new ApiError(404, "API route not found.");
  }

  const resource = resourceValue as AddonResource;
  if (resource === "catalog" && !isSafeSegment(id)) {
    throw new ApiError(400, "Invalid catalog identifier.");
  }

  const target = buildAddonResourceUrl(env.KOTOKO_MANIFEST_URL, resource, type, id, url.searchParams);
  const cacheTtl = resource === "meta" ? 1800 : resource === "catalog" ? 300 : resource === "subtitles" ? 120 : 15;
  const upstream = await fetchUpstream(target, cacheTtl);
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    "Cache-Control": resource === "stream" ? "private, max-age=10" : `public, max-age=${Math.min(cacheTtl, 300)}`,
    "X-Content-Type-Options": "nosniff"
  });
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers
  });
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  secured.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self' https:; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' https: data:; media-src 'self' https: blob:; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests"
  );
  return secured;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith(API_PREFIX)) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return apiError(405, "Method not allowed.");
        }

        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin) return apiError(403, "Cross-origin API access is disabled.");

        if (url.pathname === "/api/health") {
          return apiJson({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
        }
        if (url.pathname === "/api/manifest") return await handleManifest(env);
        return await handleResource(request, env, url);
      }

      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const message = error instanceof ApiError ? error.message : "Unexpected server error.";
      console.error(
        JSON.stringify({
          message: "request failed",
          error: error instanceof Error ? error.message : String(error),
          method: request.method,
          path: url.pathname,
          status
        })
      );
      return apiError(status, message);
    }
  }
} satisfies ExportedHandler<Env>;

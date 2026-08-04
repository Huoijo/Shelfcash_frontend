import type { ShelfCashApiErrorBody } from "./types";

type RouteRule = {
  pattern: RegExp;
  methods: ReadonlySet<string>;
};

const methods = (...values: string[]) => new Set(values);
const routeRules: RouteRule[] = [
  { pattern: /^\/health$/, methods: methods("GET") },
  { pattern: /^\/api\/v1\/llm\/health$/, methods: methods("GET") },
  { pattern: /^\/api\/v1\/llm\/map-sheet$/, methods: methods("POST") },
  { pattern: /^\/api\/v1\/import-schemas$/, methods: methods("GET") },
  { pattern: /^\/api\/v1\/imports$/, methods: methods("POST") },
  { pattern: /^\/api\/v1\/imports\/[^/]+$/, methods: methods("GET") },
  {
    pattern: /^\/api\/v1\/imports\/[^/]+\/(?:confirm|process)$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/imports\/[^/]+\/result$/,
    methods: methods("GET"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/(?:bootstrap|dashboard|inventory|inventory-movements|ingredients|products|menu|supplier-constraints|inventory-constraints|aliases|settings|calendar-features|imports)$/,
    methods: methods("GET"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/(?:inventory-counts|inventory-adjustments)$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/ingredients$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/ingredients\/[^/]+$/,
    methods: methods("PATCH"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/products$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/products\/[^/]+$/,
    methods: methods("PATCH"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/products\/[^/]+\/components$/,
    methods: methods("PUT"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/products\/[^/]+\/recipe$/,
    methods: methods("GET", "PUT"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/products\/[^/]+\/recipe-versions$/,
    methods: methods("GET"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/(?:sales-history|usage-history|purchase-history)$/,
    methods: methods("GET"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/(?:sales-history|purchase-history)\/batch$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/supplier-constraints$/,
    methods: methods("POST"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/supplier-constraints\/[^/]+$/,
    methods: methods("PUT"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/(?:aliases|settings|calendar-features)$/,
    methods: methods("PUT"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/forecast-runs$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/forecast-runs\/[^/]+$/,
    methods: methods("GET"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/forecast-runs\/[^/]+\/result$/,
    methods: methods("GET"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/plan-runs$/,
    methods: methods("POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/plan-runs\/[^/]+$/,
    methods: methods("GET"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/plan-runs\/[^/]+\/result$/,
    methods: methods("GET"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/purchase-orders$/,
    methods: methods("GET", "POST"),
  },
  {
    pattern: /^\/api\/v1\/stores\/[^/]+\/purchase-orders\/[^/]+$/,
    methods: methods("GET", "PATCH"),
  },
  {
    pattern:
      /^\/api\/v1\/stores\/[^/]+\/purchase-orders\/[^/]+\/(?:confirm|receive)$/,
    methods: methods("POST"),
  },
];

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  const body: ShelfCashApiErrorBody = { code, message, details };
  return Response.json(body, { status });
}

export function resolveBackendPath(
  segments: string[],
  method: string,
): string | null {
  let decoded: string[];
  try {
    decoded = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (
    decoded.some(
      (segment) =>
        !segment ||
        segment.includes("/") ||
        segment.includes("\\") ||
        segment === "." ||
        segment === "..",
    )
  ) {
    return null;
  }
  const path = `/${decoded.map((segment) => encodeURIComponent(segment)).join("/")}`;
  const normalizedMethod = method.toUpperCase();
  return routeRules.some(
    (rule) =>
      rule.pattern.test(path) && rule.methods.has(normalizedMethod),
  )
    ? path
    : null;
}

function backendBaseUrl(): string | null {
  const configured = process.env.SHELFCASH_BACKEND_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function forwardedHeaders(request: Request, path: string): Headers {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "accept",
    "idempotency-key",
    "if-match",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const apiKey = process.env.SHELFCASH_API_KEY?.trim();
  const publicPath =
    path === "/health" || path === "/api/v1/llm/health";
  if (apiKey && !publicPath) headers.set("X-ShelfCash-Key", apiKey);
  return headers;
}

export async function forwardShelfCashRequest(
  request: Request,
  segments: string[],
): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = resolveBackendPath(segments, method);
  if (!path) {
    return errorResponse(
      404,
      "ENDPOINT_NOT_ALLOWED",
      "Endpoint hoặc HTTP method không thuộc ShelfCash API contract.",
    );
  }
  const baseUrl = backendBaseUrl();
  if (!baseUrl) {
    return errorResponse(
      503,
      "BACKEND_NOT_CONFIGURED",
      "Chưa cấu hình địa chỉ ShelfCash backend.",
      { environment: "SHELFCASH_BACKEND_URL" },
    );
  }

  try {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(`${baseUrl}${path}`);
    targetUrl.search = incomingUrl.search;
    const response = await fetch(targetUrl, {
      method,
      headers: forwardedHeaders(request, path),
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const headers = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "x-request-id",
      "retry-after",
    ]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch (caught) {
    return errorResponse(
      502,
      "BACKEND_UNREACHABLE",
      "Không thể kết nối ShelfCash backend.",
      {
        reason:
          caught instanceof Error ? caught.message : "Unknown network error",
      },
    );
  }
}

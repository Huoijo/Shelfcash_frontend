import assert from "node:assert/strict";
import test from "node:test";
import {
  forwardShelfCashRequest,
  resolveBackendPath,
} from "../lib/backend-proxy.ts";

test("proxy only accepts the ShelfCash API contract", () => {
  assert.equal(resolveBackendPath(["health"], "GET"), "/health");
  assert.equal(
    resolveBackendPath(["api", "v1", "stores", "STORE_001", "decision-runs"], "POST"),
    "/api/v1/stores/STORE_001/decision-runs",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "decision-runs", "decision-1"], "GET"),
    "/api/v1/decision-runs/decision-1",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "decision-runs", "decision-1", "brief"], "GET"),
    "/api/v1/decision-runs/decision-1/brief",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "decision-runs", "decision-1", "explanation"], "POST"),
    "/api/v1/decision-runs/decision-1/explanation",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "llm", "map-sheet"], "POST"),
    "/api/v1/llm/map-sheet",
  );
  assert.equal(
    resolveBackendPath(
      ["api", "v1", "imports", "abc", "confirm"],
      "POST",
    ),
    "/api/v1/imports/abc/confirm",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "stores", "STORE_001", "inventory-constraints"], "GET"),
    "/api/v1/stores/STORE_001/inventory-constraints",
  );
  assert.equal(
    resolveBackendPath(
      ["api", "v1", "imports", "abc", "result"],
      "GET",
    ),
    "/api/v1/imports/abc/result",
  );
  assert.equal(
    resolveBackendPath(
      ["api", "v1", "stores", "STORE_001", "bootstrap"],
      "GET",
    ),
    "/api/v1/stores/STORE_001/bootstrap",
  );
  assert.equal(
    resolveBackendPath(
      ["api", "v1", "stores", "STORE_001", "menu"],
      "GET",
    ),
    "/api/v1/stores/STORE_001/menu",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "products",
        "combo-1",
        "components",
      ],
      "PUT",
    ),
    "/api/v1/stores/STORE_001/products/combo-1/components",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "products",
        "product-1",
        "recipe",
      ],
      "PUT",
    ),
    "/api/v1/stores/STORE_001/products/product-1/recipe",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "purchase-orders",
        "PO-1",
        "confirm",
      ],
      "POST",
    ),
    "/api/v1/stores/STORE_001/purchase-orders/PO-1/confirm",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "forecast-runs",
        "forecast-1",
        "ingredient-demand",
      ],
      "POST",
    ),
    "/api/v1/stores/STORE_001/forecast-runs/forecast-1/ingredient-demand",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "forecast-runs",
        "forecast-1",
        "procurement-plans",
      ],
      "GET",
    ),
    "/api/v1/stores/STORE_001/forecast-runs/forecast-1/procurement-plans",
  );
  assert.equal(
    resolveBackendPath(
      ["api", "v1", "forecast-models", "train"],
      "POST",
    ),
    "/api/v1/forecast-models/train",
  );
  assert.equal(
    resolveBackendPath(
      [
        "api",
        "v1",
        "stores",
        "STORE_001",
        "purchase-orders",
        "PO-1",
        "receive",
      ],
      "POST",
    ),
    "/api/v1/stores/STORE_001/purchase-orders/PO-1/receive",
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "forecasts"], "POST"),
    null,
  );
  assert.equal(
    resolveBackendPath(["api", "v1", "llm", "map-sheet"], "GET"),
    null,
  );
  assert.equal(resolveBackendPath(["admin", "secrets"], "GET"), null);
  assert.equal(resolveBackendPath(["api", "v2", "imports"], "POST"), null);
});

test("proxy keeps secrets server-side and preserves query/idempotency", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SHELFCASH_BACKEND_URL;
  const originalKey = process.env.SHELFCASH_API_KEY;
  let forwardedUrl = "";
  let forwardedKey: string | null = null;
  let forwardedIdempotencyKey: string | null = null;
  let forwardedRequestId: string | null = null;

  process.env.SHELFCASH_BACKEND_URL = "http://backend.internal:8000";
  process.env.SHELFCASH_API_KEY = "server-only-key";
  globalThis.fetch = async (input, init) => {
    forwardedUrl = String(input);
    const headers = new Headers(init?.headers);
    forwardedKey = headers.get("X-ShelfCash-Key");
    forwardedIdempotencyKey = headers.get("Idempotency-Key");
    forwardedRequestId = headers.get("X-Request-ID");
    return Response.json({ import_id: "import-1" }, { status: 201 });
  };

  try {
    const response = await forwardShelfCashRequest(
      new Request(
        "http://frontend.local/api/shelfcash/api/v1/imports?source=excel",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": "request-uuid",
            "X-Request-ID": "trace-uuid",
          },
          body: "{}",
        },
      ),
      ["api", "v1", "imports"],
    );
    assert.equal(response.status, 201);
    assert.equal(
      forwardedUrl,
      "http://backend.internal:8000/api/v1/imports?source=excel",
    );
    assert.equal(forwardedKey, "server-only-key");
    assert.equal(forwardedIdempotencyKey, "request-uuid");
    assert.equal(forwardedRequestId, "trace-uuid");
    assert.equal(response.headers.get("X-Request-ID"), "trace-uuid");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SHELFCASH_BACKEND_URL;
    else process.env.SHELFCASH_BACKEND_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SHELFCASH_API_KEY;
    else process.env.SHELFCASH_API_KEY = originalKey;
  }
});

test("proxy-generated errors include a traceable request ID", async () => {
  const response = await forwardShelfCashRequest(
    new Request("http://frontend.local/api/shelfcash/not-allowed", {
      headers: { "X-Request-ID": "bad-route-trace" },
    }),
    ["not-allowed"],
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("X-Request-ID"), "bad-route-trace");
  assert.deepEqual(await response.json(), {
    code: "ENDPOINT_NOT_ALLOWED",
    message: "Endpoint hoặc HTTP method không thuộc ShelfCash API contract.",
    details: {},
    request_id: "bad-route-trace",
  });
});

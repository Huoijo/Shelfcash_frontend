import assert from "node:assert/strict";
import test from "node:test";
import {
  ShelfCashApiError,
  confirmImport,
  confirmPurchaseOrder,
  createForecastRun,
  createDecisionRun,
  createIdempotencyKey,
  createIngredientDemand,
  createInventoryAdjustment,
  createInventoryCount,
  createMenuProduct,
  createPlanRun,
  createProcurementPlans,
  createPurchaseOrders,
  getBootstrap,
  getDecisionRun,
  getDecisionExplanation,
  getIngredientDemand,
  getInventoryMovements,
  getMenu,
  getProcurementPlans,
  getPurchaseOrder,
  getRecipe,
  getRecipeVersions,
  receivePurchaseOrder,
  replaceMenuComponents,
  requestShelfCash,
  saveRecipe,
  saveSettings,
  updatePurchaseOrder,
  updateMenuProduct,
  waitForDecisionRun,
  waitForForecastResult,
} from "../lib/shelfcash-client.ts";
import {
  addDaysToDateOnly,
  formatDateOnly,
  isTimezoneAwareDateTime,
  toNumber,
  toTimezoneAwareIso,
} from "../lib/api-contract.ts";

test("decision runs use the canonical store-scoped create and global result endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
    });
    return Response.json({ decision_run_id: "decision-1", status: "completed" });
  };
  try {
    await createDecisionRun({
      storeId: "STORE_001",
      request: {
        forecast_run_id: "forecast-1",
        as_of_date: "2026-08-10",
        horizon_days: 7,
        engine_mode: "deterministic",
        include_open_purchase_orders: true,
        budget_override: 5_000_000,
        scenario_count: 100,
        random_seed: 42,
      },
    });
    await getDecisionRun("decision-1");
    await getDecisionExplanation("decision-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: "/api/shelfcash/api/v1/stores/STORE_001/decision-runs", method: "POST" },
    { url: "/api/shelfcash/api/v1/decision-runs/decision-1", method: "GET" },
    { url: "/api/shelfcash/api/v1/decision-runs/decision-1/explanation", method: "POST" },
  ]);
  assert.deepEqual(calls[0]?.body, {
    forecast_run_id: "forecast-1",
    as_of_date: "2026-08-10",
    horizon_days: 7,
    engine_mode: "deterministic",
    include_open_purchase_orders: true,
    budget_override: 5_000_000,
    scenario_count: 100,
    random_seed: 42,
  });
  assert.deepEqual(calls[2]?.body, { language: "vi", detail_level: "simple" });
});

test("a completed decision response is terminal and does not trigger polling", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ decision_run_id: "decision-1", status: "completed" });
  };
  try {
    const result = await waitForDecisionRun("decision-1", {
      decision_run_id: "decision-1",
      status: "completed",
    });
    assert.equal(result.status, "completed");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a processing decision run polls once and preserves a completed non-feasible result", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      decision_run_id: "decision-2",
      status: "completed",
      recommended_plan: { valid: false },
      strategies: [{ strategy: "balanced", feasible: false, violations: ["Ngân sách không đủ"] }],
    });
  };
  try {
    const result = await waitForDecisionRun(
      "decision-2",
      { decision_run_id: "decision-2", status: "running" },
      { pollIntervalMs: 0 },
    );
    assert.equal(calls, 1);
    assert.equal(result.status, "completed");
    assert.equal(result.recommended_plan?.valid, false);
    assert.equal(result.strategies?.[0]?.feasible, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirm import preserves explicit unknown skips and nullable columns", async () => {
  const originalFetch = globalThis.fetch;
  let call:
    | { url: string; method: string; body: Record<string, unknown> }
    | undefined;
  globalThis.fetch = async (input, init) => {
    call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    return Response.json({ import_id: "import-1", status: "confirmed" });
  };

  try {
    await confirmImport("import-1", [
      {
        profile_id: "profile-readme",
        sheet_name: "README",
        sheet_type: "unknown",
        column_mapping: {},
        skip: true,
      },
      {
        profile_id: "profile-sales",
        sheet_name: "POS_T7_2026",
        sheet_type: "sales_history",
        column_mapping: {
          Ngày: "date",
          Món: "product_name",
          "Số lượng": "quantity_sold",
          "Ghi chú": null,
        },
        skip: false,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(call?.url, "/api/shelfcash/api/v1/imports/import-1/confirm");
  assert.equal(call?.method, "POST");
  assert.deepEqual(call?.body, {
    mappings: [
      {
        profile_id: "profile-readme",
        sheet_name: "README",
        sheet_type: "unknown",
        column_mapping: {},
        skip: true,
      },
      {
        profile_id: "profile-sales",
        sheet_name: "POS_T7_2026",
        sheet_type: "sales_history",
        column_mapping: {
          Ngày: "date",
          Món: "product_name",
          "Số lượng": "quantity_sold",
          "Ghi chú": null,
        },
        skip: false,
      },
    ],
  });
  assert.equal(JSON.stringify(call?.body).includes("unknown"), true);
  assert.equal(JSON.stringify(call?.body).includes("null"), true);
});

test("frontend writes only contract fields through the proxy", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: Record<string, unknown> | null;
  }> = [];
  globalThis.fetch = async (input, init) => {
    const rawBody = typeof init?.body === "string" ? init.body : "";
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: rawBody
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : null,
    });
    return Response.json({
      today: "2026-07-28",
      store: {
        store_id: "STORE_001",
        store_name: "Cửa hàng Quận 3",
        timezone: "Asia/Ho_Chi_Minh",
        currency: "VND",
      },
      inventory: [],
      products: [],
      recipes: [],
      supplier_constraints: [],
      aliases: [],
      future_calendar: [],
      settings: {
        monthly_budget: 5_000_000,
        remaining_budget: 2_300_000,
        forecast_horizon: 7,
      },
      latest_runs: { forecast_run_id: null, plan_run_id: null },
      data_freshness: {},
      forecast_run_id: "forecast-1",
      plan_run_id: "plan-1",
      status: "queued",
      orders: [],
    });
  };

  try {
    await getBootstrap("STORE_001");
    await saveRecipe({
      storeId: "STORE_001",
      productId: "product-1",
      effectiveFrom: "2026-07-29",
      version: 2,
      lines: [
        {
          ingredientId: "ingredient-1",
          quantity: 0.15,
          unit: "lít",
        },
      ],
    });
    await saveSettings("STORE_001", {
      monthlyBudget: 5_000_000,
      forecastHorizon: 7,
      defaultStrategy: "balanced",
      version: 4,
    });
    await createForecastRun({
      storeId: "STORE_001",
      cutoffDate: "2026-07-28",
      horizonDays: 7,
    });
    await createPlanRun({
      storeId: "STORE_001",
      forecastRunId: "forecast-1",
      strategy: "balanced",
      budgetLimit: 2_300_000,
      asOfDate: "2026-07-28",
    });
    await createPurchaseOrders({
      storeId: "STORE_001",
      planRunId: "plan-1",
      lines: [
        {
          recommendationId: "recommendation-1",
          orderQuantityOverride: 24,
        },
      ],
    });
    await confirmPurchaseOrder({
      storeId: "STORE_001",
      poId: "PO-1",
      version: 1,
      confirmedAt: "2026-07-28T19:00:00+07:00",
    });
    await getMenu("STORE_001", {
      status: "all",
      itemType: "combo",
      pageSize: 100,
    });
    await createMenuProduct({
      storeId: "STORE_001",
      payload: {
        sku: "MON-006",
        product: "Cacao sữa",
        item_type: "single",
        selling_unit: "ly",
        price: 36_000,
        status: "active",
      },
    });
    await updateMenuProduct({
      storeId: "STORE_001",
      productId: "product-6",
      payload: {
        version: 2,
        product: "Cacao sữa ít ngọt",
        price: 37_000,
        status: "active",
      },
    });
    await replaceMenuComponents({
      storeId: "STORE_001",
      productId: "combo-1",
      version: 3,
      components: [
        { componentProductId: "product-1", quantity: 1 },
        { componentProductId: "product-2", quantity: 2 },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    calls[0]?.url,
    "/api/shelfcash/api/v1/stores/STORE_001/bootstrap",
  );
  assert.equal(calls[1]?.method, "PUT");
  assert.deepEqual(calls[1]?.body, {
    effective_from: "2026-07-29",
    version: 2,
    lines: [
      {
        ingredient_id: "ingredient-1",
        quantity: 0.15,
        unit: "lít",
      },
    ],
  });
  assert.deepEqual(calls[2]?.body, {
    monthly_budget: 5_000_000,
    forecast_horizon: 7,
    default_strategy: "balanced",
    version: 4,
  });
  assert.equal("remaining_budget" in (calls[2]?.body ?? {}), false);
  assert.deepEqual(calls[3]?.body, {
    cutoff_date: "2026-07-28",
    horizon_days: 7,
    quantiles: [0.25, 0.5, 0.75],
    scope: { product_ids: [], ingredient_ids: [] },
    use_latest_calendar: true,
  });
  assert.ok(calls[3]?.headers.get("Idempotency-Key"));
  assert.deepEqual(calls[4]?.body, {
    forecast_run_id: "forecast-1",
    strategy: "balanced",
    budget_limit: 2_300_000,
    as_of_date: "2026-07-28",
    include_open_purchase_orders: true,
  });
  assert.deepEqual(calls[5]?.body, {
    plan_run_id: "plan-1",
    lines: [
      {
        recommendation_id: "recommendation-1",
        order_quantity_override: 24,
      },
    ],
  });
  assert.equal("total" in (calls[5]?.body ?? {}), false);
  assert.equal("budget_after" in (calls[5]?.body ?? {}), false);
  assert.deepEqual(calls[6]?.body, {
    version: 1,
    confirmed_at: "2026-07-28T19:00:00+07:00",
  });
  assert.ok(calls[6]?.headers.get("Idempotency-Key"));
  assert.equal(
    calls[7]?.url,
    "/api/shelfcash/api/v1/stores/STORE_001/menu?status=all&item_type=combo&page=1&page_size=100",
  );
  assert.equal(calls[8]?.method, "POST");
  assert.ok(calls[8]?.headers.get("Idempotency-Key"));
  assert.deepEqual(calls[8]?.body, {
    sku: "MON-006",
    product: "Cacao sữa",
    item_type: "single",
    selling_unit: "ly",
    price: 36_000,
    status: "active",
  });
  assert.equal(calls[9]?.method, "PATCH");
  assert.equal(calls[9]?.headers.get("Idempotency-Key"), null);
  assert.deepEqual(calls[9]?.body, {
    version: 2,
    product: "Cacao sữa ít ngọt",
    price: 37_000,
    status: "active",
  });
  assert.equal(calls[10]?.method, "PUT");
  assert.ok(calls[10]?.headers.get("Idempotency-Key"));
  assert.deepEqual(calls[10]?.body, {
    version: 3,
    components: [
      { component_product_id: "product-1", quantity: 1 },
      { component_product_id: "product-2", quantity: 2 },
    ],
  });
  assert.ok(calls.every((call) => call.headers.get("X-Request-ID")));
});

test("transport sends request IDs and preserves backend error request_id", async () => {
  const originalFetch = globalThis.fetch;
  let sentRequestId: string | null = null;
  globalThis.fetch = async (_input, init) => {
    sentRequestId = new Headers(init?.headers).get("X-Request-ID");
    return Response.json(
      {
        code: "VERSION_CONFLICT",
        message: "Phiên bản đã thay đổi.",
        details: { expected_version: 2, current_version: 3 },
        request_id: "backend-trace-1",
      },
      { status: 409 },
    );
  };

  try {
    await assert.rejects(
      requestShelfCash("/api/v1/stores/store-1/settings", {
        requestId: "frontend-trace-1",
      }),
      (caught: unknown) => {
        assert.ok(caught instanceof ShelfCashApiError);
        assert.equal(caught.code, "VERSION_CONFLICT");
        assert.equal(caught.status, 409);
        assert.equal(caught.requestId, "backend-trace-1");
        assert.equal(caught.request_id, "backend-trace-1");
        assert.deepEqual(caught.details, {
          expected_version: 2,
          current_version: 3,
        });
        return true;
      },
    );
    assert.equal(sentRequestId, "frontend-trace-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transport timeout is abort-aware and retains its request ID", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener(
        "abort",
        () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  try {
    await assert.rejects(
      requestShelfCash("/health", {
        requestId: "timeout-trace",
        timeoutMs: 5,
      }),
      (caught: unknown) => {
        assert.ok(caught instanceof ShelfCashApiError);
        assert.equal(caught.code, "REQUEST_TIMEOUT");
        assert.equal(caught.requestId, "timeout-trace");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("decimal and business-date helpers do not shift local dates", () => {
  assert.equal(toNumber("12.50"), 12.5);
  assert.equal(toNumber("1,5"), 1.5);
  assert.equal(toNumber("1.234,50"), 1234.5);
  assert.equal(toNumber("not-a-number", 17), 17);
  assert.equal(addDaysToDateOnly("2026-08-04", 1), "2026-08-05");
  assert.match(formatDateOnly("2026-08-04", "vi-VN"), /2026/);
  const zoned = toTimezoneAwareIso(
    new Date("2026-08-04T10:30:00.000Z"),
    "Asia/Ho_Chi_Minh",
  );
  assert.equal(zoned, "2026-08-04T17:30:00+07:00");
  assert.equal(isTimezoneAwareDateTime(zoned), true);
  assert.equal(isTimezoneAwareDateTime("2026-08-04T17:30:00"), false);
});

test("forecast validates horizon and uses both scope arrays", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: Record<string, unknown>; headers: Headers }> = [];
  globalThis.fetch = async (_input, init) => {
    calls.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    return Response.json({
      forecast_run_id: "forecast-1",
      status: "running",
    });
  };
  try {
    await assert.rejects(
      createForecastRun({
        storeId: "store-1",
        cutoffDate: "2026-08-04",
        horizonDays: 8,
      }),
      RangeError,
    );
    await createForecastRun({
      storeId: "store-1",
      cutoffDate: "2026-08-04",
      horizonDays: 7,
      productIds: ["product-1"],
      ingredientIds: ["ingredient-1"],
      idempotencyKey: "forecast-action-1",
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.body.scope, {
      product_ids: ["product-1"],
      ingredient_ids: ["ingredient-1"],
    });
    assert.equal(
      calls[0]?.headers.get("Idempotency-Key"),
      "forecast-action-1",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocked forecast state stops polling with MODEL_NOT_READY", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      forecast_run_id: "forecast-blocked",
      status: "blocked",
      failure_code: "MODEL_NOT_READY",
      failure_message: "Model chưa sẵn sàng.",
    });
  };
  try {
    await assert.rejects(
      waitForForecastResult("store-1", "forecast-blocked", {
        pollIntervalMs: 0,
      }),
      (caught: unknown) => {
        assert.ok(caught instanceof ShelfCashApiError);
        assert.equal(caught.code, "MODEL_NOT_READY");
        assert.equal(caught.status, 503);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ingredient demand and core procurement payloads match the canonical flow", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: Record<string, unknown> | null;
  }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null,
    });
    return Response.json({
      ingredient_demand_run_id: "demand-1",
      procurement_plan_run_id: "procurement-1",
      status: "completed",
      predictions: [],
      plans: [],
    });
  };
  try {
    await createIngredientDemand({
      storeId: "store-1",
      forecastRunId: "forecast-1",
      idempotencyKey: "demand-action-1",
    });
    await getIngredientDemand("store-1", "forecast-1");
    await createProcurementPlans({
      storeId: "store-1",
      forecastRunId: "forecast-1",
      strategies: ["lean", "balanced", "protected"],
      budgetOverride: 42_000_000,
      idempotencyKey: "procurement-action-1",
    });
    await getProcurementPlans({
      storeId: "store-1",
      forecastRunId: "forecast-1",
      procurementPlanRunId: "procurement-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const base =
    "/api/shelfcash/api/v1/stores/store-1/forecast-runs/forecast-1";
  assert.equal(calls[0]?.url, `${base}/ingredient-demand`);
  assert.equal(calls[0]?.method, "POST");
  assert.deepEqual(calls[0]?.body, {});
  assert.equal(
    calls[0]?.headers.get("Idempotency-Key"),
    "demand-action-1",
  );
  assert.equal(calls[1]?.url, `${base}/ingredient-demand`);
  assert.equal(calls[1]?.method, "GET");
  assert.equal(calls[2]?.url, `${base}/procurement-plans`);
  assert.deepEqual(calls[2]?.body, {
    strategies: ["lean", "balanced", "protected"],
    use_open_purchase_orders: true,
    use_latest_inventory: true,
    budget_override: 42_000_000,
  });
  assert.equal(
    calls[2]?.headers.get("Idempotency-Key"),
    "procurement-action-1",
  );
  assert.equal(
    calls[3]?.url,
    `${base}/procurement-plans?procurement_plan_run_id=procurement-1`,
  );
});

test("recipe, inventory, and complete PO lifecycle payloads stay store-scoped", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: Record<string, unknown> | null;
  }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null,
    });
    return Response.json({
      po_id: "PO-1",
      status: "draft",
      version: 1,
      lines: [],
      items: [],
    });
  };
  try {
    await getRecipe({
      storeId: "store-1",
      productId: "product-1",
      onDate: "2026-08-05",
    });
    await getRecipeVersions({ storeId: "store-1", productId: "product-1" });
    await createInventoryCount({
      storeId: "store-1",
      countedAt: "2026-08-04T17:00:00+07:00",
      idempotencyKey: "count-action-1",
      lines: [
        {
          lotId: "lot-1",
          countedQuantity: 12.5,
          unit: "kg",
          note: "Kiểm kho cuối ngày",
        },
      ],
    });
    await createInventoryAdjustment({
      storeId: "store-1",
      occurredAt: "2026-08-04T17:10:00+07:00",
      reference: "ADJ-1",
      idempotencyKey: "adjust-action-1",
      lines: [
        {
          lotId: "lot-1",
          expectedVersion: 3,
          quantityDelta: -1.2,
          unit: "kg",
          reason: "waste",
          note: "Hư hỏng",
        },
      ],
    });
    await getInventoryMovements({
      storeId: "store-1",
      lotId: "lot-1",
      page: 1,
      pageSize: 50,
    });
    await getPurchaseOrder({ storeId: "store-1", poId: "PO-1" });
    await updatePurchaseOrder({
      storeId: "store-1",
      poId: "PO-1",
      version: 1,
      idempotencyKey: "patch-po-action-1",
      lineUpdates: [{ poLineId: "line-1", orderQuantity: 30 }],
    });
    await confirmPurchaseOrder({
      storeId: "store-1",
      poId: "PO-1",
      version: 2,
      confirmedAt: "2026-08-04T18:00:00+07:00",
      idempotencyKey: "confirm-po-action-1",
    });
    await receivePurchaseOrder({
      storeId: "store-1",
      poId: "PO-1",
      version: 3,
      receivedAt: "2026-08-06T09:00:00+07:00",
      deliveryReference: "DELIVERY-1",
      idempotencyKey: "receive-po-action-1",
      lines: [
        {
          poLineId: "line-1",
          lots: [
            {
              quantity: 10,
              expiryDate: "2026-08-20",
              supplierLotCode: "LOT-A",
            },
          ],
        },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    calls[0]?.url,
    "/api/shelfcash/api/v1/stores/store-1/products/product-1/recipe?on_date=2026-08-05",
  );
  assert.equal(
    calls[1]?.url,
    "/api/shelfcash/api/v1/stores/store-1/products/product-1/recipe-versions",
  );
  assert.deepEqual(calls[2]?.body, {
    counted_at: "2026-08-04T17:00:00+07:00",
    lines: [
      {
        lot_id: "lot-1",
        counted_quantity: 12.5,
        unit: "kg",
        note: "Kiểm kho cuối ngày",
      },
    ],
  });
  assert.deepEqual(calls[3]?.body, {
    occurred_at: "2026-08-04T17:10:00+07:00",
    reference: "ADJ-1",
    lines: [
      {
        lot_id: "lot-1",
        expected_version: 3,
        quantity_delta: -1.2,
        unit: "kg",
        reason: "waste",
        note: "Hư hỏng",
      },
    ],
  });
  assert.equal(
    calls[4]?.url,
    "/api/shelfcash/api/v1/stores/store-1/inventory-movements?lot_id=lot-1&page=1&page_size=50",
  );
  assert.equal(calls[5]?.method, "GET");
  assert.deepEqual(calls[6]?.body, {
    version: 1,
    line_updates: [{ po_line_id: "line-1", order_quantity: 30 }],
  });
  assert.equal(
    calls[6]?.headers.get("Idempotency-Key"),
    "patch-po-action-1",
  );
  assert.equal(
    calls[7]?.headers.get("Idempotency-Key"),
    "confirm-po-action-1",
  );
  assert.deepEqual(calls[8]?.body, {
    version: 3,
    received_at: "2026-08-06T09:00:00+07:00",
    delivery_reference: "DELIVERY-1",
    lines: [
      {
        po_line_id: "line-1",
        lots: [
          {
            quantity: 10,
            expiry_date: "2026-08-20",
            supplier_lot_code: "LOT-A",
          },
        ],
      },
    ],
  });
  assert.equal(
    calls[8]?.headers.get("Idempotency-Key"),
    "receive-po-action-1",
  );
  assert.ok(calls.every((call) => call.headers.get("X-Request-ID")));
  assert.notEqual(createIdempotencyKey(), createIdempotencyKey());
});

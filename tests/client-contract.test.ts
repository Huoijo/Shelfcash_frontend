import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmImport,
  confirmPurchaseOrder,
  createForecastRun,
  createMenuProduct,
  createPlanRun,
  createPurchaseOrders,
  getBootstrap,
  getMenu,
  replaceMenuComponents,
  saveRecipe,
  saveSettings,
  updateMenuProduct,
} from "../lib/shelfcash-client.ts";

test("confirm import wraps only processable canonical mappings", async () => {
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
        profile_id: "profile-sales",
        sheet_name: "POS_T7_2026",
        sheet_type: "sales_history",
        column_mapping: {
          Ngày: "date",
          Món: "product_name",
          "Số lượng": "quantity_sold",
        },
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
        profile_id: "profile-sales",
        sheet_name: "POS_T7_2026",
        sheet_type: "sales_history",
        column_mapping: {
          Ngày: "date",
          Món: "product_name",
          "Số lượng": "quantity_sold",
        },
      },
    ],
  });
  assert.equal(JSON.stringify(call?.body).includes("null"), false);
  assert.equal(JSON.stringify(call?.body).includes("unknown"), false);
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
  });
  assert.equal("remaining_budget" in (calls[2]?.body ?? {}), false);
  assert.deepEqual(calls[3]?.body, {
    cutoff_date: "2026-07-28",
    horizon_days: 7,
    quantiles: [0.25, 0.5, 0.75],
    scope: { ingredient_ids: [] },
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
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBootstrap,
  adaptCorePlanning,
  adaptForecasts,
  adaptIngredientDemand,
  adaptOrders,
  adaptPlanningWorkflow,
  strategyFromApi,
  strategyFromCore,
  strategyToApi,
  strategyToCore,
} from "../lib/contract-adapters.ts";
import {
  buildEmptyBootstrapData,
  dateInTimeZone,
  hasOperationalData,
} from "../lib/data.ts";
import type {
  ForecastRunResultResponse,
  StoreBootstrapResponse,
} from "../lib/types.ts";

const bootstrapResponse: StoreBootstrapResponse = {
  today: "2026-08-04",
  store: {
    store_id: "STORE_Q3",
    store_name: "Cửa hàng Quận 3",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
  },
  inventory: [
    {
      lot_id: "lot-expired",
      ingredient_id: "ING_MILK",
      ingredient_name: "Sữa tươi",
      sku: "MILK-01",
      on_hand: "2.5",
      usable_quantity: "0",
      expired_quantity: "2.5",
      expiring_quantity: "0",
      unit: "lít",
      expiry_date: "2026-08-03",
      status: "expired",
      version: 3,
      last_counted_at: "2026-08-04T08:00:00+07:00",
    },
    {
      lot_id: "lot-healthy",
      ingredient_id: "ING_MILK",
      ingredient_name: "Sữa tươi",
      sku: "MILK-01",
      on_hand: "7.5",
      usable_quantity: "7.5",
      expired_quantity: "0",
      expiring_quantity: "0",
      unit: "lít",
      expiry_date: "2026-08-12",
      status: "healthy",
      version: 4,
      last_counted_at: "2026-08-04T09:00:00+07:00",
    },
  ],
  products: [
    {
      product_id: "PROD_LATTE",
      product_name: "Cà phê sữa",
      sku: "LATTE-01",
      price: "35000",
      active_recipe: {
        recipe_version_id: "recipe-v2",
        version: 2,
        effective_from: "2026-08-01",
        yield_quantity: "1",
        process_loss_rate: "0.04",
        lines: [
          {
            ingredient_id: "ING_MILK",
            ingredient_name: "Sữa tươi",
            quantity: "0.15",
            unit: "lít",
          },
        ],
      },
    },
  ],
  menu: [],
  recipes: [],
  supplier_constraints: [
    {
      constraint_id: "constraint-milk",
      ingredient_id: "ING_MILK",
      ingredient_name: "Sữa tươi",
      supplier_id: "SUP_1",
      supplier_name: "Nhà cung cấp A",
      unit_cost: "32000",
      moq: "12",
      pack_size: "12",
      lead_time_days: "2",
      unit: "lít",
      version: 5,
    },
  ],
  aliases: [],
  future_calendar: [],
  settings: {
    monthly_budget: "5000000",
    reserved_budget: "400000",
    spent_budget: "2100000",
    remaining_budget: "2500000",
    forecast_horizon: 14,
    default_strategy: "safe",
    version: 7,
  },
  latest_runs: {
    forecast_run_id: "forecast-latest",
    plan_run_id: "plan-latest",
  },
  data_freshness: {
    inventory_updated_at: "2026-08-04T09:00:00+07:00",
  },
};

test("business date follows the store timezone instead of the UTC calendar date", () => {
  const instant = new Date("2026-08-11T17:30:00.000Z");

  assert.equal(dateInTimeZone("Asia/Ho_Chi_Minh", instant), "2026-08-12");
  assert.equal(dateInTimeZone("UTC", instant), "2026-08-11");
});

const forecastResponse: ForecastRunResultResponse = {
  forecast_run_id: "forecast-42",
  status: "completed",
  cutoff_date: "2026-08-04",
  horizon_days: 2,
  model_version: "model-2026-08",
  predictions: [
    {
      product_id: "PROD_LATTE",
      product_name: "Cà phê sữa",
      target_date: "2026-08-06",
      horizon: 2,
      p25: "18.1",
      p50: "21.5",
      p75: "25.3",
      interval_lower: "16.4",
      interval_upper: "27.9",
      baseline_p50: "20.8",
      calibration_source: "rolling-28d",
      warnings: [{ code: "PROMOTION_SHIFT", message: "Có khuyến mãi" }],
    },
    {
      product_id: "PROD_LATTE",
      product_name: "Cà phê sữa",
      target_date: "2026-08-05",
      horizon: 1,
      p25: "16",
      p50: "20",
      p75: "24",
      interval_lower: "15",
      interval_upper: "26",
      baseline_p50: "19",
      calibration_source: "rolling-28d",
      warnings: [],
    },
  ],
};

const ingredientDemandResponse = {
  ingredient_demand_run_id: "demand-42",
  forecast_run_id: "forecast-42",
  status: "completed",
  predictions: [
    {
      ingredient_id: "ING_MILK",
      ingredient_name: "Sữa tươi",
      target_date: "2026-08-05",
      unit: "lít",
      p25: "2.4",
      p50: "3",
      p75: "3.6",
      contributions: [
        {
          product_id: "PROD_LATTE",
          product_name: "Cà phê sữa",
          p25: "2.4",
          p50: "3",
          p75: "3.6",
          quantity: "3",
          unit: "lít",
        },
      ],
      warnings: [],
    },
  ],
};

const corePlanningResponse = {
  procurement_plan_run_id: "core-plan-42",
  forecast_run_id: "forecast-42",
  status: "completed",
  recommended_strategy: "balanced",
  warnings: [{ code: "BUDGET_TIGHT", message: "Ngân sách sát ngưỡng" }],
  plans: [
    {
      strategy: "lean",
      feasible: true,
      metrics: { cost: "100000", shortage: "1.5", waste: "0", fill_rate: "0.91" },
      warnings: [],
      violations: [],
      lines: [
        {
          ingredient_id: "ING_MILK",
          supplier_id: "SUP_1",
          supplier_term_id: "TERM_1",
          order_date: "2026-08-04",
          expected_arrival_date: "2026-08-06",
          raw_required_quantity: "2",
          order_quantity: "12",
          rounding_excess: "10",
          unit: "lít",
          pack_count: "1",
          unit_cost: "32000",
          line_cost: "384000",
          moq: "12",
          pack_size: "12",
          lead_time_days: "2",
          reason_codes: ["ROUNDED_TO_MOQ"],
          warnings: [],
        },
      ],
    },
    {
      strategy: "balanced",
      feasible: false,
      metrics: { cost: "0", shortage: "3", waste: "0", fill_rate: "0.8" },
      warnings: [{ code: "SUPPLIER_MISSING", message: "Thiếu nhà cung cấp" }],
      violations: [{ code: "INFEASIBLE", message: "Không khả thi" }],
      lines: [
        {
          ingredient_id: "ING_MILK",
          supplier_id: null,
          supplier_term_id: null,
          order_date: "2026-08-04",
          expected_arrival_date: null,
          raw_required_quantity: "3",
          order_quantity: "0",
          rounding_excess: "0",
          unit: "lít",
          pack_count: null,
          unit_cost: null,
          line_cost: "0",
          moq: null,
          pack_size: null,
          lead_time_days: null,
          reason_codes: ["SUPPLIER_MISSING"],
          warnings: [{ code: "NO_SUPPLIER", message: "Không có nguồn cung" }],
        },
      ],
    },
    {
      strategy: "protected",
      feasible: true,
      metrics: { cost: "768000", shortage: "0", waste: "2", fill_rate: "1" },
      warnings: [],
      violations: [],
      lines: [],
    },
  ],
};

test("empty bootstrap has no invented store or operational data", () => {
  const empty = buildEmptyBootstrapData();
  assert.equal(empty.settings.storeId, "");
  assert.equal(empty.settings.storeName, "Chưa chọn cửa hàng");
  assert.equal(hasOperationalData(empty), false);
});

test("bootstrap preserves canonical lots, Decimal-like values, settings and versions", () => {
  const data = adaptBootstrap(buildEmptyBootstrapData(), bootstrapResponse);

  assert.equal(data.settings.storeId, "STORE_Q3");
  assert.equal(data.settings.monthlyBudget, 5_000_000);
  assert.equal(data.settings.reservedBudget, 400_000);
  assert.equal(data.settings.spentBudget, 2_100_000);
  assert.equal(data.settings.remainingBudget, 2_500_000);
  assert.equal(data.settings.forecastHorizon, 7, "frontend enforces the backend horizon cap");
  assert.equal(data.settings.defaultStrategy, "safe");
  assert.equal(data.settings.version, 7);

  const milk = data.inventory[0];
  assert.ok(milk);
  assert.equal(milk.onHand, 10);
  assert.equal(milk.usableQuantity, 7.5);
  assert.equal(milk.expiredQty, 2.5);
  assert.equal(milk.version, 4);
  assert.deepEqual(milk.lots?.map((lot) => lot.status), ["expired", "healthy"]);
  assert.deepEqual(milk.lots?.map((lot) => lot.lotId), ["lot-expired", "lot-healthy"]);
  assert.equal(milk.constraintVersion, 5);
  assert.equal(milk.safetyStock, null, "missing constraints are not invented locally");

  assert.equal(data.products[0]?.recipeVersion, 2);
  assert.equal(data.products[0]?.recipeYieldQuantity, 1);
  assert.equal(data.products[0]?.recipeProcessLossRate, 0.04);
});

test("bootstrap products inherit ITEM_TYPE from their matching Menu records", () => {
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapResponse,
    menu: [
      {
        product_id: "PROD_LATTE",
        product: "Cà phê sữa",
        sku: "LATTE-01",
        ITEM_TYPE: "single",
        price: "35000",
      },
      {
        product_id: "PROD_COMBO",
        product: "Combo buổi sáng",
        sku: "COMBO-01",
        ITEM_TYPE: "combo",
        price: "69000",
      },
    ],
    products: [
      ...bootstrapResponse.products,
      {
        product_id: "PROD_COMBO",
        product_name: "Combo buổi sáng",
        sku: "COMBO-01",
        price: "69000",
      },
    ],
  });

  assert.equal(data.products[0]?.itemType, "single");
  assert.equal(data.products[1]?.itemType, "combo");
  assert.equal(data.menu[1]?.itemType, "combo");
});

test("inventory retains lot_id for mutations and uses batch_id as the display code", () => {
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapResponse,
    inventory: [
      {
        ...bootstrapResponse.inventory[0],
        lot_id: "lot-internal-1",
        batch_id: "BATCH-2026-08-A",
      },
    ],
  });

  assert.equal(data.inventory[0]?.lots?.[0]?.lotId, "lot-internal-1");
  assert.equal(data.inventory[0]?.lots?.[0]?.batchId, "BATCH-2026-08-A");
  assert.equal(data.inventory[0]?.batchId, "BATCH-2026-08-A");
});

test("product forecasts retain persisted calibrated intervals and warnings", () => {
  const forecasts = adaptForecasts(forecastResponse);
  const latte = forecasts["Cà phê sữa"];

  assert.ok(latte);
  assert.equal(latte.productId, "PROD_LATTE");
  assert.deepEqual(latte.forecast.map((point) => point.date), [
    "2026-08-05",
    "2026-08-06",
  ]);
  assert.deepEqual(
    latte.forecast.map(({ p25, p50, p75, intervalLower, intervalUpper }) => ({
      p25,
      p50,
      p75,
      intervalLower,
      intervalUpper,
    })),
    [
      { p25: 16, p50: 20, p75: 24, intervalLower: 15, intervalUpper: 26 },
      { p25: 18.1, p50: 21.5, p75: 25.3, intervalLower: 16.4, intervalUpper: 27.9 },
    ],
  );
  assert.equal(latte.forecast[1]?.baselineP50, 20.8);
  assert.equal(latte.forecast[1]?.calibrationSource, "rolling-28d");
  assert.deepEqual(latte.forecast[1]?.warnings, ["Có khuyến mãi"]);
  assert.deepEqual(latte.totals, { p25: 34.1, p50: 41.5, p75: 49.3 });
  assert.equal(latte.invalidQuantileCount, 0);
});

test("crossing forecast quantiles are retained for audit but marked invalid", () => {
  const forecasts = adaptForecasts({
    forecast_run_id: "forecast-invalid",
    status: "completed",
    predictions: [{
      product_id: "PROD_INVALID",
      product_name: "Món kiểm thử",
      target_date: "2026-08-05",
      p25: 12,
      p50: 10,
      p75: 14,
      interval_lower: 8,
      interval_upper: 16,
    }],
  });
  const result = forecasts["Món kiểm thử"];

  assert.equal(result?.forecast[0]?.quantilesValid, false);
  assert.equal(result?.invalidQuantileCount, 1);
  assert.ok(result?.forecast[0]?.warnings?.includes("Dữ liệu dự báo không hợp lệ"));
});

test("ingredient demand retains product contributions", () => {
  const demand = adaptIngredientDemand(ingredientDemandResponse);
  const milk = demand.ING_MILK;

  assert.ok(milk);
  assert.deepEqual(milk.totals, { p25: 2.4, p50: 3, p75: 3.6 });
  assert.deepEqual(milk.contributions, [
    {
      productId: "PROD_LATTE",
      product: "Cà phê sữa",
      date: "2026-08-05",
      p25: 2.4,
      p50: 3,
      p75: 3.6,
      quantity: 3,
      unit: "lít",
    },
  ]);
});

test("forecast adapter deduplicates repeated product and target-date rows", () => {
  const forecasts = adaptForecasts({
    forecast_run_id: "forecast-dedup",
    status: "completed",
    predictions: [
      {
        product_id: "PROD_LATTE",
        product_name: "Cà phê sữa",
        target_date: "2026-08-12",
        p25: 16,
        p50: 20,
        p75: 24,
      },
      {
        product_id: "PROD_LATTE",
        product_name: "Cà phê sữa",
        target_date: "2026-08-12",
        p25: 16,
        p50: 20,
        p75: 24,
      },
    ],
  });

  assert.equal(forecasts["Cà phê sữa"]?.forecast.length, 1);
  assert.deepEqual(forecasts["Cà phê sữa"]?.totals, { p25: 16, p50: 20, p75: 24 });
});

test("core comparison retains all strategies, metrics and infeasible lines", () => {
  const data = adaptBootstrap(buildEmptyBootstrapData(), bootstrapResponse);
  const demand = adaptIngredientDemand(ingredientDemandResponse);
  const scenarios = adaptCorePlanning(data, demand, corePlanningResponse);

  assert.deepEqual(scenarios.map((scenario) => scenario.strategy), [
    "lean",
    "balanced",
    "protected",
  ]);
  assert.equal(scenarios[0]?.fillRate, 0.91);
  assert.equal(scenarios[0]?.shortage, 1.5);
  assert.equal(scenarios[1]?.feasible, false);
  assert.equal(scenarios[1]?.recommendations.length, 1);
  assert.equal(scenarios[1]?.recommendations[0]?.supplierId, undefined);
  assert.equal(scenarios[1]?.recommendations[0]?.orderQty, 0);
  assert.deepEqual(scenarios[1]?.warnings, ["Thiếu nhà cung cấp"]);
  assert.deepEqual(scenarios[1]?.violations, ["Không khả thi"]);
});

test("workflow adapter exposes one auditable persisted snapshot", () => {
  const data = adaptBootstrap(buildEmptyBootstrapData(), bootstrapResponse);
  const plan = adaptPlanningWorkflow(
    data,
    "Cân bằng",
    forecastResponse,
    ingredientDemandResponse,
    corePlanningResponse,
  );

  assert.equal(plan.status, "completed");
  assert.equal(plan.forecastRunId, "forecast-42");
  assert.equal(plan.ingredientDemandRunId, "demand-42");
  assert.equal(plan.procurementPlanRunId, "core-plan-42");
  assert.equal(plan.scenarios.length, 3);
  assert.equal(plan.recommendations[0]?.supplierId, undefined);
  assert.equal(plan.recommendations[0]?.orderQty, 0);
  assert.equal(plan.budget?.plannedCost, 0);
  assert.equal(plan.recommendedStrategy, "balanced");
  assert.ok(plan.warnings?.includes("Ngân sách sát ngưỡng"));
});

test("UI, core and legacy strategy mappings are explicit and reversible", () => {
  assert.deepEqual(
    (["Tiết kiệm", "Cân bằng", "An toàn"] as const).map((strategy) => ({
      strategy,
      core: strategyToCore(strategy),
      legacy: strategyToApi(strategy),
    })),
    [
      { strategy: "Tiết kiệm", core: "lean", legacy: "economy" },
      { strategy: "Cân bằng", core: "balanced", legacy: "balanced" },
      { strategy: "An toàn", core: "protected", legacy: "safe" },
    ],
  );
  assert.equal(strategyFromCore("lean"), "Tiết kiệm");
  assert.equal(strategyFromCore("protected"), "An toàn");
  assert.equal(strategyFromApi("economy"), "Tiết kiệm");
  assert.equal(strategyFromApi("safe"), "An toàn");
});

test("purchase-order adapter preserves the backend lifecycle and lot receipt totals", () => {
  const [order] = adaptOrders({
    orders: [
      {
        po_id: "PO-42",
        supplier_id: "SUP_1",
        supplier_name: "Nhà cung cấp A",
        order_date: "2026-08-04",
        expected_delivery_date: "2026-08-06",
        strategy: "balanced",
        status: "partially_received",
        version: 3,
        total_amount: "384000",
        lines: [
          {
            po_line_id: "PO-LINE-1",
            ingredient_id: "ING_MILK",
            ingredient_name: "Sữa tươi",
            order_quantity: "12",
            received_quantity: "5",
            remaining_quantity: "7",
            unit: "lít",
            unit_cost: "32000",
          },
        ],
      },
    ],
  });

  assert.ok(order);
  assert.equal(order.status, "partially_received");
  assert.equal(order.version, 3);
  assert.equal(order.lines[0]?.poLineId, "PO-LINE-1");
  assert.equal(order.lines[0]?.receivedQuantity, 5);
  assert.equal(order.lines[0]?.remainingQuantity, 7);
});

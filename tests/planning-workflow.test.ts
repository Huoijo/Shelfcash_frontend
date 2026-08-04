import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningWorkflowDependencies } from "../lib/planning-workflow.ts";
import {
  createDraftOrdersFromLegacyPlan,
  eligiblePurchaseOrderLines,
  runLegacyPurchaseOrderBridge,
  runPlanningWorkflow,
} from "../lib/planning-workflow.ts";
import type { Recommendation, Strategy } from "../lib/types.ts";

interface RecordedCall {
  name: string;
  input: unknown;
}

function dependencies(calls: RecordedCall[]): PlanningWorkflowDependencies {
  let keySequence = 0;
  return {
    createIdempotencyKey: () => `idem-${++keySequence}`,
    createForecastRun: async (input) => {
      calls.push({ name: "forecast:create", input });
      return {
        forecast_run_id: "forecast-1",
        status: "running",
        cutoff_date: input.cutoffDate,
        horizon_days: input.horizonDays,
      };
    },
    waitForForecastResult: async (storeId, forecastRunId, options) => {
      calls.push({
        name: "forecast:wait",
        input: { storeId, forecastRunId, options },
      });
      return {
        forecast_run_id: forecastRunId,
        store_id: storeId,
        status: "completed",
        cutoff_date: "2026-08-04",
        horizon_days: 7,
        predictions: [
          {
            product_id: "PROD_1",
            product_name: "Sinh tố chuối",
            target_date: "2026-08-05",
            horizon: 1,
            p25: 8,
            p50: 10,
            p75: 13,
            interval_lower: 7,
            interval_upper: 14,
            baseline_p50: 9,
            calibration_source: "rolling",
            warnings: [],
          },
        ],
      };
    },
    createIngredientDemand: async (input) => {
      calls.push({ name: "demand:create", input });
      return {
        ingredient_demand_run_id: "demand-1",
        forecast_run_id: input.forecastRunId,
        status: "running",
      };
    },
    waitForIngredientDemand: async (storeId, forecastRunId, options) => {
      calls.push({
        name: "demand:wait",
        input: { storeId, forecastRunId, options },
      });
      return {
        ingredient_demand_run_id: "demand-1",
        forecast_run_id: forecastRunId,
        store_id: storeId,
        status: "completed",
        predictions: [],
      };
    },
    createProcurementPlans: async (input) => {
      calls.push({ name: "core:create", input });
      return {
        procurement_plan_run_id: "core-1",
        forecast_run_id: input.forecastRunId,
        status: "running",
        plans: [],
      };
    },
    waitForProcurementPlans: async (input) => {
      calls.push({ name: "core:wait", input });
      return {
        procurement_plan_run_id: input.procurementPlanRunId,
        forecast_run_id: input.forecastRunId,
        store_id: input.storeId,
        status: "completed",
        recommended_strategy: "balanced",
        plans: [
          { strategy: "lean", feasible: true, lines: [] },
          { strategy: "balanced", feasible: true, lines: [] },
          { strategy: "protected", feasible: true, lines: [] },
        ],
      };
    },
    createPlanRun: async (input) => {
      calls.push({ name: "legacy:create", input });
      return {
        plan_run_id: "legacy-1",
        status: "running",
        strategy: input.strategy,
      };
    },
    waitForPlanResult: async (storeId, planRunId, options) => {
      calls.push({
        name: "legacy:wait",
        input: { storeId, planRunId, options },
      });
      return {
        plan_run_id: planRunId,
        status: "completed",
        strategy: "balanced",
        recommendations: [],
      };
    },
    createPurchaseOrders: async (input) => {
      calls.push({ name: "po:create", input });
      return {
        orders: [
          {
            po_id: "PO-1",
            status: "draft",
            version: 1,
            lines: [],
          },
        ],
      };
    },
  } as PlanningWorkflowDependencies;
}

function recommendation(
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    recommendationId: "REC-1",
    ingredientId: "ING-1",
    supplierId: "SUP-1",
    ingredient: "Sữa tươi",
    unit: "lít",
    status: "Sử dụng được",
    statusKey: "healthy",
    onHand: 4,
    usableStock: 4,
    forecastDemand: 12,
    safetyStock: 2,
    inbound: 0,
    recommendedQty: 10,
    orderQty: 12,
    unitCost: 32_000,
    cost: 384_000,
    supplier: "Nhà cung cấp A",
    moq: 12,
    packSize: 12,
    leadTimeDays: 2,
    expiryRiskQty: 0,
    capacityWarning: false,
    reason: "Backend recommendation",
    ...overrides,
  };
}

test("planning workflow calls forecast, ingredient demand and all core strategies in order", async () => {
  const calls: RecordedCall[] = [];
  const result = await runPlanningWorkflow(
    {
      storeId: "STORE_Q3",
      cutoffDate: "2026-08-04",
      horizonDays: 7,
      remainingBudget: 2_500_000,
    },
    dependencies(calls),
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "forecast:create",
    "forecast:wait",
    "demand:create",
    "demand:wait",
    "core:create",
    "core:wait",
  ]);
  assert.equal(
    calls.some((call) => call.name.startsWith("legacy") || call.name === "po:create"),
    false,
    "comparison must not invoke the legacy bridge or create POs",
  );

  const forecastInput = calls[0]?.input as Record<string, unknown>;
  assert.deepEqual(forecastInput.productIds, []);
  assert.deepEqual(forecastInput.ingredientIds, []);
  assert.equal(forecastInput.idempotencyKey, "idem-1");

  const demandInput = calls[2]?.input as Record<string, unknown>;
  assert.equal(demandInput.forecastRunId, "forecast-1");
  assert.equal(demandInput.idempotencyKey, "idem-2");

  const coreInput = calls[4]?.input as Record<string, unknown>;
  assert.deepEqual(coreInput.strategies, ["lean", "balanced", "protected"]);
  assert.equal(coreInput.useOpenPurchaseOrders, true);
  assert.equal(coreInput.budgetOverride, 2_500_000);
  assert.equal(coreInput.idempotencyKey, "idem-3");

  assert.equal(result.forecast.forecast_run_id, "forecast-1");
  assert.equal(result.ingredientDemand.ingredient_demand_run_id, "demand-1");
  assert.equal(result.procurementPlans.procurement_plan_run_id, "core-1");
  assert.deepEqual(
    result.procurementPlans.plans?.map((plan) => plan.strategy),
    ["lean", "balanced", "protected"],
  );
});

test("planning requires a confirmed store before making any backend call", async () => {
  const calls: RecordedCall[] = [];
  await assert.rejects(
    runPlanningWorkflow(
      {
        storeId: "   ",
        cutoffDate: "2026-08-04",
        horizonDays: 7,
        remainingBudget: 0,
      },
      dependencies(calls),
    ),
    /confirmed store/i,
  );
  assert.deepEqual(calls, []);
});

test("legacy mapping is invoked only by the pre-PO bridge with the exact snapshot", async (t) => {
  const cases: Array<{ strategy: Strategy; legacy: string }> = [
    { strategy: "Tiết kiệm", legacy: "economy" },
    { strategy: "Cân bằng", legacy: "balanced" },
    { strategy: "An toàn", legacy: "safe" },
  ];

  for (const current of cases) {
    await t.test(`${current.strategy} -> ${current.legacy}`, async () => {
      const calls: RecordedCall[] = [];
      const bridge = await runLegacyPurchaseOrderBridge(
        {
          storeId: "STORE_Q3",
          forecastRunId: "forecast-persisted",
          forecastCutoffDate: "2026-08-04",
          strategy: current.strategy,
          remainingBudget: 1_234_567,
        },
        dependencies(calls),
      );

      assert.deepEqual(calls.map((call) => call.name), [
        "legacy:create",
        "legacy:wait",
      ]);
      const input = calls[0]?.input as Record<string, unknown>;
      assert.equal(input.forecastRunId, "forecast-persisted");
      assert.equal(input.asOfDate, "2026-08-04");
      assert.equal(input.budgetLimit, 1_234_567);
      assert.equal(input.strategy, current.legacy);
      assert.equal(input.includeOpenPurchaseOrders, true);
      assert.equal(input.idempotencyKey, "idem-1");
      assert.equal(bridge.run.plan_run_id, "legacy-1");
      assert.equal(calls.some((call) => call.name === "po:create"), false);
    });
  }
});

test("PO creation sends only recommendation-backed, supplier-backed positive lines", async () => {
  const valid = recommendation();
  const noSupplier = recommendation({
    recommendationId: "REC-NO-SUPPLIER",
    supplierId: undefined,
  });
  const zeroQuantity = recommendation({
    recommendationId: "REC-ZERO",
    orderQty: 0,
  });
  const noRecommendation = recommendation({
    recommendationId: undefined,
    orderQty: 5,
  });

  assert.deepEqual(
    eligiblePurchaseOrderLines([
      valid,
      noSupplier,
      zeroQuantity,
      noRecommendation,
    ]),
    [{ recommendationId: "REC-1", orderQuantityOverride: 12 }],
  );

  const calls: RecordedCall[] = [];
  const response = await createDraftOrdersFromLegacyPlan(
    {
      storeId: "STORE_Q3",
      planRunId: "legacy-1",
      recommendations: [valid, noSupplier, zeroQuantity, noRecommendation],
    },
    dependencies(calls),
  );

  assert.deepEqual(calls.map((call) => call.name), ["po:create"]);
  const input = calls[0]?.input as Record<string, unknown>;
  assert.equal(input.planRunId, "legacy-1");
  assert.equal(input.idempotencyKey, "idem-1");
  assert.deepEqual(input.lines, [
    { recommendationId: "REC-1", orderQuantityOverride: 12 },
  ]);
  assert.equal(response.orders[0]?.status, "draft");
});

test("PO creation fails locally when every legacy recommendation is ineligible", async () => {
  const calls: RecordedCall[] = [];
  await assert.rejects(
    createDraftOrdersFromLegacyPlan(
      {
        storeId: "STORE_Q3",
        planRunId: "legacy-1",
        recommendations: [
          recommendation({ supplierId: undefined }),
          recommendation({ orderQty: 0 }),
        ],
      },
      dependencies(calls),
    ),
    /không có dòng hợp lệ/i,
  );
  assert.deepEqual(calls, []);
});

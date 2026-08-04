import type {
  ForecastRunMetadata,
  ForecastRunResult,
  IngredientDemandRun,
  ProcurementPlanRun,
  PurchaseOrderCreateResponse,
} from "./api-contract";
import {
  createForecastRun,
  createIdempotencyKey,
  createIngredientDemand,
  createPlanRun,
  createProcurementPlans,
  createPurchaseOrders,
  waitForForecastResult,
  waitForIngredientDemand,
  waitForPlanResult,
  waitForProcurementPlans,
} from "./shelfcash-client";
import type {
  PlanRunResponse,
  PlanRunResultResponse,
  Recommendation,
  Strategy,
} from "./types";
import { strategyToApi } from "./contract-adapters";

export interface PlanningWorkflowSnapshot {
  forecast: ForecastRunResult;
  ingredientDemand: IngredientDemandRun;
  procurementPlans: ProcurementPlanRun;
}

export interface PlanningWorkflowDependencies {
  createForecastRun: typeof createForecastRun;
  waitForForecastResult: typeof waitForForecastResult;
  createIngredientDemand: typeof createIngredientDemand;
  waitForIngredientDemand: typeof waitForIngredientDemand;
  createProcurementPlans: typeof createProcurementPlans;
  waitForProcurementPlans: typeof waitForProcurementPlans;
  createPlanRun: typeof createPlanRun;
  waitForPlanResult: typeof waitForPlanResult;
  createPurchaseOrders: typeof createPurchaseOrders;
  createIdempotencyKey: typeof createIdempotencyKey;
}

const defaultDependencies: PlanningWorkflowDependencies = {
  createForecastRun,
  waitForForecastResult,
  createIngredientDemand,
  waitForIngredientDemand,
  createProcurementPlans,
  waitForProcurementPlans,
  createPlanRun,
  waitForPlanResult,
  createPurchaseOrders,
  createIdempotencyKey,
};

export async function runPlanningWorkflow(
  input: {
    storeId: string;
    cutoffDate: string;
    horizonDays: number;
    remainingBudget: number;
    signal?: AbortSignal;
    idempotencyKeys?: {
      forecast: string;
      ingredientDemand: string;
      procurementPlans: string;
    };
  },
  dependencies: PlanningWorkflowDependencies = defaultDependencies,
): Promise<PlanningWorkflowSnapshot> {
  if (!input.storeId.trim()) throw new Error("A confirmed store is required.");

  const forecastRun: ForecastRunMetadata = await dependencies.createForecastRun({
    storeId: input.storeId,
    cutoffDate: input.cutoffDate,
    horizonDays: input.horizonDays,
    productIds: [],
    ingredientIds: [],
    idempotencyKey:
      input.idempotencyKeys?.forecast ?? dependencies.createIdempotencyKey(),
    signal: input.signal,
  });
  const forecast = await dependencies.waitForForecastResult(
    input.storeId,
    forecastRun.forecast_run_id,
    { signal: input.signal },
  );

  await dependencies.createIngredientDemand({
    storeId: input.storeId,
    forecastRunId: forecast.forecast_run_id,
    idempotencyKey:
      input.idempotencyKeys?.ingredientDemand ??
      dependencies.createIdempotencyKey(),
    signal: input.signal,
  });
  const ingredientDemand = await dependencies.waitForIngredientDemand(
    input.storeId,
    forecast.forecast_run_id,
    { signal: input.signal },
  );

  const procurementRun = await dependencies.createProcurementPlans({
    storeId: input.storeId,
    forecastRunId: forecast.forecast_run_id,
    strategies: ["lean", "balanced", "protected"],
    useOpenPurchaseOrders: true,
    budgetOverride: input.remainingBudget,
    idempotencyKey:
      input.idempotencyKeys?.procurementPlans ??
      dependencies.createIdempotencyKey(),
    signal: input.signal,
  });
  const procurementPlans = await dependencies.waitForProcurementPlans({
    storeId: input.storeId,
    forecastRunId: forecast.forecast_run_id,
    procurementPlanRunId: procurementRun.procurement_plan_run_id,
    options: { signal: input.signal },
  });

  return { forecast, ingredientDemand, procurementPlans };
}

export interface LegacyBridgeResult {
  run: PlanRunResponse;
  result: PlanRunResultResponse;
}

export async function runLegacyPurchaseOrderBridge(
  input: {
    storeId: string;
    forecastRunId: string;
    forecastCutoffDate: string;
    strategy: Strategy;
    remainingBudget: number;
    signal?: AbortSignal;
    idempotencyKey?: string;
  },
  dependencies: PlanningWorkflowDependencies = defaultDependencies,
): Promise<LegacyBridgeResult> {
  const run = await dependencies.createPlanRun({
    storeId: input.storeId,
    forecastRunId: input.forecastRunId,
    strategy: strategyToApi(input.strategy),
    budgetLimit: input.remainingBudget,
    asOfDate: input.forecastCutoffDate,
    includeOpenPurchaseOrders: true,
    idempotencyKey:
      input.idempotencyKey ?? dependencies.createIdempotencyKey(),
    signal: input.signal,
  });
  const result = await dependencies.waitForPlanResult(
    input.storeId,
    run.plan_run_id,
    { signal: input.signal },
  );
  return { run, result };
}

export function eligiblePurchaseOrderLines(
  recommendations: Recommendation[],
): Array<{ recommendationId: string; orderQuantityOverride: number }> {
  return recommendations.flatMap((line) =>
    line.recommendationId && line.supplierId && line.orderQty > 0
      ? [
          {
            recommendationId: line.recommendationId,
            orderQuantityOverride: line.orderQty,
          },
        ]
      : [],
  );
}

export async function createDraftOrdersFromLegacyPlan(
  input: {
    storeId: string;
    planRunId: string;
    recommendations: Recommendation[];
    signal?: AbortSignal;
    idempotencyKey?: string;
  },
  dependencies: PlanningWorkflowDependencies = defaultDependencies,
): Promise<PurchaseOrderCreateResponse> {
  const lines = eligiblePurchaseOrderLines(input.recommendations);
  if (!lines.length) {
    throw new Error(
      "Không có dòng hợp lệ với recommendation_id và nhà cung cấp để tạo đơn nháp.",
    );
  }
  return dependencies.createPurchaseOrders({
    storeId: input.storeId,
    planRunId: input.planRunId,
    lines,
    idempotencyKey:
      input.idempotencyKey ?? dependencies.createIdempotencyKey(),
    signal: input.signal,
  });
}

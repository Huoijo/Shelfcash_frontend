import type { ApiRecord, DecisionPackage } from "./types";
import type { ForecastRunMetadata, ForecastRunResult } from "./api-contract";
import {
  createDecisionRun,
  createForecastRun,
  trainForecastModel,
  waitForDecisionRun,
  waitForForecastResult,
  ShelfCashApiError,
} from "./shelfcash-client";
import { buildDecisionRunRequest } from "./decision-run";

export type SimulationStage =
  | "preparing"
  | "checking-model"
  | "training-model"
  | "creating-forecast"
  | "waiting-forecast"
  | "running-decision"
  | "completed";

export interface SimulationProgress {
  stage: SimulationStage;
  message: string;
  trainingRequired: boolean;
}

export interface SimulationDependencies {
  createForecastRun: typeof createForecastRun;
  waitForForecastResult: typeof waitForForecastResult;
  trainForecastModel: typeof trainForecastModel;
  createDecisionRun: typeof createDecisionRun;
  waitForDecisionRun: typeof waitForDecisionRun;
}

const dependencies: SimulationDependencies = {
  createForecastRun,
  waitForForecastResult,
  trainForecastModel,
  createDecisionRun,
  waitForDecisionRun,
};

function isModelNotReady(error: unknown): boolean {
  return error instanceof ShelfCashApiError && error.code === "MODEL_NOT_READY";
}

function ensureReady(training: ApiRecord): void {
  if (String(training.status ?? "").toLowerCase() === "ready") return;
  throw new Error(
    String(training.message ?? "Forecast model chưa sẵn sàng sau khi huấn luyện."),
  );
}

export async function runSimulationAttempt(
  input: {
    attemptId: number;
    storeId: string;
    cutoffDate: string;
    horizonDays: number;
    includeOpenPurchaseOrders: boolean;
    budgetOverride?: number;
    monthlyBudget: number;
    engineMode?: "legacy" | "deterministic" | "stochastic";
    modelVersion?: string;
    historyDays?: number;
    signal?: AbortSignal;
    onProgress?: (progress: SimulationProgress) => void;
  },
  api: SimulationDependencies = dependencies,
): Promise<{ forecast: ForecastRunResult; decision: DecisionPackage }> {
  const progress = (stage: SimulationStage, message: string, trainingRequired = false) =>
    input.onProgress?.({ stage, message, trainingRequired });
  const prefix = `simulation:${input.storeId}:${input.cutoffDate}:${input.horizonDays}:attempt:${input.attemptId}`;
  const createForecast = (phase: "forecast" | "forecast-after-train") =>
    api.createForecastRun({
      storeId: input.storeId,
      cutoffDate: input.cutoffDate,
      horizonDays: input.horizonDays,
      productIds: [],
      ingredientIds: [],
      idempotencyKey: `${prefix}:${phase}`,
      signal: input.signal,
    });

  progress("preparing", "Đang chuẩn bị dữ liệu mô phỏng…");
  progress("checking-model", "Đang chuẩn bị dự báo bán hàng…");
  let forecastRun: ForecastRunMetadata;
  try {
    progress("creating-forecast", "Đang tạo dự báo 7 ngày…");
    forecastRun = await createForecast("forecast");
  } catch (error) {
    if (!isModelNotReady(error)) throw error;
    progress("training-model", "Chưa có model sẵn sàng, đang huấn luyện forecast…", true);
    const training = await api.trainForecastModel({
      storeId: input.storeId,
      cutoffDate: input.cutoffDate,
      ...(input.modelVersion?.trim() ? { modelVersion: input.modelVersion.trim() } : {}),
      ...(input.historyDays !== undefined ? { historyDays: input.historyDays } : {}),
      idempotencyKey: `${prefix}:train`,
      signal: input.signal,
      timeoutMs: 10 * 60_000,
    });
    ensureReady(training);
    progress("creating-forecast", "Forecast model đã sẵn sàng. Đang tạo dự báo 7 ngày…", true);
    forecastRun = await createForecast("forecast-after-train");
  }

  progress("waiting-forecast", "Đang tạo dự báo 7 ngày…");
  const forecast = await api.waitForForecastResult(
    input.storeId,
    forecastRun.forecast_run_id,
    { signal: input.signal },
  );
  progress("running-decision", "Đang mô phỏng tồn kho và kế hoạch nhập…");
  const createdDecision = await api.createDecisionRun({
    storeId: input.storeId,
    request: buildDecisionRunRequest({
      forecastRunId: forecast.forecast_run_id,
      asOfDate: input.cutoffDate,
      horizonDays: input.horizonDays,
      includeOpenPurchaseOrders: input.includeOpenPurchaseOrders,
      budgetOverride: input.budgetOverride,
      monthlyBudget: input.monthlyBudget,
      engineMode: input.engineMode,
    }),
    signal: input.signal,
  });
  const decision = await api.waitForDecisionRun(
    createdDecision.decision_run_id,
    createdDecision,
    { signal: input.signal },
  );
  progress(
    "completed",
    decision.status === "completed_with_no_feasible_recommendation"
      ? "Mô phỏng hoàn tất, chưa có phương án nhập khả thi."
      : "Mô phỏng đã hoàn tất.",
  );
  return { forecast, decision };
}

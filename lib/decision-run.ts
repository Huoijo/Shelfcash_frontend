import type { CreateDecisionRunRequest, DecisionRunStatus } from "./types";

export const DECISION_SCENARIO_COUNT = 100;
export const DECISION_RANDOM_SEED = 42;
/** Business cutoff selected for the current Decision simulation period. */
export const DECISION_CUTOFF_DATE = "2026-08-20";

export function buildDecisionRunRequest(input: {
  forecastRunId: string;
  asOfDate: string;
  horizonDays: number;
  includeOpenPurchaseOrders: boolean;
  budgetOverride?: number;
  monthlyBudget: number;
}): CreateDecisionRunRequest {
  return {
    forecast_run_id: input.forecastRunId,
    as_of_date: input.asOfDate,
    horizon_days: input.horizonDays,
    engine_mode: "deterministic",
    include_open_purchase_orders: input.includeOpenPurchaseOrders,
    budget_override: input.budgetOverride ?? input.monthlyBudget,
    scenario_count: DECISION_SCENARIO_COUNT,
    random_seed: DECISION_RANDOM_SEED,
  };
}

export type DecisionRunLifecycle =
  | "processing"
  | "completed"
  | "failed"
  | "unknown";

/**
 * Decision runs use `status` as their lifecycle. Engine metadata must never
 * control polling because a completed run can still carry engine warnings.
 */
export function decisionRunLifecycle(status: unknown): DecisionRunLifecycle {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued":
    case "running":
      return "processing";
    case "completed":
    case "completed_with_no_feasible_recommendation":
      return "completed";
    case "failed":
    case "blocked":
      return "failed";
    default:
      return "unknown";
  }
}

export function shouldPollDecisionRun(status: unknown): boolean {
  return decisionRunLifecycle(status) === "processing";
}

export function isTerminalDecisionRunStatus(status: unknown): boolean {
  const lifecycle = decisionRunLifecycle(status);
  return lifecycle === "completed" || lifecycle === "failed" || lifecycle === "unknown";
}

export function isDecisionRunStatus(value: unknown): value is DecisionRunStatus {
  return decisionRunLifecycle(value) !== "unknown";
}

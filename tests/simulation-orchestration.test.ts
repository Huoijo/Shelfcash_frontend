import assert from "node:assert/strict";
import test from "node:test";
import { runSimulationAttempt } from "../lib/simulation-orchestration.ts";
import { ShelfCashApiError } from "../lib/shelfcash-client.ts";

function fakeApi(options: { modelReady?: boolean; decisionStatus?: string } = {}) {
  const calls: string[] = [];
  let forecastCreates = 0;
  return {
    calls,
    api: {
      createForecastRun: async () => {
        calls.push("forecast:create");
        forecastCreates += 1;
        if (options.modelReady === false && forecastCreates === 1) {
          throw new ShelfCashApiError(
            { code: "MODEL_NOT_READY", message: "Model chưa sẵn sàng", details: {}, request_id: null },
            503,
          );
        }
        return { forecast_run_id: `forecast-${forecastCreates}`, status: "running" };
      },
      waitForForecastResult: async (_storeId: string, forecastRunId: string) => {
        calls.push("forecast:wait-result");
        return { forecast_run_id: forecastRunId, status: "completed", predictions: [] };
      },
      trainForecastModel: async () => {
        calls.push("forecast:train");
        return { status: "ready" };
      },
      createDecisionRun: async (input: { request: { forecast_run_id: string } }) => {
        calls.push(`decision:create:${input.request.forecast_run_id}`);
        return { decision_run_id: "decision-1", status: "running" };
      },
      waitForDecisionRun: async () => {
        calls.push("decision:wait");
        return {
          decision_run_id: "decision-1",
          status: options.decisionStatus ?? "completed",
        };
      },
    },
  };
}

function input() {
  return {
    attemptId: 1,
    storeId: "STORE_001",
    cutoffDate: "2026-08-17",
    horizonDays: 7,
    includeOpenPurchaseOrders: true,
    monthlyBudget: 5_000_000,
  };
}

test("ready model creates forecast then runs the canonical decision flow without training", async () => {
  const fake = fakeApi();
  await runSimulationAttempt(input(), fake.api as never);
  assert.deepEqual(fake.calls, [
    "forecast:create",
    "forecast:wait-result",
    "decision:create:forecast-1",
    "decision:wait",
  ]);
});

test("MODEL_NOT_READY trains once then creates a separate forecast run", async () => {
  const fake = fakeApi({ modelReady: false });
  const progress: string[] = [];
  await runSimulationAttempt({ ...input(), onProgress: (event) => progress.push(event.stage) }, fake.api as never);
  assert.deepEqual(fake.calls, [
    "forecast:create",
    "forecast:train",
    "forecast:create",
    "forecast:wait-result",
    "decision:create:forecast-2",
    "decision:wait",
  ]);
  assert.equal(progress.filter((stage) => stage === "training-model").length, 1);
});

test("a second MODEL_NOT_READY is surfaced and does not create a decision run", async () => {
  const fake = fakeApi({ modelReady: false });
  fake.api.createForecastRun = async () => {
    fake.calls.push("forecast:create");
    throw new ShelfCashApiError(
      { code: "MODEL_NOT_READY", message: "Model chưa sẵn sàng", details: {}, request_id: null },
      503,
    );
  };
  await assert.rejects(() => runSimulationAttempt(input(), fake.api as never), /Model chưa sẵn sàng/);
  assert.deepEqual(fake.calls, ["forecast:create", "forecast:train", "forecast:create"]);
});

test("no-feasible decision remains a successful simulation result", async () => {
  const fake = fakeApi({ decisionStatus: "completed_with_no_feasible_recommendation" });
  const result = await runSimulationAttempt(input(), fake.api as never);
  assert.equal(result.decision.status, "completed_with_no_feasible_recommendation");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDecisionRunRequest,
  decisionRunLifecycle,
  isTerminalDecisionRunStatus,
  shouldPollDecisionRun,
} from "../lib/decision-run.ts";

test("simulation request includes the complete deterministic decision contract", () => {
  assert.deepEqual(
    buildDecisionRunRequest({
      forecastRunId: "d3c0ef9a-59f7-421d-9dc4-265a9b6e4376",
      asOfDate: "2026-08-12",
      horizonDays: 7,
      includeOpenPurchaseOrders: true,
      monthlyBudget: 50_000_000,
    }),
    {
      forecast_run_id: "d3c0ef9a-59f7-421d-9dc4-265a9b6e4376",
      as_of_date: "2026-08-12",
      horizon_days: 7,
      engine_mode: "deterministic",
      include_open_purchase_orders: true,
      budget_override: 50_000_000,
      scenario_count: 100,
      random_seed: 42,
    },
  );
});

test("decision run lifecycle polls only canonical non-terminal statuses", () => {
  assert.equal(decisionRunLifecycle("queued"), "processing");
  assert.equal(decisionRunLifecycle("running"), "processing");
  assert.equal(shouldPollDecisionRun("queued"), true);
  assert.equal(shouldPollDecisionRun("running"), true);
  assert.equal(shouldPollDecisionRun("completed"), false);
  assert.equal(
    shouldPollDecisionRun("completed_with_no_feasible_recommendation"),
    false,
  );
  assert.equal(shouldPollDecisionRun("blocked"), false);
  assert.equal(shouldPollDecisionRun("failed"), false);
});

test("completed and non-feasible result statuses remain terminal", () => {
  assert.equal(decisionRunLifecycle("completed"), "completed");
  assert.equal(isTerminalDecisionRunStatus("completed"), true);
  assert.equal(
    isTerminalDecisionRunStatus("completed_with_no_feasible_recommendation"),
    true,
  );
  assert.equal(isTerminalDecisionRunStatus("failed"), true);
  assert.equal(isTerminalDecisionRunStatus("blocked"), true);
});

test("an unknown decision status fails safe instead of polling forever", () => {
  assert.equal(decisionRunLifecycle("awaiting_review"), "unknown");
  assert.equal(shouldPollDecisionRun("awaiting_review"), false);
  assert.equal(isTerminalDecisionRunStatus("awaiting_review"), true);
});

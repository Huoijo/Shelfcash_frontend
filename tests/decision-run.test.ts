import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDecisionRunRequest,
  decisionRunLifecycle,
  isTerminalDecisionRunStatus,
  shouldPollDecisionRun,
} from "../lib/decision-run.ts";
import type { DecisionBriefFacts } from "../lib/types.ts";

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

  assert.equal(
    buildDecisionRunRequest({
      forecastRunId: "d3c0ef9a-59f7-421d-9dc4-265a9b6e4376",
      asOfDate: "2026-08-12",
      horizonDays: 7,
      includeOpenPurchaseOrders: true,
      monthlyBudget: 50_000_000,
      engineMode: "stochastic",
    }).engine_mode,
    "stochastic",
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

test("DecisionBriefFacts accepts strategy_selection_presentation for selected outcome", () => {
  const brief: DecisionBriefFacts = {
    decision_run_id: "dr-selected",
    store_id: "store-1",
    status: "completed",
    forecast: {
      forecast_run_id: "f-1",
      model_version: "lgbm-v1",
      horizon_days: 7,
      cutoff_date: "2026-09-21",
    },
    recommendation: {
      available: true,
      strategy: "balanced",
      summary: "Chọn phương án Cân bằng",
      total_purchase_cost: 15_000_000,
      expected_fill_rate: 0.98,
    },
    procurement_rows: [],
    ingredient_demand: [],
    risk: {
      stockout_probability: 0.02,
      expected_fill_rate: 0.98,
      shortage_quantity: 0,
      waste_quantity: 0,
    },
    critic: { hard_violations: [], warnings: [] },
    evidence: [],
    data_availability: {},
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "selected",
      selected_strategy: "balanced",
      headline: "Đã chọn phương án Cân bằng.",
      summary: "Phương án Cân bằng là lựa chọn khả thi phù hợp nhất.",
      strategy_notes: [
        {
          strategy: "lean",
          label: "Tiết kiệm",
          status: "rejected",
          status_label: "Bị loại",
          headline: "Phương án Tiết kiệm",
          message: "Bị loại vì chi phí vượt ngân sách.",
          detail_lines: ["Mức đáp ứng nhu cầu thấp hơn yêu cầu."],
          reason_codes: ["BUDGET"],
          evidence_ids: ["evidence-1"],
        },
        {
          strategy: "balanced",
          label: "Cân bằng",
          status: "selected",
          status_label: "Được chọn",
          headline: "Phương án Cân bằng",
          message: "Được chọn vì là phương án khả thi có chi phí thấp nhất.",
          detail_lines: [],
          reason_codes: ["LOWEST_EXACT_VALID_CANDIDATE_COST"],
          evidence_ids: ["evidence-2"],
        },
      ],
    },
  };
  assert.equal(brief.strategy_selection_presentation?.outcome, "selected");
  assert.equal(brief.strategy_selection_presentation?.selected_strategy, "balanced");
  assert.equal(brief.strategy_selection_presentation?.strategy_notes.length, 2);
});

test("DecisionBriefFacts accepts strategy_selection_presentation for no_feasible_strategy outcome", () => {
  const brief: DecisionBriefFacts = {
    decision_run_id: "dr-no-feasible",
    store_id: "store-1",
    status: "completed_with_no_feasible_recommendation",
    forecast: {
      forecast_run_id: "f-1",
      model_version: "lgbm-v1",
      horizon_days: 7,
      cutoff_date: "2026-09-21",
    },
    recommendation: {
      available: false,
      strategy: null,
      summary: null,
      total_purchase_cost: null,
      expected_fill_rate: null,
    },
    procurement_rows: [],
    ingredient_demand: [],
    risk: {
      stockout_probability: 0.85,
      expected_fill_rate: 0.60,
      shortage_quantity: 45,
      waste_quantity: 0,
    },
    critic: { hard_violations: ["BUDGET_EXCEEDED"], warnings: [] },
    evidence: [],
    data_availability: {},
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "no_feasible_strategy",
      selected_strategy: null,
      headline: "Không có phương án nào đáp ứng đầy đủ các điều kiện lựa chọn hiện tại.",
      summary: null,
      strategy_notes: [],
    },
  };
  assert.equal(brief.strategy_selection_presentation?.outcome, "no_feasible_strategy");
  assert.equal(brief.strategy_selection_presentation?.selected_strategy, null);
  assert.equal(brief.strategy_selection_presentation?.summary, null);
  assert.deepEqual(brief.strategy_selection_presentation?.strategy_notes, []);
});

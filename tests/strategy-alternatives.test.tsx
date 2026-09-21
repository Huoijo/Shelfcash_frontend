import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionBriefWorkspace } from "../app/components/DecisionBriefWorkspace.tsx";
import {
  findStrategyAlternativesInBrief,
  isCandidateStrategyObject,
} from "../lib/strategy-alternatives.ts";
import type { DecisionBriefFacts } from "../lib/types.ts";

const userBriefSnippet = [
  {
    strategy: "lean",
    label: "Tiết kiệm",
    selected: true,
    status: "selected",
    presentation: {
      headline: "Tiết kiệm được chọn",
      summary: "Đây là phương án hợp lệ có chi phí nhập thấp nhất trong các phương án được đánh giá.",
      reason_messages: [
        "Chi phí nhập dự kiến là 7,67 triệu đồng.",
      ],
    },
  },
  {
    strategy: "balanced",
    label: "Cân bằng",
    status: "feasible_not_selected",
    selected: false,
    feasible: true,
    purchase_cost: 9398000.0,
    reason_status: "verified",
    reasons: [
      {
        kind: "non_selection",
        code: "HIGHER_PURCHASE_COST_THAN_SELECTED",
        values: {
          candidate_purchase_cost: 9398000.0,
          selected_purchase_cost: 7668000.0,
          purchase_cost_delta: 1730000.0,
        },
      },
    ],
    presentation: {
      headline: "Cân bằng vẫn là phương án hợp lệ",
      summary: "Phương án này không được chọn vì chi phí nhập dự kiến cao hơn phương án được chọn.",
      reason_messages: [
        "Chi phí cao hơn khoảng 1,73 triệu đồng.",
      ],
    },
  },
  {
    strategy: "protected",
    label: "An toàn",
    status: "feasible_not_selected",
    selected: false,
    feasible: true,
    purchase_cost: 9398000.0,
    reason_status: "verified",
    reasons: [
      {
        kind: "non_selection",
        code: "HIGHER_PURCHASE_COST_THAN_SELECTED",
        values: {
          candidate_purchase_cost: 9398000.0,
          selected_purchase_cost: 7668000.0,
          purchase_cost_delta: 1730000.0,
        },
      },
    ],
    presentation: {
      headline: "An toàn vẫn là phương án hợp lệ",
      summary: "Phương án này không được chọn vì chi phí nhập dự kiến cao hơn phương án được chọn.",
      reason_messages: [
        "Chi phí cao hơn khoảng 1,73 triệu đồng.",
      ],
    },
  },
];

test("isCandidateStrategyObject recognizes candidate strategy objects", () => {
  assert.equal(isCandidateStrategyObject(userBriefSnippet[0]), true);
  assert.equal(isCandidateStrategyObject(userBriefSnippet[1]), true);
  assert.equal(isCandidateStrategyObject(userBriefSnippet[2]), true);
  assert.equal(isCandidateStrategyObject({ foo: "bar" }), false);
  assert.equal(isCandidateStrategyObject(null), false);
});

test("findStrategyAlternativesInBrief extracts candidates from root or nested brief keys", () => {
  // Test root candidate_strategies
  const brief1 = { candidate_strategies: userBriefSnippet };
  const res1 = findStrategyAlternativesInBrief(brief1);
  assert.equal(res1.length, 3);
  assert.equal(res1[0].strategy, "lean");
  assert.equal(res1[0].selected, true);
  assert.equal(res1[0].purchase_cost, 7668000.0);
  assert.equal(res1[1].strategy, "balanced");
  assert.equal(res1[1].status, "feasible_not_selected");
  assert.equal(res1[2].strategy, "protected");

  // Test nested in recommendation
  const brief2 = { recommendation: { candidate_strategies: userBriefSnippet } };
  const res2 = findStrategyAlternativesInBrief(brief2);
  assert.equal(res2.length, 3);
  assert.equal(res2[1].purchase_cost, 9398000.0);

  // Test nested in strategies key
  const brief3 = { strategies: userBriefSnippet };
  const res3 = findStrategyAlternativesInBrief(brief3);
  assert.equal(res3.length, 3);

  // Test deep nested search
  const brief4 = { deep: { inner: { container: { alternatives: userBriefSnippet } } } };
  const res4 = findStrategyAlternativesInBrief(brief4);
  assert.equal(res4.length, 3);
});

test("DecisionBriefWorkspace renders grounded strategy selection presentation from brief", () => {
  const brief: DecisionBriefFacts = {
    decision_run_id: "decision-run-123",
    store_id: "store-1",
    status: "completed",
    forecast: {
      forecast_run_id: "f-1",
      model_version: "v1",
      method: "quantile_regression",
      horizon_days: 7,
      cutoff_date: "2026-08-20",
    },
    recommendation: {
      available: true,
      strategy: "lean",
      summary: "Kế hoạch Tiết kiệm tối ưu chi phí.",
      total_purchase_cost: 7668000.0,
      expected_fill_rate: 0.95,
    },
    procurement_rows: [
      {
        ingredient_id: "milk",
        ingredient_name: "Sữa tươi",
        supplier_id: "sup-1",
        supplier_name: "NCC Sữa",
        quantity: 10,
        unit: "L",
        pack_count: 1,
        pack_size: 10,
        order_date: "2026-08-20",
        arrival_date: "2026-08-21",
        purchase_cost: 7668000.0,
        reason_codes: ["ORDER_CYCLE"],
      },
    ],
    ingredient_demand: [
      { ingredient_id: "milk", ingredient_name: "Sữa tươi", unit: "L", p25: 8, p50: 10, p75: 12, contributions: [] },
    ],
    risk: { stockout_probability: null, expected_fill_rate: null, shortage_quantity: null, waste_quantity: null },
    critic: { hard_violations: [], warnings: [] },
    evidence: [],
    data_availability: {},
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "selected",
      selected_strategy: "lean",
      headline: "Đã chọn phương án Tiết kiệm.",
      summary: "Phương án Tiết kiệm là lựa chọn khả thi có chi phí thấp nhất.",
      strategy_notes: [
        {
          strategy: "lean",
          label: "Tiết kiệm",
          status: "selected",
          status_label: "Được chọn",
          headline: "Phương án Tiết kiệm",
          message: "Được chọn vì có chi phí nhập dự kiến 7,67 triệu đồng thấp nhất.",
          detail_lines: ["Thỏa mãn mọi yêu cầu vận hành."],
          reason_codes: ["LOWEST_COST"],
          evidence_ids: ["ev-1"],
        },
        {
          strategy: "balanced",
          label: "Cân bằng",
          status: "not_selected",
          status_label: "Hợp lệ (Không chọn)",
          headline: "Phương án Cân bằng",
          message: "Chi phí cao hơn khoảng 1,73 triệu đồng.",
          detail_lines: [],
          reason_codes: ["HIGHER_COST"],
          evidence_ids: ["ev-2"],
        },
      ],
    },
  };

  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={brief}
      initialViewMode="strategy-analysis"
      loading={false}
      error={null}
      onRetry={() => undefined}
      explanation={null}
      explanationLoading={false}
      explanationError={null}
      onExplain={() => undefined}
      whatIf={null}
      whatIfLoading={false}
      whatIfError={null}
      onRunWhatIf={() => undefined}
    />
  );

  // Headlines and summaries rendered directly from backend
  assert.match(markup, /Đã chọn phương án Tiết kiệm\./);
  assert.match(markup, /Phương án Tiết kiệm là lựa chọn khả thi có chi phí thấp nhất\./);
  assert.match(markup, /Phương án Tiết kiệm/);
  assert.match(markup, /Phương án Cân bằng/);

  // Messages and detail lines rendered directly
  assert.match(markup, /Được chọn vì có chi phí nhập dự kiến 7,67 triệu đồng thấp nhất\./);
  assert.match(markup, /Thỏa mãn mọi yêu cầu vận hành\./);
  assert.match(markup, /Chi phí cao hơn khoảng 1,73 triệu đồng\./);

  // Badges rendered directly
  assert.match(markup, /Được chọn/);
  assert.match(markup, /Hợp lệ \(Không chọn\)/);

  // Reason codes MUST NOT be rendered to user
  assert.doesNotMatch(markup, /LOWEST_COST/);
  assert.doesNotMatch(markup, /HIGHER_COST/);
});

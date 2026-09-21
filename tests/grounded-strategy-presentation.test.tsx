import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionBriefWorkspace } from "../app/components/DecisionBriefWorkspace.tsx";
import type { DecisionBriefFacts, StrategySelectionPresentation } from "../lib/types.ts";

function createBaseBrief(
  presentation?: StrategySelectionPresentation | null,
): DecisionBriefFacts {
  return {
    decision_run_id: "test-run-001",
    store_id: "store-001",
    status: "completed",
    forecast: {
      forecast_run_id: "fc-001",
      model_version: "v1",
      method: "quantile_regression",
      horizon_days: 7,
      cutoff_date: "2026-09-21",
    },
    recommendation: {
      available: presentation?.outcome === "selected",
      strategy: presentation?.selected_strategy ?? "balanced",
      summary: "Kế hoạch khuyến nghị",
      total_purchase_cost: 5000000,
      expected_fill_rate: 0.96,
    },
    procurement_rows: [],
    ingredient_demand: [],
    risk: { stockout_probability: 0.03, expected_fill_rate: 0.96, shortage_quantity: 0, waste_quantity: 0 },
    critic: { hard_violations: [], warnings: [] },
    evidence: [],
    data_availability: {},
    strategy_selection_presentation: presentation,
  };
}

function renderWorkspace(brief: DecisionBriefFacts, appliedBudget?: number) {
  return renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={brief}
      initialViewMode="strategy-analysis"
      loading={false}
      error={null}
      appliedBudget={appliedBudget}
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
}

// 26. TEST — BACKEND COPY VERBATIM
test("PATCH 3: renders exact backend copy verbatim without paraphrasing or translation", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "selected",
    selected_strategy: "balanced",
    headline: "Đã chọn phương án Cân bằng theo hàm mục tiêu tối ưu.",
    summary: "Phương án Cân bằng đạt điểm chi phí & an toàn tốt nhất.",
    strategy_notes: [
      {
        strategy: "lean",
        label: "Tiết kiệm",
        status: "rejected",
        status_label: "Bị loại",
        headline: "Phương án Tiết kiệm",
        message:
          "Bị loại vì chi phí nhập dự kiến là 1,2 triệu đồng, cao hơn ngân sách 750 nghìn đồng.",
        detail_lines: ["Mức đáp ứng nhu cầu dự kiến thấp hơn mức yêu cầu."],
        reason_codes: ["BUDGET", "SERVICE_LEVEL_REQUIREMENT"],
        evidence_ids: ["ev-lean"],
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
        evidence_ids: ["ev-balanced"],
      },
    ],
  };

  const markup = renderWorkspace(createBaseBrief(presentation));

  // Assert exact Backend strings
  assert.match(markup, /Đã chọn phương án Cân bằng theo hàm mục tiêu tối ưu\./);
  assert.match(markup, /Phương án Cân bằng đạt điểm chi phí (&amp;|&) an toàn tốt nhất\./);
  assert.match(markup, /Tiết kiệm/);
  assert.match(markup, /Bị loại/);
  assert.match(markup, /Phương án Tiết kiệm/);
  assert.match(
    markup,
    /Bị loại vì chi phí nhập dự kiến là 1,2 triệu đồng, cao hơn ngân sách 750 nghìn đồng\./
  );
  assert.match(markup, /Mức đáp ứng nhu cầu dự kiến thấp hơn mức yêu cầu\./);
  assert.match(markup, /Được chọn vì là phương án khả thi có chi phí thấp nhất\./);
});

// 27. TEST — COPY MUST NOT DEPEND ON REASON CODE
test("PATCH 3: copy renders directly from message and does not depend on known reason_codes", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "selected",
    selected_strategy: "balanced",
    headline: "Đã chọn phương án Cân bằng.",
    summary: null,
    strategy_notes: [
      {
        strategy: "lean",
        label: "Tiết kiệm",
        status: "rejected",
        status_label: "Bị loại",
        headline: "Phương án Tiết kiệm",
        message: "Thông điệp Backend mới.",
        detail_lines: [],
        reason_codes: ["SOME_NEW_UNKNOWN_REASON_CODE"],
        evidence_ids: [],
      },
    ],
  };

  const markup = renderWorkspace(createBaseBrief(presentation));
  assert.match(markup, /Thông điệp Backend mới\./);
  // Reason code is not rendered to end user
  assert.doesNotMatch(markup, /SOME_NEW_UNKNOWN_REASON_CODE/);
});

// 28. TEST — COPY MUST NOT DEPEND ON COST
test("PATCH 3: rejection copy is rendered verbatim even if cost is below budget", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "selected",
    selected_strategy: "balanced",
    headline: "Đã chọn phương án Cân bằng.",
    summary: null,
    strategy_notes: [
      {
        strategy: "lean",
        label: "Tiết kiệm",
        status: "rejected",
        status_label: "Bị loại",
        headline: "Phương án Tiết kiệm",
        message: "Bị loại do vi phạm ràng buộc bảo quản lạnh.",
        detail_lines: [],
        reason_codes: ["TEMPERATURE_CONTROL_CONSTRAINT"],
        evidence_ids: [],
      },
    ],
  };

  // Remaining budget is 100,000,000 VND (way higher than any cost)
  const markup = renderWorkspace(createBaseBrief(presentation), 100000000);
  assert.match(markup, /Bị loại do vi phạm ràng buộc bảo quản lạnh\./);
  assert.match(markup, /Bị loại/);
});

// 29. TEST — DUPLICATE MESSAGES
test("PATCH 3: duplicate messages across strategy cards render independently without deduplication", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "selected",
    selected_strategy: "balanced",
    headline: "Đã chọn phương án Cân bằng.",
    summary: null,
    strategy_notes: [
      {
        strategy: "lean",
        label: "Tiết kiệm",
        status: "rejected",
        status_label: "Bị loại",
        headline: "Phương án Tiết kiệm",
        message: "Không đáp ứng ràng buộc hiện tại.",
        detail_lines: ["Ràng buộc tối thiểu."],
        reason_codes: [],
        evidence_ids: [],
      },
      {
        strategy: "protected",
        label: "An toàn",
        status: "rejected",
        status_label: "Bị loại",
        headline: "Phương án An toàn",
        message: "Không đáp ứng ràng buộc hiện tại.",
        detail_lines: ["Ràng buộc tối thiểu."],
        reason_codes: [],
        evidence_ids: [],
      },
    ],
  };

  const markup = renderWorkspace(createBaseBrief(presentation));
  // Count occurrences of the message
  const occurrences = (markup.match(/Không đáp ứng ràng buộc hiện tại\./g) || []).length;
  assert.equal(occurrences, 2, "Both cards must independently render the message without deduplication");

  const detailOccurrences = (markup.match(/Ràng buộc tối thiểu\./g) || []).length;
  assert.equal(detailOccurrences, 2, "Both cards must independently render the detail line");
});

// 30. TEST — EMPTY NOTES (HISTORICAL RUN)
test("PATCH 3: historical run with empty strategy_notes renders headline/summary without crash or fake cards", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "selected",
    selected_strategy: "balanced",
    headline: "Đã chọn phương án Cân bằng từ lịch sử.",
    summary: "Dữ liệu lịch sử không có chi tiết từng phương án ứng viên.",
    strategy_notes: [],
  };

  const markup = renderWorkspace(createBaseBrief(presentation));
  assert.match(markup, /Đã chọn phương án Cân bằng từ lịch sử\./);
  assert.match(markup, /Dữ liệu lịch sử không có chi tiết từng phương án ứng viên\./);
  // Must NOT fabricate cards
  assert.doesNotMatch(markup, /Phương án Tiết kiệm/);
  assert.doesNotMatch(markup, /Phương án An toàn/);
});

// 31. TEST — NO FEASIBLE
test("PATCH 3: no_feasible_strategy outcome renders valid business state without error or fake cards", () => {
  const presentation: StrategySelectionPresentation = {
    source: "deterministic",
    outcome: "no_feasible_strategy",
    selected_strategy: null,
    headline: "Không có phương án nào đáp ứng đầy đủ các điều kiện lựa chọn hiện tại.",
    summary: null,
    strategy_notes: [],
  };

  const markup = renderWorkspace(createBaseBrief(presentation));
  assert.match(
    markup,
    /Không có phương án nào đáp ứng đầy đủ các điều kiện lựa chọn hiện tại\./
  );
  // No error alert or crash
  assert.doesNotMatch(markup, /alert-danger/);
  assert.doesNotMatch(markup, /Error/i);
  // No fabricated cards
  assert.doesNotMatch(markup, /Phương án Cân bằng/);
});

// 32. TEST — NO MULTIPLIERS IN ACTIVE STRATEGY PRESENTATION
test("PATCH 3: active strategy presentation code does not contain 0.85 or 1.2 multipliers for quantity/cost synthesis", () => {
  const workspacePath = path.resolve(process.cwd(), "app/components/DecisionBriefWorkspace.tsx");
  const workspaceSource = fs.readFileSync(workspacePath, "utf-8");

  // Check StrategyAnalysisDeepDive function body
  const deepDiveMatch = workspaceSource.match(
    /function StrategyAnalysisDeepDive[\s\S]*?(?=function [A-Z]|\nexport|$)/
  );
  assert.ok(deepDiveMatch, "StrategyAnalysisDeepDive function must be present");
  const deepDiveSource = deepDiveMatch[0];

  // Must not have baseQty * 0.85, baseQty * 1.2, baseCost * 0.85, baseCost * 1.2
  assert.doesNotMatch(
    deepDiveSource,
    /baseQty\s*\*\s*0\.85/,
    "Must not calculate leanQty using baseQty * 0.85"
  );
  assert.doesNotMatch(
    deepDiveSource,
    /baseQty\s*\*\s*1\.2/,
    "Must not calculate protectedQty using baseQty * 1.2"
  );
  assert.doesNotMatch(
    deepDiveSource,
    /baseCost\s*\*\s*0\.85/,
    "Must not calculate leanCost using baseCost * 0.85"
  );
  assert.doesNotMatch(
    deepDiveSource,
    /baseCost\s*\*\s*1\.2/,
    "Must not calculate protectedCost using baseCost * 1.2"
  );
  assert.doesNotMatch(
    deepDiveSource,
    /total_purchase_cost\s*\*\s*0\.88/,
    "Must not synthesize lean cost using 0.88 multiplier"
  );
  assert.doesNotMatch(
    deepDiveSource,
    /total_purchase_cost\s*\*\s*1\.15/,
    "Must not synthesize protected cost using 1.15 multiplier"
  );
});

// 33. TEST — NO REASON LABEL MAPPING IN STRATEGY PRESENTATION
test("PATCH 3: strategy cards do not use reason code translation mapping", () => {
  const workspacePath = path.resolve(process.cwd(), "app/components/DecisionBriefWorkspace.tsx");
  const workspaceSource = fs.readFileSync(workspacePath, "utf-8");

  const deepDiveMatch = workspaceSource.match(
    /function StrategyAnalysisDeepDive[\s\S]*?(?=function [A-Z]|\nexport|$)/
  );
  assert.ok(deepDiveMatch);
  const deepDiveSource = deepDiveMatch[0];

  // In StrategyAnalysisDeepDive Tab 1, readableReason / reasonLabels must not be invoked
  const tab1Match = deepDiveSource.match(
    /activeTab === "comparison"[\s\S]*?(?=activeTab === "matrix")/
  );
  assert.ok(tab1Match);
  assert.doesNotMatch(
    tab1Match[0],
    /readableReason/,
    "Tab 1 must not call readableReason"
  );
  assert.doesNotMatch(
    tab1Match[0],
    /reasonLabels/,
    "Tab 1 must not use reasonLabels"
  );
});

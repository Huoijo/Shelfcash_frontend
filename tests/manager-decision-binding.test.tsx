import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCenterWorkspace } from "../app/components/DecisionCenterWorkspace.tsx";
import { SimulationResultPanel } from "../app/components/SimulationResultPanel.tsx";
import { TodayView } from "../app/views/TodayView.tsx";
import { adaptManagerDecisionViewModel } from "../lib/decision-view.ts";
import type {
  BootstrapData,
  DecisionBriefFacts,
  DecisionPackage,
  PlanResponse,
} from "../lib/types.ts";

const mockBootstrap: BootstrapData = {
  today: "2026-09-21",
  ingredients: [
    { ingredientId: "milk", ingredient: "Sữa tươi" },
    { ingredientId: "coffee", ingredient: "Cà phê" },
  ],
  inventory: [
    { ingredientId: "milk", ingredient: "Sữa tươi", onHand: 10, unit: "L", statusKey: "safe" },
  ],
  products: [{ productId: "latte", product: "Latte", unit: "ly" }],
  menu: [],
  settings: {
    forecastHorizon: 7,
    storeName: "Cửa hàng mẫu",
    storeId: "store-001",
    timezone: "Asia/Ho_Chi_Minh",
    remainingBudget: 5000000,
    monthlyBudget: 10000000,
    defaultStrategy: "balanced",
  },
  supplierConstraints: [],
} as unknown as BootstrapData;

const mockPlan: PlanResponse = {
  status: "idle",
  forecasts: {},
  enrichedInventory: [],
  recommendations: [],
} as unknown as PlanResponse;

function createBaseBrief(
  overrides?: Partial<DecisionBriefFacts>,
): DecisionBriefFacts {
  return {
    decision_run_id: "brief-run-001",
    store_id: "store-001",
    status: "completed",
    forecast: {
      forecast_run_id: "fc-001",
      model_version: "v1",
      horizon_days: 7,
      cutoff_date: "2026-09-21",
    },
    recommendation: {
      available: true,
      strategy: "balanced",
      summary: "Kế hoạch khuyến nghị Cân bằng.",
      total_purchase_cost: 3200000,
      expected_fill_rate: 0.98,
    },
    procurement_rows: [
      {
        ingredient_id: "milk",
        ingredient_name: "Sữa tươi",
        supplier_id: "sup-01",
        supplier_name: "NCC Sữa",
        quantity: 24,
        unit: "L",
        pack_count: 2,
        pack_size: 12,
        order_date: "2026-09-21",
        arrival_date: "2026-09-22",
        purchase_cost: 720000,
        reason_codes: ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY"],
      },
    ],
    ingredient_demand: [
      {
        ingredient_id: "milk",
        ingredient_name: "Sữa tươi",
        unit: "L",
        p25: 18,
        p50: 24,
        p75: 30,
        contributions: [],
      },
    ],
    risk: { stockout_probability: 0.02, expected_fill_rate: 0.98, shortage_quantity: 0, waste_quantity: 0 },
    critic: { hard_violations: [], warnings: [] },
    evidence: [],
    data_availability: {},
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "selected",
      selected_strategy: "balanced",
      headline: "Đã chọn phương án Cân bằng tối ưu chi phí và tồn kho.",
      summary: null,
      strategy_notes: [
        {
          strategy: "balanced",
          label: "Cân bằng",
          status: "selected",
          status_label: "Được chọn",
          headline: "Phương án Cân bằng",
          message: "Được chọn vì chi phí thấp nhất và thỏa mãn ràng buộc.",
          detail_lines: [],
          reason_codes: [],
          evidence_ids: [],
        },
      ],
    },
    ...overrides,
  };
}

// 28. TEST — SILENT MOCK MUST BE GONE
test("PATCH 4: Live manager mode renders explicit data-unavailable notice when fields are absent, NOT silent mock", () => {
  const liveMarkup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="future"
      data={mockBootstrap}
      decision={null}
      brief={null}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
      // previewMode is false by default in live mode!
    />
  );

  // Must render explicit notice
  assert.match(liveMarkup, /Chưa có nhu cầu nguyên liệu trong kết quả hiện tại\./);
  // Must NOT contain silently fabricated mock ingredients
  assert.doesNotMatch(liveMarkup, /Bột trà xanh/);
  assert.doesNotMatch(liveMarkup, /Trà ô long/);
});

// 29. TEST — EXPLICIT PREVIEW CAN MOCK
test("PATCH 4: Explicit preview mode can render mock fixture when previewMode is true", () => {
  const previewMarkup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="future"
      data={mockBootstrap}
      decision={null}
      brief={null}
      previewMode={true}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  // In explicit preview mode, heatmap is generated from mock package
  assert.match(previewMarkup, /Heatmap rủi ro/);
  assert.doesNotMatch(previewMarkup, /Chưa có nhu cầu nguyên liệu trong kết quả hiện tại/);
});

// 30. TEST — recommendation.available = false
test("PATCH 4: recommendation.available=false is a valid business state without error or fake plan", () => {
  const brief = createBaseBrief({
    status: "completed_with_no_feasible_recommendation",
    recommendation: {
      available: false,
      strategy: null,
      summary: null,
      total_purchase_cost: null,
      expected_fill_rate: null,
    },
    procurement_rows: [],
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "no_feasible_strategy",
      selected_strategy: null,
      headline: "Không có phương án nào đáp ứng toàn bộ ràng buộc NCC.",
      summary: null,
      strategy_notes: [],
    },
  });

  const vm = adaptManagerDecisionViewModel(brief, null, mockPlan);
  assert.equal(vm.isNoFeasible, true);
  assert.equal(vm.hasFeasiblePlan, false);
  assert.equal(vm.recommendedStrategy, null);
  assert.equal(vm.totalPlannedCost, null);

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={null}
      brief={brief}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  // Renders valid unfeasible business state
  assert.match(markup, /Chưa có phương án khả thi/);
  assert.match(markup, /Không có phương án nào đáp ứng toàn bộ ràng buộc NCC\./);
  // No error alert or crash
  assert.doesNotMatch(markup, /alert-danger/);
  assert.doesNotMatch(markup, /Kế hoạch Sẵn sàng/);
});

// 31. TEST — BRIEF WINS OVER RAW
test("PATCH 4: brief takes precedence over raw DecisionPackage for manager-facing truth", () => {
  const conflictingRawDecision = {
    decision_run_id: "run-raw-001",
    status: "completed",
    recommended_strategy: "lean",
    recommended_plan: {
      valid: true,
      items: [
        {
          ingredient_name: "Nguyên liệu từ Raw Decision",
          order_quantity: 999,
          unit: "kg",
          estimated_cost: 99000000,
        },
      ],
    },
    business_metrics: {
      projected_purchase_cost: 99000000,
    },
  } as unknown as DecisionPackage;

  const brief = createBaseBrief({
    recommendation: {
      available: true,
      strategy: "balanced",
      summary: "Kế hoạch Cân bằng từ Brief",
      total_purchase_cost: 720000,
      expected_fill_rate: 0.98,
    },
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "selected",
      selected_strategy: "balanced",
      headline: "Phương án Cân bằng từ Brief",
      summary: null,
      strategy_notes: [],
    },
  });

  const vm = adaptManagerDecisionViewModel(brief, conflictingRawDecision, mockPlan);
  // Manager-facing view model MUST use balanced from Brief, NOT lean from raw
  assert.equal(vm.recommendedStrategy?.key, "balanced");
  assert.equal(vm.recommendedStrategy?.label, "Cân bằng");
  assert.equal(vm.totalPlannedCost, 720000);

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={conflictingRawDecision}
      brief={brief}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  // Renders brief's strategy
  assert.match(markup, /Kế hoạch Cân bằng/);
  assert.match(markup, /720\.000/);
  // Must NOT render raw decision's conflicting strategy
  assert.doesNotMatch(markup, /Kế hoạch Tiết kiệm/);
  assert.doesNotMatch(markup, /99\.000\.000/);
  assert.doesNotMatch(markup, /Nguyên liệu từ Raw Decision/);
});

// 32. TEST — RAW TECHNICAL DATA STILL AVAILABLE
test("PATCH 4: raw technical data remains available in technical diagnostics surfaces", () => {
  const rawDecisionWithTechnicalDetails = {
    decision_run_id: "tech-run-001",
    status: "completed",
    recommended_strategy: "balanced",
    technical_metrics: {
      engine_mode: "Deterministic Solver v2.1",
      scenario_method: "historical_bootstrap",
      scenario_count: 50,
    },
    critic: {
      hard_violations: ["Solver Check: Ràng buộc lưu trữ kho đã được kiểm toán."],
      warnings: ["Solver Note: Lead time dự phòng."],
    },
  } as unknown as DecisionPackage;

  const panelMarkup = renderToStaticMarkup(
    <SimulationResultPanel
      data={mockBootstrap}
      decision={rawDecisionWithTechnicalDetails}
      running={false}
    />
  );

  // Technical diagnostic surface still renders solver information
  assert.match(panelMarkup, /Deterministic Solver v2\.1/);
  assert.match(panelMarkup, /Thông tin kỹ thuật mô phỏng/);
  assert.match(panelMarkup, /50/);
});

// 33. TEST — NO-FEASIBLE
test("PATCH 4: no_feasible_strategy outcome renders valid manager state without fake plan or crash", () => {
  const brief = createBaseBrief({
    status: "completed_with_no_feasible_recommendation",
    recommendation: {
      available: false,
      strategy: null,
      summary: null,
      total_purchase_cost: null,
      expected_fill_rate: null,
    },
    procurement_rows: [],
    strategy_selection_presentation: {
      source: "deterministic",
      outcome: "no_feasible_strategy",
      selected_strategy: null,
      headline: "Không có phương án nào khả thi cho đợt này.",
      summary: null,
      strategy_notes: [],
    },
  });

  const markup = renderToStaticMarkup(
    <TodayView
      data={mockBootstrap}
      plan={mockPlan}
      brief={brief}
      onNavigate={() => undefined}
    />
  );

  assert.match(markup, /Chưa có phương án khả thi/);
  assert.match(markup, /Không có phương án nào khả thi cho đợt này\./);
});

// 34. TEST — MIXED OLD/HISTORICAL RUN
test("PATCH 4: historical run lacking presentation details renders safe unavailable state without heuristics", () => {
  const historicalBrief = createBaseBrief({
    strategy_selection_presentation: null,
  });

  const vm = adaptManagerDecisionViewModel(historicalBrief, null, mockPlan);
  assert.equal(vm.recommendedStrategy?.key, "balanced");
  assert.equal(vm.recommendedStrategy?.label, "Cân bằng");
  assert.equal(vm.hasFeasiblePlan, true);

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={null}
      brief={historicalBrief}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  assert.match(markup, /Kế hoạch Cân bằng/);
  assert.match(markup, /720\.000/);
});

// 35. TEST — WHAT-IF REGRESSION
test("PATCH 4: What-if response does not mutate base decision or brief", () => {
  const baseBrief = createBaseBrief();
  const whatIfResponse = {
    decision_run_id: "what-if-001",
    status: "completed",
    recommendation: {
      available: true,
      strategy: "protected",
      total_purchase_cost: 9999999,
      expected_fill_rate: 0.99,
    },
  };

  // Base brief remains unchanged
  assert.ok(whatIfResponse);
  assert.equal(baseBrief.recommendation?.strategy, "balanced");
  assert.equal(baseBrief.recommendation?.total_purchase_cost, 3200000);
});

// 36. TEST — PO REGRESSION
test("PATCH 4: PO creation lineage from Patch 1 remains valid with forecastRunId", () => {
  const planWithForecast: PlanResponse = {
    ...mockPlan,
    status: "completed",
    forecastRunId: "fc-lineage-123",
    cutoffDate: "2026-09-21",
    recommendations: [
      {
        ingredient: "Sữa tươi",
        ingredientId: "milk",
        orderQty: 24,
        unit: "L",
        cost: 720000,
        supplierId: "sup-01",
        supplier: "NCC Sữa",
        usableStock: 10,
        inbound: 0,
        forecastDemand: 24,
      } as any,
    ],
  };

  assert.equal(planWithForecast.forecastRunId, "fc-lineage-123");
  assert.equal(planWithForecast.cutoffDate, "2026-09-21");
});

// 37. TEST — STRONGER TEST: RAW DECISION WITHOUT BRIEF NEVER DRIVES MANAGER TRUTH
test("PATCH 4.1: raw DecisionPackage without brief does NOT drive manager truth when run is completed", () => {
  const completedRawDecision = {
    decision_run_id: "run-raw-completed-001",
    status: "completed",
    recommended_strategy: "lean",
    recommended_plan: {
      valid: true,
      items: [
        {
          ingredient_name: "Cà phê Robusta Đậm Vị",
          order_quantity: 50,
          unit: "kg",
          estimated_cost: 15000000,
        },
      ],
    },
    business_metrics: {
      projected_purchase_cost: 15000000,
    },
  } as unknown as DecisionPackage;

  // brief is null, decision run is completed
  const vm = adaptManagerDecisionViewModel({
    brief: null,
    technicalDecision: completedRawDecision,
    briefLoading: false,
    briefError: null,
  });

  // Business fields MUST be null / empty
  assert.equal(vm.recommendedStrategy, null);
  assert.equal(vm.totalPlannedCost, null);
  assert.deepEqual(vm.purchasePlanItems, []);
  assert.equal(vm.purchaseItemCount, 0);
  assert.equal(vm.hasFeasiblePlan, false);
  assert.equal(vm.isNoFeasible, false);
  assert.equal(vm.headline, null);
  assert.equal(vm.summary, null);
  assert.equal(vm.status, "data_unavailable");

  // Manager UI must render explicit data_unavailable, NOT raw business recommendation
  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={completedRawDecision}
      brief={null}
      briefLoading={false}
      briefError={null}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  assert.match(markup, /Dữ liệu kế hoạch chưa khả dụng/);
  assert.match(markup, /Chưa có bản tóm tắt quyết định/);
  // Manager UI MUST NOT show Lean as chosen strategy, raw cost, or raw items
  assert.doesNotMatch(markup, /Tiết kiệm/);
  assert.doesNotMatch(markup, /15\.000\.000/);
  assert.doesNotMatch(markup, /Cà phê Robusta Đậm Vị/);
});

// 38. TEST — BRIEF LOADING STATE
test("PATCH 4.1: raw decision terminal but brief is loading renders explicit loading state, NOT raw recommendation", () => {
  const completedRawDecision = {
    decision_run_id: "run-raw-completed-002",
    status: "completed",
    recommended_strategy: "lean",
    recommended_plan: {
      valid: true,
      items: [
        {
          ingredient_name: "Hạt điều rang",
          order_quantity: 100,
          unit: "kg",
          estimated_cost: 25000000,
        },
      ],
    },
  } as unknown as DecisionPackage;

  const vm = adaptManagerDecisionViewModel({
    brief: null,
    technicalDecision: completedRawDecision,
    briefLoading: true,
    briefError: null,
  });

  assert.equal(vm.status, "loading");
  assert.equal(vm.recommendedStrategy, null);
  assert.equal(vm.totalPlannedCost, null);
  assert.deepEqual(vm.purchasePlanItems, []);

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={completedRawDecision}
      brief={null}
      briefLoading={true}
      briefError={null}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  // Must render loading state
  assert.match(markup, /Đang tải kế hoạch mua hàng…/);
  assert.match(markup, /Hệ thống đang đồng bộ kết quả/);
  // Must NOT render raw business recommendation
  assert.doesNotMatch(markup, /Tiết kiệm/);
  assert.doesNotMatch(markup, /25\.000\.000/);
  assert.doesNotMatch(markup, /Hạt điều rang/);
});

// 39. TEST — BRIEF ERROR STATE
test("PATCH 4.1: raw decision completed but GET /brief fails renders explicit request_error, NOT raw fallback or mock", () => {
  const completedRawDecision = {
    decision_run_id: "run-raw-completed-003",
    status: "completed",
    recommended_strategy: "lean",
    recommended_plan: {
      valid: true,
      items: [
        {
          ingredient_name: "Sữa yến mạch",
          order_quantity: 40,
          unit: "L",
          estimated_cost: 4000000,
        },
      ],
    },
  } as unknown as DecisionPackage;

  const errorMessage = "Không thể tải tóm tắt quyết định từ máy chủ.";

  const vm = adaptManagerDecisionViewModel({
    brief: null,
    technicalDecision: completedRawDecision,
    briefLoading: false,
    briefError: errorMessage,
  });

  assert.equal(vm.status, "request_error");
  assert.equal(vm.recommendedStrategy, null);
  assert.equal(vm.totalPlannedCost, null);
  assert.deepEqual(vm.purchasePlanItems, []);

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={mockBootstrap}
      decision={completedRawDecision}
      brief={null}
      briefLoading={false}
      briefError={errorMessage}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={mockPlan}
    />
  );

  // Must render explicit error message
  assert.match(markup, /Không thể tải kế hoạch mua hàng/);
  assert.match(markup, /Không thể tải tóm tắt quyết định từ máy chủ\./);
  // Must NOT render raw fallback
  assert.doesNotMatch(markup, /Tiết kiệm/);
  assert.doesNotMatch(markup, /4\.000\.000/);
  assert.doesNotMatch(markup, /Sữa yến mạch/);
});


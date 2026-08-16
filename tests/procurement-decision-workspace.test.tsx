import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DemandExplanationDialog,
  ProcurementDecisionWorkspace,
  ProcurementLoadingWorkspace,
} from "../app/components/ProcurementDecisionWorkspace.tsx";
import { PlanView } from "../app/views/PlanView.tsx";
import type { DecisionDemandView } from "../lib/decision-view.ts";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../lib/types.ts";

const ingredientIds = ["milk", "coffee", "tea", "sugar", "ice", "cocoa", "cream", "lemon", "orange", "mint"];
const ingredientNames = ["Sữa tươi", "Cà phê", "Trà", "Đường", "Đá", "Bột cacao", "Kem", "Chanh", "Cam", "Bạc hà"];
const demandRows = Array.from({ length: 70 }, (_, index) => {
  const ingredientIndex = index % ingredientIds.length;
  const day = 13 + Math.floor(index / ingredientIds.length);
  return {
    ingredient_id: ingredientIds[ingredientIndex],
    target_date: `2026-08-${String(day).padStart(2, "0")}`,
    p25: 11.22,
    p50: 12.01,
    p75: 13.55,
    unit: "L",
    contributions: ingredientIndex === 0 ? [{
      product_id: "matcha",
      product_name: "Matcha latte",
      contribution_p25: 3.95,
      contribution_p50: 4.06,
      contribution_p75: 4.12,
      forecast_p25: 21.94,
      forecast_p50: 22.57,
      forecast_p75: 22.9,
      recipe_quantity: 0.18,
      recipe_unit: "L",
      contribution_unit: "L",
    }] : [],
  };
});

const decision = {
  decision_run_id: "decision-run-should-not-render",
  status: "completed_with_no_feasible_recommendation",
  as_of_date: "2026-08-12",
  horizon_days: 7,
  recommended_strategy: null,
  business_metrics: { projected_purchase_cost: null },
  recommended_plan: { items: [], valid: false },
  ingredient_demand: demandRows,
  inventory_risk: {
    results: [{
      scenario_id: "p50_design",
      summary: { by_key: [{
        ingredient_id: "milk",
        projected_stockout_date: "2026-08-15",
        shortage_quantity: 2.4,
        beginning_inventory: 7,
        fill_rate: 0.809,
        unit: "L",
      }] },
    }],
  },
  strategies: {
    lean: { is_feasible: false, items: [], critic: { findings: [{ code: "SERVICE_LEVEL_REQUIREMENT" }] } },
    balanced: {
      is_feasible: false,
      purchase_cost: 120000,
      items: [{ ingredient_id: "milk", order_quantity: 12, unit: "L", pack_count: 1, pack_size: 12, unit_price: 32000, purchase_cost: 384000, order_date: "2026-08-12", arrival_date: "2026-08-13" }],
      critic: { findings: [{ code: "EXACT_SIMULATION_SAFETY_FLOOR", evidence: { observed: 0.809, required: 0.9 } }], warnings: ["STRESS_SHORTAGE_OBSERVED"] },
    },
    protected: { is_feasible: false, items: [], critic: { findings: [{ code: "SOLVER_STATUS:INFEASIBLE" }] } },
  },
  warnings: ["AGGREGATE_MODEL_COUNTS_UNKNOWN_EXPIRY_LOT"],
} as unknown as DecisionPackage;

const data = {
  ingredients: ingredientIds.map((ingredientId, index) => ({ ingredientId, ingredient: ingredientNames[index] })),
  inventory: [],
  products: [],
  menu: [],
  settings: { forecastHorizon: 7, storeName: "Cửa hàng kiểm thử", timezone: "Asia/Ho_Chi_Minh" },
} as unknown as BootstrapData;

const plan = { horizonDays: 7, ingredientDemand: {}, forecasts: {} } as unknown as PlanResponse;

test("Decision Run ingredient_demand renders 70 rows as calculated demand despite an empty recommended plan", () => {
  const markup = renderToStaticMarkup(<ProcurementDecisionWorkspace busy={false} data={data} decision={decision} onRunAgain={() => undefined} plan={plan} />);

  assert.match(markup, /Đã tính · 10 nguyên liệu · 7 ngày/);
  assert.match(markup, /13\/08\/2026/);
  assert.match(markup, /Sữa tươi/);
  assert.match(markup, /12,01 L dự kiến/);
  assert.match(markup, /11,22 L – 13,55 L/);
  assert.match(markup, /Đến từ 1 món/);
  assert.doesNotMatch(markup, /Đã hoàn tất · chưa có nhu cầu/);
  assert.doesNotMatch(markup, /Chưa có nhu cầu nguyên liệu trong kết quả hiện tại/);
  assert.doesNotMatch(markup, /0 ₫/);
  assert.doesNotMatch(markup, /Tạo đơn nháp/);
  assert.doesNotMatch(markup, /decision-run-should-not-render/);
});

test("demand explanation uses contributions without exposing technical identifiers", () => {
  const row: DecisionDemandView = {
    ingredientId: "milk",
    ingredientName: "Sữa tươi",
    targetDate: "2026-08-13",
    p25: 11.22,
    p50: 12.01,
    p75: 13.55,
    unit: "L",
    contributions: [{ productId: "matcha", productName: "Matcha latte", p25: 3.95, p50: 4.06, p75: 4.12, forecastP25: 21.94, forecastP50: 22.57, forecastP75: 22.9, recipeQuantity: 0.18, recipeUnit: "L", unit: "L" }],
  };
  const markup = renderToStaticMarkup(<DemandExplanationDialog onClose={() => undefined} row={row} />);

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Tại sao cần 12,01 L Sữa tươi/);
  assert.match(markup, /Matcha latte/);
  assert.match(markup, /22,57 sản phẩm/);
  assert.match(markup, /0,18 L \/ sản phẩm/);
  assert.match(markup, /4,06 L/);
  assert.doesNotMatch(markup, /ingredient_id|product_id|milk/);
});

test("P50 inventory risk, customer-safe warnings and infeasible strategy candidates render from the Decision Run", () => {
  const markup = renderToStaticMarkup(<ProcurementDecisionWorkspace busy={false} data={data} decision={decision} onRunAgain={() => undefined} plan={plan} />);
  assert.match(markup, /Rủi ro tồn kho theo kịch bản dự kiến/);
  assert.match(markup, /Có thể thiếu từ 15\/08\/2026/);
  assert.match(markup, /2,40 L/);
  assert.match(markup, /Phương án mô phỏng chưa đạt điều kiện/);
  assert.match(markup, /Cân bằng/);
  assert.match(markup, /1 dòng mua mô phỏng/);
  assert.match(markup, /Mức đáp ứng thấp nhất: 80,9%/);
  assert.match(markup, /Mức yêu cầu: tối thiểu 90%/);
  assert.match(markup, /Một phần tồn kho chưa có thông tin lô hoặc hạn dùng đầy đủ/);
  assert.doesNotMatch(markup, /AGGREGATE_MODEL_COUNTS_UNKNOWN_EXPIRY_LOT/);
  assert.doesNotMatch(markup, /STRESS_SHORTAGE_OBSERVED/);
});

test("PlanView routes the no-feasible decision state into the procurement workspace", () => {
  const source = readFileSync(new URL("../app/views/PlanView.tsx", import.meta.url), "utf8");
  assert.match(source, /ProcurementPlanningWorkspace/);
  assert.match(source, /noFeasibleDecision\(decision\) \|\| decision\.status === "completed"/);
});

test("loading workspace identifies the processing stages without empty scenario cards", () => {
  const markup = renderToStaticMarkup(<ProcurementLoadingWorkspace onRunAgain={() => undefined} />);
  assert.match(markup, /Dự báo bán hàng/);
  assert.match(markup, /Đang xử lý/);
  assert.match(markup, /Nhu cầu nguyên liệu/);
  assert.match(markup, /Đang chờ kết quả/);
  assert.doesNotMatch(markup, /Tiết kiệm/);
});

test("a feasible decision routes into the procurement planning workspace", () => {
  const markup = renderToStaticMarkup(<PlanView data={data} decision={{ decision_run_id: "decision-feasible", status: "completed", recommended_strategy: "balanced", recommended_plan: { items: [{ ingredient_name: "Sữa tươi" }], valid: true } }} draftOrders={[]} onConfirmOrder={async () => undefined} onCreateOrders={async () => []} onReceiveOrder={async () => undefined} onRunPlanning={async () => undefined} onStrategyChange={() => undefined} onUpdateOrder={async () => undefined} plan={{ ...plan, status: "completed", scenarios: [], recommendations: [], strategy: "Cân bằng", enrichedInventory: [] }} strategy="Cân bằng" />);
  assert.match(markup, /Kế hoạch nhập hàng/);
  assert.match(markup, /Nguyên liệu/);
  assert.doesNotMatch(markup, /Chưa tìm được kế hoạch nhập đủ an toàn/);
});

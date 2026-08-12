import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCenterWorkspace } from "../app/components/DecisionCenterWorkspace.tsx";
import { adaptDecisionRunView } from "../lib/decision-view.ts";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../lib/types.ts";

const data = {
  ingredients: [
    { ingredientId: "milk", ingredient: "Sữa tươi" },
    { ingredientId: "coffee", ingredient: "Cà phê" },
  ],
  inventory: [],
  products: [{ productId: "latte", product: "Latte", unit: "ly" }],
  menu: [],
  settings: { forecastHorizon: 7, storeName: "Cửa hàng kiểm thử", timezone: "Asia/Ho_Chi_Minh" },
} as unknown as BootstrapData;

const decision = {
  decision_run_id: "internal-run-id",
  status: "completed_with_no_feasible_recommendation",
  as_of_date: "2026-08-12",
  horizon_days: 7,
  recommended_strategy: null,
  recommended_plan: { items: [], valid: false },
  business_metrics: { projected_purchase_cost: null },
  ingredient_demand: [
    { ingredient_id: "milk", target_date: "2026-08-13", p25: 10, p50: 12, p75: 14, unit: "L", contributions: [{ product_id: "latte", product_name: "Latte", contribution_p25: 4, contribution_p50: 5, contribution_p75: 6, forecast_p25: 20, forecast_p50: 25, forecast_p75: 30, contribution_unit: "L" }] },
    { ingredient_id: "coffee", target_date: "2026-08-13", p25: 1, p50: 2, p75: 3, unit: "kg", contributions: [{ product_id: "latte", product_name: "Latte", contribution_p25: 1, contribution_p50: 2, contribution_p75: 3, forecast_p25: 20, forecast_p50: 25, forecast_p75: 30, contribution_unit: "kg" }] },
    { ingredient_id: "milk", target_date: "2026-08-14", p25: 9, p50: 11, p75: 13, unit: "L", contributions: [{ product_id: "latte", product_name: "Latte", contribution_p25: 3, contribution_p50: 4, contribution_p75: 5, forecast_p25: 19, forecast_p50: 24, forecast_p75: 29, contribution_unit: "L" }] },
  ],
  inventory_risk: { results: [{ scenario_id: "p50_design", summary: { by_key: [{ ingredient_id: "milk", projected_stockout_date: "2026-08-14", shortage_quantity: 2, unit: "L" }] } }] },
  strategies: { balanced: { is_feasible: false, items: [{ ingredient_id: "milk", order_quantity: 12, unit: "L" }], critic: { findings: [{ code: "EXACT_SIMULATION_SAFETY_FLOOR", evidence: { observed: 0.8, required: 0.9 } }] } } },
  warnings: ["RISK_METRIC_NOT_AVAILABLE"],
} as unknown as DecisionPackage;

const plan = {
  forecasts: {
    latte: { productId: "latte", product: "Latte", ingredient: "Latte", unit: "ly", history: [], forecast: [{ date: "2026-08-13", p25: 20, p50: 25, p75: 30 }, { date: "2026-08-14", p25: 19, p50: 24, p75: 29 }], totals: { p25: 39, p50: 49, p75: 59 }, drivers: [], confidence: "Tốt", dataNotes: [] },
  },
  enrichedInventory: [],
} as unknown as PlanResponse;

test("Decision Center exposes both operational and seven-day planning views", () => {
  const today = renderToStaticMarkup(<DecisionCenterWorkspace activeView="today" data={data} decision={decision} onNavigate={() => undefined} onViewChange={() => undefined} plan={plan} />);
  const future = renderToStaticMarkup(<DecisionCenterWorkspace activeView="future" data={data} decision={decision} onNavigate={() => undefined} onViewChange={() => undefined} plan={plan} />);

  assert.match(today, /Trung tâm quyết định/);
  assert.match(today, /Hôm nay/);
  assert.match(today, /7 ngày tới/);
  assert.match(today, /Ưu tiên hôm nay/);
  assert.match(today, /Xem nhu cầu &amp; ràng buộc/);
  assert.match(future, /Kế hoạch 7 ngày tới/);
  assert.match(future, /Dự báo bán hàng/);
  assert.match(future, /Nhu cầu nguyên liệu dự kiến/);
  assert.match(future, /Rủi ro tồn kho/);
  assert.match(future, /Kế hoạch nhập hàng/);
  assert.match(future, /Chưa tìm được phương án nhập thỏa toàn bộ ràng buộc/);
  assert.doesNotMatch(future, /internal-run-id/);
  assert.doesNotMatch(future, /0 ₫/);
});

test("Decision Run view model reads singular demand and deduplicates product forecasts by product and date", () => {
  const view = adaptDecisionRunView(decision, data);
  assert.equal(view.demand.length, 3);
  assert.equal(view.productForecasts.length, 1);
  assert.equal(view.productForecasts[0]?.points.length, 2);
  assert.deepEqual(view.dates, ["2026-08-13", "2026-08-14"]);
  assert.equal(view.demand.filter((item) => item.unit === "L").length, 2);
  assert.equal(view.demand.filter((item) => item.unit === "kg").length, 1);
});

test("demand chart makes P50 primary and keeps the P25-P75 range as an accessible uncertainty band", () => {
  const source = readFileSync(new URL("../app/components/DemandChart.tsx", import.meta.url), "utf8");
  assert.match(source, /dataKey="range"/);
  assert.match(source, /dataKey="p50"/);
  assert.match(source, /strokeWidth=\{2\.8\}/);
  assert.match(source, /P50 là nhu cầu dự kiến; vùng màu là khoảng P25–P75/);
});

test("feasible Decision Runs retain the existing procurement surface instead of the no-feasible state", () => {
  const markup = renderToStaticMarkup(<DecisionCenterWorkspace activeView="future" data={data} decision={{ decision_run_id: "feasible", status: "completed", recommended_strategy: "balanced", recommended_plan: { valid: true, items: [{ ingredient_name: "Sữa tươi", order_quantity: 12, unit: "L", order_date: "2026-08-12", expected_arrival_date: "2026-08-13", estimated_cost: 120000 }] } }} onNavigate={() => undefined} onViewChange={() => undefined} plan={plan} />);
  assert.match(markup, /Đã có phương án nhập khả thi/);
  assert.doesNotMatch(markup, /Chưa tìm được phương án nhập thỏa toàn bộ ràng buộc/);
});

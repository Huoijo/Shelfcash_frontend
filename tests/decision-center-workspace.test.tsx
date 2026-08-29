import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCenter } from "../app/components/DecisionCenter.tsx";
import { DecisionCenterWorkspace } from "../app/components/DecisionCenterWorkspace.tsx";
import { adaptDecisionRunView } from "../lib/decision-view.ts";
import { projectIngredientDailyRisks } from "../lib/risk-engine.ts";
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
  assert.doesNotMatch(future, /internal-run-id/);
  assert.doesNotMatch(future, /0 ₫/);
});

test("DecisionCenter renders keyed deterministic strategies without calling array methods on an object", () => {
  const markup = renderToStaticMarkup(
    <DecisionCenter
      decision={{
        decision_run_id: "keyed-strategy-run",
        status: "completed",
        recommended_strategy: "balanced",
        recommended_plan: { items: [] },
        strategies: {
          balanced: {
            strategy: "balanced",
            is_feasible: true,
            business_metrics: { projected_purchase_cost: 120000 },
            items: [],
          },
        },
      } as unknown as DecisionPackage}
      running={false}
    />,
  );

  assert.match(markup, /Cân bằng/);
  assert.match(markup, /120.000/);
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

test("Decision Center seven-day view focuses cleanly on demand and risk without separate procurement surface", () => {
  const markup = renderToStaticMarkup(<DecisionCenterWorkspace activeView="future" data={data} decision={{ decision_run_id: "feasible", status: "completed", recommended_strategy: "balanced", recommended_plan: { valid: true, items: [{ ingredient_name: "Sữa tươi", order_quantity: 12, unit: "L", order_date: "2026-08-12", expected_arrival_date: "2026-08-13", estimated_cost: 120000 }] } }} onNavigate={() => undefined} onViewChange={() => undefined} plan={plan} />);
  assert.match(markup, /Kế hoạch 7 ngày tới/);
  assert.match(markup, /Heatmap rủi ro/);
  assert.match(markup, /Chi tiết đang chọn/);
});

test("Single Groundtruth Risk Engine accurately keeps safe ingredients stable (Cà phê hạt) across all days", () => {
  const dates = ["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"];
  const coffeeDemand = dates.map((date) => ({
    ingredientId: "coffee-beans",
    ingredientName: "Cà phê hạt",
    targetDate: date,
    p25: 0.07,
    p50: 0.09,
    p75: 0.12,
    unit: "kg",
    contributions: [],
  }));

  const coffeeRisk = {
    ingredientId: "coffee-beans",
    ingredientName: "Cà phê hạt",
    stockoutDate: "",
    shortageQuantity: 0,
    beginningInventory: 3.9,
    fillRate: 1.0,
    daysOfSupply: 30,
    unit: "kg",
  };

  const projection = projectIngredientDailyRisks(
    "coffee-beans",
    "Cà phê hạt",
    "kg",
    dates,
    coffeeDemand,
    coffeeRisk,
    undefined,
    []
  );

  assert.equal(projection.maxSeverity, 0);
  assert.equal(projection.hasAlert, false);
  assert.equal(projection.dailyRisks.length, 7);
  for (const day of projection.dailyRisks) {
    assert.equal(day.severity, "stable");
    assert.equal(day.severityLevel, 0);
    assert.equal(day.severityLabel, "Ổn định");
    assert.equal(day.hasStockout, false);
  }
});

test("Single Groundtruth Risk Engine accurately computes Sugar (Đường) arrival on 16/08 and closing balance", () => {
  const dates = ["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"];
  const sugarDemand = [
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-13", p25: 2.1, p50: 2.3, p75: 2.5, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-14", p25: 2.2, p50: 2.4, p75: 2.6, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-15", p25: 2.7, p50: 3.0, p75: 3.3, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-16", p25: 2.62, p50: 2.81, p75: 2.98, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-17", p25: 2.2, p50: 2.4, p75: 2.6, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-18", p25: 2.1, p50: 2.3, p75: 2.5, unit: "kg", contributions: [] },
    { ingredientId: "sugar", ingredientName: "Đường", targetDate: "2026-08-19", p25: 2.1, p50: 2.3, p75: 2.5, unit: "kg", contributions: [] },
  ];

  const sugarRisk = {
    ingredientId: "sugar",
    ingredientName: "Đường",
    stockoutDate: "2026-08-16",
    shortageQuantity: 0,
    beginningInventory: 8.0,
    fillRate: 1.0,
    daysOfSupply: 3.2,
    unit: "kg",
  };

  const procurementRows = [
    { ingredientId: "sugar", quantity: 10, arrivalDate: "2026-08-16" },
  ];

  const projection = projectIngredientDailyRisks(
    "sugar",
    "Đường",
    "kg",
    dates,
    sugarDemand,
    sugarRisk,
    undefined,
    procurementRows
  );

  const day16 = projection.dailyRisks.find((d) => d.targetDate === "2026-08-16");
  assert.ok(day16);
  assert.equal(day16.isArrival, true);
  assert.equal(day16.incomingQuantity, 10);
  assert.equal(day16.demandP50, 2.81);
  assert.equal(day16.openingStock, 0.3);
  assert.equal(day16.closingStock, 7.49);
  assert.equal(day16.severity, "stable");
});

test("Risk Engine Matrix: Case A (Safe) vs Case G (Demand spike with ample inventory)", () => {
  const dates = ["2026-08-13", "2026-08-14"];
  const demand = [
    { ingredientId: "flour", ingredientName: "Bột mì", targetDate: "2026-08-13", p25: 0.8, p50: 1.0, p75: 1.2, unit: "kg", contributions: [] },
    // Day 14 demand is 3.0 kg (average is (1+3)/2 = 2.0 kg; 3.0 > 1.4 * 2.0 = 2.8 kg -> 50% spike)
    { ingredientId: "flour", ingredientName: "Bột mì", targetDate: "2026-08-14", p25: 2.5, p50: 3.0, p75: 3.5, unit: "kg", contributions: [] },
  ];
  const risk = { ingredientId: "flour", ingredientName: "Bột mì", beginningInventory: 100, unit: "kg" };

  const projection = projectIngredientDailyRisks("flour", "Bột mì", "kg", dates, demand, risk, undefined, []);

  // Ample stock ensures both days remain STABLE despite demand spike
  assert.equal(projection.dailyRisks[0]?.severity, "stable");
  assert.equal(projection.dailyRisks[1]?.severity, "stable");
  assert.equal(projection.dailyRisks[1]?.isDemandSpike, true);
  assert.match(projection.dailyRisks[1]?.demandSpikeLabel ?? "", /↗ Nhu cầu cao hơn TB/);
});

test("Risk Engine Matrix: Case B (Thin buffer / Safety Stock breach)", () => {
  const dates = ["2026-08-13"];
  const demand = [{ ingredientId: "tea", ingredientName: "Trà", targetDate: "2026-08-13", p25: 1.8, p50: 2.0, p75: 2.2, unit: "kg", contributions: [] }];
  const risk = { ingredientId: "tea", ingredientName: "Trà", beginningInventory: 4.0, unit: "kg" };
  const mockData = {
    inventory: [{ ingredientId: "tea", ingredient: "Trà", sku: "TEA", unit: "kg", onHand: 4.0, safetyStock: 3.0, leadTimeDays: 1, unitCost: 100, expiryDate: "", expiringQty: 0, inbound: 0, supplier: "", moq: 0, packSize: 0, capacity: 0, lastCounted: "" }],
  } as unknown as BootstrapData;

  const projection = projectIngredientDailyRisks("tea", "Trà", "kg", dates, demand, risk, mockData, []);
  // Ending stock is 4 - 2 = 2 kg <= safetyStock (3 kg) -> triggers WATCH
  assert.equal(projection.dailyRisks[0]?.severity, "watch");
  assert.equal(projection.dailyRisks[0]?.basis, "safety_stock");
});

test("Risk Engine Matrix: Case C (P75 shortage) vs Case D (P50 shortage)", () => {
  const dates = ["2026-08-13"];
  // Case C: available = 5kg, P50 = 4kg, P75 = 6kg -> P50 safe, P75 short by 1kg -> SHORTAGE_RISK
  const demandC = [{ ingredientId: "c", ingredientName: "C", targetDate: "2026-08-13", p25: 3.0, p50: 4.0, p75: 6.0, unit: "kg", contributions: [] }];
  const riskC = { ingredientId: "c", ingredientName: "C", beginningInventory: 5.0, unit: "kg" };
  const projC = projectIngredientDailyRisks("c", "C", "kg", dates, demandC, riskC, undefined, []);
  assert.equal(projC.dailyRisks[0]?.severity, "shortage_risk");
  assert.equal(projC.dailyRisks[0]?.shortageP75, 1.0);
  assert.equal(projC.dailyRisks[0]?.shortageQuantity, 0);

  // Case D: available = 2kg, P50 = 5kg -> P50 short by 3kg -> CRITICAL
  const demandD = [{ ingredientId: "d", ingredientName: "D", targetDate: "2026-08-13", p25: 4.0, p50: 5.0, p75: 6.0, unit: "kg", contributions: [] }];
  const riskD = { ingredientId: "d", ingredientName: "D", beginningInventory: 2.0, unit: "kg" };
  const projD = projectIngredientDailyRisks("d", "D", "kg", dates, demandD, riskD, undefined, []);
  assert.equal(projD.dailyRisks[0]?.severity, "critical");
  assert.equal(projD.dailyRisks[0]?.shortageQuantity, 3.0);
});

test("Risk Engine Matrix: Case E (Receipt recovery) and Case F (Missing data -> UNKNOWN)", () => {
  // Case E: Day 1 short (CRITICAL), Day 2 receipt recovers stock (STABLE)
  const dates = ["2026-08-13", "2026-08-14"];
  const demand = [
    { ingredientId: "syrup", ingredientName: "Siro", targetDate: "2026-08-13", p25: 1.5, p50: 2.0, p75: 2.5, unit: "L", contributions: [] },
    { ingredientId: "syrup", ingredientName: "Siro", targetDate: "2026-08-14", p25: 1.5, p50: 2.0, p75: 2.5, unit: "L", contributions: [] },
  ];
  const risk = { ingredientId: "syrup", ingredientName: "Siro", beginningInventory: 0.5, unit: "L" };
  const receipts = [{ ingredientId: "syrup", quantity: 20, arrivalDate: "2026-08-14" }];

  const projE = projectIngredientDailyRisks("syrup", "Siro", "L", dates, demand, risk, undefined, receipts);
  assert.equal(projE.dailyRisks[0]?.severity, "critical");
  assert.equal(projE.dailyRisks[1]?.severity, "stable");
  assert.equal(projE.dailyRisks[1]?.isArrival, true);

  // Case F: No inventory record or risk -> UNKNOWN
  const projF = projectIngredientDailyRisks("missing", "Ẩn", "kg", dates, demand, undefined, undefined, []);
  assert.equal(projF.dailyRisks[0]?.severity, "unknown");
  assert.equal(projF.dailyRisks[0]?.severityLevel, 0);
  assert.equal(projF.dailyRisks[0]?.severityLabel, "Không đủ dữ liệu");
});




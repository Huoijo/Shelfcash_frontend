import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ForecastBenchmark } from "../app/components/forecast/ForecastBenchmark.tsx";
import { BenchmarkBarChart } from "../app/components/forecast/BenchmarkBarChart.tsx";
import { BenchmarkHorizonChart } from "../app/components/forecast/BenchmarkHorizonChart.tsx";
import { BenchmarkTable } from "../app/components/forecast/BenchmarkTable.tsx";
import {
  formatBenchmarkMetric,
  formatBenchmarkPercent,
  getBenchmarkComparisonSummary,
  getForecastBenchmarkPreview,
  getModelsSortedByWape,
} from "../lib/forecast-benchmark/selectors.ts";
import { StaffTodayView } from "../app/views/staff/StaffTodayView.tsx";
import { StaffInventoryCountView } from "../app/views/staff/StaffInventoryCountView.tsx";
import { DecisionCenterWorkspace } from "../app/components/DecisionCenterWorkspace.tsx";
import { buildBootstrapData } from "../lib/data.ts";
import { buildMock7DayDecisionPackage } from "../lib/mock-data.ts";
import { adaptDecisionRunView } from "../lib/decision-view.ts";

test("Forecast Benchmark Preview fixture returns 5 canonical models and calibration data", () => {
  const data = getForecastBenchmarkPreview();
  assert.equal(data.models.length, 5);
  assert.equal(data.evaluationProtocol, "Walk-forward validation");
  assert.equal(data.foldsCount, 3);
  assert.equal(data.forecastPointsCount, 1400);

  // Exact mock overall values from prompt
  const lightGbm = data.models.find((m) => m.modelType === "lightgbm_quantile");
  const ets = data.models.find((m) => m.modelType === "ets");
  const seasonalNaive = data.models.find((m) => m.modelType === "seasonal_naive");
  const ma28 = data.models.find((m) => m.modelType === "ma28");
  const ma7 = data.models.find((m) => m.modelType === "ma7");

  assert.ok(lightGbm);
  assert.ok(ets);
  assert.ok(seasonalNaive);
  assert.ok(ma28);
  assert.ok(ma7);

  // LightGBM
  assert.equal(lightGbm.overall.mae, 2.96);
  assert.equal(lightGbm.overall.wape, 0.0782);
  assert.equal(lightGbm.overall.bias, -0.03);
  assert.equal(lightGbm.supportsQuantiles, true);
  assert.deepEqual(lightGbm.quantiles, ["P25", "P50", "P75"]);

  // ETS
  assert.equal(ets.overall.mae, 3.28);
  assert.equal(ets.overall.wape, 0.087);
  assert.equal(ets.overall.bias, -0.01);
  assert.equal(ets.isBaselineStrongest, true);

  // Seasonal Naive
  assert.equal(seasonalNaive.overall.mae, 3.91);
  assert.equal(seasonalNaive.overall.wape, 0.1037);
  assert.equal(seasonalNaive.overall.bias, -0.24);

  // MA28 & MA7
  assert.equal(ma28.overall.mae, 6.82);
  assert.equal(ma28.overall.wape, 0.181);
  assert.equal(ma7.overall.mae, 6.97);
  assert.equal(ma7.overall.wape, 0.185);
});

test("formatBenchmarkPercent multiplies by 100 exactly once and formats decimals", () => {
  // LightGBM WAPE
  assert.equal(formatBenchmarkPercent(0.0782), "7.82%");
  assert.notEqual(formatBenchmarkPercent(0.0782), "0.078%");
  assert.notEqual(formatBenchmarkPercent(0.0782), "782.00%");

  // ETS WAPE
  assert.equal(formatBenchmarkPercent(0.087), "8.70%");

  // Seasonal Naive WAPE
  assert.equal(formatBenchmarkPercent(0.1037), "10.37%");

  // MA28 and MA7 WAPE
  assert.equal(formatBenchmarkPercent(0.181), "18.10%");
  assert.equal(formatBenchmarkPercent(0.185), "18.50%");
});

test("formatBenchmarkMetric formats MAE and Bias correctly", () => {
  assert.equal(formatBenchmarkMetric(2.96), "2.96");
  assert.equal(formatBenchmarkMetric(3.28), "3.28");
  assert.equal(formatBenchmarkMetric(3.91), "3.91");
  assert.equal(formatBenchmarkMetric(6.82), "6.82");
  assert.equal(formatBenchmarkMetric(6.97), "6.97");
  assert.equal(formatBenchmarkMetric(-0.03), "-0.03");
  assert.equal(formatBenchmarkMetric(-0.01), "-0.01");
});

test("getModelsSortedByWape sorts LightGBM first and ETS second", () => {
  const data = getForecastBenchmarkPreview();
  const sorted = getModelsSortedByWape(data.models);

  assert.equal(sorted[0].modelType, "lightgbm_quantile");
  assert.equal(sorted[1].modelType, "ets");
  assert.equal(sorted[2].modelType, "seasonal_naive");
  assert.equal(sorted[3].modelType, "ma28");
  assert.equal(sorted[4].modelType, "ma7");
});

test("getBenchmarkComparisonSummary computes exact deltas with Seasonal Naive and ETS", () => {
  const data = getForecastBenchmarkPreview();
  const summary = getBenchmarkComparisonSummary(data.models);

  // 10.37 - 7.82 = 2.55 percentage points advantage over Seasonal Naive
  assert.equal(summary.seasonalNaiveAdvantagePoints.toFixed(2), "2.55");

  // 8.70 - 7.82 = 0.88 percentage points reduction over ETS
  assert.equal(summary.etsAdvantagePoints.toFixed(2), "0.88");
});

test("BenchmarkBarChart renders all 5 models, honest 0 scale, and badges", () => {
  const data = getForecastBenchmarkPreview();
  const markup = renderToStaticMarkup(<BenchmarkBarChart models={data.models} />);

  // Heading & direction
  assert.match(markup, /WAPE theo mô hình/);
  assert.match(markup, /WAPE ↓ Càng thấp càng tốt/);

  // Model names
  assert.match(markup, /LightGBM Quantile/);
  assert.match(markup, /ETS \(Exponential Smoothing\)/);
  assert.match(markup, /Seasonal Naive/);
  assert.match(markup, /MA 28 ngày/);
  assert.match(markup, /MA 7 ngày/);

  // Values
  assert.match(markup, /7\.82%/);
  assert.match(markup, /8\.70%/);
  assert.match(markup, /10\.37%/);
  assert.match(markup, /18\.10%/);
  assert.match(markup, /18\.50%/);

  // Badges
  assert.match(markup, /MÔ HÌNH SHELFCASH/);
  assert.match(markup, /TỐT NHẤT/);
  assert.match(markup, /BASELINE MẠNH NHẤT/);

  // Footnote confirming scale starts from 0
  assert.match(markup, /Thang đo bắt đầu từ 0/);
});

test("BenchmarkHorizonChart renders 7 forecast days with correct series", () => {
  const data = getForecastBenchmarkPreview();
  const markup = renderToStaticMarkup(<BenchmarkHorizonChart models={data.models} />);

  // Title & helper
  assert.match(markup, /Độ chính xác theo khoảng dự báo/);
  assert.match(markup, /WAPE ↓ Càng thấp càng tốt/);

  // Days 1 through 7
  for (let day = 1; day <= 7; day++) {
    assert.match(markup, new RegExp(`Ngày \\+${day}`));
  }

  // Active series labels
  assert.match(markup, /LightGBM/);
  assert.match(markup, /ETS/);
  assert.match(markup, /Seasonal Naive/);
});

test("BenchmarkTable renders detail table with metrics and explanation tooltips", () => {
  const data = getForecastBenchmarkPreview();
  const markup = renderToStaticMarkup(<BenchmarkTable models={data.models} />);

  assert.match(markup, /Bảng chỉ số tổng hợp chi tiết/);
  assert.match(markup, /Mô hình/);
  assert.match(markup, /WAPE/);
  assert.match(markup, /MAE/);
  assert.match(markup, /Bias/);
  assert.match(markup, /Phân vị Quantile/);

  // Bias values
  assert.match(markup, /-0\.03/);
  assert.match(markup, /-0\.01/);
  assert.match(markup, /-0\.24/);

  // Bias note
  assert.match(markup, /Gần 0 hơn thể hiện mô hình ít thiên lệch/);
});

test("ForecastBenchmark master component renders KPI strip and calibration metrics", () => {
  const markup = renderToStaticMarkup(<ForecastBenchmark />);

  // Section title
  assert.match(markup, /BENCHMARK MÔ HÌNH DỰ BÁO/);
  assert.match(markup, /Benchmark Preview/);
  assert.match(markup, /Walk-forward validation/);

  // Honest product interpretation
  assert.match(markup, /LightGBM Quantile đạt sai số thấp nhất trong benchmark mô phỏng/);

  // Deltas
  assert.match(markup, /LightGBM giảm WAPE khoảng 2\.55 điểm %/);
  assert.match(markup, /LightGBM giảm WAPE khoảng 0\.88 điểm %/);

  // Calibration strip
  assert.match(markup, /Lợi thế mô hình phân vị \(Quantile Forecast\)/);
  assert.match(markup, /Mục tiêu danh định: <strong>50%<\/strong>/);
  assert.match(markup, /Thực tế quan sát: <strong class="text-emerald-700">49\.2%<\/strong>/);
  assert.match(markup, /Độ lệch: ~0\.80 điểm %/);
});

const mockStaffSession = {
  userId: "user-staff-01",
  name: "Nguyễn Văn A",
  email: "staff01@shelfcash.vn",
  role: "store_staff" as const,
  roleLabel: "Nhân viên chi nhánh",
  portal: "staff" as const,
  allowedPortals: ["staff" as const],
  permissions: [
    "STAFF_VIEW_TASKS" as const,
    "STAFF_RECEIVE_GOODS" as const,
    "STAFF_COUNT_INVENTORY" as const,
    "STAFF_REPORT_ISSUE" as const,
  ],
  storeId: "STORE_001",
  storeName: "ShelfCash Flagship Coffee & Tea",
  mode: "mock" as const,
  loggedInAt: "2026-08-29T10:00:00Z",
};

test("Staff views do not render benchmark section (Manager only)", () => {
  const todayMarkup = renderToStaticMarkup(
    <StaffTodayView session={mockStaffSession} onNavigate={() => undefined} />
  );
  assert.doesNotMatch(todayMarkup, /BENCHMARK MÔ HÌNH DỰ BÁO/);
  assert.doesNotMatch(todayMarkup, /forecast-benchmark/);

  const countMarkup = renderToStaticMarkup(
    <StaffInventoryCountView session={mockStaffSession} onNavigate={() => undefined} />
  );
  assert.doesNotMatch(countMarkup, /BENCHMARK MÔ HÌNH DỰ BÁO/);
  assert.doesNotMatch(countMarkup, /forecast-benchmark/);
});

test("Future planning view renders 7-day heatmap mock data and does not render ForecastBenchmark", () => {
  const testBootstrap = buildBootstrapData();

  const markup = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="future"
      data={testBootstrap}
      decision={null}
      onNavigate={() => undefined}
      onViewChange={() => undefined}
      plan={{ forecasts: {}, enrichedInventory: [] } as any}
    />
  );

  // Heatmap renders with 7-day mock data
  assert.match(markup, /Heatmap rủi ro/);
  assert.doesNotMatch(markup, /Chưa có nhu cầu nguyên liệu trong kết quả hiện tại/);
  assert.match(markup, /Sữa tươi/);
  assert.match(markup, /Chuối/);

  // Benchmark is NOT in future planning view
  assert.doesNotMatch(markup, /BENCHMARK MÔ HÌNH DỰ BÁO/);
  assert.doesNotMatch(markup, /forecast-benchmark-section/);
});

test("buildMock7DayDecisionPackage creates 7 distinct days, all 4 severity levels, and arrival shipments", () => {
  const testBootstrap = buildBootstrapData();
  const pkg = buildMock7DayDecisionPackage(testBootstrap);

  assert.equal(pkg.horizon_days, 7);
  assert.ok(Array.isArray(pkg.ingredient_demand));
  assert.ok(pkg.ingredient_demand.length >= 49); // 7 ingredients * 7 days

  const view = adaptDecisionRunView(pkg, testBootstrap);
  assert.equal(view.dates.length, 7);
  assert.ok(view.demand.length >= 49);
  assert.ok(view.risks.length >= 7);

  // Sữa tươi should have an arrival order in plannedItems
  const milkArrival = pkg.recommended_plan.items.find(
    (item: any) => item.ingredient_id === "Sữa tươi" || item.ingredient_name === "Sữa tươi"
  );
  assert.ok(milkArrival);
  assert.equal(milkArrival.order_quantity, 24);
});



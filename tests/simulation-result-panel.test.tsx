import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SimulationResultPanel } from "../app/components/SimulationResultPanel.tsx";
import type { BootstrapData, DecisionPackage } from "../lib/types.ts";

const data = {
  ingredients: [{ ingredientId: "milk", ingredient: "Sữa tươi" }],
  inventory: [],
  products: [{ productId: "latte", product: "Latte", unit: "ly" }],
  menu: [],
} as unknown as BootstrapData;

test("simulation panel renders a no-feasible Decision Run as demand and FEFO risk, not a no-purchase result", () => {
  const decision = {
    decision_run_id: "simulation-run",
    status: "completed_with_no_feasible_recommendation",
    horizon_days: 7,
    recommended_strategy: null,
    ingredient_demand: [{
      ingredient_id: "milk",
      target_date: "2026-08-17",
      unit: "L",
      p25: 10,
      p50: 12,
      p75: 14,
      contributions: [{
        product_id: "latte",
        product_name: "Latte",
        contribution_p25: 10,
        contribution_p50: 12,
        contribution_p75: 14,
        forecast_p25: 20,
        forecast_p50: 24,
        forecast_p75: 30,
        contribution_unit: "L",
      }],
    }],
    inventory_risk: {
      results: [{
        scenario_id: "p50_design",
        summary: {
          by_key: [{
            ingredient_id: "milk",
            unit: "L",
            beginning_inventory: 4,
            shortage_quantity: 8,
            fill_rate: 0.5,
            projected_stockout_date: "2026-08-17",
          }],
        },
      }],
    },
    technical_metrics: {
      baseline_engine: "lot_level_fefo_v1",
      scenario_method: "quantile_design_fallback",
      scenario_count: 3,
    },
    warnings: ["RISK_METRIC_NOT_AVAILABLE"],
  } as unknown as DecisionPackage;

  const markup = renderToStaticMarkup(
    <SimulationResultPanel data={data} decision={decision} running={false} />,
  );

  assert.match(markup, /Đã mô phỏng, chưa có phương án nhập khả thi/);
  assert.match(markup, /Nhu cầu nguyên liệu theo ngày/);
  assert.match(markup, /Rủi ro tồn kho trong mô phỏng/);
  assert.match(markup, /17\/08\/2026/);
  assert.match(markup, /50%/);
  assert.match(markup, /lot_level_fefo_v1/);
  assert.doesNotMatch(markup, /Chưa cần nhập thêm hàng/);
});

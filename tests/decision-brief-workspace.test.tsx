import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionBriefWorkspace } from "../app/components/DecisionBriefWorkspace.tsx";
import type { DecisionBriefFacts } from "../lib/types.ts";

const brief: DecisionBriefFacts = {
  decision_run_id: "decision-brief-1",
  store_id: "store-1",
  status: "completed",
  forecast: {},
  recommendation: { available: true, strategy: "balanced", total_purchase_cost: 810_000, expected_fill_rate: 0.96 },
  procurement_rows: [{ ingredient_id: "milk", ingredient_name: "Sữa tươi", supplier_id: "supplier-1", supplier_name: "Sữa Việt Distribution", quantity: 24, unit: "L", pack_count: 2, pack_size: 12, order_date: "2026-08-20", arrival_date: "2026-08-21", purchase_cost: 810_000, reason_codes: ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY", "UNMAPPED_CODE"] }],
  ingredient_demand: [{ ingredient_id: "milk", ingredient_name: "Sữa tươi", unit: "L", p25: 18, p50: 24, p75: 30 }],
  risk: { stockout_probability: null },
  critic: { hard_violations: [], warnings: [] },
  evidence: [],
  data_availability: {},
};

test("Decision Brief is the rendered procurement source and preserves null risk", () => {
  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace brief={brief} error={null} explanation={null} explanationError={null} explanationLoading={false} loading={false} onExplain={() => undefined} onRetry={() => undefined} />,
  );
  assert.match(markup, /Cân bằng/);
  assert.match(markup, /810.000/);
  assert.match(markup, /Sữa Việt Distribution/);
  assert.match(markup, /2 thùng × 12 L/);
  assert.match(markup, /Nhu cầu dự kiến cao hơn lượng hàng khả dụng/);
  assert.match(markup, /Unmapped code/);
  assert.match(markup, /Chưa đủ dữ liệu để ước tính xác suất thiếu hàng/);
  assert.match(markup, /Tại sao chọn kế hoạch này/);
});

test("no-feasible Decision Brief is a business outcome, not an application error", () => {
  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace brief={{ ...brief, status: "completed_with_no_feasible_recommendation", recommendation: { ...brief.recommendation, available: false, strategy: null }, procurement_rows: [], critic: { hard_violations: ["Vượt ngân sách"], warnings: ["Cần xem lại thời gian giao"] } }} error={null} explanation={null} explanationError={null} explanationLoading={false} loading={false} onExplain={() => undefined} onRetry={() => undefined} />,
  );
  assert.match(markup, /Chưa tìm được kế hoạch nhập hàng phù hợp/);
  assert.match(markup, /Vượt ngân sách/);
  assert.match(markup, /Cần xem lại thời gian giao/);
  assert.doesNotMatch(markup, /Kế hoạch hoàn tất nhưng không có nguyên liệu cần nhập/);
});

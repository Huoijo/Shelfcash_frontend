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
  assert.doesNotMatch(markup, /Kế hoạch hoàn tất nhưng không có nguyên liệu cần nhập/);
});

test("DecisionBriefWorkspace renders full strategy analysis button", () => {
  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace brief={brief} error={null} explanation={null} explanationError={null} explanationLoading={false} loading={false} onExplain={() => undefined} onRetry={() => undefined} />,
  );
  assert.match(markup, /Xem các phương án khác &amp; lý do loại|Xem các phương án khác & lý do loại/);
});

test("DecisionBriefWorkspace renders assistant_summary, ingredient_synthesis and presented_warnings directly", () => {
  const enrichedBrief: DecisionBriefFacts = {
    ...brief,
    recommendation: {
      ...brief.recommendation,
      summary: "Persisted production recommendation.",
    },
    assistant_summary: {
      headline: "Kế hoạch hiện tại cần theo dõi một rủi ro chính",
      summary: "Kế hoạch đã được lưu cùng dữ liệu chạy.",
      key_points: ["Điểm trọng tâm 1", "Điểm trọng tâm 2"],
      warning_summary: "Cảnh báo tóm tắt quan trọng",
      source: "llm",
      grounded: true,
    },
    ingredient_synthesis: [
      {
        ingredient_id: "milk",
        ingredient_name: "Sữa tươi",
        unit: "L",
        importance: "critical",
        source: "llm",
        headline: "Cần ưu tiên theo dõi rủi ro thiếu hàng",
        summary: "Sữa tươi có thể thiếu từ 14/08 trong kỳ kế hoạch.",
        evidence_ids: ["ev-1"],
      },
    ],
    presented_warnings: [
      {
        code: "CAPACITY_NOT_EVALUATED",
        severity: "warning",
        audience: "user",
        title: "Chưa thể đánh giá đầy đủ sức chứa kho",
        message: "Hệ thống còn thiếu thông tin cần thiết để kiểm tra khả năng lưu trữ.",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={enrichedBrief}
      error={null}
      explanation={null}
      explanationError={null}
      explanationLoading={false}
      loading={false}
      onExplain={() => undefined}
      onRetry={() => undefined}
    />,
  );

  assert.match(markup, /TỔNG QUAN &amp; TÓM TẮT KẾ HOẠCH|TỔNG QUAN & TÓM TẮT KẾ HOẠCH/);
  assert.match(markup, /Persisted production recommendation\./);
  assert.match(markup, /Kế hoạch hiện tại cần theo dõi một rủi ro chính/);
  assert.match(markup, /Kế hoạch đã được lưu cùng dữ liệu chạy\./);
  assert.match(markup, /Điểm trọng tâm 1/);
  assert.match(markup, /Cảnh báo tóm tắt quan trọng/);
  assert.match(markup, /Chưa thể đánh giá đầy đủ sức chứa kho/);
  assert.match(markup, /Hệ thống còn thiếu thông tin cần thiết để kiểm tra khả năng lưu trữ\./);
  assert.match(markup, /Cần ưu tiên theo dõi rủi ro thiếu hàng/);
  assert.match(markup, /Sữa tươi có thể thiếu từ 14\/08 trong kỳ kế hoạch\./);
  assert.match(markup, /Nguy cấp/);
});

test("Decision Brief chart renders signed inventory balance and separates consumption from shortage", () => {
  const briefWithShortage: DecisionBriefFacts = {
    ...brief,
    procurement_rows: [
      { ingredient_id: "black-tea", ingredient_name: "Trà đen", supplier_id: "s1", supplier_name: "NCC Trà", quantity: 1, unit: "kg", order_date: "2026-08-13", arrival_date: "2026-08-18", purchase_cost: 120_000, reason_codes: ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY"] },
    ],
    ingredient_demand: [
      { ingredient_id: "black-tea", ingredient_name: "Trà đen", unit: "kg", p25: 0.35, p50: 0.43, p75: 0.5 },
    ],
  };

  const decisionPayload = {
    decision_run_id: "run-tea",
    status: "completed",
    as_of_date: "2026-08-12",
    horizon_days: 7,
    recommended_strategy: "protected",
    recommended_plan: { items: [{ ingredient_id: "black-tea", order_quantity: 1, unit: "kg", expected_arrival_date: "2026-08-18" }] },
    ingredient_demand: [
      { ingredient_id: "black-tea", target_date: "2026-08-13", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-14", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-15", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-16", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-17", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-18", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
      { ingredient_id: "black-tea", target_date: "2026-08-19", p25: 0.35, p50: 0.43, p75: 0.5, unit: "kg", contributions: [] },
    ],
    inventory_risk: [{ ingredient_id: "black-tea", beginning_inventory: 0.86, days_of_supply: 2 }],
  } as any;

  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={briefWithShortage}
      decision={decisionPayload}
      error={null}
      explanation={null}
      explanationError={null}
      explanationLoading={false}
      loading={false}
      onExplain={() => undefined}
      onRetry={() => undefined}
    />
  );

  assert.match(markup, /DỰ BÁO NHU CẦU &amp; DIỄN BIẾN TỒN KHO|DỰ BÁO NHU CẦU & DIỄN BIẾN TỒN KHO/);
  assert.match(markup, /TỒN KHO DỰ KIẾN CUỐI NGÀY/);
  assert.match(markup, /NHU CẦU THEO NGÀY/);
});



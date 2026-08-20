"use client";

import { Check, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DecisionBusinessMetrics,
  DecisionExplanation,
  DecisionPackage,
  DecisionPlanItem,
  DecisionStrategy,
} from "../../lib/types";
import { decisionRunLifecycle } from "../../lib/decision-run";
import { getDecisionExplanation } from "../../lib/shelfcash-client";
import { Details, Notice, SectionHeading, StatCard, SummaryGrid, formatDate, formatQuantity, formatVnd } from "./ui";

const strategyLabels: Record<string, string> = {
  lean: "Tiết kiệm",
  balanced: "Cân bằng",
  protected: "An toàn",
  auto: "Tự động",
};

function labelForStrategy(strategy?: string | null): string {
  if (!strategy) return "—";
  return strategyLabels[strategy] ?? strategy.replace(/[_-]/g, " ");
}

function percentage(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function metricCards(metrics?: DecisionBusinessMetrics | null, loading = false) {
  return [
    ["Chi phí nhập", metrics?.projected_purchase_cost == null ? "—" : formatVnd(metrics.projected_purchase_cost)],
    ["Nguy cơ thiếu hàng", percentage(metrics?.stockout_probability)],
    ["Tỷ lệ phục vụ", percentage(metrics?.expected_fill_rate)],
    ["Hao hụt dự kiến", metrics?.expected_waste_quantity == null ? "—" : formatQuantity(metrics.expected_waste_quantity)],
  ].map(([label, value]) => <StatCard key={label} label={label} value={value} loading={loading} />);
}

function itemName(item: DecisionPlanItem): string {
  return item.ingredient_name || item.ingredient || item.ingredient_id || "Nguyên liệu chưa đặt tên";
}

function itemQuantity(item: DecisionPlanItem): string {
  const quantity = item.order_quantity ?? item.quantity;
  return quantity == null ? "—" : formatQuantity(quantity, item.unit);
}

function riskLabel(risk?: number | null, category?: string | null): string {
  if (category) return category;
  if (risk == null || !Number.isFinite(risk)) return "Chưa có dữ liệu";
  const percent = risk <= 1 ? risk * 100 : risk;
  return percent < 10 ? "Thấp" : percent <= 25 ? "Trung bình" : "Cao";
}

function explanationList(title: string, values?: string[]) {
  if (!values?.length) return null;
  return <div><strong>{title}</strong><ul className="decision-list">{values.map((value, index) => <li key={`${title}-${index}`}>{value}</li>)}</ul></div>;
}

/**
 * The deterministic Decision API serializes strategies as a keyed object
 * (for example { lean: {...}, balanced: {...} }), while older API responses
 * use an array. Normalize at this legacy rendering boundary.
 */
function strategyList(decision: DecisionPackage | null): DecisionStrategy[] {
  const rawStrategies = decision?.strategies as unknown;
  if (Array.isArray(rawStrategies)) return rawStrategies;
  if (!rawStrategies || typeof rawStrategies !== "object") return [];

  return Object.entries(rawStrategies as Record<string, unknown>).flatMap(
    ([key, value]) => {
      if (!value || typeof value !== "object") return [];
      const source = value as DecisionStrategy & {
        is_feasible?: unknown;
        items?: unknown;
      };
      const items = Array.isArray(source.items)
        ? source.items as DecisionPlanItem[]
        : undefined;
      return [{
        ...source,
        strategy:
          typeof source.strategy === "string"
            ? source.strategy
            : key,
        feasible:
          typeof source.feasible === "boolean"
            ? source.feasible
            : typeof source.is_feasible === "boolean"
              ? source.is_feasible
              : undefined,
        recommended_plan:
          source.recommended_plan ??
          (items ? { items, valid: typeof source.is_feasible === "boolean" ? source.is_feasible : undefined } : null),
      } as DecisionStrategy];
    },
  );
}

export function DecisionCenter({ decision, running }: { decision: DecisionPackage | null; running: boolean }) {
  const strategies = strategyList(decision);
  const [selected, setSelected] = useState<string | null>(decision?.recommended_strategy ?? strategies[0]?.strategy ?? null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [explanationState, setExplanationState] = useState<"idle" | "loading" | "success" | "error">("loading");
  const stress = decision?.stress_results ?? null;

  useEffect(() => {
    if (!decision?.decision_run_id || decision.status !== "completed") return;
    let active = true;
    void getDecisionExplanation(decision.decision_run_id).then(
      (value) => { if (active) { setExplanation(value); setExplanationState("success"); } },
      () => { if (active) setExplanationState("error"); },
    );
    return () => { active = false; };
  }, [decision?.decision_run_id, decision?.status]);

  if (running) return <section aria-live="polite"><Notice tone="info">Đang lập kế hoạch...</Notice><SummaryGrid columns={4}>{metricCards(undefined, true)}</SummaryGrid></section>;
  if (!decision) return null;
  const lifecycle = decisionRunLifecycle(decision.status);
  if (lifecycle === "unknown") return <Notice tone="error">Máy chủ trả trạng thái mô phỏng không xác định. Hãy tải lại kết quả.</Notice>;
  if (decision.status === "failed" || decision.status === "blocked") {
    const infeasible = decision.failure_code?.toLowerCase().includes("infeasible");
    return <Notice tone={infeasible ? "warning" : "error"}>{infeasible ? "Chưa tìm được kế hoạch khả thi. Ngân sách hoặc các ràng buộc hiện tại khiến mọi phương án đều không đạt yêu cầu." : decision.failure_message || "Không thể lập kế hoạch từ dữ liệu hiện có."}</Notice>;
  }
  if (lifecycle === "processing") return <Notice tone="info">Mô phỏng đang được xử lý. Bạn có thể quay lại sau để xem kết quả.</Notice>;

  const selectedStrategy: DecisionStrategy | undefined = strategies.find((item) => item.strategy === selected) ?? undefined;
  const plan = selectedStrategy?.recommended_plan ?? decision.recommended_plan;
  const items = plan?.items ?? [];
  const critical = decision.critic?.findings?.some((finding) => finding.status === "fail" || finding.severity === "critical");
  const fallbackWarning = decision.warnings?.some((warning) => warning.includes("SCENARIO_HISTORY_INSUFFICIENT"));
  const selectedFeasible = selectedStrategy?.feasible ?? plan?.valid;
  const selectedViolations = selectedStrategy?.violations ?? [];

  return <div className="decision-center">
    {fallbackWarning ? <Notice tone="info"><strong>Đang dùng dự báo dự phòng</strong><br />Chưa đủ dữ liệu lịch sử để dùng dự báo nâng cao. Kế hoạch hiện tại vẫn có thể sử dụng.</Notice> : null}
    <section className="decision-summary">
      <span className="eyebrow">Kết quả mô phỏng {decision.horizon_days ?? "—"} ngày</span>
      <h2>Khuyến nghị: {labelForStrategy(decision.recommended_strategy)}</h2>
      <span className="recommendation-badge">Được ShelfCash đề xuất</span>
      <SummaryGrid columns={4}>{metricCards(decision.business_metrics)}</SummaryGrid>
    </section>

    <SectionHeading title="Đề xuất nhập hàng" />
    {items.length ? <div className="table-wrap"><table><thead><tr><th>Nguyên liệu</th><th>Số lượng</th><th>Nhà cung cấp</th><th>Đặt hàng</th><th>Dự kiến giao</th><th>Chi phí</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.ingredient_id ?? itemName(item)}-${index}`}><td><strong>{itemName(item)}</strong></td><td>{itemQuantity(item)}</td><td>{item.supplier_name || item.supplier || item.supplier_id || "—"}</td><td>{item.order_date ? formatDate(item.order_date) : "—"}</td><td>{item.expected_arrival_date ? formatDate(item.expected_arrival_date) : "—"}</td><td>{item.estimated_cost == null ? "—" : formatVnd(item.estimated_cost)}</td></tr>)}</tbody></table></div> : <Notice tone="success">Chưa cần nhập thêm hàng.</Notice>}
    {selectedFeasible === false ? <Notice tone="warning">Mô phỏng đã hoàn tất nhưng chưa đáp ứng toàn bộ ràng buộc. Hãy xem các điều kiện bên dưới trước khi tạo đơn.</Notice> : null}
    {selectedViolations.length ? <Details summary={`Điều kiện chưa đáp ứng (${selectedViolations.length})`} open><ul className="warning-list">{selectedViolations.map((violation, index) => <li key={`${violation}-${index}`}>{violation}</li>)}</ul></Details> : null}
    {critical ? <Notice tone="warning">Không có phương án đủ điều kiện để khuyến nghị. Tạo đơn nhập hàng bị vô hiệu hóa.</Notice> : null}

    <SectionHeading title="Vì sao ShelfCash đề xuất kế hoạch này?" />
    {explanationState === "loading" ? <Notice tone="info">Đang tạo phần giải thích...</Notice> : null}
    {explanationState === "error" ? <Notice tone="warning">Chưa thể tạo phần giải thích chi tiết. Các số liệu và kế hoạch phía trên vẫn có thể sử dụng.</Notice> : null}
    {explanationState === "success" ? <div className="decision-explanation">{explanation?.summary ? <p>{explanation.summary}</p> : null}{explanationList("Lý do chính", explanation?.why_this_plan)}{explanationList("Rủi ro chính", explanation?.main_risks)}{explanationList("Đánh đổi", explanation?.tradeoffs)}{explanationList("Giả định quan trọng", explanation?.important_assumptions)}</div> : null}

    <SectionHeading title="So sánh chiến lược" />
    <SummaryGrid columns={3}>{strategies.map((item) => <button type="button" className={`strategy-choice ${selected === item.strategy ? "active" : ""}`} aria-pressed={selected === item.strategy} onClick={() => setSelected(item.strategy)} key={item.strategy}><strong>{labelForStrategy(item.strategy)}</strong>{item.strategy === decision.recommended_strategy ? <span>Khuyến nghị</span> : null}<div className="strategy-metrics">{metricCards(item.business_metrics)}</div></button>)}</SummaryGrid>

    <SectionHeading title="Rủi ro tồn kho" />
    {decision.inventory_risk?.length ? <div className="table-wrap"><table><thead><tr><th>Nguyên liệu</th><th>Nguy cơ thiếu</th><th>Số ngày tồn đủ</th><th>Hao hụt dự kiến</th><th>Thiếu hụt dự kiến</th></tr></thead><tbody>{decision.inventory_risk.map((risk, index) => <tr key={`${risk.ingredient_id ?? risk.ingredient_name}-${index}`}><td><strong>{risk.ingredient_name || risk.ingredient || risk.ingredient_id || "—"}</strong><small>{risk.risk_date ? `Rủi ro từ ${formatDate(risk.risk_date)}` : riskLabel(risk.stockout_probability, risk.risk_category)}</small></td><td>{percentage(risk.stockout_probability)} · {riskLabel(risk.stockout_probability, risk.risk_category)}</td><td>{risk.days_of_supply == null ? "—" : `${risk.days_of_supply.toLocaleString("vi-VN")} ngày`}</td><td>{risk.expected_waste == null ? "—" : formatQuantity(risk.expected_waste, risk.unit)}</td><td>{risk.expected_shortage == null ? "—" : formatQuantity(risk.expected_shortage, risk.unit)}</td></tr>)}</tbody></table></div> : <Notice tone="info">Chưa có dữ liệu rủi ro tồn kho cho kế hoạch này.</Notice>}

    {stress?.length ? (
      <>
        <SectionHeading title="Các tình huống đã được hệ thống kiểm tra" />
        <div>
          {stress.map((item, index) => (
            <Notice tone="info" key={`${item.name ?? item.label}-${index}`}>
              <strong>{item.label || item.name || "Tình huống rủi ro"}</strong>
              {item.description ? (
                <>
                  <br />
                  {item.description}
                </>
              ) : null}
              <br />
              Nguy cơ thiếu: {percentage(item.business_metrics?.stockout_probability)}
            </Notice>
          ))}
        </div>
      </>
    ) : null}

    {decision.critic?.findings?.length ? <Details summary="Kiểm tra kế hoạch">{decision.critic.findings.map((finding, index) => <p key={`${finding.code}-${index}`}>{finding.status === "pass" ? <Check size={15} /> : <CircleAlert size={15} />} {finding.message || finding.code || "Kết quả kiểm tra"}</p>)}</Details> : null}
  </div>;
}

"use client";

import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  DecisionBriefFacts,
  DecisionPackage,
  DecisionExplanationResponse,
  ExplanationRequest,
  IngredientDemandRow,
  ProcurementRow,
  WhatIfRequest,
  WhatIfResponse,
} from "../../lib/types";
import { Button, Notice, formatDate, formatQuantity, formatVnd } from "./ui";

const strategyLabels = {
  lean: "Tiết kiệm",
  balanced: "Cân bằng",
  protected: "An toàn",
} as const;

const reasonLabels: Record<string, string> = {
  DEMAND_EXCEEDS_AVAILABLE_SUPPLY: "Nhu cầu dự kiến cao hơn lượng hàng khả dụng",
  LEAD_TIME_PRESSURE: "Cần đặt sớm do thời gian giao hàng",
  EXPIRING_INVENTORY: "Một phần tồn kho sắp hết hạn",
  PACK_SIZE_ROUNDING: "Điều chỉnh theo quy cách đóng gói",
  MOQ_CONSTRAINT: "Điều chỉnh theo số lượng đặt tối thiểu",
  MOQ_ROUNDING: "Điều chỉnh theo số lượng đặt tối thiểu",
};

function readableReason(code: string): string {
  return reasonLabels[code] ?? (code
    ? code.toLocaleLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("vi"))
    : "Yếu tố vận hành");
}

function metric(value: number | null | undefined, suffix = ""): string {
  return value == null || !Number.isFinite(value)
    ? "Chưa có dữ liệu"
    : `${formatQuantity(value)}${suffix}`;
}

function percentage(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function findingText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "label", "title", "code"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key];
    }
  }
  return fallback;
}

function ProcurementCard({ row }: { row: ProcurementRow }) {
  const pack = row.pack_count == null
    ? null
    : `${formatQuantity(row.pack_count)} thùng${row.pack_size == null ? "" : ` × ${formatQuantity(row.pack_size, row.unit ?? "")}`}`;
  return (
    <article className="decision-brief-procurement-card">
      <header>
        <div>
          <h3>{row.ingredient_name || "Nguyên liệu chưa xác định"}</h3>
          <strong>{formatQuantity(row.quantity, row.unit ?? "")}</strong>
        </div>
        {row.purchase_cost == null ? null : <b>{formatVnd(row.purchase_cost)}</b>}
      </header>
      <dl>
        <div><dt>Nhà cung cấp</dt><dd>{row.supplier_name || "Chưa xác định"}</dd></div>
        {pack ? <div><dt>Quy cách</dt><dd>{pack}</dd></div> : null}
        {row.order_date ? <div><dt>Ngày đặt</dt><dd>{formatDate(row.order_date)}</dd></div> : null}
        {row.arrival_date ? <div><dt>Dự kiến giao</dt><dd>{formatDate(row.arrival_date)}</dd></div> : null}
      </dl>
      {row.reason_codes.length ? (
        <div className="decision-brief-reasons" aria-label="Lý do đề xuất">
          <span>Lý do đề xuất</span>
          <div>{row.reason_codes.map((code, index) => <small key={`${code}-${index}`}>{readableReason(code)}</small>)}</div>
        </div>
      ) : null}
    </article>
  );
}

function DemandRangeChart({ row }: { row: IngredientDemandRow }) {
  const entries = [
    { label: "P25 · Khoảng thấp", value: row.p25, className: "p25" },
    { label: "P50 · Dự kiến", value: row.p50, className: "p50" },
    { label: "P75 · Khoảng cao", value: row.p75, className: "p75" },
  ];
  const maximum = Math.max(1, ...entries.map((entry) => entry.value ?? 0));
  return <div className="decision-demand-chart" aria-label={`Biểu đồ nhu cầu ${row.ingredient_name || "nguyên liệu"}`}>
    {entries.map((entry) => <div className="decision-demand-chart-row" key={entry.label}>
      <span>{entry.label}</span>
      <div className="decision-demand-chart-track"><i className={entry.className} style={{ width: `${entry.value == null ? 0 : (entry.value / maximum) * 100}%` }} /></div>
      <strong>{metric(entry.value, row.unit ? ` ${row.unit}` : "")}</strong>
    </div>)}
  </div>;
}

function ExplanationPanel({
  explanation,
  loading,
  error,
  onAsk,
}: {
  explanation: DecisionExplanationResponse | null;
  loading: boolean;
  error: string | null;
  onAsk: (request: ExplanationRequest) => void;
}) {
  const [question, setQuestion] = useState("");
  const ask = (value?: string) => onAsk({
    language: "vi",
    detail_level: "simple",
    ...(value || question.trim() ? { question: value || question.trim() } : {}),
  });
  return <section className="decision-brief-explanation" aria-labelledby="decision-brief-explanation-title">
    <header><MessageCircleQuestion size={20} /><div><h2 id="decision-brief-explanation-title">Tìm hiểu kế hoạch</h2><p>Giải thích chỉ bổ sung ngữ cảnh; kế hoạch nhập ở trên không thay đổi.</p></div></header>
    <div className="decision-brief-quick-actions">
      {[
        "Tại sao chọn kế hoạch này?",
        "Tại sao phải nhập mặt hàng này?",
        "Có rủi ro thiếu hàng không?",
        "Kế hoạch có vượt ngân sách không?",
      ].map((item) => <Button key={item} disabled={loading} onClick={() => ask(item)} variant="secondary">{item}</Button>)}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); ask(); }}>
      <label className="sr-only" htmlFor="decision-brief-question">Hỏi về kế hoạch này</label>
      <input id="decision-brief-question" onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi về kế hoạch này..." value={question} />
      <Button busy={loading} disabled={!question.trim()} type="submit">Hỏi</Button>
    </form>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {explanation ? <article className="decision-brief-answer" aria-live="polite"><strong>Trả lời</strong><p>{explanation.answer}</p></article> : null}
  </section>;
}

function WhatIfPanel({
  result,
  loading,
  error,
  onRun,
}: {
  result: WhatIfResponse | null;
  loading: boolean;
  error: string | null;
  onRun: (mutation: WhatIfRequest) => void;
}) {
  const [demandMultiplier, setDemandMultiplier] = useState("");
  const [supplierDelayDays, setSupplierDelayDays] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [strategy, setStrategy] = useState<"" | "lean" | "balanced" | "protected">("");
  const toNumber = (value: string) => value.trim() === "" ? undefined : Number(value);
  const unavailable = (value: number | null) => value == null ? "Chưa có dữ liệu" : formatQuantity(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const demand = toNumber(demandMultiplier);
    const delay = toNumber(supplierDelayDays);
    const budget = toNumber(budgetLimit);
    if ((demand !== undefined && (!Number.isFinite(demand) || demand <= 0)) ||
      (delay !== undefined && (!Number.isFinite(delay) || delay < 0)) ||
      (budget !== undefined && (!Number.isFinite(budget) || budget < 0))) return;
    onRun({
      ...(demand === undefined ? {} : { demand_multiplier: demand }),
      ...(delay === undefined ? {} : { supplier_delay_days: delay }),
      ...(budget === undefined ? {} : { budget_limit: budget }),
      ...(strategy ? { strategy } : {}),
    });
  };
  return <section className="decision-what-if" aria-labelledby="decision-what-if-title">
    <header><h2 id="decision-what-if-title">Giả lập thay đổi</h2><p>Kết quả giả lập không thay đổi kế hoạch gốc.</p></header>
    <form onSubmit={submit}>
      <label><span>Nhu cầu (hệ số)</span><input min="0.01" onChange={(event) => setDemandMultiplier(event.target.value)} placeholder="Ví dụ: 1,2" step="0.01" type="number" value={demandMultiplier} /></label>
      <label><span>Trễ giao (ngày)</span><input min="0" onChange={(event) => setSupplierDelayDays(event.target.value)} step="1" type="number" value={supplierDelayDays} /></label>
      <label><span>Ngân sách tối đa</span><input min="0" onChange={(event) => setBudgetLimit(event.target.value)} step="1000" type="number" value={budgetLimit} /></label>
      <label><span>Chiến lược</span><select onChange={(event) => setStrategy(event.target.value as typeof strategy)} value={strategy}><option value="">Giữ nguyên</option><option value="lean">Tiết kiệm</option><option value="balanced">Cân bằng</option><option value="protected">An toàn</option></select></label>
      <Button busy={loading} type="submit">Chạy giả lập</Button>
    </form>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {result ? <div className="decision-what-if-result" aria-live="polite">
      <p>{result.grounded_explanation?.answer || "Đã tạo phương án giả lập."}</p>
      <dl><div><dt>Chênh lệch chi phí</dt><dd>{unavailable(result.comparison.purchase_cost_delta)}</dd></div><div><dt>Chênh lệch fill rate</dt><dd>{percentage(result.comparison.expected_fill_rate_delta) || "Chưa có dữ liệu"}</dd></div><div><dt>Chênh lệch rủi ro thiếu hàng</dt><dd>{percentage(result.comparison.stockout_probability_delta) || "Chưa có dữ liệu"}</dd></div></dl>
      <div className="decision-what-if-plans"><section><h3>Kế hoạch gốc</h3>{result.baseline.procurement_rows.length ? result.baseline.procurement_rows.map((row, index) => <ProcurementCard key={`baseline-${row.ingredient_id}-${index}`} row={row} />) : <p>Không có dòng nhập.</p>}</section><section><h3>Phương án giả lập</h3>{result.hypothetical.procurement_rows.length ? result.hypothetical.procurement_rows.map((row, index) => <ProcurementCard key={`hypothetical-${row.ingredient_id}-${index}`} row={row} />) : <p>Không có dòng nhập.</p>}</section></div>
    </div> : null}
  </section>;
}

export function DecisionBriefWorkspace({
  brief,
  loading,
  error,
  onRetry,
  onRunAgain,
  explanation,
  explanationLoading,
  explanationError,
  onExplain,
  whatIf,
  whatIfLoading,
  whatIfError,
  onRunWhatIf,
  decision,
}: {
  brief: DecisionBriefFacts | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRunAgain?: () => void;
  explanation: DecisionExplanationResponse | null;
  explanationLoading: boolean;
  explanationError: string | null;
  onExplain: (request: ExplanationRequest) => void;
  whatIf: WhatIfResponse | null;
  whatIfLoading: boolean;
  whatIfError: string | null;
  onRunWhatIf: (mutation: WhatIfRequest) => void;
  decision?: DecisionPackage | null;
}) {
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  if (loading) return <Notice tone="info">Đang tải kế hoạch nhập hàng…</Notice>;
  if (!brief) return <section className="decision-brief-unavailable"><Notice tone="error">{error || "Chưa tải được kế hoạch nhập hàng."}</Notice><Button onClick={onRetry} variant="secondary"><RefreshCw size={16} /> Thử tải lại</Button></section>;

  const noFeasible = brief.status === "completed_with_no_feasible_recommendation" || !brief.recommendation.available;
  const totalPurchaseCost = brief.recommendation.total_purchase_cost ?? decision?.business_metrics?.projected_purchase_cost ?? null;
  const fillRate = percentage(brief.recommendation.expected_fill_rate ?? decision?.business_metrics?.expected_fill_rate ?? brief.risk.expected_fill_rate);
  const probability = percentage(brief.risk.stockout_probability);
  const selectedDemand = brief.ingredient_demand.find((row) => row.ingredient_id === selectedIngredientId) ?? brief.ingredient_demand[0] ?? null;
  const selectedProcurement = selectedDemand
    ? brief.procurement_rows.find((row) => row.ingredient_id === selectedDemand.ingredient_id)
    : null;
  return <div className="decision-brief-workspace">
    <section className="decision-brief-summary" aria-labelledby="decision-brief-title">
      <header className="decision-brief-summary-header"><div><span className="eyebrow">Kế hoạch đề xuất</span><h1 id="decision-brief-title">Kế hoạch nhập hàng</h1></div>{onRunAgain ? <Button onClick={onRunAgain} variant="secondary"><RefreshCw size={16} /> Chạy lại</Button> : null}</header>
      {brief.recommendation.summary ? <p>{brief.recommendation.summary}</p> : null}
      <div className="decision-brief-metrics">
        <article><span>Chiến lược</span><strong>{brief.recommendation.strategy ? strategyLabels[brief.recommendation.strategy] : "Chưa có"}</strong></article>
        <article><span>Tổng chi phí dự kiến</span><strong>{totalPurchaseCost == null ? "Chưa có dữ liệu" : formatVnd(totalPurchaseCost)}</strong></article>
        <article><span>Expected fill rate</span><strong>{fillRate || "Chưa có dữ liệu"}</strong></article>
        <article><span>Nguyên liệu cần nhập</span><strong>{brief.procurement_rows.length}</strong></article>
      </div>
    </section>
    {noFeasible ? <section className="decision-brief-no-feasible"><h2>Chưa tìm được kế hoạch nhập hàng phù hợp</h2><p>Dự báo nhu cầu đã hoàn tất, nhưng với tồn kho, ngân sách và các ràng buộc hiện tại, hệ thống chưa tìm được phương án nhập hàng khả thi.</p></section> : null}
    {noFeasible ? null : <section className="decision-brief-ingredients" aria-labelledby="decision-brief-ingredients-title"><header><span className="eyebrow">Nhu cầu nguyên liệu</span><h2 id="decision-brief-ingredients-title">Các nguyên liệu</h2><p>Chọn một nguyên liệu để xem biểu đồ nhu cầu và dòng nhập liên quan.</p></header>{brief.ingredient_demand.length ? <div className="decision-brief-ingredient-layout"><div className="decision-brief-ingredient-list" role="list">{brief.ingredient_demand.map((row) => { const active = row.ingredient_id === selectedDemand?.ingredient_id; const procurement = brief.procurement_rows.find((item) => item.ingredient_id === row.ingredient_id); return <button aria-pressed={active} className={active ? "active" : ""} key={row.ingredient_id} onClick={() => setSelectedIngredientId(row.ingredient_id)} type="button"><span><strong>{row.ingredient_name || "Nguyên liệu chưa xác định"}</strong><small>{metric(row.p50, row.unit ? ` ${row.unit}` : "")} dự kiến</small></span>{procurement ? <b>{formatQuantity(procurement.quantity, procurement.unit ?? "")}</b> : <small>Chưa cần nhập</small>}</button>; })}</div>{selectedDemand ? <article className="decision-brief-ingredient-detail" aria-live="polite"><header><div><span className="eyebrow">Nhu cầu dự kiến</span><h3>{selectedDemand.ingredient_name || "Nguyên liệu chưa xác định"}</h3></div>{selectedProcurement ? <strong>Cần mua {formatQuantity(selectedProcurement.quantity, selectedProcurement.unit ?? "")}</strong> : null}</header><DemandRangeChart row={selectedDemand} />{selectedProcurement ? <ProcurementCard row={selectedProcurement} /> : <Notice tone="info">Chưa có dòng nhập được đề xuất cho nguyên liệu này.</Notice>}</article> : null}</div> : <p>Chưa có dữ liệu nhu cầu nguyên liệu.</p>}</section>}
    {!noFeasible && !brief.procurement_rows.length ? <Notice tone="info">Kế hoạch hoàn tất nhưng không có nguyên liệu cần nhập.</Notice> : null}
    <section className="decision-brief-risk" aria-labelledby="decision-brief-risk-title"><h2 id="decision-brief-risk-title">Rủi ro</h2><p>{probability ? `Xác suất thiếu hàng: ${probability}` : "Chưa đủ dữ liệu để ước tính xác suất thiếu hàng."}</p>{brief.risk.shortage_quantity == null ? null : <p>Thiếu hụt dự kiến: {formatQuantity(brief.risk.shortage_quantity)}</p>}</section>
    {(brief.critic.hard_violations.length || brief.critic.warnings.length) ? <section className="decision-brief-critic" aria-labelledby="decision-brief-critic-title"><h2 id="decision-brief-critic-title">Điểm cần lưu ý</h2>{brief.critic.hard_violations.map((item, index) => <Notice key={`hard-${index}`} tone="error">{findingText(item, "Có ràng buộc chưa được đáp ứng.")}</Notice>)}{brief.critic.warnings.map((item, index) => <Notice key={`warning-${index}`} tone="warning">{findingText(item, "Có một yếu tố cần theo dõi.")}</Notice>)}</section> : null}
    <ExplanationPanel error={explanationError} explanation={explanation} loading={explanationLoading} onAsk={onExplain} />
    <WhatIfPanel error={whatIfError} loading={whatIfLoading} onRun={onRunWhatIf} result={whatIf} />
  </div>;
}

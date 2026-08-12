"use client";

import { ArrowRight, CircleAlert, Clock3, PackageSearch, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { adaptDecisionRunView, type DecisionDemandView } from "../../lib/decision-view";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../../lib/types";
import { DemandChart } from "./DemandChart";
import { ForecastChart } from "./ForecastChart";
import { DemandExplanationDialog, noFeasibleDecision } from "./ProcurementDecisionWorkspace";
import { Button, Details, Notice, SectionHeading, StatCard, SummaryGrid, formatDate, formatQuantity, formatVnd } from "./ui";

type DecisionCenterView = "today" | "future";

type TodayAction = {
  key: string;
  urgency: "Cần xử lý ngay" | "Cần theo dõi" | "Sắp đến hạn" | "Chưa đủ dữ liệu để xác nhận";
  title: string;
  body: string;
  cta: string;
  target: "inventory" | "future";
  ingredientId?: string;
};

function percentage(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value <= 1 ? value * 100 : value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function quantity(value: number | null | undefined, unit = ""): string {
  return value == null ? "—" : formatQuantity(value, unit);
}

function procurementStatus(decision: DecisionPackage | null, hasDemand: boolean): string {
  if (!decision) return "Chưa có run";
  if (decision.status === "queued" || decision.status === "running") return "Đang xử lý";
  if (noFeasibleDecision(decision)) return "Chưa có phương án khả thi";
  if (decision.status === "completed" && decision.recommended_strategy && decision.recommended_plan?.items?.length) return "Có phương án khả thi";
  if (decision.status === "failed" || decision.status === "blocked") return "Chưa thể đánh giá";
  return hasDemand ? "Đang chờ xác nhận" : "Chưa có dữ liệu";
}

function dateWindowLabel(dates: string[], asOfDate?: string | null, horizon?: number | null): string {
  if (dates.length) return `${formatDate(dates[0])} – ${formatDate(dates.at(-1) ?? dates[0])}`;
  if (asOfDate && horizon) return `Từ ${formatDate(asOfDate)} · ${horizon} ngày`;
  return "Chưa có khoảng thời gian dự báo";
}

function DemandRows({
  rows,
  onExplain,
  riskIds,
}: {
  rows: DecisionDemandView[];
  onExplain: (row: DecisionDemandView) => void;
  riskIds: Set<string>;
}) {
  return <div className="decision-demand-rows">
    {rows.map((row) => <article className="decision-demand-row" key={`${row.ingredientId}-${row.targetDate}`}>
      <div><h3 title={row.ingredientName}>{row.ingredientName}</h3><p>{quantity(row.p50, row.unit)} dự kiến</p><small>Khoảng {quantity(row.p25, row.unit)} – {quantity(row.p75, row.unit)}</small></div>
      <div className="decision-demand-row-meta"><span>{riskIds.has(row.ingredientId) ? "Có nguy cơ thiếu" : "Chưa có cảnh báo rủi ro"}</span><small>Đến từ {row.contributions.length} món</small><Button onClick={() => onExplain(row)} variant="secondary">Giải thích nhu cầu</Button></div>
    </article>)}
  </div>;
}

function TodayOperationalView({
  data,
  plan,
  decision,
  onNavigate,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  decision: DecisionPackage | null;
  onNavigate: (target: "inventory" | "future", ingredientId?: string) => void;
}) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const expiringLots = plan.enrichedInventory.flatMap((item) => (item.lots ?? []).filter((lot) => lot.status === "expiring" || lot.status === "expired").map((lot) => ({ ingredient: item.ingredient, lot })));
  const actions: TodayAction[] = [
    ...view.risks.map((risk) => ({
      key: `risk-${risk.ingredientId}`,
      urgency: risk.stockoutDate && risk.stockoutDate <= data.today ? "Cần xử lý ngay" : "Cần theo dõi" as TodayAction["urgency"],
      title: risk.ingredientName,
      body: `${risk.stockoutDate ? `Có thể thiếu từ ${formatDate(risk.stockoutDate)}. ` : ""}${risk.shortageQuantity == null ? "Có tín hiệu rủi ro tồn kho." : `Thiếu dự kiến ${quantity(risk.shortageQuantity, risk.unit)}.`}`,
      cta: "Xem nhu cầu & ràng buộc",
      target: "future" as const,
      ingredientId: risk.ingredientId,
    })),
    ...expiringLots.map(({ ingredient, lot }) => ({
      key: `expiry-${lot.lotId}`,
      urgency: "Sắp đến hạn" as const,
      title: ingredient,
      body: `Lô cần chú ý · hạn dùng ${lot.expiryDate ? formatDate(lot.expiryDate) : "chưa ghi nhận"}.`,
      cta: "Xem lô tồn",
      target: "inventory" as const,
    })),
    ...(noFeasibleDecision(decision) ? [{
      key: "plan-review",
      urgency: "Chưa đủ dữ liệu để xác nhận" as const,
      title: "Kế hoạch nhập hàng",
      body: "Dự báo và nhu cầu đã tính, nhưng chưa có phương án mua đáp ứng toàn bộ ràng buộc.",
      cta: "Xem nhu cầu & ràng buộc",
      target: "future" as const,
    }] : []),
  ].slice(0, 8);
  const hasLotData = plan.enrichedInventory.some((item) => (item.lots ?? []).length > 0);

  return <>
    <section className="decision-view-intro"><span className="eyebrow">Vận hành trong ngày</span><h2>Hôm nay</h2><p>Những việc cần chú ý để giữ hoạt động bán hàng ổn định.</p></section>
    <SummaryGrid className="decision-today-cards" columns={4}>
      {view.risks.length ? <StatCard icon={<CircleAlert aria-hidden="true" />} label="Có nguy cơ thiếu hàng" status="warning" value={view.risks.length} /> : null}
      {hasLotData ? <StatCard icon={<Clock3 aria-hidden="true" />} label="Lô sắp hết hạn" status={expiringLots.length ? "warning" : "success"} value={expiringLots.length} /> : null}
      {noFeasibleDecision(decision) ? <StatCard icon={<ScanSearch aria-hidden="true" />} label="Cần rà soát kế hoạch" status="warning" value="1" /> : null}
      {decision?.status === "completed" && decision.recommended_plan?.items?.length ? <StatCard icon={<PackageSearch aria-hidden="true" />} label="Dòng mua cần xử lý" status="success" value={decision.recommended_plan.items.length} /> : null}
    </SummaryGrid>
    <section className="decision-priority" aria-labelledby="decision-priority-title"><SectionHeading title="Ưu tiên hôm nay" />{actions.length ? <div className="decision-priority-list">{actions.map((action) => <article key={action.key}><span className={`decision-urgency ${action.urgency === "Cần xử lý ngay" ? "critical" : ""}`}>{action.urgency}</span><div><h3>{action.title}</h3><p>{action.body}</p></div><Button onClick={() => onNavigate(action.target, action.ingredientId)} variant="secondary">{action.cta} <ArrowRight aria-hidden="true" size={16} /></Button></article>)}</div> : <Notice tone="success">Chưa có việc khẩn cần xử lý hôm nay.<br /><small>ShelfCash sẽ tiếp tục theo dõi tồn kho, hạn dùng và kế hoạch 7 ngày tới.</small></Notice>}</section>
    {view.risks.length || expiringLots.length ? <section className="decision-attention" aria-labelledby="decision-attention-title"><SectionHeading title="Tồn kho cần chú ý" />{view.risks.length ? <div className="decision-attention-list">{view.risks.map((risk) => <article key={risk.ingredientId}><div><h3>{risk.ingredientName}</h3><p>{risk.stockoutDate ? `Có thể thiếu từ ${formatDate(risk.stockoutDate)}` : "Có tín hiệu rủi ro tồn kho"}</p></div><span>{risk.shortageQuantity == null ? "—" : `Thiếu ${quantity(risk.shortageQuantity, risk.unit)}`}</span><Button onClick={() => onNavigate("future", risk.ingredientId)} variant="secondary">Xem chi tiết</Button></article>)}</div> : <div className="decision-attention-list">{expiringLots.map(({ ingredient, lot }) => <article key={lot.lotId}><div><h3>{ingredient}</h3><p>Hạn dùng {lot.expiryDate ? formatDate(lot.expiryDate) : "chưa ghi nhận"}</p></div><span>Lô cần chú ý</span><Button onClick={() => onNavigate("inventory")} variant="secondary">Xem lô tồn</Button></article>)}</div>}</section> : null}
  </>;
}

function FuturePlanningView({ data, plan, decision, initialIngredient }: { data: BootstrapData; plan: PlanResponse; decision: DecisionPackage | null; initialIngredient?: string }) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const ingredientOptions = Array.from(new Map(view.demand.map((item) => [item.ingredientId, item.ingredientName])).entries());
  const [ingredientId, setIngredientId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [explaining, setExplaining] = useState<DecisionDemandView | null>(null);
  const forecastOptions = Object.values(plan.forecasts).filter((forecast) => forecast.forecast.length);
  const [forecastKey, setForecastKey] = useState("");
  const selectedIngredientId = ingredientOptions.some(([id]) => id === ingredientId)
    ? ingredientId
    : ingredientOptions.some(([id]) => id === initialIngredient)
      ? initialIngredient ?? ""
      : ingredientOptions[0]?.[0] || "";
  const selectedDemand = view.demand.filter((item) => item.ingredientId === selectedIngredientId);
  const activeDate = view.dates.includes(selectedDate) ? selectedDate : view.dates[0] || "";
  const dateRows = view.demand.filter((item) => item.targetDate === activeDate);
  const selectedForecast = forecastOptions.find((item) => (item.productId || item.product) === forecastKey) ?? forecastOptions[0];
  const riskIds = new Set(view.risks.map((risk) => risk.ingredientId));
  const noFeasible = noFeasibleDecision(decision);
  const candidateStrategies = view.strategies.filter((strategy) => strategy.itemCount > 0 && strategy.feasible === false);
  const feasibleItems = decision?.recommended_strategy && decision.recommended_plan?.valid && decision.recommended_plan.items?.length ? decision.recommended_plan.items : [];

  return <>
    <section className="decision-view-intro"><span className="eyebrow">Lập kế hoạch</span><h2>Kế hoạch 7 ngày tới</h2><p>Dựa trên dự báo từ {dateWindowLabel(view.dates, decision?.as_of_date, decision?.horizon_days)}</p></section>
    <div className="decision-chart-grid"><section className="decision-chart-panel"><div className="decision-chart-heading"><div><span className="eyebrow">Forecast sản phẩm</span><h3>Dự báo bán hàng</h3></div>{forecastOptions.length ? <label className="decision-selector"><span className="sr-only">Chọn sản phẩm</span><select onChange={(event) => setForecastKey(event.target.value)} value={selectedForecast?.productId || selectedForecast?.product || ""}>{forecastOptions.map((forecast) => <option key={forecast.productId || forecast.product} value={forecast.productId || forecast.product}>{forecast.product || "Sản phẩm chưa xác định"}</option>)}</select></label> : null}</div>{selectedForecast ? <><ForecastChart forecast={selectedForecast} /><p className="decision-chart-summary">Đây là dự báo số món/ly bán ra, không phải số lượng nguyên liệu cần nhập.</p></> : <Notice tone="info">Chưa có chuỗi dự báo sản phẩm trong run hiện tại.</Notice>}</section>{selectedDemand.length ? <section><div className="decision-chart-heading decision-chart-selector-heading"><div><span className="eyebrow">Demand nguyên liệu</span><h3>Nhu cầu theo nguyên liệu</h3></div><label className="decision-selector"><span className="sr-only">Chọn nguyên liệu</span><select onChange={(event) => setIngredientId(event.target.value)} value={selectedIngredientId}>{ingredientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div><DemandChart ingredientName={selectedDemand[0]?.ingredientName || "Nguyên liệu"} rows={selectedDemand} unit={selectedDemand[0]?.unit || ""} /></section> : null}</div>
    <section className="decision-demand-section" aria-labelledby="decision-demand-title"><div className="decision-section-heading"><div><span className="eyebrow">Nhu cầu nguyên liệu</span><h2 id="decision-demand-title">Nhu cầu nguyên liệu dự kiến</h2></div>{activeDate ? <span>{formatDate(activeDate)}</span> : null}</div>{view.dates.length ? <div aria-label="Chọn ngày nhu cầu" className="procurement-date-tabs" role="tablist">{view.dates.map((date) => <button aria-selected={activeDate === date} className={activeDate === date ? "active" : ""} key={date} onClick={() => setSelectedDate(date)} role="tab" type="button">{formatDate(date)}</button>)}</div> : null}{dateRows.length ? <DemandRows onExplain={setExplaining} riskIds={riskIds} rows={dateRows} /> : <Notice tone="info">Chưa có nhu cầu nguyên liệu trong run hiện tại.</Notice>}</section>
    {view.risks.length ? <section className="decision-risk-section" aria-labelledby="decision-risk-title"><SectionHeading title="Rủi ro tồn kho" /><p className="quiet-copy">Các rủi ro dưới đây là kết quả backend trả về cho kịch bản dự kiến.</p><div className="decision-risk-list">{view.risks.map((risk) => <article key={risk.ingredientId}><h3>{risk.ingredientName}</h3><p>{risk.stockoutDate ? `Có thể thiếu từ ${formatDate(risk.stockoutDate)}` : "Có tín hiệu rủi ro tồn kho"}</p><dl><div><dt>Thiếu dự kiến</dt><dd>{quantity(risk.shortageQuantity, risk.unit)}</dd></div><div><dt>Tồn đầu kỳ</dt><dd>{quantity(risk.beginningInventory, risk.unit)}</dd></div><div><dt>Mức đáp ứng</dt><dd>{percentage(risk.fillRate)}</dd></div></dl></article>)}</div></section> : null}
    <section className="decision-procurement" aria-labelledby="decision-procurement-title"><SectionHeading title="Kế hoạch nhập hàng" />{noFeasible ? <><Notice tone="warning"><strong>Chưa tìm được phương án nhập thỏa toàn bộ ràng buộc</strong><br />Dự báo và nhu cầu nguyên liệu đã được tính. Tuy nhiên, hệ thống chưa thể tạo kế hoạch mua hàng đáp ứng toàn bộ điều kiện hiện tại.</Notice>{view.blockers.length ? <ul className="warning-list">{view.blockers.map((blocker, index) => <li key={`${blocker.title}-${index}`}><strong>{blocker.title}</strong>{blocker.observed != null ? ` Mức đáp ứng thấp nhất: ${percentage(blocker.observed)}.` : ""}{blocker.required != null ? ` Yêu cầu tối thiểu: ${percentage(blocker.required)}.` : ""}</li>)}</ul> : <p className="quiet-copy">Hệ thống chưa trả về lý do chi tiết cho run này.</p>}{candidateStrategies.length ? <div className="decision-candidate-list">{candidateStrategies.map((strategy) => <article key={strategy.key}><span className="eyebrow">{strategy.label}</span><h3>Phương án mô phỏng tham khảo</h3><p>Chưa đủ điều kiện để tạo đơn nhập · {strategy.itemCount} dòng mua mô phỏng.</p>{strategy.observedFillRate != null ? <small>Mức đáp ứng thấp nhất {percentage(strategy.observedFillRate)}{strategy.requiredFillRate != null ? ` · yêu cầu ${percentage(strategy.requiredFillRate)}` : ""}</small> : null}</article>)}</div> : null}</> : feasibleItems.length ? <><Notice tone="success">Đã có phương án nhập khả thi. Kiểm tra chi tiết trước khi tạo đơn.</Notice><div className="table-wrap"><table><thead><tr><th>Nguyên liệu</th><th>Số lượng</th><th>Đặt hàng</th><th>Dự kiến giao</th><th>Chi phí</th></tr></thead><tbody>{feasibleItems.map((item, index) => <tr key={`${item.ingredient_id ?? item.ingredient_name}-${index}`}><td>{item.ingredient_name || item.ingredient || "Nguyên liệu chưa xác định"}</td><td>{quantity(item.order_quantity ?? item.quantity, item.unit)}</td><td>{item.order_date ? formatDate(item.order_date) : "—"}</td><td>{item.expected_arrival_date ? formatDate(item.expected_arrival_date) : "—"}</td><td>{item.estimated_cost == null ? "—" : formatVnd(item.estimated_cost)}</td></tr>)}</tbody></table></div></> : <Notice tone="info">Chưa có kế hoạch nhập để hiển thị.</Notice>}</section>
    {view.warnings.length ? <Details summary="Lưu ý về chất lượng dữ liệu và kết quả"><ul className="warning-list">{view.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></Details> : null}
    {explaining ? <DemandExplanationDialog onClose={() => setExplaining(null)} row={explaining} /> : null}
  </>;
}

export function DecisionCenterWorkspace({
  activeView,
  data,
  decision,
  initialIngredient,
  onNavigate,
  onViewChange,
  plan,
}: {
  activeView: DecisionCenterView;
  data: BootstrapData;
  decision: DecisionPackage | null;
  initialIngredient?: string;
  onNavigate: (target: "inventory" | "plan") => void;
  onViewChange: (view: DecisionCenterView, ingredientId?: string) => void;
  plan: PlanResponse;
}) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const hasDemand = view.demand.length > 0;
  return <div className="decision-center-workspace"><header className="decision-center-header"><div><span className="eyebrow">Dữ liệu cập nhật theo run gần nhất</span><h1>Trung tâm quyết định</h1><p>{dateWindowLabel(view.dates, decision?.as_of_date, decision?.horizon_days)}</p></div><div aria-label="Chuyển chế độ xem" className="decision-view-switcher" role="tablist"><button aria-selected={activeView === "today"} className={activeView === "today" ? "active" : ""} onClick={() => onViewChange("today")} role="tab" type="button">Hôm nay</button><button aria-selected={activeView === "future"} className={activeView === "future" ? "active" : ""} onClick={() => onViewChange("future")} role="tab" type="button">7 ngày tới</button></div></header><ol aria-label="Trạng thái dữ liệu" className="decision-status-rail"><li><strong>Dự báo bán hàng</strong><span>{decision?.status === "queued" || decision?.status === "running" ? "Đang xử lý" : hasDemand || Object.keys(plan.forecasts).length ? "Hoàn tất" : "Chưa có dữ liệu"}</span></li><li><strong>Nhu cầu nguyên liệu</strong><span>{hasDemand ? "Đã tính" : decision?.status === "queued" || decision?.status === "running" ? "Đang xử lý" : "Chưa có dữ liệu"}</span></li><li><strong>Kế hoạch nhập</strong><span>{procurementStatus(decision, hasDemand)}</span></li></ol>{activeView === "today" ? <TodayOperationalView data={data} decision={decision} onNavigate={(target, ingredientId) => target === "inventory" ? onNavigate("inventory") : onViewChange("future", ingredientId)} plan={plan} /> : <FuturePlanningView data={data} decision={decision} initialIngredient={initialIngredient} plan={plan} />}</div>;
}

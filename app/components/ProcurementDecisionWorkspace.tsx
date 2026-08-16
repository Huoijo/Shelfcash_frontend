"use client";

import { ArrowRight, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptDecisionRunView, type DecisionDemandView, type DecisionStrategyView } from "../../lib/decision-view";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../../lib/types";
import { Button, Details, Notice, formatDate, formatQuantity, formatVnd } from "./ui";

function noFeasibleDecision(decision: DecisionPackage | null): boolean {
  if (!decision) return false;
  return decision.status === "completed_with_no_feasible_recommendation" || (
    decision.status === "completed" &&
    decision.recommended_strategy == null &&
    decision.recommended_plan?.valid === false &&
    (decision.recommended_plan.items?.length ?? 0) === 0
  );
}

function dateWindowLabel(asOfDate: string | undefined, horizonDays: number): string {
  if (!asOfDate) return `Dự báo ${horizonDays} ngày tới`;
  const start = new Date(`${asOfDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return `Dự báo ${horizonDays} ngày tới`;
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(0, horizonDays - 1));
  const formatter = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function quantity(value: number | null, unit = ""): string {
  return value == null ? "—" : formatQuantity(value, unit);
}

function percentage(value: number | null): string {
  if (value == null) return "—";
  return `${(value <= 1 ? value * 100 : value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function DemandExplanationDialog({ row, onClose }: { row: DecisionDemandView; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [selectedContribution, setSelectedContribution] = useState(0);
  const contribution = row.contributions[selectedContribution];

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); opener.current?.focus(); };
  }, [onClose]);

  return <div className="procurement-drawer-layer">
    <button aria-label="Đóng giải thích nhu cầu nguyên liệu" className="procurement-drawer-backdrop" onClick={onClose} type="button" />
    <aside aria-labelledby="procurement-drawer-title" aria-modal="true" className="procurement-drawer" ref={drawer} role="dialog">
      <header className="procurement-drawer-header">
        <div><span className="eyebrow">Giải thích nhu cầu</span><h2 id="procurement-drawer-title">Tại sao cần {quantity(row.p50, row.unit)} {row.ingredientName}?</h2></div>
        <button aria-label="Đóng giải thích nhu cầu nguyên liệu" className="decision-workspace-close" onClick={onClose} ref={closeButton} type="button"><X aria-hidden="true" size={20} /></button>
      </header>
      <dl className="procurement-drawer-total">
        <div><dt>Tổng nhu cầu dự kiến</dt><dd>{quantity(row.p50, row.unit)}</dd></div>
        <div><dt>Khoảng dự báo</dt><dd>{quantity(row.p25, row.unit)} – {quantity(row.p75, row.unit)}</dd></div>
      </dl>
      {row.contributions.length ? <>
        <div aria-label={`Biểu đồ đóng góp nhu cầu cho ${row.ingredientName}`} className="procurement-contribution-bars" role="img">{row.contributions.map((item, index, values) => {
          const maximum = Math.max(...values.map((value) => value.p50 ?? 0), 1);
          const width = Math.max(4, ((item.p50 ?? 0) / maximum) * 100);
          return <div key={`${item.productName}-bar-${index}`}><span>{item.productName}</span><i style={{ width: `${width}%` }} /><strong>{quantity(item.p50, item.unit || row.unit)}</strong></div>;
        })}</div>
        <div className="procurement-contributions"><h3>Đến từ {row.contributions.length} món</h3>{row.contributions.map((item, index) => <button aria-pressed={index === selectedContribution} className={index === selectedContribution ? "active" : ""} key={`${item.productName}-${index}`} onClick={() => setSelectedContribution(index)} type="button"><span>{item.productName}</span><strong>{quantity(item.p50, item.unit || row.unit)}</strong></button>)}</div>
        {contribution ? <section className="procurement-contribution-detail"><h3>{contribution.productName}</h3><dl>
          <div><dt>Dự báo trung vị</dt><dd>{quantity(contribution.forecastP50, "sản phẩm")}</dd></div>
          <div><dt>Khoảng dự báo</dt><dd>{quantity(contribution.forecastP25, "sản phẩm")} – {quantity(contribution.forecastP75, "sản phẩm")}</dd></div>
          <div><dt>Công thức</dt><dd>{contribution.recipeQuantity == null ? "Chưa có chi tiết công thức" : `${formatQuantity(contribution.recipeQuantity)} ${contribution.recipeUnit || row.unit} / sản phẩm`}</dd></div>
          <div><dt>Đóng góp nhu cầu</dt><dd>{quantity(contribution.p50, contribution.unit || row.unit)}</dd></div>
          <div><dt>Khoảng đóng góp</dt><dd>{quantity(contribution.p25, contribution.unit || row.unit)} – {quantity(contribution.p75, contribution.unit || row.unit)}</dd></div>
        </dl></section> : null}
      </> : <Notice tone="info">Chưa có dữ liệu đóng góp theo món cho nguyên liệu này.</Notice>}
    </aside>
  </div>;
}

function CandidateStrategy({ strategy }: { strategy: DecisionStrategyView }) {
  const [open, setOpen] = useState(false);
  return <article className="procurement-strategy-card">
    <div><span className="eyebrow">{strategy.label}</span><h3>{strategy.feasible === false ? "Chưa đạt điều kiện tạo đơn" : "Kết quả mô phỏng"}</h3>
      {strategy.itemCount ? <p>{strategy.itemCount} dòng mua mô phỏng</p> : <p>Không có phương án mua đạt điều kiện.</p>}
      {strategy.observedFillRate != null ? <dl className="procurement-strategy-metrics"><div><dt>Mức đáp ứng thấp nhất</dt><dd>{percentage(strategy.observedFillRate)}</dd></div>{strategy.requiredFillRate != null ? <div><dt>Yêu cầu tối thiểu</dt><dd>{percentage(strategy.requiredFillRate)}</dd></div> : null}</dl> : null}
    </div>
    {strategy.itemCount ? <><Button aria-expanded={open} onClick={() => setOpen((value) => !value)} variant="secondary">Xem chi tiết <ChevronDown aria-hidden="true" size={16} /></Button>{open ? <div className="procurement-strategy-detail"><Notice tone="warning">Đây là phương án mô phỏng chưa đáp ứng toàn bộ ràng buộc. Không thể dùng để tạo đơn nhập.</Notice><div className="table-wrap"><table><thead><tr><th>Nguyên liệu</th><th>Số lượng</th><th>Quy cách</th><th>Đặt hàng</th><th>Dự kiến giao</th><th>Chi phí</th></tr></thead><tbody>{strategy.items.map((item, index) => <tr key={`${item.ingredientName}-${index}`}><td><strong>{item.ingredientName}</strong>{item.emergency ? <small>Ưu tiên khẩn</small> : null}</td><td>{quantity(item.orderQuantity, item.unit)}</td><td>{item.packCount == null ? "—" : `${item.packCount} gói${item.packSize == null ? "" : ` · ${formatQuantity(item.packSize, item.unit)}`}`}</td><td>{item.orderDate ? formatDate(item.orderDate) : "—"}</td><td>{item.arrivalDate ? formatDate(item.arrivalDate) : "—"}</td><td>{item.purchaseCost == null ? "—" : formatVnd(item.purchaseCost)}</td></tr>)}</tbody></table></div></div> : null}</> : null}
  </article>;
}

export function ProcurementDecisionWorkspace({ data, plan, decision, busy, onRunAgain }: { data: BootstrapData; plan: PlanResponse; decision: DecisionPackage | null; busy: boolean; onRunAgain: () => void }) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const [requestedDate, setRequestedDate] = useState("");
  const [drawerKey, setDrawerKey] = useState("");
  const selectedDate = view.dates.includes(requestedDate) ? requestedDate : view.dates[0] || "";
  const rows = view.demand.filter((item) => item.targetDate === selectedDate);
  const selectedRow = rows.find((item) => `${item.ingredientId}-${item.targetDate}` === drawerKey);
  const ingredientCount = new Set(view.demand.map((item) => item.ingredientId)).size;
  const hasDemand = view.demand.length > 0;
  const horizon = decision?.horizon_days ?? plan.horizonDays ?? data.settings.forecastHorizon;
  const asOfDate = decision?.as_of_date ?? plan.cutoffDate ?? data.today;

  return <>
    <header className="procurement-workspace-header"><div><h1>Kế hoạch nhập hàng</h1><span className="page-header-context">{dateWindowLabel(asOfDate || undefined, horizon)}</span></div><Button busy={busy} onClick={onRunAgain} variant="secondary">Chạy lại kế hoạch</Button></header>
    <ol className="procurement-run-status" aria-label="Tổng quan kế hoạch"><li className="complete"><strong>Dự báo bán hàng</strong><span>Hoàn tất</span></li><li className="complete"><strong>Nhu cầu nguyên liệu</strong><span>{hasDemand ? `Đã tính · ${ingredientCount} nguyên liệu · ${view.dates.length} ngày` : "Chưa có dữ liệu nhu cầu"}</span></li><li className="warning"><strong>Kế hoạch nhập</strong><span>Chưa có phương án khả thi</span></li></ol>
    <section className="procurement-plan-state" aria-labelledby="procurement-plan-state-title"><span className="eyebrow">Trạng thái kế hoạch nhập</span><h2 id="procurement-plan-state-title">Chưa tìm được kế hoạch nhập đủ an toàn</h2><p>Dự báo và nhu cầu nguyên liệu đã được tính. Tuy nhiên, không có phương án mua hàng nào đáp ứng toàn bộ ràng buộc hiện tại.</p>{view.blockers.length ? <ul className="warning-list">{view.blockers.map((blocker, index) => <li key={`${blocker.title}-${index}`}><strong>{blocker.title}</strong>{blocker.observed != null ? <span> Mức đáp ứng thấp nhất: {percentage(blocker.observed)}.</span> : null}{blocker.required != null ? <span> Mức yêu cầu: tối thiểu {percentage(blocker.required)}.</span> : null}</li>)}</ul> : <p className="quiet-copy">Chưa có lý do chi tiết. Hãy kiểm tra nhu cầu nguyên liệu và các điều kiện lập kế hoạch.</p>}<Button onClick={() => document.getElementById("ingredient-demand")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Xem nhu cầu nguyên liệu <ArrowRight aria-hidden="true" size={16} /></Button></section>
    <section className="procurement-demand" id="ingredient-demand" aria-labelledby="ingredient-demand-title"><div className="procurement-section-heading"><div><span className="eyebrow">Đầu vào cho kế hoạch nhập</span><h2 id="ingredient-demand-title">Nhu cầu nguyên liệu dự kiến</h2></div>{selectedDate ? <span>{formatDate(selectedDate)}</span> : null}</div>{view.dates.length ? <div className="procurement-date-tabs" role="tablist" aria-label="Ngày nhu cầu nguyên liệu">{view.dates.map((date) => <button aria-selected={selectedDate === date} className={selectedDate === date ? "active" : ""} key={date} onClick={() => setRequestedDate(date)} role="tab" type="button">{formatDate(date)}</button>)}</div> : null}{rows.length ? <div className="procurement-demand-list">{rows.map((row) => <article className="procurement-demand-card" key={`${row.ingredientId}-${row.targetDate}`}><div><h3 title={row.ingredientName}>{row.ingredientName}</h3><p>{quantity(row.p50, row.unit)} dự kiến</p><small>Khoảng {quantity(row.p25, row.unit)} – {quantity(row.p75, row.unit)}</small></div><div className="procurement-demand-card-action"><span>Đến từ {row.contributions.length} món</span><Button onClick={() => setDrawerKey(`${row.ingredientId}-${row.targetDate}`)} variant="secondary">Tại sao cần lượng này?</Button></div></article>)}</div> : <Notice tone="info">Chưa có nhu cầu nguyên liệu trong kết quả này.</Notice>}</section>
    {view.risks.length ? <section className="procurement-risk" aria-labelledby="procurement-risk-title"><div className="procurement-section-heading"><div><span className="eyebrow">Kịch bản dự kiến</span><h2 id="procurement-risk-title">Rủi ro tồn kho theo kịch bản dự kiến</h2></div><span>{view.risks.length} nguyên liệu có nguy cơ thiếu</span></div><div className="procurement-risk-list">{view.risks.map((risk) => <article key={risk.ingredientId}><h3>{risk.ingredientName}</h3>{risk.stockoutDate ? <p>Có thể thiếu từ {formatDate(risk.stockoutDate)}</p> : null}<dl><div><dt>Thiếu dự kiến</dt><dd>{quantity(risk.shortageQuantity, risk.unit)}</dd></div><div><dt>Tồn đầu kỳ</dt><dd>{quantity(risk.beginningInventory, risk.unit)}</dd></div><div><dt>Mức đáp ứng</dt><dd>{percentage(risk.fillRate)}</dd></div></dl></article>)}</div></section> : null}
    <section className="procurement-candidates" aria-labelledby="procurement-candidates-title"><div className="procurement-section-heading"><div><span className="eyebrow">Phương án đã kiểm tra</span><h2 id="procurement-candidates-title">Phương án mô phỏng chưa đạt điều kiện</h2></div></div>{view.strategies.length ? <div className="procurement-strategy-list">{view.strategies.map((strategy) => <CandidateStrategy key={strategy.key} strategy={strategy} />)}</div> : <Notice tone="info">Chưa có phương án mô phỏng để đối chiếu.</Notice>}</section>
    {view.warnings.length ? <Details summary="Lưu ý về kết quả"><ul className="warning-list">{view.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></Details> : null}
    <section className="procurement-order-state" aria-labelledby="procurement-order-state-title"><h2 id="procurement-order-state-title">Chưa thể tạo đơn nhập</h2><p>Chưa thể tạo đơn nhập vì chưa có phương án đáp ứng toàn bộ ràng buộc.</p></section>
    {selectedRow ? <DemandExplanationDialog onClose={() => setDrawerKey("")} row={selectedRow} /> : null}
  </>;
}

export { noFeasibleDecision, DemandExplanationDialog };

export function ProcurementLoadingWorkspace({ onRunAgain }: { onRunAgain: () => void }) {
  return <><header className="procurement-workspace-header"><div><h1>Kế hoạch nhập hàng</h1></div><Button busy disabled onClick={onRunAgain} variant="secondary">Đang chạy kế hoạch</Button></header><ol className="procurement-run-status" aria-label="Tiến trình kế hoạch nhập hàng"><li><strong>Dự báo bán hàng</strong><span>Đang xử lý</span></li><li><strong>Nhu cầu nguyên liệu</strong><span>Đang chờ kết quả</span></li><li><strong>Kế hoạch nhập</strong><span>Đang kiểm tra khả thi</span></li></ol><section aria-label="Đang tải nhu cầu nguyên liệu" className="procurement-loading"><span /><span /><span /></section></>;
}

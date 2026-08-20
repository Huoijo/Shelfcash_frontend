"use client";

import { ArrowRight, CircleAlert, Clock3, PackageSearch, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { adaptDecisionRunView, type DecisionDemandView } from "../../lib/decision-view";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../../lib/types";
import { DemandChart } from "./DemandChart";
import { ForecastChart } from "./ForecastChart";
import { DemandExplanationDialog, noFeasibleDecision } from "./ProcurementDecisionWorkspace";
import { Button, Details, GuidanceHint, Notice, SectionHeading, StatCard, SummaryGrid, formatDate, formatQuantity, formatVnd } from "./ui";

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
  if (!decision) return "Chưa có kết quả";
  if (decision.status === "queued" || decision.status === "running") return "Đang xử lý";
  if (noFeasibleDecision(decision)) return "Chưa có phương án khả thi";
  if (decision.status === "completed" && decision.recommended_strategy && decision.recommended_plan?.items?.length) return "Có phương án khả thi";
  if (decision.status === "failed" || decision.status === "blocked") return "Chưa thể đánh giá";
  return hasDemand ? "Đang chờ xác nhận" : "Chưa có dữ liệu";
}

function dateWindowLabel(dates: string[], asOfDate?: string | null, horizon?: number | null): string {
  if (dates.length) return `${formatDate(dates[0])} – ${formatDate(dates.at(-1) ?? dates[0])}`;
  if (asOfDate && horizon) return `Từ ${formatDate(asOfDate)} · ${horizon} ngày`;
  return "";
}

function formatBackendDate(value?: string): string {
  return value ? formatDate(value) : "chưa ghi nhận";
}

function parseDaysRemaining(expiryDate?: string, todayDate?: string): number | null {
  if (!expiryDate) return null;
  const target = new Date(`${expiryDate}T00:00:00Z`).getTime();
  const base = new Date(`${todayDate || "2026-08-20"}T00:00:00Z`).getTime();
  if (isNaN(target) || isNaN(base)) return null;
  return Math.round((target - base) / (1000 * 60 * 60 * 24));
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
  return (
    <div className="decision-demand-rows">
      {rows.map((row) => (
        <article className="decision-demand-row" key={`${row.ingredientId}-${row.targetDate}`}>
          <div>
            <h3 title={row.ingredientName}>{row.ingredientName}</h3>
            <p>{quantity(row.p50, row.unit)} dự kiến</p>
            <small>Khoảng {quantity(row.p25, row.unit)} – {quantity(row.p75, row.unit)}</small>
          </div>
          <div className="decision-demand-row-meta">
            <span>{riskIds.has(row.ingredientId) ? "Có nguy cơ thiếu" : "Chưa có cảnh báo rủi ro"}</span>
            <small>Đến từ {row.contributions.length} món</small>
            <Button onClick={() => onExplain(row)} variant="secondary">Giải thích nhu cầu</Button>
          </div>
        </article>
      ))}
    </div>
  );
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
  onNavigate: (target: "inventory" | "plan") => void;
}) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);

  // Extract and sort inventory items with expiring lots by daysRemaining ascending (Cam 4d -> Chuối 6d)
  const inventoryItemsWithExpiringLots = useMemo(() => {
    const map = new Map<string, {
      key: string;
      ingredientId: string;
      ingredient: string;
      unit: string;
      affectedQty: number;
      earliestExpiry?: string;
      daysRemaining: number | null;
      lotCount: number;
    }>();

    for (const item of plan.enrichedInventory) {
      const expiringOrExpiredLots = (item.lots ?? []).filter(
        (l) => l.status === "expiring" || l.status === "expired"
      );
      if (expiringOrExpiredLots.length > 0) {
        const totalAffected = expiringOrExpiredLots.reduce((sum, l) => sum + (l.onHand || 0), 0);
        const earliestExpiry = expiringOrExpiredLots
          .map((l) => l.expiryDate)
          .filter(Boolean)
          .sort()[0];
        const days = parseDaysRemaining(earliestExpiry, data.today);
        map.set(item.ingredientId || item.sku, {
          key: item.ingredientId || item.sku,
          ingredientId: item.ingredientId || item.sku,
          ingredient: item.ingredient,
          unit: item.unit,
          affectedQty: totalAffected || item.onHand,
          earliestExpiry,
          daysRemaining: days,
          lotCount: expiringOrExpiredLots.length,
        });
      } else if (item.statusKey === "expiring" || item.statusKey === "expired") {
        const days = parseDaysRemaining(item.expiryDate, data.today);
        map.set(item.ingredientId || item.sku, {
          key: item.ingredientId || item.sku,
          ingredientId: item.ingredientId || item.sku,
          ingredient: item.ingredient,
          unit: item.unit,
          affectedQty: item.onHand,
          earliestExpiry: item.expiryDate,
          daysRemaining: days,
          lotCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const daysA = a.daysRemaining ?? 999;
      const daysB = b.daysRemaining ?? 999;
      return daysA - daysB;
    });
  }, [plan.enrichedInventory, data.today]);

  const purchasePlanItems = decision?.recommended_plan?.items ?? [];
  const purchaseItemCount = purchasePlanItems.length;
  const totalPlannedCost =
    decision?.business_metrics?.projected_purchase_cost ??
    purchasePlanItems.reduce((sum, line) => sum + (line.estimated_cost ?? 0), 0);
  const hasFeasiblePlan =
    decision?.status === "completed" &&
    Boolean(decision.recommended_strategy) &&
    purchaseItemCount > 0;
  const isNoFeasible = noFeasibleDecision(decision);

  const hasDemand = view.demand.length > 0;
  const hasForecast = Object.keys(plan.forecasts).length > 0 || hasDemand;
  const isRunning = decision?.status === "queued" || decision?.status === "running";

  const forecastStatusText = hasForecast ? "Sẵn sàng" : isRunning ? "Đang chạy" : "Chưa chạy";
  const demandStatusText = hasDemand ? "Đã tính" : isRunning ? "Đang tính" : "Chờ dự báo";
  const planStatusText = hasFeasiblePlan
    ? "Sẵn sàng"
    : isNoFeasible
      ? "Chưa khả thi"
      : isRunning
        ? "Đang xử lý"
        : "Chờ dữ liệu";

  const expiringLotsCount = plan.enrichedInventory.flatMap((item) =>
    (item.lots ?? []).filter((lot) => lot.status === "expiring" || lot.status === "expired")
  ).length || inventoryItemsWithExpiringLots.length;

  const operationalAlerts = useMemo(() => {
    const alerts: Array<{
      key: string;
      ingredientId?: string;
      title: string;
      context: string;
      daysRemaining?: number | null;
      severity: "critical" | "warning";
      statusLabel?: string;
      cta: string;
      target: "inventory" | "plan";
    }> = [];

    // Decision run stockout risks
    for (const risk of view.risks) {
      alerts.push({
        key: `risk-${risk.ingredientId}`,
        ingredientId: risk.ingredientId,
        title: risk.ingredientName,
        context: `${risk.stockoutDate ? `Có thể thiếu từ ${formatDate(risk.stockoutDate)}. ` : ""}${risk.shortageQuantity == null ? "Có tín hiệu rủi ro tồn kho." : `Thiếu dự kiến ${quantity(risk.shortageQuantity, risk.unit)}.`}`,
        daysRemaining: risk.stockoutDate ? parseDaysRemaining(risk.stockoutDate, data.today) : null,
        severity: risk.stockoutDate && risk.stockoutDate <= data.today ? "critical" : "warning",
        statusLabel: "Nguy cơ thiếu",
        cta: "Xem nhu cầu & ràng buộc",
        target: "plan",
      });
    }

    // Expiring lots
    for (const item of inventoryItemsWithExpiringLots) {
      const isCritical = item.daysRemaining != null && item.daysRemaining <= 4;
      alerts.push({
        key: `lot-${item.key}`,
        ingredientId: item.ingredientId,
        title: item.ingredient,
        context: `${formatQuantity(item.affectedQty, item.unit)} thuộc lô gần hạn${item.lotCount > 1 ? ` · ${item.lotCount} lô` : ""}`,
        daysRemaining: item.daysRemaining,
        severity: isCritical ? "critical" : "warning",
        statusLabel: item.earliestExpiry ? `Hạn ${formatBackendDate(item.earliestExpiry)}` : "Gần hạn",
        cta: "Xem kho →",
        target: "inventory",
      });
    }

    return alerts.sort((a, b) => {
      const daysA = a.daysRemaining ?? 999;
      const daysB = b.daysRemaining ?? 999;
      return daysA - daysB;
    });
  }, [view.risks, inventoryItemsWithExpiringLots, data.today]);

  return (
    <div className="today-briefing-wrap">
      {/* ── 1. TRẠNG THÁI QUYẾT ĐỊNH (Pipeline Strip) ── */}
      <section className="today-pipeline-section" aria-labelledby="today-pipeline-title">
        <span id="today-pipeline-title" className="today-section-eyebrow">Trạng thái quyết định</span>
        <div className="today-pipeline-strip">
          <div className="pipeline-stage">
            <span className={`pipeline-dot ${hasForecast ? "is-ready" : isRunning ? "is-running" : "is-pending"}`} />
            <div className="pipeline-stage-info">
              <span className="pipeline-stage-label">Dự báo</span>
              <strong className="pipeline-stage-status">{forecastStatusText}</strong>
            </div>
          </div>

          <span className="pipeline-connector" aria-hidden="true">→</span>

          <div className="pipeline-stage">
            <span className={`pipeline-dot ${hasDemand ? "is-ready" : isRunning ? "is-running" : "is-pending"}`} />
            <div className="pipeline-stage-info">
              <span className="pipeline-stage-label">Nhu cầu</span>
              <strong className="pipeline-stage-status">{demandStatusText}</strong>
            </div>
          </div>

          <span className="pipeline-connector" aria-hidden="true">→</span>

          <div className="pipeline-stage">
            <span className={`pipeline-dot ${hasFeasiblePlan ? "is-ready" : isRunning ? "is-running" : "is-pending"}`} />
            <div className="pipeline-stage-info">
              <span className="pipeline-stage-label">Kế hoạch</span>
              <strong className="pipeline-stage-status">{planStatusText}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. HÔM NAY CẦN CHÚ Ý (Attention Summary Strip) ── */}
      <section className="today-attention-section">
        <span className="today-section-eyebrow">Hôm nay cần chú ý</span>
        <div className="today-attention-summary-bar">
          <div className="attention-kpi-item">
            <span className="attention-kpi-num is-warning">{expiringLotsCount}</span>
            <span className="attention-kpi-label">lô gần hạn</span>
          </div>
          <div className="attention-kpi-divider" aria-hidden="true" />
          <div className="attention-kpi-item">
            <span className="attention-kpi-num is-primary">{purchaseItemCount}</span>
            <span className="attention-kpi-label">dòng mua cần xử lý</span>
          </div>
        </div>
      </section>

      {/* ── 3. TWO SEMANTIC LANES (Desktop 2-columns / Mobile Stack) ── */}
      <div className="today-lanes-grid">
        {/* Lane A: RỦI RO VẬN HÀNH / ƯU TIÊN HÔM NAY */}
        <section className="today-lane lane-operational-risks">
          <div className="lane-header">
            <h3 className="lane-title">Rủi ro vận hành (Ưu tiên hôm nay)</h3>
            {operationalAlerts.length > 0 ? (
              <span className="lane-badge is-warning">{operationalAlerts.length} việc cần chú ý</span>
            ) : null}
          </div>

          <div className="lane-content-rows">
            {operationalAlerts.length > 0 ? (
              operationalAlerts.map((alert) => (
                <div className="operational-alert-row" key={alert.key}>
                  <div className="alert-row-main">
                    <strong className="alert-item-title">{alert.title}</strong>
                    <span className="alert-item-context">{alert.context}</span>
                  </div>
                  <div className="alert-row-aside">
                    <span
                      className={`alert-days-badge ${
                        alert.daysRemaining != null && alert.daysRemaining <= 4 ? "is-critical" : ""
                      }`}
                    >
                      {alert.daysRemaining != null
                        ? alert.daysRemaining <= 0
                          ? "Đã hết hạn"
                          : `Còn ${alert.daysRemaining} ngày`
                        : alert.statusLabel}
                    </span>
                    <button
                      type="button"
                      className="lane-action-cta"
                      onClick={() => onNavigate(alert.target)}
                    >
                      {alert.cta}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="lane-empty-state">
                Kho an toàn, không có lô nào gần hạn hoặc bất thường.
              </div>
            )}
          </div>
        </section>

        {/* Lane B: QUYẾT ĐỊNH ĐANG CHỜ */}
        <section className="today-lane lane-pending-decisions">
          <div className="lane-header">
            <h3 className="lane-title">Quyết định đang chờ</h3>
            {purchaseItemCount > 0 ? (
              <span className="lane-badge is-primary">{purchaseItemCount} dòng mua</span>
            ) : null}
          </div>

          <div className="lane-content-rows">
            {hasFeasiblePlan ? (
              <div className="pending-plan-card">
                <div className="plan-summary-top">
                  <strong className="plan-strategy-title">
                    Kế hoạch {decision?.recommended_strategy || "Khả thi"}
                  </strong>
                  <span className="plan-ready-pill">Sẵn sàng</span>
                </div>

                <div className="plan-figures-row">
                  <div className="plan-figure-col">
                    <span className="plan-figure-label">Chi phí dự kiến</span>
                    <strong className="plan-figure-val">{formatVnd(totalPlannedCost)}</strong>
                  </div>
                  <div className="plan-figure-col">
                    <span className="plan-figure-label">Quy mô</span>
                    <strong className="plan-figure-val">{purchaseItemCount} nguyên liệu</strong>
                  </div>
                </div>

                <div className="plan-card-action">
                  <button
                    type="button"
                    className="lane-action-cta is-primary"
                    onClick={() => onNavigate("plan")}
                  >
                    Xem kế hoạch →
                  </button>
                </div>
              </div>
            ) : isNoFeasible ? (
              <div className="pending-plan-card is-warning">
                <strong className="plan-strategy-title">Chưa có phương án khả thi</strong>
                <p className="plan-unfeasible-note">
                  Dự báo và nhu cầu đã tính nhưng chưa tìm được phương án đáp ứng toàn bộ ràng buộc NCC.
                </p>
                <div className="plan-card-action">
                  <button
                    type="button"
                    className="lane-action-cta"
                    onClick={() => onNavigate("plan")}
                  >
                    Kiểm tra ràng buộc →
                  </button>
                </div>
              </div>
            ) : (
              <div className="pending-plan-card is-idle">
                <strong className="plan-strategy-title">Chưa có kế hoạch mua hàng</strong>
                <p className="plan-idle-note">Mở Kế hoạch nhập để bắt đầu dự báo và tạo kế hoạch nhập tối ưu.</p>
                <div className="plan-card-action">
                  <button
                    type="button"
                    className="lane-action-cta is-primary"
                    onClick={() => onNavigate("plan")}
                  >
                    Xem kế hoạch →
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
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
  const planningPeriod = dateWindowLabel(view.dates, decision?.as_of_date, decision?.horizon_days);

  return <>
    <section className="decision-view-intro"><span className="eyebrow">Lập kế hoạch</span><h2>Kế hoạch 7 ngày tới{planningPeriod ? ` · ${planningPeriod}` : ""}</h2></section>
    <div className="decision-chart-grid"><section className="decision-chart-panel"><div className="decision-chart-heading"><div><span className="eyebrow">Dự báo sản phẩm</span><h3>Dự báo bán hàng <GuidanceHint content="Biểu đồ thể hiện số món hoặc ly dự kiến bán ra, không phải số lượng nguyên liệu cần nhập." label="Phạm vi dữ liệu dự báo" /></h3></div>{forecastOptions.length ? <label className="decision-selector"><span className="sr-only">Chọn sản phẩm</span><select onChange={(event) => setForecastKey(event.target.value)} value={selectedForecast?.productId || selectedForecast?.product || ""}>{forecastOptions.map((forecast) => <option key={forecast.productId || forecast.product} value={forecast.productId || forecast.product}>{forecast.product || "Sản phẩm chưa xác định"}</option>)}</select></label> : null}</div>{selectedForecast ? <ForecastChart forecast={selectedForecast} /> : <Notice tone="info">Chưa có chuỗi dự báo sản phẩm trong kết quả hiện tại.</Notice>}</section>{selectedDemand.length ? <section><div className="decision-chart-heading decision-chart-selector-heading"><div><span className="eyebrow">Nhu cầu nguyên liệu</span><h3>Nhu cầu theo nguyên liệu</h3></div><label className="decision-selector"><span className="sr-only">Chọn nguyên liệu</span><select onChange={(event) => setIngredientId(event.target.value)} value={selectedIngredientId}>{ingredientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div><DemandChart ingredientName={selectedDemand[0]?.ingredientName || "Nguyên liệu"} rows={selectedDemand} unit={selectedDemand[0]?.unit || ""} /></section> : null}</div>
    <section className="decision-demand-section" aria-labelledby="decision-demand-title"><div className="decision-section-heading"><div><span className="eyebrow">Nhu cầu nguyên liệu</span><h2 id="decision-demand-title">Nhu cầu nguyên liệu dự kiến</h2></div>{activeDate ? <span>{formatDate(activeDate)}</span> : null}</div>{view.dates.length ? <div aria-label="Chọn ngày nhu cầu" className="procurement-date-tabs" role="tablist">{view.dates.map((date) => <button aria-selected={activeDate === date} className={activeDate === date ? "active" : ""} key={date} onClick={() => setSelectedDate(date)} role="tab" type="button">{formatDate(date)}</button>)}</div> : null}{dateRows.length ? <DemandRows onExplain={setExplaining} riskIds={riskIds} rows={dateRows} /> : <Notice tone="info">Chưa có nhu cầu nguyên liệu trong kết quả hiện tại.</Notice>}</section>
    {view.risks.length ? <section className="decision-risk-section" aria-labelledby="decision-risk-title"><SectionHeading title="Rủi ro tồn kho" /><div className="decision-risk-list">{view.risks.map((risk) => <article key={risk.ingredientId}><h3>{risk.ingredientName}</h3><p>{risk.stockoutDate ? `Có thể thiếu từ ${formatDate(risk.stockoutDate)}` : "Có tín hiệu rủi ro tồn kho"}</p><dl><div><dt>Thiếu dự kiến</dt><dd>{quantity(risk.shortageQuantity, risk.unit)}</dd></div><div><dt>Tồn đầu kỳ</dt><dd>{quantity(risk.beginningInventory, risk.unit)}</dd></div><div><dt>Mức đáp ứng</dt><dd>{percentage(risk.fillRate)}</dd></div></dl></article>)}</div></section> : null}
    <section className="decision-procurement" aria-labelledby="decision-procurement-title"><SectionHeading title="Kế hoạch nhập hàng" />{noFeasible ? <><Notice tone="warning"><strong>Chưa tìm được phương án nhập thỏa toàn bộ ràng buộc</strong><br />Dự báo và nhu cầu nguyên liệu đã được tính. Tuy nhiên, hệ thống chưa thể tạo kế hoạch mua hàng đáp ứng toàn bộ điều kiện hiện tại.</Notice>{view.blockers.length ? <ul className="warning-list">{view.blockers.map((blocker, index) => <li key={`${blocker.title}-${index}`}><strong>{blocker.title}</strong>{blocker.observed != null ? ` Mức đáp ứng thấp nhất: ${percentage(blocker.observed)}.` : ""}{blocker.required != null ? ` Yêu cầu tối thiểu: ${percentage(blocker.required)}.` : ""}</li>)}</ul> : <p className="quiet-copy">Chưa có lý do chi tiết cho kết quả này.</p>}{candidateStrategies.length ? <div className="decision-candidate-list">{candidateStrategies.map((strategy) => <article key={strategy.key}><span className="eyebrow">{strategy.label}</span><h3>Phương án mô phỏng tham khảo</h3><p>Chưa đủ điều kiện để tạo đơn nhập · {strategy.itemCount} dòng mua mô phỏng.</p>{strategy.observedFillRate != null ? <small>Mức đáp ứng thấp nhất {percentage(strategy.observedFillRate)}{strategy.requiredFillRate != null ? ` · yêu cầu ${percentage(strategy.requiredFillRate)}` : ""}</small> : null}</article>)}</div> : null}</> : feasibleItems.length ? <><Notice tone="success">Đã có phương án nhập khả thi. Kiểm tra chi tiết trước khi tạo đơn.</Notice><div className="table-wrap"><table><thead><tr><th>Nguyên liệu</th><th>Số lượng</th><th>Đặt hàng</th><th>Dự kiến giao</th><th>Chi phí</th></tr></thead><tbody>{feasibleItems.map((item, index) => <tr key={`${item.ingredient_id ?? item.ingredient_name}-${index}`}><td>{item.ingredient_name || item.ingredient || "Nguyên liệu chưa xác định"}</td><td>{quantity(item.order_quantity ?? item.quantity, item.unit)}</td><td>{item.order_date ? formatDate(item.order_date) : "—"}</td><td>{item.expected_arrival_date ? formatDate(item.expected_arrival_date) : "—"}</td><td>{item.estimated_cost == null ? "—" : formatVnd(item.estimated_cost)}</td></tr>)}</tbody></table></div></> : <Notice tone="info">Chưa có kế hoạch nhập để hiển thị.</Notice>}</section>
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
  const period = dateWindowLabel(view.dates, decision?.as_of_date, decision?.horizon_days);

  return (
    <div className="decision-center-workspace">
      <header className="decision-center-header">
        <div>
          <h1>Trung tâm quyết định</h1>
          <span className="page-header-context">
            {data.today ? `${data.today.split("-").reverse().join("/")} · Hôm nay` : period || ""}
          </span>
        </div>
        <div aria-label="Chuyển chế độ xem" className="decision-view-switcher" role="tablist">
          <button
            aria-selected={activeView === "today"}
            className={activeView === "today" ? "active" : ""}
            onClick={() => onViewChange("today")}
            role="tab"
            type="button"
          >
            Hôm nay
          </button>
          <button
            aria-selected={activeView === "future"}
            className={activeView === "future" ? "active" : ""}
            onClick={() => onViewChange("future")}
            role="tab"
            type="button"
          >
            7 ngày tới
          </button>
        </div>
      </header>

      {activeView === "today" ? (
        <TodayOperationalView
          data={data}
          decision={decision}
          onNavigate={(target) => onNavigate(target)}
          plan={plan}
        />
      ) : (
        <FuturePlanningView
          data={data}
          decision={decision}
          initialIngredient={initialIngredient}
          plan={plan}
        />
      )}
    </div>
  );
}

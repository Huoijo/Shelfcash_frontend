"use client";

import { ArrowRight, CircleAlert, Clock3, PackageSearch, ScanSearch, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptDecisionRunView, type DecisionDemandView, type DecisionRiskView } from "../../lib/decision-view";
import {
  extractProcurementRows,
  projectIngredientDailyRisks,
  type DailyIngredientRiskState,
  type HeatmapSeverityLevel,
  type IngredientRiskProjection,
  type RiskSeverity,
} from "../../lib/risk-engine";
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

function formatHeaderDay(dateStr: string): { dayOfWeek: string; dateFormatted: string } {
  try {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const dayIndex = d.getUTCDay();
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const [year, month, day] = dateStr.split("-");
    return {
      dayOfWeek: days[dayIndex] ?? "",
      dateFormatted: `${day}/${month}`,
    };
  } catch {
    return { dayOfWeek: "", dateFormatted: dateStr };
  }
}

export type { HeatmapSeverityLevel };

export interface HeatmapCellData extends DailyIngredientRiskState {
  level: HeatmapSeverityLevel;
}

export interface HeatmapRowData {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  cells: Record<string, HeatmapCellData>;
  totalSeverity: number;
  maxSeverity: HeatmapSeverityLevel;
  hasAlert: boolean;
  stockoutDate?: string | null;
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
      {/* ── 1. TOP OVERVIEW CARDS (Balanced 2-cards strip) ── */}
      <div className="today-overview-cards">
        {/* Card 1: Pipeline Strip */}
        <section className="today-overview-card" aria-labelledby="today-pipeline-title">
          <span id="today-pipeline-title" className="today-card-eyebrow">Trạng thái quyết định</span>
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

        {/* Card 2: Attention Summary Strip */}
        <section className="today-overview-card">
          <span className="today-card-eyebrow">Hôm nay cần chú ý</span>
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
      </div>

      {/* ── 2. TWO BALANCED SEMANTIC LANES ── */}
      <div className="today-lanes-grid">
        {/* Lane A: RỦI RO VẬN HÀNH / ƯU TIÊN HÔM NAY */}
        <section className="today-lane lane-operational-risks">
          <div className="lane-header">
            <h3 className="lane-title">Rủi ro vận hành (Ưu tiên hôm nay)</h3>
            {operationalAlerts.length > 0 ? (
              <span className="lane-badge is-warning">{operationalAlerts.length} việc cần chú ý</span>
            ) : null}
          </div>

          <div className="lane-content-scrollable">
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

        {/* Lane B: QUYẾT ĐỊNH ĐANG CHỜ & CHI TIẾT NHẬP HÀNG */}
        <section className="today-lane lane-pending-decisions">
          <div className="lane-header">
            <h3 className="lane-title">Quyết định đang chờ</h3>
            {purchaseItemCount > 0 ? (
              <span className="lane-badge is-primary">{purchaseItemCount} dòng mua</span>
            ) : null}
          </div>

          <div className="lane-content-stacked">
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

                {purchasePlanItems.length > 0 ? (
                  <div className="today-plan-preview-box">
                    <span className="today-preview-heading">Danh mục đề xuất nhập:</span>
                    <div className="today-preview-items-list">
                      {purchasePlanItems.slice(0, 5).map((item, idx) => (
                        <div
                          key={`${item.ingredient_id ?? item.ingredient_name ?? idx}`}
                          className="today-preview-item-row"
                        >
                          <div className="today-preview-item-name">
                            <span>{item.ingredient_name || item.ingredient || "Nguyên liệu"}</span>
                          </div>
                          <div className="today-preview-item-qty">
                            <strong>{quantity(item.order_quantity ?? item.quantity, item.unit)}</strong>
                            {item.estimated_cost != null && item.estimated_cost > 0 ? (
                              <small>{formatVnd(item.estimated_cost)}</small>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {purchasePlanItems.length > 5 ? (
                        <div className="today-preview-more">
                          và {purchasePlanItems.length - 5} nguyên liệu khác…
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="plan-card-action">
                  <button
                    type="button"
                    className="lane-action-cta is-primary"
                    onClick={() => onNavigate("plan")}
                  >
                    Xem toàn bộ kế hoạch →
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

function DemandRiskHeatmap({
  dates,
  demand,
  risks,
  data,
  decision,
  selectedDate,
  selectedIngredientId,
  onSelectDate,
  onSelectIngredient,
}: {
  dates: string[];
  demand: DecisionDemandView[];
  risks: DecisionRiskView[];
  data?: BootstrapData;
  decision?: DecisionPackage | null;
  selectedDate: string;
  selectedIngredientId: string;
  onSelectDate: (date: string) => void;
  onSelectIngredient: (ingredientId: string) => void;
}) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCellData | null>(null);

  // Extract incoming procurement rows
  const procurementRows = useMemo(
    () => extractProcurementRows(decision),
    [decision]
  );

  // Map risks by ingredientId
  const riskMap = useMemo(() => {
    const map = new Map<string, DecisionRiskView>();
    for (const r of risks) {
      map.set(r.ingredientId, r);
    }
    return map;
  }, [risks]);

  // List of unique ingredients
  const uniqueIngredients = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unit: string }>();
    for (const d of demand) {
      if (!map.has(d.ingredientId)) {
        map.set(d.ingredientId, {
          id: d.ingredientId,
          name: d.ingredientName,
          unit: d.unit,
        });
      }
    }
    return Array.from(map.values());
  }, [demand]);

  // Build rows with single groundtruth risk projection for all dates
  const rows: HeatmapRowData[] = useMemo(() => {
    return uniqueIngredients
      .map((ing) => {
        const risk = riskMap.get(ing.id);
        const projection = projectIngredientDailyRisks(
          ing.id,
          ing.name,
          ing.unit,
          dates,
          demand,
          risk,
          data,
          procurementRows
        );

        const cells: Record<string, HeatmapCellData> = {};
        let totalSeverity = 0;

        for (const dr of projection.dailyRisks) {
          cells[dr.targetDate] = {
            ...dr,
            level: dr.severityLevel,
          };
          totalSeverity += dr.severityLevel;
        }

        return {
          ingredientId: ing.id,
          ingredientName: ing.name,
          unit: ing.unit,
          cells,
          totalSeverity,
          maxSeverity: projection.maxSeverity,
          hasAlert: projection.hasAlert,
          stockoutDate: projection.stockoutDate,
        };
      })
      .sort((a, b) => {
        if (b.totalSeverity !== a.totalSeverity) {
          return b.totalSeverity - a.totalSeverity;
        }
        if (b.maxSeverity !== a.maxSeverity) {
          return b.maxSeverity - a.maxSeverity;
        }
        return a.ingredientName.localeCompare(b.ingredientName);
      });
  }, [uniqueIngredients, dates, demand, riskMap, data, procurementRows]);

  // Summary Metrics
  const summary = useMemo(() => {
    const alertIngs = rows.filter((r) => r.hasAlert).length;
    let highCells = 0;
    const dateRiskSums: Record<string, number> = {};

    for (const date of dates) {
      dateRiskSums[date] = 0;
    }

    for (const r of rows) {
      for (const date of dates) {
        const cell = r.cells[date];
        if (cell) {
          if (cell.level === 3) highCells += 1;
          dateRiskSums[date] = (dateRiskSums[date] ?? 0) + cell.level;
        }
      }
    }

    let peakDate = dates[0] || "";
    let maxRisk = -1;
    for (const date of dates) {
      const sum = dateRiskSums[date] ?? 0;
      if (sum > maxRisk) {
        maxRisk = sum;
        peakDate = date;
      }
    }

    return {
      alertIngredients: alertIngs,
      highAlertCells: highCells,
      peakRiskDate: peakDate,
    };
  }, [rows, dates]);

  return (
    <div className="demand-heatmap-container">
      {/* ── SECTION ①: TOP SUMMARY STRIP & LEGEND ── */}
      <div className="heatmap-summary-strip">
        <div className="heatmap-mini-stats">
          {summary.alertIngredients > 0 ? (
            <>
              <div className="mini-stat-pill is-warning">
                <strong>{summary.alertIngredients}</strong> nguyên liệu có cảnh báo
              </div>
              {summary.highAlertCells > 0 ? (
                <div className="mini-stat-pill is-danger">
                  <strong>{summary.highAlertCells}</strong> ô cảnh báo cao
                </div>
              ) : null}
              <div className="mini-stat-pill is-neutral">
                Đỉnh rủi ro: <strong>{formatDate(summary.peakRiskDate)}</strong>
              </div>
            </>
          ) : (
            <div className="mini-stat-pill is-success">
              ✓ Tồn kho an toàn, không có nguy cơ thiếu hàng trong 7 ngày tới
            </div>
          )}
        </div>

        <div className="heatmap-legend" aria-label="Chú thích mức độ cảnh báo">
          <span className="legend-item">
            <span className="legend-color-box level-0" /> Ổn định
          </span>
          <span className="legend-item">
            <span className="legend-color-box level-1" /> Cần theo dõi
          </span>
          <span className="legend-item">
            <span className="legend-color-box level-2" /> Nguy cơ thiếu
          </span>
          <span className="legend-item">
            <span className="legend-color-box level-3" /> Cảnh báo cao
          </span>
        </div>
      </div>

      {/* ── SECTION ②: HEATMAP TABLE MATRIX (HERO) ── */}
      <div className="heatmap-matrix-wrap" role="region" aria-label="Bảng heatmap cảnh báo nhu cầu 7 ngày">
        <table className="demand-heatmap-table">
          <thead>
            <tr>
              <th className="heatmap-th-corner">Nguyên liệu</th>
              {dates.map((date) => {
                const headerInfo = formatHeaderDay(date);
                const isActiveDate = selectedDate === date;
                return (
                  <th
                    key={date}
                    className={`heatmap-th-date ${isActiveDate ? "is-active-col" : ""}`}
                    onClick={() => onSelectDate(date)}
                    title={`Chọn ngày ${formatDate(date)}`}
                  >
                    <div className="th-date-inner">
                      <span className="th-weekday">{headerInfo.dayOfWeek}</span>
                      <span className="th-date-str">{headerInfo.dateFormatted}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelectedIng = row.ingredientId === selectedIngredientId;
              return (
                <tr
                  key={row.ingredientId}
                  className={`heatmap-tr ${isSelectedIng ? "is-active-row" : ""}`}
                >
                  <td
                    className="heatmap-td-label"
                    onClick={() => onSelectIngredient(row.ingredientId)}
                    title={`Chọn nguyên liệu ${row.ingredientName}`}
                  >
                    <div className="td-label-inner">
                      <span className="ing-name">{row.ingredientName}</span>
                      {row.hasAlert ? (
                        <span className="ing-alert-indicator" title="Có cảnh báo trong tuần" />
                      ) : null}
                    </div>
                  </td>

                  {dates.map((date) => {
                    const cell = row.cells[date];
                    if (!cell) return <td key={date} className="heatmap-td-empty">—</td>;

                    const isCellSelected =
                      selectedDate === date && selectedIngredientId === row.ingredientId;
                    const isActiveCol = selectedDate === date;

                    return (
                      <td
                        key={date}
                        className={`heatmap-td-cell level-${cell.level} ${
                          isCellSelected ? "is-selected-cell" : ""
                        } ${isActiveCol ? "is-col-focused" : ""}`}
                        onClick={() => {
                          onSelectDate(date);
                          onSelectIngredient(row.ingredientId);
                        }}
                        onMouseEnter={() => setHoveredCell(cell)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div className="cell-inner">
                          {cell.hasStockout || cell.shortageQuantity > 0 ? (
                            <span className="cell-alert-mark" title="Có nguy cơ cạn kho">!</span>
                          ) : cell.isArrival ? (
                            <span className="cell-arrival-mark" title="Có hàng về">📦</span>
                          ) : null}
                          <span className="cell-mini-qty">
                            {cell.demandP50 != null ? `${cell.demandP50 < 10 ? cell.demandP50.toFixed(1) : Math.round(cell.demandP50)}` : "—"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Hover Tooltip Overlay */}
        {hoveredCell ? (
          <div className="heatmap-hover-tooltip" aria-hidden="true">
            <div className="tooltip-header">
              <strong>{hoveredCell.ingredientName}</strong>
              <span>· {formatDate(hoveredCell.targetDate)}</span>
            </div>
            <div className="tooltip-body">
              <div className="tooltip-level-row">
                <span className={`tooltip-level-pill level-${hoveredCell.level}`}>
                  {hoveredCell.severityLabel}
                </span>
                {hoveredCell.demandSpikeLabel ? (
                  <span className="tooltip-spike-pill">{hoveredCell.demandSpikeLabel}</span>
                ) : null}
                {hoveredCell.hasStockout ? (
                  <span className="tooltip-stockout-note">Có nguy cơ cạn kho</span>
                ) : null}
              </div>
              {hoveredCell.reason ? (
                <p className="tooltip-reason-text">{hoveredCell.reason}</p>
              ) : null}
              <div className="tooltip-metrics">
                <span>Nhu cầu P50: <strong>{quantity(hoveredCell.demandP50, hoveredCell.unit)}</strong></span>
                {hoveredCell.closingStock != null ? (
                  <span>Tồn cuối ngày: <strong>{quantity(hoveredCell.closingStock, hoveredCell.unit)}</strong></span>
                ) : null}
                {hoveredCell.isArrival ? (
                  <span className="tooltip-arrival-info">📦 Hàng về: <strong>+{quantity(hoveredCell.incomingQuantity, hoveredCell.unit)}</strong></span>
                ) : null}
                {hoveredCell.shortageQuantity > 0 ? (
                  <span className="tooltip-shortage-info text-danger">⚠️ Thiếu dự kiến: <strong>{quantity(hoveredCell.shortageQuantity, hoveredCell.unit)}</strong></span>
                ) : null}
                <small>Khoảng P25–P75: {quantity(hoveredCell.demandP25, hoveredCell.unit)} – {quantity(hoveredCell.demandP75, hoveredCell.unit)}</small>
                <small>Đến từ {hoveredCell.contributionsCount} món</small>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * SECTION ③: CHI TIẾT ĐANG CHỌN
 * Merges Demand Facts + Inventory Risk Facts + Demand Sources into one clean section.
 */
function SelectedIngredientDetail({
  dates = [],
  selectedDate,
  selectedIngredientId,
  demand,
  risks,
  data,
  decision,
  onExplain,
  onOpenForecastDrilldown,
}: {
  dates?: string[];
  selectedDate: string;
  selectedIngredientId: string;
  demand: DecisionDemandView[];
  risks: DecisionRiskView[];
  data?: BootstrapData;
  decision?: DecisionPackage | null;
  onExplain: (row: DecisionDemandView) => void;
  onOpenForecastDrilldown: (row: DecisionDemandView) => void;
}) {
  const demandRow = demand.find(
    (d) => d.ingredientId === selectedIngredientId && d.targetDate === selectedDate
  );
  const risk = risks.find((r) => r.ingredientId === selectedIngredientId);
  const ingredientName = demandRow?.ingredientName || risk?.ingredientName || "Nguyên liệu";
  const unit = demandRow?.unit || risk?.unit || "";

  const procurementRows = useMemo(
    () => extractProcurementRows(decision),
    [decision]
  );

  // Authoritative daily risk simulation across full planning window
  const projection = useMemo(() => {
    const horizonDates = dates.length > 0 ? dates : [selectedDate];
    return projectIngredientDailyRisks(
      selectedIngredientId,
      ingredientName,
      unit,
      horizonDates,
      demand,
      risk,
      data,
      procurementRows
    );
  }, [selectedIngredientId, ingredientName, unit, dates, selectedDate, demand, risk, data, procurementRows]);

  const dailyRisk =
    projection.dailyRisks.find((dr) => dr.targetDate === selectedDate) ??
    projection.dailyRisks[0];
  const contributions = demandRow?.contributions ?? [];

  if (!demandRow && !risk) {
    return (
      <section className="selected-detail-section" aria-labelledby="selected-detail-title">
        <div className="selected-detail-header">
          <div>
            <span className="eyebrow">Chi tiết đang chọn</span>
            <h2 id="selected-detail-title">Chi tiết nguyên liệu</h2>
          </div>
        </div>
        <p className="quiet-copy">Chưa chọn nguyên liệu hoặc ngày trong kỳ kế hoạch.</p>
      </section>
    );
  }

  return (
    <section className="selected-detail-section" aria-labelledby="selected-detail-title">
      <div className="selected-detail-header">
        <div className="selected-detail-title-group">
          <span className="eyebrow">Chi tiết đang chọn</span>
          <h2 id="selected-detail-title">{ingredientName}</h2>
          <span className="selected-detail-date">{formatDate(selectedDate)}</span>
        </div>
        <span className={`detail-severity-badge level-${dailyRisk?.severityLevel ?? 0}`}>
          {dailyRisk?.severityLabel ?? "Ổn định"}
        </span>
      </div>

      <div className="selected-detail-zones">
        {/* ZONE 1: NHU CẦU */}
        <div className="detail-zone">
          <span className="zone-label">Nhu cầu</span>
          <div className="zone-metric-highlight">
            <strong>{quantity(demandRow?.p50, unit)}</strong>
            <small>P50 dự kiến</small>
          </div>
          <p className="zone-subtext">
            Khoảng P25–P75: <strong>{quantity(demandRow?.p25, unit)} – {quantity(demandRow?.p75, unit)}</strong>
          </p>
        </div>

        <div className="zone-divider" />

        {/* ZONE 2: RỦI RO TỒN KHO */}
        <div className="detail-zone">
          <span className="zone-label">Rủi ro tồn kho</span>
          <div className="zone-grid-facts">
            <div className="fact-item">
              <span className="fact-title">Tồn đầu ngày</span>
              <strong>{dailyRisk?.openingStock != null ? quantity(dailyRisk.openingStock, unit) : (risk ? quantity(risk.beginningInventory, unit) : "—")}</strong>
            </div>
            <div className="fact-item">
              <span className="fact-title">Hàng về</span>
              <strong className={dailyRisk?.isArrival ? "text-success" : ""}>
                {dailyRisk?.isArrival ? `+${quantity(dailyRisk.incomingQuantity, unit)}` : "Không có"}
              </strong>
            </div>
            <div className="fact-item">
              <span className="fact-title">Tồn cuối ngày</span>
              <strong className={dailyRisk?.closingStock != null && dailyRisk.closingStock <= 0 ? "text-danger" : ""}>
                {dailyRisk?.closingStock != null ? quantity(dailyRisk.closingStock, unit) : "—"}
              </strong>
            </div>
            <div className="fact-item">
              <span className="fact-title">Thiếu dự kiến</span>
              <strong className={dailyRisk?.shortageQuantity && dailyRisk.shortageQuantity > 0 ? "text-danger" : ""}>
                {dailyRisk?.shortageQuantity != null && dailyRisk.shortageQuantity > 0
                  ? quantity(dailyRisk.shortageQuantity, unit)
                  : "0"}
              </strong>
            </div>
          </div>
        </div>

        <div className="zone-divider" />

        {/* ZONE 3: NGUỒN NHU CẦU */}
        <div className="detail-zone">
          <span className="zone-label">Nguồn nhu cầu</span>
          <div className="zone-sources-summary">
            <strong>Đến từ {contributions.length} món</strong>
            {contributions.length > 0 ? (
              <div className="source-dish-chips">
                {contributions.map((c) => {
                  const pName = c.productName || c.productId || "Món";
                  const pQty = c.p50 ?? c.recipeQuantity;
                  const pUnit = c.unit || unit;
                  return (
                    <span key={c.productId || c.productName} className="source-dish-chip">
                      {pName} {pQty != null ? `(${quantity(pQty, pUnit)})` : ""}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="zone-actions">
            {demandRow ? (
              <Button
                onClick={() => onExplain(demandRow)}
                variant="secondary"
                className="zone-btn"
              >
                Giải thích nhu cầu →
              </Button>
            ) : null}
            {demandRow && contributions.length > 0 ? (
              <Button
                onClick={() => onOpenForecastDrilldown(demandRow)}
                variant="secondary"
                className="zone-btn"
              >
                Xem nguồn nhu cầu (Dự báo bán hàng) →
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Drilldown drawer showing product sales forecast and contribution to ingredient demand.
 */
function ProductForecastDrilldownModal({
  onClose,
  row,
  productForecasts,
  cutoffDate,
  horizonDays,
}: {
  onClose: () => void;
  row: DecisionDemandView;
  productForecasts: ForecastResult[];
  cutoffDate?: string | null;
  horizonDays?: number | null;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string>(
    row.contributions[0]?.productId || row.contributions[0]?.productName || ""
  );

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener.current?.focus();
    };
  }, [onClose]);

  const activeContribution =
    row.contributions.find(
      (c) =>
        (c.productId && c.productId === selectedProductId) ||
        (c.productName && c.productName === selectedProductId)
    ) || row.contributions[0];

  const activeForecast = useMemo(() => {
    if (!activeContribution) return null;
    const found = productForecasts.find(
      (pf) =>
        (activeContribution.productId && pf.productId === activeContribution.productId) ||
        (activeContribution.productName && pf.product === activeContribution.productName) ||
        (activeContribution.productId && pf.product === activeContribution.productId)
    );
    if (found && found.forecast && found.forecast.length > 0) return found;

    // Fallback synthesize single forecast result
    const targetP50 = activeContribution.forecastP50 ?? activeContribution.p50 ?? 0;
    const targetP25 = activeContribution.forecastP25 ?? activeContribution.p25 ?? targetP50 * 0.85;
    const targetP75 = activeContribution.forecastP75 ?? activeContribution.p75 ?? targetP50 * 1.15;

    return {
      productId: activeContribution.productId || activeContribution.productName,
      product: activeContribution.productName || "Sản phẩm",
      ingredient: activeContribution.productName || "Sản phẩm",
      unit: "phần",
      history: [],
      forecast: [
        {
          date: row.targetDate,
          p25: targetP25,
          p50: targetP50,
          p75: targetP75,
          intervalLower: targetP25,
          intervalUpper: targetP75,
          confidenceScore: 0.9,
        },
      ],
      totals: {
        p25: targetP25,
        p50: targetP50,
        p75: targetP75,
      },
      drivers: [],
      confidence: "Tốt",
      dataNotes: [],
    } as ForecastResult;
  }, [activeContribution, productForecasts, row.targetDate]);

  return (
    <div className="procurement-drawer-layer">
      <button
        aria-label="Đóng dự báo bán hàng theo sản phẩm"
        className="procurement-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="forecast-drilldown-title"
        aria-modal="true"
        className="procurement-drawer"
        ref={drawer}
        role="dialog"
      >
        <header className="procurement-drawer-header">
          <div>
            <span className="eyebrow">Dự báo bán hàng theo sản phẩm</span>
            <h2 id="forecast-drilldown-title">
              Nguồn nhu cầu: {row.ingredientName}
            </h2>
            <p className="drawer-context-date" style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "2px" }}>
              Ngày {formatDate(row.targetDate)} · Đến từ {row.contributions.length} món
            </p>
          </div>
          <button
            aria-label="Đóng dự báo bán hàng"
            className="decision-workspace-close"
            onClick={onClose}
            ref={closeButton}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {row.contributions.length > 1 ? (
          <div className="procurement-date-tabs" role="tablist" style={{ margin: "16px 0 10px" }}>
            {row.contributions.map((c) => {
              const pId = c.productId || c.productName;
              const activeId = activeContribution?.productId || activeContribution?.productName;
              return (
                <button
                  key={pId}
                  type="button"
                  role="tab"
                  aria-selected={activeId === pId}
                  className={activeId === pId ? "active" : ""}
                  onClick={() => setSelectedProductId(pId)}
                >
                  {c.productName || "Sản phẩm"}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeContribution ? (
          <div className="drilldown-active-product" style={{ marginTop: "14px" }}>
            <dl className="procurement-drawer-total">
              <div>
                <dt>Sản phẩm</dt>
                <dd>{activeContribution.productName || "Sản phẩm"}</dd>
              </div>
              <div>
                <dt>Dự báo bán P50</dt>
                <dd>{formatQuantity(activeContribution.forecastP50 ?? activeContribution.p50, "phần")}</dd>
              </div>
              <div>
                <dt>Tiêu hao định mức</dt>
                <dd>
                  {activeContribution.recipeQuantity != null
                    ? `${formatQuantity(activeContribution.recipeQuantity)} ${activeContribution.recipeUnit || row.unit} / phần`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Nhu cầu phát sinh</dt>
                <dd>
                  {formatQuantity(
                    activeContribution.p50 ?? activeContribution.recipeQuantity,
                    activeContribution.unit || row.unit
                  )}
                </dd>
              </div>
            </dl>

            {activeForecast ? (
              <div className="drilldown-chart-wrap" style={{ marginTop: "20px" }}>
                <span className="eyebrow">Biểu đồ dự báo sản phẩm</span>
                <h3 style={{ margin: "4px 0 12px", fontSize: "1.05rem", fontWeight: 700 }}>
                  Xu hướng 7 ngày: {activeForecast.product}
                </h3>
                <ForecastChart
                  cutoffDate={cutoffDate}
                  forecast={activeForecast}
                  horizonDays={horizonDays}
                />
              </div>
            ) : (
              <Notice tone="info">Không có chuỗi dữ liệu biểu đồ cho sản phẩm này.</Notice>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function FuturePlanningView({
  data,
  plan,
  decision,
  initialIngredient,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  decision: DecisionPackage | null;
  initialIngredient?: string;
  onNavigate?: (target: "inventory" | "plan") => void;
}) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const [ingredientId, setIngredientId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [explaining, setExplaining] = useState<DecisionDemandView | null>(null);
  const [drilldownRow, setDrilldownRow] = useState<DecisionDemandView | null>(null);

  // Adapt product forecasts from either legacy plan.forecasts or decision view.productForecasts for drilldown
  const productForecastResults = useMemo(() => {
    const map = new Map<string, ForecastResult>();

    for (const pf of view.productForecasts) {
      const key = pf.productId || pf.productName;
      if (!key) continue;
      map.set(key, {
        productId: pf.productId,
        product: pf.productName,
        ingredient: pf.productName,
        unit: pf.unit || "phần",
        history: [],
        forecast: pf.points.map((pt) => ({
          date: pt.targetDate,
          p25: pt.p25 ?? 0,
          p50: pt.p50 ?? 0,
          p75: pt.p75 ?? 0,
          intervalLower: pt.p25 ?? 0,
          intervalUpper: pt.p75 ?? 0,
          confidenceScore: 0.9,
        })),
        totals: {
          p25: pf.points.reduce((s, pt) => s + (pt.p25 ?? 0), 0),
          p50: pf.points.reduce((s, pt) => s + (pt.p50 ?? 0), 0),
          p75: pf.points.reduce((s, pt) => s + (pt.p75 ?? 0), 0),
        },
        drivers: [],
        confidence: "Tốt",
        dataNotes: [],
      });
    }

    if (plan.forecasts) {
      for (const [k, f] of Object.entries(plan.forecasts)) {
        if (f.forecast && f.forecast.length > 0) {
          map.set(f.productId || f.product || k, f);
        }
      }
    }

    return Array.from(map.values());
  }, [plan.forecasts, view.productForecasts]);

  const activeDate = view.dates.includes(selectedDate) ? selectedDate : view.dates[0] || "";

  // Prioritize ingredient with highest risk or initialIngredient
  const activeIngredientId = useMemo(() => {
    if (ingredientId && view.demand.some((d) => d.ingredientId === ingredientId)) {
      return ingredientId;
    }
    if (initialIngredient && view.demand.some((d) => d.ingredientId === initialIngredient)) {
      return initialIngredient;
    }
    // Find highest risk ingredient for activeDate
    const dateDemand = view.demand.filter((d) => d.targetDate === activeDate);
    const riskMap = new Map(view.risks.map((r) => [r.ingredientId, r]));
    const sorted = [...dateDemand].sort((a, b) => {
      const riskA = riskMap.has(a.ingredientId) ? 2 : 0;
      const riskB = riskMap.has(b.ingredientId) ? 2 : 0;
      return riskB - riskA;
    });
    return sorted[0]?.ingredientId || view.demand[0]?.ingredientId || "";
  }, [ingredientId, initialIngredient, view.demand, activeDate, view.risks]);

  const planningPeriod = dateWindowLabel(view.dates, decision?.as_of_date, decision?.horizon_days);

  return (
    <div className="future-planning-wrap">
      <section className="decision-view-intro">
        <span className="eyebrow">Lập kế hoạch</span>
        <h2>Kế hoạch 7 ngày tới{planningPeriod ? ` · ${planningPeriod}` : ""}</h2>
      </section>

      {/* ── SECTION ①: TỔNG QUAN & SECTION ②: HEATMAP RỦI RO (HERO VISUALIZATION) ── */}
      <section className="decision-demand-section" aria-labelledby="decision-demand-title">
        <div className="decision-section-heading">
          <div>
            <span className="eyebrow">Nhu cầu nguyên liệu dự kiến</span>
            <h2 id="decision-demand-title">Heatmap rủi ro</h2>
          </div>
          {activeDate ? <span className="decision-active-date-badge">{formatDate(activeDate)}</span> : null}
        </div>

        {view.demand.length ? (
          <DemandRiskHeatmap
            dates={view.dates}
            demand={view.demand}
            risks={view.risks}
            data={data}
            decision={decision}
            selectedDate={activeDate}
            selectedIngredientId={activeIngredientId}
            onSelectDate={(date) => setSelectedDate(date)}
            onSelectIngredient={(id) => setIngredientId(id)}
          />
        ) : (
          <Notice tone="info">Chưa có nhu cầu nguyên liệu trong kết quả hiện tại.</Notice>
        )}
      </section>

      {/* ── SECTION ③: CHI TIẾT ĐANG CHỌN (MERGES DEMAND + INVENTORY RISK + SOURCES) ── */}
      <SelectedIngredientDetail
        dates={view.dates}
        demand={view.demand}
        risks={view.risks}
        data={data}
        decision={decision}
        onExplain={(row) => setExplaining(row)}
        onOpenForecastDrilldown={(row) => setDrilldownRow(row)}
        selectedDate={activeDate}
        selectedIngredientId={activeIngredientId}
      />

      {/* ── SECTION ⓘ: LƯU Ý CHẤT LƯỢNG DỮ LIỆU (COLLAPSED DISCLOSURE) ── */}
      {view.warnings.length ? (
        <Details summary="Lưu ý về chất lượng dữ liệu và kết quả">
          <ul className="warning-list">
            {view.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </Details>
      ) : null}

      {/* Dialogs */}
      {explaining ? <DemandExplanationDialog onClose={() => setExplaining(null)} row={explaining} /> : null}
      {drilldownRow ? (
        <ProductForecastDrilldownModal
          cutoffDate={decision?.as_of_date}
          horizonDays={decision?.horizon_days}
          onClose={() => setDrilldownRow(null)}
          productForecasts={productForecastResults}
          row={drilldownRow}
        />
      ) : null}
    </div>
  );
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
          onNavigate={(target) => onNavigate(target)}
          plan={plan}
        />
      )}
    </div>
  );
}

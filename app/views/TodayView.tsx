"use client";

import {
  ArrowRight,
  CircleAlert,
  Clock3,
  WalletCards,
} from "lucide-react";
import type {
  BootstrapData,
  EnrichedInventoryItem,
  InventoryLot,
  InventoryStatus,
  PlanResponse,
} from "../../lib/types";
import {
  AlertRow,
  Button,
  PageHeader,
  SectionHeading,
  StatCard,
  SummaryGrid,
  formatDate,
  formatQuantity,
  formatVnd,
} from "../components/ui";

type ActionableStatus = Extract<
  InventoryStatus,
  "stockout" | "expired" | "expiring"
>;

interface InventoryAlert {
  key: string;
  ingredient: EnrichedInventoryItem;
  lot?: InventoryLot;
  status: ActionableStatus;
}

const actionableStatuses: ActionableStatus[] = [
  "stockout",
  "expired",
  "expiring",
];

function isActionableStatus(status: InventoryStatus): status is ActionableStatus {
  return actionableStatuses.includes(status as ActionableStatus);
}

function formatBackendDate(value?: string): string {
  return value ? formatDate(value) : "chưa ghi nhận";
}

function inventoryAlerts(items: EnrichedInventoryItem[]): InventoryAlert[] {
  return items.flatMap((ingredient) => {
    const lots = ingredient.lots ?? [];
    if (lots.length > 0) {
      return lots
        .filter((lot) => isActionableStatus(lot.status))
        .map((lot) => ({
          key: `${ingredient.ingredientId || ingredient.sku}-${lot.lotId}`,
          ingredient,
          lot,
          status: lot.status as ActionableStatus,
        }));
    }
    if (!isActionableStatus(ingredient.statusKey)) return [];
    return [
      {
        key: ingredient.ingredientId || ingredient.sku || ingredient.ingredient,
        ingredient,
        status: ingredient.statusKey,
      },
    ];
  });
}

function alertCopy(alert: InventoryAlert): {
  title: string;
  body: string;
  tone: "red" | "amber";
} {
  const { ingredient, lot, status } = alert;
  const lotReference = lot ? `Lô ${lot.lotId}` : "Bản ghi tồn kho";
  if (status === "stockout") {
    return {
      title: `${ingredient.ingredient}: hết hàng`,
      body: `${lotReference} · Không còn tồn khả dụng.`,
      tone: "red",
    };
  }
  if (status === "expired") {
    const quantity = lot?.expiredQuantity ?? ingredient.expiredQty ?? ingredient.onHand;
    return {
      title: `${ingredient.ingredient}: ${formatQuantity(quantity, ingredient.unit)} đã hết hạn`,
      body: `${lotReference} · Hạn dùng: ${formatBackendDate(lot?.expiryDate ?? ingredient.expiryDate)}.`,
      tone: "red",
    };
  }
  const quantity = lot?.expiringQuantity ?? ingredient.expiringQty;
  return {
    title: `${ingredient.ingredient}: ${formatQuantity(quantity, ingredient.unit)} gần hết hạn`,
    body: `${lotReference} · Hạn dùng: ${formatBackendDate(lot?.expiryDate ?? ingredient.expiryDate)} · ưu tiên xuất trước.`,
    tone: "amber",
  };
}

function planningCopy(plan: PlanResponse): {
  title: string;
  body: string;
  tone: "pine" | "red" | "amber" | "blue";
} {
  const status = plan.status ?? "idle";
  if (status === "running") {
    return {
      title: "Đang lập kế hoạch",
      body: "Hệ thống đang tính toán. Kết quả sẽ hiển thị khi hoàn tất.",
      tone: "blue",
    };
  }
  if (status === "blocked") {
    return {
      title: "Chưa thể lập kế hoạch",
      body:
        plan.failureMessage ||
        (plan.failureCode === "MODEL_NOT_READY"
          ? "Mô hình dự báo chưa sẵn sàng."
          : "Mở Kế hoạch nhập để xem nội dung cần xử lý."),
      tone: "amber",
    };
  }
  if (status === "failed") {
    return {
      title: "Lập kế hoạch không thành công",
      body: plan.failureMessage || "Mở Kế hoạch nhập để xem chi tiết và thử lại.",
      tone: "red",
    };
  }
  if (status === "completed") {
    const plannedCost =
      plan.budget?.plannedCost ??
      plan.recommendations.reduce((sum, line) => sum + line.cost, 0);
    return {
      title: "Kế hoạch đã hoàn tất",
      body: plan.completedAt
        ? `Chi phí dự kiến ${formatVnd(plannedCost)} · hoàn tất ngày ${formatBackendDate(plan.completedAt)}.`
        : `Chi phí dự kiến ${formatVnd(plannedCost)}.`,
      tone: "pine",
    };
  }
  return {
    title: "Chưa có kế hoạch",
    body: "Mở Kế hoạch nhập để bắt đầu dự báo và lập kế hoạch.",
    tone: "blue",
  };
}

export function TodayView({
  data,
  plan,
  onNavigate,
  loading = false,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  onNavigate: (page: "inventory" | "plan") => void;
  loading?: boolean;
}) {
  const alerts = inventoryAlerts(plan.enrichedInventory);
  const stockoutCount = alerts.filter((alert) => alert.status === "stockout").length;
  const expiredCount = alerts.filter((alert) => alert.status === "expired").length;
  const expiringCount = alerts.filter((alert) => alert.status === "expiring").length;
  const criticalCount = stockoutCount + expiredCount;
  const missingCount = plan.enrichedInventory.filter(
    (item) => item.statusKey === "missing",
  ).length;
  const planning = planningCopy(plan);
  const bars = plan.status === "completed" ? plan.recommendations.slice(0, 6) : [];

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Tổng quan"
        action={
          <Button variant="primary" onClick={() => onNavigate("plan")}>
            Mở kế hoạch nhập hàng
            <ArrowRight aria-hidden="true" size={16} />
          </Button>
        }
      />

      <SummaryGrid columns={3} className="dashboard-kpis">
        <StatCard
          label="Lô cần xử lý"
          value={alerts.length}
          description={`${stockoutCount} hết hàng · ${expiredCount} hết hạn · ${expiringCount} gần hết hạn`}
          status={
            criticalCount > 0
              ? "danger"
              : expiringCount > 0
                ? "warning"
                : "success"
          }
          icon={<CircleAlert aria-hidden="true" />}
          loading={loading}
        />
        <StatCard
          label="Lô gần hết hạn"
          value={expiringCount}
          description="Ưu tiên xuất trước theo hạn dùng"
          status={expiringCount > 0 ? "warning" : "success"}
          icon={<Clock3 aria-hidden="true" />}
          loading={loading}
        />
        <StatCard
          label="Ngân sách còn"
          value={formatVnd(data.settings.remainingBudget)}
          description={`Đã giữ cho đơn hàng ${formatVnd(data.settings.reservedBudget)} · đã chi ${formatVnd(data.settings.spentBudget)}`}
          icon={<WalletCards aria-hidden="true" />}
          loading={loading}
        />
      </SummaryGrid>

      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-analytics">
          <SectionHeading title="Tồn khả dụng và nhu cầu" />
          {loading ? (
            <div className="dashboard-loading-state" aria-live="polite">
              <span aria-hidden="true" />
              Đang tải dữ liệu phân tích…
            </div>
          ) : bars.length > 0 ? (
            <div
              aria-label="So sánh tồn khả dụng cộng lượng đang về với nhu cầu kế hoạch"
              className="stock-comparison"
              role="list"
            >
              <div className="stock-legend" aria-hidden="true">
                <span>
                  <i className="legend-stock" /> Tồn khả dụng + đang về
                </span>
                <span>
                  <i className="legend-demand" /> Nhu cầu dự kiến
                </span>
              </div>
              {bars.map((line) => {
                const stock = line.usableStock + line.inbound;
                const demand = line.forecastDemand;
                const maximum = Math.max(stock, demand, 0.01);
                const stockWidth = Math.max(
                  0,
                  Math.min(100, (stock / maximum) * 100),
                );
                const demandWidth = Math.max(
                  0,
                  Math.min(100, (demand / maximum) * 100),
                );
                return (
                  <div
                    aria-label={`${line.ingredient}: tồn khả dụng cộng đang về ${formatQuantity(stock, line.unit)}, nhu cầu ${formatQuantity(demand, line.unit)}`}
                    className="stock-row"
                    key={line.ingredientId || line.ingredient}
                    role="listitem"
                  >
                    <div className="stock-row-label">
                      <strong>{line.ingredient}</strong>
                      <small>{line.unit}</small>
                    </div>
                    <div className="stock-row-plot" aria-hidden="true">
                      <span>
                        <i
                          className="stock-bar stock-bar-current"
                          style={{ width: `${stockWidth}%` }}
                        />
                      </span>
                      <span>
                        <i
                          className="stock-bar stock-bar-demand"
                          style={{ width: `${demandWidth}%` }}
                        />
                      </span>
                    </div>
                    <div className="stock-row-values" aria-hidden="true">
                      <span>{formatQuantity(stock, line.unit)}</span>
                      <span>{formatQuantity(demand, line.unit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <strong>Chưa có dữ liệu so sánh</strong>
              <span>Hoàn tất một lần chạy kế hoạch để xem tồn và nhu cầu.</span>
            </div>
          )}
        </section>

        <section className="dashboard-panel dashboard-alerts">
          <SectionHeading
            title="Việc cần làm"
            action={
              loading ? null : (
                <span className="dashboard-count">
                  {(alerts.length + missingCount).toLocaleString("vi-VN")} vấn đề
                </span>
              )
            }
          />
          {loading ? (
            <div className="dashboard-loading-state" aria-live="polite">
              <span aria-hidden="true" />
              Đang tải cảnh báo…
            </div>
          ) : (
            <div className="dashboard-alert-list">
              {alerts.slice(0, 6).map((alert) => {
                const copy = alertCopy(alert);
                return (
                  <AlertRow
                    key={alert.key}
                    title={copy.title}
                    body={copy.body}
                    tone={copy.tone}
                    onClick={() => onNavigate("inventory")}
                  />
                );
              })}
              {alerts.length > 6 ? (
                <AlertRow
                  title={`Còn ${alerts.length - 6} lô cần xử lý`}
                  body="Mở trang Kho để xem đầy đủ theo thứ tự FEFO."
                  tone="amber"
                  onClick={() => onNavigate("inventory")}
                />
              ) : null}
              {missingCount > 0 ? (
                <AlertRow
                  title={`${missingCount} nguyên liệu thiếu dữ liệu lô`}
                  body="Mở trang Kho để kiểm tra và bổ sung dữ liệu."
                  tone="blue"
                  onClick={() => onNavigate("inventory")}
                />
              ) : null}
              {alerts.length === 0 ? (
                <AlertRow
                  title="Không có lô hết hàng, hết hạn hoặc gần hết hạn"
                  tone="pine"
                  onClick={() => onNavigate("inventory")}
                />
              ) : null}
              <AlertRow
                title={planning.title}
                body={planning.body}
                tone={planning.tone}
                onClick={() => onNavigate("plan")}
              />
            </div>
          )}
          <div className="action-row">
            <Button onClick={() => onNavigate("inventory")}>Xem kho theo lô</Button>
          </div>
        </section>
      </div>
    </div>
  );
}

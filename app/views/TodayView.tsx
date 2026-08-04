"use client";

import { ArrowRight } from "lucide-react";
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
  Metric,
  PageHeader,
  SectionHeading,
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
  return value ? formatDate(value) : "chưa có ngày";
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
      body: `${lotReference} có trạng thái stockout từ backend.`,
      tone: "red",
    };
  }
  if (status === "expired") {
    const quantity = lot?.expiredQuantity ?? ingredient.expiredQty ?? ingredient.onHand;
    return {
      title: `${ingredient.ingredient}: ${formatQuantity(quantity, ingredient.unit)} đã hết hạn`,
      body: `${lotReference} · hạn ${formatBackendDate(lot?.expiryDate ?? ingredient.expiryDate)}.`,
      tone: "red",
    };
  }
  const quantity = lot?.expiringQuantity ?? ingredient.expiringQty;
  return {
    title: `${ingredient.ingredient}: ${formatQuantity(quantity, ingredient.unit)} gần hết hạn`,
    body: `${lotReference} · hạn ${formatBackendDate(lot?.expiryDate ?? ingredient.expiryDate)} · ưu tiên FEFO.`,
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
      title: "Kế hoạch đang chạy",
      body: plan.engineStatus || "Đang chờ kết quả từ backend.",
      tone: "blue",
    };
  }
  if (status === "blocked") {
    return {
      title: "Kế hoạch đang bị chặn",
      body:
        plan.failureMessage ||
        (plan.failureCode === "MODEL_NOT_READY"
          ? "Mô hình dự báo chưa sẵn sàng."
          : "Xem chi tiết lỗi trong màn hình kế hoạch."),
      tone: "amber",
    };
  }
  if (status === "failed") {
    return {
      title: "Lần chạy kế hoạch thất bại",
      body: plan.failureMessage || "Mở kế hoạch để xem lỗi backend.",
      tone: "red",
    };
  }
  if (status === "completed") {
    const plannedCost =
      plan.budget?.plannedCost ??
      plan.recommendations.reduce((sum, line) => sum + line.cost, 0);
    return {
      title: `Kế hoạch hoàn tất · ${formatVnd(plannedCost)}`,
      body: plan.completedAt
        ? `Backend hoàn tất ngày ${formatBackendDate(plan.completedAt)}.`
        : "Kết quả backend đã sẵn sàng để xem.",
      tone: "pine",
    };
  }
  return {
    title: "Chưa chạy kế hoạch",
    body: "Mở màn hình kế hoạch để bắt đầu dự báo và lập kế hoạch nhập.",
    tone: "blue",
  };
}

export function TodayView({
  data,
  plan,
  onNavigate,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  onNavigate: (page: "inventory" | "plan") => void;
}) {
  const alerts = inventoryAlerts(plan.enrichedInventory);
  const stockoutCount = alerts.filter((alert) => alert.status === "stockout").length;
  const expiredCount = alerts.filter((alert) => alert.status === "expired").length;
  const expiringCount = alerts.filter((alert) => alert.status === "expiring").length;
  const missingCount = plan.enrichedInventory.filter(
    (item) => item.statusKey === "missing",
  ).length;
  const planning = planningCopy(plan);
  const bars = plan.status === "completed" ? plan.recommendations.slice(0, 6) : [];

  return (
    <>
      <PageHeader
        title="Hôm nay"
        subtitle="Trạng thái lô kho và lần chạy kế hoạch hiện tại."
        context={data.settings.storeName}
      />

      <div className="metric-grid">
        <Metric
          label="Lô cần xử lý"
          value={alerts.length}
          note={`${stockoutCount} hết hàng · ${expiredCount} hết hạn`}
          tone="red"
        />
        <Metric
          label="Lô gần hạn"
          value={expiringCount}
          note={`${missingCount} nguyên liệu thiếu dữ liệu lô`}
          tone="amber"
        />
        <Metric
          label="Ngân sách còn"
          value={formatVnd(data.settings.remainingBudget)}
          note={`Đã giữ ${formatVnd(data.settings.reservedBudget)} · đã chi ${formatVnd(data.settings.spentBudget)}`}
        />
      </div>

      <div className="overview-grid">
        <section>
          <SectionHeading title="Việc cần làm" />
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
              body="Mở kho để xem đầy đủ theo thứ tự FEFO."
              tone="amber"
              onClick={() => onNavigate("inventory")}
            />
          ) : null}
          {alerts.length === 0 ? (
            <AlertRow
              title="Không có lô stockout, expired hoặc expiring"
              body="Theo dữ liệu lô hiện tại từ backend."
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
          <div className="action-row">
            <Button variant="primary" onClick={() => onNavigate("plan")}>
              Mở kế hoạch nhập
              <ArrowRight size={16} />
            </Button>
            <Button onClick={() => onNavigate("inventory")}>Xem kho theo lô</Button>
          </div>
        </section>

        <section>
          <SectionHeading
            title="Tồn khả dụng và nhu cầu"
            subtitle={
              plan.status === "completed"
                ? "Theo kịch bản kế hoạch đang chọn"
                : "Hiển thị sau khi kế hoạch hoàn tất"
            }
          />
          {bars.length > 0 ? (
            <div className="stock-comparison">
              <div className="stock-legend">
                <span>
                  <i className="legend-stock" /> Tồn khả dụng + đang về
                </span>
                <span>
                  <i className="legend-demand" /> Nhu cầu kế hoạch
                </span>
              </div>
              {bars.map((line) => {
                const stock = line.usableStock + line.inbound;
                const demand = line.forecastDemand;
                const maximum = Math.max(stock, demand, 0.01);
                return (
                  <div
                    className="stock-row"
                    key={line.ingredientId || line.ingredient}
                  >
                    <span>{line.ingredient}</span>
                    <div>
                      <i
                        className="stock-bar stock-bar-current"
                        style={{ width: `${(stock / maximum) * 100}%` }}
                      />
                      <i
                        className="stock-bar stock-bar-demand"
                        style={{ width: `${(demand / maximum) * 100}%` }}
                      />
                    </div>
                    <small>{line.unit}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="panel table-empty">
              Chưa có kết quả kế hoạch hoàn tất để so sánh.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

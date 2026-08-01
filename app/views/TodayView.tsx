"use client";

import { ArrowRight } from "lucide-react";
import type { BootstrapData, PlanResponse } from "../../lib/types";
import {
  AlertRow,
  Button,
  Metric,
  PageHeader,
  SectionHeading,
  formatQuantity,
  formatVnd,
} from "../components/ui";

export function TodayView({
  data,
  plan,
  onNavigate,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  onNavigate: (page: "inventory" | "plan") => void;
}) {
  const expiring = plan.enrichedInventory.filter(
    (item) => item.statusKey === "expiring",
  );
  const low = plan.enrichedInventory.filter((item) =>
    ["low", "stockout"].includes(item.statusKey),
  );
  const planTotal = plan.recommendations.reduce(
    (sum, item) => sum + item.cost,
    0,
  );
  const activeOrders = plan.recommendations.filter(
    (item) => item.recommendedQty > 0,
  );
  const milk = plan.enrichedInventory.find(
    (item) => item.ingredient === "Sữa tươi",
  );
  const banana = plan.enrichedInventory.find(
    (item) => item.ingredient === "Chuối",
  );
  const bars = plan.recommendations.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Hôm nay"
        subtitle="Những việc cần xử lý trước khi cửa hàng mở ca."
        context={data.settings.storeName}
      />

      <div className="metric-grid">
        <Metric
          label="Cần xử lý"
          value={activeOrders.length + expiring.length}
          note="Tồn kho và kế hoạch nhập"
          tone="red"
        />
        <Metric
          label="Sắp hết"
          value={low.length}
          note={`${expiring.length} nguyên liệu gần hạn`}
          tone="amber"
        />
        <Metric
          label="Ngân sách còn"
          value={formatVnd(data.settings.remainingBudget)}
          note={`Kế hoạch hiện tại ${formatVnd(planTotal)}`}
        />
      </div>

      <div className="overview-grid">
        <section>
          <SectionHeading title="Việc cần làm" />
          {milk ? (
            <AlertRow
              title={`Sữa tươi còn đủ ${milk.daysSupply.toFixed(1)} ngày`}
              body="Nên đặt trước lần giao tiếp theo."
              tone="red"
              onClick={() => onNavigate("plan")}
            />
          ) : null}
          {banana ? (
            <AlertRow
              title={`${formatQuantity(banana.expiringQty, banana.unit)} chuối gần hết hạn`}
              body={`Còn ${banana.expiryDays} ngày để sử dụng.`}
              tone="amber"
              onClick={() => onNavigate("inventory")}
            />
          ) : null}
          <AlertRow
            title={`Kế hoạch nhập dự kiến ${formatVnd(planTotal)}`}
            body="Đã tính tồn kho, nhu cầu và quy cách đặt."
            tone="pine"
            onClick={() => onNavigate("plan")}
          />
          <div className="action-row">
            <Button variant="primary" onClick={() => onNavigate("plan")}>
              Mở kế hoạch nhập
              <ArrowRight size={16} />
            </Button>
            <Button onClick={() => onNavigate("inventory")}>Xem kho</Button>
          </div>
        </section>

        <section>
          <SectionHeading
            title="Tồn kho và nhu cầu"
            subtitle="Trong 7 ngày tới"
          />
          <div className="stock-comparison">
            <div className="stock-legend">
              <span>
                <i className="legend-stock" /> Tồn dùng được
              </span>
              <span>
                <i className="legend-demand" /> Nhu cầu
              </span>
            </div>
            {bars.map((item) => {
              const maximum = Math.max(
                item.usableStock + item.inbound,
                item.forecastDemand + item.safetyStock,
                0.01,
              );
              return (
                <div className="stock-row" key={item.ingredient}>
                  <span>{item.ingredient}</span>
                  <div>
                    <i
                      className="stock-bar stock-bar-current"
                      style={{
                        width: `${((item.usableStock + item.inbound) / maximum) * 100}%`,
                      }}
                    />
                    <i
                      className="stock-bar stock-bar-demand"
                      style={{
                        width: `${((item.forecastDemand + item.safetyStock) / maximum) * 100}%`,
                      }}
                    />
                  </div>
                  <small>{item.unit}</small>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

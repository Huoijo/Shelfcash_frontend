"use client";

import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BootstrapData, PlanResponse } from "../../lib/types";
import { ForecastChart } from "../components/ForecastChart";
import {
  Button,
  Confidence,
  Details,
  Metric,
  PageHeader,
  SectionHeading,
  StatusPill,
  TabList,
  formatDate,
  formatQuantity,
} from "../components/ui";

const tabs = ["Phân tích", "Lịch sử", "Dữ liệu"] as const;

export function InventoryView({
  data,
  plan,
  onOpenPlan,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  onOpenPlan: (ingredient: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(
    plan.enrichedInventory[0]?.ingredient ?? "",
  );
  const [tab, setTab] = useState<(typeof tabs)[number]>("Phân tích");

  const filtered = useMemo(
    () =>
      plan.enrichedInventory.filter(
        (item) =>
          (status === "all" || item.statusKey === status) &&
          item.ingredient.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [plan.enrichedInventory, query, status],
  );
  const item =
    plan.enrichedInventory.find(
      (inventoryItem) => inventoryItem.ingredient === selected,
    ) ?? filtered[0];
  const forecast = item ? plan.forecasts[item.ingredient] : null;
  const lowCount = plan.enrichedInventory.filter((inventoryItem) =>
    ["low", "stockout"].includes(inventoryItem.statusKey),
  ).length;
  const expiringCount = plan.enrichedInventory.filter(
    (inventoryItem) => inventoryItem.statusKey === "expiring",
  ).length;
  const inboundCount = plan.enrichedInventory.filter(
    (inventoryItem) => inventoryItem.inbound > 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Kho"
        subtitle="Tồn hiện tại, số ngày đủ dùng và hạn gần nhất."
        context={data.settings.storeName}
      />

      <div className="metric-grid">
        <Metric
          label="Cần nhập"
          value={lowCount}
          note={`Trong ${plan.enrichedInventory.length} nguyên liệu`}
          tone="red"
        />
        <Metric
          label="Gần hết hạn"
          value={expiringCount}
          note="Trong ba ngày tới"
          tone="amber"
        />
        <Metric
          label="Đang về"
          value={inboundCount}
          note="Nguyên liệu có đơn đang giao"
          tone="blue"
        />
      </div>

      <SectionHeading title="Nguyên liệu" />
      <div className="filter-row">
        <label className="field field-inline">
          <span>Trạng thái</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="low">Sắp hết</option>
            <option value="expiring">Sắp hết hạn</option>
            <option value="normal">Bình thường</option>
            <option value="overstock">Dư tồn kho</option>
          </select>
        </label>
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm nguyên liệu"
          />
        </label>
      </div>

      <div className="table-wrap inventory-table">
        <table>
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              <th>Tồn kho</th>
              <th>Đủ dùng</th>
              <th>Hạn gần nhất</th>
              <th>Tồn an toàn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.ingredient}
                className={row.ingredient === item?.ingredient ? "selected" : ""}
                onClick={() => setSelected(row.ingredient)}
              >
                <td>
                  <strong>{row.ingredient}</strong>
                  <small>{row.sku}</small>
                </td>
                <td>{formatQuantity(row.onHand, row.unit)}</td>
                <td>
                  {row.daysSupply >= 999 ? "—" : `${row.daysSupply.toFixed(1)} ngày`}
                </td>
                <td>{formatDate(row.expiryDate)}</td>
                <td>{row.safetyStock == null ? "Chưa cấu hình" : formatQuantity(row.safetyStock, row.unit)}</td>
                <td>
                  <StatusPill status={row.statusKey} label={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="table-empty">Không có nguyên liệu phù hợp.</div>
        ) : null}
      </div>

      {item && forecast ? (
        <>
          <SectionHeading
            title={item.ingredient}
            subtitle={`${item.supplier} · giao trong ${item.leadTimeDays} ngày`}
            action={
              <Button variant="quiet" onClick={() => onOpenPlan(item.ingredient)}>
                Mở kế hoạch
                <ArrowRight size={15} />
              </Button>
            }
          />
          <div className="metric-grid">
            <Metric
              label="Tồn hiện tại"
              value={formatQuantity(item.onHand, item.unit)}
              note={item.status}
            />
            <Metric
              label="Đủ dùng"
              value={`${item.daysSupply.toFixed(1)} ngày`}
              note="Theo 28 ngày gần nhất"
              tone={item.daysSupply < 3 ? "amber" : "pine"}
            />
            <Metric
              label="Nhu cầu 7 ngày"
              value={formatQuantity(forecast.totals.p50, item.unit)}
              note={`${formatQuantity(forecast.totals.p25)}–${formatQuantity(
                forecast.totals.p75,
              )} ${item.unit}`}
              tone="blue"
            />
          </div>

          <TabList items={tabs} value={tab} onChange={setTab} />
          {tab === "Phân tích" ? (
            <div className="detail-grid">
              <ForecastChart forecast={forecast} compact />
              <div className="explain-panel">
                <span>Cách đọc trạng thái</span>
                <ul>
                  <li>
                    Tiêu thụ trung bình{" "}
                    {formatQuantity(item.averageDailyUsage, item.unit)}/ngày.
                  </li>
                  <li>
                    Tồn an toàn {item.safetyStock == null ? "chưa cấu hình" : formatQuantity(item.safetyStock, item.unit)}.
                  </li>
                  <li>Hàng đang về {formatQuantity(item.inbound, item.unit)}.</li>
                  <li>
                    Quy cách đặt {formatQuantity(item.packSize, item.unit)}.
                  </li>
                </ul>
                <Button
                  variant="primary"
                  onClick={() => onOpenPlan(item.ingredient)}
                >
                  Đi đến đề xuất nhập
                </Button>
              </div>
            </div>
          ) : null}
          {tab === "Lịch sử" ? (
            <div className="panel">
              <ForecastChart forecast={forecast} />
            </div>
          ) : null}
          {tab === "Dữ liệu" ? (
            <div className="confidence-grid">
              <Confidence title="Nguồn tồn kho" detail={item.dataQuality} />
              <Confidence
                title="Bao phủ lịch sử"
                detail={forecast.dataNotes[0]}
              />
              <Confidence
                title="Độ tin cậy dự báo"
                detail={forecast.confidence}
              />
            </div>
          ) : null}
          <Details summary="Thông tin lô và kiểm kho">
            <p className="quiet-copy">
              Hạn gần nhất {formatDate(item.expiryDate)} · kiểm kho lần cuối{" "}
              {formatDate(item.lastCounted)} · {item.expiringQty} {item.unit} có
              nguy cơ hết hạn.
            </p>
          </Details>
        </>
      ) : null}
    </>
  );
}

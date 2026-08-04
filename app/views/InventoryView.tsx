"use client";

import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  BootstrapData,
  EnrichedInventoryItem,
  IngredientDemandResult,
  InventoryLot,
  InventoryStatus,
  PlanResponse,
} from "../../lib/types";
import {
  Button,
  Confidence,
  Details,
  Metric,
  Notice,
  PageHeader,
  SectionHeading,
  StatusPill,
  TabList,
  formatDate,
  formatQuantity,
} from "../components/ui";

const tabs = ["Lô FEFO", "Nhu cầu", "Dữ liệu"] as const;
const statuses: InventoryStatus[] = [
  "stockout",
  "expired",
  "expiring",
  "healthy",
  "missing",
];

const statusLabels: Record<InventoryStatus, string> = {
  stockout: "Hết hàng",
  expired: "Hết hạn",
  expiring: "Gần hết hạn",
  healthy: "Khỏe",
  missing: "Thiếu dữ liệu",
};

function inventoryKey(item: EnrichedInventoryItem): string {
  return item.ingredientId || item.sku || item.ingredient;
}

function formatBackendDate(value?: string): string {
  return value ? formatDate(value) : "—";
}

function sortLotsByFefo(lots: InventoryLot[]): InventoryLot[] {
  return [...lots].sort((left, right) => {
    if (!left.expiryDate) return 1;
    if (!right.expiryDate) return -1;
    return left.expiryDate.localeCompare(right.expiryDate);
  });
}

function findIngredientDemand(
  plan: PlanResponse,
  item: EnrichedInventoryItem,
): IngredientDemandResult | undefined {
  if (item.ingredientId && plan.ingredientDemand[item.ingredientId]) {
    return plan.ingredientDemand[item.ingredientId];
  }
  if (plan.ingredientDemand[item.ingredient]) {
    return plan.ingredientDemand[item.ingredient];
  }
  return Object.values(plan.ingredientDemand).find(
    (result) =>
      result.ingredientId === item.ingredientId ||
      result.ingredient === item.ingredient,
  );
}

export function InventoryView({
  data,
  plan,
  onOpenPlan,
  onCountLot,
  onAdjustLot,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  onOpenPlan: (ingredient: string) => void;
  onCountLot?: (input: {
    lotId: string;
    countedQuantity: number;
    unit: string;
    note?: string;
  }) => Promise<void>;
  onAdjustLot?: (input: {
    lotId: string;
    expectedVersion: number;
    quantityDelta: number;
    unit: string;
    reason: string;
    note?: string;
    reference?: string;
  }) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InventoryStatus | "all">("all");
  const [selected, setSelected] = useState(
    plan.enrichedInventory[0] ? inventoryKey(plan.enrichedInventory[0]) : "",
  );
  const [tab, setTab] = useState<(typeof tabs)[number]>("Lô FEFO");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countNote, setCountNote] = useState("");
  const [adjustmentDelta, setAdjustmentDelta] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("waste");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentReference, setAdjustmentReference] = useState("");
  const [mutationBusy, setMutationBusy] = useState("");
  const [mutationMessage, setMutationMessage] = useState("");
  const [mutationError, setMutationError] = useState("");

  const allLots = useMemo(
    () => plan.enrichedInventory.flatMap((inventory) => inventory.lots ?? []),
    [plan.enrichedInventory],
  );
  const statusCounts = useMemo(() => {
    const counts: Record<InventoryStatus, number> = {
      stockout: 0,
      expired: 0,
      expiring: 0,
      healthy: 0,
      missing: 0,
    };
    for (const lot of allLots) counts[lot.status] += 1;
    counts.missing += plan.enrichedInventory.filter(
      (inventory) =>
        inventory.statusKey === "missing" && (inventory.lots?.length ?? 0) === 0,
    ).length;
    return counts;
  }, [allLots, plan.enrichedInventory]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return plan.enrichedInventory.filter((inventory) => {
      const matchesStatus =
        status === "all" ||
        inventory.statusKey === status ||
        inventory.lots?.some((lot) => lot.status === status);
      const matchesQuery =
        !normalizedQuery ||
        inventory.ingredient.toLocaleLowerCase("vi").includes(normalizedQuery) ||
        inventory.sku.toLocaleLowerCase("vi").includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [plan.enrichedInventory, query, status]);

  const item =
    filtered.find((inventory) => inventoryKey(inventory) === selected) ??
    filtered[0];
  const lots = item ? sortLotsByFefo(item.lots ?? []) : [];
  const selectedLot =
    lots.find((lot) => lot.lotId === selectedLotId) ?? lots[0];
  const demand = item ? findIngredientDemand(plan, item) : undefined;

  async function submitCount() {
    if (!selectedLot || !onCountLot) return;
    const quantity = Number(countedQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setMutationError("Số lượng kiểm kho phải là số không âm.");
      return;
    }
    setMutationBusy("count");
    setMutationError("");
    setMutationMessage("");
    try {
      await onCountLot({
        lotId: selectedLot.lotId,
        countedQuantity: quantity,
        unit: selectedLot.unit,
        note: countNote,
      });
      setMutationMessage("Backend đã ghi nhận kiểm kho và trả snapshot mới.");
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Không thể ghi kiểm kho.",
      );
    } finally {
      setMutationBusy("");
    }
  }

  async function submitAdjustment() {
    if (!selectedLot || !onAdjustLot) return;
    const delta = Number(adjustmentDelta);
    const negativeReasons = new Set([
      "waste",
      "expired",
      "damaged",
      "correction_decrease",
    ]);
    const invalidSign =
      !Number.isFinite(delta) ||
      delta === 0 ||
      (negativeReasons.has(adjustmentReason) && delta >= 0) ||
      (adjustmentReason === "correction_increase" && delta <= 0);
    if (invalidSign) {
      setMutationError("Dấu của quantity delta không phù hợp với reason đã chọn.");
      return;
    }
    if (adjustmentReason === "other" && !adjustmentNote.trim()) {
      setMutationError("Reason other bắt buộc có ghi chú.");
      return;
    }
    setMutationBusy("adjust");
    setMutationError("");
    setMutationMessage("");
    try {
      await onAdjustLot({
        lotId: selectedLot.lotId,
        expectedVersion: selectedLot.version,
        quantityDelta: delta,
        unit: selectedLot.unit,
        reason: adjustmentReason,
        note: adjustmentNote,
        reference: adjustmentReference,
      });
      setMutationMessage("Backend đã ghi adjustment và tải lại version của lot.");
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Không thể điều chỉnh lot.",
      );
    } finally {
      setMutationBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Kho"
        subtitle="Tồn kho theo lô, hạn dùng và thứ tự xuất FEFO."
        context={data.settings.storeName}
      />

      <SectionHeading
        title="Tình trạng lô"
        subtitle={`${allLots.length} lô do backend trả về`}
      />
      <div className="metric-grid inventory-status-metrics">
        <Metric
          label="Hết hàng"
          value={statusCounts.stockout}
          note="Lô có trạng thái stockout"
          tone="red"
        />
        <Metric
          label="Hết hạn"
          value={statusCounts.expired}
          note="Không tính vào tồn khả dụng"
          tone="red"
        />
        <Metric
          label="Gần hết hạn"
          value={statusCounts.expiring}
          note="Ưu tiên xuất trước theo FEFO"
          tone="amber"
        />
        <Metric
          label="Khỏe"
          value={statusCounts.healthy}
          note="Lô còn khả dụng"
        />
        <Metric
          label="Thiếu dữ liệu"
          value={statusCounts.missing}
          note="Bản ghi chưa có dữ liệu lô"
          tone="blue"
        />
      </div>

      <SectionHeading
        title="Nguyên liệu"
        subtitle="Bảng tổng hợp; chọn một dòng để xem đầy đủ từng lô."
      />
      <div className="filter-row">
        <label className="field field-inline">
          <span>Trạng thái lô</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as InventoryStatus | "all")
            }
          >
            <option value="all">Tất cả ({allLots.length})</option>
            {statuses.map((value) => (
              <option value={value} key={value}>
                {statusLabels[value]} ({statusCounts[value]})
              </option>
            ))}
          </select>
        </label>
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm nguyên liệu hoặc SKU"
          />
        </label>
      </div>

      <div className="table-wrap inventory-table">
        <table>
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              <th>Tổng tồn</th>
              <th>Khả dụng</th>
              <th>Số lô</th>
              <th>Hạn gần nhất</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const key = inventoryKey(row);
              return (
                <tr
                  key={key}
                  className={key === inventoryKey(item ?? row) ? "selected" : ""}
                  onClick={() => setSelected(key)}
                >
                  <td>
                    <strong>{row.ingredient}</strong>
                    <small>{row.sku}</small>
                  </td>
                  <td>{formatQuantity(row.onHand, row.unit)}</td>
                  <td>
                    {row.usableQuantity == null
                      ? "—"
                      : formatQuantity(row.usableQuantity, row.unit)}
                  </td>
                  <td>{row.lots?.length ?? 0}</td>
                  <td>{formatBackendDate(row.expiryDate)}</td>
                  <td>
                    <StatusPill status={row.statusKey} label={row.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="table-empty">Không có nguyên liệu phù hợp.</div>
        ) : null}
      </div>

      {item ? (
        <>
          <SectionHeading
            title={item.ingredient}
            subtitle={`${lots.length} lô · ${item.supplier || "Chưa gán nhà cung cấp"}`}
            action={
              <Button variant="quiet" onClick={() => onOpenPlan(item.ingredient)}>
                Mở kế hoạch
                <ArrowRight size={15} />
              </Button>
            }
          />
          <div className="metric-grid">
            <Metric
              label="Tổng tồn"
              value={formatQuantity(item.onHand, item.unit)}
              note="Tổng hợp từ các lô bên dưới"
            />
            <Metric
              label="Tồn khả dụng"
              value={
                item.usableQuantity == null
                  ? "—"
                  : formatQuantity(item.usableQuantity, item.unit)
              }
              note="Không bao gồm lượng hết hạn"
              tone="blue"
            />
            <Metric
              label="Nhu cầu P50"
              value={
                demand
                  ? formatQuantity(demand.totals.p50, demand.unit)
                  : "Chưa có"
              }
              note={
                demand
                  ? `${plan.horizonDays ?? data.settings.forecastHorizon} ngày của lần chạy hiện tại`
                  : "Chạy dự báo và nhu cầu nguyên liệu để xem"
              }
              tone="amber"
            />
          </div>

          <TabList items={tabs} value={tab} onChange={setTab} />
          {tab === "Lô FEFO" ? (
            <div className="table-wrap lot-detail-table">
              <table aria-label={`Lô ${item.ingredient} theo thứ tự FEFO`}>
                <thead>
                  <tr>
                    <th>Lô</th>
                    <th>Nhà cung cấp</th>
                    <th>Ngày nhận</th>
                    <th>Hạn dùng</th>
                    <th>Tồn</th>
                    <th>Khả dụng</th>
                    <th>Gần hạn</th>
                    <th>Hết hạn</th>
                    <th>Phiên bản</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.lotId}>
                      <td>
                        <strong>{lot.lotId}</strong>
                        <small>{lot.sku}</small>
                      </td>
                      <td>{lot.supplier || "—"}</td>
                      <td>{formatBackendDate(lot.receivedDate)}</td>
                      <td>{formatBackendDate(lot.expiryDate)}</td>
                      <td>{formatQuantity(lot.onHand, lot.unit)}</td>
                      <td>{formatQuantity(lot.usableQuantity, lot.unit)}</td>
                      <td>{formatQuantity(lot.expiringQuantity, lot.unit)}</td>
                      <td>{formatQuantity(lot.expiredQuantity, lot.unit)}</td>
                      <td>v{lot.version}</td>
                      <td>
                        <StatusPill
                          status={lot.status}
                          label={statusLabels[lot.status]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lots.length === 0 ? (
                <div className="table-empty">
                  Backend chưa trả dữ liệu lô cho nguyên liệu này.
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "Nhu cầu" ? (
            demand ? (
              <>
                <div className="table-wrap demand-detail-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>P25</th>
                        <th>P50</th>
                        <th>P75</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.forecast.map((point) => (
                        <tr key={point.date}>
                          <td>{formatBackendDate(point.date)}</td>
                          <td>{formatQuantity(point.p25 ?? 0, demand.unit)}</td>
                          <td>{formatQuantity(point.p50 ?? 0, demand.unit)}</td>
                          <td>{formatQuantity(point.p75 ?? 0, demand.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Details summary="Đóng góp nhu cầu theo sản phẩm">
                  {demand.contributions.length > 0 ? (
                    <ul className="warning-list">
                      {demand.contributions.map((contribution, index) => (
                        <li
                          key={`${contribution.productId || contribution.product}-${index}`}
                        >
                          {contribution.product}: P50 {formatQuantity(
                            contribution.p50,
                            contribution.unit || demand.unit,
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="quiet-copy">
                      Kết quả chưa có chi tiết đóng góp theo sản phẩm.
                    </p>
                  )}
                </Details>
              </>
            ) : (
              <div className="panel table-empty">
                Chưa có kết quả nhu cầu nguyên liệu cho lần chạy hiện tại.
              </div>
            )
          ) : null}

          {tab === "Dữ liệu" ? (
            <>
              <div className="confidence-grid">
                <Confidence title="Nguồn tồn kho" detail={item.dataQuality} />
                <Confidence
                  title="Kiểm kho gần nhất"
                  detail={formatBackendDate(item.lastCounted)}
                />
                <Confidence
                  title="Phiên bản lô"
                  detail={`${lots.filter((lot) => Number.isInteger(lot.version)).length}/${lots.length} lô có version`}
                />
              </div>
              <Details summary="Ràng buộc nhập hàng (chỉ đọc)">
                <ul className="warning-list">
                  <li>
                    Tồn an toàn: {item.safetyStock == null
                      ? "chưa cấu hình"
                      : formatQuantity(item.safetyStock, item.unit)}
                  </li>
                  <li>Hàng đang về: {formatQuantity(item.inbound, item.unit)}</li>
                  <li>MOQ: {formatQuantity(item.moq, item.unit)}</li>
                  <li>Quy cách đóng gói: {formatQuantity(item.packSize, item.unit)}</li>
                  <li>Lead time: {item.leadTimeDays} ngày</li>
                </ul>
              </Details>
              {selectedLot && (onCountLot || onAdjustLot) ? (
                <Details summary="Kiểm kho và điều chỉnh lot" open>
                  <label className="field">
                    <span>Lot thao tác</span>
                    <select
                      value={selectedLot.lotId}
                      onChange={(event) => {
                        const next = lots.find(
                          (lot) => lot.lotId === event.target.value,
                        );
                        setSelectedLotId(event.target.value);
                        setCountedQuantity(
                          next ? String(next.onHand) : "",
                        );
                        setAdjustmentDelta("");
                        setMutationError("");
                        setMutationMessage("");
                      }}
                    >
                      {lots.map((lot) => (
                        <option value={lot.lotId} key={lot.lotId}>
                          {lot.lotId} · v{lot.version} · {lot.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mutationMessage ? (
                    <Notice tone="success">{mutationMessage}</Notice>
                  ) : null}
                  {mutationError ? (
                    <Notice tone="error">{mutationError}</Notice>
                  ) : null}
                  {onCountLot ? (
                    <div className="panel">
                      <SectionHeading
                        title="Physical count"
                        subtitle="Backend tính delta từ balance hiện tại."
                      />
                      <div className="two-column compact-gap">
                        <label className="field">
                          <span>Số lượng đếm được ({selectedLot.unit})</span>
                          <input
                            type="number"
                            min="0"
                            value={countedQuantity}
                            placeholder={String(selectedLot.onHand)}
                            onChange={(event) =>
                              setCountedQuantity(event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Ghi chú</span>
                          <input
                            value={countNote}
                            onChange={(event) => setCountNote(event.target.value)}
                            placeholder="Kiểm kho cuối ngày"
                          />
                        </label>
                      </div>
                      <Button
                        busy={mutationBusy === "count"}
                        onClick={() => void submitCount()}
                      >
                        Ghi kiểm kho
                      </Button>
                    </div>
                  ) : null}
                  {onAdjustLot ? (
                    <div className="panel">
                      <SectionHeading
                        title="Manual adjustment"
                        subtitle={`Gửi expected_version=${selectedLot.version}; VERSION_CONFLICT sẽ tải lại lot.`}
                      />
                      <div className="two-column compact-gap">
                        <label className="field">
                          <span>Quantity delta ({selectedLot.unit})</span>
                          <input
                            type="number"
                            value={adjustmentDelta}
                            onChange={(event) =>
                              setAdjustmentDelta(event.target.value)
                            }
                            placeholder="-1"
                          />
                        </label>
                        <label className="field">
                          <span>Reason</span>
                          <select
                            value={adjustmentReason}
                            onChange={(event) =>
                              setAdjustmentReason(event.target.value)
                            }
                          >
                            <option value="waste">waste</option>
                            <option value="expired">expired</option>
                            <option value="damaged">damaged</option>
                            <option value="correction_decrease">
                              correction_decrease
                            </option>
                            <option value="correction_increase">
                              correction_increase
                            </option>
                            <option value="other">other</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Reference</span>
                          <input
                            value={adjustmentReference}
                            onChange={(event) =>
                              setAdjustmentReference(event.target.value)
                            }
                            placeholder="ADJ-..."
                          />
                        </label>
                        <label className="field">
                          <span>Ghi chú</span>
                          <input
                            value={adjustmentNote}
                            onChange={(event) =>
                              setAdjustmentNote(event.target.value)
                            }
                            placeholder={
                              adjustmentReason === "other"
                                ? "Bắt buộc"
                                : "Không bắt buộc"
                            }
                          />
                        </label>
                      </div>
                      <Button
                        busy={mutationBusy === "adjust"}
                        onClick={() => void submitAdjustment()}
                      >
                        Ghi điều chỉnh
                      </Button>
                    </div>
                  ) : null}
                </Details>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

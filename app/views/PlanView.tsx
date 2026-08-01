"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  Check,
  Download,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { evaluateAdjustedOrders } from "../../lib/logic";
import type {
  BootstrapData,
  PlanResponse,
  PurchaseOrder,
  Recommendation,
  Strategy,
} from "../../lib/types";
import { ForecastChart } from "../components/ForecastChart";
import {
  Button,
  Details,
  Metric,
  Notice,
  PageHeader,
  SectionHeading,
  StatusPill,
  formatDate,
  formatQuantity,
  formatVnd,
} from "../components/ui";

const strategies: Strategy[] = ["Tiết kiệm", "Cân bằng", "An toàn"];

const strategyNotes: Record<Strategy, string> = {
  "Tiết kiệm": "Giữ ít tồn hơn; nguy cơ thiếu hàng cao hơn.",
  "Cân bằng": "Dùng nhu cầu trung vị và mức tồn an toàn.",
  "An toàn": "Giữ thêm dự phòng để giảm nguy cơ thiếu.",
};

async function downloadOrder(
  order: PurchaseOrder,
  format: "xlsx" | "pdf",
) {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order, format }),
  });
  if (!response.ok) throw new Error("Không thể xuất đơn hàng.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${order.poId}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PlanView({
  data,
  plan,
  strategy,
  initialIngredient,
  draftOrders,
  onStrategyChange,
  onCreateOrders,
  onMarkOrdered,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  strategy: Strategy;
  initialIngredient?: string;
  draftOrders: PurchaseOrder[];
  onStrategyChange: (strategy: Strategy) => void;
  onCreateOrders: (
    recommendations: Recommendation[],
  ) => Promise<PurchaseOrder[]>;
  onMarkOrdered: (poId: string) => Promise<void>;
}) {
  const [selectedIngredient, setSelectedIngredient] = useState(
    initialIngredient || data.inventory[0]?.ingredient || "",
  );
  const [adjusted, setAdjusted] = useState<Recommendation[]>(
    plan.recommendations,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(
    draftOrders.at(-1)?.poId ?? "",
  );

  useEffect(() => {
    setAdjusted(plan.recommendations.map((row) => ({ ...row })));
    setConfirmed(false);
    setMessage("");
  }, [plan]);

  useEffect(() => {
    if (
      initialIngredient &&
      data.inventory.some((item) => item.ingredient === initialIngredient)
    ) {
      setSelectedIngredient(initialIngredient);
      return;
    }
    setSelectedIngredient((current) =>
      data.inventory.some((item) => item.ingredient === current)
        ? current
        : data.inventory[0]?.ingredient ?? "",
    );
  }, [data.inventory, initialIngredient]);

  useEffect(() => {
    if (draftOrders.length > 0) {
      setSelectedOrderId(draftOrders.at(-1)?.poId ?? "");
    }
  }, [draftOrders]);

  const forecast = plan.forecasts[selectedIngredient];
  const total = adjusted.reduce(
    (sum, item) => sum + item.orderQty * item.unitCost,
    0,
  );
  const budgetAfter = data.settings.remainingBudget - total;
  const warnings = useMemo(
    () =>
      evaluateAdjustedOrders(
        adjusted.map((item) => ({
          ...item,
          cost: item.orderQty * item.unitCost,
        })),
      ),
    [adjusted],
  );
  const activeSuppliers = new Set(
    adjusted.filter((item) => item.orderQty > 0).map((item) => item.supplier),
  ).size;
  const selectedOrder = draftOrders.find(
    (order) => order.poId === selectedOrderId,
  );

  async function createOrders() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const orders = await onCreateOrders(adjusted);
      setMessage(`Đã tạo ${orders.length} đơn nháp theo nhà cung cấp.`);
      setConfirmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo đơn.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Kế hoạch nhập"
        subtitle="Dự báo nhu cầu, chỉnh số lượng và tạo đơn đặt hàng."
        context={data.settings.storeName}
      />

      <div className="plan-controls">
        <label className="field">
          <span>Xem nhu cầu của</span>
          <select
            value={selectedIngredient}
            onChange={(event) => setSelectedIngredient(event.target.value)}
          >
            {data.inventory.map((item) => (
              <option value={item.ingredient} key={item.ingredient}>
                {item.ingredient}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="segmented">
          <legend>Mức dự phòng</legend>
          <div>
            {strategies.map((item) => (
              <button
                className={strategy === item ? "active" : ""}
                key={item}
                onClick={() => onStrategyChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {forecast ? (
        <>
          <div className="metric-grid">
            <Metric
              label="Nhu cầu thấp · P25"
              value={formatQuantity(forecast.totals.p25, forecast.unit)}
              note="7 ngày tới"
              tone="blue"
            />
            <Metric
              label="Trung vị · P50"
              value={formatQuantity(forecast.totals.p50, forecast.unit)}
              note="Mức cho kế hoạch cân bằng"
            />
            <Metric
              label="Nhu cầu cao · P75"
              value={formatQuantity(forecast.totals.p75, forecast.unit)}
              note="7 ngày tới"
              tone="amber"
            />
          </div>
          <Details summary="Xem đường dự báo và nguyên nhân">
            <div className="detail-grid">
              <ForecastChart forecast={forecast} compact />
              <div className="explain-panel">
                <span>Các yếu tố chính</span>
                <ul>
                  {forecast.drivers.map((driver) => (
                    <li key={driver}>{driver}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Details>
        </>
      ) : null}

      <p className="strategy-note">{strategyNotes[strategy]}</p>
      <SectionHeading
        title="Số lượng nhập"
        subtitle="Sửa trực tiếp ở cột số lượng nhập."
      />
      <div className="table-wrap plan-table">
        <table>
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              <th>Trạng thái</th>
              <th>Tồn</th>
              <th>Nhu cầu</th>
              <th>Đề xuất</th>
              <th>Số lượng nhập</th>
              <th>Nhà cung cấp</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.map((row) => (
              <tr key={row.ingredient}>
                <td>
                  <strong>{row.ingredient}</strong>
                  <small>{row.unit}</small>
                </td>
                <td>
                  <StatusPill status={row.statusKey} label={row.status} />
                </td>
                <td>{formatQuantity(row.onHand)}</td>
                <td>{formatQuantity(row.forecastDemand)}</td>
                <td>{formatQuantity(row.recommendedQty)}</td>
                <td>
                  <input
                    className="quantity-input"
                    type="number"
                    min="0"
                    step={row.packSize}
                    value={row.orderQty}
                    aria-label={`Số lượng nhập ${row.ingredient}`}
                    onChange={(event) => {
                      const next = Math.max(0, Number(event.target.value));
                      setAdjusted((current) =>
                        current.map((item) =>
                          item.ingredient === row.ingredient
                            ? {
                                ...item,
                                orderQty: next,
                                cost: next * item.unitCost,
                              }
                            : item,
                        ),
                      );
                      setConfirmed(false);
                      setMessage("");
                    }}
                  />
                </td>
                <td>{row.supplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="metric-grid">
        <Metric
          label="Tổng chi"
          value={formatVnd(total)}
          note={`${adjusted.filter((item) => item.orderQty > 0).length} nguyên liệu · ${activeSuppliers} nhà cung cấp`}
        />
        <Metric
          label="Ngân sách còn"
          value={formatVnd(budgetAfter)}
          note={budgetAfter >= 0 ? "Sau khi đặt hàng" : "Đang vượt mức"}
          tone={budgetAfter >= 0 ? "pine" : "red"}
        />
        <Metric
          label="Cảnh báo"
          value={warnings.length}
          note="Theo số lượng đang chọn"
          tone={warnings.length ? "amber" : "pine"}
        />
      </div>

      {budgetAfter < 0 ? (
        <Notice tone="error">
          Kế hoạch đang vượt ngân sách {formatVnd(Math.abs(budgetAfter))}.
        </Notice>
      ) : warnings.length > 0 ? (
        <Details summary={`Xem ${warnings.length} cảnh báo`} open>
          <ul className="warning-list">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Details>
      ) : (
        <Notice tone="success">
          Số lượng đáp ứng nhu cầu, MOQ và quy cách đóng gói.
        </Notice>
      )}

      <Details summary="Xem cách tính">
        <div className="calculation-list">
          {adjusted
            .filter((item) => item.recommendedQty > 0)
            .map((item) => (
              <div key={item.ingredient}>
                <strong>
                  {item.ingredient} ·{" "}
                  {formatQuantity(item.recommendedQty, item.unit)}
                </strong>
                <span>
                  Nhu cầu {formatQuantity(item.forecastDemand, item.unit)} · tồn
                  dùng được {formatQuantity(item.usableStock, item.unit)} · tồn
                  an toàn {formatQuantity(item.safetyStock, item.unit)}
                </span>
                <small>{item.reason}</small>
              </div>
            ))}
        </div>
      </Details>

      <SectionHeading
        title="Đơn đặt hàng"
        subtitle="Một đơn nháp cho mỗi nhà cung cấp."
      />
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="confirm-row">
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Tôi đã kiểm tra số lượng và ngân sách.</span>
        </label>
        <Button
          variant="primary"
          busy={busy}
          disabled={!confirmed || total <= 0 || budgetAfter < 0}
          onClick={() => void createOrders()}
        >
          <ShieldCheck size={16} />
          Lưu đơn nháp
        </Button>
      </div>

      {draftOrders.length > 0 ? (
        <section className="order-preview">
          <div className="order-select-row">
            <label className="field">
              <span>Đơn gần nhất</span>
              <select
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
              >
                {[...draftOrders].reverse().map((order) => (
                  <option value={order.poId} key={order.poId}>
                    {order.poId} · {order.supplier} · {order.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedOrder ? (
            <>
              <div className="order-heading">
                <div>
                  <span>{selectedOrder.status}</span>
                  <h3>{selectedOrder.poId}</h3>
                  <p>
                    {selectedOrder.supplier} · giao{" "}
                    {formatDate(selectedOrder.deliveryDate)}
                  </p>
                </div>
                <strong>{formatVnd(selectedOrder.total)}</strong>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nguyên liệu</th>
                      <th>Số lượng</th>
                      <th>Đơn giá</th>
                      <th>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lines.map((line) => (
                      <tr key={line.ingredient}>
                        <td>{line.ingredient}</td>
                        <td>{formatQuantity(line.orderQty, line.unit)}</td>
                        <td>{formatVnd(line.unitCost)}</td>
                        <td>{formatVnd(line.orderQty * line.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="order-actions">
                <Button
                  onClick={() =>
                    void downloadOrder(selectedOrder, "xlsx").catch(() =>
                      setError("Không thể xuất Excel."),
                    )
                  }
                >
                  <FileSpreadsheet size={16} />
                  Xuất Excel
                </Button>
                <Button
                  onClick={() =>
                    void downloadOrder(selectedOrder, "pdf").catch(() =>
                      setError("Không thể xuất PDF."),
                    )
                  }
                >
                  <Download size={16} />
                  Xuất PDF
                </Button>
                <Button
                  variant="primary"
                  busy={marking}
                  disabled={selectedOrder.status === "Đã đặt hàng"}
                  onClick={() => {
                    void (async () => {
                      setMarking(true);
                      setError("");
                      try {
                        await onMarkOrdered(selectedOrder.poId);
                      } catch (caught) {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : "Không thể xác nhận đơn.",
                        );
                      } finally {
                        setMarking(false);
                      }
                    })();
                  }}
                >
                  <Check size={16} />
                  Đánh dấu đã đặt
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

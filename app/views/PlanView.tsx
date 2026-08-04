"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  Check,
  Download,
  FileSpreadsheet,
  PackageCheck,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BootstrapData,
  CoreStrategy,
  ForecastResult,
  IngredientDemandResult,
  PlanResponse,
  PlanningScenario,
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

interface StrategyOption {
  label: Strategy;
  core: CoreStrategy;
  note: string;
}

const strategyOptions: StrategyOption[] = [
  {
    label: "Tiết kiệm",
    core: "lean",
    note: "Kịch bản P25, ưu tiên mức tồn gọn hơn.",
  },
  {
    label: "Cân bằng",
    core: "balanced",
    note: "Kịch bản P50, cân bằng thiếu hàng, hao hụt và chi phí.",
  },
  {
    label: "An toàn",
    core: "protected",
    note: "Kịch bản P75, giữ mức dự phòng cao hơn.",
  },
];

const orderStatusLabels: Record<PurchaseOrder["status"], string> = {
  draft: "Đơn nháp",
  ordered: "Đã xác nhận",
  partially_received: "Đã nhận một phần",
  received: "Đã nhận đủ",
};

interface ReceiveLotDraft {
  id: string;
  quantity: string;
  expiryDate: string;
  supplierLotCode: string;
}

export interface ReceiveOrderInput {
  receivedAt: string;
  deliveryReference?: string;
  lines: Array<{
    poLineId: string;
    lots: Array<{
      quantity: number;
      expiryDate?: string;
      supplierLotCode?: string;
    }>;
  }>;
}

function clampHorizon(value: number): number {
  if (!Number.isFinite(value)) return 7;
  return Math.min(7, Math.max(1, Math.round(value)));
}

function strategyOption(strategy: Strategy): StrategyOption {
  return (
    strategyOptions.find((option) => option.label === strategy) ??
    strategyOptions[1]
  );
}

function forecastLabel(key: string, forecast: ForecastResult): string {
  return forecast.product || forecast.ingredient || key;
}

function demandLabel(demand: IngredientDemandResult): string {
  return demand.ingredient || demand.ingredientId;
}

function dateTimeLabel(value: string | undefined, timeZone?: string): string {
  if (!value) return "Chưa có thời gian snapshot";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timeZone || "Asia/Ho_Chi_Minh",
  }).format(instant);
}

function percentageLabel(value: number): string {
  const percentage = value >= 0 && value <= 1 ? value * 100 : value;
  return `${percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function currentLocalDateTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function lineKey(line: Recommendation, index: number): string {
  return (
    line.poLineId ||
    line.recommendationId ||
    line.ingredientId ||
    `${line.ingredient}-${index}`
  );
}

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

function ScenarioCard({
  option,
  scenario,
  active,
  recommended,
  onSelect,
}: {
  option: StrategyOption;
  scenario?: PlanningScenario;
  active: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const feasible = scenario?.feasible;
  return (
    <article className={`metric ${active ? "metric-blue" : ""}`}>
      <div className="metric-label">
        <span>
          {option.label}
          {recommended ? " · Backend đề xuất" : ""}
        </span>
        <i />
      </div>
      <strong>{scenario ? formatVnd(scenario.cost) : "Chưa có kết quả"}</strong>
      <small>
        {scenario
          ? `${feasible ? "Khả thi" : "Không khả thi"} · fill rate ${percentageLabel(scenario.fillRate)}`
          : "Chạy lại kế hoạch để lấy kịch bản này."}
      </small>
      {scenario ? (
        <small>
          Thiếu {formatQuantity(scenario.shortage)} · hao hụt{" "}
          {formatQuantity(scenario.waste)} · {scenario.warnings.length} cảnh báo
        </small>
      ) : null}
      <Button
        variant={active ? "primary" : "quiet"}
        disabled={!scenario || active}
        onClick={onSelect}
      >
        {active ? "Đang xem" : "Xem kịch bản"}
      </Button>
    </article>
  );
}

export function PlanView({
  data,
  plan,
  strategy,
  initialIngredient,
  draftOrders,
  onRunPlanning,
  onTrainModel,
  onStrategyChange,
  onCreateOrders,
  onUpdateOrder,
  onConfirmOrder,
  onReceiveOrder,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  strategy: Strategy;
  initialIngredient?: string;
  draftOrders: PurchaseOrder[];
  onRunPlanning: (horizonDays: number) => Promise<void>;
  onTrainModel?: (modelVersion: string, historyDays: number) => Promise<void>;
  onStrategyChange: (strategy: Strategy) => void;
  onCreateOrders: (
    recommendations: Recommendation[],
  ) => Promise<PurchaseOrder[]>;
  onUpdateOrder: (
    poId: string,
    lineUpdates: Array<{ poLineId: string; orderQuantity: number }>,
  ) => Promise<void>;
  onConfirmOrder: (poId: string) => Promise<void>;
  onReceiveOrder: (poId: string, input: ReceiveOrderInput) => Promise<void>;
}) {
  const [horizonDays, setHorizonDays] = useState(
    clampHorizon(plan.horizonDays ?? data.settings.forecastHorizon),
  );
  const [runBusy, setRunBusy] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [modelVersion, setModelVersion] = useState("");
  const [historyDays, setHistoryDays] = useState(365);
  const [selectedForecastKey, setSelectedForecastKey] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState(
    initialIngredient || "",
  );
  const [adjusted, setAdjusted] = useState<Recommendation[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(
    draftOrders.at(-1)?.poId ?? "",
  );
  const [draftQuantities, setDraftQuantities] = useState<
    Record<string, string>
  >({});
  const [receivedAt, setReceivedAt] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [receiveLots, setReceiveLots] = useState<
    Record<string, ReceiveLotDraft[]>
  >({});

  const selectedCoreStrategy = strategyOption(strategy).core;
  const selectedScenario = plan.scenarios.find(
    (scenario) => scenario.strategy === selectedCoreStrategy,
  );
  const selectedRecommendations =
    selectedScenario?.recommendations ?? plan.recommendations;
  const forecastEntries = useMemo(
    () => Object.entries(plan.forecasts),
    [plan.forecasts],
  );
  const demandEntries = useMemo(
    () => Object.entries(plan.ingredientDemand),
    [plan.ingredientDemand],
  );

  useEffect(() => {
    if (plan.horizonDays) setHorizonDays(clampHorizon(plan.horizonDays));
  }, [plan.horizonDays]);

  useEffect(() => {
    setAdjusted(selectedRecommendations.map((row) => ({ ...row })));
    setConfirmed(false);
    setMessage("");
  }, [selectedRecommendations]);

  useEffect(() => {
    setSelectedForecastKey((current) =>
      forecastEntries.some(([key]) => key === current)
        ? current
        : forecastEntries[0]?.[0] ?? "",
    );
  }, [forecastEntries]);

  useEffect(() => {
    setSelectedIngredient((current) => {
      const requested = initialIngredient || current;
      const matching = demandEntries.find(
        ([key, value]) =>
          key === requested ||
          value.ingredientId === requested ||
          value.ingredient === requested,
      );
      return matching?.[0] ?? demandEntries[0]?.[0] ?? "";
    });
  }, [demandEntries, initialIngredient]);

  useEffect(() => {
    if (draftOrders.length === 0) {
      setSelectedOrderId("");
      return;
    }
    setSelectedOrderId((current) =>
      draftOrders.some((order) => order.poId === current)
        ? current
        : draftOrders.at(-1)?.poId ?? "",
    );
  }, [draftOrders]);

  const forecast = plan.forecasts[selectedForecastKey];
  const selectedDemand = plan.ingredientDemand[selectedIngredient];
  const selectedOrder = draftOrders.find(
    (order) => order.poId === selectedOrderId,
  );
  const eligibleRecommendations = adjusted.filter(
    (row) => row.orderQty > 0 && Boolean(row.supplierId),
  );
  const invalidRecommendationCount = adjusted.filter(
    (row) => row.orderQty > 0 && !row.supplierId,
  ).length;
  const forecastWarnings = useMemo(
    () =>
      Array.from(
        new Set(
          (forecast?.forecast ?? []).flatMap((point) => point.warnings ?? []),
        ),
      ),
    [forecast],
  );

  useEffect(() => {
    if (!selectedOrder) {
      setDraftQuantities({});
      setReceiveLots({});
      return;
    }
    setDraftQuantities(
      Object.fromEntries(
        selectedOrder.lines.map((line, index) => [
          lineKey(line, index),
          String(line.orderQty),
        ]),
      ),
    );
    setReceiveLots(
      Object.fromEntries(
        selectedOrder.lines
          .filter((line) => Boolean(line.poLineId))
          .map((line, index) => {
            const key = lineKey(line, index);
            return [
              key,
              [
                {
                  id: `${key}-lot-0`,
                  quantity: "",
                  expiryDate: "",
                  supplierLotCode: "",
                },
              ],
            ];
          }),
      ),
    );
    setReceivedAt(currentLocalDateTime());
    setDeliveryReference("");
  }, [selectedOrder]);

  async function runPlanning() {
    setRunBusy(true);
    setMessage("");
    setError("");
    try {
      await onRunPlanning(horizonDays);
      setMessage("Đã cập nhật snapshot forecast, nhu cầu và ba kịch bản.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể chạy quy trình lập kế hoạch.",
      );
    } finally {
      setRunBusy(false);
    }
  }

  async function trainModel() {
    if (!onTrainModel || !modelVersion.trim()) return;
    setTrainingBusy(true);
    setMessage("");
    setError("");
    try {
      await onTrainModel(modelVersion.trim(), historyDays);
      setMessage("Model đã sẵn sàng. Hãy bấm Chạy lại kế hoạch.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể train model.",
      );
    } finally {
      setTrainingBusy(false);
    }
  }

  async function createOrders() {
    setActionBusy("create");
    setMessage("");
    setError("");
    try {
      const orders = await onCreateOrders(eligibleRecommendations);
      setMessage(`Đã tạo ${orders.length} đơn nháp theo nhà cung cấp.`);
      setConfirmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo đơn.");
    } finally {
      setActionBusy("");
    }
  }

  async function updateDraftOrder() {
    if (!selectedOrder || selectedOrder.status !== "draft") return;
    const lineUpdates = selectedOrder.lines.flatMap((line, index) => {
      if (!line.poLineId) return [];
      const quantity = Number(draftQuantities[lineKey(line, index)]);
      return Number.isFinite(quantity) && quantity > 0
        ? [{ poLineId: line.poLineId, orderQuantity: quantity }]
        : [];
    });
    if (lineUpdates.length === 0) {
      setError("Nhập số lượng lớn hơn 0 cho ít nhất một dòng có po_line_id.");
      return;
    }
    setActionBusy("update");
    setMessage("");
    setError("");
    try {
      await onUpdateOrder(selectedOrder.poId, lineUpdates);
      setMessage("Đã lưu số lượng trên đơn nháp từ phản hồi backend.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể sửa đơn nháp.",
      );
    } finally {
      setActionBusy("");
    }
  }

  async function confirmOrder() {
    if (!selectedOrder || selectedOrder.status !== "draft") return;
    setActionBusy("confirm");
    setMessage("");
    setError("");
    try {
      await onConfirmOrder(selectedOrder.poId);
      setMessage("Đơn đã được xác nhận và ngân sách đã được giữ chỗ.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể xác nhận đơn. Đơn nháp vẫn được giữ lại.",
      );
    } finally {
      setActionBusy("");
    }
  }

  function updateReceiveLot(
    key: string,
    lotId: string,
    patch: Partial<Omit<ReceiveLotDraft, "id">>,
  ) {
    setReceiveLots((current) => ({
      ...current,
      [key]: (current[key] ?? []).map((lot) =>
        lot.id === lotId ? { ...lot, ...patch } : lot,
      ),
    }));
  }

  function addReceiveLot(key: string) {
    setReceiveLots((current) => ({
      ...current,
      [key]: [
        ...(current[key] ?? []),
        {
          id: `${key}-lot-${Date.now()}`,
          quantity: "",
          expiryDate: "",
          supplierLotCode: "",
        },
      ],
    }));
  }

  function removeReceiveLot(key: string, lotId: string) {
    setReceiveLots((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((lot) => lot.id !== lotId),
    }));
  }

  async function receiveOrder() {
    if (
      !selectedOrder ||
      !["ordered", "partially_received"].includes(selectedOrder.status)
    ) {
      return;
    }

    const lines = selectedOrder.lines.flatMap((line, index) => {
      if (!line.poLineId) return [];
      const lots = (receiveLots[lineKey(line, index)] ?? []).flatMap((lot) => {
        const quantity = Number(lot.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return [];
        return [
          {
            quantity,
            ...(lot.expiryDate ? { expiryDate: lot.expiryDate } : {}),
            ...(lot.supplierLotCode
              ? { supplierLotCode: lot.supplierLotCode }
              : {}),
          },
        ];
      });
      return lots.length > 0 ? [{ poLineId: line.poLineId, lots }] : [];
    });

    if (!receivedAt || lines.length === 0) {
      setError("Chọn thời gian nhận và nhập ít nhất một lot có số lượng lớn hơn 0.");
      return;
    }

    const receivedInstant = new Date(receivedAt);
    if (Number.isNaN(receivedInstant.getTime())) {
      setError("Thời gian nhận hàng không hợp lệ.");
      return;
    }

    setActionBusy("receive");
    setMessage("");
    setError("");
    try {
      await onReceiveOrder(selectedOrder.poId, {
        receivedAt: receivedInstant.toISOString(),
        ...(deliveryReference.trim()
          ? { deliveryReference: deliveryReference.trim() }
          : {}),
        lines,
      });
      setMessage("Đã ghi nhận các lot vừa nhận và cập nhật trạng thái đơn.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể nhận hàng.",
      );
    } finally {
      setActionBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Kế hoạch nhập"
        subtitle="Forecast sản phẩm → nhu cầu nguyên liệu → ba kịch bản mô phỏng → đơn đặt hàng."
        context={data.settings.storeName}
        action={
          <Button
            variant="primary"
            busy={runBusy || plan.status === "running"}
            onClick={() => void runPlanning()}
          >
            <Play size={16} />
            Chạy lại kế hoạch
          </Button>
        }
      />

      <div className="plan-controls">
        <label className="field">
          <span>Horizon forecast (1–7 ngày)</span>
          <input
            type="number"
            min="1"
            max="7"
            step="1"
            value={horizonDays}
            onChange={(event) =>
              setHorizonDays(clampHorizon(Number(event.target.value)))
            }
          />
        </label>
        <fieldset className="segmented">
          <legend>Snapshot workflow</legend>
          <div>
            <button className={plan.status === "idle" ? "active" : ""}>
              Chưa chạy
            </button>
            <button className={plan.status === "running" ? "active" : ""}>
              Đang chạy
            </button>
            <button className={plan.status === "completed" ? "active" : ""}>
              Hoàn tất
            </button>
          </div>
        </fieldset>
      </div>

      {plan.status === "idle" ? (
        <Notice tone="info">
          Chọn horizon rồi chạy workflow để lấy kết quả đã persist từ backend.
        </Notice>
      ) : null}
      {plan.status === "running" ? (
        <Notice tone="info">
          Backend đang tạo forecast, ingredient demand và procurement plan.
        </Notice>
      ) : null}
      {plan.status === "blocked" ? (
        <>
          <Notice tone="warning">
            {plan.failureCode === "MODEL_NOT_READY"
              ? "Model chưa sẵn sàng. Admin có thể train model rồi chạy một forecast mới."
              : plan.failureMessage || "Workflow đang bị chặn."}
            {plan.failureCode ? ` (${plan.failureCode})` : ""}
          </Notice>
          {plan.failureCode === "MODEL_NOT_READY" && onTrainModel ? (
            <Details summary="Thao tác quản trị · train forecast model">
              <Notice tone="warning">
                Training chạy đồng bộ và có thể lâu. Chỉ thực hiện khi bạn có
                quyền quản trị và đủ ít nhất 140 target dates lịch sử.
              </Notice>
              <div className="two-column compact-gap">
                <label className="field">
                  <span>Model version mới</span>
                  <input
                    value={modelVersion}
                    onChange={(event) => setModelVersion(event.target.value)}
                    placeholder="forecast-core-v..."
                  />
                </label>
                <label className="field">
                  <span>History days</span>
                  <input
                    type="number"
                    min="140"
                    value={historyDays}
                    onChange={(event) =>
                      setHistoryDays(
                        Math.max(140, Math.round(Number(event.target.value) || 140)),
                      )
                    }
                  />
                </label>
              </div>
              <Button
                busy={trainingBusy}
                disabled={!modelVersion.trim()}
                onClick={() => void trainModel()}
              >
                Train model (quản trị)
              </Button>
            </Details>
          ) : null}
        </>
      ) : null}
      {plan.status === "failed" ? (
        <Notice tone="error">
          {plan.failureMessage || "Workflow lập kế hoạch thất bại."}
          {plan.failureCode ? ` (${plan.failureCode})` : ""}
        </Notice>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {plan.status === "completed" ? (
        <Notice tone="warning">
          Đây là snapshot hoàn tất lúc{" "}
          {dateTimeLabel(plan.completedAt || plan.createdAt, data.settings.timezone)}
          {plan.cutoffDate ? `, cutoff ${formatDate(plan.cutoffDate)}` : ""}. Nếu
          inventory, recipe hoặc settings đã đổi, hãy chạy lại trước khi tạo đơn.
        </Notice>
      ) : null}

      {plan.warnings?.length ? (
        <Details summary={`Cảnh báo toàn workflow (${plan.warnings.length})`}>
          <ul className="warning-list">
            {plan.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </Details>
      ) : null}

      {forecastEntries.length > 0 ? (
        <>
          <SectionHeading
            title="Forecast sản phẩm"
            subtitle="Hiển thị predictions đã persist; bộ lọc này không thay đổi scope planning."
            action={
              <label className="field">
                <span>Sản phẩm hiển thị</span>
                <select
                  value={selectedForecastKey}
                  onChange={(event) =>
                    setSelectedForecastKey(event.target.value)
                  }
                >
                  {forecastEntries.map(([key, item]) => (
                    <option value={key} key={key}>
                      {forecastLabel(key, item)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          {forecast ? (
            <>
              <div className="metric-grid">
                <Metric
                  label="P25"
                  value={formatQuantity(forecast.totals.p25, forecast.unit)}
                  note={`${plan.horizonDays ?? horizonDays} ngày · persisted`}
                  tone="blue"
                />
                <Metric
                  label="P50"
                  value={formatQuantity(forecast.totals.p50, forecast.unit)}
                  note="Trung vị từ backend"
                />
                <Metric
                  label="P75"
                  value={formatQuantity(forecast.totals.p75, forecast.unit)}
                  note="Không dùng thay interval calibration"
                  tone="amber"
                />
              </div>
              {forecastWarnings.length > 0 ? (
                <div aria-label="Cảnh báo forecast">
                  {forecastWarnings.map((warning) => (
                    <span
                      className="status-pill status-expiring"
                      key={warning}
                      title={warning}
                    >
                      {warning}
                    </span>
                  ))}
                </div>
              ) : null}
              <Details summary="Xem chart và interval calibration" open>
                <div className="detail-grid">
                  <ForecastChart forecast={forecast} compact />
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Ngày</th>
                          <th>P50</th>
                          <th>Interval dưới</th>
                          <th>Interval trên</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.forecast.map((point) => (
                          <tr key={point.date}>
                            <td>{formatDate(point.date)}</td>
                            <td>{formatQuantity(point.p50 ?? 0)}</td>
                            <td>
                              {point.intervalLower == null
                                ? "—"
                                : formatQuantity(point.intervalLower)}
                            </td>
                            <td>
                              {point.intervalUpper == null
                                ? "—"
                                : formatQuantity(point.intervalUpper)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Details>
            </>
          ) : null}
        </>
      ) : null}

      {demandEntries.length > 0 ? (
        <>
          <SectionHeading
            title="Nhu cầu nguyên liệu"
            subtitle="BOM theo quantile cùng contributions từ từng sản phẩm."
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>P25</th>
                  <th>P50</th>
                  <th>P75</th>
                  <th>Contributions</th>
                  <th>Cảnh báo</th>
                </tr>
              </thead>
              <tbody>
                {demandEntries.map(([key, demand]) => (
                  <tr
                    key={key}
                    className={selectedIngredient === key ? "selected" : ""}
                    onClick={() => setSelectedIngredient(key)}
                  >
                    <td>
                      <strong>{demandLabel(demand)}</strong>
                      <small>{demand.unit}</small>
                    </td>
                    <td>{formatQuantity(demand.totals.p25, demand.unit)}</td>
                    <td>{formatQuantity(demand.totals.p50, demand.unit)}</td>
                    <td>{formatQuantity(demand.totals.p75, demand.unit)}</td>
                    <td>{demand.contributions.length}</td>
                    <td>{demand.warnings.length || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedDemand ? (
            <Details
              summary={`Contribution drill-down · ${demandLabel(selectedDemand)}`}
              open
            >
              {selectedDemand.contributions.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>P25</th>
                        <th>P50</th>
                        <th>P75</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDemand.contributions.map(
                        (contribution, index) => (
                          <tr
                            key={`${contribution.productId || contribution.product}-${index}`}
                          >
                            <td>{contribution.product}</td>
                            <td>{formatQuantity(contribution.p25)}</td>
                            <td>{formatQuantity(contribution.p50)}</td>
                            <td>{formatQuantity(contribution.p75)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Notice tone="warning">
                  Backend không trả contribution cho nguyên liệu này. Không suy
                  diễn thành “không có nhu cầu”.
                </Notice>
              )}
            </Details>
          ) : null}
        </>
      ) : null}

      <SectionHeading
        title="So sánh ba kịch bản"
        subtitle="Chuyển kịch bản chỉ chọn kết quả đã có; không tạo run mới."
      />
      <div className="metric-grid">
        {strategyOptions.map((option) => (
          <ScenarioCard
            key={option.core}
            option={option}
            scenario={plan.scenarios.find(
              (scenario) => scenario.strategy === option.core,
            )}
            active={strategy === option.label}
            recommended={plan.recommendedStrategy === option.core}
            onSelect={() => onStrategyChange(option.label)}
          />
        ))}
      </div>
      <p className="strategy-note">{strategyOption(strategy).note}</p>

      {selectedScenario && !selectedScenario.feasible ? (
        <Notice tone="warning">
          Kịch bản này không khả thi. Bạn vẫn có thể tạo Draft từ các line hợp
          lệ để chỉnh; backend chỉ enforce remaining budget khi confirm.
        </Notice>
      ) : null}
      {selectedScenario?.violations.length ? (
        <Details
          summary={`Violation (${selectedScenario.violations.length})`}
          open
        >
          <ul className="warning-list">
            {selectedScenario.violations.map((violation, index) => (
              <li key={`${violation}-${index}`}>{violation}</li>
            ))}
          </ul>
        </Details>
      ) : null}

      <SectionHeading
        title="Line của kịch bản"
        subtitle="Line thiếu supplier hoặc có quantity 0 vẫn được giữ lại để xử lý constraint."
      />
      <div className="table-wrap plan-table">
        <table>
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              <th>Trạng thái</th>
              <th>Raw required</th>
              <th>Đề xuất</th>
              <th>Số lượng Draft</th>
              <th>Nhà cung cấp</th>
              <th>ETA</th>
              <th>Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.length > 0 ? (
              adjusted.map((row, index) => (
                <tr key={lineKey(row, index)}>
                  <td>
                    <strong>{row.ingredient}</strong>
                    <small>{row.unit}</small>
                  </td>
                  <td>
                    <StatusPill status={row.statusKey} label={row.status} />
                  </td>
                  <td>
                    {formatQuantity(
                      row.rawRequiredQuantity ?? row.forecastDemand,
                      row.unit,
                    )}
                  </td>
                  <td>{formatQuantity(row.recommendedQty, row.unit)}</td>
                  <td>
                    <input
                      className="quantity-input"
                      type="number"
                      min="0"
                      step={row.packSize || 1}
                      value={row.orderQty}
                      aria-label={`Số lượng Draft ${row.ingredient}`}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setAdjusted((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  orderQty: Number.isFinite(next)
                                    ? Math.max(0, next)
                                    : 0,
                                }
                              : item,
                          ),
                        );
                        setConfirmed(false);
                      }}
                    />
                    <small>
                      MOQ {formatQuantity(row.moq)} · pack{" "}
                      {formatQuantity(row.packSize)}
                    </small>
                  </td>
                  <td>
                    {row.supplierId ? row.supplier || row.supplierId : "Thiếu supplier"}
                  </td>
                  <td>
                    {row.expectedArrivalDate
                      ? formatDate(row.expectedArrivalDate)
                      : "—"}
                  </td>
                  <td>
                    {[...(row.reasonCodes ?? []), ...(row.warnings ?? [])].join(
                      ", ",
                    ) || "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="table-empty">
                  Chưa có line từ procurement plan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="metric-grid">
        <Metric
          label="Chi phí kịch bản"
          value={
            selectedScenario ? formatVnd(selectedScenario.cost) : "Chưa có"
          }
          note="Giá trị persist từ core planning"
        />
        <Metric
          label="Line đủ điều kiện"
          value={eligibleRecommendations.length}
          note="Có supplier và quantity > 0"
          tone="pine"
        />
        <Metric
          label="Line bị loại khỏi Draft"
          value={invalidRecommendationCount}
          note="Không tự bịa supplier/recommendation ID"
          tone={invalidRecommendationCount ? "amber" : "pine"}
        />
      </div>

      <SectionHeading
        title="Đơn đặt hàng"
        subtitle="Bridge legacy chỉ chạy ngay trước khi tạo Draft; có thể trả nhiều đơn."
      />
      <div className="confirm-row">
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Tôi đã kiểm tra snapshot, line bị loại và cảnh báo khả thi/ngân sách.
          </span>
        </label>
        <Button
          variant="primary"
          busy={actionBusy === "create"}
          disabled={
            plan.status !== "completed" ||
            !confirmed ||
            eligibleRecommendations.length === 0
          }
          onClick={() => void createOrders()}
        >
          <ShieldCheck size={16} />
          Tạo đơn nháp
        </Button>
      </div>

      {draftOrders.length > 0 ? (
        <section className="order-preview">
          <div className="order-select-row">
            <label className="field">
              <span>Đơn đặt hàng</span>
              <select
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
              >
                {[...draftOrders].reverse().map((order) => (
                  <option value={order.poId} key={order.poId}>
                    {order.poId} · {order.supplier} ·{" "}
                    {orderStatusLabels[order.status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedOrder ? (
            <>
              <div className="order-heading">
                <div>
                  <span>{orderStatusLabels[selectedOrder.status]}</span>
                  <h3>{selectedOrder.poId}</h3>
                  <p>
                    {selectedOrder.supplier} · giao{" "}
                    {formatDate(selectedOrder.deliveryDate)} · version{" "}
                    {selectedOrder.version ?? "—"}
                  </p>
                </div>
                <strong>{formatVnd(selectedOrder.total)}</strong>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>po_line_id</th>
                      <th>Nguyên liệu</th>
                      <th>Số lượng đặt</th>
                      <th>Đã nhận</th>
                      <th>Còn lại</th>
                      <th>Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lines.map((line, index) => {
                      const key = lineKey(line, index);
                      return (
                        <tr key={key}>
                          <td>{line.poLineId || "Thiếu po_line_id"}</td>
                          <td>
                            <strong>{line.ingredient}</strong>
                            <small>{line.unit}</small>
                          </td>
                          <td>
                            {selectedOrder.status === "draft" && line.poLineId ? (
                              <input
                                className="quantity-input"
                                type="number"
                                min="0"
                                step={line.packSize || 1}
                                value={draftQuantities[key] ?? ""}
                                aria-label={`Số lượng đặt ${line.ingredient}`}
                                onChange={(event) =>
                                  setDraftQuantities((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                              />
                            ) : (
                              formatQuantity(line.orderQty, line.unit)
                            )}
                          </td>
                          <td>
                            {formatQuantity(
                              line.receivedQuantity ?? 0,
                              line.unit,
                            )}
                          </td>
                          <td>
                            {line.remainingQuantity == null
                              ? "—"
                              : formatQuantity(line.remainingQuantity, line.unit)}
                          </td>
                          <td>{formatVnd(line.unitCost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedOrder.status === "draft" ? (
                <Notice tone="info">
                  Chỉ Draft được sửa. Backend sẽ validate MOQ, pack size, version
                  và trả lại toàn bộ PO mới.
                </Notice>
              ) : null}

              {["ordered", "partially_received"].includes(
                selectedOrder.status,
              ) ? (
                <Details summary="Ghi nhận nhận hàng theo lot" open>
                  <div className="two-column compact-gap">
                    <label className="field">
                      <span>Thời gian nhận</span>
                      <input
                        type="datetime-local"
                        value={receivedAt}
                        onChange={(event) => setReceivedAt(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Mã phiếu giao hàng</span>
                      <input
                        value={deliveryReference}
                        onChange={(event) =>
                          setDeliveryReference(event.target.value)
                        }
                        placeholder="DELIVERY-..."
                      />
                    </label>
                  </div>

                  {selectedOrder.lines.map((line, lineIndex) => {
                    if (!line.poLineId) return null;
                    const key = lineKey(line, lineIndex);
                    return (
                      <div className="panel compact-gap" key={key}>
                        <strong>
                          {line.ingredient} · po_line_id {line.poLineId}
                        </strong>
                        <small>
                          Còn lại từ backend:{" "}
                          {line.remainingQuantity == null
                            ? "—"
                            : formatQuantity(line.remainingQuantity, line.unit)}
                        </small>
                        {(receiveLots[key] ?? []).map((lot, lotIndex) => (
                          <div
                            className="calculation-list compact-gap"
                            key={lot.id}
                          >
                            <label className="field">
                              <span>Số lượng lot {lotIndex + 1}</span>
                              <input
                                type="number"
                                min="0"
                                value={lot.quantity}
                                onChange={(event) =>
                                  updateReceiveLot(key, lot.id, {
                                    quantity: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Hạn dùng</span>
                              <input
                                type="date"
                                value={lot.expiryDate}
                                onChange={(event) =>
                                  updateReceiveLot(key, lot.id, {
                                    expiryDate: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Mã lot nhà cung cấp</span>
                              <input
                                value={lot.supplierLotCode}
                                onChange={(event) =>
                                  updateReceiveLot(key, lot.id, {
                                    supplierLotCode: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <Button
                              variant="quiet"
                              disabled={(receiveLots[key] ?? []).length === 1}
                              onClick={() => removeReceiveLot(key, lot.id)}
                            >
                              <Trash2 size={15} />
                              Bỏ lot
                            </Button>
                          </div>
                        ))}
                        <Button variant="quiet" onClick={() => addReceiveLot(key)}>
                          <Plus size={15} />
                          Thêm lot
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    variant="primary"
                    busy={actionBusy === "receive"}
                    onClick={() => void receiveOrder()}
                  >
                    <PackageCheck size={16} />
                    Ghi nhận hàng đã nhận
                  </Button>
                </Details>
              ) : null}

              {selectedOrder.status === "received" ? (
                <Notice tone="success">
                  Đơn đã nhận đủ và chỉ còn ở chế độ đọc.
                </Notice>
              ) : null}

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
                {selectedOrder.status === "draft" ? (
                  <>
                    <Button
                      busy={actionBusy === "update"}
                      onClick={() => void updateDraftOrder()}
                    >
                      <Save size={16} />
                      Lưu số lượng
                    </Button>
                    <Button
                      variant="primary"
                      busy={actionBusy === "confirm"}
                      onClick={() => void confirmOrder()}
                    >
                      <Check size={16} />
                      Xác nhận đặt hàng
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

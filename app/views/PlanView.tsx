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
  DecisionPackage,
  PlanningScenario,
  PurchaseOrder,
  Recommendation,
  Strategy,
} from "../../lib/types";
import { ForecastChart } from "../components/ForecastChart";
import { DecisionCenter } from "../components/DecisionCenter";
import {
  ProcurementDecisionWorkspace,
  ProcurementLoadingWorkspace,
  noFeasibleDecision,
} from "../components/ProcurementDecisionWorkspace";
import {
  Button,
  Details,
  GuidanceHint,
  Notice,
  PageHeader,
  SectionHeading,
  StatCard,
  StatusPill,
  SummaryGrid,
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
    note: "Dùng mức dự báo P25 để ưu tiên tồn kho gọn hơn.",
  },
  {
    label: "Cân bằng",
    core: "balanced",
    note: "Dùng mức dự báo P50 để cân bằng thiếu hàng, hao hụt và chi phí.",
  },
  {
    label: "An toàn",
    core: "protected",
    note: "Dùng mức dự báo P75 để duy trì mức dự phòng cao hơn.",
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

export interface SimulationRunInput {
  horizonDays: number;
  includeOpenPurchaseOrders: boolean;
  budgetOverride?: number;
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
  if (!value) return "Chưa có thời gian hoàn tất kế hoạch";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timeZone || "Asia/Ho_Chi_Minh",
  }).format(instant);
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
    <StatCard
      label={`${option.label}${recommended ? " · Khuyến nghị" : ""}`}
      value={scenario ? formatVnd(scenario.cost) : "Chưa có kết quả"}
      status={
        !scenario
          ? "neutral"
          : !feasible
            ? "warning"
            : active
              ? "info"
              : "success"
      }
      className="scenario-card"
    >
      {scenario ? (
        <small className="stat-card-detail">
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
    </StatCard>
  );
}

export function PlanView({
  data,
  plan,
  decision,
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
  focus = "plan",
}: {
  data: BootstrapData;
  plan: PlanResponse;
  decision: DecisionPackage | null;
  strategy: Strategy;
  initialIngredient?: string;
  draftOrders: PurchaseOrder[];
  onRunPlanning: (input: SimulationRunInput) => Promise<void>;
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
  focus?: "future" | "simulator" | "plan" | "orders";
}) {
  const [horizonDays, setHorizonDays] = useState(
    clampHorizon(plan.horizonDays ?? data.settings.forecastHorizon),
  );
  const [budgetOverride, setBudgetOverride] = useState("");
  const [includeOpenPurchaseOrders, setIncludeOpenPurchaseOrders] = useState(true);
  const [controlsDirty, setControlsDirty] = useState(false);
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
    const targetId =
      focus === "future"
        ? "future-7-days"
        : focus === "orders"
          ? "draft-purchase-orders"
          : focus === "plan"
            ? "procurement-plan"
            : "simulation-run";
    requestAnimationFrame(() =>
      document.getElementById(targetId)?.scrollIntoView({ block: "start" }),
    );
  }, [focus]);

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
      const parsedBudget = budgetOverride.trim() === "" ? undefined : Number(budgetOverride);
      if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
        setError("Ngân sách mô phỏng phải là số từ 0 trở lên.");
        return;
      }
      await onRunPlanning({
        horizonDays,
        includeOpenPurchaseOrders,
        ...(parsedBudget === undefined ? {} : { budgetOverride: parsedBudget }),
      });
      setControlsDirty(false);
      setMessage("Mô phỏng đã hoàn tất.");
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
      setMessage("Mô hình dự báo đã sẵn sàng. Hãy chạy lại kế hoạch.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể huấn luyện mô hình dự báo.",
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
      setError(
        "Không có dòng đơn hợp lệ để cập nhật. Mỗi dòng cần có mã hệ thống và số lượng lớn hơn 0.",
      );
      return;
    }
    setActionBusy("update");
    setMessage("");
    setError("");
    try {
      await onUpdateOrder(selectedOrder.poId, lineUpdates);
      setMessage("Đã lưu số lượng mới cho đơn nháp.");
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
      setError("Chọn thời gian nhận và nhập số lượng lớn hơn 0 cho ít nhất một lô.");
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
      setMessage("Đã ghi nhận các lô vừa nhận và cập nhật trạng thái đơn.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể nhận hàng.",
      );
    } finally {
      setActionBusy("");
    }
  }

  if (focus === "plan" && noFeasibleDecision(decision)) {
    return (
      <ProcurementDecisionWorkspace
        busy={runBusy}
        data={data}
        decision={decision}
        onRunAgain={() => void runPlanning()}
        plan={plan}
      />
    );
  }

  if (
    focus === "plan" &&
    (runBusy ||
      plan.status === "running" ||
      decision?.status === "queued" ||
      decision?.status === "running")
  ) {
    return <ProcurementLoadingWorkspace onRunAgain={() => void runPlanning()} />;
  }

  if (decision && focus === "simulator") {
    const isRunning = runBusy || decision.status === "running" || decision.status === "queued";
    return (
      <>
        <PageHeader
          title="Mô phỏng"
          context={`${data.settings.storeName} · ${data.today} · ${horizonDays} ngày`}
          action={<Button variant="primary" busy={isRunning} onClick={() => void runPlanning()} aria-label="Chạy mô phỏng"><Play size={16} />Chạy mô phỏng</Button>}
        />
        <div className="plan-controls">
          <label className="field"><span>Số ngày mô phỏng (1–7)</span><input type="number" min="1" max="7" step="1" value={horizonDays} onChange={(event) => { setHorizonDays(clampHorizon(Number(event.target.value))); setControlsDirty(true); }} /></label>
          <label className="field"><span>Ngân sách tối đa</span><input type="number" min="0" step="1000" inputMode="decimal" value={budgetOverride} placeholder={formatVnd(data.settings.monthlyBudget)} onChange={(event) => { setBudgetOverride(event.target.value); setControlsDirty(true); }} /></label>
          <label className="check plan-open-orders"><input type="checkbox" checked={includeOpenPurchaseOrders} onChange={(event) => { setIncludeOpenPurchaseOrders(event.target.checked); setControlsDirty(true); }} /><span>Tính đơn mua hàng đang mở</span></label>
          <div className="plan-status"><span>Trạng thái</span><strong>{isRunning ? "Đang lập kế hoạch..." : decision.status === "completed" ? "Hoàn tất" : "Cần kiểm tra"}</strong></div>
        </div>
        {controlsDirty && !isRunning ? <Notice tone="warning">Kết quả dưới đây được tạo trước khi bạn thay đổi điều kiện. Hãy chạy lại mô phỏng.</Notice> : null}
        <Details summary="Ràng buộc đang áp dụng">
          <ul className="warning-list">
            <li>Ngân sách còn: {formatVnd(data.settings.remainingBudget)}</li>
            <li>{data.inventory.filter((item) => item.moq != null).length} nguyên liệu có số lượng đặt tối thiểu</li>
            <li>{data.inventory.filter((item) => item.packSize != null).length} nguyên liệu có quy cách đóng gói</li>
            <li>{data.inventory.filter((item) => item.leadTimeDays != null).length} nguyên liệu có thời gian giao hàng</li>
          </ul>
        </Details>
        <DecisionCenter key={decision.decision_run_id} decision={decision} running={isRunning} />
        {decision.status === "completed" ? (
          <Details summary="Đơn nháp">
            <p className="quiet-copy">
              Kết quả mô phỏng này chưa thể chuyển trực tiếp thành đơn nháp vì
              chưa có dữ liệu tham chiếu từng dòng đặt hàng.
            </p>
          </Details>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          focus === "future"
            ? "Tương lai 7 ngày"
            : focus === "orders"
              ? "Đơn mua hàng"
              : focus === "plan"
                ? "Kế hoạch nhập"
                : "Mô phỏng"
        }
        context={`${data.settings.storeName} · ${data.today}`}
        action={
          <Button
            variant="primary"
            busy={runBusy || plan.status === "running"}
            onClick={() => void runPlanning()}
          >
            <Play size={16} />
            Chạy mô phỏng
          </Button>
        }
      />

      <div className="plan-controls" id="simulation-run">
        <label className="field">
          <span>Số ngày mô phỏng (1–7)</span>
          <input
            type="number"
            min="1"
            max="7"
            step="1"
            value={horizonDays}
            onChange={(event) => {
              setHorizonDays(clampHorizon(Number(event.target.value)));
              setControlsDirty(true);
            }}
          />
        </label>
        <label className="field">
          <span>Ngân sách tối đa</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="decimal"
            value={budgetOverride}
            placeholder={formatVnd(data.settings.monthlyBudget)}
            onChange={(event) => {
              setBudgetOverride(event.target.value);
              setControlsDirty(true);
            }}
          />
        </label>
        <label className="check plan-open-orders">
          <input
            type="checkbox"
            checked={includeOpenPurchaseOrders}
            onChange={(event) => {
              setIncludeOpenPurchaseOrders(event.target.checked);
              setControlsDirty(true);
            }}
          />
          <span>Tính đơn mua hàng đang mở</span>
        </label>
        <fieldset className="segmented">
          <legend>Trạng thái lập kế hoạch</legend>
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
          Chọn số ngày dự báo rồi chạy kế hoạch để tạo kết quả.
        </Notice>
      ) : null}
      {plan.status === "running" ? (
        <Notice tone="info">
          Hệ thống đang dự báo sản phẩm, tính nhu cầu nguyên liệu và lập ba
          kịch bản nhập hàng.
        </Notice>
      ) : null}
      {plan.status === "blocked" ? (
        <>
          <Notice tone="warning">
            {plan.failureCode === "MODEL_NOT_READY"
              ? "Mô hình dự báo chưa sẵn sàng. Quản trị viên cần huấn luyện mô hình rồi chạy lại kế hoạch."
              : plan.failureMessage || "Quy trình lập kế hoạch đang bị chặn."}
          </Notice>
          {plan.failureCode === "MODEL_NOT_READY" && onTrainModel ? (
            <Details summary="Dành cho quản trị viên · Huấn luyện mô hình dự báo">
              <Notice tone="warning">
                Quá trình huấn luyện có thể mất nhiều thời gian. Chỉ thực hiện
                khi bạn có quyền quản trị và ít nhất 140 ngày dữ liệu lịch sử.
              </Notice>
              <div className="two-column compact-gap">
                <label className="field">
                  <span>Phiên bản mô hình mới</span>
                  <input
                    value={modelVersion}
                    onChange={(event) => setModelVersion(event.target.value)}
                    placeholder="mo-hinh-du-bao-v..."
                  />
                </label>
                <label className="field">
                  <span>Số ngày dữ liệu lịch sử</span>
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
                Huấn luyện mô hình
              </Button>
            </Details>
          ) : null}
        </>
      ) : null}
      {plan.status === "failed" ? (
        <Notice tone="error">
          {plan.failureMessage || "Không thể hoàn tất quy trình lập kế hoạch."}
        </Notice>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {plan.status === "completed" ? (
        <Notice tone="warning">
          Kết quả này được tạo lúc{" "}
          {dateTimeLabel(plan.completedAt || plan.createdAt, data.settings.timezone)}
          {plan.cutoffDate
            ? `, từ dữ liệu đến ngày ${formatDate(plan.cutoffDate)}`
            : ""}
          . Nếu tồn kho, công thức hoặc cài đặt đã thay đổi, hãy chạy lại trước
          khi tạo đơn.
        </Notice>
      ) : null}

      {plan.warnings?.length ? (
        <Details summary={`Cảnh báo của quy trình (${plan.warnings.length})`}>
          <ul className="warning-list">
            {plan.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </Details>
      ) : null}

      <section id="future-7-days">
      {forecastEntries.length > 0 ? (
        <>
          <SectionHeading
            title="Dự báo sản phẩm"
            guidance={<GuidanceHint content="Bộ lọc chỉ thay đổi dữ liệu đang xem." />}
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
              <SummaryGrid columns={3}>
                <StatCard
                  label={`P25 · ${plan.horizonDays ?? horizonDays} ngày`}
                  value={formatQuantity(forecast.totals.p25, forecast.unit)}
                  status="info"
                />
                <StatCard
                  label="P50 · mức trung tâm"
                  value={formatQuantity(forecast.totals.p50, forecast.unit)}
                />
                <StatCard
                  label="P75 · mức cao"
                  value={formatQuantity(forecast.totals.p75, forecast.unit)}
                  status="info"
                />
              </SummaryGrid>
              {forecastWarnings.length > 0 ? (
                <div aria-label="Cảnh báo dự báo">
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
              {forecast.invalidQuantileCount ? (
                <Notice tone="warning">
                  Có {forecast.invalidQuantileCount} ngày có dữ liệu P25/P50/P75 không hợp lệ và không được vẽ trên biểu đồ.
                </Notice>
              ) : null}
              <Details summary="Biểu đồ và khoảng dự báo" open>
                <div className="detail-grid">
                  <ForecastChart forecast={forecast} compact />
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Ngày</th>
                          <th>P25</th>
                          <th>P50</th>
                          <th>P75</th>
                          <th>Khoảng dự báo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.forecast.map((point) => (
                          <tr key={point.date}>
                            <td>{formatDate(point.date)}</td>
                            <td>{point.p25 == null ? "—" : formatQuantity(point.p25)}</td>
                            <td>{point.p50 == null ? "—" : formatQuantity(point.p50)}</td>
                            <td>
                              {point.p75 == null ? "—" : formatQuantity(point.p75)}
                            </td>
                            <td>
                              {point.intervalLower == null || point.intervalUpper == null
                                ? "—"
                                : `${formatQuantity(point.intervalLower)} – ${formatQuantity(point.intervalUpper)}`}
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
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>P25</th>
                  <th>P50</th>
                  <th>P75</th>
                  <th>Số dòng phân bổ</th>
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
              summary={`Chi tiết phân bổ nhu cầu · ${demandLabel(selectedDemand)}`}
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
                  Hệ thống chưa trả về dữ liệu phân bổ cho nguyên liệu này.
                  Không nên hiểu là nguyên liệu không có nhu cầu.
                </Notice>
              )}
            </Details>
          ) : null}
        </>
      ) : null}

      </section>

      <section id="procurement-plan">
      <SectionHeading
        title="So sánh ba kịch bản"
        guidance={<GuidanceHint content="Chọn kịch bản chỉ đổi dữ liệu đang xem." />}
      />
      <SummaryGrid columns={3}>
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
      </SummaryGrid>
      <p className="strategy-note">{strategyOption(strategy).note}</p>

      {selectedScenario && !selectedScenario.feasible ? (
        <Notice tone="warning">
          Kịch bản này chưa đáp ứng một hoặc nhiều điều kiện. Bạn vẫn có thể tạo
          đơn nháp từ các dòng hợp lệ; ngân sách sẽ được kiểm tra lại khi xác
          nhận.
        </Notice>
      ) : null}
      {selectedScenario?.violations.length ? (
        <Details
          summary={`Điều kiện chưa đáp ứng (${selectedScenario.violations.length})`}
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
        title="Dòng đề xuất của kịch bản"
      />
      <div className="table-wrap plan-table">
        <table>
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              <th>Trạng thái</th>
              <th>Nhu cầu tính toán</th>
              <th>Đề xuất</th>
              <th>Số lượng đặt</th>
              <th>Nhà cung cấp</th>
              <th>Dự kiến về</th>
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
                      aria-label={`Số lượng đặt ${row.ingredient}`}
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
                      Đặt tối thiểu {formatQuantity(row.moq)} · quy cách{" "}
                      {formatQuantity(row.packSize)}
                    </small>
                  </td>
                  <td>
                    {row.supplierId
                      ? row.supplier || row.supplierId
                      : "Chưa có nhà cung cấp"}
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
                  Chưa có dòng đề xuất nhập hàng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SummaryGrid columns={3}>
        <StatCard
          label="Chi phí kịch bản"
          value={
            selectedScenario ? formatVnd(selectedScenario.cost) : "Chưa có"
          }
        />
        <StatCard
          label="Dòng có thể tạo đơn"
          value={eligibleRecommendations.length}
          status="success"
        />
        <StatCard
          label="Dòng thiếu nhà cung cấp"
          value={invalidRecommendationCount}
          status={invalidRecommendationCount ? "warning" : "success"}
        />
      </SummaryGrid>

      </section>

      <section id="draft-purchase-orders">
      <SectionHeading title="Đơn đặt hàng" />
      <div className="confirm-row">
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Tôi đã kiểm tra dữ liệu lập kế hoạch, các dòng chưa thể tạo đơn và
            cảnh báo ngân sách.
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
                    {formatDate(selectedOrder.deliveryDate)} · phiên bản{" "}
                    {selectedOrder.version ?? "—"}
                  </p>
                </div>
                <strong>{formatVnd(selectedOrder.total)}</strong>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mã dòng đơn</th>
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
                          <td>{line.poLineId || "Chưa có mã dòng"}</td>
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
                  Bạn có thể sửa số lượng khi đơn còn ở trạng thái nháp. Khi lưu,
                  hệ thống sẽ kiểm tra số lượng đặt tối thiểu, quy cách đóng gói
                  và phiên bản dữ liệu.
                </Notice>
              ) : null}

              {["ordered", "partially_received"].includes(
                selectedOrder.status,
              ) ? (
                <Details summary="Ghi nhận hàng theo lô" open>
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
                        placeholder="Ví dụ: PGH-001"
                      />
                    </label>
                  </div>

                  {selectedOrder.lines.map((line, lineIndex) => {
                    if (!line.poLineId) return null;
                    const key = lineKey(line, lineIndex);
                    return (
                      <div className="panel compact-gap" key={key}>
                        <strong>
                          {line.ingredient} · mã dòng {line.poLineId}
                        </strong>
                        <small>
                          Còn cần nhận:{" "}
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
                              <span>Số lượng lô {lotIndex + 1}</span>
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
                              <span>Mã lô của nhà cung cấp</span>
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
                              Xóa lô
                            </Button>
                          </div>
                        ))}
                        <Button variant="quiet" onClick={() => addReceiveLot(key)}>
                          <Plus size={15} />
                          Thêm lô
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
      </section>
    </>
  );
}

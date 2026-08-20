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
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ShelfCashApiError } from "../../lib/shelfcash-client";
import type {
  BootstrapData,
  CoreStrategy,
  ForecastResult,
  IngredientDemandResult,
  PlanResponse,
  DecisionPackage,
  DecisionBriefFacts,
  DecisionExplanationResponse,
  ExplanationRequest,
  WhatIfRequest,
  WhatIfResponse,
  PlanningScenario,
  PurchaseOrder,
  Recommendation,
  Strategy,
} from "../../lib/types";
import { ForecastChart } from "../components/ForecastChart";
import {
  ProcurementLoadingWorkspace,
  noFeasibleDecision,
} from "../components/ProcurementDecisionWorkspace";
import { ProcurementPlanningWorkspace } from "../components/ProcurementPlanningWorkspace";
import { DecisionBriefWorkspace } from "../components/DecisionBriefWorkspace";
import { SimulationResultPanel } from "../components/SimulationResultPanel";
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
import { useActionAttempts } from "../hooks/useActionAttempts";
import type { SimulationProgress } from "../../lib/simulation-orchestration";

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
  onProgress?: (progress: SimulationProgress) => void;
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

function actionFailureMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ShelfCashApiError) {
    const messages: Record<string, string> = {
      INSUFFICIENT_TRAINING_DATA:
        "Chưa đủ lịch sử bán hàng để huấn luyện forecast.",
      FORECAST_TRAINING_FAILED:
        "Không thể huấn luyện forecast. Thử lại sau hoặc kiểm tra dữ liệu đầu vào.",
      FORECAST_ARTIFACT_INVALID: "Forecast model hiện tại không hợp lệ.",
      FORECAST_INPUT_INVALID: "Thông tin mô phỏng không hợp lệ.",
      DUPLICATE_REQUEST:
        "Yêu cầu trùng khớp không hợp lệ; không tạo lượt mô phỏng mới.",
    };
    const message = messages[caught.code] ?? caught.message ?? fallback;
    return retryableTransportFailure(caught)
      ? `${message} Máy chủ có thể vẫn đang xử lý yêu cầu; hãy Đồng bộ hoặc kiểm tra lại trước khi thử lại.`
      : message;
  }
  const detail = caught instanceof Error ? caught.message : fallback;
  return retryableTransportFailure(caught)
    ? `${detail} Máy chủ có thể vẫn đang xử lý yêu cầu; hãy Đồng bộ hoặc kiểm tra lại trước khi thử lại.`
    : detail;
}

function SimulationProgressPanel({ progress }: { progress: SimulationProgress | null }) {
  if (!progress) return null;
  const steps: Array<{ stage: SimulationProgress["stage"]; label: string }> = [
    { stage: "preparing", label: "Chuẩn bị dữ liệu mô phỏng" },
    { stage: "checking-model", label: "Kiểm tra forecast model" },
    ...(progress.trainingRequired
      ? [{ stage: "training-model" as const, label: "Huấn luyện forecast model" }]
      : []),
    { stage: "creating-forecast", label: "Tạo dự báo 7 ngày" },
    { stage: "running-decision", label: "Tính quyết định mua hàng" },
    { stage: "completed", label: "Hoàn tất" },
  ];
  const activeIndex = steps.findIndex((step) => step.stage === progress.stage);
  return (
    <section className="simulation-progress-panel" aria-live="polite" aria-label="Tiến trình mô phỏng">
      <strong>{progress.message}</strong>
      <ol>
        {steps.map((step, index) => (
          <li key={step.stage} className={index < activeIndex ? "complete" : index === activeIndex ? "active" : ""}>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function retryableTransportFailure(caught: unknown): boolean {
  return (
    caught instanceof ShelfCashApiError &&
    ["NETWORK_ERROR", "BACKEND_UNREACHABLE", "REQUEST_TIMEOUT", "JOB_TIMEOUT"].includes(
      caught.code,
    )
  );
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
  decisionBrief,
  briefLoading,
  briefError,
  onRetryBrief,
  decisionExplanation,
  explanationLoading,
  explanationError,
  onExplainDecision,
  decisionWhatIf,
  whatIfLoading,
  whatIfError,
  onRunWhatIf,
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
  decisionBrief?: DecisionBriefFacts | null;
  briefLoading?: boolean;
  briefError?: string | null;
  onRetryBrief?: () => void;
  decisionExplanation?: DecisionExplanationResponse | null;
  explanationLoading?: boolean;
  explanationError?: string | null;
  onExplainDecision?: (request: ExplanationRequest) => void;
  decisionWhatIf?: WhatIfResponse | null;
  whatIfLoading?: boolean;
  whatIfError?: string | null;
  onRunWhatIf?: (mutation: WhatIfRequest) => void;
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
  const [simulationProgress, setSimulationProgress] = useState<SimulationProgress | null>(null);
  const [modelVersion, setModelVersion] = useState("");
  const [historyDays, setHistoryDays] = useState(365);
  const [selectedForecastKey, setSelectedForecastKey] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState(
    initialIngredient || "",
  );
  const [adjusted, setAdjusted] = useState<Recommendation[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const actionAttempts = useActionAttempts();
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
  const [hasTriggeredForecast, setHasTriggeredForecast] = useState(
    plan.status !== "idle",
  );

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
  const planningAction = `decision-run:${data.settings.storeId}`;
  const trainingAction = `forecast-training:${data.settings.storeId}`;
  const createOrdersAction = `purchase-order:create:${data.settings.storeId}`;
  const updateOrderAction = `purchase-order:update:${selectedOrder?.poId ?? "none"}`;
  const confirmOrderAction = `purchase-order:confirm:${selectedOrder?.poId ?? "none"}`;
  const receiveOrderAction = `purchase-order:receive:${selectedOrder?.poId ?? "none"}`;
  const runBusy = actionAttempts.get(planningAction)?.status === "loading";
  const trainingBusy = actionAttempts.get(trainingAction)?.status === "loading";
  const feedback = actionAttempts.entries().filter(([, state]) =>
    ["success", "error", "unknown"].includes(state.status),
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
    setHasTriggeredForecast(true);
    const attemptId = actionAttempts.begin(planningAction);
    try {
      const parsedBudget = budgetOverride.trim() === "" ? undefined : Number(budgetOverride);
      if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
        actionAttempts.fail(
          planningAction,
          attemptId,
          "Ngân sách mô phỏng phải là số từ 0 trở lên.",
        );
        return;
      }
      await onRunPlanning({
        horizonDays,
        includeOpenPurchaseOrders,
        ...(parsedBudget === undefined ? {} : { budgetOverride: parsedBudget }),
        onProgress: setSimulationProgress,
      });
      if (!actionAttempts.isCurrent(planningAction, attemptId)) return;
      setControlsDirty(false);
      actionAttempts.succeed(planningAction, attemptId, "Mô phỏng đã hoàn tất.");
    } catch (caught) {
      const message = actionFailureMessage(
        caught,
        "Không thể chạy quy trình lập kế hoạch.",
      );
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(planningAction, attemptId, message);
      } else {
        actionAttempts.fail(planningAction, attemptId, message);
      }
    } finally {
      if (actionAttempts.isCurrent(planningAction, attemptId)) {
        setSimulationProgress(null);
      }
    }
  }

  async function trainModel() {
    if (!onTrainModel || !modelVersion.trim()) return;
    const attemptId = actionAttempts.begin(trainingAction);
    try {
      await onTrainModel(modelVersion.trim(), historyDays);
      actionAttempts.succeed(
        trainingAction,
        attemptId,
        "Mô hình dự báo đã sẵn sàng. Hãy chạy lại kế hoạch.",
      );
    } catch (caught) {
      const message = actionFailureMessage(caught, "Không thể huấn luyện mô hình dự báo.");
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(trainingAction, attemptId, message);
      } else {
        actionAttempts.fail(trainingAction, attemptId, message);
      }
    }
  }

  async function createOrders() {
    const attemptId = actionAttempts.begin(createOrdersAction);
    try {
      const orders = await onCreateOrders(eligibleRecommendations);
      if (!actionAttempts.isCurrent(createOrdersAction, attemptId)) return;
      actionAttempts.succeed(
        createOrdersAction,
        attemptId,
        `Đã tạo ${orders.length} đơn nháp theo nhà cung cấp.`,
      );
      setConfirmed(false);
    } catch (caught) {
      const message = actionFailureMessage(caught, "Không thể tạo đơn.");
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(createOrdersAction, attemptId, message);
      } else {
        actionAttempts.fail(createOrdersAction, attemptId, message);
      }
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
      const attemptId = actionAttempts.begin(updateOrderAction);
      actionAttempts.fail(
        updateOrderAction,
        attemptId,
        "Không có dòng đơn hợp lệ để cập nhật. Mỗi dòng cần có mã hệ thống và số lượng lớn hơn 0.",
      );
      return;
    }
    const attemptId = actionAttempts.begin(updateOrderAction);
    try {
      await onUpdateOrder(selectedOrder.poId, lineUpdates);
      actionAttempts.succeed(updateOrderAction, attemptId, "Đã lưu số lượng mới cho đơn nháp.");
    } catch (caught) {
      const message = actionFailureMessage(caught, "Không thể sửa đơn nháp.");
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(updateOrderAction, attemptId, message);
      } else {
        actionAttempts.fail(updateOrderAction, attemptId, message);
      }
    }
  }

  async function confirmOrder() {
    if (!selectedOrder || selectedOrder.status !== "draft") return;
    const attemptId = actionAttempts.begin(confirmOrderAction);
    try {
      await onConfirmOrder(selectedOrder.poId);
      actionAttempts.succeed(
        confirmOrderAction,
        attemptId,
        "Đơn đã được xác nhận và ngân sách đã được giữ chỗ.",
      );
    } catch (caught) {
      const message = actionFailureMessage(
        caught,
        "Không thể xác nhận đơn. Đơn nháp vẫn được giữ lại.",
      );
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(confirmOrderAction, attemptId, message);
      } else {
        actionAttempts.fail(confirmOrderAction, attemptId, message);
      }
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
      const attemptId = actionAttempts.begin(receiveOrderAction);
      actionAttempts.fail(
        receiveOrderAction,
        attemptId,
        "Chọn thời gian nhận và nhập số lượng lớn hơn 0 cho ít nhất một lô.",
      );
      return;
    }

    const receivedInstant = new Date(receivedAt);
    if (Number.isNaN(receivedInstant.getTime())) {
      const attemptId = actionAttempts.begin(receiveOrderAction);
      actionAttempts.fail(receiveOrderAction, attemptId, "Thời gian nhận hàng không hợp lệ.");
      return;
    }

    const attemptId = actionAttempts.begin(receiveOrderAction);
    try {
      await onReceiveOrder(selectedOrder.poId, {
        receivedAt: receivedInstant.toISOString(),
        ...(deliveryReference.trim()
          ? { deliveryReference: deliveryReference.trim() }
          : {}),
        lines,
      });
      actionAttempts.succeed(
        receiveOrderAction,
        attemptId,
        "Đã ghi nhận các lô vừa nhận và cập nhật trạng thái đơn.",
      );
    } catch (caught) {
      const message = actionFailureMessage(caught, "Không thể nhận hàng.");
      if (retryableTransportFailure(caught)) {
        actionAttempts.unknown(receiveOrderAction, attemptId, message);
      } else {
        actionAttempts.fail(receiveOrderAction, attemptId, message);
      }
    }
  }

  if (
    focus === "plan" &&
    hasTriggeredForecast &&
    !runBusy &&
    decision &&
    (noFeasibleDecision(decision) || decision.status === "completed")
  ) {
    if (
      decisionBrief !== undefined ||
      briefLoading ||
      briefError ||
      onRetryBrief ||
      onExplainDecision
    ) {
      return (
        <DecisionBriefWorkspace
          brief={decisionBrief ?? null}
          error={briefError ?? null}
          explanation={decisionExplanation ?? null}
          explanationError={explanationError ?? null}
          explanationLoading={explanationLoading ?? false}
          loading={briefLoading ?? false}
          onExplain={onExplainDecision ?? (() => undefined)}
          onRunAgain={() => void runPlanning()}
          onRunWhatIf={onRunWhatIf ?? (() => undefined)}
          onRetry={onRetryBrief ?? (() => undefined)}
          decision={decision}
          whatIf={decisionWhatIf ?? null}
          whatIfError={whatIfError ?? null}
          whatIfLoading={whatIfLoading ?? false}
        />
      );
    }
    return (
      <ProcurementPlanningWorkspace
        busy={runBusy}
        data={data}
        decision={decision}
        onRunAgain={() => void runPlanning()}
        onCreateOrders={onCreateOrders}
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
    return (
      <>
        <ProcurementLoadingWorkspace onRunAgain={() => void runPlanning()} />
        <SimulationProgressPanel progress={simulationProgress} />
      </>
    );
  }

  if (decision && focus === "simulator") {
    const isRunning = runBusy || decision.status === "running" || decision.status === "queued";
    return (
      <>
        <PageHeader
          title="Mô phỏng"
          context={`${data.settings.storeName} · ${data.today} · ${horizonDays} ngày`}
          action={<Button variant="primary" busy={isRunning} onClick={() => void runPlanning()} aria-label="Chạy mô phỏng"><Play size={16} />{isRunning ? "Đang chạy mô phỏng…" : "Chạy mô phỏng"}</Button>}
        />
        <div className="plan-controls">
          <label className="field"><span>Số ngày mô phỏng (1–7)</span><input type="number" min="1" max="7" step="1" disabled={isRunning} value={horizonDays} onChange={(event) => { setHorizonDays(clampHorizon(Number(event.target.value))); setControlsDirty(true); }} /></label>
          <label className="field"><span>Ngân sách tối đa</span><input type="number" min="0" step="1000" inputMode="decimal" disabled={isRunning} value={budgetOverride} placeholder={formatVnd(data.settings.monthlyBudget)} onChange={(event) => { setBudgetOverride(event.target.value); setControlsDirty(true); }} /></label>
          <label className="check plan-open-orders"><input type="checkbox" disabled={isRunning} checked={includeOpenPurchaseOrders} onChange={(event) => { setIncludeOpenPurchaseOrders(event.target.checked); setControlsDirty(true); }} /><span>Tính đơn mua hàng đang mở</span></label>
          <div className="plan-status"><span>Trạng thái</span><strong>{isRunning ? "Đang lập kế hoạch..." : decision.status === "completed" ? "Hoàn tất" : "Cần kiểm tra"}</strong></div>
        </div>
        <SimulationProgressPanel progress={simulationProgress} />
        {controlsDirty && !isRunning ? <Notice tone="warning">Kết quả dưới đây được tạo trước khi bạn thay đổi điều kiện. Hãy chạy lại mô phỏng.</Notice> : null}
        <Details summary="Ràng buộc đang áp dụng">
          <ul className="warning-list">
            <li>Ngân sách còn: {formatVnd(data.settings.remainingBudget)}</li>
            <li>{data.inventory.filter((item) => item.moq != null).length} nguyên liệu có số lượng đặt tối thiểu</li>
            <li>{data.inventory.filter((item) => item.packSize != null).length} nguyên liệu có quy cách đóng gói</li>
            <li>{data.inventory.filter((item) => item.leadTimeDays != null).length} nguyên liệu có thời gian giao hàng</li>
          </ul>
        </Details>
        <SimulationResultPanel
          data={data}
          decision={decision}
          running={isRunning}
        />
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
          focus === "plan" && plan.status === "idle" && !hasTriggeredForecast ? null : (
            <Button
              variant="primary"
              busy={runBusy || plan.status === "running"}
              onClick={() => void runPlanning()}
            >
              <Play size={16} />
              {runBusy
                ? "Đang dự đoán…"
                : focus === "plan"
                  ? "Dự đoán & Lập kế hoạch"
                  : "Chạy mô phỏng"}
            </Button>
          )
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
            disabled={runBusy}
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
            disabled={runBusy}
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
            disabled={runBusy}
            checked={includeOpenPurchaseOrders}
            onChange={(event) => {
              setIncludeOpenPurchaseOrders(event.target.checked);
              setControlsDirty(true);
            }}
          />
          <span>Tính đơn mua hàng đang mở</span>
        </label>
      </div>
      <SimulationProgressPanel progress={simulationProgress} />

      {plan.status === "idle" && !hasTriggeredForecast ? (
        <div
          className="plan-launchpad-card"
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
            borderRadius: "14px",
            border: "1px dashed #cbd5e1",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 2px 8px rgba(37,99,235,0.12)",
            }}
          >
            <Sparkles size={26} style={{ color: "#2563eb" }} />
          </div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
            Sẵn sàng tính toán dự báo & kế hoạch nhập hàng
          </h3>
          <p style={{ color: "#64748b", maxWidth: "540px", margin: "0 auto 20px", fontSize: "0.92rem", lineHeight: "1.6" }}>
            Nhấn nút <strong>Dự đoán</strong> để hệ thống phân tích nhu cầu 7 ngày tới, đối chiếu tồn kho FEFO và đề xuất 3 phương án nhập hàng tối ưu.
          </p>
          <Button
            variant="primary"
            busy={runBusy}
            onClick={() => void runPlanning()}
            style={{ padding: "10px 24px", fontSize: "0.95rem", fontWeight: "600" }}
          >
            <Play size={16} />
            {runBusy ? "Đang chạy dự đoán..." : "Dự đoán & Lập kế hoạch"}
          </Button>
        </div>
      ) : plan.status === "idle" ? (
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
      {feedback.map(([actionKey, state]) => (
        <Notice
          key={`${actionKey}:${state.attemptId}`}
          tone={
            state.status === "success"
              ? "success"
              : state.status === "unknown"
                ? "warning"
                : "error"
          }
        >
          {state.message}
        </Notice>
      ))}

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
                  Chưa có dữ liệu phân bổ cho nguyên liệu này. Không nên hiểu
                  là nguyên liệu không có nhu cầu.
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
        guidance={<GuidanceHint content={`Chọn kịch bản chỉ đổi dữ liệu đang xem. ${strategyOption(strategy).note}`} />}
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
          busy={actionAttempts.get(createOrdersAction)?.status === "loading"}
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
                    busy={actionAttempts.get(receiveOrderAction)?.status === "loading"}
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
                  onClick={() => {
                    const actionKey = `purchase-order:export-xlsx:${selectedOrder.poId}`;
                    const attemptId = actionAttempts.begin(actionKey);
                    void downloadOrder(selectedOrder, "xlsx").then(
                      () => actionAttempts.succeed(actionKey, attemptId, "Đã xuất Excel."),
                      (caught) => actionAttempts.fail(
                        actionKey,
                        attemptId,
                        caught instanceof Error ? caught.message : "Không thể xuất Excel.",
                      ),
                    );
                  }}
                >
                  <FileSpreadsheet size={16} />
                  Xuất Excel
                </Button>
                <Button
                  onClick={() => {
                    const actionKey = `purchase-order:export-pdf:${selectedOrder.poId}`;
                    const attemptId = actionAttempts.begin(actionKey);
                    void downloadOrder(selectedOrder, "pdf").then(
                      () => actionAttempts.succeed(actionKey, attemptId, "Đã xuất PDF."),
                      (caught) => actionAttempts.fail(
                        actionKey,
                        attemptId,
                        caught instanceof Error ? caught.message : "Không thể xuất PDF.",
                      ),
                    );
                  }}
                >
                  <Download size={16} />
                  Xuất PDF
                </Button>
                {selectedOrder.status === "draft" ? (
                  <>
                    <Button
                      busy={actionAttempts.get(updateOrderAction)?.status === "loading"}
                      onClick={() => void updateDraftOrder()}
                    >
                      <Save size={16} />
                      Lưu số lượng
                    </Button>
                    <Button
                      variant="primary"
                      busy={actionAttempts.get(confirmOrderAction)?.status === "loading"}
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

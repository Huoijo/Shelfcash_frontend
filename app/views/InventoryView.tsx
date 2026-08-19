"use client";

import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShelfCashApiError } from "../../lib/shelfcash-client";
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
  Details,
  GuidanceHint,
  Notice,
  PageHeader,
  SectionHeading,
  StatCard,
  StatusPill,
  SummaryGrid,
  TabList,
  formatDate,
  formatQuantity,
} from "../components/ui";
import { useActionAttempts } from "../hooks/useActionAttempts";

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
  healthy: "Bình thường",
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

export function friendlyLotLabel(lot: InventoryLot): string {
  if (lot.batchId?.trim()) return lot.batchId.trim();
  return lot.receivedDate
    ? `Lô nhận ngày ${formatBackendDate(lot.receivedDate)}`
    : "Lô chưa có mã nhận diện";
}

function quantityOrUnavailable(value: number | null | undefined, unit: string): string {
  return value == null ? "—" : formatQuantity(value, unit);
}

function operationalConclusion(item: EnrichedInventoryItem): string | null {
  if (
    item.statusKey === "expired" &&
    item.usableQuantity === 0 &&
    item.onHand > 0
  ) {
    return `Toàn bộ ${formatQuantity(item.onHand, item.unit)} hiện không còn khả dụng do đã hết hạn.`;
  }
  if (item.statusKey === "stockout" && item.onHand === 0) {
    return "Hiện không còn tồn kho để sử dụng.";
  }
  if (item.statusKey === "expiring") {
    return "Tồn kho có lô gần hết hạn; hãy ưu tiên sử dụng theo thứ tự FEFO.";
  }
  return null;
}

type InventoryDataAction = "count" | "adjust";

const adjustmentReasonLabels: Record<string, string> = {
  waste: "Hao hụt",
  expired: "Hết hạn",
  damaged: "Hư hỏng",
  correction_decrease: "Điều chỉnh giảm",
  correction_increase: "Điều chỉnh tăng",
  other: "Khác",
};

function formatSignedQuantity(value: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${formatQuantity(value, unit)}`;
}

function InventoryActionConfirmation({
  action,
  lot,
  value,
  reason,
  busy,
  onClose,
  onConfirm,
}: {
  action: InventoryDataAction;
  lot: InventoryLot;
  value: number;
  reason?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const isCount = action === "count";
  const delta = isCount ? value - lot.onHand : value;
  const after = isCount ? value : lot.onHand + value;

  return (
    <div className="inventory-confirm-layer">
      <button
        aria-label="Đóng xác nhận thay đổi tồn kho"
        className="inventory-confirm-backdrop"
        disabled={busy}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="inventory-confirm-title"
        aria-modal="true"
        className="inventory-confirm-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <span className="eyebrow">Xác nhận ghi dữ liệu</span>
          <h2 id="inventory-confirm-title">
            {isCount ? "Xác nhận kiểm kho" : "Xác nhận điều chỉnh"}
          </h2>
        </header>
        <dl className="inventory-confirm-summary">
          <div>
            <dt>Lô</dt>
            <dd>{friendlyLotLabel(lot)}</dd>
          </div>
          <div>
            <dt>Hệ thống đang ghi nhận</dt>
            <dd>{formatQuantity(lot.onHand, lot.unit)}</dd>
          </div>
          <div>
            <dt>{isCount ? "Số đếm thực tế" : "Mức điều chỉnh"}</dt>
            <dd>
              {isCount
                ? formatQuantity(value, lot.unit)
                : formatSignedQuantity(value, lot.unit)}
            </dd>
          </div>
          <div>
            <dt>{isCount ? "Chênh lệch sẽ ghi nhận" : "Tồn sau điều chỉnh"}</dt>
            <dd>{isCount ? formatSignedQuantity(delta, lot.unit) : formatQuantity(after, lot.unit)}</dd>
          </div>
          {!isCount && reason ? (
            <div>
              <dt>Lý do</dt>
              <dd>{adjustmentReasonLabels[reason] ?? reason}</dd>
            </div>
          ) : null}
        </dl>
        <footer>
          <Button disabled={busy} onClick={onClose} variant="secondary">
            Quay lại
          </Button>
          <Button busy={busy} onClick={onConfirm} ref={confirmButtonRef}>
            {isCount ? "Xác nhận ghi kiểm kho" : "Xác nhận ghi điều chỉnh"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function InventoryView({
  data,
  plan,
  onOpenPlan,
  onCountLot,
  onAdjustLot,
  onRefreshInventory,
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
  onRefreshInventory?: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InventoryStatus | "all">("all");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [selectionScrollRequest, setSelectionScrollRequest] = useState(0);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Lô FEFO");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countNote, setCountNote] = useState("");
  const [adjustmentDelta, setAdjustmentDelta] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("waste");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentReference, setAdjustmentReference] = useState("");
  const [dataAction, setDataAction] = useState<InventoryDataAction>("count");
  const [confirmingAction, setConfirmingAction] = useState<InventoryDataAction | null>(null);
  const [countValidationError, setCountValidationError] = useState("");
  const [adjustmentValidationError, setAdjustmentValidationError] = useState("");
  const [versionConflict, setVersionConflict] = useState(false);
  const [conflictRefreshBusy, setConflictRefreshBusy] = useState(false);
  const actionAttempts = useActionAttempts();
  const detailAnchorRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const handledScrollRequest = useRef(0);

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
    filtered.find((inventory) => inventoryKey(inventory) === selectedIngredientId);
  const lots = item ? sortLotsByFefo(item.lots ?? []) : [];
  const selectedLot =
    lots.find((lot) => lot.lotId === selectedLotId) ?? lots[0];
  const demand = item ? findIngredientDemand(plan, item) : undefined;
  const countAction = `inventory:count:${selectedLot?.lotId ?? "none"}`;
  const adjustAction = `inventory:adjust:${selectedLot?.lotId ?? "none"}`;
  const countFeedback = actionAttempts.get(countAction);
  const adjustFeedback = actionAttempts.get(adjustAction);

  const hasDemandForecast = Boolean(demand?.forecast?.length);
  const conclusion = item ? operationalConclusion(item) : null;
  const countPreviewValue = Number(countedQuantity);
  const hasCountPreview =
    Boolean(countedQuantity.trim()) &&
    Number.isFinite(countPreviewValue) &&
    countPreviewValue >= 0;
  const adjustmentPreviewValue = Number(adjustmentDelta);
  const adjustmentNeedsNegativeValue = new Set([
    "waste",
    "expired",
    "damaged",
    "correction_decrease",
  ]).has(adjustmentReason);
  const hasAdjustmentPreview =
    Boolean(selectedLot && adjustmentDelta.trim()) &&
    Number.isFinite(adjustmentPreviewValue) &&
    adjustmentPreviewValue !== 0 &&
    (adjustmentNeedsNegativeValue
      ? adjustmentPreviewValue < 0
      : adjustmentReason === "correction_increase"
        ? adjustmentPreviewValue > 0
        : true) &&
    selectedLot.onHand + adjustmentPreviewValue >= 0 &&
    (adjustmentReason !== "other" || Boolean(adjustmentNote.trim()));

  function scrollToElement(element: HTMLElement | null, behavior: ScrollBehavior) {
    if (!element) return;
    const header = document.querySelector<HTMLElement>(".top-header");
    const topOffset = (header?.getBoundingClientRect().height ?? 0) +
      (toolbarRef.current?.getBoundingClientRect().height ?? 0);
    const safeGap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--inventory-detail-scroll-gap",
      ),
    );
    element.style.scrollMarginTop = `${topOffset + safeGap}px`;
    element.scrollIntoView({ behavior, block: "start" });
  }

  function selectIngredient(ingredientId: string) {
    setSelectedIngredientId(ingredientId);
    setSelectionScrollRequest((current) => current + 1);
    setConfirmingAction(null);
    setVersionConflict(false);
  }

  function returnToIngredientList() {
    const row = rowRefs.current.get(selectedIngredientId) ?? null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToElement(row, reducedMotion ? "auto" : "smooth");
    row?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (
      !item ||
      selectionScrollRequest === 0 ||
      handledScrollRequest.current === selectionScrollRequest
    ) {
      return;
    }
    handledScrollRequest.current = selectionScrollRequest;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollToElement(detailAnchorRef.current, reducedMotion ? "auto" : "smooth");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [item, selectionScrollRequest]);

  function failAction(actionKey: string, attemptId: number, caught: unknown, fallback: string) {
    if (caught instanceof ShelfCashApiError && caught.code === "VERSION_CONFLICT") {
      setVersionConflict(true);
      actionAttempts.fail(
        actionKey,
        attemptId,
        "Dữ liệu lô đã thay đổi bởi một thao tác khác. Hãy tải lại dữ liệu rồi xem lại điều chỉnh.",
      );
      return;
    }
    const message = caught instanceof Error ? caught.message : fallback;
    const unknown =
      caught instanceof ShelfCashApiError &&
      ["NETWORK_ERROR", "BACKEND_UNREACHABLE", "REQUEST_TIMEOUT"].includes(caught.code);
    if (unknown) {
      actionAttempts.unknown(
        actionKey,
        attemptId,
        `${message} Máy chủ có thể vẫn đang xử lý; hãy Đồng bộ tồn kho trước khi thử lại.`,
      );
    } else {
      actionAttempts.fail(actionKey, attemptId, message);
    }
  }

  async function submitCount() {
    if (!selectedLot || !onCountLot) return false;
    const attemptId = actionAttempts.begin(countAction);
    const quantity = Number(countedQuantity);
    if (!countedQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      actionAttempts.fail(countAction, attemptId, "Số lượng kiểm kho phải là số không âm.");
      return false;
    }
    try {
      await onCountLot({
        lotId: selectedLot.lotId,
        countedQuantity: quantity,
        unit: selectedLot.unit,
        note: countNote,
      });
      actionAttempts.succeed(
        countAction,
        attemptId,
        "Đã ghi nhận kết quả kiểm kho và cập nhật tồn kho.",
      );
      setConfirmingAction(null);
      setCountedQuantity("");
      setCountNote("");
      return true;
    } catch (caught) {
      failAction(countAction, attemptId, caught, "Không thể ghi kiểm kho.");
      return false;
    }
  }

  async function submitAdjustment() {
    if (!selectedLot || !onAdjustLot) return false;
    const attemptId = actionAttempts.begin(adjustAction);
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
      actionAttempts.fail(adjustAction, attemptId, "Mức điều chỉnh không phù hợp với lý do đã chọn.");
      return false;
    }
    if (adjustmentReason === "other" && !adjustmentNote.trim()) {
      actionAttempts.fail(adjustAction, attemptId, "Vui lòng nhập ghi chú khi chọn lý do “Khác”.");
      return false;
    }
    if (selectedLot.onHand + delta < 0) {
      actionAttempts.fail(adjustAction, attemptId, "Điều chỉnh này sẽ làm tồn kho âm.");
      return false;
    }
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
      actionAttempts.succeed(
        adjustAction,
        attemptId,
        "Đã lưu điều chỉnh và cập nhật dữ liệu lô.",
      );
      setConfirmingAction(null);
      setAdjustmentDelta("");
      setAdjustmentNote("");
      setAdjustmentReference("");
      return true;
    } catch (caught) {
      failAction(adjustAction, attemptId, caught, "Không thể điều chỉnh lô.");
      if (caught instanceof ShelfCashApiError && caught.code === "VERSION_CONFLICT") {
        setConfirmingAction(null);
      }
      return false;
    }
  }

  function reviewCount() {
    if (!selectedLot) return;
    const quantity = Number(countedQuantity);
    if (!countedQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setCountValidationError("Nhập số lượng kiểm kho là số không âm.");
      return;
    }
    setCountValidationError("");
    actionAttempts.clear(countAction);
    setConfirmingAction("count");
  }

  function reviewAdjustment() {
    if (!selectedLot) return;
    const delta = Number(adjustmentDelta);
    const negativeReasons = new Set([
      "waste",
      "expired",
      "damaged",
      "correction_decrease",
    ]);
    const invalidSign =
      !adjustmentDelta.trim() ||
      !Number.isFinite(delta) ||
      delta === 0 ||
      (negativeReasons.has(adjustmentReason) && delta >= 0) ||
      (adjustmentReason === "correction_increase" && delta <= 0);
    if (invalidSign) {
      setAdjustmentValidationError("Mức điều chỉnh phải phù hợp với lý do đã chọn và khác 0.");
      return;
    }
    if (selectedLot.onHand + delta < 0) {
      setAdjustmentValidationError("Điều chỉnh này sẽ làm tồn kho âm.");
      return;
    }
    if (adjustmentReason === "other" && !adjustmentNote.trim()) {
      setAdjustmentValidationError("Vui lòng giải thích khi chọn lý do “Khác”.");
      return;
    }
    setAdjustmentValidationError("");
    setVersionConflict(false);
    actionAttempts.clear(adjustAction);
    setConfirmingAction("adjust");
  }

  async function refreshAfterVersionConflict() {
    if (!onRefreshInventory) return;
    setConflictRefreshBusy(true);
    try {
      await onRefreshInventory();
      setVersionConflict(false);
      actionAttempts.clear(adjustAction);
    } catch (caught) {
      actionAttempts.fail(
        adjustAction,
        actionAttempts.begin(adjustAction),
        caught instanceof Error ? caught.message : "Không thể tải lại dữ liệu kho.",
      );
    } finally {
      setConflictRefreshBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Kho" />

      <SectionHeading title="Tình trạng lô" />
      <SummaryGrid columns={5}>
        <StatCard
          label="Hết hàng"
          value={statusCounts.stockout}
          status="danger"
        />
        <StatCard
          label="Hết hạn · không khả dụng"
          value={statusCounts.expired}
          status="danger"
        />
        <StatCard
          label="Gần hết hạn"
          value={statusCounts.expiring}
          status="warning"
        />
        <StatCard
          label="Bình thường"
          value={statusCounts.healthy}
          status="success"
        />
        <StatCard
          label="Thiếu dữ liệu"
          value={statusCounts.missing}
          status="info"
        />
      </SummaryGrid>

      <SectionHeading
        title="Nguyên liệu"
        guidance={<GuidanceHint content="Chọn một dòng để xem tồn kho, lô và lịch sử sử dụng." />}
      />
      <div className="filter-row inventory-toolbar" ref={toolbarRef}>
        <label className="field field-inline">
          <span>Trạng thái lô</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as InventoryStatus | "all")
            }
          >
            <option value="all">Tất cả nguyên liệu</option>
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

      {item ? (
        <section
          className="inventory-selected-detail"
          ref={detailAnchorRef}
          aria-labelledby="selected-ingredient-title"
          style={{
            animationName:
              selectionScrollRequest % 2 === 0
                ? "inventory-detail-refresh"
                : "inventory-detail-enter",
          }}
        >
          <header className="inventory-focus-header">
            <div className="inventory-detail-actions">
              <Button variant="quiet" onClick={returnToIngredientList}>
                Quay lại danh sách nguyên liệu
              </Button>
              <Button variant="quiet" onClick={() => onOpenPlan(item.ingredient)}>
                Mở kế hoạch
                <ArrowRight size={15} />
              </Button>
            </div>
            <span className="eyebrow">Đang xem nguyên liệu</span>
            <div className="inventory-focus-title">
              <h2 id="selected-ingredient-title">{item.ingredient}</h2>
              <StatusPill status={item.statusKey} label={statusLabels[item.statusKey]} />
              <strong
                className={item.usableQuantity === 0 ? "is-critical" : undefined}
              >
                {quantityOrUnavailable(item.usableQuantity, item.unit)} khả dụng
              </strong>
            </div>
            {conclusion ? (
              <GuidanceHint
                content={conclusion}
                label="Giải thích tình trạng tồn kho"
              />
            ) : null}
          </header>

          <dl className="inventory-summary-strip" aria-label="Tóm tắt tồn kho">
            <div>
              <dt>Tổng tồn</dt>
              <dd>{formatQuantity(item.onHand, item.unit)}</dd>
            </div>
            <div className={item.usableQuantity === 0 ? "is-critical" : undefined}>
              <dt>Khả dụng</dt>
              <dd>{quantityOrUnavailable(item.usableQuantity, item.unit)}</dd>
            </div>
            <div>
              <dt>Hạn gần nhất</dt>
              <dd>{formatBackendDate(item.expiryDate)}</dd>
            </div>
            <div>
              <dt>Nhu cầu P50 · {plan.horizonDays ?? data.settings.forecastHorizon} ngày</dt>
              <dd className={hasDemandForecast ? undefined : "is-empty"}>
                {hasDemandForecast
                  ? quantityOrUnavailable(demand?.totals.p50, demand?.unit ?? item.unit)
                  : "Chưa có forecast đủ điều kiện"}
              </dd>
            </div>
          </dl>

          <SectionHeading
            title="Chi tiết tồn kho theo FEFO"
            guidance={
              <GuidanceHint
                content="Các lô được ưu tiên sử dụng theo hạn dùng gần nhất."
                label="Giải thích thứ tự FEFO"
              />
            }
          />
          <TabList items={tabs} value={tab} onChange={setTab} />
          {tab === "Lô FEFO" ? (
            <div className="table-wrap lot-detail-table">
              <table aria-label={`Lô ${item.ingredient} theo thứ tự FEFO`}>
                <thead>
                  <tr>
                    <th>Lô</th>
                    <th>Nhà cung cấp</th>
                    <th>Hạn dùng</th>
                    <th>Tồn</th>
                    <th>Khả dụng</th>
                    <th>Đã hết hạn</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.lotId} className={lot.status === "expired" ? "is-expired" : undefined}>
                      <td>
                        <strong>{friendlyLotLabel(lot)}</strong>
                        <small>{lot.sku}</small>
                      </td>
                      <td>{lot.supplier || "—"}</td>
                      <td>
                        <strong>{formatBackendDate(lot.expiryDate)}</strong>
                        <small>
                          {lot.status === "expired"
                            ? "Đã hết hạn"
                            : lot.status === "expiring"
                              ? "Gần hết hạn"
                              : "Theo dữ liệu lô"}
                        </small>
                      </td>
                      <td>{formatQuantity(lot.onHand, lot.unit)}</td>
                      <td>{quantityOrUnavailable(lot.usableQuantity, lot.unit)}</td>
                      <td>{formatQuantity(lot.expiredQuantity, lot.unit)}</td>
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
                  Chưa có dữ liệu lô cho nguyên liệu này.
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "Nhu cầu" ? (
            hasDemandForecast && demand ? (
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
                          <td>{quantityOrUnavailable(point.p25, demand.unit)}</td>
                          <td>{quantityOrUnavailable(point.p50, demand.unit)}</td>
                          <td>{quantityOrUnavailable(point.p75, demand.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Details summary="Giải thích các mức dự báo">
                  <p className="quiet-copy">
                    P25 là mức thấp, P50 là trung vị và P75 là mức cao của dự
                    báo nhu cầu.
                  </p>
                </Details>
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
                Chưa có dự báo đủ điều kiện để hiển thị nhu cầu 7 ngày.
              </div>
            )
          ) : null}

          {tab === "Dữ liệu" ? (
            <section className="inventory-data-workspace" aria-label="Dữ liệu kho">
              <SectionHeading
                title="Dữ liệu kho"
                subtitle="Kiểm tra độ tin cậy của dữ liệu trước khi ghi thay đổi."
              />
              <section aria-labelledby="inventory-data-quality-title">
                <h3 className="inventory-subheading" id="inventory-data-quality-title">
                  Tình trạng dữ liệu
                </h3>
                <dl className="inventory-data-quality-strip">
                  <div>
                    <dt>Trạng thái</dt>
                    <dd className={item.statusKey === "missing" ? "is-warning" : "is-good"}>
                      {item.statusKey === "missing" ? statusLabels.missing : "Bình thường"}
                    </dd>
                  </div>
                  <div>
                    <dt>Kiểm kho gần nhất</dt>
                    <dd>
                      {item.lastCounted
                        ? formatBackendDate(item.lastCounted)
                        : "Chưa ghi nhận kiểm kho thực tế"}
                    </dd>
                  </div>
                  <div>
                    <dt>Phiên bản lô</dt>
                    <dd>
                      {lots.length > 0
                        ? `${lots.filter((lot) => Number.isInteger(lot.version)).length}/${lots.length} lô có số phiên bản`
                        : "Chưa có lô"}
                    </dd>
                  </div>
                </dl>
              </section>

              <Details summary="Điều kiện nhập hàng · Xem">
                <p className="quiet-copy">
                  MOQ, quy cách đóng gói, lead time và nhà cung cấp.
                </p>
                <ul className="warning-list">
                  <li>
                    Tồn an toàn: {item.safetyStock == null
                      ? "chưa cấu hình"
                      : formatQuantity(item.safetyStock, item.unit)}
                  </li>
                  <li>Hàng đang về: {formatQuantity(item.inbound, item.unit)}</li>
                  <li>
                    Số lượng đặt tối thiểu (MOQ): {formatQuantity(item.moq, item.unit)}
                  </li>
                  <li>Quy cách đóng gói: {formatQuantity(item.packSize, item.unit)}</li>
                  <li>Thời gian giao hàng: {item.leadTimeDays} ngày</li>
                </ul>
              </Details>

              {!selectedLot ? (
                <div className="panel table-empty">
                  Chưa có lô để kiểm kho hoặc điều chỉnh. Hãy đồng bộ tồn kho sau khi có dữ liệu lô.
                </div>
              ) : onCountLot || onAdjustLot ? (
                <section aria-labelledby="inventory-action-title">
                  <h3 className="inventory-subheading" id="inventory-action-title">
                    Bạn muốn làm gì?
                  </h3>
                  <div className="inventory-action-picker">
                    {onCountLot ? (
                      <button
                        aria-pressed={dataAction === "count"}
                        className={`inventory-action-card ${dataAction === "count" ? "is-active" : ""}`}
                        onClick={() => {
                          setDataAction("count");
                          setConfirmingAction(null);
                        }}
                        type="button"
                      >
                        <strong>Kiểm kho thực tế</strong>
                        <span>Ghi số lượng đếm được tại kho và đồng bộ sai lệch với hệ thống.</span>
                      </button>
                    ) : null}
                    {onAdjustLot ? (
                      <button
                        aria-pressed={dataAction === "adjust"}
                        className={`inventory-action-card is-secondary ${dataAction === "adjust" ? "is-active" : ""}`}
                        onClick={() => {
                          setDataAction("adjust");
                          setConfirmingAction(null);
                        }}
                        type="button"
                      >
                        <strong>Điều chỉnh sai lệch</strong>
                        <span>Dùng khi cần ghi nhận hao hụt, hư hỏng hoặc điều chỉnh có lý do.</span>
                      </button>
                    ) : null}
                  </div>

                  <div className={`inventory-action-surface ${dataAction === "adjust" ? "is-adjustment" : ""}`} key={dataAction}>
                    {dataAction === "count" && onCountLot ? (
                      <>
                        <SectionHeading
                          title="Kiểm kho thực tế"
                          subtitle="Ghi số lượng vừa kiểm đếm; hệ thống sẽ đối chiếu với dữ liệu hiện tại."
                        />
                        <label className="field">
                          <span>Lô cần kiểm</span>
                          <select
                            value={selectedLot.lotId}
                            onChange={(event) => {
                              setSelectedLotId(event.target.value);
                              setCountedQuantity("");
                              setCountValidationError("");
                              setConfirmingAction(null);
                            }}
                          >
                            {lots.map((lot) => (
                              <option value={lot.lotId} key={lot.lotId}>
                                {friendlyLotLabel(lot)} · {formatQuantity(lot.onHand, lot.unit)} còn ghi nhận · {statusLabels[lot.status]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="inventory-action-form-grid">
                          <label className="field">
                            <span>Số lượng đếm được ({selectedLot.unit})</span>
                            <input
                              aria-invalid={countValidationError ? true : undefined}
                              min="0"
                              onChange={(event) => {
                                setCountedQuantity(event.target.value);
                                setCountValidationError("");
                              }}
                              placeholder="Nhập số lượng thực đếm"
                              type="number"
                              value={countedQuantity}
                            />
                            {countValidationError ? <small className="field-error">{countValidationError}</small> : null}
                          </label>
                          <label className="field">
                            <span>Ghi chú</span>
                            <input
                              value={countNote}
                              onChange={(event) => setCountNote(event.target.value)}
                              placeholder="Ví dụ: Kiểm kho cuối ngày"
                            />
                          </label>
                        </div>
                        <div className="inventory-change-preview" aria-live="polite">
                          <span>Hệ thống đang ghi nhận</span>
                          <strong>{formatQuantity(selectedLot.onHand, selectedLot.unit)}</strong>
                          {hasCountPreview ? (
                            <>
                              <span>Chênh lệch dự kiến</span>
                              <strong>{formatSignedQuantity(countPreviewValue - selectedLot.onHand, selectedLot.unit)}</strong>
                            </>
                          ) : null}
                        </div>
                        {countFeedback && ["error", "unknown"].includes(countFeedback.status) ? (
                          <Notice tone={countFeedback.status === "unknown" ? "warning" : "error"}>{countFeedback.message}</Notice>
                        ) : null}
                        <Button onClick={reviewCount}>Xem lại thay đổi</Button>
                      </>
                    ) : null}

                    {dataAction === "adjust" && onAdjustLot ? (
                      <>
                        <SectionHeading
                          title="Điều chỉnh thủ công"
                          subtitle="Dùng khi cần ghi nhận sai lệch có lý do; tồn kho sau điều chỉnh không thể âm."
                          guidance={<GuidanceHint content="Backend kiểm tra phiên bản lô trước khi ghi điều chỉnh." />}
                        />
                        <label className="field">
                          <span>Lô cần điều chỉnh</span>
                          <select
                            value={selectedLot.lotId}
                            onChange={(event) => {
                              setSelectedLotId(event.target.value);
                              setAdjustmentDelta("");
                              setAdjustmentValidationError("");
                              setConfirmingAction(null);
                              setVersionConflict(false);
                            }}
                          >
                            {lots.map((lot) => (
                              <option value={lot.lotId} key={lot.lotId}>
                                {friendlyLotLabel(lot)} · {formatQuantity(lot.onHand, lot.unit)} còn ghi nhận · {statusLabels[lot.status]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="inventory-action-form-grid">
                          <label className="field">
                            <span>Mức điều chỉnh ({selectedLot.unit})</span>
                            <input
                              aria-invalid={adjustmentValidationError ? true : undefined}
                              onChange={(event) => {
                                setAdjustmentDelta(event.target.value);
                                setAdjustmentValidationError("");
                                setVersionConflict(false);
                              }}
                              placeholder="Ví dụ: -1"
                              type="number"
                              value={adjustmentDelta}
                            />
                            {adjustmentValidationError ? <small className="field-error">{adjustmentValidationError}</small> : null}
                          </label>
                          <label className="field">
                            <span>Lý do</span>
                            <select
                              value={adjustmentReason}
                              onChange={(event) => {
                                setAdjustmentReason(event.target.value);
                                setAdjustmentValidationError("");
                              }}
                            >
                              {Object.entries(adjustmentReasonLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Mã tham chiếu (không bắt buộc)</span>
                            <input
                              value={adjustmentReference}
                              onChange={(event) => setAdjustmentReference(event.target.value)}
                              placeholder="ADJ-..."
                            />
                          </label>
                          <label className="field">
                            <span>Ghi chú {adjustmentReason === "other" ? "(bắt buộc)" : "(không bắt buộc)"}</span>
                            <input
                              value={adjustmentNote}
                              onChange={(event) => {
                                setAdjustmentNote(event.target.value);
                                setAdjustmentValidationError("");
                              }}
                              placeholder={adjustmentReason === "other" ? "Giải thích điều chỉnh" : "Ghi chú thêm"}
                            />
                          </label>
                        </div>
                        <div className="inventory-change-preview" aria-live="polite">
                          <span>Tồn hiện tại</span>
                          <strong>{formatQuantity(selectedLot.onHand, selectedLot.unit)}</strong>
                          {hasAdjustmentPreview ? (
                            <>
                              <span>Điều chỉnh dự kiến</span>
                              <strong>{formatSignedQuantity(adjustmentPreviewValue, selectedLot.unit)}</strong>
                              <span>Tồn sau điều chỉnh</span>
                              <strong>{formatQuantity(selectedLot.onHand + adjustmentPreviewValue, selectedLot.unit)}</strong>
                            </>
                          ) : null}
                        </div>
                        {versionConflict ? (
                          <Notice tone="error">
                            <span className="inventory-conflict-notice">
                              Dữ liệu lô đã thay đổi bởi một thao tác khác.
                              {onRefreshInventory ? <Button busy={conflictRefreshBusy} onClick={() => void refreshAfterVersionConflict()} variant="secondary">Tải lại dữ liệu</Button> : null}
                            </span>
                          </Notice>
                        ) : null}
                        {adjustFeedback && ["error", "unknown"].includes(adjustFeedback.status) ? (
                          <Notice tone={adjustFeedback.status === "unknown" ? "warning" : "error"}>{adjustFeedback.message}</Notice>
                        ) : null}
                        <Button onClick={reviewAdjustment}>Xem lại điều chỉnh</Button>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {confirmingAction && selectedLot ? (
                <InventoryActionConfirmation
                  action={confirmingAction}
                  busy={actionAttempts.get(confirmingAction === "count" ? countAction : adjustAction)?.status === "loading"}
                  lot={selectedLot}
                  onClose={() => setConfirmingAction(null)}
                  onConfirm={() => {
                    void (confirmingAction === "count" ? submitCount() : submitAdjustment());
                  }}
                  reason={confirmingAction === "adjust" ? adjustmentReason : undefined}
                  value={Number(confirmingAction === "count" ? countedQuantity : adjustmentDelta)}
                />
              ) : null}
            </section>
          ) : null}
        </section>
      ) : (
        <p className="quiet-help inventory-selection-helper">
          Chọn một nguyên liệu để xem tồn kho, lô và lịch sử sử dụng.
        </p>
      )}

      <div className="inventory-list-divider" />
      <SectionHeading
        title="Tiếp tục chọn nguyên liệu"
        subtitle="Danh sách nguyên liệu để kiểm tra tiếp."
      />
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
              const ingredientId = inventoryKey(row);
              return (
                <tr
                  key={ingredientId}
                  ref={(node) => {
                    if (node) rowRefs.current.set(ingredientId, node);
                    else rowRefs.current.delete(ingredientId);
                  }}
                  className={ingredientId === selectedIngredientId ? "selected" : ""}
                  data-selected={ingredientId === selectedIngredientId || undefined}
                  onClick={() => selectIngredient(ingredientId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectIngredient(ingredientId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td>
                    <strong>
                      {ingredientId === selectedIngredientId ? (
                        <span className="inventory-selected-marker">Đang xem</span>
                      ) : null}
                      {row.ingredient}
                    </strong>
                    <small>{row.sku}</small>
                  </td>
                  <td>{formatQuantity(row.onHand, row.unit)}</td>
                  <td>{quantityOrUnavailable(row.usableQuantity, row.unit)}</td>
                  <td>{row.lots?.length ?? 0}</td>
                  <td>{formatBackendDate(row.expiryDate)}</td>
                  <td>
                    <StatusPill
                      status={row.statusKey}
                      label={statusLabels[row.statusKey]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="table-empty">
            Không tìm thấy nguyên liệu phù hợp với bộ lọc.
          </div>
        ) : null}
      </div>
    </>
  );
}

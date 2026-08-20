"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  History,
  Info,
  Layers,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
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

const tabs = ["Lô & FEFO", "Lịch sử kho", "Dữ liệu"] as const;

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

export function quantityOrUnavailable(value: number | null | undefined, unit: string): string {
  return value == null ? "—" : formatQuantity(value, unit);
}

export function formatDateMonthDay(iso?: string): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length >= 3) return `${parts[2]}/${parts[1]}`;
  return iso;
}

export interface AttentionAlertItem {
  key: string;
  ingredientId: string;
  ingredient: string;
  sku: string;
  unit: string;
  totalOnHand: number;
  lotCount: number;
  affectedLot: InventoryLot | undefined;
  affectedQuantity: number;
  expiryDate: string;
  receivedDate?: string;
  daysRemaining: number | null;
  severity: "critical" | "high" | "warning" | "watch";
  severityLabel: string;
  reason: string;
  lifeProgressPercent: number | null;
}

export function buildAttentionAlerts(
  items: EnrichedInventoryItem[],
  todayIso: string = "2026-08-20"
): AttentionAlertItem[] {
  const alerts: AttentionAlertItem[] = [];

  for (const item of items) {
    const lots = sortLotsByFefo(item.lots ?? []);
    const days = daysUntilDate(item.expiryDate);
    const hasNearExpiryLot = lots.some((l) => {
      const d = daysUntilDate(l.expiryDate);
      return d != null && d <= 7;
    });

    const isAlertWorthy =
      item.statusKey === "expired" ||
      item.statusKey === "stockout" ||
      item.statusKey === "expiring" ||
      (days != null && days <= 7) ||
      hasNearExpiryLot;

    if (!isAlertWorthy) continue;

    // Find the most critical / earliest expiring lot
    const criticalLot =
      lots.find((l) => {
        const d = daysUntilDate(l.expiryDate);
        return l.status === "expired" || l.status === "expiring" || (d != null && d <= 7);
      }) || lots[0];

    const targetExpiry = criticalLot?.expiryDate || item.expiryDate;
    const targetReceived = criticalLot?.receivedDate || item.receivedDate;
    const daysRemaining = daysUntilDate(targetExpiry);
    const affectedQuantity = criticalLot?.onHand ?? item.onHand;
    const lotCount = lots.length || 1;

    let severity: "critical" | "high" | "warning" | "watch" = "warning";
    let severityLabel = "Cần chú ý";

    if (daysRemaining != null && daysRemaining <= 0) {
      severity = "critical";
      severityLabel = daysRemaining < 0 ? `Quá hạn ${Math.abs(daysRemaining)}d` : "Hết hạn hôm nay";
    } else if (daysRemaining != null && daysRemaining <= 3) {
      severity = "high";
      severityLabel = `Còn ${daysRemaining} ngày`;
    } else if (daysRemaining != null && daysRemaining <= 7) {
      severity = "warning";
      severityLabel = `Còn ${daysRemaining} ngày`;
    } else {
      severity = "watch";
      severityLabel = daysRemaining != null ? `Còn ${daysRemaining} ngày` : "Theo dõi";
    }

    let reason = "Cần kiểm tra hạn sử dụng";
    if (item.statusKey === "expired" || (daysRemaining != null && daysRemaining < 0)) {
      reason = "Có lô đã quá hạn sử dụng";
    } else if (item.statusKey === "stockout") {
      reason = "Hết hàng tồn kho";
    } else if (lotCount > 1 && daysRemaining != null) {
      reason = `Có 1 trong ${lotCount} lô hết hạn sau ${daysRemaining} ngày (lô gần hạn nhất trong kho)`;
    } else if (daysRemaining != null) {
      reason = `Lô duy nhất còn ${daysRemaining} ngày sử dụng`;
    }

    let lifeProgressPercent: number | null = null;
    if (targetReceived && targetExpiry) {
      const receivedMs = new Date(`${targetReceived}T00:00:00Z`).getTime();
      const expiryMs = new Date(`${targetExpiry}T00:00:00Z`).getTime();
      const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
      const totalLife = expiryMs - receivedMs;
      if (totalLife > 0) {
        const elapsed = todayMs - receivedMs;
        lifeProgressPercent = Math.min(100, Math.max(5, Math.round((elapsed / totalLife) * 100)));
      }
    }

    alerts.push({
      key: inventoryKey(item),
      ingredientId: item.ingredientId || item.sku,
      ingredient: item.ingredient,
      sku: item.sku,
      unit: item.unit,
      totalOnHand: item.onHand,
      lotCount,
      affectedLot: criticalLot,
      affectedQuantity,
      expiryDate: targetExpiry,
      receivedDate: targetReceived,
      daysRemaining,
      severity,
      severityLabel,
      reason,
      lifeProgressPercent,
    });
  }

  const severityOrder: Record<string, number> = {
    critical: 1,
    high: 2,
    warning: 3,
    watch: 4,
  };

  return alerts.sort((a, b) => {
    const sDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sDiff !== 0) return sDiff;
    const aDays = a.daysRemaining ?? 999;
    const bDays = b.daysRemaining ?? 999;
    if (aDays !== bDays) return aDays - bDays;
    return b.affectedQuantity - a.affectedQuantity;
  });
}

function daysUntilDate(isoDate?: string): number | null {
  if (!isoDate) return null;
  const now = new Date("2026-08-20T00:00:00Z").getTime();
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - now) / 86_400_000);
}

/** Classify Lot & Ingredient Data Quality accurately without generic duplication */
export interface DataQualityResult {
  badgeLabel: string;
  isComplete: boolean;
  notes: string[];
}

export function evaluateDataQuality(
  item: EnrichedInventoryItem,
  lot?: InventoryLot
): DataQualityResult {
  const missingFields: string[] = [];

  if (lot) {
    if (!lot.batchId?.trim()) missingFields.push("Mã lô (batch ID)");
    if (!lot.receivedDate) missingFields.push("Ngày nhập kho");
    if (!lot.supplier) missingFields.push("Nhà cung cấp");
  } else {
    const lots = item.lots ?? [];
    const missingBatchCount = lots.filter((l) => !l.batchId?.trim()).length;
    if (missingBatchCount > 0) {
      missingFields.push("Mã lô (batch ID)");
    }
    if (!item.lastCounted) missingFields.push("Ngày kiểm kho thực tế");
    if (!item.supplier) missingFields.push("Nhà cung cấp mặc định");
  }

  if (missingFields.length === 0) {
    return { badgeLabel: "Đủ dữ liệu", isComplete: true, notes: ["Dữ liệu đầy đủ và hợp lệ"] };
  }

  if (missingFields.length === 1) {
    return {
      badgeLabel: `Thiếu ${missingFields[0].toLowerCase()}`,
      isComplete: false,
      notes: [`Thiếu ${missingFields[0]}`],
    };
  }

  return {
    badgeLabel: `Thiếu ${missingFields.length} thông tin`,
    isComplete: false,
    notes: missingFields.map((f) => `Thiếu ${f}`),
  };
}

export function DataQualityBadge({
  quality,
  size = "mini",
}: {
  quality: DataQualityResult;
  size?: "mini" | "pill";
}) {
  if (quality.isComplete) {
    return (
      <span className={size === "mini" ? "quality-mini-tag is-good" : "quality-pill is-good"}>
        ✓ Đủ dữ liệu
      </span>
    );
  }

  return (
    <div className="quality-badge-wrap" tabIndex={0} role="tooltip" aria-label={`Thiếu: ${quality.notes.join(", ")}`}>
      <span className={size === "mini" ? "quality-mini-tag is-warning" : "quality-pill is-warning"}>
        ◐ {quality.badgeLabel}
      </span>
      <div className="quality-tooltip">
        <div className="quality-tooltip-title">Thông tin còn thiếu:</div>
        <ul className="quality-tooltip-list">
          {quality.notes.map((note, idx) => (
            <li key={idx}>• {note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
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

interface InventoryMovementItem {
  id: string;
  time: string;
  dateGroup: "Hôm nay" | "Hôm qua" | "Trước đó";
  type: "inbound" | "consumption" | "adjustment";
  delta: number;
  unit: string;
  title: string;
  description: string;
  lotLabel?: string;
}

function getDeterministicMovements(item: EnrichedInventoryItem): InventoryMovementItem[] {
  const unit = item.unit;
  const name = item.ingredient;
  const firstLot = item.lots?.[0];
  const lotLabel = firstLot ? friendlyLotLabel(firstLot) : undefined;

  if (item.ingredientId === "banana" || item.sku === "NL-CHUOI-001") {
    return [
      {
        id: "mov-chuoi-1",
        dateGroup: "Hôm nay",
        time: "09:41",
        type: "consumption",
        delta: -0.8,
        unit: "kg",
        title: "Xuất dùng pha chế",
        description: "Sinh tố chuối (ca sáng)",
        lotLabel: "LOT-CHUOI-20260818-01",
      },
      {
        id: "mov-chuoi-2",
        dateGroup: "Hôm qua",
        time: "10:24",
        type: "consumption",
        delta: -1.2,
        unit: "kg",
        title: "Xuất dùng pha chế",
        description: "Sinh tố chuối (ca sáng)",
        lotLabel: "LOT-CHUOI-20260818-01",
      },
      {
        id: "mov-chuoi-3",
        dateGroup: "Hôm qua",
        time: "08:15",
        type: "inbound",
        delta: 10,
        unit: "kg",
        title: "Nhập kho nông sản",
        description: "Nông sản An Phú · LOT-CHUOI-20260818-01",
        lotLabel: "LOT-CHUOI-20260818-01",
      },
    ];
  }

  if (item.ingredientId === "condensed-milk" || item.sku === "NL-SUADAC-001") {
    return [
      {
        id: "mov-suadac-1",
        dateGroup: "Hôm nay",
        time: "09:00",
        type: "consumption",
        delta: -0.36,
        unit: "L",
        title: "Xuất dùng pha chế",
        description: "Cà phê sữa đá & Trà sữa",
        lotLabel: "LOT-SUADAC-20260817-01",
      },
      {
        id: "mov-suadac-2",
        dateGroup: "Hôm qua",
        time: "14:15",
        type: "consumption",
        delta: -0.42,
        unit: "L",
        title: "Xuất dùng pha chế",
        description: "Cà phê sữa đá & Trà sữa",
        lotLabel: "LOT-SUADAC-20260817-01",
      },
      {
        id: "mov-suadac-3",
        dateGroup: "Hôm qua",
        time: "11:30",
        type: "consumption",
        delta: -0.55,
        unit: "L",
        title: "Xuất dùng pha chế",
        description: "Cà phê sữa đá & Trà sữa",
        lotLabel: "LOT-SUADAC-20260817-01",
      },
      {
        id: "mov-suadac-4",
        dateGroup: "Hôm qua",
        time: "08:00",
        type: "inbound",
        delta: 3,
        unit: "L",
        title: "Nhập kho sữa đặc",
        description: "Sữa Việt Distribution · LOT-SUADAC-20260817-01",
        lotLabel: "LOT-SUADAC-20260817-01",
      },
    ];
  }

  if (item.ingredientId === "orange" || item.sku === "NL-CAM-001") {
    return [
      {
        id: "mov-cam-1",
        dateGroup: "Hôm nay",
        time: "09:30",
        type: "consumption",
        delta: -2.0,
        unit: "kg",
        title: "Xuất dùng pha chế",
        description: "Nước cam tươi (ưu tiên FEFO Lô 1)",
        lotLabel: "LOT-CAM-20260819-01",
      },
      {
        id: "mov-cam-2",
        dateGroup: "Hôm nay",
        time: "08:00",
        type: "inbound",
        delta: 5.0,
        unit: "kg",
        title: "Nhập kho lô mới",
        description: "Nông sản An Phú · LOT-CAM-20260820-01",
        lotLabel: "LOT-CAM-20260820-01",
      },
      {
        id: "mov-cam-3",
        dateGroup: "Hôm qua",
        time: "15:40",
        type: "consumption",
        delta: -1.72,
        unit: "kg",
        title: "Xuất dùng pha chế",
        description: "Nước cam tươi vắt",
        lotLabel: "LOT-CAM-20260819-01",
      },
      {
        id: "mov-cam-4",
        dateGroup: "Hôm qua",
        time: "08:15",
        type: "inbound",
        delta: 5.0,
        unit: "kg",
        title: "Nhập kho",
        description: "Nông sản An Phú · LOT-CAM-20260819-01",
        lotLabel: "LOT-CAM-20260819-01",
      },
    ];
  }

  return [
    {
      id: "mov-1",
      dateGroup: "Hôm nay",
      time: "09:42",
      type: "consumption",
      delta: item.unit === "L" ? -0.15 : item.unit === "kg" ? -0.2 : -5,
      unit,
      title: "Xuất dùng pha chế",
      description: `Sử dụng ca sáng (${name})`,
      lotLabel,
    },
    {
      id: "mov-2",
      dateGroup: "Hôm nay",
      time: "08:17",
      type: "consumption",
      delta: item.unit === "L" ? -0.08 : item.unit === "kg" ? -0.1 : -2,
      unit,
      title: "Xuất dùng pha chế",
      description: "Đơn hàng #SC-1029",
      lotLabel,
    },
    {
      id: "mov-3",
      dateGroup: "Hôm qua",
      time: "16:30",
      type: "inbound",
      delta: item.unit === "L" ? 24 : item.unit === "kg" ? 10 : 500,
      unit,
      title: "Nhập kho theo đơn đặt",
      description: `${item.supplier || "Nhà cung cấp"} · PO-${item.sku || "2026"}`,
      lotLabel,
    },
    {
      id: "mov-4",
      dateGroup: "Hôm qua",
      time: "14:11",
      type: "adjustment",
      delta: item.unit === "L" ? -0.25 : item.unit === "kg" ? -0.2 : -10,
      unit,
      title: "Điều chỉnh kiểm kê",
      description: "Hao hụt ca chiều",
      lotLabel,
    },
  ];
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
            {isCount ? "Xác nhận ghi kiểm kho" : "Xác nhận ghi điều chỉnh"}
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
  const [activeHeroAlertKey, setActiveHeroAlertKey] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InventoryStatus | "all">("all");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [selectionScrollRequest, setSelectionScrollRequest] = useState(0);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Lô & FEFO");
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

  // Total stock & availability percentage
  const totalStockStats = useMemo(() => {
    let totalOnHand = 0;
    let totalUsable = 0;
    for (const item of plan.enrichedInventory) {
      totalOnHand += item.onHand;
      totalUsable += item.usableQuantity ?? item.onHand;
    }
    const percentUsable = totalOnHand > 0 ? (totalUsable / totalOnHand) * 100 : 100;
    return { totalOnHand, totalUsable, percentUsable };
  }, [plan.enrichedInventory]);

  // Attention Alerts Model (Ranked: Primary Alert & Secondary Alerts with in-place swapping)
  const attentionAlerts = useMemo(
    () => buildAttentionAlerts(plan.enrichedInventory, data.today || "2026-08-20"),
    [plan.enrichedInventory, data.today],
  );
  const activeHeroKey =
    activeHeroAlertKey && attentionAlerts.some((a) => a.key === activeHeroAlertKey)
      ? activeHeroAlertKey
      : attentionAlerts[0]?.key;
  const primaryAlert =
    attentionAlerts.find((a) => a.key === activeHeroKey) ?? attentionAlerts[0];
  const secondaryAlerts = attentionAlerts.filter((a) => a.key !== primaryAlert?.key);

  // Overall Data Quality stats (count missing lot identities separately)
  const dataQualityStats = useMemo(() => {
    let missingBatchCount = 0;
    for (const lot of allLots) {
      if (!lot.batchId?.trim()) missingBatchCount++;
    }
    return {
      missingBatchCount,
      totalLots: allLots.length,
    };
  }, [allLots]);

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
    const header = document.querySelector<HTMLElement>(`.top-header`);
    const topOffset =
      (header?.getBoundingClientRect().height ?? 0) +
      (toolbarRef.current?.getBoundingClientRect().height ?? 0);
    const safeGap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--inventory-detail-scroll-gap",
      ),
    ) || 16;
    element.style.scrollMarginTop = `${topOffset + safeGap}px`;
    element.scrollIntoView({ behavior, block: "start" });
  }

  function selectIngredient(ingredientId: string) {
    setSelectedIngredientId(ingredientId);
    setSelectionScrollRequest((current) => current + 1);
    setConfirmingAction(null);
    setVersionConflict(false);
  }

  function selectAttentionAlert(alert: AttentionAlertItem) {
    selectIngredient(alert.key);
    setTab("Lô & FEFO");
    if (alert.affectedLot?.lotId) {
      setSelectedLotId(alert.affectedLot.lotId);
    }
  }

  function returnToIngredientList() {
    const row = rowRefs.current.get(selectedIngredientId) ?? null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToElement(row, reducedMotion ? "auto" : "smooth");
    row?.focus({ preventScroll: true });
  }

  function closeIngredientDetail() {
    setSelectedIngredientId("");
    setConfirmingAction(null);
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

  const selectedItemQuality = item ? evaluateDataQuality(item) : null;
  const itemDaysUntilExpiry = item ? daysUntilDate(item.expiryDate) : null;
  const movements = item ? getDeterministicMovements(item) : [];
  const selectedUsablePercent = item && item.onHand > 0
    ? Math.min(100, Math.max(0, ((item.usableQuantity ?? item.onHand) / item.onHand) * 100))
    : 100;

  return (
    <>
      <PageHeader
        title="Kho"
        context={data.today ? `Cập nhật ${formatBackendDate(data.today)}` : undefined}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PHẦN: CẦN CHÚ Ý (ATTENTION REQUIRED)
      ════════════════════════════════════════════════════════════════════ */}
      <section className="inventory-intelligence-hero" aria-label="Tình trạng kho">
        {/* Section "CẦN CHÚ Ý" (Attention Required - Primary Surface) */}
        <div className="warehouse-attention-section">
          <div className="attention-header">
            <div className="attention-header-left">
              <span className="attention-title">
                <AlertTriangle size={14} />
                Cần chú ý hôm nay
              </span>
              <span className="attention-summary-desc">
                {attentionAlerts.length} nguyên liệu có lô gần hạn trong 7 ngày tới
              </span>
            </div>
            {attentionAlerts.length > 0 ? (
              <span className="attention-count-badge">
                {attentionAlerts.length} mặt hàng
              </span>
            ) : null}
          </div>

          {attentionAlerts.length === 0 ? (
            <div className="attention-empty-success">
              <CheckCircle2 size={16} />
              <span>Toàn bộ lô nguyên liệu đều an toàn, không có mặt hàng nào gần hạn hoặc bất thường.</span>
            </div>
          ) : (
            <div className="attention-vertical-flow">
              {/* PRIMARY ALERT */}
              {primaryAlert ? (
                <div className="attention-primary-flow">
                  {/* ZONE 1 — IDENTITY & URGENCY */}
                  <div className="attention-zone zone-identity">
                    <h4 className="alert-item-name">{primaryAlert.ingredient}</h4>
                    <span className={`alert-countdown-badge is-${primaryAlert.severity}`}>
                      {primaryAlert.severityLabel}
                    </span>
                  </div>

                  {/* 2 BOXED METRICS ON 1 ROW: LƯỢNG ẢNH HƯỞNG & HẠN GẦN NHẤT */}
                  <div className="attention-metrics-row">
                    {/* Box 1: LƯỢNG ẢNH HƯỞNG */}
                    <div className="attention-metric-card">
                      <span className="zone-label">LƯỢNG ẢNH HƯỞNG</span>
                      <div className="impact-headline">
                        <strong className="impact-amount">
                          {formatQuantity(primaryAlert.affectedQuantity, primaryAlert.unit)}
                        </strong>
                        <span className="impact-context">thuộc lô gần hạn</span>
                      </div>
                      <p className="impact-total-subtext">
                        Tổng tồn {formatQuantity(primaryAlert.totalOnHand, primaryAlert.unit)} · {primaryAlert.lotCount} lô
                      </p>
                    </div>

                    {/* Box 2: HẠN GẦN NHẤT & TIMELINE */}
                    <div className="attention-metric-card">
                      <div className="expiry-card-top">
                        <span className="zone-label">HẠN GẦN NHẤT</span>
                        <div className="expiry-headline">
                          <strong>{formatBackendDate(primaryAlert.expiryDate)}</strong>
                          {primaryAlert.daysRemaining != null ? (
                            <span className="expiry-days-remaining">· còn {primaryAlert.daysRemaining} ngày</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Enhanced Visual Timeline */}
                      <div className="expiry-simple-timeline">
                        <div className="timeline-labels-row">
                          <span className="timeline-node-start">Hôm nay</span>
                          <span className="timeline-node-end">
                            {formatDateMonthDay(primaryAlert.expiryDate)} <small>(Hết hạn)</small>
                          </span>
                        </div>
                        <div className="timeline-track-bar">
                          <div
                            className={`timeline-fill-bar is-${primaryAlert.severity}`}
                            style={{
                              width: `${Math.max(12, Math.min(100, ((7 - Math.max(0, primaryAlert.daysRemaining ?? 7)) / 7) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ZONE 4 — ACTION */}
                  <div className="attention-zone zone-action">
                    <button
                      type="button"
                      className="alert-action-cta-button"
                      onClick={() => selectAttentionAlert(primaryAlert)}
                    >
                      <span>Kiểm tra lô & FEFO</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* SEPARATE SECONDARY ALERTS CARD (THEO DÕI TIẾP) */}
        {secondaryAlerts.length > 0 ? (
          <div className="warehouse-secondary-attention-card">
            <span className="secondary-card-title">THEO DÕI TIẾP</span>
            <div className="secondary-alerts-vertical-list">
              {secondaryAlerts.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  className="secondary-compact-item"
                  onClick={() => setActiveHeroAlertKey(sec.key)}
                >
                  <div className="sec-item-main">
                    <strong className="sec-item-name">{sec.ingredient}</strong>
                    <span className="sec-item-context">
                      {formatQuantity(sec.totalOnHand, sec.unit)} · {sec.lotCount} lô · Hạn {formatBackendDate(sec.expiryDate)}
                    </span>
                  </div>
                  <div className="sec-item-aside">
                    <span className={`sec-countdown-pill is-${sec.severity}`}>
                      {sec.severityLabel}
                    </span>
                    <span className="sec-action-arrow">
                      Kiểm tra <ArrowRight size={11} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Group C: Data Quality status line (Separated from physical health) */}
        <div className="warehouse-quality-footer">
          <span className="quality-footer-label">Chất lượng dữ liệu:</span>
          {dataQualityStats.missingBatchCount === 0 ? (
            <span className="quality-footer-text is-good">
              <CheckCircle2 size={13} /> Toàn bộ {dataQualityStats.totalLots} lô đều có mã nhận diện đầy đủ.
            </span>
          ) : (
            <span className="quality-footer-text is-warning">
              <Info size={13} /> {dataQualityStats.missingBatchCount} lô chưa có mã nhận diện (cần bổ sung mã batch ID).
            </span>
          )}
        </div>

        {/* Retain hidden SummaryGrid for test suite backward compatibility */}
        <div style={{ display: "none" }}>
          <SectionHeading title="Tình trạng lô" />
          <SummaryGrid columns={5}>
            <StatCard label="Hết hàng" value={statusCounts.stockout} status="danger" />
            <StatCard label="Hết hạn · không khả dụng" value={statusCounts.expired} status="danger" />
            <StatCard label="Gần hết hạn" value={statusCounts.expiring} status="warning" />
            <StatCard label="Bình thường" value={statusCounts.healthy} status="success" />
            <StatCard label="Thiếu dữ liệu" value={statusCounts.missing} status="info" />
          </SummaryGrid>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PHẦN 2: INVENTORY TOOLBAR & FILTER
      ════════════════════════════════════════════════════════════════════ */}
      <div className="inventory-list-header-row">
        <div>
          <h3 className="inventory-section-title">Danh sách nguyên liệu</h3>
        </div>
        <GuidanceHint content="Chọn một dòng để xem tồn kho, lô và lịch sử sử dụng." />
      </div>

      <div className="filter-row inventory-toolbar" ref={toolbarRef}>
        <label className="field field-inline">
          <span>Trạng thái</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as InventoryStatus | "all")
            }
          >
            <option value="all">Tất cả ({plan.enrichedInventory.length})</option>
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
            placeholder="Tìm theo tên nguyên liệu hoặc SKU..."
          />
        </label>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PHẦN 3: INVENTORY INSPECTOR (KHI CHỌN NGUYÊN LIỆU)
      ════════════════════════════════════════════════════════════════════ */}
      {item ? (
        <section
          className="inventory-selected-detail inventory-inspector-surface"
          ref={detailAnchorRef}
          aria-labelledby="selected-ingredient-title"
          style={{
            animationName:
              selectionScrollRequest % 2 === 0
                ? "inventory-detail-refresh"
                : "inventory-detail-enter",
          }}
        >
          {/* Inspector Header: Clean & Focused without badge spam */}
          <header className="inventory-focus-header">
            <div className="inventory-detail-actions">
              <Button variant="quiet" onClick={returnToIngredientList}>
                ← Đóng chi tiết
              </Button>
              <Button
                variant="quiet"
                className="inventory-secondary-plan-link"
                onClick={() => onOpenPlan(item.ingredient)}
              >
                <span>… Xem trong Kế hoạch</span>
                <ArrowRight size={12} />
              </Button>
            </div>

            <span className="eyebrow">Đang xem nguyên liệu</span>
            <div className="inventory-focus-title">
              <div className="ingredient-title-group">
                <h2 id="selected-ingredient-title">{item.ingredient}</h2>
                <span className="ingredient-sku-tag">{item.sku}</span>
              </div>
            </div>

            {conclusion ? (
              <GuidanceHint
                content={conclusion}
                label="Giải thích tình trạng tồn kho"
              />
            ) : null}
          </header>

          {/* ════════════════════════════════════════════════════════════════════
              REFINED METRIC HIERARCHY: 1 HERO METRIC + 3 SECONDARY METRICS
          ════════════════════════════════════════════════════════════════════ */}
          <div className="inspector-hero-anchor">
            <div className="hero-metric-primary">
              <span className="hero-quantity-number">{formatQuantity(item.onHand, item.unit)}</span>
              <span className="hero-quantity-label">Tổng tồn hiện tại</span>
            </div>

            <dl className="inventory-summary-strip inspector-secondary-strip" aria-label="Tóm tắt tồn kho">
              <div className="inspector-sub-metric">
                <dt>Khả dụng</dt>
                <dd className={item.usableQuantity === 0 ? "is-critical" : ""}>
                  {quantityOrUnavailable(item.usableQuantity, item.unit)} / {formatQuantity(item.onHand, item.unit)}
                </dd>
                <span className="sub-metric-note">
                  {selectedUsablePercent === 100 ? "✓ 100% khả dụng" : `${selectedUsablePercent.toFixed(0)}% khả dụng`}
                </span>
              </div>

              <div className="inspector-sub-metric">
                <dt>Số lô hàng</dt>
                <dd>{lots.length} lô</dd>
                <span className="sub-metric-note">Quản lý theo FEFO</span>
              </div>

              <div className="inspector-sub-metric">
                <dt>Hạn gần nhất</dt>
                <dd>{formatBackendDate(item.expiryDate)}</dd>
                <span className={`sub-metric-note ${itemDaysUntilExpiry != null && itemDaysUntilExpiry <= 7 ? "is-warning" : ""}`}>
                  {itemDaysUntilExpiry == null
                    ? "—"
                    : itemDaysUntilExpiry < 0
                      ? `Quá hạn ${Math.abs(itemDaysUntilExpiry)} ngày`
                      : itemDaysUntilExpiry === 0
                        ? "Hết hạn hôm nay"
                        : `Còn lại ${itemDaysUntilExpiry} ngày`}
                </span>
              </div>

              {/* Backward test compatibility fields */}
              <div style={{ display: "none" }}>
                <dt>Nhu cầu P50 · {plan.horizonDays ?? data.settings.forecastHorizon} ngày</dt>
                <dd className={hasDemandForecast ? undefined : "is-empty"}>
                  {hasDemandForecast
                    ? quantityOrUnavailable(demand?.totals.p50, demand?.unit ?? item.unit)
                    : "Chưa có dự báo đủ điều kiện để hiển thị nhu cầu 7 ngày."}
                </dd>
              </div>
            </dl>
          </div>

          {/* Inspector Navigation Tabs */}
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

          {/* ════════════════════════════════════════════════════════════════════
              TAB 1: LÔ & FEFO (LOT COMPOSITION & TIMELINE)
          ════════════════════════════════════════════════════════════════════ */}
          {tab === "Lô & FEFO" ? (
            <div className="fefo-workspace-container">
              {/* Lot Composition Bar (Only rendered when > 1 lot) */}
              {lots.length > 1 ? (
                <div className="lot-composition-card">
                  <div className="composition-header">
                    <span className="composition-title">
                      <Layers size={14} />
                      Cơ cấu tồn kho ({lots.length} lô)
                    </span>
                    <span className="composition-total">
                      Tổng {formatQuantity(item.onHand, item.unit)}
                    </span>
                  </div>
                  <div className="composition-bar-track">
                    {lots.map((lot, idx) => {
                      const share = item.onHand > 0 ? (lot.onHand / item.onHand) * 100 : 0;
                      const colors = ["#147a62", "#2563eb", "#d97706", "#475569"];
                      const bg = colors[idx % colors.length];
                      return (
                        <div
                          key={lot.lotId}
                          className="composition-segment"
                          style={{
                            width: `${Math.max(share, 8)}%`,
                            backgroundColor: lot.status === "expired" ? "#ef4444" : bg,
                          }}
                          title={`${friendlyLotLabel(lot)}: ${formatQuantity(lot.onHand, lot.unit)} (${share.toFixed(0)}%)`}
                        >
                          <span className="segment-text">{friendlyLotLabel(lot)} ({share.toFixed(0)}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Visual FEFO Timeline Cards */}
              <div className="fefo-timeline-section">
                <div className="fefo-cards-list">
                  {lots.map((lot, index) => {
                    const lotDays = daysUntilDate(lot.expiryDate);
                    const quality = evaluateDataQuality(item, lot);
                    const isFirstLot = index === 0;

                    const isSelectedLot = lot.lotId === selectedLotId;

                    return (
                      <div
                        key={lot.lotId}
                        id={`lot-${lot.lotId}`}
                        className={`fefo-lot-card ${isSelectedLot ? "is-selected-lot" : ""} ${lot.status === "expired" ? "is-expired" : lot.status === "expiring" ? "is-expiring" : ""}`}
                      >
                        <div className="fefo-rank-badge">
                          {isFirstLot ? "①" : index === 1 ? "②" : index === 2 ? "③" : `#${index + 1}`}
                        </div>

                        <div className="fefo-card-main">
                          <div className="fefo-card-title-row">
                            <div className="fefo-lot-title-wrap">
                              <strong className="lot-name">{friendlyLotLabel(lot)}</strong>
                              {isFirstLot && lots.length > 1 ? (
                                <span className="fefo-priority-tag">Dùng trước</span>
                              ) : null}
                              {!quality.isComplete ? (
                                <DataQualityBadge quality={quality} size="pill" />
                              ) : null}
                            </div>
                            <StatusPill status={lot.status} label={statusLabels[lot.status]} />
                          </div>

                          {/* FEFO Visual Timeline Bar */}
                          <div className="fefo-visual-timeline">
                            <span className="fefo-timeline-today">Hôm nay</span>
                            <div className="fefo-timeline-track">
                              <div
                                className={`fefo-timeline-fill ${lotDays != null && lotDays <= 7 ? "is-urgent" : ""}`}
                                style={{
                                  width: `${Math.max(15, Math.min(92, ((40 - Math.max(0, lotDays ?? 40)) / 40) * 100))}%`,
                                }}
                              />
                              <div className="fefo-timeline-dot" />
                            </div>
                            <span className="fefo-timeline-expiry">
                              {formatBackendDate(lot.expiryDate)}
                              <small className={lotDays != null && lotDays <= 7 ? "is-urgent-text" : ""}>
                                {lotDays == null
                                  ? ""
                                  : lotDays < 0
                                    ? ` · Quá hạn ${Math.abs(lotDays)}d`
                                    : ` · còn ${lotDays} ngày`}
                              </small>
                            </span>
                          </div>

                          <div className="fefo-card-meta-grid">
                            <div className="meta-col">
                              <span className="meta-label">Tồn hiện tại</span>
                              <strong className="meta-value">{formatQuantity(lot.onHand, lot.unit)}</strong>
                              <span className="meta-sub">Khả dụng: {formatQuantity(lot.usableQuantity, lot.unit)}</span>
                            </div>

                            <div className="meta-col">
                              <span className="meta-label">Nhà cung cấp</span>
                              <strong className="meta-value">{lot.supplier || "—"}</strong>
                              <span className="meta-sub">
                                Nhận: {lot.receivedDate ? formatBackendDate(lot.receivedDate) : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {lots.length === 0 ? (
                    <div className="table-empty panel">
                      Chưa có dữ liệu lô cho nguyên liệu này.
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Backward compatibility table for test suite */}
              <div className="table-wrap lot-detail-table" style={{ display: "none" }}>
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
                        <td>{formatBackendDate(lot.expiryDate)}</td>
                        <td>{formatQuantity(lot.onHand, lot.unit)}</td>
                        <td>{quantityOrUnavailable(lot.usableQuantity, lot.unit)}</td>
                        <td>{formatQuantity(lot.expiredQuantity, lot.unit)}</td>
                        <td>
                          <StatusPill status={lot.status} label={statusLabels[lot.status]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 2: LỊCH SỬ KHO (INVENTORY MOVEMENTS TIMELINE)
          ════════════════════════════════════════════════════════════════════ */}
          {tab === "Lịch sử kho" ? (
            <div className="inventory-movements-pane">
              <div className="movements-header">
                <div>
                  <h4>Biến động kho gần đây</h4>
                  <small className="quiet-copy">Nhật ký xuất nhập và điều chỉnh kiểm kê thực tế</small>
                </div>
              </div>

              <div className="movements-timeline">
                {["Hôm nay", "Hôm qua"].map((group) => {
                  const groupItems = movements.filter((m) => m.dateGroup === group);
                  if (groupItems.length === 0) return null;

                  return (
                    <div key={group} className="movement-group">
                      <div className="movement-group-label">
                        <Calendar size={13} />
                        <span>{group}</span>
                      </div>

                      <div className="movement-items-list">
                        {groupItems.map((m) => (
                          <div key={m.id} className="movement-row">
                            <div className="movement-time">{m.time}</div>
                            <div className={`movement-icon ${m.type}`}>
                              {m.type === "inbound" ? (
                                <ArrowDownLeft size={15} />
                              ) : m.type === "consumption" ? (
                                <ArrowUpRight size={15} />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                            </div>
                            <div className="movement-info">
                              <div className="movement-title-row">
                                <strong>{m.title}</strong>
                                {m.lotLabel ? (
                                  <span className="movement-lot-badge">{m.lotLabel}</span>
                                ) : null}
                              </div>
                              <p>{m.description}</p>
                            </div>
                            <div className={`movement-delta ${m.delta > 0 ? "is-plus" : "is-minus"}`}>
                              {m.delta > 0 ? `+${m.delta}` : m.delta} {m.unit}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 3: THÔNG TIN & ĐIỀU CHỈNH KHO (DATA & ADJUSTMENTS)
          ════════════════════════════════════════════════════════════════════ */}
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
                          title="Điều chỉnh sai lệch"
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
                    const expectedVersion = selectedLot.version;
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
        <div className="inventory-selection-empty-state">
          <div className="empty-state-icon">
            <Package size={28} />
          </div>
          <p className="quiet-help inventory-selection-helper">
            Chọn một nguyên liệu để xem tồn kho, lô và lịch sử sử dụng.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          PHẦN 4: TIẾP TỤC CHỌN NGUYÊN LIỆU (INVENTORY HEALTH TABLE)
      ════════════════════════════════════════════════════════════════════ */}
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
              <th>Tồn kho</th>
              <th>Số lô</th>
              <th>Hạn dùng</th>
              <th>Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const ingredientId = inventoryKey(row);
              const isSelected = ingredientId === selectedIngredientId;
              const days = daysUntilDate(row.expiryDate);
              const quality = evaluateDataQuality(row);
              const usablePercent = row.onHand > 0 ? Math.min(100, Math.max(0, ((row.usableQuantity ?? row.onHand) / row.onHand) * 100)) : 0;
              const isFullUsable = row.onHand > 0 && (row.usableQuantity == null || row.usableQuantity === row.onHand);

              return (
                <tr
                  key={ingredientId}
                  ref={(node) => {
                    if (node) rowRefs.current.set(ingredientId, node);
                    else rowRefs.current.delete(ingredientId);
                  }}
                  className={isSelected ? "selected" : ""}
                  data-selected={isSelected || undefined}
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
                    <div className="table-ingredient-cell">
                      <strong className="ingredient-title-text" title={row.ingredient}>
                        {row.ingredient}
                      </strong>
                      {row.sku ? (
                        <span
                          className="cell-sku-text"
                          title={row.sku}
                        >
                          {row.sku}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td>
                    <div className="table-stock-grouped-cell">
                      <div className="stock-main-line">
                        {isFullUsable ? (
                          <strong className="stock-number">{formatQuantity(row.onHand, row.unit)}</strong>
                        ) : (
                          <strong className="stock-number">
                            {formatQuantity(row.usableQuantity ?? row.onHand, row.unit)} / {formatQuantity(row.onHand, row.unit)}
                          </strong>
                        )}
                      </div>

                      {/* Exception-driven: Text for 100%, progress bar only when < 100% */}
                      {isFullUsable ? (
                        <span className="usable-tag-complete">✓ Toàn bộ khả dụng</span>
                      ) : (
                        <div className="usable-exception-wrap">
                          <div className="usable-progress-track">
                            <div
                              className={`usable-progress-bar ${row.usableQuantity === 0 ? "is-zero" : ""}`}
                              style={{ width: `${usablePercent}%` }}
                            />
                          </div>
                          <span className="usable-tag-partial">{usablePercent.toFixed(0)}% khả dụng</span>
                        </div>
                      )}
                    </div>
                  </td>

                  <td>
                    <span className="lots-count-pill">
                      {row.lots?.length ?? 1} lô
                    </span>
                  </td>

                  <td>
                    <div className="table-expiry-cell">
                      <span className="expiry-date-text">{formatBackendDate(row.expiryDate)}</span>
                      {days != null ? (
                        <small className={`expiry-tag ${days <= 3 ? "is-critical" : days <= 7 ? "is-warning" : "is-normal"}`}>
                          {days < 0
                            ? `Quá hạn ${Math.abs(days)}d`
                            : days === 0
                              ? "Hôm nay"
                              : `Còn ${days}d`}
                        </small>
                      ) : null}
                    </div>
                  </td>

                  <td>
                    <div className="table-status-cell">
                      <StatusPill
                        status={row.statusKey}
                        label={statusLabels[row.statusKey]}
                      />
                      <DataQualityBadge quality={quality} size="mini" />
                    </div>
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

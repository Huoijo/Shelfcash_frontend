import type { DecisionDemandView, DecisionRiskView } from "./decision-view";
import type { BootstrapData, DecisionPackage, ProcurementRow } from "./types";

function formatQuantity(value: number | null | undefined, unit = ""): string {
  if (value == null) return "—";
  const formatted = value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export type RiskSeverity = "stable" | "watch" | "shortage_risk" | "critical" | "unknown";
export type HeatmapSeverityLevel = 0 | 1 | 2 | 3;

export type RiskEvaluationBasis =
  | "p50_shortage"
  | "p75_shortage"
  | "safety_stock"
  | "replenishment_buffer"
  | "fallback_coverage"
  | "stable"
  | "unknown";

export interface DailyIngredientRiskState {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  targetDate: string;

  severity: RiskSeverity;
  severityLevel: HeatmapSeverityLevel;
  severityLabel: string;
  basis: RiskEvaluationBasis;

  demandP25: number | null;
  demandP50: number | null;
  demandP75: number | null;

  openingStock: number | null;
  availableStock: number | null;
  closingStock: number | null;
  rawBalanceP50: number | null;
  rawBalanceP75: number | null;
  closingStockP75: number | null;

  incomingQuantity: number;
  isArrival: boolean;

  shortageQuantity: number;
  shortageP75: number;
  hasStockout: boolean;
  stockoutDate?: string | null;

  safetyThreshold: number | null;
  forwardCoverageDays: number | null;
  replenishmentHorizon: number | null;

  isDemandSpike: boolean;
  demandSpikeRatio: number | null;
  demandSpikeLabel: string | null;

  daysOfSupply: number | null;
  reason?: string;
  contributionsCount: number;
  demandRow?: DecisionDemandView | null;
}

export interface IngredientRiskProjection {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  initialStock: number | null;
  totalP50Demand: number;
  dailyRisks: DailyIngredientRiskState[];
  maxSeverity: HeatmapSeverityLevel;
  hasAlert: boolean;
  stockoutDate?: string | null;
}

/** Fallback heuristic constants used ONLY when replenishment lead times and receipts are absent */
export const FALLBACK_WATCH_COVERAGE_DAYS = 3;
export const FALLBACK_REPLENISHMENT_DAYS = 2;

function normalizeDateStr(d?: string | null): string {
  if (!d) return "";
  const s = String(d).trim().split("T")[0];
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return s;
}

/**
 * Calculate difference in days between two ISO date strings (target - base)
 */
function daysDifference(targetDate: string, baseDate: string): number {
  try {
    const t = new Date(`${targetDate.slice(0, 10)}T00:00:00Z`).getTime();
    const b = new Date(`${baseDate.slice(0, 10)}T00:00:00Z`).getTime();
    if (isNaN(t) || isNaN(b)) return 0;
    return Math.round((t - b) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Extract incoming procurement rows from DecisionPackage or Brief
 */
export function extractProcurementRows(
  decision: DecisionPackage | null | undefined,
  briefProcurementRows?: ProcurementRow[] | null
): Array<{ ingredientId: string; quantity: number; arrivalDate: string | null }> {
  if (briefProcurementRows && briefProcurementRows.length > 0) {
    return briefProcurementRows.map((r) => ({
      ingredientId: r.ingredient_id,
      quantity: r.quantity ?? 0,
      arrivalDate: r.arrival_date ? normalizeDateStr(r.arrival_date) : null,
    }));
  }

  const raw = decision as any;
  if (!raw) return [];

  const items: any[] = [];
  if (Array.isArray(raw.procurement_rows)) {
    items.push(...raw.procurement_rows);
  }
  if (Array.isArray(raw.recommended_plan?.items)) {
    items.push(...raw.recommended_plan.items);
  }
  if (raw.strategies && typeof raw.strategies === "object") {
    if (Array.isArray(raw.strategies)) {
      const protectedStrat =
        raw.strategies.find(
          (s: any) => s?.strategy === "protected" || s?.key === "protected"
        ) ?? raw.strategies[0];
      if (Array.isArray(protectedStrat?.items)) {
        items.push(...protectedStrat.items);
      }
    } else {
      const stratObj =
        raw.strategies.protected ??
        raw.strategies.balanced ??
        Object.values(raw.strategies)[0];
      if (Array.isArray(stratObj?.items)) {
        items.push(...stratObj.items);
      }
    }
  }

  return items
    .map((item) => ({
      ingredientId: String(item.ingredient_id ?? item.ingredientId ?? ""),
      quantity: Number(item.quantity ?? item.order_quantity ?? 0),
      arrivalDate: item.arrival_date
        ? normalizeDateStr(item.arrival_date)
        : item.expected_arrival_date
          ? normalizeDateStr(item.expected_arrival_date)
          : null,
    }))
    .filter((item) => Boolean(item.ingredientId));
}

/**
 * Single Authoritative Groundtruth Risk Engine.
 * Simulates daily available stock, raw balances, forward coverage trajectories,
 * replenishment horizons, and evaluates risk using a strict precedence hierarchy.
 */
export function projectIngredientDailyRisks(
  ingredientId: string,
  ingredientName: string,
  unit: string,
  dates: string[],
  demandRows: DecisionDemandView[],
  risk: DecisionRiskView | undefined,
  data: BootstrapData | undefined,
  procurementRows?: Array<{ ingredientId: string; quantity: number; arrivalDate: string | null }>
): IngredientRiskProjection {
  const matchingDemand = demandRows.filter((d) => d.ingredientId === ingredientId);
  const totalP50Demand = matchingDemand.reduce((s, d) => s + (d.p50 ?? 0), 0);
  const dailyAvgDemand = dates.length > 0 ? totalP50Demand / dates.length : 0;

  // 1. Resolve true starting inventory & inventory configuration
  const invRecord = data?.inventory?.find((i) => i.ingredientId === ingredientId);
  let initialStock: number | null = null;
  if (risk?.beginningInventory != null && risk.beginningInventory >= 0) {
    initialStock = risk.beginningInventory;
  } else if (invRecord?.usableQuantity != null && invRecord.usableQuantity >= 0) {
    initialStock = invRecord.usableQuantity;
  } else if (invRecord?.onHand != null && invRecord.onHand >= 0) {
    initialStock = invRecord.onHand;
  } else if (risk?.daysOfSupply != null && dailyAvgDemand > 0) {
    initialStock = Math.round(dailyAvgDemand * risk.daysOfSupply);
  }

  const safetyThreshold = invRecord?.safetyStock != null && invRecord.safetyStock > 0 ? invRecord.safetyStock : null;
  const supplierLeadTime = invRecord?.leadTimeDays != null && invRecord.leadTimeDays > 0 ? invRecord.leadTimeDays : null;

  // 2. Incoming shipments for this ingredient
  const ingredientReceipts = (procurementRows ?? []).filter(
    (p) => p.ingredientId === ingredientId && p.quantity > 0 && Boolean(p.arrivalDate)
  );

  // 3. Day-by-Day Simulation
  let currentStock = initialStock;
  const dailyRisks: DailyIngredientRiskState[] = [];
  let maxSeverity: HeatmapSeverityLevel = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const normDate = normalizeDateStr(date);
    const demandRow = matchingDemand.find((d) => normalizeDateStr(d.targetDate) === normDate);
    const p50 = demandRow?.p50 ?? 0;
    const p25 = demandRow?.p25 ?? (p50 * 0.8);
    const p75 = demandRow?.p75 ?? (p50 * 1.2);

    // Identify receipts on this day
    const dayArrivals = ingredientReceipts.filter(
      (p) => p.arrivalDate && normalizeDateStr(p.arrivalDate) === normDate
    );
    const isArrival = dayArrivals.length > 0;
    const incomingQty = dayArrivals.reduce((sum, p) => sum + p.quantity, 0);

    // Identify upcoming receipt after today
    const nextReceipt = ingredientReceipts.find(
      (p) => p.arrivalDate && normalizeDateStr(p.arrivalDate) > normDate
    );
    const daysUntilNextReceipt = nextReceipt && nextReceipt.arrivalDate
      ? daysDifference(normalizeDateStr(nextReceipt.arrivalDate), normDate)
      : null;

    const replenishmentHorizon =
      daysUntilNextReceipt != null
        ? daysUntilNextReceipt
        : supplierLeadTime != null
          ? supplierLeadTime
          : FALLBACK_REPLENISHMENT_DAYS;

    // Detect demand spike metadata (does NOT dictate severity independently)
    const isDemandSpike = dailyAvgDemand > 0 && p50 > 1.4 * dailyAvgDemand;
    const demandSpikeRatio = dailyAvgDemand > 0 ? (p50 - dailyAvgDemand) / dailyAvgDemand : null;
    const demandSpikeLabel = isDemandSpike && demandSpikeRatio != null
      ? `↗ Nhu cầu cao hơn TB ${Math.round(demandSpikeRatio * 100)}%`
      : null;

    // Handle Unknown Data
    if (currentStock == null || isNaN(currentStock)) {
      dailyRisks.push({
        ingredientId,
        ingredientName,
        unit,
        targetDate: date,
        severity: "unknown",
        severityLevel: 0,
        severityLabel: "Không đủ dữ liệu",
        basis: "unknown",
        demandP25: p25,
        demandP50: p50,
        demandP75: p75,
        openingStock: null,
        availableStock: null,
        closingStock: null,
        rawBalanceP50: null,
        rawBalanceP75: null,
        closingStockP75: null,
        incomingQuantity: incomingQty,
        isArrival,
        shortageQuantity: 0,
        shortageP75: 0,
        hasStockout: false,
        stockoutDate: null,
        safetyThreshold,
        forwardCoverageDays: null,
        replenishmentHorizon,
        isDemandSpike,
        demandSpikeRatio,
        demandSpikeLabel,
        daysOfSupply: null,
        reason: "Thiếu dữ liệu tồn kho",
        contributionsCount: demandRow?.contributions.length ?? 0,
        demandRow: demandRow ?? null,
      });
      continue;
    }

    // Chronology: Opening Stock -> Arrival -> Consumption
    const openingStock = currentStock;
    const availableStock = openingStock + incomingQty;

    // P50 Scenario Balances
    const rawBalanceP50 = availableStock - p50;
    const closingStockP50 = Math.max(0, rawBalanceP50);
    const shortageP50 = Math.max(0, -rawBalanceP50);

    // P75 Scenario Balances
    const rawBalanceP75 = availableStock - p75;
    const closingStockP75 = Math.max(0, rawBalanceP75);
    const shortageP75 = Math.max(0, -rawBalanceP75);

    // Forward coverage simulation from tomorrow onward
    let simStock = closingStockP50;
    let forwardCoverageDays = 0;
    let stockoutBeforeReceipt = false;

    for (let f = i + 1; f < dates.length; f++) {
      const fDate = dates[f];
      const fNormDate = normalizeDateStr(fDate);
      const fIncoming = ingredientReceipts
        .filter((p) => p.arrivalDate && normalizeDateStr(p.arrivalDate) === fNormDate)
        .reduce((sum, p) => sum + p.quantity, 0);

      const fDemand = matchingDemand.find(
        (d) => normalizeDateStr(d.targetDate) === fNormDate
      )?.p50 ?? dailyAvgDemand;

      simStock += fIncoming;
      if (simStock < fDemand) {
        forwardCoverageDays += fDemand > 0 ? Math.max(0, simStock / fDemand) : 0;
        if (nextReceipt && nextReceipt.arrivalDate && fNormDate < normalizeDateStr(nextReceipt.arrivalDate)) {
          stockoutBeforeReceipt = true;
        }
        simStock = 0;
        break;
      }
      simStock -= fDemand;
      forwardCoverageDays += 1;
    }

    if (simStock > 0 && dailyAvgDemand > 0) {
      forwardCoverageDays += simStock / dailyAvgDemand;
    }

    // ── STRICT PRECEDENCE EVALUATION ──
    let severity: RiskSeverity = "stable";
    let severityLevel: HeatmapSeverityLevel = 0;
    let severityLabel = "Ổn định";
    let basis: RiskEvaluationBasis = "stable";
    let reason = "Tồn kho an toàn, đủ đáp ứng kịch bản P50 & P75";

    // Level 3 (Critical - 🟥): Real shortage on P50, zero balance, or cạn trước khi hàng về
    if (shortageP50 > 0 || (closingStockP50 <= 0 && incomingQty === 0) || stockoutBeforeReceipt) {
      severity = "critical";
      severityLevel = 3;
      severityLabel = shortageP50 > 0
        ? `Cảnh báo cao (Thiếu ${formatQuantity(shortageP50, unit)})`
        : stockoutBeforeReceipt
          ? "Cảnh báo cao (Cạn trước khi hàng về)"
          : "Cảnh báo cao (Hết tồn kho)";
      basis = "p50_shortage";
      reason = shortageP50 > 0
        ? `Nhu cầu P50 (${formatQuantity(p50, unit)}) vượt lượng hàng khả dụng (${formatQuantity(availableStock, unit)})`
        : "Tồn kho dự kiến cạn kiệt trong ngày";
    }
    // Level 2 (Shortage Risk - 🟧): P50 safe, but P75 causes shortage
    else if (shortageP75 > 0 || rawBalanceP75 < 0) {
      severity = "shortage_risk";
      severityLevel = 2;
      severityLabel = `Nguy cơ thiếu (P75 thiếu ${formatQuantity(shortageP75, unit)})`;
      basis = "p75_shortage";
      reason = `Nhu cầu cao P75 (${formatQuantity(p75, unit)}) có thể làm thiếu ${formatQuantity(shortageP75, unit)}`;
    }
    // Level 1 (Watch - 🟨): P50/P75 safe, but buffer is thin (below safety stock or forward coverage <= replenishment requirement)
    else if (
      (safetyThreshold != null && closingStockP50 <= safetyThreshold) ||
      forwardCoverageDays <= replenishmentHorizon ||
      forwardCoverageDays <= FALLBACK_WATCH_COVERAGE_DAYS
    ) {
      severity = "watch";
      severityLevel = 1;
      severityLabel = "Cần theo dõi";
      basis = safetyThreshold != null && closingStockP50 <= safetyThreshold
        ? "safety_stock"
        : "replenishment_buffer";
      reason = safetyThreshold != null && closingStockP50 <= safetyThreshold
        ? `Tồn cuối ngày (${formatQuantity(closingStockP50, unit)}) chạm ngưỡng an toàn (${formatQuantity(safetyThreshold, unit)})`
        : `Lượng tồn còn đủ ${forwardCoverageDays.toFixed(1)} ngày, sát thời gian bổ sung (${replenishmentHorizon} ngày)`;
    }
    // Level 0 (Stable - 🟩): Safe stock
    else {
      severity = "stable";
      severityLevel = 0;
      severityLabel = "Ổn định";
      basis = "stable";
      reason = "Tồn kho an toàn, đủ đáp ứng kịch bản P50 & P75";
    }

    if (severityLevel > maxSeverity) {
      maxSeverity = severityLevel;
    }

    const daysOfSupply = dailyAvgDemand > 0 ? closingStockP50 / dailyAvgDemand : (closingStockP50 > 0 ? 99 : 0);

    dailyRisks.push({
      ingredientId,
      ingredientName,
      unit,
      targetDate: date,
      severity,
      severityLevel,
      severityLabel,
      basis,
      demandP25: Number(p25.toFixed(2)),
      demandP50: Number(p50.toFixed(2)),
      demandP75: Number(p75.toFixed(2)),
      openingStock: Number(openingStock.toFixed(2)),
      availableStock: Number(availableStock.toFixed(2)),
      closingStock: Number(closingStockP50.toFixed(2)),
      rawBalanceP50: Number(rawBalanceP50.toFixed(2)),
      rawBalanceP75: Number(rawBalanceP75.toFixed(2)),
      closingStockP75: Number(closingStockP75.toFixed(2)),
      incomingQuantity: Number(incomingQty.toFixed(2)),
      isArrival,
      shortageQuantity: Number(shortageP50.toFixed(2)),
      shortageP75: Number(shortageP75.toFixed(2)),
      hasStockout: shortageP50 > 0 || closingStockP50 <= 0,
      stockoutDate: shortageP50 > 0 || closingStockP50 <= 0 ? date : null,
      safetyThreshold: safetyThreshold != null ? Number(safetyThreshold.toFixed(2)) : null,
      forwardCoverageDays: Number(forwardCoverageDays.toFixed(1)),
      replenishmentHorizon: Number(replenishmentHorizon.toFixed(1)),
      isDemandSpike,
      demandSpikeRatio: demandSpikeRatio != null ? Number(demandSpikeRatio.toFixed(2)) : null,
      demandSpikeLabel,
      daysOfSupply: Number(daysOfSupply.toFixed(1)),
      reason,
      contributionsCount: demandRow?.contributions.length ?? 0,
      demandRow: demandRow ?? null,
    });

    currentStock = closingStockP50;
  }

  return {
    ingredientId,
    ingredientName,
    unit,
    initialStock,
    totalP50Demand: Number(totalP50Demand.toFixed(2)),
    dailyRisks,
    maxSeverity,
    hasAlert: maxSeverity >= 1,
    stockoutDate: dailyRisks.find((d) => d.hasStockout)?.targetDate ?? null,
  };
}

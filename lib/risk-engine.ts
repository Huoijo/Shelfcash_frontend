import type { DecisionDemandView, DecisionRiskView } from "./decision-view";
import type { BootstrapData, DecisionPackage, ProcurementRow } from "./types";
function formatQuantity(value: number | null | undefined, unit = ""): string {
  if (value == null) return "—";
  const formatted = value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export type RiskSeverity = "stable" | "watch" | "shortage_risk" | "critical" | "unknown";
export type HeatmapSeverityLevel = 0 | 1 | 2 | 3;

export interface DailyIngredientRiskState {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  targetDate: string;

  severity: RiskSeverity;
  severityLevel: HeatmapSeverityLevel;
  severityLabel: string;

  demandP25: number | null;
  demandP50: number | null;
  demandP75: number | null;

  openingStock: number | null;
  closingStock: number | null;
  closingStockP75: number | null;

  incomingQuantity: number;
  isArrival: boolean;

  shortageQuantity: number;
  hasStockout: boolean;
  stockoutDate?: string | null;

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
 * Single Authoritative Groundtruth Risk Projection for an ingredient over the planning horizon.
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

  // 1. Resolve true starting inventory
  const invRecord = data?.inventory?.find((i) => i.ingredientId === ingredientId);
  let initialStock: number | null = null;
  if (risk?.beginningInventory != null && risk.beginningInventory >= 0) {
    initialStock = risk.beginningInventory;
  } else if (invRecord?.onHand != null && invRecord.onHand >= 0) {
    initialStock = invRecord.onHand;
  } else if (risk?.daysOfSupply != null && dailyAvgDemand > 0) {
    initialStock = Math.round(dailyAvgDemand * risk.daysOfSupply);
  }

  // 2. Resolve incoming shipment for this ingredient
  const incoming = procurementRows?.find((p) => p.ingredientId === ingredientId && p.quantity > 0) ?? null;

  // 3. Simulate day-by-day progression
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

    const isArrival = Boolean(
      incoming &&
        incoming.arrivalDate &&
        normalizeDateStr(incoming.arrivalDate) === normDate
    );
    const incomingQty = isArrival && incoming ? incoming.quantity : 0;

    // If starting inventory is completely unknown
    if (currentStock == null) {
      dailyRisks.push({
        ingredientId,
        ingredientName,
        unit,
        targetDate: date,
        severity: "unknown",
        severityLevel: 0,
        severityLabel: "Không đủ dữ liệu",
        demandP25: p25,
        demandP50: p50,
        demandP75: p75,
        openingStock: null,
        closingStock: null,
        closingStockP75: null,
        incomingQuantity: incomingQty,
        isArrival,
        shortageQuantity: 0,
        hasStockout: false,
        daysOfSupply: null,
        contributionsCount: demandRow?.contributions.length ?? 0,
        demandRow: demandRow ?? null,
      });
      continue;
    }

    const openingStock = currentStock;
    const availableToday = openingStock + incomingQty;
    const closingStock = Math.max(0, availableToday - p50);
    const closingStockP75 = Math.max(0, availableToday - p75);

    const shortageQty = availableToday < p50 ? p50 - availableToday : 0;
    const hasStockout = shortageQty > 0 || (closingStock <= 0 && incomingQty === 0);
    const daysRemaining = dailyAvgDemand > 0 ? closingStock / dailyAvgDemand : (closingStock > 0 ? 99 : 0);

    let severity: RiskSeverity = "stable";
    let severityLevel: HeatmapSeverityLevel = 0;
    let severityLabel = "Ổn định";
    let reason = "Tồn kho đủ đáp ứng";

    // Level 3 (Critical - Cảnh báo cao): Real shortage or empty stock
    if (hasStockout || closingStock <= 0) {
      severity = "critical";
      severityLevel = 3;
      severityLabel = shortageQty > 0
        ? `Cảnh báo cao (Thiếu ${formatQuantity(shortageQty, unit)})`
        : "Cảnh báo cao (Hết tồn kho)";
      reason = "Tồn kho không đủ đáp ứng nhu cầu P50";
    }
    // Level 2 (Shortage Risk - Nguy cơ thiếu): Danger under P75 or days remaining <= 1.5 days
    else if (closingStockP75 <= 0 || daysRemaining <= 1.5) {
      severity = "shortage_risk";
      severityLevel = 2;
      severityLabel = "Nguy cơ thiếu";
      reason = "Nguy cơ thiếu nếu nhu cầu chạm ngưỡng P75";
    }
    // Level 1 (Watch - Cần theo dõi): Days remaining <= 3 days, or demand spike > 40%
    else if (
      daysRemaining <= 3 ||
      (dailyAvgDemand > 0 && p50 > 1.4 * dailyAvgDemand)
    ) {
      severity = "watch";
      severityLevel = 1;
      severityLabel = "Cần theo dõi";
      reason = daysRemaining <= 3 ? "Tồn kho dưới ngưỡng an toàn 3 ngày" : "Nhu cầu dự báo tăng đột biến";
    }
    // Level 0 (Stable - Ổn định): Safe stock
    else {
      severity = "stable";
      severityLevel = 0;
      severityLabel = "Ổn định";
      reason = "Tồn kho an toàn";
    }

    if (severityLevel > maxSeverity) {
      maxSeverity = severityLevel;
    }

    dailyRisks.push({
      ingredientId,
      ingredientName,
      unit,
      targetDate: date,
      severity,
      severityLevel,
      severityLabel,
      demandP25: Number(p25.toFixed(2)),
      demandP50: Number(p50.toFixed(2)),
      demandP75: Number(p75.toFixed(2)),
      openingStock: Number(openingStock.toFixed(2)),
      closingStock: Number(closingStock.toFixed(2)),
      closingStockP75: Number(closingStockP75.toFixed(2)),
      incomingQuantity: Number(incomingQty.toFixed(2)),
      isArrival,
      shortageQuantity: Number(shortageQty.toFixed(2)),
      hasStockout,
      stockoutDate: hasStockout ? date : null,
      daysOfSupply: Number(daysRemaining.toFixed(1)),
      reason,
      contributionsCount: demandRow?.contributions.length ?? 0,
      demandRow: demandRow ?? null,
    });

    currentStock = closingStock;
  }

  return {
    ingredientId,
    ingredientName,
    unit,
    initialStock,
    totalP50Demand: Number(totalP50Demand.toFixed(2)),
    dailyRisks,
    maxSeverity,
    hasAlert: maxSeverity >= 2,
    stockoutDate: risk?.stockoutDate ?? null,
  };
}

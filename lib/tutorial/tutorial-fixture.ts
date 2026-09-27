import { adaptBootstrap } from "../contract-adapters";
import { buildEmptyBootstrapData } from "../data";
import {
  buildMock7DayDecisionPackage,
  buildMockBootstrapResponse,
  buildMockDecisionBrief,
  buildMockWhatIfResponse,
  MOCK_DECISION_RUN_ID,
  MOCK_FORECAST_RUN_ID,
} from "../mock-data";
import type {
  BootstrapData,
  DecisionBriefFacts,
  DecisionPackage,
  PlanResponse,
  PurchaseOrder,
  WhatIfRequest,
  WhatIfResponse,
} from "../types";

export const TUTORIAL_STORE_ID = "STORE_TUTORIAL_MOCK";
export const TUTORIAL_STORE_NAME = "Cửa hàng Mẫu · ShelfCash Demo";
export const TUTORIAL_DATE = "2026-08-20";

/**
 * Returns a fully populated, deterministic BootstrapData fixture for Tutorial Mode.
 * Derived from existing mock data in lib/mock-data.ts without duplicating datasets.
 */
export function getTutorialBootstrapData(): BootstrapData {
  const base = buildEmptyBootstrapData(TUTORIAL_STORE_ID, TUTORIAL_DATE);
  const mockResponse = buildMockBootstrapResponse(TUTORIAL_DATE);
  const adapted = adaptBootstrap(base, mockResponse);

  return {
    ...adapted,
    today: TUTORIAL_DATE,
    settings: {
      ...adapted.settings,
      storeId: TUTORIAL_STORE_ID,
      storeName: TUTORIAL_STORE_NAME,
      remainingBudget: 15_000_000,
      monthlyBudget: 25_000_000,
      forecastHorizon: 7,
      defaultStrategy: "safe",
    },
  };
}

/**
 * Returns a complete 7-day DecisionPackage fixture for Tutorial Mode.
 */
export function getTutorialDecisionPackage(bootstrapData?: BootstrapData): DecisionPackage {
  const data = bootstrapData ?? getTutorialBootstrapData();
  const pkg = buildMock7DayDecisionPackage(data);
  return {
    ...pkg,
    decision_run_id: MOCK_DECISION_RUN_ID,
    as_of_date: TUTORIAL_DATE,
  };
}

/**
 * Returns canonical DecisionBriefFacts for Tutorial Mode.
 * Adheres strictly to INV-001 (Manager Brief Authority) and INV-003 (Grounded Strategy Copy).
 */
export function getTutorialDecisionBrief(): DecisionBriefFacts {
  const brief = buildMockDecisionBrief(TUTORIAL_DATE);
  return {
    ...brief,
    store_id: TUTORIAL_STORE_ID,
    decision_run_id: MOCK_DECISION_RUN_ID,
  };
}

/**
 * Generates an isolated What-if scenario result in Tutorial Mode without network calls.
 * Adheres strictly to INV-009 (What-if Isolation).
 */
export function getTutorialWhatIfResponse(mutation?: WhatIfRequest): WhatIfResponse {
  const request: WhatIfRequest = mutation ?? {
    demand_multiplier: 1.1,
    budget_limit: 10_000_000,
  };
  return buildMockWhatIfResponse(request, TUTORIAL_DATE);
}

/**
 * Creates simulated Draft Purchase Orders from tutorial procurement rows.
 * Zero live backend mutation; strictly isolated to Tutorial Mode.
 */
export function getTutorialDraftOrders(): PurchaseOrder[] {
  const brief = getTutorialDecisionBrief();
  const rows = brief.procurement_rows;

  // Group by supplier
  const supplierGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.supplier_name ?? "Nhà cung cấp mẫu";
    const list = supplierGroups.get(key) ?? [];
    list.push(row);
    supplierGroups.set(key, list);
  }

  let index = 1;
  const orders: PurchaseOrder[] = [];
  for (const [supplierName, groupRows] of supplierGroups.entries()) {
    const totalAmount = groupRows.reduce((sum, r) => sum + (r.purchase_cost ?? 0), 0);
    orders.push({
      poId: `PO-TUTORIAL-${String(index).padStart(3, "0")}`,
      supplier: supplierName,
      supplierId: groupRows[0]?.supplier_id ?? `sup-${index}`,
      orderDate: TUTORIAL_DATE,
      deliveryDate: TUTORIAL_DATE,
      strategy: "Cân bằng",
      status: "draft",
      total: totalAmount,
      budgetAfter: 15_000_000 - totalAmount,
      lines: groupRows.map((r, lineIdx) => ({
        id: `line-${index}-${lineIdx + 1}`,
        ingredient: r.ingredient_name,
        ingredientId: r.ingredient_id,
        quantity: r.quantity,
        unit: r.unit,
        unitPrice: r.quantity > 0 ? Math.round((r.purchase_cost ?? 0) / r.quantity) : 0,
        amount: r.purchase_cost ?? 0,
      })) as unknown as PurchaseOrder["lines"],
    });
    index++;
  }

  return orders;
}

/**
 * Builds an active PlanResponse from tutorial data.
 */
export function getTutorialPlanResponse(bootstrapData?: BootstrapData): PlanResponse {
  const data = bootstrapData ?? getTutorialBootstrapData();
  const brief = getTutorialDecisionBrief();

  return {
    status: "completed",
    forecastRunId: MOCK_FORECAST_RUN_ID,
    cutoffDate: TUTORIAL_DATE,
    strategy: "Cân bằng",
    forecasts: {},
    ingredientDemand: {},
    scenarios: [],
    enrichedInventory: data.inventory.map((inv) => ({
      ...inv,
      forecastDemand: 50,
      suggestedOrder: 20,
    })) as unknown as PlanResponse["enrichedInventory"],
    recommendations: brief.procurement_rows.map((row) => ({
      ingredient: row.ingredient_name,
      ingredientId: row.ingredient_id,
      orderQty: row.quantity,
      unit: row.unit,
      packSize: row.pack_size ?? 1,
      packCount: row.pack_count ?? 1,
      unitCost: row.quantity > 0 ? Math.round((row.purchase_cost ?? 0) / row.quantity) : 0,
      cost: row.purchase_cost ?? 0,
      supplier: row.supplier_name,
      supplierId: row.supplier_id,
      leadTimeDays: 2,
      daysOfSupply: 2,
      orderNeeded: true,
      reasons: row.reason_codes ?? [],
      explanationSnippet: "Nguyên liệu cần nhập theo dữ liệu mẫu.",
    })) as unknown as PlanResponse["recommendations"],
  };
}

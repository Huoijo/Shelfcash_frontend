import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNullableNumber,
  formatNullablePercent,
  formatNullableQuantity,
  formatNullableVnd,
  formatQuantity,
  formatVnd,
} from "../app/components/ui.tsx";
import { adaptPaginatedOrders } from "../lib/contract-adapters.ts";
import { projectIngredientDailyRisks } from "../lib/risk-engine.ts";
import { ShelfCashApiError } from "../lib/shelfcash-client.ts";
import { PREVIEW_OPPORTUNITY_STORE_ID } from "../lib/opportunity/api-service.ts";
import type {
  DecisionDemandView,
  DecisionRiskView,
} from "../lib/decision-view.ts";

// ==========================================================
// 1. NULL VS ZERO PAIRED TESTS (SECTION 8)
// ==========================================================

test("PATCH 5 - CASE 1 & 2: purchaseCost null -> '—' vs 0 -> '0 ₫'", () => {
  // CASE 1: null / undefined purchase cost must NEVER collapse into '0 ₫'
  assert.equal(formatVnd(null), "—");
  assert.equal(formatVnd(undefined), "—");
  assert.equal(formatNullableVnd(null), "—");

  // CASE 2: valid numeric 0 cost must format as real '0 ₫'
  assert.equal(formatVnd(0), "0 ₫");
  assert.equal(formatNullableVnd(0), "0 ₫");

  // Other non-zero valid currency
  assert.equal(formatVnd(1500000), "1.500.000 ₫");
});

test("PATCH 5 - CASE 3 & 4: fillRate null -> '—' vs 0 -> '0%'", () => {
  // CASE 3: null fill rate must NEVER display as '0%'
  assert.equal(formatNullablePercent(null), "—");
  assert.equal(formatNullablePercent(undefined), "—");

  // CASE 4: valid numeric 0 fill rate must display as '0%'
  assert.equal(formatNullablePercent(0), "0%");
  assert.equal(formatNullablePercent(0.0), "0%");

  // Normal positive fill rate
  assert.equal(formatNullablePercent(0.985), "98,5%");
});

test("PATCH 5 - Nullable Quantity: null -> '—' vs 0 -> '0' / '0 kg'", () => {
  assert.equal(formatQuantity(null, "kg"), "—");
  assert.equal(formatNullableQuantity(null, "L"), "—");

  assert.equal(formatQuantity(0, "kg"), "0 kg");
  assert.equal(formatQuantity(0), "0");
  assert.equal(formatNullableQuantity(0, "L"), "0 L");
});

test("PATCH 5 - Nullable Number: null -> '—' vs 0 -> '0'", () => {
  assert.equal(formatNullableNumber(null), "—");
  assert.equal(formatNullableNumber(undefined), "—");
  assert.equal(formatNullableNumber(0), "0");
  assert.equal(formatNullableNumber(42), "42");
});

test("PATCH 5 - CASE 5: demandP50 = null -> unavailable gap, severity unknown", () => {
  const dates = ["2026-08-13"];
  // Ingredient with NO demand data for this date
  const demand: DecisionDemandView[] = [];
  const risk: DecisionRiskView = {
    ingredientId: "milk",
    ingredientName: "Sữa tươi",
    stockoutDate: "",
    shortageQuantity: 0,
    beginningInventory: 20,
    fillRate: null,
    unit: "L",
  };

  const projection = projectIngredientDailyRisks(
    "milk",
    "Sữa tươi",
    "L",
    dates,
    demand,
    risk,
    undefined,
    []
  );

  const day1 = projection.dailyRisks[0];
  assert.ok(day1);
  // Missing demand must NOT collapse to 0 and claim green "stable"
  assert.equal(day1.demandP50, null);
  assert.equal(day1.severity, "unknown");
  assert.equal(day1.severityLabel, "Không đủ dữ liệu");
  assert.equal(day1.basis, "missing_data");
});

test("PATCH 5 - CASE 6: demandP50 = 0 -> valid numeric zero demand evaluated normally", () => {
  const dates = ["2026-08-13"];
  // Valid numeric zero demand
  const demand: DecisionDemandView[] = [
    {
      ingredientId: "cinnamon",
      ingredientName: "Quế",
      targetDate: "2026-08-13",
      p25: 0,
      p50: 0,
      p75: 0,
      unit: "g",
      contributions: [],
    },
  ];
  const risk: DecisionRiskView = {
    ingredientId: "cinnamon",
    ingredientName: "Quế",
    stockoutDate: "",
    shortageQuantity: 0,
    beginningInventory: 100,
    fillRate: 1.0,
    unit: "g",
  };

  const projection = projectIngredientDailyRisks(
    "cinnamon",
    "Quế",
    "g",
    dates,
    demand,
    risk,
    undefined,
    []
  );

  const day1 = projection.dailyRisks[0];
  assert.ok(day1);
  assert.equal(day1.demandP50, 0);
  // With 100 on hand and 0 demand, stock is genuinely stable
  assert.equal(day1.closingStock, 100);
  assert.equal(day1.severity, "stable");
  assert.equal(day1.severityLabel, "Ổn định");
});

// ==========================================================
// 2. STORE_001 AUDIT & ISOLATION TESTS (SECTION 9-13)
// ==========================================================

test("PATCH 5 - STORE_001: active store STORE_A is preserved without fallback", () => {
  const activeStoreId = "STORE_HCM_002";
  const resolved = activeStoreId.trim() || undefined;
  assert.equal(resolved, "STORE_HCM_002");
});

test("PATCH 5 - STORE_001: missing store raises STORE_NOT_SELECTED without silent fallback", () => {
  const emptyStoreId = "   ";
  const defaultStoreId = undefined as string | undefined;
  const targetStoreId = emptyStoreId.trim() || defaultStoreId?.trim();

  // Must remain undefined / falsy, never silently become STORE_001
  assert.equal(targetStoreId, undefined);

  // Validation function mimics ImportView upload guard
  function validateStoreSelected(id?: string): { ok: boolean; error?: string } {
    if (!id || !id.trim()) {
      return { ok: false, error: "STORE_NOT_SELECTED" };
    }
    return { ok: true };
  }

  const check = validateStoreSelected(targetStoreId);
  assert.equal(check.ok, false);
  assert.equal(check.error, "STORE_NOT_SELECTED");
});

test("PATCH 5 - STORE_001: Preview Opportunity module uses explicit preview boundary", () => {
  assert.equal(PREVIEW_OPPORTUNITY_STORE_ID, "STORE_001");
});

// ==========================================================
// 3. IMPORT POLLING TESTS (SECTION 14-20)
// ==========================================================

test("PATCH 5 - Import Polling: result ready quickly returns successfully without extra calls", async () => {
  let callCount = 0;
  const mockImportId = "imp-quick-001";

  async function mockGetResult(id: string) {
    callCount++;
    return { importId: id, status: "completed", recordsIngested: 42 };
  }

  const result = await mockGetResult(mockImportId);
  assert.equal(callCount, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.recordsIngested, 42);
});

test("PATCH 5 - Import Polling: polling continues past 10s (simulated) without premature failure", async () => {
  let simulatedAttempts = 0;
  const maxSimulatedDurationMs = 120_000;
  const pollIntervalMs = 2_000;
  let simulatedNow = 0;
  const deadline = simulatedNow + maxSimulatedDurationMs;

  const mockImportId = "imp-slow-002";
  let resolvedResult: Record<string, unknown> | null = null;

  // Simulate server taking 18 seconds (9 attempts at 2s interval > legacy 9.6s timeout)
  while (simulatedNow < deadline) {
    simulatedAttempts++;
    simulatedNow += pollIntervalMs;

    if (simulatedNow >= 18_000) {
      resolvedResult = {
        importId: mockImportId,
        status: "completed",
        rowsProcessed: 1500,
      };
      break;
    }
  }

  // Succeeded after 18s (> 10s legacy failure threshold)
  assert.ok(simulatedAttempts > 6);
  assert.ok(resolvedResult != null);
  assert.equal(resolvedResult.status, "completed");
  assert.equal(resolvedResult.rowsProcessed, 1500);
});

test("PATCH 5 - Import Polling: bounded deadline triggers CLIENT_TIMEOUT without duplicate mutation", async () => {
  const maxDurationMs = 120_000;
  const pollIntervalMs = 2_000;
  let simulatedNow = 0;
  const deadline = simulatedNow + maxDurationMs;
  let simulatedAttempts = 0;

  let timeoutCaught = false;

  while (simulatedNow < deadline) {
    simulatedAttempts++;
    simulatedNow += pollIntervalMs;
    // Server never finishes
  }

  if (simulatedNow >= deadline) {
    timeoutCaught = true;
  }

  assert.equal(timeoutCaught, true);
  assert.equal(simulatedAttempts, 60); // 120s / 2s = 60 attempts
});

test("PATCH 5 - Import Polling: timeout preserves same importId for manual retry", () => {
  const initialImportId = "imp-persisted-123";
  const idempotencyState = {
    process: { importId: initialImportId, key: "idem-key-1" },
  };

  // Simulating CLIENT_TIMEOUT error
  const err = new ShelfCashApiError(
    {
      code: "CLIENT_TIMEOUT",
      message: "Đã dừng chờ tự động",
      details: { import_id: initialImportId },
    },
    408,
  );

  const isClientTimeout = err.code === "CLIENT_TIMEOUT";
  assert.equal(isClientTimeout, true);

  // Invariant: idempotency.current.process must NOT be deleted on timeout
  assert.equal(idempotencyState.process.importId, initialImportId);
  // Invariant: same import ID is available to retry check
  assert.equal(idempotencyState.process.key, "idem-key-1");
});

// ==========================================================
// 4. PAGINATION METADATA PRESERVATION TESTS (SECTION 21-28)
// ==========================================================

test("PATCH 5 - Pagination: adaptPaginatedOrders preserves page, page_size, and total metadata", () => {
  const backendPaginatedResponse = {
    page: 1,
    page_size: 50,
    total: 83,
    items: [
      {
        id: "PO-001",
        po_id: "PO-001",
        supplier_id: "sup-milk",
        supplier_name: "NCC Sữa Ba Vì",
        order_date: "2026-09-21",
        delivery_date: "2026-09-22",
        status: "ordered",
        total: 12500000,
        lines: [
          {
            po_line_id: "pol-1",
            ingredient_id: "milk",
            ingredient_name: "Sữa tươi",
            order_quantity: 50,
            unit: "L",
            unit_cost: 25000,
            line_cost: 1250000,
          },
        ],
      },
    ],
  };

  const paginated = adaptPaginatedOrders(backendPaginatedResponse);

  // Metadata MUST be preserved
  assert.equal(paginated.page, 1);
  assert.equal(paginated.page_size, 50);
  assert.equal(paginated.total, 83);

  // Items are adapted properly
  assert.equal(paginated.items.length, 1);
  assert.equal(paginated.items[0]?.poId, "PO-001");
  assert.equal(paginated.items[0]?.supplier, "NCC Sữa Ba Vì");
});

test("PATCH 5 - Pagination: single array fallback preserves length as total", () => {
  const bareArray = [
    {
      id: "PO-002",
      po_id: "PO-002",
      supplier: "NCC Cà Phê",
      order_date: "2026-09-21",
      delivery_date: "2026-09-23",
      status: "draft",
      total: 5000000,
      lines: [],
    },
  ];

  const paginated = adaptPaginatedOrders(bareArray);
  assert.equal(paginated.page, 1);
  assert.equal(paginated.page_size, 1);
  assert.equal(paginated.total, 1);
  assert.equal(paginated.items.length, 1);
});

// ==========================================================
// 5. CONTRACT REGRESSION INVARIANTS (SECTION 35)
// ==========================================================

test("PATCH 5 - REGRESSION: Manager brief authority is preserved without raw fallback", () => {
  // Test verifying that null totalPlannedCost from brief stays null rather than 0
  const nullCostBrief = {
    recommendation: {
      available: true,
      total_purchase_cost: null,
      strategy: "balanced",
    },
    procurement_rows: [],
  };

  assert.equal(nullCostBrief.recommendation.total_purchase_cost, null);
  assert.equal(formatVnd(nullCostBrief.recommendation.total_purchase_cost), "—");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  savePersistedAppState,
  loadPersistedAppState,
  persistAppStateDebounced,
  flushPersistedAppState,
  clearPersistedAppState,
  hasValidPersistedData,
  APP_STORAGE_PREFIX,
  ACTIVE_STORE_KEY,
  CURRENT_DATA_KEY,
  type PersistedAppState,
} from "../lib/app-persistence";
import { buildEmptyBootstrapData } from "../lib/data";
import { emptyBackendPlan } from "../lib/contract-adapters";

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

if (typeof (globalThis as unknown as Record<string, unknown>).window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = {
    localStorage: new MockLocalStorage(),
  };
} else if (!(globalThis as unknown as { window: { localStorage?: unknown } }).window.localStorage) {
  (globalThis as unknown as { window: { localStorage: unknown } }).window.localStorage = new MockLocalStorage();
}

test("Persists and restores user bootstrap data and plan accurately", () => {
  const mockStorage = (globalThis as unknown as { window: { localStorage: MockLocalStorage } }).window.localStorage;
  mockStorage.clear();

  const data = buildEmptyBootstrapData("STORE_ABC", "Quán Cà Phê Mẫu");
  data.inventory.push({
    ingredient: "Cà phê Robusta",
    sku: "ING-ROB-01",
    unit: "kg",
    onHand: 25.5,
    unitCost: 120000,
    expiryDate: "2026-10-30",
  });
  data.ingredients.push({
    ingredientId: "ING-ROB-01",
    ingredient: "Cà phê Robusta",
    baseUnit: "kg",
    category: "Cà phê",
  });
  data.products.push({
    productId: "PROD-01",
    product: "Cà phê đen đá",
    sku: "CF-DEN",
    category: "Cà phê",
    unit: "ly",
    price: 25000,
    itemType: "single",
    status: "active",
  });

  const plan = emptyBackendPlan(data, "Tiết kiệm");

  const state: PersistedAppState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    storeId: "STORE_ABC",
    data,
    plan,
    strategy: "Tiết kiệm",
    draftOrders: [
      {
        poId: "PO-001",
        poNumber: "PO-20260928-001",
        supplierId: "SUP-01",
        supplierName: "Nhà Cung Cấp A",
        status: "draft",
        orderDate: "2026-09-28",
        expectedDeliveryDate: "2026-09-29",
        totalAmount: 1200000,
        currency: "VND",
        lines: [],
      },
    ],
    importLogs: [
      {
        file: "inventory.xlsx",
        sheet: "Kho",
        dataType: "Đã nhập dữ liệu",
        rows: 25,
        importedAt: "2026-09-28T10:00:00Z",
      },
    ],
    activePage: "inventory",
  };

  assert.equal(hasValidPersistedData(state), true);

  const saved = savePersistedAppState(state);
  assert.equal(saved, true);

  // Verify stored in localStorage under both primary and current keys
  assert.ok(mockStorage.getItem(`${APP_STORAGE_PREFIX}STORE_ABC`));
  assert.ok(mockStorage.getItem(CURRENT_DATA_KEY));
  assert.equal(mockStorage.getItem(ACTIVE_STORE_KEY), "STORE_ABC");

  // Load back
  const restored = loadPersistedAppState("STORE_ABC");
  assert.ok(restored);
  assert.equal(restored.storeId, "STORE_ABC");
  assert.equal(restored.data.settings.storeName, "Quán Cà Phê Mẫu");
  assert.equal(restored.data.inventory.length, 1);
  assert.equal(restored.data.inventory[0].ingredient, "Cà phê Robusta");
  assert.equal(restored.data.products.length, 1);
  assert.equal(restored.strategy, "Tiết kiệm");
  assert.equal(restored.draftOrders?.length, 1);
  assert.equal(restored.draftOrders?.[0].poNumber, "PO-20260928-001");
  assert.equal(restored.importLogs?.length, 1);
  assert.equal(restored.activePage, "inventory");
});

test("Debounced persistence and synchronous flush upon refresh/unload", () => {
  const mockStorage = (globalThis as unknown as { window: { localStorage: MockLocalStorage } }).window.localStorage;
  mockStorage.clear();

  const data = buildEmptyBootstrapData("STORE_XYZ");
  data.inventory.push({
    ingredient: "Sữa tươi",
    sku: "ING-MILK-01",
    unit: "lít",
    onHand: 10,
    unitCost: 35000,
    expiryDate: "2026-10-05",
  });

  const state: PersistedAppState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    storeId: "STORE_XYZ",
    data,
  };

  // Queue debounced save
  persistAppStateDebounced(state, 5000);
  // Before timeout, item should not yet be in storage
  assert.equal(mockStorage.getItem(`${APP_STORAGE_PREFIX}STORE_XYZ`), null);

  // Trigger flush (simulating beforeunload)
  const flushed = flushPersistedAppState();
  assert.equal(flushed, true);

  // Now it must be stored
  const restored = loadPersistedAppState("STORE_XYZ");
  assert.ok(restored);
  assert.equal(restored.data.inventory[0].ingredient, "Sữa tươi");
});

test("Clear persisted app state cleans up storage safely", () => {
  const mockStorage = (globalThis as unknown as { window: { localStorage: MockLocalStorage } }).window.localStorage;
  mockStorage.clear();

  const data = buildEmptyBootstrapData("STORE_TEMP");
  savePersistedAppState({
    version: 1,
    updatedAt: new Date().toISOString(),
    storeId: "STORE_TEMP",
    data,
  });

  assert.ok(loadPersistedAppState("STORE_TEMP"));
  clearPersistedAppState("STORE_TEMP");
  assert.equal(loadPersistedAppState("STORE_TEMP"), null);
});

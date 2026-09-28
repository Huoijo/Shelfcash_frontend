import type {
  BootstrapData,
  DecisionBriefFacts,
  DecisionPackage,
  ImportLog,
  InventoryConstraint,
  PlanResponse,
  PurchaseOrder,
  Strategy,
} from "./types";
import { hasOperationalData } from "./data";

export const APP_STORAGE_PREFIX = "shelfcash:app-data:v1:";
export const ACTIVE_STORE_KEY = "shelfcash:active-store-id:v1";
export const CURRENT_DATA_KEY = "shelfcash:app-data:current:v1";

export interface PersistedAppState {
  version: number;
  updatedAt: string;
  storeId: string;
  data: BootstrapData;
  plan?: PlanResponse;
  draftOrders?: PurchaseOrder[];
  ordersPagination?: { page: number; pageSize: number; total: number };
  importLogs?: ImportLog[];
  inventoryConstraints?: InventoryConstraint[];
  strategy?: Strategy;
  decision?: DecisionPackage | null;
  decisionBrief?: DecisionBriefFacts | null;
  activePage?: string;
  activeIngredient?: string;
}

let pendingState: PersistedAppState | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function getStoredActiveStoreId(): string | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_STORE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredActiveStoreId(storeId: string): void {
  if (!isLocalStorageAvailable() || !storeId) return;
  try {
    window.localStorage.setItem(ACTIVE_STORE_KEY, storeId);
  } catch (caught) {
    console.warn("Failed to persist active store ID:", caught);
  }
}

function isValidBootstrapData(value: unknown): value is BootstrapData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.today === "string" &&
    Array.isArray(candidate.inventory) &&
    Array.isArray(candidate.ingredients) &&
    Array.isArray(candidate.products) &&
    Boolean(candidate.settings && typeof candidate.settings === "object")
  );
}

export function hasValidPersistedData(state: PersistedAppState | null): boolean {
  if (!state || !state.data) return false;
  const { data } = state;
  return (
    hasOperationalData(data) ||
    data.ingredients.length > 0 ||
    data.recipes.length > 0 ||
    data.salesHistory.length > 0 ||
    Boolean(data.settings?.storeId && data.settings.storeId.trim().length > 0) ||
    Boolean(state.draftOrders && state.draftOrders.length > 0) ||
    Boolean(state.importLogs && state.importLogs.length > 0)
  );
}

function pruneBulkyData(state: PersistedAppState): PersistedAppState {
  const maxSalesRows = 500;
  const maxLogs = 50;
  const salesHistory =
    state.data.salesHistory.length > maxSalesRows
      ? state.data.salesHistory.slice(-maxSalesRows)
      : state.data.salesHistory;
  const importLogs =
    state.importLogs && state.importLogs.length > maxLogs
      ? state.importLogs.slice(-maxLogs)
      : state.importLogs;

  return {
    ...state,
    importLogs,
    data: {
      ...state.data,
      salesHistory,
    },
  };
}

export function savePersistedAppState(state: PersistedAppState): boolean {
  if (!isLocalStorageAvailable()) return false;
  if (!state || !isValidBootstrapData(state.data)) return false;

  const storeId = state.storeId || state.data.settings?.storeId || "default";
  const primaryKey = `${APP_STORAGE_PREFIX}${storeId}`;

  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(primaryKey, serialized);
    window.localStorage.setItem(CURRENT_DATA_KEY, serialized);
    if (storeId && storeId !== "default") {
      saveStoredActiveStoreId(storeId);
    }
    return true;
  } catch (caught: unknown) {
    const isQuotaError =
      caught instanceof DOMException &&
      (caught.name === "QuotaExceededError" || caught.code === 22);

    if (isQuotaError) {
      try {
        const pruned = pruneBulkyData(state);
        const serialized = JSON.stringify(pruned);
        window.localStorage.setItem(primaryKey, serialized);
        window.localStorage.setItem(CURRENT_DATA_KEY, serialized);
        return true;
      } catch (retryError) {
        console.warn("Storage quota exceeded even after pruning:", retryError);
        return false;
      }
    }

    console.warn("Failed to persist app state:", caught);
    return false;
  }
}

export function persistAppStateDebounced(
  state: PersistedAppState,
  delayMs = 250,
): void {
  pendingState = state;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (pendingState) {
      savePersistedAppState(pendingState);
      pendingState = null;
    }
  }, delayMs);
}

export function flushPersistedAppState(): boolean {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pendingState) {
    const toSave = pendingState;
    pendingState = null;
    return savePersistedAppState(toSave);
  }
  return false;
}

export function loadPersistedAppState(
  storeId?: string,
): PersistedAppState | null {
  if (!isLocalStorageAvailable()) return null;

  const targetId = storeId || getStoredActiveStoreId() || "";
  const candidateKeys = [
    targetId ? `${APP_STORAGE_PREFIX}${targetId}` : null,
    CURRENT_DATA_KEY,
    `${APP_STORAGE_PREFIX}default`,
  ].filter((key): key is string => Boolean(key));

  for (const key of candidateKeys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        isValidBootstrapData(parsed.data)
      ) {
        return parsed as PersistedAppState;
      }
    } catch (caught) {
      console.warn(`Failed to parse persisted app state for key "${key}":`, caught);
    }
  }

  return null;
}

export function clearPersistedAppState(storeId?: string): void {
  if (!isLocalStorageAvailable()) return;
  try {
    if (storeId) {
      window.localStorage.removeItem(`${APP_STORAGE_PREFIX}${storeId}`);
    }
    const activeStoreId = getStoredActiveStoreId();
    if (activeStoreId && (!storeId || activeStoreId === storeId)) {
      window.localStorage.removeItem(ACTIVE_STORE_KEY);
    }
    window.localStorage.removeItem(CURRENT_DATA_KEY);
  } catch (caught) {
    console.warn("Failed to clear persisted app state:", caught);
  }
}

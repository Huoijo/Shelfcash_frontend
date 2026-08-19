"use client";

import {
  BookOpen,
  CalendarClock,
  Coffee,
  Home,
  Menu as MenuIcon,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adaptBootstrap,
  adaptOrders,
  adaptPlan,
  emptyBackendPlan,
  selectPlanningScenario,
  strategyFromApi,
} from "../lib/contract-adapters";
import { dateInTimeZone } from "../lib/data";
import { DECISION_CUTOFF_DATE, shouldPollDecisionRun } from "../lib/decision-run";
import { runSimulationAttempt } from "../lib/simulation-orchestration";
import {
  createIdempotencyKey,
  createInventoryAdjustment,
  createInventoryCount,
  confirmPurchaseOrder,
  getBootstrap,
  getConnectionHealth,
  getDecisionBrief,
  getDecisionRun,
  explainDecision,
  runDecisionWhatIf,
  getMenu,
  getInventory,
  getInventoryConstraints,
  getPurchaseOrder,
  getPurchaseOrders,
  getRecipe,
  receivePurchaseOrder,
  replaceMenuComponents,
  saveAliases as saveAliasesApi,
  saveCalendar,
  saveRecipe as saveRecipeApi,
  saveSettings,
  saveSupplierConstraint,
  ShelfCashApiError,
  trainForecastModel,
  updatePurchaseOrder,
  waitForDecisionRun,
} from "../lib/shelfcash-client";
import {
  createDraftOrdersFromLegacyPlan,
  runLegacyPurchaseOrderBridge,
  type PlanningWorkflowSnapshot,
} from "../lib/planning-workflow";
import {
  isTimezoneAwareDateTime,
  toNumber,
  toTimezoneAwareIso,
} from "../lib/api-contract";
import {
  findIngredientForRecipeLine,
  canEditDirectRecipe,
  mergeRecipeIngredients,
  productIdentityKey,
} from "../lib/recipes";
import { normalizeMenuItems, validateComboComponents } from "../lib/menu";
import type {
  Alias,
  ApiRecord,
  BackendConnectionHealth,
  BootstrapData,
  CalendarDay,
  ImportLog,
  IngestionResult,
  InventoryConstraint,
  PlanResponse,
  DecisionPackage,
  DecisionBriefFacts,
  DecisionExplanationResponse,
  ExplanationRequest,
  WhatIfRequest,
  WhatIfResponse,
  Product,
  MenuComponentDraft,
  MenuItem,
  PurchaseOrder,
  RecipeLine,
  RecipeVersion,
  Settings as ShelfSettings,
  Strategy,
  SupplierConstraintRow,
} from "../lib/types";
import { Notice, Toast, cn } from "./components/ui";
import { DecisionWorkspace } from "./components/DecisionWorkspace";
import { DecisionCenterWorkspace } from "./components/DecisionCenterWorkspace";
import { ImportView } from "./views/ImportView";
import { InventoryView } from "./views/InventoryView";
import { MenuView } from "./views/MenuView";
import { PlanView, type SimulationRunInput } from "./views/PlanView";
import {
  RecipesView,
  type ComboComponentsSaveResult,
  type RecipeSaveOptions,
} from "./views/RecipesView";
import { SettingsView } from "./views/SettingsView";

type PageKey =
  | "today"
  | "future"
  | "simulator"
  | "import"
  | "inventory"
  | "menu"
  | "recipes"
  | "plan"
  | "orders"
  | "settings";

const navigationGroups: Array<{
  label?: string;
  items: Array<{
    key: PageKey;
    label: string;
    icon: typeof Home;
  }>;
}> = [
  {
    items: [
      { key: "today", label: "Hôm nay", icon: Home },
      { key: "future", label: "Tương lai 7 ngày", icon: CalendarClock },
      { key: "simulator", label: "Mô phỏng", icon: ShoppingCart },
      { key: "plan", label: "Kế hoạch nhập", icon: ShoppingCart },
      { key: "orders", label: "Đơn mua hàng", icon: Package },
    ],
  },
  {
    label: "Dữ liệu",
    items: [
      { key: "import", label: "Nhập dữ liệu", icon: Upload },
      { key: "inventory", label: "Kho", icon: Package },
      { key: "menu", label: "Menu", icon: Coffee },
      { key: "recipes", label: "Công thức", icon: BookOpen },
      { key: "plan", label: "Kế hoạch nhập hàng", icon: ShoppingCart },
    ],
  },
  {
    label: "Thiết lập",
    items: [{ key: "settings", label: "Cài đặt", icon: Settings }],
  },
];

const navigation = navigationGroups.flatMap((group) => group.items);

function AppNavigation({
  page,
  hasStore,
  importDraftCount,
  onSelect,
}: {
  page: PageKey;
  hasStore: boolean;
  importDraftCount: number;
  onSelect: (page: PageKey) => void;
}) {
  return (
    <nav aria-label="Điều hướng chính">
      {navigationGroups.map((group) => (
        <div className="nav-group" key={group.label ?? group.items[0]?.key}>
          {group.label ? <span className="nav-label">{group.label}</span> : null}
          <div className="nav-group-items">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-current={page === item.key ? "page" : undefined}
                  className={cn(page === item.key && "active")}
                  disabled={
                    !hasStore && item.key !== "today" && item.key !== "import"
                  }
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.key === "import" && importDraftCount ? (
                    <b className="nav-count">{importDraftCount}</b>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ShelfCashApiError) {
    const messages: Record<string, string> = {
      ENDPOINT_NOT_ALLOWED: "Yêu cầu này hiện chưa được hỗ trợ.",
      MISSING_FORECAST: "Chưa có dự báo phù hợp để lập kế hoạch.",
      MISSING_RECIPE: "Một số sản phẩm chưa có công thức hiệu lực.",
      INVALID_RECIPE_UNIT: "Đơn vị trong công thức không hợp lệ.",
      INVENTORY_STATE_INCOMPLETE: "Dữ liệu tồn kho chưa đủ để lập kế hoạch.",
      NO_VALID_SUPPLIER: "Chưa có nhà cung cấp phù hợp cho một số nguyên liệu.",
      OPTIMIZATION_INFEASIBLE: "Không tìm được kế hoạch nhập hàng thỏa các ràng buộc hiện tại.",
      CRITIC_REJECTED_ALL_PLANS: "Không có phương án đủ điều kiện để khuyến nghị.",
      MODEL_NOT_READY: "Mô hình dự báo chưa sẵn sàng. Hãy thiết lập trong phần quản trị rồi chạy lại.",
      RECIPE_NOT_FOUND: "Một sản phẩm chưa có công thức có hiệu lực.",
      RECIPE_NOT_ALLOWED_FOR_COMBO:
        "Sản phẩm này là Combo; hãy chỉnh danh sách thành phần thay vì công thức trực tiếp.",
      RECIPE_NOT_EFFECTIVE: "Một công thức không có hiệu lực trong ngày dự báo.",
      RECIPE_YIELD_INVALID: "Sản lượng đầu ra của công thức không hợp lệ.",
      RECIPE_LINE_INVALID: "Có dòng nguyên liệu chưa hợp lệ.",
      INGREDIENT_UNIT_CONVERSION_FAILED: "Không thể quy đổi đơn vị nguyên liệu.",
      INGREDIENT_SCOPE_NO_MATCH: "Không có nguyên liệu phù hợp với phạm vi đã chọn; đây không phải là nhu cầu bằng 0.",
      SAFETY_STOCK_NOT_CONFIGURED: "Chưa cấu hình tồn kho an toàn; hệ thống tạm tính mức này là 0.",
      BUSINESS_CONSTRAINT_NOT_FOUND: "Không tìm thấy cấu hình tồn kho phù hợp.",
      BUSINESS_CONSTRAINT_AMBIGUOUS: "Có nhiều cấu hình cùng hiệu lực.",
      BUSINESS_CONSTRAINT_UNIT_INVALID: "Đơn vị tồn kho an toàn không hợp lệ.",
      SAFETY_STOCK_UNIT_CONVERSION_FAILED: "Không thể quy đổi đơn vị tồn kho an toàn.",
      VERSION_CONFLICT: "Dữ liệu đã thay đổi ở phiên làm việc khác. ShelfCash đã tải bản mới nhất; hãy kiểm tra lại.",
      BUDGET_EXCEEDED: "Ngân sách còn lại không đủ để xác nhận đơn.",
    };
    return messages[caught.code] ?? fallback;
  }
  return caught instanceof Error ? caught.message : fallback;
}

function withSafetyStocks(
  data: BootstrapData,
  constraints: InventoryConstraint[],
): BootstrapData {
  const safetyByIngredient = new Map(
    constraints
      .filter(
        (item) =>
          item.ingredientId && item.constraintType === "safety_stock",
      )
      .map((item) => [
        item.ingredientId as string,
        Number.isFinite(Number(item.value)) ? Number(item.value) : null,
      ]),
  );
  return {
    ...data,
    inventoryConstraints: constraints,
    inventory: data.inventory.map((item) => ({
      ...item,
      safetyStock:
        item.ingredientId && safetyByIngredient.has(item.ingredientId)
          ? safetyByIngredient.get(item.ingredientId) ?? null
          : null,
    })),
  };
}

function apiListRecords(value: unknown): ApiRecord[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Array.isArray((value as ApiRecord).items)
        ? ((value as ApiRecord).items as unknown[])
        : Array.isArray((value as ApiRecord).inventory)
          ? ((value as ApiRecord).inventory as unknown[])
          : []
      : [];
  return source.filter(
    (item): item is ApiRecord =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function orderDateTime(value: string, timezone: string): string {
  if (isTimezoneAwareDateTime(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Thời điểm nhận hàng không hợp lệ.");
  }
  return toTimezoneAwareIso(parsed, timezone);
}

function retryableTransportFailure(caught: unknown): boolean {
  return (
    caught instanceof ShelfCashApiError &&
    [
      "NETWORK_ERROR",
      "BACKEND_UNREACHABLE",
      "REQUEST_TIMEOUT",
      "JOB_TIMEOUT",
    ].includes(caught.code)
  );
}

export function ShelfCashApp({
  initialData,
  initialDecisionIngredient = "",
  initialDecisionView = "today",
  initialPlan,
}: {
  initialData: BootstrapData;
  initialDecisionIngredient?: string;
  initialDecisionView?: "today" | "future";
  initialPlan: PlanResponse;
}) {
  const [page, setPage] = useState<PageKey>(initialDecisionView);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [data, setData] = useState(initialData);
  const [plan, setPlan] = useState(initialPlan);
  const [decision, setDecision] = useState<DecisionPackage | null>(null);
  const [decisionBrief, setDecisionBrief] = useState<DecisionBriefFacts | null>(null);
  const [decisionExplanation, setDecisionExplanation] = useState<DecisionExplanationResponse | null>(null);
  const [decisionWhatIf, setDecisionWhatIf] = useState<WhatIfResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const briefLoadRef = useRef<{
    decisionRunId: string;
    promise: Promise<DecisionBriefFacts | null>;
  } | null>(null);
  const briefRequestSequence = useRef(0);
  const [decisionIngredient, setDecisionIngredient] = useState("");
  const [decisionCenterIngredient, setDecisionCenterIngredient] = useState(initialDecisionIngredient);

  function navigateDecisionCenter(
    view: "today" | "future",
    ingredientId?: string,
  ) {
    if (ingredientId) setDecisionCenterIngredient(ingredientId);
    setPage(view);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("decision_view", view);
    if (ingredientId) url.searchParams.set("ingredient", ingredientId);
    else url.searchParams.delete("ingredient");
    window.history.pushState({}, "", url);
  }

  async function loadDecisionBrief(decisionRunId: string, signal?: AbortSignal) {
    const active = briefLoadRef.current;
    if (active?.decisionRunId === decisionRunId) return active.promise;
    const requestSequence = ++briefRequestSequence.current;
    setBriefLoading(true);
    setBriefError(null);
    setDecisionBrief(null);
    setDecisionExplanation(null);
    setDecisionWhatIf(null);
    setExplanationError(null);
    setWhatIfError(null);
    const promise = getDecisionBrief(decisionRunId)
      .then((brief) => {
      if (requestSequence === briefRequestSequence.current) {
        setDecisionBrief(brief);
        setBriefError(null);
      }
      return brief;
    })
    .catch((caught) => {
      if (requestSequence === briefRequestSequence.current) {
        setBriefError(errorMessage(caught, "Không thể tải kế hoạch nhập hàng."));
      }
      return null;
    })
    .finally(() => {
      if (requestSequence === briefRequestSequence.current) {
        setBriefLoading(false);
        briefLoadRef.current = null;
      }
    });
    briefLoadRef.current = { decisionRunId, promise };
    // Do not attach a caller AbortSignal: a development-effect cleanup or a
    // second consumer must not cancel the shared request for this same run.
    void signal;
    return promise;
  }

  async function requestDecisionExplanation(request: ExplanationRequest) {
    if (!decision?.decision_run_id) return;
    setExplanationLoading(true);
    setExplanationError(null);
    try {
      const response = await explainDecision(decision.decision_run_id, request);
      setDecisionExplanation(response);
      setExplanationError(null);
    } catch (caught) {
      setExplanationError(errorMessage(caught, "Không thể tải giải thích cho kế hoạch này."));
    } finally {
      setExplanationLoading(false);
    }
  }

  async function requestDecisionWhatIf(mutation: WhatIfRequest) {
    if (!decision?.decision_run_id) return;
    setWhatIfLoading(true);
    setWhatIfError(null);
    try {
      const result = await runDecisionWhatIf(decision.decision_run_id, mutation);
      setDecisionWhatIf(result);
      setWhatIfError(null);
    } catch (caught) {
      setWhatIfError(errorMessage(caught, "Không thể chạy giả lập thay đổi."));
    } finally {
      setWhatIfLoading(false);
    }
  }

  useEffect(() => {
    const storeId = data.settings.storeId;
    if (!storeId) return;
    const decisionRunId = window.localStorage.getItem(`shelfcash:decision-run:${storeId}`);
    if (!decisionRunId) return;
    const abortController = new AbortController();
    void (async () => {
      try {
        const result = await getDecisionRun(decisionRunId, {
          signal: abortController.signal,
        });
        const resolved = shouldPollDecisionRun(result.status)
          ? await waitForDecisionRun(decisionRunId, result, {
              signal: abortController.signal,
            })
          : result;
        if (!abortController.signal.aborted) {
          setDecision(resolved);
          if (resolved.status === "completed" || resolved.status === "completed_with_no_feasible_recommendation") {
            await loadDecisionBrief(resolved.decision_run_id, abortController.signal);
          }
        }
      } catch {
        // The persisted package is a convenience; a failed reload must not block the app.
      }
    })();
    return () => abortController.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [strategy, setStrategy] = useState<Strategy>(
    strategyFromApi(initialData.settings.defaultStrategy),
  );
  const [planIngredient, setPlanIngredient] = useState("");
  const [draftOrders, setDraftOrders] = useState<PurchaseOrder[]>([]);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [recipeVersions] = useState<RecipeVersion[]>([]);
  const [importDraftFiles, setImportDraftFiles] = useState<File[]>([]);
  const [connection, setConnection] =
    useState<BackendConnectionHealth | null>(null);
  const [toasts, setToasts] = useState<Array<{
    id: number;
    actionKey: string;
    message: string;
    tone: "success" | "error";
  }>>([]);
  const toastSequence = useRef(0);
  const setToast = useCallback((toast: {
    message: string;
    tone: "success" | "error";
    actionKey?: string;
  } | null) => {
    if (!toast) {
      setToasts([]);
      return;
    }
    const actionKey = toast.actionKey ?? `${toast.tone}:${toast.message}`;
    const id = ++toastSequence.current;
    setToasts((current) => [
      ...current.filter((item) => item.actionKey !== actionKey),
      { id, actionKey, message: toast.message, tone: toast.tone },
    ]);
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryConstraints, setInventoryConstraints] = useState<
    InventoryConstraint[]
  >(initialData.inventoryConstraints);
  const [inventoryConstraintsError, setInventoryConstraintsError] = useState<
    string | null
  >(null);
  const [inventoryConstraintsLoading, setInventoryConstraintsLoading] =
    useState(false);
  const operationSequence = useRef(0);
  const decisionRunAbort = useRef<AbortController | null>(null);
  const workflowSnapshot = useRef<PlanningWorkflowSnapshot | null>(null);
  const draftIdempotency = useRef<{
    fingerprint: string;
    bridge: string;
    purchaseOrders: string;
  } | null>(null);
  const updateIdempotencyKeys = useRef(
    new Map<string, { fingerprint: string; key: string }>(),
  );
  const confirmIdempotencyKeys = useRef(
    new Map<string, { version: number; key: string; confirmedAt: string }>(),
  );
  const receiveIdempotencyKeys = useRef(
    new Map<string, { fingerprint: string; key: string }>(),
  );
  const inventoryMutationKeys = useRef(new Map<string, string>());
  const comboComponentMutationKeys = useRef(new Map<string, string>());
  const trainingIdempotencyKeys = useRef(new Map<string, string>());
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileCloseButton = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      decisionRunAbort.current?.abort();
    },
    [],
  );

  const reloadFromBackend = useCallback(
    async (
      baseData: BootstrapData,
      storeId: string,
      requestedStrategy: Strategy,
      resetPlanning = true,
    ): Promise<boolean> => {
      if (!storeId.trim()) return false;
      const operation = ++operationSequence.current;
      setRefreshing(true);
      setInventoryConstraintsLoading(true);
      try {
        const [bootstrap, inventoryLotsResult, inventoryResult, ordersResult] =
          await Promise.all([
          getBootstrap(storeId),
          getInventory(storeId).then(
            (value) => ({ value, error: null as string | null }),
            (caught) => ({
              value: null,
              error: errorMessage(caught, "Không tải được danh sách lô đầy đủ."),
            }),
          ),
          getInventoryConstraints({
            storeId,
            asOfDate: baseData.today,
          }).then(
            (value) => ({ value, error: null as string | null }),
            (caught) => ({
              value: [] as InventoryConstraint[],
              error: errorMessage(caught, "Không tải được ngưỡng tồn kho."),
            }),
          ),
          getPurchaseOrders(storeId).then(
            (value) => ({ value, error: null as string | null }),
            (caught) => ({
              value: null,
              error: errorMessage(caught, "Không tải được đơn hàng."),
            }),
          ),
          ]);
        if (operation !== operationSequence.current) return false;

        const bootstrapWithInventory = inventoryLotsResult.value
          ? {
              ...bootstrap,
              inventory: apiListRecords(inventoryLotsResult.value),
            }
          : bootstrap;
        const adapted = adaptBootstrap(baseData, bootstrapWithInventory);
        const hydratedData = withSafetyStocks(adapted, inventoryResult.value);
        // `today` is the date shown as “Hôm nay” and used as the default
        // business date. Resolve it in the store's timezone instead of
        // trusting a bootstrap date that may have been calculated in UTC.
        const nextData = {
          ...hydratedData,
          today: dateInTimeZone(
            hydratedData.settings.timezone ?? "Asia/Ho_Chi_Minh",
          ),
        };
        const nextStrategy = resetPlanning
          ? strategyFromApi(nextData.settings.defaultStrategy)
          : requestedStrategy;
        setData(nextData);
        setInventoryConstraints(inventoryResult.value);
        setInventoryConstraintsError(inventoryResult.error);
        if (inventoryLotsResult.error) {
          setToast({ message: inventoryLotsResult.error, tone: "error" });
        }
        if (resetPlanning) {
          workflowSnapshot.current = null;
          setStrategy(nextStrategy);
          setPlan(emptyBackendPlan(nextData, nextStrategy));
        }
        if (ordersResult.value) {
          setDraftOrders(adaptOrders(ordersResult.value));
        } else if (ordersResult.error) {
          setToast({ message: ordersResult.error, tone: "error" });
        }
        return true;
      } catch (caught) {
        if (operation === operationSequence.current) {
          setToast({
            message: errorMessage(
              caught,
              "Không thể tải dữ liệu cửa hàng.",
            ),
            tone: "error",
          });
        }
        return false;
      } finally {
        if (operation === operationSequence.current) {
          setRefreshing(false);
          setInventoryConstraintsLoading(false);
        }
      }
    },
    [setToast],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const health = await getConnectionHealth();
      if (!active) return;
      setConnection(health);
      if (
        health.service === "online" &&
        initialData.settings.storeId.trim()
      ) {
        await reloadFromBackend(
          initialData,
          initialData.settings.storeId,
          strategyFromApi(initialData.settings.defaultStrategy),
        );
      }
    })();
    return () => {
      active = false;
      operationSequence.current += 1;
    };
  }, [initialData, reloadFromBackend]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseButton.current?.focus();

    const handleDrawerKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        requestAnimationFrame(() => mobileMenuButton.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = document.getElementById("mobile-navigation");
      const focusable = Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeAtDesktop = () => {
      if (window.innerWidth > 860) setMobileNavigationOpen(false);
    };
    window.addEventListener("keydown", handleDrawerKeydown);
    window.addEventListener("resize", closeAtDesktop);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDrawerKeydown);
      window.removeEventListener("resize", closeAtDesktop);
    };
  }, [mobileNavigationOpen]);

  async function refreshConnection() {
    setConnection(null);
    const health = await getConnectionHealth();
    setConnection(health);
    if (
      health.service === "online" &&
      data.settings.storeId.trim()
    ) {
      await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        false,
      );
    }
  }

  function openPlan(ingredient?: string, destination: PageKey = "plan") {
    if (ingredient) setPlanIngredient(ingredient);
    setPage(destination);
  }

  async function importResult(result: IngestionResult, files: File[]) {
    const rowCount = [
      result.inventory,
      result.sales_history,
      result.usage_history,
      result.recipes,
      result.purchase_history,
      result.supplier_constraints,
      result.calendar_features,
      result.business_constraints,
      result.menu,
    ].reduce(
      (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
      0,
    );
    setImportLogs((current) => [
      ...current,
      {
        file: files.map((file) => file.name).join(", "),
        sheet: "Hệ thống chuẩn hóa",
        dataType: "Đã nhập dữ liệu",
        rows: rowCount,
        importedAt: new Date().toISOString(),
      },
    ]);
    const storeId = result.store_id || data.settings.storeId;
    const synchronized = await reloadFromBackend(
      data,
      storeId,
      strategy,
      true,
    );
    setToast(
      synchronized
        ? {
            message: `Đã nhập ${rowCount.toLocaleString("vi-VN")} bản ghi và cập nhật dữ liệu cửa hàng.`,
            tone: "success",
          }
        : {
            message:
              "Dữ liệu đã được nhập nhưng màn hình chưa tải được bản mới nhất. Hãy thử làm mới.",
            tone: "error",
          },
    );
  }

  const refreshMenuData = useCallback(
    async (storeId = data.settings.storeId): Promise<MenuItem[] | null> => {
      if (!storeId.trim()) return null;
      try {
        const response = await getMenu(storeId, {
          status: "all",
          itemType: "all",
          page: 1,
          pageSize: 100,
        });
        const menu = normalizeMenuItems(response);
        setData((current) => ({
          ...current,
          menu,
          products: current.products.map((product) => {
            const menuItem = menu.find(
              (item) => item.productId === product.productId,
            );
            return menuItem
              ? {
                  ...product,
                  itemType: menuItem.itemType,
                  status: menuItem.status,
                  sellingUnit: menuItem.sellingUnit,
                  price: menuItem.price,
                }
              : product;
          }),
        }));
        return menu;
      } catch {
        return null;
      }
    },
    [data.settings.storeId],
  );

  const loadRecipeDetails = useCallback(async (product: Product): Promise<Product> => {
    if (
      !data.settings.storeId ||
      !product.productId ||
      !canEditDirectRecipe(product)
    ) {
      return product;
    }
    try {
      const detail = await getRecipe({
        storeId: data.settings.storeId,
        productId: product.productId,
        onDate: data.today,
      });
      return {
        ...product,
        recipeVersion: toNumber(detail.version, 0),
        effectiveDate:
          typeof detail.effective_from === "string"
            ? detail.effective_from
            : product.effectiveDate,
        recipeYieldQuantity: toNumber(detail.yield_quantity, 1),
        recipeProcessLossRate: toNumber(detail.process_loss_rate, 0),
      };
    } catch (caught) {
      if (
        caught instanceof ShelfCashApiError &&
        caught.code === "RECIPE_NOT_FOUND"
      ) {
        return {
          ...product,
          recipeVersion: 0,
          recipeYieldQuantity: 1,
          recipeProcessLossRate: 0,
        };
      }
      if (
        caught instanceof ShelfCashApiError &&
        caught.code === "RECIPE_NOT_ALLOWED_FOR_COMBO"
      ) {
        const menu = await refreshMenuData();
        const refreshed = menu?.find(
          (item) => item.productId === product.productId,
        );
        if (refreshed) {
          return { ...product, itemType: refreshed.itemType };
        }
        throw new Error(
          "Sản phẩm này là Combo; hãy làm mới Menu để chỉnh danh sách thành phần thay vì công thức trực tiếp.",
        );
      }
      throw caught;
    }
  }, [data.settings.storeId, data.today, refreshMenuData]);

  async function saveRecipe(
    selectedProduct: Product,
    rows: RecipeLine[],
    options: RecipeSaveOptions,
  ): Promise<boolean> {
    const product = data.products.find(
      (item) =>
        productIdentityKey(item) === productIdentityKey(selectedProduct),
    );
    try {
      if (!product?.productId) {
        throw new Error(
          "Dữ liệu món chưa đầy đủ nên chưa thể lưu công thức. Hãy đồng bộ lại.",
        );
      }
      if (!canEditDirectRecipe(product)) {
        throw new Error(
          product.itemType === "combo"
            ? "Sản phẩm này là Combo; hãy chỉnh danh sách thành phần thay vì công thức trực tiếp."
            : "Chưa xác định được loại sản phẩm; chưa thể lưu công thức.",
        );
      }
      const ingredients = mergeRecipeIngredients(
        data.ingredients ?? [],
        data.inventory,
      );
      const apiLines = rows.map((row) => {
        const ingredient = findIngredientForRecipeLine(row, ingredients);
        const ingredientId = row.ingredientId ?? ingredient?.ingredientId;
        if (!ingredientId) {
          throw new Error(
            `Nguyên liệu “${row.ingredient}” chưa có đủ thông tin để lưu công thức.`,
          );
        }
        return {
          ingredientId,
          quantity: row.quantity,
          unit: row.unit,
        };
      });
      await saveRecipeApi({
        storeId: data.settings.storeId,
        productId: product.productId,
        effectiveFrom: options.effectiveFrom,
        version: options.version,
        yieldQuantity: options.yieldQuantity,
        processLossRate: options.processLossRate,
        lines: apiLines,
      });
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      if (synchronized) {
        setToast({
          message: `Đã lưu công thức cho “${product.product}”.`,
          tone: "success",
        });
      }
      return synchronized;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu công thức."),
        tone: "error",
      });
      return false;
    }
  }

  async function saveComboComponents(
    combo: MenuItem,
    components: MenuComponentDraft[],
  ): Promise<ComboComponentsSaveResult> {
    const currentCombo = data.menu.find(
      (item) => item.productId === combo.productId,
    );
    if (!currentCombo || currentCombo.itemType !== "combo") {
      return {
        saved: false,
        message:
          "Không tìm thấy Combo hiện tại trong Menu. Hãy tải lại dữ liệu trước khi lưu.",
      };
    }
    const singles = data.menu.filter(
      (item) => item.itemType === "single" && item.productId !== currentCombo.productId,
    );
    const issues = validateComboComponents(
      currentCombo.productId,
      components,
      singles,
    );
    if (issues.length) return { saved: false, message: issues.join(" ") };

    const fingerprint = JSON.stringify({
      productId: currentCombo.productId,
      version: currentCombo.version,
      components,
    });
    const idempotencyKey =
      comboComponentMutationKeys.current.get(fingerprint) ??
      createIdempotencyKey();
    comboComponentMutationKeys.current.set(fingerprint, idempotencyKey);
    try {
      await replaceMenuComponents({
        storeId: data.settings.storeId,
        productId: currentCombo.productId,
        version: currentCombo.version,
        components,
        idempotencyKey,
      });
      comboComponentMutationKeys.current.delete(fingerprint);
      const menu = await refreshMenuData();
      return menu
        ? { saved: true, message: `Đã lưu thành phần cho “${currentCombo.product}”.` }
        : {
            saved: false,
            message:
              "Đã lưu thành phần nhưng chưa thể tải Menu mới nhất. Hãy làm mới trước khi chỉnh tiếp.",
          };
    } catch (caught) {
      if (
        caught instanceof ShelfCashApiError &&
        caught.code === "VERSION_CONFLICT"
      ) {
        comboComponentMutationKeys.current.delete(fingerprint);
        const menu = await refreshMenuData();
        return {
          saved: false,
          message: menu
            ? "Combo đã được cập nhật ở nơi khác. Dữ liệu mới nhất đã được tải; hãy kiểm tra lại trước khi lưu."
            : "Combo đã được cập nhật ở nơi khác nhưng chưa thể tải bản mới. Hãy làm mới Menu rồi thử lại.",
        };
      }
      return {
        saved: false,
        message: errorMessage(caught, "Không thể lưu thành phần Combo."),
      };
    }
  }

  async function synchronizeMenu(message: string): Promise<void> {
    const synchronized = await reloadFromBackend(
      data,
      data.settings.storeId,
      strategy,
      true,
    );
    setToast({
      message: synchronized
        ? message
        : `${message} Chưa thể tải dữ liệu menu mới nhất.`,
      tone: synchronized ? "success" : "error",
    });
  }

  async function saveInventory(
    inventory: SupplierConstraintRow[],
  ): Promise<boolean> {
    try {
      const invalid = inventory.find(
        (item) => !item.ingredientId || !item.supplierId,
      );
      if (invalid) {
        throw new Error(
          `Nguyên liệu “${invalid.ingredient}” chưa được liên kết đầy đủ với nhà cung cấp.`,
        );
      }
      const results = await Promise.allSettled(
        inventory.map((item) => {
          if (!item.ingredientId || !item.supplierId) {
            throw new Error(
              `Nguyên liệu “${item.ingredient}” chưa được liên kết đầy đủ với nhà cung cấp.`,
            );
          }
          return saveSupplierConstraint({
            storeId: data.settings.storeId,
            constraintId: item.constraintId,
            payload: {
              ingredient_id: item.ingredientId,
              supplier_id: item.supplierId,
              unit_cost: item.unitCost,
              moq: item.moq,
              pack_size: item.packSize,
              lead_time_days: item.leadTimeDays,
              order_unit: item.orderUnit,
              base_unit: item.baseUnit,
              effective_date: item.effectiveDate,
              ...(item.version !== undefined
                ? { version: item.version }
                : {}),
            },
          });
        }),
      );
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failures.length) {
        throw new Error(
          `${failures.length}/${results.length} quy tắc chưa lưu được. Dữ liệu mới nhất đã được tải lại để bạn kiểm tra.`,
        );
      }
      if (synchronized) {
        setToast({ message: "Đã lưu quy tắc nhập hàng.", tone: "success" });
      }
      return synchronized;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu quy tắc nhập hàng."),
        tone: "error",
      });
      return false;
    }
  }

  async function saveAliases(aliases: Alias[]): Promise<boolean> {
    try {
      const payload = aliases.map((alias) => {
        const ingredientId =
          alias.ingredientId ??
          data.ingredients.find(
            (item) => item.ingredient === alias.canonicalName,
          )?.ingredientId;
        if (!ingredientId) {
          throw new Error(
            `Không tìm thấy “${alias.canonicalName}” trong danh mục nguyên liệu.`,
          );
        }
        return { ...alias, ingredientId };
      });
      await saveAliasesApi(data.settings.storeId, payload);
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      if (synchronized) {
        setToast({ message: "Đã lưu tên thay thế.", tone: "success" });
      }
      return synchronized;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu tên thay thế."),
        tone: "error",
      });
      return false;
    }
  }

  async function saveContext(
    settings: ShelfSettings,
    futureCalendar: CalendarDay[],
  ): Promise<boolean> {
    try {
      const results = await Promise.allSettled([
        saveSettings(data.settings.storeId, {
          monthlyBudget: settings.monthlyBudget,
          forecastHorizon: settings.forecastHorizon,
          defaultStrategy: settings.defaultStrategy,
          safetyPolicy: settings.safetyPolicy,
          version: settings.version,
        }),
        saveCalendar(data.settings.storeId, futureCalendar),
      ]);
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failures.length) {
        throw new Error(
          "Một phần cài đặt chưa được lưu. Dữ liệu mới nhất đã được tải lại; hãy kiểm tra trước khi thử lại.",
        );
      }
      if (synchronized) {
        setToast({
          message: "Đã lưu ngân sách, dự báo và lịch vận hành.",
          tone: "success",
        });
      }
      return synchronized;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu settings và lịch."),
        tone: "error",
      });
      return false;
    }
  }

  async function runPlanning({
    horizonDays,
    includeOpenPurchaseOrders,
    budgetOverride,
    onProgress,
  }: SimulationRunInput): Promise<void> {
    if (!data.settings.storeId.trim()) {
      throw new Error("Hãy cấu hình hoặc import một store trước.");
    }
    const operation = ++operationSequence.current;
    decisionRunAbort.current?.abort();
    const abortController = new AbortController();
    decisionRunAbort.current = abortController;
    setDecisionBrief(null);
    setDecisionExplanation(null);
    setDecisionWhatIf(null);
    setBriefError(null);
    setExplanationError(null);
    setWhatIfError(null);
    setRefreshing(true);
    try {
      const resolved = await runSimulationAttempt({
        attemptId: operation,
        storeId: data.settings.storeId,
        cutoffDate: DECISION_CUTOFF_DATE,
        horizonDays,
        includeOpenPurchaseOrders,
        budgetOverride,
        monthlyBudget: data.settings.monthlyBudget,
        signal: abortController.signal,
        onProgress,
      });
      if (operation === operationSequence.current) {
        // The POST only creates the run. Read the canonical resource before
        // rendering its brief, even when the create response is already terminal.
        const decisionRun = await getDecisionRun(resolved.decision.decision_run_id, {
          signal: abortController.signal,
        });
        setDecision(decisionRun);
        await loadDecisionBrief(decisionRun.decision_run_id, abortController.signal);
        setPlan((current) => ({
          ...current,
          status: "completed",
          cutoffDate: resolved.forecast.cutoff_date ?? data.today,
          horizonDays: resolved.forecast.horizon_days ?? horizonDays,
          forecastRunId: resolved.forecast.forecast_run_id,
        }));
        if (resolved.decision.decision_run_id) {
          window.localStorage.setItem(
            `shelfcash:decision-run:${data.settings.storeId}`,
            resolved.decision.decision_run_id,
          );
        }
      }
    } finally {
      if (decisionRunAbort.current === abortController) {
        decisionRunAbort.current = null;
      }
      if (operation === operationSequence.current) setRefreshing(false);
    }
  }

  function changeStrategy(nextStrategy: Strategy) {
    setStrategy(nextStrategy);
    setPlan((current) =>
      selectPlanningScenario(data, current, nextStrategy),
    );
  }

  async function createOrdersFromPlan(
    recommendations: typeof plan.recommendations,
  ): Promise<PurchaseOrder[]> {
    const snapshot = workflowSnapshot.current;
    if (
      !snapshot ||
      !plan.forecastRunId ||
      !plan.cutoffDate ||
      plan.status !== "completed"
    ) {
      throw new Error(
        "Hãy hoàn tất dự báo và kế hoạch nhập hàng trước khi tạo đơn.",
      );
    }
    const fingerprint = JSON.stringify({
      storeId: data.settings.storeId,
      forecastRunId: plan.forecastRunId,
      cutoffDate: plan.cutoffDate,
      strategy,
      remainingBudget: data.settings.remainingBudget,
      lines: recommendations
        .map((line) => ({
          ingredient: line.ingredientId || line.ingredient,
          quantity: line.orderQty,
        }))
        .sort((left, right) => left.ingredient.localeCompare(right.ingredient)),
    });
    if (draftIdempotency.current?.fingerprint !== fingerprint) {
      draftIdempotency.current = {
        fingerprint,
        bridge: createIdempotencyKey(),
        purchaseOrders: createIdempotencyKey(),
      };
    }
    const keys = draftIdempotency.current;
    try {
      const bridge = await runLegacyPurchaseOrderBridge({
        storeId: data.settings.storeId,
        forecastRunId: plan.forecastRunId,
        forecastCutoffDate: plan.cutoffDate,
        strategy,
        remainingBudget: data.settings.remainingBudget,
        idempotencyKey: keys?.bridge,
      });
      const legacyPlan = adaptPlan(
        data,
        strategy,
        snapshot.forecast,
        bridge.result,
      );
      const overrides = new Map<string, number>();
      for (const line of recommendations) {
        if (line.ingredientId) overrides.set(`id:${line.ingredientId}`, line.orderQty);
        overrides.set(`name:${line.ingredient.trim().toLocaleLowerCase("vi")}`, line.orderQty);
      }
      const bridgeLines = legacyPlan.recommendations.map((line) => ({
        ...line,
        // Never let a bridge-only recommendation introduce an unreviewed line.
        orderQty:
          (line.ingredientId
            ? overrides.get(`id:${line.ingredientId}`)
            : undefined) ??
          overrides.get(`name:${line.ingredient.trim().toLocaleLowerCase("vi")}`) ??
          0,
      }));
      const response = await createDraftOrdersFromLegacyPlan({
        storeId: data.settings.storeId,
        planRunId: bridge.result.plan_run_id,
        recommendations: bridgeLines,
        idempotencyKey: keys?.purchaseOrders,
      });
      const orders = adaptOrders(response, bridgeLines);
      draftIdempotency.current = null;
      setPlan((current) => ({
        ...current,
        planRunId: bridge.result.plan_run_id,
      }));
      setDraftOrders((current) => {
        const incomingIds = new Set(orders.map((order) => order.poId));
        return [
          ...current.filter((order) => !incomingIds.has(order.poId)),
          ...orders,
        ];
      });
      return orders;
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        draftIdempotency.current = null;
      }
      throw caught;
    }
  }

  function replaceOrder(value: unknown) {
    const orders = adaptOrders({ orders: [value] }, plan.recommendations);
    const next = orders[0];
    if (!next) return;
    setDraftOrders((current) => [
      ...current.filter((order) => order.poId !== next.poId),
      next,
    ]);
  }

  async function refreshConflictedOrder(
    poId: string,
    caught: unknown,
  ): Promise<never> {
    if (
      caught instanceof ShelfCashApiError &&
      caught.code === "VERSION_CONFLICT"
    ) {
      const latest = await getPurchaseOrder({
        storeId: data.settings.storeId,
        poId,
      });
      replaceOrder(latest);
    }
    throw new Error(errorMessage(caught, "Không thể cập nhật đơn hàng."));
  }

  async function updateOrder(
    poId: string,
    lineUpdates: Array<{
      poLineId: string;
      orderQuantity: number;
    }>,
  ): Promise<void> {
    const order = draftOrders.find((item) => item.poId === poId);
    if (!order || order.status !== "draft") {
      throw new Error("Chỉ đơn nháp mới có thể chỉnh sửa.");
    }
    const fingerprint = JSON.stringify({
      version: order.version ?? 0,
      lineUpdates,
    });
    const existingUpdate = updateIdempotencyKeys.current.get(poId);
    const updateOperation =
      existingUpdate?.fingerprint === fingerprint
        ? existingUpdate
        : { fingerprint, key: createIdempotencyKey() };
    updateIdempotencyKeys.current.set(poId, updateOperation);
    try {
      const result = await updatePurchaseOrder({
        storeId: data.settings.storeId,
        poId,
        version: order.version ?? 0,
        lineUpdates,
        idempotencyKey: updateOperation.key,
      });
      updateIdempotencyKeys.current.delete(poId);
      replaceOrder(result);
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        updateIdempotencyKeys.current.delete(poId);
      }
      return refreshConflictedOrder(poId, caught);
    }
  }

  async function confirmOrder(poId: string): Promise<void> {
    const order = draftOrders.find((item) => item.poId === poId);
    if (!order || order.status !== "draft") {
      throw new Error("Chỉ đơn nháp mới có thể xác nhận.");
    }
    const version = order.version ?? 0;
    const existingConfirm = confirmIdempotencyKeys.current.get(poId);
    const confirmOperation =
      existingConfirm?.version === version
        ? existingConfirm
        : {
            version,
            key: createIdempotencyKey(),
            confirmedAt: toTimezoneAwareIso(
              new Date(),
              data.settings.timezone ?? "Asia/Ho_Chi_Minh",
            ),
          };
    confirmIdempotencyKeys.current.set(poId, confirmOperation);
    try {
      const result = await confirmPurchaseOrder({
        storeId: data.settings.storeId,
        poId,
        version,
        confirmedAt: confirmOperation.confirmedAt,
        idempotencyKey: confirmOperation.key,
      });
      confirmIdempotencyKeys.current.delete(poId);
      replaceOrder(result);
      await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        confirmIdempotencyKeys.current.delete(poId);
      }
      return refreshConflictedOrder(poId, caught);
    }
  }

  async function receiveOrder(
    poId: string,
    input: {
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
    },
  ): Promise<void> {
    const order = draftOrders.find((item) => item.poId === poId);
    if (
      !order ||
      !["ordered", "partially_received"].includes(order.status)
    ) {
      throw new Error(
        "Chỉ đơn ordered hoặc partially_received mới có thể nhận hàng.",
      );
    }
    const receivedAt = orderDateTime(
      input.receivedAt,
      data.settings.timezone ?? "Asia/Ho_Chi_Minh",
    );
    const fingerprint = JSON.stringify({
      version: order.version ?? 0,
      receivedAt,
      deliveryReference: input.deliveryReference,
      lines: input.lines,
    });
    const existingReceive = receiveIdempotencyKeys.current.get(poId);
    const receiveOperation =
      existingReceive?.fingerprint === fingerprint
        ? existingReceive
        : { fingerprint, key: createIdempotencyKey() };
    receiveIdempotencyKeys.current.set(poId, receiveOperation);
    try {
      const result = await receivePurchaseOrder({
        storeId: data.settings.storeId,
        poId,
        version: order.version ?? 0,
        receivedAt,
        deliveryReference: input.deliveryReference,
        lines: input.lines,
        idempotencyKey: receiveOperation.key,
      });
      receiveIdempotencyKeys.current.delete(poId);
      replaceOrder(result);
      await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        receiveIdempotencyKeys.current.delete(poId);
      }
      return refreshConflictedOrder(poId, caught);
    }
  }

  async function countInventoryLot(input: {
    lotId: string;
    countedQuantity: number;
    unit: string;
    note?: string;
  }): Promise<void> {
    const fingerprint = JSON.stringify(input);
    const key =
      inventoryMutationKeys.current.get(fingerprint) ?? createIdempotencyKey();
    inventoryMutationKeys.current.set(fingerprint, key);
    try {
      await createInventoryCount({
        storeId: data.settings.storeId,
        countedAt: toTimezoneAwareIso(
          new Date(),
          data.settings.timezone ?? "Asia/Ho_Chi_Minh",
        ),
        lines: [input],
        idempotencyKey: key,
      });
      inventoryMutationKeys.current.delete(fingerprint);
      await reloadFromBackend(data, data.settings.storeId, strategy, true);
      setToast({
        actionKey: `inventory:count:${input.lotId}`,
        message: "Đã ghi nhận kết quả kiểm kho và đồng bộ tồn kho.",
        tone: "success",
      });
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        inventoryMutationKeys.current.delete(fingerprint);
      }
      throw new Error(errorMessage(caught, "Không thể ghi kiểm kho."));
    }
  }

  async function adjustInventoryLot(input: {
    lotId: string;
    expectedVersion: number;
    quantityDelta: number;
    unit: string;
    reason: string;
    note?: string;
    reference?: string;
  }): Promise<void> {
    const fingerprint = JSON.stringify(input);
    const key =
      inventoryMutationKeys.current.get(fingerprint) ?? createIdempotencyKey();
    inventoryMutationKeys.current.set(fingerprint, key);
    try {
      await createInventoryAdjustment({
        storeId: data.settings.storeId,
        occurredAt: toTimezoneAwareIso(
          new Date(),
          data.settings.timezone ?? "Asia/Ho_Chi_Minh",
        ),
        reference: input.reference,
        lines: [input],
        idempotencyKey: key,
      });
      inventoryMutationKeys.current.delete(fingerprint);
      await reloadFromBackend(data, data.settings.storeId, strategy, true);
      setToast({
        actionKey: `inventory:adjust:${input.lotId}`,
        message: "Đã lưu điều chỉnh và đồng bộ tồn kho.",
        tone: "success",
      });
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        inventoryMutationKeys.current.delete(fingerprint);
      }
      if (
        caught instanceof ShelfCashApiError &&
        caught.code === "VERSION_CONFLICT"
      ) {
        await reloadFromBackend(data, data.settings.storeId, strategy, true);
        throw caught;
      }
      throw new Error(errorMessage(caught, "Không thể điều chỉnh tồn kho."));
    }
  }

  async function trainModel(
    modelVersion: string,
    historyDays: number,
  ): Promise<void> {
    const fingerprint = JSON.stringify({
      storeId: data.settings.storeId,
      cutoffDate: data.today,
      modelVersion: modelVersion.trim(),
      historyDays,
    });
    const key =
      trainingIdempotencyKeys.current.get(fingerprint) ??
      createIdempotencyKey();
    trainingIdempotencyKeys.current.set(fingerprint, key);
    try {
      await trainForecastModel({
        storeId: data.settings.storeId,
        cutoffDate: data.today,
        modelVersion: modelVersion.trim(),
        historyDays,
        idempotencyKey: key,
        timeoutMs: 10 * 60_000,
      });
      trainingIdempotencyKeys.current.delete(fingerprint);
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        trainingIdempotencyKeys.current.delete(fingerprint);
      }
      throw new Error(errorMessage(caught, "Không thể huấn luyện mô hình dự báo."));
    }
  }

  const hasStore = Boolean(data.settings.storeId.trim());
  const selectedPage = (() => {
    if (!hasStore && page !== "today" && page !== "import") {
      return (
        <Notice tone="warning">
          Chưa có cửa hàng để làm việc. Hãy nhập dữ liệu cửa hàng trước.
        </Notice>
      );
    }
    switch (page) {
      case "today":
        return (
          <DecisionCenterWorkspace
            activeView="today"
            data={data}
            decision={decision}
            initialIngredient={decisionCenterIngredient}
            onNavigate={(target) =>
              target === "plan" ? openPlan() : setPage("inventory")
            }
            onViewChange={navigateDecisionCenter}
            plan={plan}
          />
        );
      case "import":
        return null;
      case "inventory":
        return (
          <InventoryView
            data={data}
            plan={plan}
            onOpenPlan={openPlan}
            onCountLot={countInventoryLot}
            onAdjustLot={adjustInventoryLot}
            onRefreshInventory={async () => {
              const refreshed = await reloadFromBackend(
                data,
                data.settings.storeId,
                strategy,
                true,
              );
              if (!refreshed) throw new Error("Không thể tải lại dữ liệu kho.");
            }}
          />
        );
      case "menu":
        return (
          <MenuView
            data={data}
            onOpenImport={() => setPage("import")}
            onMenuChanged={synchronizeMenu}
          />
        );
      case "recipes":
        return (
          <RecipesView
            data={data}
            versions={recipeVersions}
            onLoadDetails={loadRecipeDetails}
            onSave={saveRecipe}
            onSaveComponents={saveComboComponents}
            onOpenPlan={() => openPlan()}
          />
        );
      case "future":
        return (
          <DecisionCenterWorkspace
            activeView="future"
            data={data}
            decision={decision}
            initialIngredient={decisionCenterIngredient}
            onNavigate={(target) =>
              target === "plan" ? openPlan() : setPage("inventory")
            }
            onViewChange={navigateDecisionCenter}
            plan={plan}
          />
        );
      case "simulator":
      case "plan":
      case "orders":
        return (
          <PlanView
            data={data}
            plan={plan}
            decision={decision}
            decisionBrief={decisionBrief}
            briefLoading={briefLoading}
            briefError={briefError}
            onRetryBrief={() => {
              if (decision?.decision_run_id) void loadDecisionBrief(decision.decision_run_id);
            }}
            decisionExplanation={decisionExplanation}
            explanationLoading={explanationLoading}
            explanationError={explanationError}
            onExplainDecision={(request) => void requestDecisionExplanation(request)}
            decisionWhatIf={decisionWhatIf}
            whatIfLoading={whatIfLoading}
            whatIfError={whatIfError}
            onRunWhatIf={(mutation) => void requestDecisionWhatIf(mutation)}
            strategy={strategy}
            initialIngredient={planIngredient}
            draftOrders={draftOrders}
            onRunPlanning={runPlanning}
            onTrainModel={trainModel}
            onStrategyChange={changeStrategy}
            onCreateOrders={createOrdersFromPlan}
            onUpdateOrder={updateOrder}
            onConfirmOrder={confirmOrder}
            onReceiveOrder={receiveOrder}
            focus={
              page === "simulator"
                ? "simulator"
                : page === "orders"
                  ? "orders"
                  : "plan"
            }
          />
        );
      case "settings":
        return (
          <SettingsView
            data={data}
            importLogs={importLogs}
            recipeVersions={recipeVersions}
            onSaveInventory={saveInventory}
            onSaveAliases={saveAliases}
            onSaveContext={saveContext}
            inventoryConstraints={inventoryConstraints}
            inventoryConstraintsError={inventoryConstraintsError}
            inventoryConstraintsLoading={inventoryConstraintsLoading}
          />
        );
    }
  })();

  const currentNavigation =
    navigation.find((item) => item.key === page) ?? navigation[0];
  const CurrentPageIcon = currentNavigation.icon;
  const connectionLabel = refreshing
    ? "Đang tải dữ liệu mới"
    : connection?.service === "offline"
        ? "Mất kết nối"
        : null;
  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
    requestAnimationFrame(() => mobileMenuButton.current?.focus());
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Thanh bên ShelfCash">
        <div className="brand">
          <i>SC</i>
          <span>
            <strong>ShelfCash</strong>
          </span>
        </div>
        <label className="store-select">
          <span>Cửa hàng</span>
          <select value={data.settings.storeId} disabled>
            <option value={data.settings.storeId}>
              {data.settings.storeName}
            </option>
          </select>
        </label>
        <AppNavigation
          page={page}
          hasStore={hasStore}
          importDraftCount={importDraftFiles.length}
          onSelect={setPage}
        />
        <div className={cn("sync-status", !connectionLabel && "is-quiet")}>
          {connectionLabel ? (
            <>
              <span
                className={cn(
                  "sync-dot",
                  (refreshing || !connection) && "syncing",
                  connection?.service === "offline" && "offline",
                )}
              />
              <strong>{connectionLabel}</strong>
            </>
          ) : null}
          <small>
            <CalendarClock aria-hidden="true" size={15} />
            Hôm nay · {data.today.split("-").reverse().join("/")}
          </small>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="top-header">
          <div className="top-header-inner">
            <div className="top-header-leading">
              <button
                aria-controls="mobile-navigation"
                aria-expanded={mobileNavigationOpen}
                aria-label="Mở điều hướng"
                className="mobile-menu-button"
                onClick={() => setMobileNavigationOpen(true)}
                ref={mobileMenuButton}
                type="button"
              >
                <MenuIcon aria-hidden="true" size={20} />
              </button>
              <div className="top-header-page">
                <CurrentPageIcon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{currentNavigation.label}</span>
              </div>
            </div>
            <div className="top-header-meta">
              <div className="top-header-store" title={data.settings.storeName}>
                <Store aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>
                  <small>Cửa hàng</small>
                  <strong>{data.settings.storeName}</strong>
                </span>
              </div>
              {connectionLabel ? (
                <div
                  className={cn(
                    "connection-chip",
                    (refreshing || !connection) && "is-syncing",
                    connection?.service === "offline" && "is-offline",
                  )}
                >
                  <span aria-hidden="true" />
                  <strong>{connectionLabel}</strong>
                </div>
              ) : null}
              <time className="top-header-date" dateTime={data.today}>
                {data.today.split("-").reverse().join("/")}
              </time>
            </div>
          </div>
        </header>

        <main className="main-content">
          {hasStore && connection?.service === "offline" ? (
            <Notice tone="warning">
              Không thể kết nối dịch vụ. Dữ liệu đang hiển thị có thể chưa phải bản mới nhất.
            </Notice>
          ) : null}
          {!hasStore ? (
            <Notice tone="warning">
              Chưa có cửa hàng để làm việc. Hãy nhập dữ liệu cửa hàng hoặc liên
              hệ quản trị viên.
            </Notice>
          ) : null}
          <section hidden={page !== "import"}
            aria-hidden={page !== "import"}
          >
            <ImportView
              store={data.settings.storeName}
              defaultStoreId={data.settings.storeId}
              defaultForecastDate={data.today}
              defaultForecastHorizon={data.settings.forecastHorizon}
              connection={connection}
              files={importDraftFiles}
              setFiles={setImportDraftFiles}
              onRefreshConnection={refreshConnection}
              onImported={importResult}
            />
          </section>
          {page === "import" ? null : selectedPage}
        </main>
      </div>

      {decisionIngredient ? (
        <DecisionWorkspace
          data={data}
          ingredient={decisionIngredient}
          plan={plan}
          onClose={() => setDecisionIngredient("")}
          onNavigate={(destination, ingredient) =>
            openPlan(ingredient, destination)
          }
        />
      ) : null}

      {mobileNavigationOpen ? (
        <div className="mobile-drawer-layer">
          <button
            aria-label="Đóng điều hướng"
            className="mobile-drawer-backdrop"
            onClick={closeMobileNavigation}
            type="button"
          />
          <aside
            aria-label="Điều hướng ShelfCash"
            aria-modal="true"
            className="mobile-drawer"
            id="mobile-navigation"
            role="dialog"
          >
            <div className="mobile-drawer-header">
              <div className="brand">
                <i>SC</i>
                <span>
                  <strong>ShelfCash</strong>
                </span>
              </div>
              <button
                aria-label="Đóng điều hướng"
                className="mobile-drawer-close"
                onClick={closeMobileNavigation}
                ref={mobileCloseButton}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <label className="store-select">
              <span>Cửa hàng</span>
              <select value={data.settings.storeId} disabled>
                <option value={data.settings.storeId}>
                  {data.settings.storeName}
                </option>
              </select>
            </label>
            <AppNavigation
              page={page}
              hasStore={hasStore}
              importDraftCount={importDraftFiles.length}
              onSelect={(target) => {
                setPage(target);
                closeMobileNavigation();
              }}
            />
            <div className={cn("sync-status", !connectionLabel && "is-quiet")}>
              {connectionLabel ? (
                <>
                  <span
                    className={cn(
                      "sync-dot",
                      (refreshing || !connection) && "syncing",
                      connection?.service === "offline" && "offline",
                    )}
                  />
                  <strong>{connectionLabel}</strong>
                </>
              ) : null}
              <small>
                <CalendarClock aria-hidden="true" size={15} />
                Hôm nay · {data.today.split("-").reverse().join("/")}
              </small>
            </div>
          </aside>
        </div>
      ) : null}

      {toasts.length ? (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              tone={toast.tone}
              onClose={() =>
                setToasts((current) => current.filter((item) => item.id !== toast.id))
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import {
  BookOpen,
  CalendarClock,
  Coffee,
  Home,
  Package,
  Settings,
  ShoppingCart,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adaptBootstrap,
  adaptOrders,
  adaptPlan,
  emptyBackendPlan,
  strategyFromApi,
  strategyToApi,
} from "../lib/contract-adapters";
import {
  ShelfCashApiError,
  confirmPurchaseOrder,
  createForecastRun,
  createPlanRun,
  createPurchaseOrders,
  getBootstrap,
  getConnectionHealth,
  getForecastResult,
  getPlanResult,
  getPurchaseOrders,
  saveAliases as saveAliasesApi,
  saveCalendar,
  saveRecipe as saveRecipeApi,
  saveSettings,
  saveSupplierConstraint,
  waitForForecastResult,
  waitForPlanResult,
} from "../lib/shelfcash-client";
import { hasOperationalData } from "../lib/data";
import {
  findIngredientForRecipeLine,
  mergeRecipeIngredients,
  productIdentityKey,
  recipeLinesForProduct,
} from "../lib/recipes";
import type {
  Alias,
  BackendConnectionHealth,
  BootstrapData,
  CalendarDay,
  ImportLog,
  IngestionResult,
  InventoryItem,
  PlanResponse,
  Product,
  PurchaseOrder,
  RecipeLine,
  RecipeVersion,
  Settings as ShelfSettings,
  Strategy,
} from "../lib/types";
import { Toast, cn } from "./components/ui";
import { ImportView } from "./views/ImportView";
import { InventoryView } from "./views/InventoryView";
import { MenuView } from "./views/MenuView";
import { PlanView } from "./views/PlanView";
import { RecipesView } from "./views/RecipesView";
import { SettingsView } from "./views/SettingsView";
import { TodayView } from "./views/TodayView";

type PageKey =
  | "today"
  | "import"
  | "inventory"
  | "menu"
  | "recipes"
  | "plan"
  | "settings";

const navigation: Array<{
  key: PageKey;
  label: string;
  icon: typeof Home;
}> = [
  { key: "today", label: "Hôm nay", icon: Home },
  { key: "import", label: "Nhập dữ liệu", icon: Upload },
  { key: "inventory", label: "Kho", icon: Package },
  { key: "menu", label: "Menu", icon: Coffee },
  { key: "recipes", label: "Công thức", icon: BookOpen },
  { key: "plan", label: "Kế hoạch nhập", icon: ShoppingCart },
  { key: "settings", label: "Cài đặt", icon: Settings },
];

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ShelfCashApiError) {
    return `${caught.message}${caught.code ? ` (${caught.code})` : ""}`;
  }
  return caught instanceof Error ? caught.message : fallback;
}

function vietnamTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+07:00`;
}

async function loadBackendPlan(
  data: BootstrapData,
  requestedStrategy: Strategy,
  options: {
    forecastRunId?: string;
    planRunId?: string;
  } = {},
): Promise<{ plan: PlanResponse; strategy: Strategy }> {
  if (!hasOperationalData(data)) {
    return {
      plan: emptyBackendPlan(data, requestedStrategy),
      strategy: requestedStrategy,
    };
  }

  if (options.forecastRunId && options.planRunId) {
    try {
      const [forecastResult, planResult] = await Promise.all([
        getForecastResult(data.settings.storeId, options.forecastRunId),
        getPlanResult(data.settings.storeId, options.planRunId),
      ]);
      const loadedStrategy = strategyFromApi(planResult.strategy);
      return {
        plan: adaptPlan(data, loadedStrategy, forecastResult, planResult),
        strategy: loadedStrategy,
      };
    } catch {
      // A stale or unfinished latest run is replaced by a fresh run below.
    }
  }

  let forecastResult;
  if (options.forecastRunId) {
    try {
      forecastResult = await getForecastResult(
        data.settings.storeId,
        options.forecastRunId,
      );
    } catch {
      forecastResult = undefined;
    }
  }
  if (!forecastResult) {
    const forecastRun = await createForecastRun({
      storeId: data.settings.storeId,
      cutoffDate: data.today,
      horizonDays: data.settings.forecastHorizon,
    });
    forecastResult = await waitForForecastResult(
      data.settings.storeId,
      forecastRun.forecast_run_id,
    );
  }

  const planRun = await createPlanRun({
    storeId: data.settings.storeId,
    forecastRunId: forecastResult.forecast_run_id,
    strategy: strategyToApi(requestedStrategy),
    budgetLimit: data.settings.remainingBudget,
    asOfDate: data.today,
  });
  const planResult = await waitForPlanResult(
    data.settings.storeId,
    planRun.plan_run_id,
  );
  return {
    plan: adaptPlan(data, requestedStrategy, forecastResult, planResult),
    strategy: requestedStrategy,
  };
}

export function ShelfCashApp({
  initialData,
  initialPlan,
}: {
  initialData: BootstrapData;
  initialPlan: PlanResponse;
}) {
  const [page, setPage] = useState<PageKey>("today");
  const [data, setData] = useState(initialData);
  const [plan, setPlan] = useState(initialPlan);
  const [strategy, setStrategy] = useState<Strategy>("Cân bằng");
  const [planIngredient, setPlanIngredient] = useState("");
  const [draftOrders, setDraftOrders] = useState<PurchaseOrder[]>([]);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [recipeVersions, setRecipeVersions] = useState<RecipeVersion[]>([]);
  const [importDraftFiles, setImportDraftFiles] = useState<File[]>([]);
  const [connection, setConnection] =
    useState<BackendConnectionHealth | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const operationSequence = useRef(0);

  const reloadFromBackend = useCallback(
    async (
      baseData: BootstrapData,
      storeId: string,
      requestedStrategy: Strategy,
      freshPlan = false,
    ): Promise<boolean> => {
      const operation = ++operationSequence.current;
      setRefreshing(true);
      try {
        const bootstrap = await getBootstrap(storeId);
        const nextData = adaptBootstrap(baseData, bootstrap);
        if (operation !== operationSequence.current) return false;
        setData(nextData);
        setPlan(emptyBackendPlan(nextData, requestedStrategy));

        if (!hasOperationalData(nextData)) {
          setDraftOrders([]);
          setPlanIngredient("");
          return true;
        }

        const ordersPromise = getPurchaseOrders(storeId).catch(() => null);
        try {
          const loaded = await loadBackendPlan(
            nextData,
            requestedStrategy,
            freshPlan
              ? {}
              : {
                  forecastRunId: nextData.settings.latestForecastRunId,
                  planRunId: nextData.settings.latestPlanRunId,
                },
          );
          if (operation === operationSequence.current) {
            setStrategy(loaded.strategy);
            setPlan(loaded.plan);
            const ordersPayload = await ordersPromise;
            if (ordersPayload) {
              setDraftOrders(
                adaptOrders(ordersPayload, loaded.plan.recommendations),
              );
            }
          }
        } catch (caught) {
          if (operation === operationSequence.current) {
            setToast({
              message: errorMessage(
                caught,
                "Đã đọc dữ liệu nhưng chưa thể cập nhật forecast/kế hoạch.",
              ),
              tone: "error",
            });
          }
        }
        return true;
      } catch (caught) {
        if (operation === operationSequence.current) {
          setToast({
            message: errorMessage(
              caught,
              "Không thể đọc dữ liệu cửa hàng từ backend.",
            ),
            tone: "error",
          });
        }
        return false;
      } finally {
        if (operation === operationSequence.current) setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const health = await getConnectionHealth();
      if (!active) return;
      setConnection(health);
      if (health.service === "online") {
        await reloadFromBackend(
          initialData,
          initialData.settings.storeId,
          "Cân bằng",
        );
      }
    })();
    return () => {
      active = false;
      operationSequence.current += 1;
    };
  }, [initialData, reloadFromBackend]);

  async function refreshConnection() {
    setConnection(null);
    const health = await getConnectionHealth();
    setConnection(health);
    if (health.service === "online") {
      await reloadFromBackend(data, data.settings.storeId, strategy);
    }
  }

  async function recalculate(
    nextData: BootstrapData,
    nextStrategy = strategy,
  ) {
    const operation = ++operationSequence.current;
    setRefreshing(true);
    setPlan(emptyBackendPlan(nextData, nextStrategy));
    try {
      const loaded = await loadBackendPlan(nextData, nextStrategy, {
        forecastRunId: plan.forecastRunId,
      });
      if (operation === operationSequence.current) {
        setStrategy(loaded.strategy);
        setPlan(loaded.plan);
      }
    } catch (caught) {
      if (operation === operationSequence.current) {
        setToast({
          message: errorMessage(caught, "Không thể cập nhật kế hoạch."),
          tone: "error",
        });
      }
    } finally {
      if (operation === operationSequence.current) setRefreshing(false);
    }
  }

  function openPlan(ingredient?: string) {
    if (ingredient) setPlanIngredient(ingredient);
    setPage("plan");
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
    const log: ImportLog = {
      file: files.map((file) => file.name).join(", "),
      sheet: "Backend chuẩn hóa",
      dataType: "Dữ liệu vận hành",
      rows: rowCount,
      importedAt: new Date().toISOString(),
    };
    setImportLogs((current) => [...current, log]);
    const synchronized = await reloadFromBackend(
      data,
      result.store_id || data.settings.storeId,
      strategy,
      true,
    );
    setToast(
      synchronized
        ? {
            message: `Đã ghi và đồng bộ ${rowCount.toLocaleString("vi-VN")} bản ghi.`,
            tone: "success",
          }
        : {
            message:
              "Import đã hoàn tất nhưng frontend chưa đọc lại được bootstrap.",
            tone: "error",
          },
    );
  }

  async function saveRecipe(
    selectedProduct: Product,
    rows: RecipeLine[],
  ): Promise<boolean> {
    const product = data.products.find(
      (item) =>
        productIdentityKey(item) === productIdentityKey(selectedProduct),
    );
    const previous = recipeLinesForProduct(data.recipes, product);
    try {
      if (!product?.productId) {
        throw new Error(
          "Bootstrap chưa trả product_id nên chưa thể lưu recipe.",
        );
      }
      const ingredients = mergeRecipeIngredients(
        data.ingredients ?? [],
        data.inventory,
      );
      const apiLines = rows.map((row) => {
        const ingredient = findIngredientForRecipeLine(
          row,
          ingredients,
        );
        const ingredientId = row.ingredientId ?? ingredient?.ingredientId;
        if (!ingredientId) {
          throw new Error(
            `Bootstrap chưa trả ingredient_id cho ${row.ingredient}.`,
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
        effectiveFrom: data.today,
        version: product.recipeVersion ?? 1,
        lines: apiLines,
      });
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      if (!synchronized) return false;
      setRecipeVersions((current) => [
        ...current,
        {
          product: product.product,
          savedAt: new Date().toISOString(),
          effectiveUntil: data.today,
          rows: previous.map((line) => ({ ...line })),
        },
      ]);
      setToast({
        message: `Đã lưu version mới cho ${product.product}.`,
        tone: "success",
      });
      return true;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu công thức."),
        tone: "error",
      });
      return false;
    }
  }

  async function synchronizeMenu(message: string): Promise<void> {
    const operation = ++operationSequence.current;
    setRefreshing(true);
    try {
      const bootstrap = await getBootstrap(data.settings.storeId);
      if (operation !== operationSequence.current) return;
      const nextData = adaptBootstrap(data, bootstrap);
      setData(nextData);
      setPlan(emptyBackendPlan(nextData, strategy));
      setToast({ message, tone: "success" });
    } catch (caught) {
      if (operation === operationSequence.current) {
        setToast({
          message: `${message} Chưa thể đồng bộ lại bootstrap: ${errorMessage(
            caught,
            "lỗi kết nối",
          )}`,
          tone: "error",
        });
      }
    } finally {
      if (operation === operationSequence.current) setRefreshing(false);
    }
  }

  async function saveInventory(
    inventory: InventoryItem[],
  ): Promise<boolean> {
    try {
      await Promise.all(
        inventory.map((item) => {
          if (!item.ingredientId) {
            throw new Error(
              `Bootstrap chưa trả ingredient_id cho ${item.ingredient}.`,
            );
          }
          return saveSupplierConstraint({
            storeId: data.settings.storeId,
            constraintId: item.constraintId,
            payload: {
              ingredient_id: item.ingredientId,
              ...(item.supplierId
                ? { supplier_id: item.supplierId }
                : { supplier: item.supplier }),
              unit_cost: item.unitCost,
              moq: item.moq,
              pack_size: item.packSize,
              lead_time_days: item.leadTimeDays,
              safety_stock: item.safetyStock,
              capacity: item.capacity,
              unit: item.unit,
              ...(item.constraintVersion !== undefined
                ? { version: item.constraintVersion }
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
      if (synchronized) {
        setToast({
          message: "Đã lưu quy tắc nhập hàng.",
          tone: "success",
        });
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
          data.inventory.find(
            (item) => item.ingredient === alias.canonicalName,
          )?.ingredientId;
        return { ...alias, ingredientId };
      });
      await saveAliasesApi(data.settings.storeId, payload);
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
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
      await Promise.all([
        saveSettings(data.settings.storeId, {
          monthlyBudget: settings.monthlyBudget,
          forecastHorizon: settings.forecastHorizon,
        }),
        saveCalendar(data.settings.storeId, futureCalendar),
      ]);
      const synchronized = await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      if (synchronized) {
        setToast({
          message: "Đã lưu ngân sách và lịch.",
          tone: "success",
        });
      }
      return synchronized;
    } catch (caught) {
      setToast({
        message: errorMessage(caught, "Không thể lưu ngân sách và lịch."),
        tone: "error",
      });
      return false;
    }
  }

  async function createOrdersFromPlan(
    recommendations: typeof plan.recommendations,
  ): Promise<PurchaseOrder[]> {
    if (!plan.planRunId) {
      throw new Error("Chưa có plan_run_id từ backend.");
    }
    const active = recommendations.filter((item) => item.orderQty > 0);
    const lines = active.map((item) => {
      if (!item.recommendationId) {
        throw new Error(
          `Backend chưa trả recommendation_id cho ${item.ingredient}.`,
        );
      }
      return {
        recommendationId: item.recommendationId,
        orderQuantityOverride: item.orderQty,
      };
    });
    const response = await createPurchaseOrders({
      storeId: data.settings.storeId,
      planRunId: plan.planRunId,
      lines,
    });
    const orders = adaptOrders(response, recommendations);
    setDraftOrders((current) => {
      const incomingIds = new Set(orders.map((order) => order.poId));
      return [
        ...current.filter((order) => !incomingIds.has(order.poId)),
        ...orders,
      ];
    });
    setToast({
      message: `Đã tạo ${orders.length} đơn nháp từ backend.`,
      tone: "success",
    });
    return orders;
  }

  async function markOrdered(poId: string): Promise<void> {
    const order = draftOrders.find((item) => item.poId === poId);
    if (!order || order.status === "Đã đặt hàng") return;
    try {
      await confirmPurchaseOrder({
        storeId: data.settings.storeId,
        poId,
        version: order.version ?? 1,
        confirmedAt: vietnamTimestamp(),
      });
      await reloadFromBackend(
        data,
        data.settings.storeId,
        strategy,
        true,
      );
      setToast({
        message: `${poId} đã được backend xác nhận đã đặt.`,
        tone: "success",
      });
    } catch (caught) {
      const message = errorMessage(caught, "Không thể xác nhận đơn hàng.");
      setToast({ message, tone: "error" });
      throw new Error(message);
    }
  }

  const selectedPage = (() => {
    switch (page) {
      case "today":
        return (
          <TodayView
            data={data}
            plan={plan}
            onNavigate={(target) =>
              target === "plan" ? openPlan() : setPage("inventory")
            }
          />
        );
      case "import":
        return null;
      case "inventory":
        return (
          <InventoryView data={data} plan={plan} onOpenPlan={openPlan} />
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
            onSave={saveRecipe}
            onOpenPlan={() => openPlan()}
          />
        );
      case "plan":
        return (
          <PlanView
            data={data}
            plan={plan}
            strategy={strategy}
            initialIngredient={planIngredient}
            draftOrders={draftOrders}
            onStrategyChange={(nextStrategy) => {
              setStrategy(nextStrategy);
              void recalculate(data, nextStrategy);
            }}
            onCreateOrders={createOrdersFromPlan}
            onMarkOrdered={markOrdered}
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
          />
        );
    }
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <i>SC</i>
          <span>
            <strong>ShelfCash</strong>
            <small>Quản lý kho nhẹ nhàng</small>
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
        <span className="nav-label">Điều hướng</span>
        <nav>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={cn(page === item.key && "active")}
                onClick={() => setPage(item.key)}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.key === "import" && importDraftFiles.length ? (
                  <b className="nav-count">{importDraftFiles.length}</b>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sync-status">
          <span
            className={cn(
              "sync-dot",
              (refreshing || !connection) && "syncing",
              connection?.service === "offline" && "offline",
            )}
          />
          <strong>
            {refreshing
              ? "Đang cập nhật"
              : !connection
                ? "Đang kiểm tra"
                : connection.service === "online"
                  ? "Backend đã kết nối"
                  : "Backend chưa kết nối"}
          </strong>
          <small>
            <CalendarClock size={13} />
            Hôm nay · {data.today.split("-").reverse().join("/")}
          </small>
        </div>
      </aside>

      <main className="main-content">
        <section hidden={page !== "import"} aria-hidden={page !== "import"}>
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

      <nav className="mobile-nav" aria-label="Điều hướng di động">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-label={item.label}
              key={item.key}
              className={page === item.key ? "active" : ""}
              onClick={() => setPage(item.key)}
            >
              <Icon size={19} />
              <span>{item.key === "plan" ? "Kế hoạch" : item.label}</span>
              {item.key === "import" && importDraftFiles.length ? (
                <b className="mobile-nav-count">{importDraftFiles.length}</b>
              ) : null}
            </button>
          );
        })}
      </nav>

      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

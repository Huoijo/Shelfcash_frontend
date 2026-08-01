import { daysBetween, isWeekend, weekdayName } from "./data";
import { normalizeMenuItems } from "./menu";
import type {
  Alias,
  ApiRecord,
  ApiStrategy,
  BootstrapData,
  CalendarDay,
  EnrichedInventoryItem,
  ForecastPoint,
  ForecastResult,
  ForecastRunResultResponse,
  Ingredient,
  InventoryItem,
  InventoryStatus,
  PlanResponse,
  PlanRunResultResponse,
  Product,
  PurchaseOrder,
  Recommendation,
  RecipeLine,
  StoreBootstrapResponse,
  Strategy,
} from "./types";
import {
  mergeRecipeIngredients,
  normalizedEntityName,
  stableEntityName,
} from "./recipes";

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(
  record: ApiRecord,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function number(
  record: ApiRecord,
  keys: string[],
  fallback = 0,
): number {
  for (const key of keys) {
    const value = record[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value.replaceAll(",", ""))
          : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function boolean(
  record: ApiRecord,
  keys: string[],
  fallback = false,
): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "có"].includes(normalized)) return true;
      if (["false", "0", "no", "không"].includes(normalized)) return false;
    }
  }
  return fallback;
}

function normalized(value: string): string {
  return normalizedEntityName(value);
}

function scalar(
  record: ApiRecord,
  keys: string[],
): string | number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function optionalNumber(
  record: ApiRecord,
  keys: string[],
): number | undefined {
  const value = number(record, keys, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

function inventoryStatus(value: unknown): InventoryStatus | undefined {
  const status = String(value ?? "").trim().toLowerCase();
  if (
    ["stockout", "expiring", "low", "overstock", "missing", "normal"].includes(
      status,
    )
  ) {
    return status as InventoryStatus;
  }
  return undefined;
}

const statusPriority: Record<InventoryStatus, number> = {
  stockout: 6,
  expiring: 5,
  low: 4,
  overstock: 3,
  missing: 2,
  normal: 1,
};

const statusLabels: Record<InventoryStatus, string> = {
  stockout: "Hết hàng",
  expiring: "Sắp hết hạn",
  low: "Sắp hết",
  overstock: "Dư tồn kho",
  missing: "Thiếu dữ liệu",
  normal: "Bình thường",
};

export function strategyToApi(strategy: Strategy): ApiStrategy {
  if (strategy === "Tiết kiệm") return "economy";
  if (strategy === "An toàn") return "safe";
  return "balanced";
}

export function strategyFromApi(value: unknown): Strategy {
  if (value === "economy") return "Tiết kiệm";
  if (value === "safe") return "An toàn";
  return "Cân bằng";
}

function constraintFor(
  lot: ApiRecord,
  constraints: ApiRecord[],
): ApiRecord {
  const ingredientId = text(lot, ["ingredient_id"]);
  const ingredient = text(lot, ["ingredient", "ingredient_name"]);
  return (
    constraints.find(
      (item) =>
        (ingredientId &&
          text(item, ["ingredient_id"]) === ingredientId) ||
        (ingredient &&
          normalized(text(item, ["ingredient", "ingredient_name"])) ===
            normalized(ingredient)),
    ) ?? {}
  );
}

function normalizeInventory(
  response: StoreBootstrapResponse,
  today: string,
): InventoryItem[] {
  const constraints = records(response.supplier_constraints);
  const grouped = new Map<string, ApiRecord[]>();
  for (const lot of records(response.inventory)) {
    const ingredientId = text(lot, ["ingredient_id"]);
    const ingredient = text(lot, ["ingredient", "ingredient_name"]);
    if (!ingredientId && !ingredient) continue;
    const key = ingredientId || normalized(ingredient);
    grouped.set(key, [...(grouped.get(key) ?? []), lot]);
  }

  return Array.from(grouped.values()).map((lots, index) => {
    const first = lots[0] ?? {};
    const constraint = constraintFor(first, constraints);
    const ingredient = text(first, [
      "ingredient",
      "ingredient_name",
      "material",
    ]);
    const expiries = lots
      .map((lot) => text(lot, ["expiry_date"]))
      .filter(Boolean)
      .sort();
    const statuses = lots
      .map((lot) => inventoryStatus(lot.status))
      .filter((status): status is InventoryStatus => Boolean(status))
      .sort((left, right) => statusPriority[right] - statusPriority[left]);
    const latestCount = lots
      .map((lot) => text(lot, ["last_counted_at", "last_counted"]))
      .filter(Boolean)
      .sort()
      .at(-1);
    const onHand = lots.reduce(
      (sum, lot) => sum + number(lot, ["on_hand", "quantity"]),
      0,
    );
    const usableQuantity = lots.reduce(
      (sum, lot) =>
        sum + number(lot, ["usable_quantity"], number(lot, ["on_hand"])),
      0,
    );
    const expiringQty = lots.reduce(
      (sum, lot) => sum + number(lot, ["expiring_quantity"]),
      0,
    );

    return {
      lotId: text(first, ["lot_id"]) || undefined,
      ingredientId: text(first, ["ingredient_id"]) || undefined,
      supplierId:
        text(constraint, ["supplier_id"]) ||
        text(first, ["supplier_id"]) ||
        undefined,
      constraintId: text(constraint, ["constraint_id"]) || undefined,
      constraintVersion:
        optionalNumber(constraint, ["version"]) ?? undefined,
      ingredient,
      sku:
        text(first, ["sku"]) ||
        `NL-${String(index + 1).padStart(3, "0")}`,
      unit:
        text(first, ["unit", "uom"]) ||
        text(constraint, ["unit", "uom"], "đơn vị"),
      onHand: Number(onHand.toFixed(3)),
      usableQuantity: Number(usableQuantity.toFixed(3)),
      unitCost: number(
        constraint,
        ["unit_cost"],
        number(first, ["unit_cost"]),
      ),
      expiryDate: expiries[0] ?? today,
      expiringQty: Number(expiringQty.toFixed(3)),
      safetyStock: number(constraint, ["safety_stock"]),
      inbound: lots.reduce(
        (sum, lot) => sum + number(lot, ["inbound", "incoming"]),
        0,
      ),
      supplier:
        text(constraint, ["supplier", "supplier_name"]) ||
        text(first, ["supplier", "supplier_name"], "Chưa thiết lập"),
      leadTimeDays: number(constraint, ["lead_time_days"]),
      moq: number(constraint, ["moq"], 1),
      packSize: number(constraint, ["pack_size"], 1),
      capacity: number(constraint, ["capacity"], Math.max(onHand, 1)),
      lastCounted: latestCount ?? today,
      backendStatus: statuses[0] ?? "normal",
      daysSupply: optionalNumber(first, ["days_supply"]),
    };
  });
}

function recipeVersionKey(value: string | number | undefined): string {
  const version = String(value ?? "").trim().toLowerCase();
  const numeric = version.match(/^v?(\d+)$/);
  return numeric?.[1] ?? version;
}

function optionalRecipeVersion(record: ApiRecord): number | undefined {
  const value = scalar(record, ["recipe_version", "version"]);
  if (value === undefined) return undefined;
  const parsed = Number(recipeVersionKey(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function recipeLinesFrom(
  source: ApiRecord[],
  products: ApiRecord[],
): RecipeLine[] {
  const productNames = new Map<string, string>();
  for (const product of products) {
    const productId = text(product, ["product_id"]);
    if (productId) {
      productNames.set(
        productId,
        text(product, ["product", "product_name", "name"]),
      );
    }
  }
  const lines: RecipeLine[] = [];

  function appendRecipe(
    owner: ApiRecord,
    line: ApiRecord,
    productOwner?: ApiRecord,
  ) {
    const productId =
      (productOwner ? text(productOwner, ["product_id"]) : "") ||
      text(owner, ["product_id"]) ||
      text(line, ["product_id"]);
    const product =
      (productOwner
        ? text(productOwner, ["product", "product_name", "name"])
        : "") ||
      text(owner, ["product", "product_name", "name"]) ||
      text(line, ["product", "product_name"]) ||
      productNames.get(productId) ||
      "";
    const ingredient = text(line, [
      "ingredient_name",
      "ingredient",
      "material",
    ]);
    const quantity = number(line, [
      "ingredient_quantity",
      "quantity",
      "quantity_per_unit",
    ]);
    const unit = text(line, ["ingredient_unit", "unit", "uom"]);
    if ((!productId && !product) || !ingredient || quantity <= 0 || !unit) {
      return;
    }
    lines.push({
      productId: productId || undefined,
      ingredientId: text(line, ["ingredient_id"]) || undefined,
      product,
      ingredient,
      quantity,
      unit,
      recipeVersion:
        scalar(owner, ["recipe_version", "version"]) ??
        scalar(line, ["recipe_version", "version"]),
      effectiveDate:
        text(owner, ["effective_from", "effective_date"]) ||
        text(line, ["effective_from", "effective_date"]) ||
        undefined,
    });
  }

  function appendContainer(recipe: ApiRecord, productOwner?: ApiRecord) {
    const nestedComponents = records(recipe.components);
    const nestedLines = records(recipe.lines);
    const nested = nestedComponents.length
      ? nestedComponents
      : nestedLines;
    if (nested.length) {
      nested.forEach((line) => appendRecipe(recipe, line, productOwner));
    } else {
      appendRecipe(recipe, recipe, productOwner);
    }
  }

  for (const recipe of source) {
    appendContainer(recipe);
  }
  for (const product of products) {
    if (isRecord(product.active_recipe)) {
      appendContainer(product.active_recipe, product);
    }
  }

  const deduplicated = new Map<string, RecipeLine>();
  for (const line of lines) {
    const productKey = line.productId
      ? `id:${line.productId}`
      : `name:${stableEntityName(line.product)}`;
    const ingredientKey = line.ingredientId
      ? `id:${line.ingredientId}`
      : `name:${stableEntityName(line.ingredient)}`;
    const key = [
      productKey,
      ingredientKey,
      recipeVersionKey(line.recipeVersion),
      line.effectiveDate?.slice(0, 10) ?? "",
    ].join(":");
    let duplicateKey: string | undefined;
    for (const [existingKey, existing] of deduplicated) {
      const sameProduct =
        existing.productId && line.productId
          ? existing.productId === line.productId
          : stableEntityName(existing.product) ===
            stableEntityName(line.product);
      const sameIngredient =
        existing.ingredientId && line.ingredientId
          ? existing.ingredientId === line.ingredientId
          : stableEntityName(existing.ingredient) ===
            stableEntityName(line.ingredient);
      const sameRecipeLine =
        sameProduct &&
        sameIngredient &&
        recipeVersionKey(existing.recipeVersion) ===
          recipeVersionKey(line.recipeVersion) &&
        (existing.effectiveDate?.slice(0, 10) ?? "") ===
          (line.effectiveDate?.slice(0, 10) ?? "");
      if (sameRecipeLine) {
        duplicateKey = existingKey;
        break;
      }
    }
    if (duplicateKey) {
      const existing = deduplicated.get(duplicateKey);
      if (existing) {
        deduplicated.set(duplicateKey, {
          ...existing,
          productId: existing.productId ?? line.productId,
          ingredientId: existing.ingredientId ?? line.ingredientId,
        });
      }
    } else if (!deduplicated.has(key)) {
      deduplicated.set(key, line);
    }
  }
  return Array.from(deduplicated.values());
}

function rawRecipeMatchesProduct(
  recipe: ApiRecord,
  product: ApiRecord,
): boolean {
  const recipeProductId = text(recipe, ["product_id"]);
  const productId = text(product, ["product_id"]);
  if (recipeProductId && productId) return recipeProductId === productId;
  const recipeProduct = text(recipe, ["product", "product_name", "name"]);
  const productName = text(product, ["product", "product_name", "name"]);
  return (
    Boolean(recipeProduct && productName) &&
    normalized(recipeProduct) === normalized(productName)
  );
}

function firstScalar(
  rows: ApiRecord[],
  keys: string[],
): string | number | undefined {
  for (const row of rows) {
    const value = scalar(row, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstText(rows: ApiRecord[], keys: string[]): string {
  for (const row of rows) {
    const value = text(row, keys);
    if (value) return value;
  }
  return "";
}

function normalizeProducts(
  response: StoreBootstrapResponse,
  recipes: RecipeLine[],
  recipeRows: ApiRecord[],
): Product[] {
  const source = records(response.products).length
    ? records(response.products)
    : records(response.menu);
  return source.map((row, index) => {
    const productId = text(row, ["product_id"]);
    const product = text(row, ["product", "product_name", "name"]);
    const activeRecipe = isRecord(row.active_recipe) ? row.active_recipe : {};
    const matchingRecipeRows = recipeRows.filter((recipe) =>
      rawRecipeMatchesProduct(recipe, row),
    );
    const matchingRecipeLines = recipes.filter((line) => {
        if (productId && line.productId) return line.productId === productId;
        return (
          Boolean(product && line.product) &&
          normalized(line.product) === normalized(product)
        );
      });
    const hasRecipe = matchingRecipeLines.length > 0;
    const recipeVersionLabel =
      firstScalar(matchingRecipeRows, ["recipe_version", "version"]) ??
      matchingRecipeLines
        .map((line) => line.recipeVersion)
        .find((value) => value !== undefined) ??
      scalar(activeRecipe, ["recipe_version", "version"]);
    const effectiveDate =
      firstText(matchingRecipeRows, ["effective_from", "effective_date"]) ||
      matchingRecipeLines
        .map((line) => line.effectiveDate)
        .find((value): value is string => Boolean(value)) ||
      text(activeRecipe, ["effective_from", "effective_date"]);
    return {
      productId: productId || undefined,
      recipeVersionId:
        firstText(matchingRecipeRows, ["recipe_version_id"]) ||
        text(activeRecipe, ["recipe_version_id"]) ||
        undefined,
      recipeVersion:
        matchingRecipeRows
          .map((recipe) => optionalRecipeVersion(recipe))
          .find((value) => value !== undefined) ??
        optionalRecipeVersion(activeRecipe),
      recipeVersionLabel:
        recipeVersionLabel !== undefined
          ? String(recipeVersionLabel)
          : undefined,
      product,
      sku:
        text(row, ["sku"]) ||
        `SP-${String(index + 1).padStart(3, "0")}`,
      price: number(row, ["price", "unit_price"]),
      itemType:
        text(row, ["item_type"]).toLowerCase() === "combo"
          ? "combo"
          : "single",
      status:
        text(row, ["status"]).toLowerCase() === "inactive"
          ? "inactive"
          : "active",
      sellingUnit:
        text(row, ["selling_unit", "unit"]) || undefined,
      recipeStatus: hasRecipe ? "Hoàn chỉnh" : "Thiếu định lượng",
      effectiveDate: effectiveDate || undefined,
    };
  });
}

function normalizeIngredients(
  response: StoreBootstrapResponse,
): Ingredient[] {
  return records(response.ingredients)
    .map((row) => ({
      ingredientId: text(row, ["ingredient_id", "id"]) || undefined,
      ingredient: text(row, [
        "ingredient_name",
        "ingredient",
        "name",
        "material",
      ]),
      unit: text(row, ["ingredient_unit", "unit", "uom"]),
      sku: text(row, ["sku", "ingredient_sku"]) || undefined,
    }))
    .filter((ingredient) => Boolean(ingredient.ingredient));
}

function normalizeAliases(response: StoreBootstrapResponse): Alias[] {
  return records(response.aliases)
    .map((row) => ({
      ingredientId: text(row, ["ingredient_id"]) || undefined,
      sourceName: text(row, ["source_name", "alias"]),
      canonicalName: text(row, [
        "canonical_name",
        "ingredient",
        "ingredient_name",
      ]),
    }))
    .filter((row) => row.sourceName && row.canonicalName);
}

function normalizeCalendar(response: StoreBootstrapResponse): CalendarDay[] {
  return records(response.future_calendar)
    .map((row) => {
      const date = text(row, ["date"]);
      return {
        date,
        weekday: text(row, ["weekday"], weekdayName(date)),
        weekend: boolean(row, ["weekend", "is_weekend"], isWeekend(date)),
        holiday: boolean(row, ["holiday", "is_holiday"]),
        promotion: boolean(row, ["promotion", "is_promotion"]),
        promotionNote: text(row, [
          "promotion_note",
          "promotion_name",
          "note",
        ]),
      };
    })
    .filter((row) => Boolean(row.date));
}

export function adaptBootstrap(
  base: BootstrapData,
  response: StoreBootstrapResponse,
): BootstrapData {
  const safeResponse = (isRecord(response) ? response : {}) as
    StoreBootstrapResponse;
  const today = text(safeResponse, ["today"], base.today);
  const store = isRecord(safeResponse.store) ? safeResponse.store : {};
  const settings = isRecord(safeResponse.settings)
    ? safeResponse.settings
    : {};
  const latestRuns = isRecord(safeResponse.latest_runs)
    ? safeResponse.latest_runs
    : {};
  const menu = normalizeMenuItems(safeResponse.menu);
  const productRows = records(safeResponse.products).length
    ? records(safeResponse.products)
    : records(safeResponse.menu);
  const recipeRows = records(safeResponse.recipes);
  const recipes = recipeLinesFrom(recipeRows, productRows);
  const inventory = normalizeInventory(safeResponse, today);
  const ingredients = mergeRecipeIngredients(
    normalizeIngredients(safeResponse),
    inventory,
  );
  return {
    ...base,
    today,
    inventory,
    ingredients,
    products: normalizeProducts(safeResponse, recipes, recipeRows),
    menu,
    recipes,
    salesHistory: [],
    usageHistory: [],
    purchaseHistory: [],
    supplierConstraints: records(safeResponse.supplier_constraints).map(
      (row) => ({
        ingredient: text(row, ["ingredient", "ingredient_name"]),
        supplier: text(row, ["supplier", "supplier_name"]),
        unitCost: number(row, ["unit_cost"]),
        moq: number(row, ["moq"]),
        packSize: number(row, ["pack_size"]),
        leadTimeDays: number(row, ["lead_time_days"]),
      }),
    ),
    businessConstraints: Object.keys(settings).length ? [settings] : [],
    validationSummary: {},
    ingestionMetadata: { source: "bootstrap" },
    aliases: normalizeAliases(safeResponse),
    futureCalendar: normalizeCalendar(safeResponse),
    settings: {
      monthlyBudget: number(
        settings,
        ["monthly_budget"],
        base.settings.monthlyBudget,
      ),
      remainingBudget: number(
        settings,
        ["remaining_budget"],
        base.settings.remainingBudget,
      ),
      forecastHorizon: number(
        settings,
        ["forecast_horizon"],
        base.settings.forecastHorizon,
      ),
      storeId: text(store, ["store_id"], base.settings.storeId),
      storeName: text(store, ["store_name"], base.settings.storeName),
      timezone:
        text(store, ["timezone"], base.settings.timezone ?? "") || undefined,
      currency:
        text(store, ["currency"], base.settings.currency ?? "") || undefined,
      latestForecastRunId:
        text(latestRuns, ["forecast_run_id"]) || undefined,
      latestPlanRunId:
        text(latestRuns, ["plan_run_id"]) || undefined,
      dataFreshness: isRecord(safeResponse.data_freshness)
        ? safeResponse.data_freshness
        : {},
    },
  };
}

function forecastPoint(row: ApiRecord): ForecastPoint {
  return {
    date: text(row, ["date"]),
    actual: optionalNumber(row, ["actual", "quantity"]),
    p25: optionalNumber(row, ["p25"]),
    p50: optionalNumber(row, ["p50"]),
    p75: optionalNumber(row, ["p75"]),
    promotion: boolean(row, ["promotion"]),
    weekend: boolean(row, ["weekend"]),
  };
}

function confidence(value: unknown): ForecastResult["confidence"] {
  const normalizedValue = String(value ?? "").toLowerCase();
  if (["good", "high", "tốt"].includes(normalizedValue)) return "Tốt";
  if (["fair", "medium", "khá"].includes(normalizedValue)) return "Khá";
  return "Cần thêm dữ liệu";
}

export function adaptForecasts(
  response: ForecastRunResultResponse,
): Record<string, ForecastResult> {
  return Object.fromEntries(
    records(response.forecasts).map((row) => {
      const ingredient = text(row, ["ingredient", "ingredient_name"]);
      const totals = isRecord(row.totals) ? row.totals : {};
      const result: ForecastResult = {
        ingredientId: text(row, ["ingredient_id"]) || undefined,
        ingredient,
        unit: text(row, ["unit", "uom"], "đơn vị"),
        history: records(row.history).map(forecastPoint),
        forecast: records(row.forecast).map(forecastPoint),
        totals: {
          p25: number(totals, ["p25"]),
          p50: number(totals, ["p50"]),
          p75: number(totals, ["p75"]),
        },
        drivers: Array.isArray(row.drivers)
          ? row.drivers.map(String)
          : [],
        confidence: confidence(row.confidence),
        dataNotes: Array.isArray(row.data_notes)
          ? row.data_notes.map(String)
          : [],
      };
      return [ingredient, result];
    }),
  );
}

function reasonText(row: ApiRecord): {
  reason: string;
  reasonCodes: string[];
} {
  const codes = Array.isArray(row.reason_codes)
    ? row.reason_codes.map(String)
    : [];
  const labels: Record<string, string> = {
    BELOW_SAFETY_STOCK: "Tồn khả dụng thấp hơn mức tồn an toàn.",
    ROUNDED_TO_PACK_SIZE: "Đã làm tròn theo quy cách đóng gói.",
    ROUNDED_TO_MOQ: "Đã nâng lên mức đặt hàng tối thiểu.",
    EXPIRY_RISK: "Đã trừ lượng có nguy cơ hết hạn.",
    CAPACITY_WARNING: "Lượng sau nhập có thể vượt sức chứa.",
    INBOUND_COVERAGE: "Đã tính cả hàng đang về.",
  };
  return {
    reason:
      text(row, ["reason"]) ||
      codes.map((code) => labels[code] ?? code).join(" ") ||
      "Backend đã tính từ nhu cầu, tồn khả dụng và quy tắc nhà cung cấp.",
    reasonCodes: codes,
  };
}

function matchingInventory(
  row: ApiRecord,
  inventory: InventoryItem[],
): InventoryItem | undefined {
  const ingredientId = text(row, ["ingredient_id"]);
  const ingredient = text(row, ["ingredient", "ingredient_name"]);
  return inventory.find(
    (item) =>
      (ingredientId && item.ingredientId === ingredientId) ||
      normalized(item.ingredient) === normalized(ingredient),
  );
}

function normalizeRecommendations(
  data: BootstrapData,
  response: PlanRunResultResponse,
): Recommendation[] {
  return records(response.recommendations).map((row) => {
    const source = matchingInventory(row, data.inventory);
    const reason = reasonText(row);
    const statusKey =
      inventoryStatus(row.status) ?? source?.backendStatus ?? "missing";
    const orderQty = number(row, ["order_quantity", "order_qty"]);
    return {
      recommendationId:
        text(row, ["recommendation_id"]) || undefined,
      ingredientId:
        text(row, ["ingredient_id"]) || source?.ingredientId,
      supplierId: text(row, ["supplier_id"]) || source?.supplierId,
      ingredient:
        text(row, ["ingredient", "ingredient_name"]) ||
        source?.ingredient ||
        "",
      unit: text(row, ["unit", "uom"], source?.unit ?? "đơn vị"),
      status: text(row, ["status_label"], statusLabels[statusKey]),
      statusKey,
      onHand: number(row, ["on_hand"], source?.onHand ?? 0),
      usableStock: number(
        row,
        ["usable_stock", "usable_quantity"],
        source?.usableQuantity ?? source?.onHand ?? 0,
      ),
      forecastDemand: number(row, ["forecast_demand"]),
      safetyStock: number(
        row,
        ["safety_stock"],
        source?.safetyStock ?? 0,
      ),
      inbound: number(row, ["inbound"], source?.inbound ?? 0),
      recommendedQty: number(row, [
        "raw_recommended_quantity",
        "recommended_quantity",
      ]),
      orderQty,
      unitCost: number(row, ["unit_cost"], source?.unitCost ?? 0),
      cost: number(
        row,
        ["cost"],
        orderQty * number(row, ["unit_cost"], source?.unitCost ?? 0),
      ),
      supplier: text(
        row,
        ["supplier", "supplier_name"],
        source?.supplier ?? "Chưa thiết lập",
      ),
      moq: number(row, ["moq"], source?.moq ?? 0),
      packSize: number(row, ["pack_size"], source?.packSize ?? 1),
      leadTimeDays: number(
        row,
        ["lead_time_days"],
        source?.leadTimeDays ?? 0,
      ),
      expiryRiskQty: number(row, ["expiry_risk_quantity"]),
      capacityWarning: boolean(row, ["capacity_warning"]),
      reason: reason.reason,
      reasonCodes: reason.reasonCodes,
    };
  });
}

function enrichedInventory(
  data: BootstrapData,
  recommendations: Recommendation[],
): EnrichedInventoryItem[] {
  return data.inventory.map((item) => {
    const recommendation = recommendations.find(
      (row) =>
        (item.ingredientId &&
          row.ingredientId === item.ingredientId) ||
        normalized(row.ingredient) === normalized(item.ingredient),
    );
    const statusKey =
      recommendation?.statusKey ?? item.backendStatus ?? "missing";
    return {
      ...item,
      averageDailyUsage: 0,
      daysSupply: item.daysSupply ?? 999,
      expiryDays: daysBetween(data.today, item.expiryDate),
      countAgeDays: daysBetween(item.lastCounted.slice(0, 10), data.today),
      statusKey,
      status: recommendation?.status ?? statusLabels[statusKey],
      dataQuality: item.lastCounted
        ? `Kiểm kho gần nhất ${item.lastCounted.slice(0, 10)}`
        : "Backend chưa trả thời điểm kiểm kho.",
    };
  });
}

export function emptyBackendPlan(
  data: BootstrapData,
  strategy: Strategy,
): PlanResponse {
  return {
    strategy,
    enrichedInventory: enrichedInventory(data, []),
    recommendations: [],
    forecasts: {},
    warnings: [],
  };
}

export function adaptPlan(
  data: BootstrapData,
  strategy: Strategy,
  forecastResponse: ForecastRunResultResponse,
  planResponse: PlanRunResultResponse,
): PlanResponse {
  const recommendations = normalizeRecommendations(data, planResponse);
  const budget = isRecord(planResponse.budget) ? planResponse.budget : {};
  return {
    strategy,
    forecastRunId: forecastResponse.forecast_run_id,
    planRunId: planResponse.plan_run_id,
    enrichedInventory: enrichedInventory(data, recommendations),
    recommendations,
    forecasts: adaptForecasts(forecastResponse),
    budget: {
      limit: number(budget, ["limit"], data.settings.remainingBudget),
      plannedCost: number(budget, ["planned_cost"]),
      remainingAfterPlan: number(
        budget,
        ["remaining_after_plan"],
        data.settings.remainingBudget,
      ),
    },
    warnings: Array.isArray(planResponse.warnings)
      ? planResponse.warnings.map(String)
      : [],
  };
}

function orderLine(
  row: ApiRecord,
  recommendations: Recommendation[],
): Recommendation {
  const recommendationId = text(row, ["recommendation_id"]);
  const ingredient = text(row, ["ingredient", "ingredient_name"]);
  const source = recommendations.find(
    (item) =>
      (recommendationId &&
        item.recommendationId === recommendationId) ||
      normalized(item.ingredient) === normalized(ingredient),
  );
  const orderQty = number(row, [
    "order_quantity",
    "order_quantity_override",
    "quantity",
  ]);
  const unitCost = number(row, ["unit_cost"], source?.unitCost ?? 0);
  return {
    recommendationId: recommendationId || source?.recommendationId,
    ingredientId:
      text(row, ["ingredient_id"]) || source?.ingredientId,
    supplierId: text(row, ["supplier_id"]) || source?.supplierId,
    ingredient: ingredient || source?.ingredient || "Nguyên liệu",
    unit: text(row, ["unit", "uom"], source?.unit ?? "đơn vị"),
    status: source?.status ?? "Đã duyệt",
    statusKey: source?.statusKey ?? "normal",
    onHand: source?.onHand ?? 0,
    usableStock: source?.usableStock ?? 0,
    forecastDemand: source?.forecastDemand ?? 0,
    safetyStock: source?.safetyStock ?? 0,
    inbound: source?.inbound ?? 0,
    recommendedQty: source?.recommendedQty ?? orderQty,
    orderQty,
    unitCost,
    cost: number(row, ["cost"], orderQty * unitCost),
    supplier:
      text(row, ["supplier", "supplier_name"]) ||
      source?.supplier ||
      "",
    moq: number(row, ["moq"], source?.moq ?? 0),
    packSize: number(row, ["pack_size"], source?.packSize ?? 1),
    leadTimeDays: number(
      row,
      ["lead_time_days"],
      source?.leadTimeDays ?? 0,
    ),
    expiryRiskQty: source?.expiryRiskQty ?? 0,
    capacityWarning: source?.capacityWarning ?? false,
    reason: source?.reason ?? "Dòng đơn hàng do backend xác nhận.",
    reasonCodes: source?.reasonCodes,
  };
}

export function adaptOrders(
  value: unknown,
  recommendations: Recommendation[] = [],
): PurchaseOrder[] {
  const record = isRecord(value) ? value : {};
  const source = Array.isArray(value)
    ? records(value)
    : records(record.orders).length
      ? records(record.orders)
      : records(record.items);

  return source.map((row) => {
    const apiStrategy = text(row, ["strategy"]);
    return {
      poId: text(row, ["po_id", "id"]),
      supplierId: text(row, ["supplier_id"]) || undefined,
      supplier: text(row, ["supplier", "supplier_name"]),
      orderDate: text(row, ["order_date"]),
      deliveryDate: text(row, ["delivery_date"]),
      strategy: strategyFromApi(apiStrategy),
      lines: records(row.lines).map((line) =>
        orderLine(line, recommendations),
      ),
      total: number(row, ["total"]),
      budgetAfter: number(row, ["budget_after"]),
      status:
        text(row, ["status"]).toLowerCase() === "ordered"
          ? "Đã đặt hàng"
          : "Bản nháp",
      version: optionalNumber(row, ["version"]),
    };
  });
}

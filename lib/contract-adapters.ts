import { daysBetween, isWeekend, weekdayName } from "./data";
import { normalizeMenuItems } from "./menu";
import { toNumber, type ForecastRunResult as CanonicalForecastRunResult } from "./api-contract";
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
  IngredientDemandResult,
  InventoryItem,
  InventoryStatus,
  PlanResponse,
  PlanningScenario,
  PlanRunResultResponse,
  Product,
  PurchaseOrder,
  Recommendation,
  RecipeLine,
  StoreBootstrapResponse,
  Strategy,
  CoreStrategy,
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
    const parsed = toNumber(value, Number.NaN);
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
  if (["stockout", "expired", "expiring", "healthy", "missing"].includes(status)) {
    return status as InventoryStatus;
  }
  return undefined;
}

const statusPriority: Record<InventoryStatus, number> = {
  stockout: 5,
  expired: 4,
  expiring: 3,
  healthy: 1,
  missing: 2,
};

const statusLabels: Record<InventoryStatus, string> = {
  stockout: "Hết hàng",
  expired: "Đã hết hạn",
  expiring: "Sắp hết hạn",
  missing: "Thiếu dữ liệu",
  healthy: "Sử dụng được",
};

export function strategyToApi(strategy: Strategy): ApiStrategy {
  if (strategy === "Tiết kiệm") return "economy";
  if (strategy === "An toàn") return "safe";
  return "balanced";
}

export function strategyToCore(strategy: Strategy): CoreStrategy {
  if (strategy === "Tiết kiệm") return "lean";
  if (strategy === "An toàn") return "protected";
  return "balanced";
}

export function strategyFromCore(value: unknown): Strategy {
  if (value === "lean") return "Tiết kiệm";
  if (value === "protected") return "An toàn";
  return "Cân bằng";
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

  return Array.from(grouped.values()).map((lots) => {
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
    const expiredQty = lots.reduce(
      (sum, lot) => sum + number(lot, ["expired_quantity"]),
      0,
    );
    const normalizedLots = lots.map((lot) => ({
      lotId: text(lot, ["lot_id", "batch_code", "batch_id", "BATCH_CODE", "BATCH_ID"]),
      batchId:
        text(lot, [
          "batch_code",
          "batch_id",
          "BATCH_CODE",
          "BATCH_ID",
          "batchCode",
          "batchId",
          "lot_id",
          "LOT_ID",
        ]) || undefined,
      ingredientId: text(lot, ["ingredient_id"]) || undefined,
      supplierId: text(lot, ["supplier_id"]) || undefined,
      ingredient:
        text(lot, ["ingredient", "ingredient_name", "material"]) || ingredient,
      sku: text(lot, ["sku"]),
      unit: text(lot, ["unit", "uom"], "đơn vị"),
      onHand: number(lot, ["on_hand", "quantity"]),
      usableQuantity: number(lot, ["usable_quantity"]),
      expiringQuantity: number(lot, ["expiring_quantity"]),
      expiredQuantity: number(lot, ["expired_quantity"]),
      unitCost: number(lot, ["unit_cost"]),
      receivedDate: text(lot, ["received_date"]),
      expiryDate: text(lot, ["expiry_date"]),
      supplier: text(lot, ["supplier", "supplier_name"]),
      status: inventoryStatus(lot.status) ?? (text(lot, ["status"]) ? "missing" : "missing"),
      lastCounted: text(lot, ["last_counted_at", "last_counted"]),
      version: number(lot, ["version"]),
    }));

    return {
      lotId: text(first, ["lot_id", "batch_code", "batch_id", "BATCH_CODE", "BATCH_ID"]) || undefined,
      batchId:
        text(first, [
          "batch_code",
          "batch_id",
          "BATCH_CODE",
          "BATCH_ID",
          "batchCode",
          "batchId",
          "lot_id",
          "LOT_ID",
        ]) || undefined,
      ingredientId: text(first, ["ingredient_id"]) || undefined,
      supplierId:
        text(constraint, ["supplier_id"]) ||
        text(first, ["supplier_id"]) ||
        undefined,
      constraintId: text(constraint, ["constraint_id"]) || undefined,
      constraintVersion:
        optionalNumber(constraint, ["version"]) ?? undefined,
      ingredient,
      sku: text(first, ["sku"]),
      unit:
        text(first, ["unit", "uom"]) ||
        text(constraint, ["unit", "uom"], "đơn vị"),
      onHand: Number(onHand.toFixed(3)),
      usableQuantity: Number(usableQuantity.toFixed(3)),
      expiredQty: Number(expiredQty.toFixed(3)),
      receivedDate: text(first, ["received_date"]) || undefined,
      version: Math.max(...normalizedLots.map((lot) => lot.version), 0),
      lots: normalizedLots,
      unitCost: number(
        constraint,
        ["unit_cost"],
        number(first, ["unit_cost"]),
      ),
      expiryDate: expiries[0] ?? "",
      expiringQty: Number(expiringQty.toFixed(3)),
      safetyStock: null,
      inbound: lots.reduce(
        (sum, lot) => sum + number(lot, ["inbound", "incoming"]),
        0,
      ),
      supplier:
        text(constraint, ["supplier", "supplier_name"]) ||
        text(first, ["supplier", "supplier_name"], "Chưa thiết lập"),
      leadTimeDays: number(constraint, ["lead_time_days"]),
      moq: number(constraint, ["moq"]),
      packSize: number(constraint, ["pack_size"]),
      capacity: 0,
      lastCounted: latestCount ?? "",
      backendStatus: statuses[0] ?? "missing",
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

function itemTypeFrom(row: ApiRecord | undefined): Product["itemType"] {
  const value = text(row ?? {}, ["item_type", "ITEM_TYPE"]).toLowerCase();
  if (value === "combo") return "combo";
  if (value === "single") return "single";
  return undefined;
}

function menuRowForProduct(
  menuRows: ApiRecord[],
  product: ApiRecord,
): ApiRecord | undefined {
  const productId = text(product, ["product_id"]);
  if (productId) {
    return menuRows.find(
      (menuItem) => text(menuItem, ["product_id"]) === productId,
    );
  }
  const productName = text(product, ["product", "product_name", "name"]);
  return menuRows.find(
    (menuItem) =>
      Boolean(productName) &&
      normalized(text(menuItem, ["product", "product_name", "name"])) ===
      normalized(productName),
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
  const menuRows = records(response.menu);
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
    const itemType =
      itemTypeFrom(row) ?? itemTypeFrom(menuRowForProduct(menuRows, row));
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
      itemType,
      status:
        text(row, ["status"]).toLowerCase() === "inactive"
          ? "inactive"
          : "active",
      sellingUnit:
        text(row, ["selling_unit", "unit"]) || undefined,
      recipeStatus: hasRecipe ? "Hoàn chỉnh" : "Thiếu định lượng",
      effectiveDate: effectiveDate || undefined,
      recipeYieldQuantity: optionalNumber(activeRecipe, ["yield_quantity"]),
      recipeProcessLossRate: optionalNumber(activeRecipe, ["process_loss_rate"]),
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
  const settings = {
    ...(isRecord(safeResponse.budget) ? safeResponse.budget : {}),
    ...(isRecord(safeResponse.store_settings) ? safeResponse.store_settings : {}),
    ...(isRecord(safeResponse.settings) ? safeResponse.settings : {}),
  };
  const latestRuns = isRecord(safeResponse.latest_runs)
    ? safeResponse.latest_runs
    : {};
  const menu = normalizeMenuItems(safeResponse.menu);
  const productRows = records(safeResponse.products).length
    ? records(safeResponse.products)
    : records(safeResponse.menu);
  const recipeRows = records(safeResponse.recipes);
  const recipes = recipeLinesFrom(recipeRows, productRows);
  const safetyByIngredient = new Map(
    base.inventoryConstraints
      .filter((item) => item.ingredientId && item.constraintType === "safety_stock")
      .map((item) => [
        item.ingredientId,
        Number.isFinite(Number(item.value)) ? Number(item.value) : null,
      ]),
  );
  const inventory = normalizeInventory(safeResponse).map((item) => ({
    ...item,
    safetyStock:
      item.ingredientId && safetyByIngredient.has(item.ingredientId)
        ? safetyByIngredient.get(item.ingredientId) ?? null
        : null,
  }));
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
        constraintId: text(row, ["constraint_id"]) || undefined,
        storeId: text(row, ["store_id"]) || safeResponse.store.store_id,
        supplierId: text(row, ["supplier_id"]) || undefined,
        ingredientId: text(row, ["ingredient_id"]) || undefined,
        ingredient: text(row, ["ingredient", "ingredient_name"]),
        supplier: text(row, ["supplier", "supplier_name"]),
        unitCost: number(row, ["unit_cost"]),
        moq: number(row, ["moq"]),
        packSize: number(row, ["pack_size"]),
        leadTimeDays: number(row, ["lead_time_days"]),
        shelfLifeDays: optionalNumber(row, ["shelf_life_days", "shelf_life"]) ?? undefined,
        orderUnit: text(row, ["order_unit"]) || undefined,
        baseUnit: text(row, ["base_unit"]) || undefined,
        version: optionalNumber(row, ["version"]) ?? undefined,
        active: row.active !== false,
        effectiveDate: text(row, ["effective_date"]) || null,
        endDate: text(row, ["end_date"]) || null,
      }),
    ),
    inventoryConstraints: base.inventoryConstraints,
    businessConstraints: Object.keys(settings).length ? [settings] : [],
    validationSummary: {},
    ingestionMetadata: { source: "bootstrap" },
    aliases: normalizeAliases(safeResponse),
    futureCalendar: normalizeCalendar(safeResponse),
    settings: {
      monthlyBudget: number(
        settings,
        [
          "monthly_budget",
          "monthlyBudget",
          "budget",
          "monthly_budget_amount",
          "budget_limit",
          "limit",
          "budget_override",
        ],
        base.settings.monthlyBudget,
      ),
      reservedBudget: number(
        settings,
        ["reserved_budget", "reservedBudget"],
        base.settings.reservedBudget,
      ),
      spentBudget: number(
        settings,
        ["spent_budget", "spentBudget", "budget_spent", "spent"],
        base.settings.spentBudget,
      ),
      remainingBudget: number(
        settings,
        [
          "remaining_budget",
          "remainingBudget",
          "available_budget",
          "remaining_budget_amount",
          "remaining_after_plan",
        ],
        base.settings.remainingBudget,
      ),
      forecastHorizon: Math.min(
        7,
        Math.max(
          1,
          number(settings, ["forecast_horizon"], base.settings.forecastHorizon),
        ),
      ),
      defaultStrategy:
        text(settings, ["default_strategy"]) === "economy" ||
          text(settings, ["default_strategy"]) === "safe"
          ? (text(settings, ["default_strategy"]) as ApiStrategy)
          : "balanced",
      version: number(settings, ["version"], base.settings.version),
      safetyPolicy:
        text(settings, ["safety_policy"], base.settings.safetyPolicy ?? "") ||
        undefined,
      updatedAt:
        text(settings, ["updated_at"], base.settings.updatedAt ?? "") ||
        undefined,
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
  const point: ForecastPoint = {
    date: text(row, ["target_date", "date"]),
    actual: optionalNumber(row, ["actual", "quantity"]),
    p25: optionalNumber(row, ["p25"]),
    p50: optionalNumber(row, ["p50"]),
    p75: optionalNumber(row, ["p75"]),
    intervalLower: optionalNumber(row, ["interval_lower"]),
    intervalUpper: optionalNumber(row, ["interval_upper"]),
    baselineP50: optionalNumber(row, ["baseline_p50"]),
    calibrationSource: text(row, ["calibration_source"]) || undefined,
    warnings: warningMessages(row.warnings),
    promotion: boolean(row, ["promotion"]),
    weekend: boolean(row, ["weekend"]),
  };
  const quantiles = [point.p25, point.p50, point.p75];
  if (quantiles.every((value) => value != null)) {
    point.quantilesValid =
      quantiles[0]! <= quantiles[1]! && quantiles[1]! <= quantiles[2]!;
    if (!point.quantilesValid) {
      point.warnings = Array.from(
        new Set([...(point.warnings ?? []), "Dữ liệu dự báo không hợp lệ"]),
      );
    }
  }
  return point;
}

function warningMessages(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((warning) =>
        isRecord(warning)
          ? text(warning, ["message", "code"])
          : String(warning ?? ""),
      )
      .filter(Boolean)
    : [];
}

export function adaptForecasts(
  response: ForecastRunResultResponse | CanonicalForecastRunResult,
): Record<string, ForecastResult> {
  const responseRecord = response as unknown as ApiRecord;
  const source = records(response.predictions).length
    ? records(response.predictions)
    : records(responseRecord.forecasts);
  const grouped = new Map<string, ApiRecord[]>();
  for (const row of source) {
    const productId = text(row, ["product_id"]);
    const product = text(row, ["product_name", "product", "name"]);
    const key = productId || product;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Object.fromEntries(
    Array.from(grouped.values()).map((rows) => {
      const first = rows[0] ?? {};
      const product = text(first, ["product_name", "product", "name"]);
      const points = Array.from(
        new Map(
          rows
            .map(forecastPoint)
            .filter((point) => point.date)
            .map((point) => [point.date, point] as const),
        ).values(),
      ).sort((left, right) => left.date.localeCompare(right.date));
      const total = (key: "p25" | "p50" | "p75") =>
        points.reduce((sum, point) => sum + (point[key] ?? 0), 0);
      const warnings = Array.from(
        new Set([
          ...warningMessages(response.warnings),
          ...points.flatMap((point) => point.warnings ?? []),
        ]),
      );
      const result: ForecastResult = {
        productId: text(first, ["product_id"]) || undefined,
        product,
        ingredient: product,
        unit: text(first, ["unit", "uom"], "sản phẩm"),
        history: [],
        forecast: points,
        totals: {
          p25: total("p25"),
          p50: total("p50"),
          p75: total("p75"),
        },
        drivers: warnings,
        confidence: warnings.length ? "Khá" : "Tốt",
        dataNotes: [
          text(responseRecord, ["model_version"])
            ? `Model ${text(responseRecord, ["model_version"])}`
            : "Kết quả persisted từ Forecast Core.",
        ],
        invalidQuantileCount: points.filter((point) => point.quantilesValid === false).length,
      };
      return [product || result.productId || "", result];
    }),
  );
}

export function adaptIngredientDemand(
  value: unknown,
): Record<string, IngredientDemandResult> {
  const response = isRecord(value) ? value : {};
  const result = isRecord(response.result) ? response.result : response;
  const grouped = new Map<string, ApiRecord[]>();
  for (const row of records(result.predictions)) {
    const ingredientId = text(row, ["ingredient_id"]);
    const ingredient = text(row, ["ingredient_name", "ingredient", "name"]);
    const key = ingredientId || ingredient;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Object.fromEntries(
    Array.from(grouped.values()).map((rows) => {
      const first = rows[0] ?? {};
      const ingredientId = text(first, ["ingredient_id"]);
      const ingredient = text(first, ["ingredient_name", "ingredient", "name"]);
      const forecast = rows
        .map(forecastPoint)
        .filter((point) => point.date)
        .sort((left, right) => left.date.localeCompare(right.date));
      const contributionRows = rows.flatMap((row) => records(row.contributions));
      const resultRow: IngredientDemandResult = {
        ingredientId,
        ingredient,
        unit: text(first, ["unit", "uom"], "đơn vị"),
        forecast,
        totals: {
          p25: forecast.reduce((sum, point) => sum + (point.p25 ?? 0), 0),
          p50: forecast.reduce((sum, point) => sum + (point.p50 ?? 0), 0),
          p75: forecast.reduce((sum, point) => sum + (point.p75 ?? 0), 0),
        },
        contributions: contributionRows.map((row) => {
          const date =
            text(row, ["target_date", "date"]) ||
            text(first, ["target_date", "date"]);
          const forecastP25 = optionalNumber(row, ["forecast_p25"]);
          const forecastP50 = optionalNumber(row, ["forecast_p50"]);
          const forecastP75 = optionalNumber(row, ["forecast_p75"]);
          const recipeQuantity = optionalNumber(row, ["recipe_quantity"]);
          const recipeUnit = text(row, ["recipe_unit"]);
          const quantity = optionalNumber(row, ["quantity", "contribution_quantity"]);
          const unit = text(row, ["unit", "uom"]);
          return {
            productId: text(row, ["product_id"]) || undefined,
            product: text(row, ["product_name", "product", "name"]),
            ...(date ? { date } : {}),
            p25: number(row, ["p25", "contribution_p25", "demand_p25"]),
            p50: number(row, ["p50", "contribution_p50", "demand_p50", "quantity"]),
            p75: number(row, ["p75", "contribution_p75", "demand_p75"]),
            ...(forecastP25 != null ? { forecastP25 } : {}),
            ...(forecastP50 != null ? { forecastP50 } : {}),
            ...(forecastP75 != null ? { forecastP75 } : {}),
            ...(recipeQuantity != null ? { recipeQuantity } : {}),
            ...(recipeUnit ? { recipeUnit } : {}),
            ...(quantity != null ? { quantity } : {}),
            ...(unit ? { unit } : {}),
          };
        }),
        warnings: Array.from(
          new Set([
            ...warningMessages(result.warnings),
            ...rows.flatMap((row) => warningMessages(row.warnings)),
          ]),
        ),
      };
      return [ingredientId || ingredient, resultRow];
    }),
  );
}

function coreRecommendation(
  data: BootstrapData,
  demand: Record<string, IngredientDemandResult>,
  strategy: CoreStrategy,
  row: ApiRecord,
): Recommendation {
  const source = matchingInventory(row, data.inventory);
  const ingredientId = text(row, ["ingredient_id"]);
  const demandRow =
    demand[ingredientId] ??
    Object.values(demand).find(
      (item) =>
        normalized(item.ingredient) ===
        normalized(text(row, ["ingredient_name", "ingredient"])),
    );
  const quantile =
    strategy === "lean" ? "p25" : strategy === "protected" ? "p75" : "p50";
  const orderQty = number(row, ["order_quantity"]);
  const unitCost = number(row, ["unit_cost"]);
  const reasonCodes = Array.isArray(row.reason_codes)
    ? row.reason_codes.map(String)
    : [];
  const warnings = warningMessages(row.warnings);
  const statusKey = source?.backendStatus ?? "missing";
  const supplierId = text(row, ["supplier_id"]);
  return {
    ingredientId: ingredientId || source?.ingredientId,
    supplierId: supplierId || undefined,
    supplierTermId: text(row, ["supplier_term_id"]) || undefined,
    ingredient:
      text(row, ["ingredient_name", "ingredient"]) ||
      source?.ingredient ||
      ingredientId,
    unit: text(row, ["unit", "uom"], source?.unit ?? "đơn vị"),
    status: statusLabels[statusKey],
    statusKey,
    onHand: source?.onHand ?? 0,
    usableStock: source?.usableQuantity ?? source?.onHand ?? 0,
    forecastDemand: demandRow?.totals[quantile] ?? 0,
    safetyStock: 0,
    configuredSafetyStock: source?.safetyStock ?? null,
    inbound: source?.inbound ?? 0,
    recommendedQty: orderQty,
    orderQty,
    unitCost,
    cost: number(row, ["line_cost"], orderQty * unitCost),
    supplier: supplierId
      ? text(row, ["supplier_name", "supplier"], supplierId)
      : "Chưa có nhà cung cấp",
    moq: number(row, ["moq"]),
    packSize: number(row, ["pack_size"]),
    leadTimeDays: number(row, ["lead_time_days"]),
    expiryRiskQty: 0,
    capacityWarning: warnings.includes("STORAGE_CAPACITY_NOT_CONFIGURED"),
    reason: reasonCodes.join(", ") || "Kết quả mô phỏng từ Procurement Core.",
    reasonCodes,
    warnings,
    orderDate: text(row, ["order_date"]) || undefined,
    expectedArrivalDate:
      text(row, ["expected_arrival_date"]) || null,
    rawRequiredQuantity: number(row, ["raw_required_quantity"]),
    roundingExcess: number(row, ["rounding_excess"]),
    packCount: optionalNumber(row, ["pack_count"]) ?? null,
  };
}

export function adaptCorePlanning(
  data: BootstrapData,
  demand: Record<string, IngredientDemandResult>,
  value: unknown,
): PlanningScenario[] {
  const response = isRecord(value) ? value : {};
  const result = isRecord(response.result) ? response.result : response;
  return records(result.plans).map((row) => {
    const metrics = isRecord(row.metrics) ? row.metrics : {};
    const strategy = text(row, ["strategy"]) as CoreStrategy;
    const feasibility = text(row, ["feasibility", "status"]).toLowerCase();
    return {
      strategy,
      feasible:
        row.feasible === true ||
        row.is_feasible === true ||
        feasibility === "feasible",
      cost: number(row, ["cost", "total_cost"], number(metrics, ["cost", "total_cost"])),
      shortage: number(
        row,
        ["shortage", "total_shortage"],
        number(metrics, ["shortage", "total_shortage"]),
      ),
      waste: number(row, ["waste", "total_waste"], number(metrics, ["waste", "total_waste"])),
      fillRate: number(row, ["fill_rate"], number(metrics, ["fill_rate"])),
      metrics,
      warnings: warningMessages(row.warnings),
      violations: warningMessages(row.violations),
      recommendations: records(row.lines).map((line) =>
        coreRecommendation(data, demand, strategy, line),
      ),
    };
  });
}

export function adaptPlanningWorkflow(
  data: BootstrapData,
  strategy: Strategy,
  forecastValue: unknown,
  demandValue: unknown,
  planningValue: unknown,
): PlanResponse {
  const forecast = (isRecord(forecastValue) ? forecastValue : {}) as
    ForecastRunResultResponse;
  const demandResponse = isRecord(demandValue) ? demandValue : {};
  const demandResult = isRecord(demandResponse.result)
    ? demandResponse.result
    : demandResponse;
  const planningResponse = isRecord(planningValue) ? planningValue : {};
  const planningResult = isRecord(planningResponse.result)
    ? planningResponse.result
    : planningResponse;
  const ingredientDemand = adaptIngredientDemand(demandResult);
  const scenarios = adaptCorePlanning(data, ingredientDemand, planningResult);
  const selectedCore = strategyToCore(strategy);
  const selected = scenarios.find((scenario) => scenario.strategy === selectedCore);
  const status = text(planningResult, ["status"], "completed") as PlanResponse["status"];
  const warnings = Array.from(
    new Set([
      ...warningMessages(forecast.warnings),
      ...warningMessages(demandResult.warnings),
      ...warningMessages(planningResult.warnings),
      ...(selected?.warnings ?? []),
      ...(selected?.violations ?? []),
    ]),
  );
  return {
    strategy,
    status,
    engineStatus: text(forecast, ["engine_status"]) || undefined,
    failureCode:
      text(planningResult, ["failure_code"]) ||
      text(demandResult, ["failure_code"]) ||
      text(forecast, ["failure_code"]) ||
      null,
    failureMessage:
      text(planningResult, ["failure_message"]) ||
      text(demandResult, ["failure_message"]) ||
      text(forecast, ["failure_message"]) ||
      null,
    cutoffDate: text(forecast, ["cutoff_date"]) || undefined,
    horizonDays: optionalNumber(forecast, ["horizon_days"]),
    createdAt: text(planningResult, ["created_at"]) || undefined,
    completedAt: text(planningResult, ["completed_at"]) || undefined,
    enrichedInventory: enrichedInventory(data, selected?.recommendations ?? []),
    recommendations: selected?.recommendations ?? [],
    forecasts: adaptForecasts(forecast),
    ingredientDemand,
    scenarios,
    recommendedStrategy:
      (text(planningResult, ["recommended_strategy"]) as CoreStrategy) || null,
    forecastRunId: text(forecast, ["forecast_run_id"]) || undefined,
    ingredientDemandRunId:
      text(demandResult, ["ingredient_demand_run_id"]) || undefined,
    procurementPlanRunId:
      text(planningResult, ["procurement_plan_run_id"]) || undefined,
    budget: selected
      ? {
        limit: data.settings.remainingBudget,
        plannedCost: selected.cost,
        remainingAfterPlan: data.settings.remainingBudget - selected.cost,
      }
      : undefined,
    warnings,
  };
}

/** Selects one already-computed core scenario without creating another run. */
export function selectPlanningScenario(
  data: BootstrapData,
  plan: PlanResponse,
  strategy: Strategy,
): PlanResponse {
  const selected = plan.scenarios.find(
    (scenario) => scenario.strategy === strategyToCore(strategy),
  );
  if (!selected) return { ...plan, strategy };
  return {
    ...plan,
    strategy,
    recommendations: selected.recommendations,
    enrichedInventory: enrichedInventory(data, selected.recommendations),
    budget: {
      limit: data.settings.remainingBudget,
      plannedCost: selected.cost,
      remainingAfterPlan: data.settings.remainingBudget - selected.cost,
    },
  };
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
    const trace = isRecord(row.constraint_trace) ? row.constraint_trace : {};
    const configuredSafetyStock =
      optionalNumber(trace, ["configured_safety_stock"]) ??
      optionalNumber(row, ["configured_safety_stock", "safety_stock"]);
    const fallbackPolicy = text(trace, ["fallback_policy"]) || null;
    return {
      recommendationId:
        text(row, ["recommendation_id"]) || undefined,
      ingredientId:
        text(row, ["ingredient_id"]) || source?.ingredientId,
      supplierId: text(row, ["supplier_id"]) || undefined,
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
        ["effective_safety_stock", "safety_stock"],
        optionalNumber(trace, ["effective_safety_stock"]) ?? source?.safetyStock ?? 0,
      ),
      configuredSafetyStock: configuredSafetyStock ?? null,
      fallbackPolicy,
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
      supplier:
        text(row, ["supplier", "supplier_name"]) ||
        (text(row, ["supplier_id"]) ? text(row, ["supplier_id"]) : "Chưa có nhà cung cấp"),
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
      expiryDays: item.expiryDate
        ? daysBetween(data.today, item.expiryDate)
        : Number.NaN,
      countAgeDays: item.lastCounted
        ? daysBetween(item.lastCounted.slice(0, 10), data.today)
        : Number.NaN,
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
    status: "idle",
    enrichedInventory: enrichedInventory(data, []),
    recommendations: [],
    forecasts: {},
    ingredientDemand: {},
    scenarios: [],
    warnings: [],
  };
}

export function adaptPlan(
  data: BootstrapData,
  strategy: Strategy,
  forecastResponse: ForecastRunResultResponse | CanonicalForecastRunResult,
  planResponse: PlanRunResultResponse,
): PlanResponse {
  const recommendations = normalizeRecommendations(data, planResponse);
  const budget = isRecord(planResponse.budget) ? planResponse.budget : {};
  return {
    strategy,
    status: planResponse.status,
    forecastRunId: forecastResponse.forecast_run_id,
    planRunId: planResponse.plan_run_id,
    enrichedInventory: enrichedInventory(data, recommendations),
    recommendations,
    forecasts: adaptForecasts(forecastResponse),
    ingredientDemand: {},
    scenarios: [],
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
      ? planResponse.warnings.map((warning) => {
        const code = isRecord(warning) ? text(warning, ["code"]) : String(warning);
        if (code === "SAFETY_STOCK_NOT_CONFIGURED") return "Chưa cấu hình tồn kho an toàn cho nguyên liệu này.";
        if (code === "BUSINESS_CONSTRAINT_NOT_FOUND") return "Không tìm thấy cấu hình tồn kho phù hợp.";
        if (code === "BUSINESS_CONSTRAINT_AMBIGUOUS") return "Có nhiều cấu hình cùng hiệu lực.";
        if (code === "BUSINESS_CONSTRAINT_UNIT_INVALID" || code === "SAFETY_STOCK_UNIT_CONVERSION_FAILED") return "Đơn vị safety stock không thể quy đổi.";
        return isRecord(warning) ? text(warning, ["message"], code) : code;
      })
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
    poLineId: text(row, ["po_line_id", "line_id"]) || undefined,
    recommendationId: recommendationId || source?.recommendationId,
    ingredientId:
      text(row, ["ingredient_id"]) || source?.ingredientId,
    supplierId: text(row, ["supplier_id"]) || source?.supplierId,
    ingredient: ingredient || source?.ingredient || "Nguyên liệu",
    unit: text(row, ["unit", "uom"], source?.unit ?? "đơn vị"),
    status: source?.status ?? "Đã duyệt",
    statusKey: source?.statusKey ?? "missing",
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
    receivedQuantity: number(row, ["received_quantity", "quantity_received"]),
    remainingQuantity: number(
      row,
      ["remaining_quantity"],
      Math.max(0, orderQty - number(row, ["received_quantity", "quantity_received"])),
    ),
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
      deliveryDate: text(row, ["delivery_date", "expected_delivery_date"]),
      strategy: strategyFromApi(apiStrategy),
      lines: records(row.lines).map((line) =>
        orderLine(line, recommendations),
      ),
      total: number(row, ["total", "total_amount", "total_cost"]),
      budgetAfter: number(row, ["budget_after"]),
      status: (() => {
        const status = text(row, ["status"]).toLowerCase();
        return status === "ordered" ||
          status === "partially_received" ||
          status === "received"
          ? status
          : "draft";
      })(),
      version: optionalNumber(row, ["version"]),
      confirmedAt: text(row, ["confirmed_at"]) || undefined,
      receivedAt: text(row, ["received_at"]) || undefined,
      deliveryReference: text(row, ["delivery_reference"]) || undefined,
    };
  });
}

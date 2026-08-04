import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBootstrap,
  adaptOrders,
  adaptPlan,
  strategyToApi,
} from "../lib/contract-adapters.ts";
import {
  buildBootstrapData,
  buildEmptyBootstrapData,
  hasOperationalData,
} from "../lib/data.ts";
import {
  mergeRecipeIngredients,
  recipeIngredientIdentityKey,
  recipeLinesForProduct,
} from "../lib/recipes.ts";
import type {
  BootstrapData,
  ForecastRunResultResponse,
  PlanRunResultResponse,
  StoreBootstrapResponse,
} from "../lib/types.ts";
import { bootstrapRecipesComponentsFixture } from "./fixtures/bootstrap-recipes-components.ts";

const bootstrapResponse: StoreBootstrapResponse = {
  today: "2026-07-28",
  store: {
    store_id: "STORE_001",
    store_name: "Cửa hàng Quận 3",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
  },
  inventory: [
    {
      lot_id: "lot-1",
      ingredient_id: "ingredient-milk",
      ingredient: "Sữa tươi",
      sku: "NL-SUA-001",
      on_hand: 4,
      usable_quantity: 3,
      expiring_quantity: 1,
      unit: "lít",
      expiry_date: "2026-08-01",
      status: "expiring",
      last_counted_at: "2026-07-28T09:00:00+07:00",
    },
    {
      lot_id: "lot-2",
      ingredient_id: "ingredient-milk",
      ingredient: "Sữa tươi",
      sku: "NL-SUA-001",
      on_hand: 3,
      usable_quantity: 2,
      expiring_quantity: 1,
      unit: "lít",
      expiry_date: "2026-08-03",
      status: "normal",
      last_counted_at: "2026-07-28T09:00:00+07:00",
    },
  ],
  products: [
    {
      product_id: "product-smoothie",
      product: "Sinh tố chuối",
      sku: "SP-STC-001",
      price: 35000,
      active_recipe: {
        recipe_version_id: "recipe-v2",
        version: 2,
        effective_from: "2026-07-28",
        lines: [
          {
            ingredient_id: "ingredient-milk",
            ingredient: "Sữa tươi",
            quantity: 0.15,
            unit: "lít",
          },
        ],
      },
    },
  ],
  menu: [
    {
      product_id: "product-smoothie",
      sku: "MON-001",
      product: "Sinh tố chuối",
      item_type: "single",
      selling_unit: "ly",
      list_price: 35000,
      price: 35000,
      discount_rate: 0,
      savings_amount: 0,
      status: "active",
      currency: "VND",
      components: [],
      version: 1,
    },
  ],
  recipes: [],
  supplier_constraints: [
    {
      constraint_id: "constraint-1",
      ingredient_id: "ingredient-milk",
      supplier_id: "supplier-1",
      ingredient: "Sữa tươi",
      supplier: "ABC Food",
      unit_cost: 32000,
      moq: 12,
      pack_size: 12,
      lead_time_days: 2,
      unit: "lít",
      version: 2,
    },
  ],
  aliases: [
    {
      source_name: "SUA TUOI",
      canonical_name: "Sữa tươi",
      ingredient_id: "ingredient-milk",
    },
  ],
  future_calendar: [
    {
      date: "2026-07-29",
      weekend: false,
      holiday: false,
      promotion: true,
      promotion_note: "Combo -10%",
    },
  ],
  settings: {
    monthly_budget: 5_000_000,
    remaining_budget: 2_300_000,
    forecast_horizon: 7,
  },
  latest_runs: {
    forecast_run_id: "forecast-1",
    plan_run_id: "plan-1",
  },
  data_freshness: {
    inventory_updated_at: "2026-07-28T09:00:00+07:00",
  },
};

const forecastResponse: ForecastRunResultResponse = {
  forecast_run_id: "forecast-1",
  status: "completed",
  forecasts: [
    {
      ingredient_id: "ingredient-milk",
      ingredient: "Sữa tươi",
      unit: "lít",
      history: [{ date: "2026-07-28", actual: 6 }],
      forecast: [
        {
          date: "2026-07-29",
          p25: 5.1,
          p50: 6.4,
          p75: 7.8,
          promotion: true,
          weekend: false,
        },
      ],
      totals: { p25: 35.2, p50: 42.5, p75: 51.1 },
      drivers: ["Khuyến mãi"],
      confidence: "good",
      data_notes: [],
    },
  ],
};

const planResponse: PlanRunResultResponse = {
  plan_run_id: "plan-1",
  status: "completed",
  strategy: "balanced",
  budget: {
    limit: 2_300_000,
    planned_cost: 768_000,
    remaining_after_plan: 1_532_000,
  },
  recommendations: [
    {
      recommendation_id: "recommendation-1",
      ingredient_id: "ingredient-milk",
      ingredient: "Sữa tươi",
      unit: "lít",
      on_hand: 7,
      usable_stock: 5,
      forecast_demand: 18.4,
      safety_stock: 4,
      inbound: 0,
      raw_recommended_quantity: 17.4,
      order_quantity: 24,
      unit_cost: 32000,
      cost: 768000,
      supplier_id: "supplier-1",
      supplier: "ABC Food",
      moq: 12,
      pack_size: 12,
      lead_time_days: 2,
      expiry_risk_quantity: 2,
      capacity_warning: false,
      reason_codes: ["BELOW_SAFETY_STOCK", "ROUNDED_TO_PACK_SIZE"],
    },
  ],
  warnings: [],
};

test("initial bootstrap is empty until the backend returns operational data", () => {
  const data = buildEmptyBootstrapData();

  assert.equal(data.inventory.length, 0);
  assert.equal(data.products.length, 0);
  assert.equal(data.menu.length, 0);
  assert.equal(data.recipes.length, 0);
  assert.equal(data.aliases.length, 0);
  assert.equal(data.futureCalendar.length, 0);
  assert.equal(data.settings.monthlyBudget, 0);
  assert.equal(data.settings.remainingBudget, 0);
  assert.equal(data.settings.storeName, "Đang tải dữ liệu...");
  assert.equal(hasOperationalData(data), false);
  assert.equal(hasOperationalData(buildBootstrapData()), true);
});

test("bootstrap response becomes the UI model without losing backend IDs", () => {
  const data = adaptBootstrap(buildBootstrapData(), bootstrapResponse);
  assert.equal(data.inventory.length, 1);
  assert.equal(data.inventory[0]?.onHand, 7);
  assert.equal(data.inventory[0]?.usableQuantity, 5);
  assert.equal(data.inventory[0]?.ingredientId, "ingredient-milk");
  assert.equal(data.inventory[0]?.constraintId, "constraint-1");
  assert.equal(data.products[0]?.productId, "product-smoothie");
  assert.equal(data.products[0]?.recipeVersion, 2);
  assert.equal(data.menu[0]?.productId, "product-smoothie");
  assert.equal(data.menu[0]?.itemType, "single");
  assert.equal(data.recipes[0]?.ingredientId, "ingredient-milk");
  assert.equal(data.settings.latestPlanRunId, "plan-1");
});

test("bootstrap components normalize all 19 recipe lines and ingredient catalog", () => {
  const data = adaptBootstrap(
    buildEmptyBootstrapData(),
    bootstrapRecipesComponentsFixture,
  );
  const expectedCounts = new Map([
    ["PROD_001", 1],
    ["PROD_002", 2],
    ["PROD_003", 3],
    ["PROD_004", 4],
    ["PROD_005", 9],
  ]);

  assert.equal(data.recipes.length, 19);
  assert.equal(data.products.length, 5);
  for (const product of data.products) {
    const lines = recipeLinesForProduct(data.recipes, product);
    assert.equal(lines.length, expectedCounts.get(product.productId ?? ""));
    assert.ok(lines.length > 0);
    assert.ok(lines.every((line) => line.productId === product.productId));
    assert.ok(lines.every((line) => line.product === product.product));
  }

  const milk = data.recipes.find(
    (line) =>
      line.productId === "PROD_001" && line.ingredientId === "ING_001",
  );
  assert.equal(milk?.ingredient, "Sữa tươi");
  assert.equal(milk?.quantity, 0.12);
  assert.equal(typeof milk?.quantity, "number");
  assert.equal(milk?.unit, "lít");
  assert.equal(milk?.recipeVersion, "v1");
  assert.equal(milk?.effectiveDate, "2026-06-01");
  assert.ok(data.recipes.every((line) => Number.isFinite(line.quantity)));

  assert.equal(data.products[0]?.effectiveDate, "2026-06-01");
  assert.equal(data.products[0]?.recipeVersionLabel, "v1");
  assert.equal(data.products[2]?.effectiveDate, "2026-06-03");
  assert.equal(data.products[3]?.recipeVersionLabel, "4");
  assert.equal(data.inventory.length, 0);
  assert.equal(data.ingredients.length, 10);
  assert.equal(data.ingredients[0]?.ingredientId, "ING_001");
});

test("ingredient options prefer bootstrap ingredients and deduplicate safely", () => {
  const options = mergeRecipeIngredients(
    [
      {
        ingredientId: "ING_001",
        ingredient: "Sữa tươi",
        unit: "lít",
        sku: "MASTER-001",
      },
      {
        ingredientId: "ING_001",
        ingredient: "Tên trùng không được ưu tiên",
        unit: "ml",
      },
      { ingredient: "  Đường  ", unit: "kg" },
      { ingredient: "đường", unit: "g" },
      { ingredientId: "ING_A", ingredient: "Hương liệu", unit: "g" },
      { ingredientId: "ING_B", ingredient: "Hương liệu", unit: "g" },
    ],
    [
      {
        ingredientId: "ING_001",
        ingredient: "Tên từ tồn kho",
        sku: "INVENTORY-001",
        unit: "ml",
        onHand: 0,
        unitCost: 0,
        expiryDate: "2026-07-31",
        expiringQty: 0,
        safetyStock: 0,
        inbound: 0,
        supplier: "",
        leadTimeDays: 0,
        moq: 1,
        packSize: 1,
        capacity: 1,
        lastCounted: "2026-07-31",
      },
    ],
  );

  assert.equal(options.length, 4);
  assert.deepEqual(options[0], {
    ingredientId: "ING_001",
    ingredient: "Sữa tươi",
    unit: "lít",
    sku: "MASTER-001",
  });
  assert.equal(options[1]?.ingredient, "Đường");
  assert.equal(options[1]?.unit, "kg");
  assert.deepEqual(
    options.slice(2).map((item) => item.ingredientId),
    ["ING_A", "ING_B"],
  );
  assert.equal(
    recipeIngredientIdentityKey(
      { ingredient: "Sữa tươi" },
      options,
    ),
    recipeIngredientIdentityKey(
      { ingredientId: "ING_001", ingredient: "Sữa tươi" },
      options,
    ),
  );
});

test("components take priority while legacy lines and flat recipes still work", () => {
  const product = bootstrapRecipesComponentsFixture.products[0];
  const shared = {
    ...bootstrapRecipesComponentsFixture,
    products: product ? [product] : [],
  };
  const componentsFirst = adaptBootstrap(buildEmptyBootstrapData(), {
    ...shared,
    recipes: [
      {
        product_id: "PROD_001",
        components: [
          {
            ingredient_id: "ING_001",
            ingredient: "Sữa tươi",
            quantity: "0.12",
            unit: "lít",
          },
        ],
        lines: [
          {
            ingredient_id: "ING_002",
            ingredient: "Cà phê",
            quantity: 0.02,
            unit: "kg",
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    componentsFirst.recipes.map((line) => line.ingredientId),
    ["ING_001"],
  );

  const legacyLines = adaptBootstrap(buildEmptyBootstrapData(), {
    ...shared,
    recipes: [
      {
        product_id: "PROD_001",
        recipe_version: "legacy-lines",
        effective_date: "2026-05-01",
        components: [],
        lines: [
          {
            ingredient_id: "ING_002",
            ingredient_name: "Cà phê",
            quantity: "0.02",
            unit: "kg",
          },
        ],
      },
    ],
  });
  assert.equal(legacyLines.recipes.length, 1);
  assert.equal(legacyLines.recipes[0]?.ingredientId, "ING_002");
  assert.equal(legacyLines.recipes[0]?.quantity, 0.02);
  assert.equal(legacyLines.recipes[0]?.recipeVersion, "legacy-lines");
  assert.equal(legacyLines.recipes[0]?.effectiveDate, "2026-05-01");

  const flat = adaptBootstrap(buildEmptyBootstrapData(), {
    ...shared,
    recipes: [
      {
        product_id: "PROD_001",
        ingredient_id: "ING_003",
        ingredient_name: "Đường",
        ingredient_quantity: "0.015",
        ingredient_unit: "kg",
        version: 7,
        effective_from: "2026-05-02",
      },
    ],
  });
  assert.equal(flat.recipes.length, 1);
  assert.equal(flat.recipes[0]?.ingredientId, "ING_003");
  assert.equal(flat.recipes[0]?.quantity, 0.015);
  assert.equal(flat.recipes[0]?.recipeVersion, 7);
});

test("active_recipe remains supported and duplicate components are stable", () => {
  const product = bootstrapRecipesComponentsFixture.products[0];
  assert.ok(product);
  const component = {
    ingredient_id: "ING_001",
    ingredient: "Sữa tươi",
    quantity: "0.12",
    unit: "lít",
  };
  const duplicated = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [
      {
        ...product,
        active_recipe: {
          recipe_version: 1,
          effective_date: "2026-06-01T00:00:00+07:00",
          lines: [
            {
              ingredient: "Sữa tươi",
              quantity: "0.12",
              unit: "lít",
            },
          ],
        },
      },
    ],
    recipes: [
      {
        product_id: "PROD_001",
        recipe_version: "v1",
        effective_from: "2026-06-01",
        components: [component],
      },
    ],
  });
  assert.equal(duplicated.recipes.length, 1);
  assert.equal(duplicated.recipes[0]?.recipeVersion, "v1");

  const enrichedDuplicate = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [
      {
        ...product,
        active_recipe: {
          recipe_version: 1,
          effective_from: "2026-06-01",
          lines: [component],
        },
      },
    ],
    recipes: [
      {
        product_id: "PROD_001",
        recipe_version: "v1",
        effective_from: "2026-06-01",
        components: [
          {
            ingredient: "Sữa tươi",
            quantity: "0.12",
            unit: "lít",
          },
        ],
      },
    ],
  });
  assert.equal(enrichedDuplicate.recipes.length, 1);
  assert.equal(enrichedDuplicate.recipes[0]?.ingredientId, "ING_001");

  const activeComponents = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [
      {
        ...product,
        active_recipe: {
          recipe_version: "active-v2",
          effective_from: "2026-06-15",
          components: [component],
        },
      },
    ],
    recipes: [],
  });
  assert.equal(activeComponents.recipes.length, 1);
  assert.equal(activeComponents.recipes[0]?.recipeVersion, "active-v2");
  assert.equal(activeComponents.products[0]?.effectiveDate, "2026-06-15");

  const distinctVersions = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [
      {
        ...product,
        active_recipe: {
          recipe_version: "v2",
          effective_from: "2026-06-15",
          lines: [component],
        },
      },
    ],
    recipes: [
      {
        product_id: "PROD_001",
        recipe_version: "v1",
        effective_from: "2026-06-01",
        components: [component],
      },
    ],
  });
  assert.equal(distinctVersions.recipes.length, 2);

  const topLevelVersionWins = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [
      {
        ...product,
        active_recipe: {
          version: 4,
          effective_from: "2026-05-01",
          lines: [component],
        },
      },
    ],
    recipes: [
      {
        product_id: "PROD_001",
        version: 5,
        effective_from: "2026-06-01",
        components: [component],
      },
    ],
  });
  assert.equal(topLevelVersionWins.products[0]?.recipeVersion, 5);
  assert.equal(topLevelVersionWins.products[0]?.recipeVersionLabel, "5");
  assert.equal(topLevelVersionWins.products[0]?.effectiveDate, "2026-06-01");
});

test("product entity version is not presented as recipe metadata", () => {
  const product = bootstrapRecipesComponentsFixture.products[0];
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: product ? [{ ...product, version: 99 }] : [],
    recipes: [],
  });
  assert.equal(data.products[0]?.recipeVersion, undefined);
  assert.equal(data.products[0]?.recipeVersionLabel, undefined);
  assert.equal(data.products[0]?.effectiveDate, undefined);
});

test("product metadata can fall back to metadata on a nested component", () => {
  const product = bootstrapRecipesComponentsFixture.products[0];
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: product ? [product] : [],
    recipes: [
      {
        product_id: "PROD_001",
        components: [
          {
            ingredient_id: "ING_001",
            ingredient: "Sữa tươi",
            quantity: 0.12,
            unit: "lít",
            recipe_version: "child-v1",
            effective_date: "2026-04-01",
          },
        ],
      },
    ],
  });
  assert.equal(data.recipes[0]?.recipeVersion, "child-v1");
  assert.equal(data.products[0]?.recipeVersionLabel, "child-v1");
  assert.equal(data.products[0]?.effectiveDate, "2026-04-01");
});

test("missing and malformed recipe payloads render an empty safe model", () => {
  const product = bootstrapRecipesComponentsFixture.products[0];
  const missing = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: product ? [product] : [],
    recipes: undefined,
  });
  assert.equal(missing.recipes.length, 0);
  assert.equal(missing.products[0]?.recipeStatus, "Thiếu định lượng");
  assert.equal(missing.products[0]?.effectiveDate, undefined);
  assert.equal(missing.products[0]?.recipeVersionLabel, undefined);

  let malformedData: BootstrapData | undefined;
  assert.doesNotThrow(() => {
    malformedData = adaptBootstrap(buildEmptyBootstrapData(), {
      today: "2026-07-31",
      store: null,
      inventory: "invalid",
      ingredients: [null, "invalid"],
      products: [
        null,
        {
          product_id: "PROD_BAD",
          product: "Sản phẩm lỗi",
        },
        { product: "Legacy không ID 1" },
        { product: "Legacy không ID 2" },
      ],
      recipes: [
        null,
        {
          product_id: "PROD_BAD",
          recipe_version: { invalid: true },
          components: [
            null,
            {
              ingredient_id: "ING_BAD",
              ingredient: "Không hợp lệ",
              quantity: "not-a-number",
              unit: "kg",
            },
            {
              ingredient_id: "ING_OK",
              ingredient: "Hợp lệ",
              quantity: "0.2",
              unit: "kg",
            },
          ],
        },
        {
          ingredient_id: "ING_ORPHAN",
          ingredient: "Không có sản phẩm",
          quantity: 1,
          unit: "kg",
        },
      ],
      settings: null,
      latest_runs: null,
      supplier_constraints: null,
      aliases: null,
      future_calendar: null,
      data_freshness: null,
    } as unknown as StoreBootstrapResponse);
  });
  assert.ok(malformedData);
  assert.equal(malformedData.recipes.length, 1);
  assert.equal(malformedData.recipes[0]?.ingredientId, "ING_OK");
  assert.equal(malformedData.recipes[0]?.quantity, 0.2);
  assert.ok(Number.isFinite(malformedData.recipes[0]?.quantity));

  assert.doesNotThrow(() =>
    adaptBootstrap(
      buildEmptyBootstrapData(),
      null as unknown as StoreBootstrapResponse,
    ),
  );
});

test("forecast and plan keep run and recommendation IDs", () => {
  const data = adaptBootstrap(buildBootstrapData(), bootstrapResponse);
  const plan = adaptPlan(
    data,
    "Cân bằng",
    forecastResponse,
    planResponse,
  );
  assert.equal(plan.forecastRunId, "forecast-1");
  assert.equal(plan.planRunId, "plan-1");
  assert.equal(
    plan.recommendations[0]?.recommendationId,
    "recommendation-1",
  );
  assert.equal(plan.recommendations[0]?.orderQty, 24);
  assert.equal(plan.budget?.plannedCost, 768_000);
  assert.equal(plan.forecasts["Sữa tươi"]?.totals.p75, 51.1);
  assert.equal(strategyToApi("An toàn"), "safe");
});

test("purchase order trusts backend totals and versions", () => {
  const data = adaptBootstrap(buildBootstrapData(), bootstrapResponse);
  const plan = adaptPlan(
    data,
    "Cân bằng",
    forecastResponse,
    planResponse,
  );
  const orders = adaptOrders(
    {
      orders: [
        {
          po_id: "PO-20260728-001",
          supplier_id: "supplier-1",
          supplier: "ABC Food",
          order_date: "2026-07-28",
          delivery_date: "2026-07-30",
          strategy: "balanced",
          status: "draft",
          lines: [
            {
              recommendation_id: "recommendation-1",
              ingredient_id: "ingredient-milk",
              ingredient: "Sữa tươi",
              order_quantity: 24,
              unit: "lít",
              unit_cost: 32000,
              cost: 768000,
            },
          ],
          total: 768000,
          budget_after: 1532000,
          version: 1,
        },
      ],
    },
    plan.recommendations,
  );
  assert.equal(orders[0]?.total, 768000);
  assert.equal(orders[0]?.budgetAfter, 1532000);
  assert.equal(orders[0]?.version, 1);
  assert.equal(orders[0]?.lines[0]?.orderQty, 24);
});

test("planning trace preserves missing safety stock and maps its warning", () => {
  const data = adaptBootstrap(buildBootstrapData(), bootstrapResponse);
  const missing = adaptPlan(data, "Cân bằng", forecastResponse, {
    ...planResponse,
    recommendations: [{
      ...planResponse.recommendations[0],
      safety_stock: undefined,
      constraint_trace: {
        configured_safety_stock: null,
        effective_safety_stock: 0,
        fallback_policy: "ZERO_WITH_WARNING",
      },
    }],
    warnings: [{ code: "SAFETY_STOCK_NOT_CONFIGURED" }],
  });
  assert.equal(missing.recommendations[0]?.configuredSafetyStock, null);
  assert.equal(missing.recommendations[0]?.safetyStock, 0);
  assert.equal(missing.recommendations[0]?.fallbackPolicy, "ZERO_WITH_WARNING");
  assert.ok(missing.warnings?.[0]?.includes("Chưa cấu hình"));
});

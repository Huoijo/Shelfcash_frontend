import fs from "node:fs";
import path from "node:path";
import {
  buildMockBootstrapResponse,
  buildMockDecisionBrief,
  buildMockDecisionPackage,
  buildMockExplanation,
  buildMockMenuItemRecord,
  buildMockRecipeDetail,
  buildMockWhatIfResponse,
  getMockMenuProducts,
  MOCK_DECISION_RUN_ID,
  MOCK_FORECAST_RUN_ID,
  MOCK_INGREDIENTS,
  MOCK_STORE_ID,
  type MockProductDef,
} from "./mock-data";
import type { ExplanationRequest, StoreBootstrapResponse, WhatIfRequest } from "./types";

let memoryStateEmpty: boolean | null = null;

export function getMockStateEmpty(): boolean {
  if (memoryStateEmpty !== null) return memoryStateEmpty;
  try {
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      const stateFile = path.resolve(process.cwd(), ".mock-state.json");
      if (fs.existsSync(stateFile)) {
        const raw = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
        return Boolean(raw.isEmpty);
      }
    }
  } catch {}
  return false;
}

export function setMockStateEmpty(isEmpty: boolean): void {
  memoryStateEmpty = isEmpty;
  try {
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      const stateFile = path.resolve(process.cwd(), ".mock-state.json");
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ isEmpty, updatedAt: new Date().toISOString() }, null, 2)
      );
    }
  } catch {}
}

function buildEmptyMockBootstrap(today: string = "2026-08-20"): StoreBootstrapResponse {
  return {
    today,
    store: {
      store_id: MOCK_STORE_ID,
      store_name: "ShelfCash Store (Chưa có dữ liệu)",
      timezone: "Asia/Ho_Chi_Minh",
      currency: "VND",
    },
    inventory: [],
    products: [],
    menu: [],
    recipes: [],
    supplier_constraints: [],
    inventory_constraints: [],
    aliases: [],
    settings: {
      forecast_horizon: 7,
      default_strategy: "balanced",
      safety_stock_days: 2,
      store_id: MOCK_STORE_ID,
      store_name: "ShelfCash Store (Chưa có dữ liệu)",
      timezone: "Asia/Ho_Chi_Minh",
    },
    calendar_features: [],
    business_constraints: [],
    has_data: false,
  } as unknown as StoreBootstrapResponse;
}

/** Check if mock mode is activated via environment variable */
export function isMockModeActive(): boolean {
  const envVal =
    process.env.USE_MOCK_API ||
    process.env.SHELFCASH_USE_MOCK_API ||
    process.env.VITE_USE_MOCK_API ||
    process.env.NEXT_PUBLIC_USE_MOCK_API;

  if (typeof envVal === "string") {
    const val = envVal.trim().toLowerCase();
    if (val === "true" || val === "1" || val === "yes") return true;
    if (val === "false" || val === "0" || val === "no") return false;
  }

  // Default to mock mode if backend URL is not configured or set to dummy/example
  const backendUrl = process.env.SHELFCASH_BACKEND_URL?.trim();
  if (!backendUrl || backendUrl.includes("example.com") || backendUrl.includes("dummy")) {
    return true;
  }

  return false;
}

/** Simulate realistic artificial latency */
async function simulateLatency(minMs = 200, maxMs = 400): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Central Mock Router that returns contract-compliant Response objects */
export async function handleMockApiRequest(
  path: string,
  method: string,
  requestBodyText?: string
): Promise<Response> {
  await simulateLatency();

  const normalizedMethod = method.toUpperCase();
  const today = "2026-08-20";
  const memoryMenu = getMockMenuProducts();
  const isEmptyState = getMockStateEmpty();

  // 0. Mock state controls
  if (path === "/api/v1/mock/reset" || path === "/api/mock/reset") {
    setMockStateEmpty(true);
    return Response.json({ success: true, isEmpty: true, message: "Mock data reset to empty state." });
  }

  if (path === "/api/v1/mock/seed" || path === "/api/mock/seed") {
    setMockStateEmpty(false);
    return Response.json({ success: true, isEmpty: false, message: "Mock data seeded." });
  }

  if (path === "/api/v1/mock/state" || path === "/api/mock/state") {
    return Response.json({ success: true, isEmpty: isEmptyState });
  }

  // 1. Health check
  if (path === "/health" || path === "/api/v1/llm/health") {
    return Response.json({ status: "ok", provider: "mock-engine", timestamp: new Date().toISOString() });
  }

  // 2. Simulated 6-File Ingestion Pipeline
  if (path === "/api/v1/imports" && normalizedMethod === "POST") {
    const importId = `IMP_${Date.now()}`;
    const profiles = [
      {
        profile_id: "prof_sales_01",
        file_name: "Doanh_thu_Ban_hang.xlsx",
        sheet_name: "DoanhThu",
        sheet_type: "sales_history",
        detected_sheet_type: "sales_history",
        row_count: 1250,
        columns: ["Ngày", "Tên sản phẩm", "Số lượng bán", "Giá bán", "Doanh thu", "Hết hàng"],
        sample_rows: [
          { "Ngày": "2026-08-19", "Tên sản phẩm": "Cà phê sữa", "Số lượng bán": 45, "Giá bán": 25000, "Doanh thu": 1125000, "Hết hàng": 0 },
          { "Ngày": "2026-08-19", "Tên sản phẩm": "Bạc xỉu", "Số lượng bán": 30, "Giá bán": 30000, "Doanh thu": 900000, "Hết hàng": 0 },
          { "Ngày": "2026-08-19", "Tên sản phẩm": "Trà đào cam sả", "Số lượng bán": 28, "Giá bán": 35000, "Doanh thu": 980000, "Hết hàng": 0 },
        ],
        mapping: {
          "Ngày": "date",
          "Tên sản phẩm": "product_name",
          "Số lượng bán": "quantity_sold",
          "Giá bán": "selling_price",
          "Doanh thu": "revenue",
          "Hết hàng": "is_stockout",
        },
      },
      {
        profile_id: "prof_inventory_02",
        file_name: "Ton_kho_Lo_hang.xlsx",
        sheet_name: "TonKho",
        sheet_type: "inventory",
        detected_sheet_type: "inventory",
        row_count: 11,
        columns: ["Mã lô", "Tên nguyên liệu", "Tồn hiện tại", "Đơn vị", "Hạn sử dụng", "Tên kho"],
        sample_rows: [
          { "Mã lô": "LOT-20260815-CA", "Tên nguyên liệu": "Cam", "Tồn hiện tại": 3.28, "Đơn vị": "kg", "Hạn sử dụng": "2026-08-24", "Tên kho": "Kho mát" },
          { "Mã lô": "LOT-20260810-CH", "Tên nguyên liệu": "Chuối", "Tồn hiện tại": 8, "Đơn vị": "kg", "Hạn sử dụng": "2026-08-26", "Tên kho": "Kho mát" },
          { "Mã lô": "LOT-20260801-ST", "Tên nguyên liệu": "Sữa tươi", "Tồn hiện tại": 15, "Đơn vị": "L", "Hạn sử dụng": "2026-08-30", "Tên kho": "Kho lạnh A" },
        ],
        mapping: {
          "Mã lô": "batch_id",
          "Tên nguyên liệu": "ingredient_name",
          "Tồn hiện tại": "on_hand",
          "Đơn vị": "unit",
          "Hạn sử dụng": "expiry_date",
          "Tên kho": "warehouse_name",
        },
      },
      {
        profile_id: "prof_menu_03",
        file_name: "Menu_Mon_an.xlsx",
        sheet_name: "Menu",
        sheet_type: "menu",
        detected_sheet_type: "menu",
        row_count: 12,
        columns: ["Mã món", "Tên món", "Giá bán", "Đơn vị bán", "Loại món"],
        sample_rows: [
          { "Mã món": "SP-CFS", "Tên món": "Cà phê sữa", "Giá bán": 25000, "Đơn vị bán": "ly", "Loại món": "single" },
          { "Mã món": "SP-BX", "Tên món": "Bạc xỉu", "Giá bán": 30000, "Đơn vị bán": "ly", "Loại món": "single" },
          { "Mã món": "SP-CB-COMBO", "Tên món": "Combo Sáng", "Giá bán": 45000, "Đơn vị bán": "combo", "Loại món": "combo" },
        ],
        mapping: {
          "Mã món": "product_sku",
          "Tên món": "product_name",
          "Giá bán": "selling_price",
          "Đơn vị bán": "selling_unit",
          "Loại món": "item_type",
        },
      },
      {
        profile_id: "prof_recipes_04",
        file_name: "Dinh_luong_Cong_thuc.xlsx",
        sheet_name: "CongThuc",
        sheet_type: "recipes",
        detected_sheet_type: "recipes",
        row_count: 12,
        columns: ["Tên món", "Tên nguyên liệu", "Định lượng nguyên liệu", "Đơn vị nguyên liệu"],
        sample_rows: [
          { "Tên món": "Cà phê sữa", "Tên nguyên liệu": "Cà phê hạt", "Định lượng nguyên liệu": 0.025, "Đơn vị nguyên liệu": "kg" },
          { "Tên món": "Cà phê sữa", "Tên nguyên liệu": "Sữa đặc", "Định lượng nguyên liệu": 0.04, "Đơn vị nguyên liệu": "kg" },
          { "Tên món": "Trà đào cam sả", "Tên nguyên liệu": "Cam", "Định lượng nguyên liệu": 0.5, "Đơn vị nguyên liệu": "kg" },
        ],
        mapping: {
          "Tên món": "product_name",
          "Tên nguyên liệu": "ingredient_name",
          "Định lượng nguyên liệu": "ingredient_quantity",
          "Đơn vị nguyên liệu": "ingredient_unit",
        },
      },
      {
        profile_id: "prof_suppliers_05",
        file_name: "Nha_cung_cap_Dieu_kien.xlsx",
        sheet_name: "NhaCungCap",
        sheet_type: "supplier_constraints",
        detected_sheet_type: "supplier_constraints",
        row_count: 4,
        columns: ["Tên nhà cung cấp", "Tên nguyên liệu", "Thời gian giao (ngày)", "Số lượng đặt tối thiểu", "Đơn giá"],
        sample_rows: [
          { "Tên nhà cung cấp": "Nông sản Đà Lạt", "Tên nguyên liệu": "Cam", "Thời gian giao (ngày)": 2, "Số lượng đặt tối thiểu": 10, "Đơn giá": 27500 },
          { "Tên nhà cung cấp": "Vinamilk", "Tên nguyên liệu": "Sữa tươi", "Thời gian giao (ngày)": 1, "Số lượng đặt tối thiểu": 24, "Đơn giá": 34000 },
        ],
        mapping: {
          "Tên nhà cung cấp": "supplier_name",
          "Tên nguyên liệu": "ingredient_name",
          "Thời gian giao (ngày)": "lead_time_days",
          "Số lượng đặt tối thiểu": "minimum_order_quantity",
          "Đơn giá": "unit_price",
        },
      },
      {
        profile_id: "prof_calendar_06",
        file_name: "Lich_Su_kien_Ngay_le.xlsx",
        sheet_name: "LichSuKien",
        sheet_type: "calendar_features",
        detected_sheet_type: "calendar_features",
        row_count: 3,
        columns: ["Ngày", "Tên khuyến mãi", "Có khuyến mãi", "Ngày lễ"],
        sample_rows: [
          { "Ngày": "2026-09-02", "Tên khuyến mãi": "Quốc khánh 2/9", "Có khuyến mãi": 1, "Ngày lễ": 1 },
          { "Ngày": "2026-08-28", "Tên khuyến mãi": "Khuyến mãi cuối tuần", "Có khuyến mãi": 1, "Ngày lễ": 0 },
        ],
        mapping: {
          "Ngày": "date",
          "Tên khuyến mãi": "promotion_name",
          "Có khuyến mãi": "is_promotion",
          "Ngày lễ": "is_holiday",
        },
      },
    ];

    const suggested_mappings = Object.fromEntries(
      profiles.map((p) => [
        p.profile_id,
        {
          sheet_name: p.sheet_name,
          sheet_type: p.sheet_type,
          column_mapping: p.mapping,
          confidence: 1.0,
          source: "rule",
        },
      ]),
    );

    return Response.json({
      import_id: importId,
      status: "uploaded",
      source: "mock_excel_bundle",
      requires_review: false,
      profiles,
      suggested_mappings,
      warnings: [],
      errors: [],
    });
  }

  // Import Status
  const importStatusMatch = path.match(/^\/api\/v1\/imports\/([^/]+)$/);
  if (importStatusMatch && normalizedMethod === "GET") {
    const importId = importStatusMatch[1];
    return Response.json({
      import_id: importId,
      status: "confirmed",
      requires_review: false,
    });
  }

  // Confirm Import
  const importConfirmMatch = path.match(/^\/api\/v1\/imports\/([^/]+)\/confirm$/);
  if (importConfirmMatch && normalizedMethod === "POST") {
    const importId = importConfirmMatch[1];
    return Response.json({
      import_id: importId,
      status: "confirmed",
    });
  }

  // Process Import
  const importProcessMatch = path.match(/^\/api\/v1\/imports\/([^/]+)\/process$/);
  if (importProcessMatch && normalizedMethod === "POST") {
    const importId = importProcessMatch[1];
    // Populate store with full rich data upon ingestion!
    setMockStateEmpty(false);
    return Response.json({
      import_id: importId,
      status: "completed",
    });
  }

  // Import Result
  const importResultMatch = path.match(/^\/api\/v1\/imports\/([^/]+)\/result$/);
  if (importResultMatch && normalizedMethod === "GET") {
    const fullBoot = buildMockBootstrapResponse(today);
    return Response.json({
      store_id: MOCK_STORE_ID,
      forecast_date: today,
      forecast_horizon: 7,
      inventory: fullBoot.inventory,
      sales_history: Array.from({ length: 1250 }, (_, i) => ({ id: i })),
      usage_history: [],
      recipes: fullBoot.recipes,
      purchase_history: [],
      supplier_constraints: fullBoot.supplier_constraints,
      calendar_features: fullBoot.calendar_features,
      business_constraints: fullBoot.business_constraints,
      menu: fullBoot.menu,
      validation_summary: {
        total_rows: 1292,
        valid_rows: 1292,
        error_rows: 0,
      },
      ingestion_metadata: {
        processed_at: new Date().toISOString(),
        engine: "mock_excel_ingestion",
      },
    });
  }

  // 3. Store bootstrap
  if (/^\/api\/v1\/stores\/[^/]+\/bootstrap$/.test(path)) {
    if (isEmptyState) {
      return Response.json(buildEmptyMockBootstrap(today));
    }
    return Response.json(buildMockBootstrapResponse(today));
  }

  // 4. Menu Endpoints
  // GET /api/v1/stores/:store_id/menu
  if (/^\/api\/v1\/stores\/[^/]+\/menu$/.test(path) && normalizedMethod === "GET") {
    return Response.json({
      items: memoryMenu.map(buildMockMenuItemRecord),
    });
  }

  // GET /api/v1/stores/:store_id/products/:product_id/recipe
  const recipeMatch = path.match(/^\/api\/v1\/stores\/[^/]+\/products\/([^/]+)\/recipe$/);
  if (recipeMatch && normalizedMethod === "GET") {
    const productId = decodeURIComponent(recipeMatch[1]);
    const detail = buildMockRecipeDetail(productId);
    if (detail) return Response.json(detail);
    return Response.json({
      product_id: productId,
      lines: [],
      yield_quantity: 1,
      process_loss_rate: 0,
      version: 1,
      effective_from: today,
    });
  }

  // PUT /api/v1/stores/:store_id/products/:product_id/recipe
  if (recipeMatch && normalizedMethod === "PUT") {
    const productId = decodeURIComponent(recipeMatch[1]);
    const prod = memoryMenu.find((p) => p.productId === productId);
    let parsedBody: Record<string, unknown> = {};
    if (requestBodyText) {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch {}
    }
    if (prod) {
      prod.recipeVersion = (prod.recipeVersion || 1) + 1;
      if (typeof parsedBody.effective_from === "string") {
        prod.effectiveDate = parsedBody.effective_from;
      }
      if (typeof parsedBody.yield_quantity === "number") {
        prod.recipeYieldQuantity = parsedBody.yield_quantity;
      }
      if (typeof parsedBody.process_loss_rate === "number") {
        prod.recipeProcessLossRate = parsedBody.process_loss_rate;
      }
      if (Array.isArray(parsedBody.lines)) {
        prod.recipeLines = parsedBody.lines.map((l: any) => ({
          ingredientId: l.ingredient_id || l.ingredientId,
          ingredient: l.ingredient_name || l.ingredient || "Nguyên liệu",
          quantity: Number(l.quantity || l.ingredient_quantity || 0),
          unit: l.unit || l.ingredient_unit || "kg",
        }));
        prod.recipeStatus = prod.recipeLines.length > 0 ? "Hoàn chỉnh" : "Thiếu định lượng";
      }
    }
    return Response.json({
      product_id: productId,
      version: prod ? prod.recipeVersion : 2,
      effective_from: prod ? prod.effectiveDate : today,
      lines: prod ? prod.recipeLines : [],
    });
  }

  // GET /api/v1/stores/:store_id/products/:product_id/recipe-versions
  const recipeVersionsMatch = path.match(/^\/api\/v1\/stores\/[^/]+\/products\/([^/]+)\/recipe-versions$/);
  if (recipeVersionsMatch && normalizedMethod === "GET") {
    const productId = decodeURIComponent(recipeVersionsMatch[1]);
    const prod = memoryMenu.find((p) => p.productId === productId);
    return Response.json({
      versions: [
        {
          recipe_version_id: `rec-ver-${productId}-v${prod?.recipeVersion ?? 1}`,
          version: prod?.recipeVersion ?? 1,
          effective_from: prod?.effectiveDate ?? today,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
  }

  // PUT /api/v1/stores/:store_id/products/:product_id/components (Combo components replacement)
  const componentsMatch = path.match(/^\/api\/v1\/stores\/[^/]+\/products\/([^/]+)\/components$/);
  if (componentsMatch && normalizedMethod === "PUT") {
    const productId = decodeURIComponent(componentsMatch[1]);
    const prod = memoryMenu.find((p) => p.productId === productId);
    let parsedBody: Record<string, unknown> = {};
    if (requestBodyText) {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch {}
    }
    if (prod && Array.isArray(parsedBody.components)) {
      prod.components = parsedBody.components.map((c: any) => ({
        componentProductId: c.component_product_id || c.componentProductId,
        quantity: Number(c.quantity || 1),
      }));
      prod.recipeVersion = (prod.recipeVersion || 1) + 1;
    }
    return Response.json({
      product_id: productId,
      version: prod ? prod.recipeVersion : 2,
      components: prod?.components ?? [],
    });
  }

  // PATCH /api/v1/stores/:store_id/products/:product_id
  const productPatchMatch = path.match(/^\/api\/v1\/stores\/[^/]+\/products\/([^/]+)$/);
  if (productPatchMatch && normalizedMethod === "PATCH") {
    const productId = decodeURIComponent(productPatchMatch[1]);
    const prod = memoryMenu.find((p) => p.productId === productId);
    let parsedBody: Record<string, unknown> = {};
    if (requestBodyText) {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch {}
    }
    if (prod) {
      if (typeof parsedBody.product === "string") prod.product = parsedBody.product;
      if (typeof parsedBody.price === "number") prod.price = parsedBody.price;
      if (typeof parsedBody.status === "string" && (parsedBody.status === "active" || parsedBody.status === "inactive")) {
        prod.status = parsedBody.status;
      }
      if (typeof parsedBody.selling_unit === "string") prod.sellingUnit = parsedBody.selling_unit;
      prod.recipeVersion = (prod.recipeVersion || 1) + 1;
    }
    return Response.json({
      product_id: productId,
      version: prod ? prod.recipeVersion : 2,
      product: prod?.product,
      price: prod?.price,
      status: prod?.status,
    });
  }

  // POST /api/v1/stores/:store_id/products (Create menu product/combo)
  if (/^\/api\/v1\/stores\/[^/]+\/products$/.test(path) && normalizedMethod === "POST") {
    let parsedBody: Record<string, unknown> = {};
    if (requestBodyText) {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch {}
    }
    const newId = `PROD_${Date.now()}`;
    const newProd: MockProductDef = {
      productId: newId,
      sku: typeof parsedBody.sku === "string" ? parsedBody.sku : `SP-${Date.now().toString().slice(-4)}`,
      product: typeof parsedBody.product === "string" ? parsedBody.product : "Món mới",
      category: "Cà phê",
      price: typeof parsedBody.price === "number" ? parsedBody.price : 30_000,
      itemType: parsedBody.item_type === "combo" ? "combo" : "single",
      sellingUnit: typeof parsedBody.selling_unit === "string" ? parsedBody.selling_unit : "ly",
      status: parsedBody.status === "inactive" ? "inactive" : "active",
      recipeStatus: "Thiếu định lượng",
      recipeVersion: 1,
      effectiveDate: today,
      recipeYieldQuantity: 1,
      recipeProcessLossRate: 0,
      recipeLines: [],
      components: Array.isArray(parsedBody.components)
        ? parsedBody.components.map((c: any) => ({
            componentProductId: c.component_product_id,
            quantity: Number(c.quantity || 1),
          }))
        : undefined,
    };
    memoryMenu.push(newProd);
    return Response.json({
      product_id: newId,
      version: 1,
      ...parsedBody,
    });
  }

  // 4. Decision Runs
  if (/^\/api\/v1\/stores\/[^/]+\/decision-runs$/.test(path) && normalizedMethod === "POST") {
    return Response.json({
      decision_run_id: MOCK_DECISION_RUN_ID,
      status: "completed",
      created_at: new Date().toISOString(),
    });
  }

  if (/^\/api\/v1\/decision-runs\/[^/]+\/brief$/.test(path)) {
    return Response.json(buildMockDecisionBrief(today));
  }

  if (/^\/api\/v1\/decision-runs\/[^/]+$/.test(path)) {
    return Response.json(buildMockDecisionPackage(today));
  }

  if (/^\/api\/v1\/decision-runs\/[^/]+\/explanation$/.test(path)) {
    let req: ExplanationRequest = {};
    if (requestBodyText) {
      try {
        req = JSON.parse(requestBodyText);
      } catch {}
    }
    return Response.json(buildMockExplanation(req));
  }

  if (/^\/api\/v1\/decision-runs\/[^/]+\/what-if$/.test(path)) {
    let req: WhatIfRequest = {};
    if (requestBodyText) {
      try {
        req = JSON.parse(requestBodyText);
      } catch {}
    }
    return Response.json(buildMockWhatIfResponse(req, today));
  }

  // 5. Forecast Runs
  if (/^\/api\/v1\/stores\/[^/]+\/forecast-runs$/.test(path) && normalizedMethod === "POST") {
    return Response.json({
      forecast_run_id: MOCK_FORECAST_RUN_ID,
      status: "completed",
      created_at: new Date().toISOString(),
    });
  }

  if (/^\/api\/v1\/stores\/[^/]+\/forecast-runs\/[^/]+$/.test(path)) {
    return Response.json({
      forecast_run_id: MOCK_FORECAST_RUN_ID,
      status: "completed",
      horizon_days: 7,
      cutoff_date: today,
    });
  }

  if (/^\/api\/v1\/stores\/[^/]+\/forecast-runs\/[^/]+\/result$/.test(path)) {
    return Response.json({
      forecast_run_id: MOCK_FORECAST_RUN_ID,
      status: "completed",
      products: MOCK_INGREDIENTS.map((i) => ({
        product_id: i.id,
        product: i.name,
        unit: i.unit,
        forecast: i.dailyForecast.map((d) => ({
          date: `2026-08-${d.date.slice(0, 2)}`,
          p25: d.p25,
          p50: d.p50,
          p75: d.p75,
        })),
      })),
    });
  }

  // 6. Inventory & Settings
  if (/^\/api\/v1\/stores\/[^/]+\/inventory$/.test(path)) {
    if (isEmptyState) return Response.json([]);
    return Response.json(buildMockBootstrapResponse(today).inventory);
  }

  if (/^\/api\/v1\/stores\/[^/]+\/settings$/.test(path)) {
    return Response.json(buildMockBootstrapResponse(today).settings);
  }

  if (/^\/api\/v1\/stores\/[^/]+\/purchase-orders$/.test(path)) {
    return Response.json([]);
  }

  return Response.json({ success: true, mock: true, path });
}

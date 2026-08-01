import assert from "node:assert/strict";
import test from "node:test";
import { addDays, buildBootstrapData } from "../lib/data.ts";
import {
  buildEditableMappings,
  changeSheetMappingType,
  ignoreField,
  mergeIngestionResult,
  resultCounts,
  toConfirmMappings,
  validateImportMappings,
  validateSheetMapping,
} from "../lib/ingestion.ts";
import {
  CANONICAL_SCHEMAS,
  SHEET_TYPES,
  normalizeSheetType,
} from "../lib/canonical-schemas.ts";
import { forecastIngredient } from "../lib/logic.ts";
import type {
  EditableSheetMapping,
  ImportCreateResponse,
  IngestionResult,
} from "../lib/types.ts";

function mixedUnknownAndSalesMappings(): EditableSheetMapping[] {
  return buildEditableMappings({
    import_id: "import-mixed",
    profiles: [
      {
        profile_id: "profile-readme",
        file_name: "sales.xlsx",
        sheet_name: "README",
        columns: ["Hướng dẫn", "Ghi chú"],
        row_count: 4,
      },
      {
        profile_id: "profile-sales",
        file_name: "sales.xlsx",
        sheet_name: "POS_T7_2026",
        columns: [
          "Ngày",
          "Món",
          "Số lượng",
          "Đơn vị",
          "Giá bán",
          "Doanh thu",
          "Hết hàng",
          "Khuyến mãi",
        ],
        row_count: 120,
      },
    ],
    suggested_mappings: [
      {
        profile_id: "profile-readme",
        sheet_type: "Chưa xác định",
        column_mapping: {
          "Hướng dẫn": null,
          "Ghi chú": null,
        },
      },
      {
        profile_id: "profile-sales",
        sheet_type: "sales_history",
        column_mapping: {
          "Ngày": "date",
          "Món": "product_name",
          "Số lượng": "quantity_sold",
          "Đơn vị": "unit",
          "Giá bán": "selling_price",
          "Doanh thu": "revenue",
          "Hết hàng": "is_stockout",
          "Khuyến mãi": "promotion_name",
        },
      },
    ],
  });
}

test("Qwen suggestions use the exact canonical schema and unresolved columns block confirmation", () => {
  const response: ImportCreateResponse = {
    import_id: "4f7c6c47-0a4b-47c3-88f3-76fdceaf1227",
    profiles: [
      {
        profile_id: "profile-1",
        file_name: "inventory.xlsx",
        sheet_name: "Kho",
        columns: ["Tên nguyên liệu", "Tồn kho", "Ghi chú"],
        row_count: 3,
        sample_rows: [
          {
            "Tên nguyên liệu": "Sữa tươi",
            "Tồn kho": 7,
            "Ghi chú": "kiểm sáng",
          },
        ],
      },
    ],
    suggested_mappings: [
      {
        profile_id: "profile-1",
        sheet_name: "Kho",
        sheet_type: "inventory",
        source: "llm",
        confidence: 0.94,
        column_mapping: {
          "Tên nguyên liệu": "ingredient_name",
          "Tồn kho": "on_hand",
          "Ghi chú": null,
        },
      },
    ],
    source: "llm",
    warnings: [],
    errors: [],
    requires_review: true,
  };

  const mappings = buildEditableMappings(response);
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0]?.sheetType, "inventory");
  assert.equal(mappings[0]?.mapping["Tồn kho"], "on_hand");
  assert.deepEqual(
    mappings[0]?.targetFields,
    CANONICAL_SCHEMAS.inventory.fields,
  );
  assert.equal(mappings[0]?.mapping["Ghi chú"], ignoreField);

  const blocked = validateImportMappings(mappings);
  assert.equal(blocked.complete, false);
  assert.equal(blocked.unresolvedColumns, 1);
  assert.throws(() => toConfirmMappings(mappings), /mọi cột/i);

  const completed = mappings.map((mapping) => ({
    ...mapping,
    mapping: {
      ...mapping.mapping,
      "Ghi chú": "warehouse_name",
    },
  }));
  assert.equal(validateImportMappings(completed).complete, true);

  const payload = toConfirmMappings(completed);
  const columnMapping = payload[0]?.column_mapping as Record<string, string>;
  assert.equal(columnMapping["Ghi chú"], "warehouse_name");
  assert.equal(payload[0]?.profile_id, "profile-1");
});

test("mapping requires a known sheet type, all core fields, and unique targets", () => {
  const response: ImportCreateResponse = {
    import_id: "import-unknown",
    profiles: [
      {
        profile_id: "profile-unknown",
        sheet_name: "Sheet1",
        columns: ["Vendor", "Material", "MOQ"],
        row_count: 2,
      },
    ],
    suggested_mappings: [
      {
        profile_id: "profile-unknown",
        sheet_type: "other",
        column_mapping: {},
      },
    ],
  };

  const [unknown] = buildEditableMappings(response);
  assert.ok(unknown);
  assert.equal(validateSheetMapping(unknown).unknownSheetType, true);

  const supplier = changeSheetMappingType(unknown, "supplier_constraints");
  const missingCore = {
    ...supplier,
    mapping: {
      Vendor: "supplier_name",
      Material: "supplier_name",
      MOQ: "minimum_order_quantity",
    },
  };
  const duplicateValidation = validateSheetMapping(missingCore);
  assert.deepEqual(duplicateValidation.duplicateFields, ["supplier_name"]);
  assert.deepEqual(duplicateValidation.missingCoreFields, ["ingredient_name"]);
  assert.equal(duplicateValidation.complete, false);

  const complete = {
    ...supplier,
    mapping: {
      Vendor: "supplier_name",
      Material: "ingredient_name",
      MOQ: "minimum_order_quantity",
    },
  };
  assert.equal(validateSheetMapping(complete).complete, true);
});

test("unknown sheets are ignored by validation, progress, and confirm payload", () => {
  const mappings = mixedUnknownAndSalesMappings();
  const [readme, sales] = mappings;
  assert.ok(readme);
  assert.ok(sales);
  assert.equal(normalizeSheetType("Chưa xác định"), "unknown");
  assert.deepEqual(readme.mapping, {});

  const readmeValidation = validateSheetMapping(readme);
  assert.equal(readmeValidation.unknownSheetType, true);
  assert.equal(readmeValidation.totalColumns, 0);
  assert.equal(readmeValidation.mappedColumns, 0);
  assert.deepEqual(readmeValidation.unresolvedColumns, []);
  assert.deepEqual(readmeValidation.missingCoreFields, []);
  assert.deepEqual(readmeValidation.duplicateFields, []);

  const validation = validateImportMappings(mappings);
  assert.equal(validation.processableSheets, 1);
  assert.equal(validation.ignoredSheets, 1);
  assert.equal(validation.totalColumns, 8);
  assert.equal(validation.mappedColumns, 8);
  assert.equal(validation.unresolvedColumns, 0);
  assert.equal(validation.incompleteSheets, 0);
  assert.equal(validation.complete, true);

  const payload = toConfirmMappings(mappings);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.profile_id, "profile-sales");
  assert.equal(payload[0]?.sheet_name, "POS_T7_2026");
  assert.equal(payload[0]?.sheet_type, "sales_history");
  assert.equal(JSON.stringify(payload).includes("README"), false);
  assert.equal(JSON.stringify(payload).includes("unknown"), false);
  assert.equal(JSON.stringify(payload).includes("null"), false);
  assert.equal(JSON.stringify(payload).includes(ignoreField), false);
});

test("all unknown sheets block confirmation without mapping errors", () => {
  const [readme] = mixedUnknownAndSalesMappings();
  assert.ok(readme);
  const validation = validateImportMappings([readme]);
  assert.equal(validation.processableSheets, 0);
  assert.equal(validation.ignoredSheets, 1);
  assert.equal(validation.totalColumns, 0);
  assert.equal(validation.incompleteSheets, 0);
  assert.equal(validation.complete, false);
  assert.throws(
    () => toConfirmMappings([readme]),
    /Không tìm thấy bảng dữ liệu có thể xử lý/,
  );
});

test("changing unknown to a canonical type restores mapping validation", () => {
  const [readme] = mixedUnknownAndSalesMappings();
  assert.ok(readme);
  const sales = changeSheetMappingType(readme, "sales_history");
  const validation = validateImportMappings([sales]);
  assert.equal(validation.processableSheets, 1);
  assert.equal(validation.totalColumns, 2);
  assert.equal(validation.mappedColumns, 0);
  assert.equal(validation.unresolvedColumns, 2);
  assert.equal(validation.incompleteSheets, 1);
  assert.equal(validation.complete, false);
  assert.deepEqual(validateSheetMapping(sales).missingCoreFields, [
    "date",
    "product_name",
    "quantity_sold",
  ]);
});

test("changing a canonical sheet to unknown clears stale mapping only for that sheet", () => {
  const [, originalSales] = mixedUnknownAndSalesMappings();
  assert.ok(originalSales);
  const originalMapping = { ...originalSales.mapping };
  const skippedSales = changeSheetMappingType(originalSales, "unknown");
  assert.deepEqual(skippedSales.mapping, {});
  assert.deepEqual(originalSales.mapping, originalMapping);

  const validation = validateImportMappings([skippedSales, originalSales]);
  assert.equal(validation.processableSheets, 1);
  assert.equal(validation.ignoredSheets, 1);
  assert.equal(validation.totalColumns, 8);
  assert.equal(validation.complete, true);
  const payload = toConfirmMappings([skippedSales, originalSales]);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.sheet_type, "sales_history");
  assert.deepEqual(payload[0]?.column_mapping, originalMapping);
});

test("valid sheets still block confirmation for unresolved columns or missing core fields", () => {
  const [, sales] = mixedUnknownAndSalesMappings();
  assert.ok(sales);
  const unresolved = {
    ...sales,
    mapping: { ...sales.mapping, "Khuyến mãi": ignoreField },
  };
  assert.equal(validateImportMappings([unresolved]).complete, false);
  assert.equal(validateImportMappings([unresolved]).unresolvedColumns, 1);

  const missingCore = {
    ...sales,
    mapping: { ...sales.mapping, "Số lượng": ignoreField },
  };
  assert.equal(validateImportMappings([missingCore]).complete, false);
  assert.deepEqual(validateSheetMapping(missingCore).missingCoreFields, [
    "quantity_sold",
  ]);
});

test("malformed import suggestions fail closed without crashing", () => {
  const malformed = {
    import_id: "import-malformed",
    profiles: [
      null,
      {
        profile_id: "profile-malformed",
        sheet_name: "Ghi chú",
        columns: { unexpected: true },
        sample_rows: "not-an-array",
      },
    ],
    suggested_mappings: "not-an-object",
  } as unknown as ImportCreateResponse;

  let mappings: EditableSheetMapping[] = [];
  assert.doesNotThrow(() => {
    mappings = buildEditableMappings(malformed);
  });
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0]?.sheetType, "unknown");
  assert.deepEqual(mappings[0]?.columns, []);
  assert.deepEqual(mappings[0]?.mapping, {});
  assert.equal(validateImportMappings(mappings).complete, false);
});

test("result counters only count canonical imported collections", () => {
  const result = {
    store_id: "STORE_TEST",
    forecast_date: "2026-07-31",
    forecast_horizon: 7,
    inventory: [],
    sales_history: [{ date: "2026-07-01" }],
    usage_history: [],
    recipes: [],
    purchase_history: [],
    supplier_constraints: [],
    calendar_features: [],
    business_constraints: [],
    menu: [],
    ignored_sheets: [{ sheet_name: "README", sheet_type: "unknown" }],
    validation_summary: {},
    ingestion_metadata: {},
  } as IngestionResult;

  assert.equal(
    resultCounts(result).reduce((total, item) => total + item.value, 0),
    1,
  );
});

test("frontend exposes every backend canonical sheet type and field", () => {
  assert.deepEqual(SHEET_TYPES, [
    "inventory",
    "sales_history",
    "usage_history",
    "recipes",
    "purchase_history",
    "supplier_constraints",
    "calendar_features",
    "business_constraints",
    "menu",
    "unknown",
  ]);
  assert.deepEqual(CANONICAL_SCHEMAS.recipes.core_fields, [
    "product_name",
    "ingredient_name",
    "ingredient_quantity",
  ]);
  assert.ok(
    CANONICAL_SCHEMAS.supplier_constraints.fields.includes(
      "available_delivery_days",
    ),
  );
});

test("06_Menu headers map to the Menu canonical schema", () => {
  const response: ImportCreateResponse = {
    import_id: "import-menu",
    profiles: [
      {
        profile_id: "profile-menu",
        file_name: "06_Menu.xlsx",
        sheet_name: "06_Menu",
        row_count: 10,
        columns: [
          "Mã món",
          "Loại",
          "Tên món / Combo",
          "Thành phần combo",
          "ĐVT",
          "Tổng giá lẻ",
          "Mức giảm",
          "Giá bán",
          "Tiết kiệm",
          "Trạng thái",
        ],
      },
    ],
    suggested_mappings: [
      {
        profile_id: "profile-menu",
        sheet_type: "product_catalog",
        source: "llm",
        column_mapping: {
          "Mã món": "product_sku",
          "Loại": "item_type",
          "Tên món / Combo": "product_name",
          "Thành phần combo": "combo_components",
          "ĐVT": "selling_unit",
          "Tổng giá lẻ": "list_price",
          "Mức giảm": "discount_rate",
          "Giá bán": "selling_price",
          "Tiết kiệm": "savings_amount",
          "Trạng thái": "status",
        },
      },
    ],
  };

  const mappings = buildEditableMappings(response);
  assert.equal(mappings[0]?.sheetType, "menu");
  assert.deepEqual(mappings[0]?.targetFields, CANONICAL_SCHEMAS.menu.fields);
  assert.equal(validateImportMappings(mappings).complete, true);
  assert.deepEqual(CANONICAL_SCHEMAS.menu.core_fields, [
    "product_sku",
    "item_type",
    "product_name",
    "selling_price",
  ]);
});

test("ingestion result updates operational data and forecasting uses real usage", () => {
  const base = buildBootstrapData();
  const forecastDate = base.today;
  const usageHistory = Array.from({ length: 14 }, (_, index) => ({
    date: addDays(forecastDate, index - 14),
    ingredient: "Sữa hạt",
    quantity: 2 + (index % 3) * 0.25,
    unit: "lít",
  }));
  const result: IngestionResult = {
    store_id: "STORE_TEST",
    forecast_date: forecastDate,
    forecast_horizon: 10,
    inventory: [
      {
        ingredient: "Sữa hạt",
        on_hand: 9,
        unit: "lít",
        expiry_date: addDays(forecastDate, 8),
      },
    ],
    sales_history: [],
    usage_history: usageHistory,
    recipes: [
      {
        product: "Latte hạt",
        ingredient: "Sữa hạt",
        quantity: 0.2,
        unit: "lít",
      },
    ],
    purchase_history: [
      {
        date: addDays(forecastDate, -2),
        ingredient: "Sữa hạt",
        quantity: 12,
        unit_cost: 41_000,
        supplier: "Green Supply",
      },
    ],
    supplier_constraints: [
      {
        ingredient: "Sữa hạt",
        supplier: "Green Supply",
        unit_cost: 41_000,
        moq: 6,
        pack_size: 6,
        lead_time_days: 2,
      },
    ],
    calendar_features: [],
    business_constraints: [
      {
        monthly_budget: 8_000_000,
        remaining_budget: 3_400_000,
      },
    ],
    validation_summary: { valid_rows: 30 },
    ingestion_metadata: { source: "rule" },
  };

  const data = mergeIngestionResult(base, result);
  assert.equal(data.settings.storeId, "STORE_TEST");
  assert.equal(data.settings.forecastHorizon, 10);
  assert.equal(data.inventory[0]?.ingredient, "Sữa hạt");
  assert.equal(data.inventory[0]?.moq, 6);
  assert.equal(data.inventory[0]?.supplier, "Green Supply");
  assert.equal(data.recipes[0]?.product, "Latte hạt");
  assert.equal(data.usageHistory.length, 14);

  const forecast = forecastIngredient(data, "Sữa hạt", 7);
  assert.match(forecast.dataNotes[0] ?? "", /lịch sử tiêu thụ/);
  assert.ok(forecast.totals.p50 > 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMappingSuggestion,
  buildEditableMappings,
  changeSheetMappingType,
  ignoreField,
  mergeImportFiles,
  resultCounts,
  toConfirmMappings,
  validateImportFiles,
  validateImportMappings,
  validateSheetMapping,
} from "../lib/ingestion.ts";
import {
  CANONICAL_SCHEMAS,
  SHEET_TYPES,
  canonicalFieldLabel,
  normalizeCanonicalField,
  normalizeSheetType,
} from "../lib/canonical-schemas.ts";
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

test("purchase-history maps receipt dates separately from order dates", () => {
  assert.deepEqual(CANONICAL_SCHEMAS.purchase_history.core_fields, [
    "received_date",
    "ingredient_name",
    "quantity_received",
  ]);
  assert.equal(canonicalFieldLabel("received_date"), "Ngày nhập hàng");
  assert.equal(canonicalFieldLabel("purchase_date"), "Ngày đặt hàng");
  assert.equal(
    normalizeCanonicalField("purchase_history", "date"),
    "received_date",
  );
});

test("optional source columns serialize as null while core fields still validate", () => {
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

  const ready = validateImportMappings(mappings);
  assert.equal(ready.complete, true);
  assert.equal(ready.unresolvedColumns, 1);

  const nullablePayload = toConfirmMappings(mappings);
  assert.equal(nullablePayload[0]?.column_mapping["Ghi chú"], null);
  assert.equal(nullablePayload[0]?.skip, false);

  const completed = mappings.map((mapping) => ({
    ...mapping,
    mapping: {
      ...mapping.mapping,
      "Ghi chú": "warehouse_name",
    },
  }));
  assert.equal(validateImportMappings(completed).complete, true);

  const payload = toConfirmMappings(completed);
  const columnMapping = payload[0]?.column_mapping as Record<
    string,
    string | null
  >;
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

test("unknown sheets validate as skipped and remain in the confirm payload", () => {
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
  assert.equal(payload.length, 2);
  assert.deepEqual(payload[0], {
    profile_id: "profile-readme",
    sheet_type: "unknown",
    column_mapping: {},
    skip: true,
  });
  assert.equal(payload[1]?.profile_id, "profile-sales");
  assert.equal(payload[1]?.sheet_type, "sales_history");
  assert.equal(payload[1]?.skip, false);
  assert.equal(JSON.stringify(payload).includes(ignoreField), false);
});

test("all unknown sheets can be confirmed as explicit skips", () => {
  const [readme] = mixedUnknownAndSalesMappings();
  assert.ok(readme);
  const validation = validateImportMappings([readme]);
  assert.equal(validation.processableSheets, 0);
  assert.equal(validation.ignoredSheets, 1);
  assert.equal(validation.totalColumns, 0);
  assert.equal(validation.incompleteSheets, 0);
  assert.equal(validation.complete, true);
  assert.deepEqual(toConfirmMappings([readme]), [
    {
      profile_id: "profile-readme",
      sheet_type: "unknown",
      column_mapping: {},
      skip: true,
    },
  ]);
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
  assert.equal(payload.length, 2);
  assert.equal(payload[0]?.sheet_type, "unknown");
  assert.equal(payload[0]?.skip, true);
  assert.deepEqual(payload[0]?.column_mapping, {});
  assert.equal(payload[1]?.sheet_type, "sales_history");
  assert.deepEqual(payload[1]?.column_mapping, originalMapping);
});

test("unmapped optional columns are allowed but missing core fields still block", () => {
  const [, sales] = mixedUnknownAndSalesMappings();
  assert.ok(sales);
  const unresolved = {
    ...sales,
    mapping: { ...sales.mapping, "Khuyến mãi": ignoreField },
  };
  const unresolvedValidation = validateImportMappings([unresolved]);
  assert.equal(unresolvedValidation.complete, true);
  assert.equal(unresolvedValidation.fullyMapped, false);
  assert.equal(unresolvedValidation.unresolvedColumns, 1);
  assert.equal(
    toConfirmMappings([unresolved])[0]?.column_mapping["Khuyến mãi"],
    null,
  );

  const missingCore = {
    ...sales,
    mapping: { ...sales.mapping, "Số lượng": ignoreField },
  };
  assert.equal(validateImportMappings([missingCore]).complete, false);
  assert.equal(validateImportMappings([missingCore]).fullyMapped, false);
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
  assert.equal(validateImportMappings(mappings).complete, true);
  assert.equal(toConfirmMappings(mappings)[0]?.skip, true);
});

test("mapping suggestions with profile IDs never fall back to duplicate sheet names", () => {
  const mappings = buildEditableMappings({
    import_id: "import-duplicate-sheet-names",
    profiles: [
      {
        profile_id: "profile-inventory",
        sheet_name: "Data",
        columns: ["Tên", "Số lượng"],
      },
      {
        profile_id: "profile-sales",
        sheet_name: "Data",
        columns: ["Ngày", "Món", "Số lượng"],
      },
    ],
    suggested_mappings: [
      {
        profile_id: "profile-sales",
        sheet_name: "Data",
        sheet_type: "sales_history",
        column_mapping: {
          Ngày: "date",
          Món: "product_name",
          "Số lượng": "quantity_sold",
        },
      },
      {
        profile_id: "profile-inventory",
        sheet_name: "Data",
        sheet_type: "inventory",
        column_mapping: {
          Tên: "ingredient_name",
          "Số lượng": "on_hand",
        },
      },
    ],
  });

  assert.equal(mappings[0]?.sheetType, "inventory");
  assert.equal(mappings[0]?.mapping.Tên, "ingredient_name");
  assert.equal(mappings[1]?.sheetType, "sales_history");
  assert.equal(mappings[1]?.mapping.Ngày, "date");
});

test("unknown sheets are not remapped by Qwen suggestions", () => {
  const [unknown] = mixedUnknownAndSalesMappings();
  assert.ok(unknown);
  const remapped = applyMappingSuggestion(unknown, {
    sheet_type: "inventory",
    column_mapping: {
      "Hướng dẫn": "ingredient_name",
      "Ghi chú": "on_hand",
    },
  });
  assert.equal(remapped, unknown);
  assert.equal(remapped.sheetType, "unknown");
  assert.deepEqual(remapped.mapping, {});
});

function fakeFile(name: string, size: number, lastModified = 1): File {
  return { name, size, lastModified } as File;
}

test("file selection accepts xlsm and retains valid files with precise errors", () => {
  const current = [fakeFile("kept.csv", 1024)];
  const selection = mergeImportFiles(current, [
    fakeFile("macro.xlsm", 2048, 2),
    fakeFile("notes.txt", 512, 3),
    fakeFile("too-large.xlsx", 12 * 1024 * 1024 + 1, 4),
  ]);

  assert.deepEqual(
    selection.files.map((file) => file.name),
    ["kept.csv", "macro.xlsm"],
  );
  assert.match(selection.errors.join(" "), /notes\.txt/);
  assert.match(selection.errors.join(" "), /too-large\.xlsx/);
  assert.match(selection.errors.join(" "), /12 MB/);
  assert.equal(validateImportFiles(selection.files).length, 0);
});

test("file selection enforces ten files and fifty megabytes without clearing drafts", () => {
  const tenFiles = Array.from({ length: 10 }, (_, index) =>
    fakeFile(`file-${index}.csv`, 1024, index),
  );
  const countLimited = mergeImportFiles(tenFiles, [
    fakeFile("eleventh.csv", 1024, 20),
  ]);
  assert.equal(countLimited.files.length, 10);
  assert.match(countLimited.errors[0] ?? "", /eleventh\.csv/);
  assert.match(countLimited.errors[0] ?? "", /10 tệp/);

  const nearLimit = Array.from({ length: 5 }, (_, index) =>
    fakeFile(`large-${index}.xlsx`, 10 * 1024 * 1024, index),
  );
  const totalLimited = mergeImportFiles(nearLimit, [
    fakeFile("over-total.xlsm", 1, 30),
  ]);
  assert.deepEqual(totalLimited.files, nearLimit);
  assert.match(totalLimited.errors[0] ?? "", /over-total\.xlsm/);
  assert.match(totalLimited.errors[0] ?? "", /50 MB/);
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
  assert.ok(
    CANONICAL_SCHEMAS.supplier_constraints.fields.includes(
      "shelf_life_days",
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

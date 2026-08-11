import { addDays, isWeekend, weekdayName } from "./data";
import { normalizeMenuItems } from "./menu";
import {
  canonicalFieldLabel,
  canonicalFieldsForSheetType,
  coreFieldsForSheetType,
  normalizeCanonicalField,
  normalizeSheetType,
  selectableSheetTypes,
  sheetTypeLabels,
} from "./canonical-schemas";
import type {
  ApiRecord,
  BootstrapData,
  CalendarDay,
  ConfirmImportMapping,
  EditableSheetMapping,
  ImportCreateResponse,
  IngestionResult,
  InventoryItem,
  MappingSuggestion,
  Product,
  PurchaseHistoryRow,
  RecipeLine,
  SalesHistoryRow,
  SupplierConstraintRow,
  UsageHistoryRow,
} from "./types";

export const ignoreField = "__unmapped__";

export const importFileLimits = {
  maxFiles: 10,
  maxFileBytes: 12 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  extensions: ["xlsx", "xls", "xlsm", "csv"],
} as const;

export interface ImportFileSelection {
  files: File[];
  errors: string[];
}

export {
  canonicalFieldLabel,
  selectableSheetTypes,
  sheetTypeLabels,
};

function normalizeText(value: unknown): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstValue(record: ApiRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function stringValue(
  record: ApiRecord,
  keys: string[],
  fallback = "",
): string {
  const value = firstValue(record, keys);
  return value === undefined ? fallback : String(value).trim();
}

function numberValue(
  record: ApiRecord,
  keys: string[],
  fallback = 0,
): number {
  const value = firstValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(
  record: ApiRecord,
  keys: string[],
  fallback = false,
): boolean {
  const value = firstValue(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value ?? "");
  if (["true", "yes", "co", "1", "x"].includes(normalized)) return true;
  if (["false", "no", "khong", "0", ""].includes(normalized)) return false;
  return fallback;
}

function isoDate(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dayFirst) {
    const [, day, month, rawYear] = dayFirst;
    const year =
      rawYear.length === 2 ? String(2_000 + Number(rawYear)) : rawYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? fallback
    : parsed.toISOString().slice(0, 10);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (isRecord(item)) {
        return stringValue(item, ["name", "column", "field"]);
      }
      return "";
    })
    .filter(Boolean);
}

function rows(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function directMapping(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter(
    ([, target]) =>
      typeof target === "string" || target === null || target === undefined,
  );
  if (!entries.length) return {};
  return Object.fromEntries(
    entries.map(([source, target]) => [
      source,
      typeof target === "string" && target ? target : ignoreField,
    ]),
  );
}

function nestedMappingFrom(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  for (const key of [
    "column_mapping",
    "mapping",
    "suggested_mapping",
    "mappings",
  ]) {
    const nested = directMapping(value[key]);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

function mappingFrom(value: unknown): Record<string, string> {
  const nested = nestedMappingFrom(value);
  if (Object.keys(nested).length) return nested;
  return directMapping(value);
}

function suggestionFor(
  response: ImportCreateResponse,
  profile: ApiRecord,
  index: number,
): ApiRecord {
  const suggestions = response.suggested_mappings;
  const profileId = stringValue(profile, ["profile_id", "id"]);
  if (Array.isArray(suggestions)) {
    const candidates = suggestions.filter(isRecord);
    if (profileId) {
      return (
        candidates.find(
          (candidate) =>
            stringValue(candidate, ["profile_id", "id"]) === profileId,
        ) ?? {}
      );
    }
    if (
      candidates.some((candidate) =>
        Boolean(stringValue(candidate, ["profile_id", "id"])),
      )
    ) {
      return {};
    }
    const sheetName = stringValue(profile, ["sheet_name", "name"]);
    return (
      candidates.find(
        (candidate) =>
          (sheetName &&
            stringValue(candidate, ["sheet_name", "name"]) === sheetName),
      ) ??
      candidates[index] ??
      {}
    );
  }
  if (isRecord(suggestions)) {
    if (profileId) {
      if (isRecord(suggestions[profileId])) {
        return suggestions[profileId] as ApiRecord;
      }
      const matchingValue = Object.values(suggestions)
        .filter(isRecord)
        .find(
          (candidate) =>
            stringValue(candidate, ["profile_id", "id"]) === profileId,
        );
      return matchingValue ?? {};
    }
    const nestedCandidates = Object.values(suggestions).filter(isRecord);
    if (
      nestedCandidates.some((candidate) =>
        Boolean(stringValue(candidate, ["profile_id", "id"])),
      )
    ) {
      return {};
    }
    const keys = [
      stringValue(profile, ["sheet_name", "name"]),
      String(index),
    ].filter(Boolean);
    for (const key of keys) {
      if (isRecord(suggestions[key])) return suggestions[key] as ApiRecord;
    }
    if (Object.values(suggestions).every((value) => typeof value === "string")) {
      return suggestions;
    }
  }
  return {};
}

function sanitizeMapping(
  columns: string[],
  sheetType: string,
  mapping: Record<string, string>,
): Record<string, string> {
  if (normalizeSheetType(sheetType) === "unknown") return {};
  return Object.fromEntries(
    columns.map((column) => [
      column,
      normalizeCanonicalField(sheetType, mapping[column]) ?? ignoreField,
    ]),
  );
}

export function buildEditableMappings(
  response: ImportCreateResponse,
): EditableSheetMapping[] {
  return (response.profiles ?? []).filter(isRecord).map((profile, index) => {
    const suggestion = suggestionFor(response, profile, index);
    const proposedMapping = {
      ...nestedMappingFrom(profile),
      ...mappingFrom(suggestion),
    };
    const sheetType = normalizeSheetType(
      stringValue(suggestion, ["sheet_type", "type"]) ||
        stringValue(profile, [
          "sheet_type",
          "detected_sheet_type",
          "detected_type",
          "type",
        ]),
    );
    const columns =
      stringArray(profile.columns).length > 0
        ? stringArray(profile.columns)
        : Object.keys(proposedMapping);
    const mapping = sanitizeMapping(columns, sheetType, proposedMapping);
    const confidenceRaw = firstValue(suggestion, ["confidence", "score"]);
    const confidence =
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
        ? confidenceRaw
        : null;
    const sheetName =
      stringValue(profile, ["sheet_name", "name"], `Bảng ${index + 1}`) ||
      `Bảng ${index + 1}`;
    return {
      id:
        stringValue(profile, ["profile_id", "id"]) ||
        `${stringValue(profile, ["file_name", "filename"], "file")}:${sheetName}:${index}`,
      profile,
      sheetName,
      fileName: stringValue(profile, ["file_name", "filename", "source_file"]),
      sheetType,
      rowCount: numberValue(profile, ["row_count", "rows_count", "rowCount"]),
      columns,
      sampleRows: rows(
        firstValue(profile, ["sample_rows", "preview_rows", "rows"]),
      ).slice(0, 6),
      confidence,
      source:
        stringValue(suggestion, ["source"], response.source ?? "rule") ||
        "rule",
      mapping,
      targetFields: canonicalFieldsForSheetType(sheetType),
    };
  });
}

export function applyMappingSuggestion(
  current: EditableSheetMapping,
  suggestion: MappingSuggestion,
): EditableSheetMapping {
  if (!isProcessableSheet(current)) return current;
  const sheetType = normalizeSheetType(
    stringValue(suggestion, ["sheet_type", "type"], current.sheetType) ||
      current.sheetType,
  );
  const nextMapping = mappingFrom(suggestion);
  const proposedMapping = Object.keys(nextMapping).length
    ? { ...current.mapping, ...nextMapping }
    : current.mapping;
  return {
    ...current,
    sheetType,
    mapping: sanitizeMapping(current.columns, sheetType, proposedMapping),
    source: stringValue(suggestion, ["source"], "llm") || "llm",
    confidence:
      typeof suggestion.confidence === "number"
        ? suggestion.confidence
        : current.confidence,
    targetFields: canonicalFieldsForSheetType(sheetType),
  };
}

export function changeSheetMappingType(
  current: EditableSheetMapping,
  nextSheetType: string,
): EditableSheetMapping {
  const sheetType = normalizeSheetType(nextSheetType);
  return {
    ...current,
    sheetType,
    mapping: sanitizeMapping(current.columns, sheetType, current.mapping),
    targetFields: canonicalFieldsForSheetType(sheetType),
  };
}

export interface SheetMappingValidation {
  sheetId: string;
  sheetName: string;
  mappedColumns: number;
  totalColumns: number;
  unresolvedColumns: string[];
  duplicateFields: string[];
  missingCoreFields: string[];
  unknownSheetType: boolean;
  complete: boolean;
  fullyMapped: boolean;
}

export interface ImportMappingValidation {
  sheets: SheetMappingValidation[];
  processableSheets: number;
  ignoredSheets: number;
  mappedColumns: number;
  totalColumns: number;
  unresolvedColumns: number;
  incompleteSheets: number;
  complete: boolean;
  fullyMapped: boolean;
}

export function isProcessableSheet(
  item: Pick<EditableSheetMapping, "sheetType">,
): boolean {
  return normalizeSheetType(item.sheetType) !== "unknown";
}

export function validateSheetMapping(
  item: EditableSheetMapping,
): SheetMappingValidation {
  const sheetType = normalizeSheetType(item.sheetType);
  const unknownSheetType = !isProcessableSheet(item);
  if (unknownSheetType) {
    return {
      sheetId: item.id,
      sheetName: item.sheetName,
      mappedColumns: 0,
      totalColumns: 0,
      unresolvedColumns: [],
      duplicateFields: [],
      missingCoreFields: [],
      unknownSheetType: true,
      complete: true,
      fullyMapped: true,
    };
  }
  const allowedFields = canonicalFieldsForSheetType(sheetType);
  const resolvedEntries = item.columns
    .map(
      (column) =>
        [
          column,
          normalizeCanonicalField(sheetType, item.mapping[column]),
        ] as const,
    )
    .filter((entry): entry is readonly [string, string] =>
      Boolean(entry[1]),
    );
  const resolvedByColumn = new Map(resolvedEntries);
  const unresolvedColumns = item.columns.filter(
    (column) =>
      !resolvedByColumn.has(column) ||
      !allowedFields.includes(resolvedByColumn.get(column) ?? ""),
  );
  const fieldCounts = resolvedEntries.reduce<Record<string, number>>(
    (counts, [, field]) => {
      counts[field] = (counts[field] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const duplicateFields = Object.entries(fieldCounts)
    .filter(([, count]) => count > 1)
    .map(([field]) => field);
  const resolvedFields = new Set(resolvedEntries.map(([, field]) => field));
  const missingCoreFields = coreFieldsForSheetType(sheetType).filter(
    (field) => !resolvedFields.has(field),
  );
  const complete =
    duplicateFields.length === 0 && missingCoreFields.length === 0;
  const fullyMapped = complete && unresolvedColumns.length === 0;

  return {
    sheetId: item.id,
    sheetName: item.sheetName,
    mappedColumns: item.columns.length - unresolvedColumns.length,
    totalColumns: item.columns.length,
    unresolvedColumns,
    duplicateFields,
    missingCoreFields,
    unknownSheetType,
    complete,
    fullyMapped,
  };
}

export function validateImportMappings(
  mappings: EditableSheetMapping[],
): ImportMappingValidation {
  const sheets = mappings.map(validateSheetMapping);
  const processableSheets = sheets.filter((sheet) => !sheet.unknownSheetType);
  const totalColumns = processableSheets.reduce(
    (total, sheet) => total + sheet.totalColumns,
    0,
  );
  const mappedColumns = processableSheets.reduce(
    (total, sheet) => total + sheet.mappedColumns,
    0,
  );
  return {
    sheets,
    processableSheets: processableSheets.length,
    ignoredSheets: sheets.length - processableSheets.length,
    mappedColumns,
    totalColumns,
    unresolvedColumns: totalColumns - mappedColumns,
    incompleteSheets: processableSheets.filter((sheet) => !sheet.complete)
      .length,
    complete: sheets.length > 0 && sheets.every((sheet) => sheet.complete),
    fullyMapped:
      sheets.length > 0 && sheets.every((sheet) => sheet.fullyMapped),
  };
}

export function toConfirmMappings(
  mappings: EditableSheetMapping[],
): ConfirmImportMapping[] {
  const validation = validateImportMappings(mappings);
  if (!validation.complete) {
    throw new Error(
      "Chưa thể xác nhận: hãy bổ sung đủ trường bắt buộc và gỡ canonical field bị trùng.",
    );
  }
  return mappings.map((item) => {
    const profileId = stringValue(item.profile, ["profile_id", "id"]);
    if (!profileId) {
      throw new Error(
        `Không thể xác nhận “${item.sheetName}”: backend không trả profile_id.`,
      );
    }
    const sheetType = normalizeSheetType(item.sheetType);
    const skip = sheetType === "unknown";
    const columnMapping = Object.fromEntries(
      skip
        ? []
        : item.columns.map((source) => [
            source,
            normalizeCanonicalField(sheetType, item.mapping[source]),
          ]),
    );
    const payload: ConfirmImportMapping = {
      profile_id: profileId,
      sheet_type: sheetType,
      column_mapping: columnMapping,
      skip,
    };
    return payload;
  });
}

function importFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function supportedImportFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (importFileLimits.extensions as readonly string[]).includes(extension);
}

export function validateImportFiles(files: File[]): string[] {
  const errors: string[] = [];
  files.forEach((file) => {
    if (!supportedImportFile(file)) {
      errors.push(
        `“${file.name}” không được hỗ trợ. Chọn tệp .xlsx, .xls, .xlsm hoặc .csv.`,
      );
    }
    if (file.size > importFileLimits.maxFileBytes) {
      errors.push(`“${file.name}” vượt quá giới hạn 12 MB mỗi tệp.`);
    }
  });
  if (files.length > importFileLimits.maxFiles) {
    errors.push(
      `Đã chọn ${files.length} tệp; mỗi lần nhập chỉ nhận tối đa 10 tệp.`,
    );
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > importFileLimits.maxTotalBytes) {
    errors.push("Tổng dung lượng tệp vượt quá giới hạn 50 MB mỗi lần nhập.");
  }
  return errors;
}

export function mergeImportFiles(
  current: File[],
  candidates: FileList | File[],
): ImportFileSelection {
  const files = [...current];
  const errors: string[] = [];
  const known = new Set(files.map(importFileKey));
  let totalBytes = files.reduce((total, file) => total + file.size, 0);

  for (const file of Array.from(candidates)) {
    if (known.has(importFileKey(file))) continue;
    if (!supportedImportFile(file)) {
      errors.push(
        `“${file.name}” không được hỗ trợ. Các tệp đã chọn vẫn được giữ; hãy dùng .xlsx, .xls, .xlsm hoặc .csv.`,
      );
      continue;
    }
    if (file.size > importFileLimits.maxFileBytes) {
      errors.push(
        `“${file.name}” vượt quá 12 MB và chưa được thêm. Các tệp đã chọn vẫn được giữ.`,
      );
      continue;
    }
    if (files.length >= importFileLimits.maxFiles) {
      errors.push(
        `Không thể thêm “${file.name}”: mỗi lần nhập tối đa 10 tệp. Các tệp đã chọn vẫn được giữ.`,
      );
      continue;
    }
    if (totalBytes + file.size > importFileLimits.maxTotalBytes) {
      errors.push(
        `Không thể thêm “${file.name}”: tổng dung lượng sẽ vượt 50 MB. Các tệp đã chọn vẫn được giữ.`,
      );
      continue;
    }
    files.push(file);
    known.add(importFileKey(file));
    totalBytes += file.size;
  }

  return { files, errors };
}

export function issueMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((issue) => {
      if (typeof issue === "string") return issue;
      if (isRecord(issue)) {
        const message = stringValue(issue, ["message", "detail", "error"]);
        const sheet = stringValue(issue, ["sheet_name", "sheet"]);
        return message ? `${sheet ? `${sheet}: ` : ""}${message}` : "";
      }
      return String(issue ?? "");
    })
    .filter(Boolean);
}

function normalizedRecipes(result: IngestionResult): RecipeLine[] {
  return rows(result.recipes)
    .map((row) => ({
      product: stringValue(row, ["product", "product_name", "menu_item"]),
      ingredient: stringValue(row, [
        "ingredient",
        "ingredient_name",
        "material",
      ]),
      quantity: numberValue(row, [
        "quantity",
        "quantity_per_unit",
        "amount",
        "qty",
      ]),
      unit: stringValue(row, ["unit", "uom"]),
    }))
    .filter(
      (row) =>
        Boolean(row.product) &&
        Boolean(row.ingredient) &&
        row.quantity > 0 &&
        Boolean(row.unit),
    );
}

function normalizedSales(result: IngestionResult): SalesHistoryRow[] {
  return rows(result.sales_history)
    .map((row) => ({
      date: isoDate(firstValue(row, ["date", "sales_date", "dt"]), ""),
      product: stringValue(row, ["product", "product_name", "item"]),
      quantity: numberValue(row, [
        "quantity",
        "quantity_sold",
        "sale_amount",
        "qty",
      ]),
      unitPrice: numberValue(row, ["unit_price", "price"], 0),
      promotion: booleanValue(row, ["promotion", "is_promotion"], false),
    }))
    .filter((row) => Boolean(row.date) && Boolean(row.product));
}

function normalizedUsage(result: IngestionResult): UsageHistoryRow[] {
  return rows(result.usage_history)
    .map((row) => ({
      date: isoDate(firstValue(row, ["date", "usage_date", "dt"]), ""),
      ingredient: stringValue(row, [
        "ingredient",
        "ingredient_name",
        "material",
      ]),
      quantity: numberValue(row, [
        "quantity",
        "quantity_used",
        "usage",
        "qty",
      ]),
      unit: stringValue(row, ["unit", "uom"]),
    }))
    .filter(
      (row) =>
        Boolean(row.date) && Boolean(row.ingredient) && row.quantity >= 0,
    );
}

function normalizedPurchases(
  result: IngestionResult,
): PurchaseHistoryRow[] {
  return rows(result.purchase_history)
    .map((row) => ({
      date: isoDate(firstValue(row, ["date", "purchase_date"]), ""),
      ingredient: stringValue(row, [
        "ingredient",
        "ingredient_name",
        "material",
      ]),
      quantity: numberValue(row, ["quantity", "qty"]),
      unitCost: numberValue(row, ["unit_cost", "cost", "price"]),
      supplier: stringValue(row, ["supplier", "supplier_name", "vendor"]),
      expiryDate: isoDate(firstValue(row, ["expiry_date", "expiry"]), ""),
    }))
    .filter((row) => Boolean(row.ingredient));
}

function normalizedSupplierConstraints(
  result: IngestionResult,
): SupplierConstraintRow[] {
  return rows(result.supplier_constraints)
    .map((row) => ({
      ingredient: stringValue(row, [
        "ingredient",
        "ingredient_name",
        "material",
      ]),
      supplier: stringValue(row, ["supplier", "supplier_name", "vendor"]),
      unitCost: numberValue(row, ["unit_cost", "cost", "price"]),
      moq: numberValue(row, ["moq", "minimum_order_quantity"]),
      packSize: numberValue(row, ["pack_size", "case_size", "pack"], 1),
      leadTimeDays: numberValue(row, [
        "lead_time_days",
        "lead_time",
        "delivery_days",
      ]),
    }))
    .filter((row) => Boolean(row.ingredient));
}

function normalizedCalendar(result: IngestionResult): CalendarDay[] {
  return rows(result.calendar_features)
    .map((row) => {
      const date = isoDate(firstValue(row, ["date", "dt"]), "");
      return {
        date,
        weekday: stringValue(row, ["weekday"], weekdayName(date)),
        weekend: booleanValue(
          row,
          ["weekend", "is_weekend", "weekend_flag"],
          isWeekend(date),
        ),
        holiday: booleanValue(row, [
          "holiday",
          "is_holiday",
          "holiday_flag",
        ]),
        promotion: booleanValue(row, [
          "promotion",
          "is_promotion",
          "activity_flag",
        ]),
        promotionNote: stringValue(row, [
          "promotion_note",
          "promotion_name",
          "note",
        ]),
      };
    })
    .filter((row) => Boolean(row.date));
}

function newestPurchase(
  ingredient: string,
  purchases: PurchaseHistoryRow[],
): PurchaseHistoryRow | undefined {
  return purchases
    .filter(
      (row) => normalizeText(row.ingredient) === normalizeText(ingredient),
    )
    .sort((left, right) => right.date.localeCompare(left.date))[0];
}

function matchingConstraint(
  ingredient: string,
  constraints: SupplierConstraintRow[],
): SupplierConstraintRow | undefined {
  return constraints.find(
    (row) => normalizeText(row.ingredient) === normalizeText(ingredient),
  );
}

function generatedSku(ingredient: string, index: number): string {
  const token = normalizeText(ingredient)
    .split(" ")
    .map((part) => part.slice(0, 3))
    .join("")
    .toUpperCase()
    .slice(0, 10);
  return `NL-${token || "ITEM"}-${String(index + 1).padStart(3, "0")}`;
}

function normalizedInventory(
  base: BootstrapData,
  result: IngestionResult,
  purchases: PurchaseHistoryRow[],
  constraints: SupplierConstraintRow[],
): InventoryItem[] {
  const sourceRows = rows(result.inventory);
  if (!sourceRows.length) return base.inventory;

  const grouped = new Map<string, ApiRecord[]>();
  for (const row of sourceRows) {
    const ingredient = stringValue(row, [
      "ingredient",
      "ingredient_name",
      "material",
    ]);
    if (!ingredient) continue;
    const key = normalizeText(ingredient);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.values()).map((lots, index) => {
    const first = lots[0] ?? {};
    const ingredient = stringValue(first, [
      "ingredient",
      "ingredient_name",
      "material",
    ]);
    const existing = base.inventory.find(
      (item) => normalizeText(item.ingredient) === normalizeText(ingredient),
    );
    const purchase = newestPurchase(ingredient, purchases);
    const constraint = matchingConstraint(ingredient, constraints);
    const expiries = lots
      .map((row) =>
        isoDate(firstValue(row, ["expiry_date", "expiry"]), ""),
      )
      .filter(Boolean)
      .sort();
    const onHand = lots.reduce(
      (sum, row) =>
        sum + numberValue(row, ["on_hand", "quantity", "stock"], 0),
      0,
    );
    const expiringQty = lots.reduce((sum, row) => {
      const expiry = isoDate(
        firstValue(row, ["expiry_date", "expiry"]),
        addDays(result.forecast_date, 365),
      );
      return expiry <= addDays(result.forecast_date, 3)
        ? sum + numberValue(row, ["on_hand", "quantity", "stock"], 0)
        : sum;
    }, 0);
    const unit =
      stringValue(first, ["unit", "uom"]) || existing?.unit || "đơn vị";
    const moq = constraint?.moq || existing?.moq || 1;
    const packSize = constraint?.packSize || existing?.packSize || moq || 1;
    const safetyStock = existing?.safetyStock ?? null;
    return {
      ingredient,
      sku:
        stringValue(first, ["sku", "ingredient_id"]) ||
        existing?.sku ||
        generatedSku(ingredient, index),
      unit,
      onHand: Number(onHand.toFixed(3)),
      unitCost:
        constraint?.unitCost ||
        purchase?.unitCost ||
        existing?.unitCost ||
        numberValue(first, ["unit_cost"], 0),
      expiryDate:
        expiries[0] ?? existing?.expiryDate ?? addDays(result.forecast_date, 30),
      expiringQty: Number(expiringQty.toFixed(3)),
      safetyStock,
      inbound: numberValue(first, ["inbound", "incoming"], existing?.inbound ?? 0),
      supplier:
        constraint?.supplier ||
        purchase?.supplier ||
        existing?.supplier ||
        "Chưa thiết lập",
      leadTimeDays:
        constraint?.leadTimeDays || existing?.leadTimeDays || 1,
      moq,
      packSize,
      capacity: numberValue(
        first,
        ["capacity", "storage_capacity"],
        existing?.capacity ?? Math.max(onHand * 3, moq * 4, 1),
      ),
      lastCounted: isoDate(
        firstValue(first, ["last_counted", "counted_at"]),
        result.forecast_date,
      ),
    };
  });
}

function normalizedProducts(
  base: BootstrapData,
  recipes: RecipeLine[],
  sales: SalesHistoryRow[],
  effectiveDate: string,
): Product[] {
  const names = new Set([
    ...recipes.map((row) => row.product),
    ...sales.map((row) => row.product),
  ]);
  if (!names.size) return base.products;
  return Array.from(names).map((name, index) => {
    const existing = base.products.find(
      (item) => normalizeText(item.product) === normalizeText(name),
    );
    const price =
      sales
        .filter((row) => normalizeText(row.product) === normalizeText(name))
        .map((row) => row.unitPrice ?? 0)
        .filter((value) => value > 0)
        .at(-1) ??
      existing?.price ??
      0;
    return {
      product: name,
      sku: existing?.sku ?? `SP-${String(index + 1).padStart(3, "0")}`,
      price,
      recipeStatus: recipes.some(
        (row) => normalizeText(row.product) === normalizeText(name),
      )
        ? "Hoàn chỉnh"
        : "Thiếu định lượng",
      effectiveDate: existing?.effectiveDate ?? effectiveDate,
    };
  });
}

export function mergeIngestionResult(
  base: BootstrapData,
  result: IngestionResult,
): BootstrapData {
  const recipes = normalizedRecipes(result);
  const salesHistory = normalizedSales(result);
  const usageHistory = normalizedUsage(result);
  const purchaseHistory = normalizedPurchases(result);
  const supplierConstraints = normalizedSupplierConstraints(result);
  const calendar = normalizedCalendar(result);
  const inventory = normalizedInventory(
    base,
    result,
    purchaseHistory,
    supplierConstraints,
  );
  const menu = normalizeMenuItems(result.menu);
  const businessConstraints = rows(result.business_constraints);
  const budget = businessConstraints[0] ?? {};
  const derivedProducts = normalizedProducts(
    base,
    recipes.length ? recipes : base.recipes,
    salesHistory,
    result.forecast_date || base.today,
  );
  const products = menu.length
    ? menu.map((item) => ({
        productId: item.productId || undefined,
        product: item.product,
        sku: item.sku,
        price: item.price,
        itemType: item.itemType,
        status: item.status,
        sellingUnit: item.sellingUnit,
        recipeStatus:
          item.itemType === "single" &&
          (recipes.length ? recipes : base.recipes).some(
            (line) =>
              normalizeText(line.product) === normalizeText(item.product),
          )
            ? ("Hoàn chỉnh" as const)
            : ("Thiếu định lượng" as const),
        effectiveDate:
          base.products.find(
            (product) =>
              normalizeText(product.product) === normalizeText(item.product),
          )?.effectiveDate ??
          result.forecast_date ??
          base.today,
      }))
    : derivedProducts;

  return {
    ...base,
    today: result.forecast_date || base.today,
    inventory,
    products,
    menu: menu.length ? menu : base.menu,
    recipes: recipes.length ? recipes : base.recipes,
    salesHistory,
    usageHistory,
    purchaseHistory,
    supplierConstraints,
    businessConstraints,
    validationSummary: isRecord(result.validation_summary)
      ? result.validation_summary
      : {},
    ingestionMetadata: isRecord(result.ingestion_metadata)
      ? result.ingestion_metadata
      : {},
    futureCalendar: calendar.length ? calendar : base.futureCalendar,
    settings: {
      ...base.settings,
      storeId: result.store_id || base.settings.storeId,
      forecastHorizon:
        Number.isFinite(result.forecast_horizon) &&
        result.forecast_horizon > 0
          ? result.forecast_horizon
          : base.settings.forecastHorizon,
      monthlyBudget: numberValue(
        budget,
        ["monthly_budget", "budget"],
        base.settings.monthlyBudget,
      ),
      remainingBudget: numberValue(
        budget,
        ["remaining_budget", "available_budget"],
        base.settings.remainingBudget,
      ),
    },
  };
}

export function resultCounts(result: IngestionResult): Array<{
  label: string;
  value: number;
}> {
  return [
    { label: "Tồn kho", value: rows(result.inventory).length },
    {
      label: "Bán / tiêu thụ",
      value:
        rows(result.sales_history).length + rows(result.usage_history).length,
    },
    { label: "Công thức", value: rows(result.recipes).length },
    { label: "Nhập hàng", value: rows(result.purchase_history).length },
    { label: "Menu", value: rows(result.menu).length },
  ];
}

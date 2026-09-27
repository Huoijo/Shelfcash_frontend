import { canonicalFieldLabel } from "./canonical-schemas";
import type { SheetMappingValidation, ImportMappingValidation } from "./ingestion";
import type { EditableSheetMapping } from "./types";

export type MappingFeedbackSeverity =
  | "success"
  | "info"
  | "review"
  | "blocking";

export interface MappingFeedbackItem {
  id: string;
  severity: MappingFeedbackSeverity;
  title: string;
  description?: string;
  rawMessage?: string;
  sheetId?: string;
  sheetName?: string;
  columnName?: string;
  targetField?: string;
  confidence?: number | null;
  reasonCode?: string;
}

export type SheetCardStatus =
  | "complete"
  | "review"
  | "info"
  | "skipped"
  | "blocked";

export interface SheetCardStatusInfo {
  status: SheetCardStatus;
  label: string;
  iconText: string;
  badgeClass: "complete" | "pending" | "skipped" | "blocked";
  cardClass: "complete" | "needs-review" | "skipped" | "blocked";
  issueCount?: number;
}

export interface ImportFeedbackSummary {
  totalSheets: number;
  recognizedSheets: number;
  readySheets: number;
  reviewSheets: number;
  blockedSheets: number;
  skippedSheets: number;
  totalMappedColumns: number;
  totalColumns: number;
  reviewItemsCount: number;
  blockingItemsCount: number;
  infoItemsCount: number;
  successItemsCount: number;
  hasBlockingIssues: boolean;
  canConfirm: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = record[key];
    if (val !== undefined && val !== null) {
      const trimmed = String(val).trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

/**
 * Transforms technical backend diagnostics into human-friendly manager copy,
 * preserving raw data for collapsible technical inspect panel.
 */
export function normalizeRawIssue(
  rawIssue: unknown,
  isError: boolean,
  mappings: EditableSheetMapping[],
  index: number,
): MappingFeedbackItem {
  let rawText = "";
  let sheetName = "";
  let columnName = "";
  let targetField = "";
  let confidence: number | null = null;
  let reasonCode = "";

  if (typeof rawIssue === "string") {
    rawText = rawIssue.trim();
  } else if (isRecord(rawIssue)) {
    sheetName = stringValue(rawIssue, ["sheet_name", "sheet", "sheetName"]);
    columnName = stringValue(rawIssue, ["column_name", "column", "col", "columnName"]);
    targetField = stringValue(rawIssue, [
      "canonical_field",
      "target_field",
      "targetField",
      "field",
    ]);
    const rawConf = rawIssue.confidence ?? rawIssue.score;
    if (typeof rawConf === "number" && Number.isFinite(rawConf)) {
      confidence = rawConf;
    }
    reasonCode = stringValue(rawIssue, ["reason_code", "code", "reasonCode"]);
    rawText = stringValue(rawIssue, ["message", "detail", "error"]) || JSON.stringify(rawIssue);
  } else {
    rawText = String(rawIssue ?? "").trim();
  }

  // Extract sheet name from prefix if present: e.g. "POS_T7_2026: Column 'X'..."
  if (!sheetName) {
    const prefixMatch = rawText.match(/^(?:Sheet\s+['"]?([^'":]+)['"]?|([^:]+)):\s*(.+)$/i);
    if (prefixMatch) {
      const candidate = (prefixMatch[1] || prefixMatch[2] || "").trim();
      const matchedSheet = mappings.find(
        (m) => m.sheetName.toLowerCase() === candidate.toLowerCase(),
      );
      if (matchedSheet) {
        sheetName = matchedSheet.sheetName;
        rawText = (prefixMatch[3] || "").trim();
      }
    }
  }

  // Extract column name if in quotes: Column 'Đơn giá bán' or Cột 'Đơn giá bán'
  if (!columnName) {
    const colMatch = rawText.match(/(?:Column|Cột)\s+['"“]([^'"”]+)['"”]/i);
    if (colMatch?.[1]) {
      columnName = colMatch[1].trim();
    }
  }

  // Extract targetField if present: maps to 'waste_quantity' or mapped to selling_price
  if (!targetField) {
    const fieldMatch = rawText.match(
      /(?:maps to|mapped to|ánh xạ sang|→)\s+['"“]?([a-zA-Z0-9_]+)['"”]?/i,
    );
    if (fieldMatch?.[1]) {
      targetField = fieldMatch[1].trim();
    }
  }

  // If sheetName not yet known, match sheet by column name if unique
  if (!sheetName && columnName) {
    const matchingSheets = mappings.filter((m) => m.columns.includes(columnName));
    if (matchingSheets.length === 1 && matchingSheets[0]) {
      sheetName = matchingSheets[0].sheetName;
    }
  }

  const matchedSheet = mappings.find(
    (m) =>
      (sheetName && m.sheetName.toLowerCase() === sheetName.toLowerCase()) ||
      (m.sheetName.toLowerCase().includes("readme") && /readme/i.test(rawText)),
  );
  const sheetId = matchedSheet?.id;
  if (!sheetName && matchedSheet) {
    sheetName = matchedSheet.sheetName;
  }

  // Case A: README / Instruction sheet
  if (
    /readme/i.test(rawText) ||
    /metadata\/instructional text/i.test(rawText) ||
    /instructional text/i.test(rawText) ||
    /sheet hướng dẫn/i.test(rawText) ||
    (sheetName && /readme/i.test(sheetName))
  ) {
    return {
      id: `feedback-readme-${index}`,
      severity: "info",
      title: "README sẽ được bỏ qua",
      description: "Sheet này được nhận diện là phần hướng dẫn, không phải dữ liệu vận hành.",
      rawMessage: rawText,
      sheetId,
      sheetName: sheetName || "README",
      reasonCode: reasonCode || "INSTRUCTIONAL_SHEET",
    };
  }

  // Case B: No canonical mapping found / no columns found
  if (
    /no columns found that map to canonical schema/i.test(rawText) ||
    /no canonical mapping found/i.test(rawText) ||
    /không tìm thấy cột nào khớp/i.test(rawText)
  ) {
    return {
      id: `feedback-no-mapping-${index}`,
      severity: "review",
      title: "Chưa nhận diện được loại dữ liệu",
      description:
        "Bảng này chưa khớp với cấu trúc dữ liệu ShelfCash. Bạn có thể chọn loại dữ liệu thủ công hoặc bỏ qua bảng.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      reasonCode: reasonCode || "NO_CANONICAL_MAPPING",
    };
  }

  // Case C: selling_price / Đơn giá bán unmapped
  if (
    (/selling_price/i.test(rawText) || /Đơn giá bán/i.test(rawText)) &&
    (/not mapped/i.test(rawText) || /chưa được/i.test(rawText))
  ) {
    return {
      id: `feedback-selling-price-${index}`,
      severity: "review",
      title: "Đơn giá bán chưa được ghép",
      description:
        "Trường này có thể không cần thiết nếu bảng đã có Doanh thu và Số lượng bán.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName: columnName || "Đơn giá bán",
      targetField: "selling_price",
      confidence,
      reasonCode: reasonCode || "OPTIONAL_COLUMN_UNMAPPED",
    };
  }

  // Case D: stockout / Hết món unmapped
  if (
    (/stockout/i.test(rawText) || /Hết món/i.test(rawText)) &&
    (/not mapped/i.test(rawText) || /chưa được/i.test(rawText) || /ngoài/i.test(rawText))
  ) {
    return {
      id: `feedback-stockout-${index}`,
      severity: "review",
      title: "“Hết món?” đang được giữ ngoài mô hình chuẩn",
      description: "Đây không phải trường bắt buộc của dữ liệu bán hàng.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName: columnName || "Hết món?",
      targetField: targetField || "stockout",
      confidence,
      reasonCode: reasonCode || "NON_CORE_FIELD_UNMAPPED",
    };
  }

  // Case E: waste_quantity / Hao hụt successfully mapped
  if (
    (/waste_quantity/i.test(rawText) || /Hao hụt/i.test(rawText)) &&
    (/maps to/i.test(rawText) || /mapped/i.test(rawText) || /đã ánh xạ/i.test(rawText) || /→/i.test(rawText))
  ) {
    return {
      id: `feedback-waste-qty-${index}`,
      severity: "success",
      title: "✓ Hao hụt → waste_quantity",
      description: "Đã nhận diện và ánh xạ thành công vào trường lượng hao hụt.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName: columnName || "Hao hụt",
      targetField: "waste_quantity",
      confidence,
      reasonCode: reasonCode || "CANONICAL_MAPPING_SUCCESS",
    };
  }

  // Case F: General successfully mapped column
  if (
    /maps to/i.test(rawText) ||
    /mapped successfully/i.test(rawText) ||
    /đã ánh xạ/i.test(rawText)
  ) {
    const colTitle = columnName && targetField ? `✓ ${columnName} → ${targetField}` : "Ánh xạ cột thành công";
    const fieldLabel = targetField ? canonicalFieldLabel(targetField) : "";
    return {
      id: `feedback-mapped-${index}`,
      severity: "success",
      title: colTitle,
      description: fieldLabel
        ? `Đã nhận diện và ánh xạ thành công sang trường ${fieldLabel}.`
        : "Đã nhận diện và ánh xạ thành công.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName,
      targetField,
      confidence,
      reasonCode: reasonCode || "CANONICAL_MAPPING_SUCCESS",
    };
  }

  // Case G: General unmapped optional column
  if (/not mapped/i.test(rawText) || /chưa được ghép/i.test(rawText)) {
    const fieldLabel = targetField ? canonicalFieldLabel(targetField) : "";
    return {
      id: `feedback-unmapped-${index}`,
      severity: "review",
      title: columnName ? `${columnName} chưa được ghép` : "Cột chưa được ghép",
      description: fieldLabel
        ? `Trường này chưa được ánh xạ sang ${fieldLabel} và không chặn việc nhập dữ liệu.`
        : "Trường này đang được giữ ngoài mô hình chuẩn và không chặn việc nhập dữ liệu.",
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName,
      targetField,
      confidence,
      reasonCode: reasonCode || "OPTIONAL_COLUMN_UNMAPPED",
    };
  }

  // Case H: Blocking error
  if (isError) {
    return {
      id: `feedback-error-${index}`,
      severity: "blocking",
      title: columnName ? `Lỗi cột “${columnName}”` : "Lỗi dữ liệu",
      description: rawText,
      rawMessage: rawText,
      sheetId,
      sheetName,
      columnName,
      targetField,
      confidence,
      reasonCode: reasonCode || "BLOCKING_ERROR",
    };
  }

  // Fallback: informational or review note
  const isInfo = /hướng dẫn|thông tin|bỏ qua|metadata|instruction/i.test(rawText);
  return {
    id: `feedback-note-${index}`,
    severity: isInfo ? "info" : "review",
    title: sheetName ? `Ghi chú cho “${sheetName}”` : "Lưu ý dữ liệu",
    description: rawText,
    rawMessage: rawText,
    sheetId,
    sheetName,
    columnName,
    targetField,
    confidence,
    reasonCode,
  };
}

/**
 * Derives visual status, icon, and CSS classes for a dataset card.
 */
export function deriveSheetCardStatus(
  validation: SheetMappingValidation | undefined,
  sheetFeedbackItems: MappingFeedbackItem[],
): SheetCardStatusInfo {
  if (validation?.unknownSheetType) {
    return {
      status: "skipped",
      label: "Bỏ qua",
      iconText: "ⓘ",
      badgeClass: "skipped",
      cardClass: "skipped",
    };
  }

  const hasBlocking =
    (validation && !validation.complete) ||
    sheetFeedbackItems.some((item) => item.severity === "blocking");

  if (hasBlocking) {
    const missingCount = validation?.missingCoreFields.length ?? 0;
    const label = missingCount > 0 ? "Thiếu trường bắt buộc" : "Không thể tiếp tục";
    return {
      status: "blocked",
      label,
      iconText: "✕",
      badgeClass: "blocked",
      cardClass: "blocked",
      issueCount: missingCount || 1,
    };
  }

  const reviewItems = sheetFeedbackItems.filter((i) => i.severity === "review");
  const unresolvedCount = validation?.unresolvedColumns.length ?? 0;
  // Unique review issues count
  const issueCount = Math.max(reviewItems.length, unresolvedCount);

  if (issueCount > 0 || (validation && !validation.fullyMapped)) {
    return {
      status: "review",
      label: `${issueCount} mục cần kiểm tra`,
      iconText: "⚠",
      badgeClass: "pending",
      cardClass: "needs-review",
      issueCount,
    };
  }

  return {
    status: "complete",
    label: "Đã ghép đủ",
    iconText: "✓",
    badgeClass: "complete",
    cardClass: "complete",
  };
}

/**
 * Normalizes all raw backend warnings/errors and combines them with sheet validation
 * to produce the presentation feedback items and overall summary statistics.
 */
export function buildImportFeedbackModel(
  rawWarnings: unknown[],
  rawErrors: unknown[],
  mappings: EditableSheetMapping[],
  validation: ImportMappingValidation,
): {
  items: MappingFeedbackItem[];
  itemsBySheetId: Map<string, MappingFeedbackItem[]>;
  summary: ImportFeedbackSummary;
} {
  const items: MappingFeedbackItem[] = [];

  // 1. Normalize raw warnings
  (Array.isArray(rawWarnings) ? rawWarnings : []).forEach((warning, index) => {
    if (warning) {
      items.push(normalizeRawIssue(warning, false, mappings, index));
    }
  });

  // 2. Normalize raw errors
  (Array.isArray(rawErrors) ? rawErrors : []).forEach((error, index) => {
    if (error) {
      items.push(normalizeRawIssue(error, true, mappings, items.length + index));
    }
  });

  // 3. Add client-side validation items for each sheet
  validation.sheets.forEach((sheetVal) => {
    const matchedSheet = mappings.find((m) => m.id === sheetVal.sheetId);
    if (!matchedSheet) return;

    // Missing core fields -> blocking
    sheetVal.missingCoreFields.forEach((field) => {
      const fieldLabel = canonicalFieldLabel(field);
      const alreadyHas = items.some(
        (item) =>
          item.sheetId === sheetVal.sheetId &&
          item.targetField === field &&
          item.severity === "blocking",
      );
      if (!alreadyHas) {
        items.push({
          id: `val-missing-${sheetVal.sheetId}-${field}`,
          severity: "blocking",
          sheetId: sheetVal.sheetId,
          sheetName: sheetVal.sheetName,
          targetField: field,
          title: `Thiếu trường bắt buộc: ${fieldLabel}`,
          description: `Cần ghép một cột nguồn với trường “${fieldLabel}” để hoàn tất nhập dữ liệu.`,
          reasonCode: "MISSING_CORE_FIELD",
        });
      }
    });

    // Duplicate canonical fields -> blocking
    sheetVal.duplicateFields.forEach((field) => {
      const fieldLabel = canonicalFieldLabel(field);
      items.push({
        id: `val-dup-${sheetVal.sheetId}-${field}`,
        severity: "blocking",
        sheetId: sheetVal.sheetId,
        sheetName: sheetVal.sheetName,
        targetField: field,
        title: `Trùng trường chuẩn: ${fieldLabel}`,
        description: `Mỗi trường chuẩn chỉ được dùng một lần. Trường “${fieldLabel}” đang được ghép nhiều lần.`,
        reasonCode: "DUPLICATE_CANONICAL_FIELD",
      });
    });

    // Unresolved columns -> review (if not already noted)
    sheetVal.unresolvedColumns.forEach((col) => {
      const alreadyNoted = items.some(
        (item) =>
          item.sheetId === sheetVal.sheetId &&
          (item.columnName === col || item.title.includes(col)),
      );
      if (!alreadyNoted) {
        items.push({
          id: `val-unres-${sheetVal.sheetId}-${col}`,
          severity: "review",
          sheetId: sheetVal.sheetId,
          sheetName: sheetVal.sheetName,
          columnName: col,
          title: `${col} chưa được ghép`,
          description: "Cột này sẽ không được nhập vào hệ thống. Bạn có thể chọn ghép vào trường chuẩn hoặc bỏ qua.",
          reasonCode: "UNRESOLVED_COLUMN",
        });
      }
    });
  });

  // Group items by sheetId
  const itemsBySheetId = new Map<string, MappingFeedbackItem[]>();
  items.forEach((item) => {
    if (item.sheetId) {
      const current = itemsBySheetId.get(item.sheetId) ?? [];
      current.push(item);
      itemsBySheetId.set(item.sheetId, current);
    }
  });

  // Calculate summary counts
  const totalSheets = mappings.length;
  const recognizedSheets = mappings.filter((m) => m.sheetType !== "unknown").length;
  const skippedSheets = mappings.filter((m) => m.sheetType === "unknown").length;

  let readySheets = 0;
  let reviewSheets = 0;
  let blockedSheets = 0;

  mappings.forEach((sheet) => {
    const sheetVal = validation.sheets.find((s) => s.sheetId === sheet.id);
    const sheetItems = itemsBySheetId.get(sheet.id) ?? [];
    const status = deriveSheetCardStatus(sheetVal, sheetItems).status;
    if (status === "complete") readySheets++;
    else if (status === "review") reviewSheets++;
    else if (status === "blocked") blockedSheets++;
  });

  const reviewItemsCount = items.filter((i) => i.severity === "review").length;
  const blockingItemsCount = items.filter((i) => i.severity === "blocking").length;
  const infoItemsCount = items.filter((i) => i.severity === "info").length;
  const successItemsCount = items.filter((i) => i.severity === "success").length;

  const hasBlockingIssues = blockingItemsCount > 0 || blockedSheets > 0;
  const canConfirm = validation.complete && !hasBlockingIssues;

  const summary: ImportFeedbackSummary = {
    totalSheets,
    recognizedSheets,
    readySheets,
    reviewSheets,
    blockedSheets,
    skippedSheets,
    totalMappedColumns: validation.mappedColumns,
    totalColumns: validation.totalColumns,
    reviewItemsCount,
    blockingItemsCount,
    infoItemsCount,
    successItemsCount,
    hasBlockingIssues,
    canConfirm,
  };

  return { items, itemsBySheetId, summary };
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ImportSheetCard,
  ImportSummaryBanner,
  SheetFeedbackPanel,
} from "../app/views/ImportView.tsx";
import {
  buildImportFeedbackModel,
  deriveSheetCardStatus,
  normalizeRawIssue,
} from "../lib/import-feedback.ts";
import type { SheetMappingValidation, ImportMappingValidation } from "../lib/ingestion.ts";
import type { EditableSheetMapping } from "../lib/types.ts";

function createMockSheet(overrides?: Partial<EditableSheetMapping>): EditableSheetMapping {
  return {
    id: overrides?.id ?? "sheet-sales-1",
    profile: overrides?.profile ?? {},
    sheetName: overrides?.sheetName ?? "POS_T7_2026",
    fileName: overrides?.fileName ?? "POS_T7_2026.xlsx",
    sheetType: overrides?.sheetType ?? "sales_history",
    rowCount: overrides?.rowCount ?? 35,
    columns: overrides?.columns ?? ["Ngày", "Món", "Số lượng", "Đơn giá bán", "Hết món?", "Hao hụt", "Ghi chú"],
    sampleRows: overrides?.sampleRows ?? [],
    confidence: overrides?.confidence ?? 0.95,
    source: overrides?.source ?? "llm",
    mapping: overrides?.mapping ?? {
      "Ngày": "date",
      "Món": "product",
      "Số lượng": "quantity",
      "Đơn giá bán": "__unmapped__",
      "Hết món?": "__unmapped__",
      "Hao hụt": "waste_quantity",
      "Ghi chú": "__unmapped__",
    },
    targetFields: overrides?.targetFields ?? [
      "date",
      "product",
      "quantity",
      "selling_price",
      "waste_quantity",
    ],
  };
}

// Test Case A: README informational sheet
test("A. README informational sheet renders as INFO / skipped, not blocking warning", () => {
  const readmeRawWarning =
    "Sheet contains metadata/instructional text ('README') rather than transactional data.";
  const readmeSheet = createMockSheet({
    id: "sheet-readme",
    sheetName: "README",
    sheetType: "unknown",
    columns: ["Hướng dẫn sử dụng", "Mô tả"],
  });
  const mappings = [readmeSheet];

  // 1. Check issue normalization
  const item = normalizeRawIssue(readmeRawWarning, false, mappings, 0);
  assert.equal(item.severity, "info");
  assert.equal(item.title, "README sẽ được bỏ qua");
  assert.equal(
    item.description,
    "Sheet này được nhận diện là phần hướng dẫn, không phải dữ liệu vận hành.",
  );
  assert.equal(item.sheetName, "README");

  // 2. Check card status
  const validation: SheetMappingValidation = {
    sheetId: readmeSheet.id,
    sheetName: readmeSheet.sheetName,
    mappedColumns: 0,
    totalColumns: 0,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: true,
    complete: true,
    fullyMapped: true,
  };
  const cardStatus = deriveSheetCardStatus(validation, [item]);
  assert.equal(cardStatus.status, "skipped");
  assert.equal(cardStatus.label, "Bỏ qua");
  assert.equal(cardStatus.iconText, "ⓘ");
  assert.equal(cardStatus.badgeClass, "skipped");

  // 3. Render card & detail markup
  const cardMarkup = renderToStaticMarkup(
    <ImportSheetCard
      item={readmeSheet}
      validation={validation}
      selected={false}
      onSelect={() => undefined}
      feedbackItems={[item]}
    />,
  );
  assert.match(cardMarkup, /ⓘ/);
  assert.match(cardMarkup, /Bỏ qua/);
  assert.doesNotMatch(cardMarkup, /notice-warning/);
  assert.doesNotMatch(cardMarkup, /notice-error/);

  const detailMarkup = renderToStaticMarkup(
    <SheetFeedbackPanel
      sheet={readmeSheet}
      validation={validation}
      items={[item]}
    />,
  );
  assert.match(detailMarkup, /README sẽ được bỏ qua/);
  assert.match(detailMarkup, /Sheet này được nhận diện là phần hướng dẫn/);
  assert.match(detailMarkup, /feedback-info/);
});

// Test Case B: fully mapped sheet
test("B. fully mapped sheet displays success badge and complete state", () => {
  const completeSheet = createMockSheet({
    columns: ["Ngày", "Món", "Số lượng"],
    mapping: { "Ngày": "date", "Món": "product", "Số lượng": "quantity" },
  });
  const validation: SheetMappingValidation = {
    sheetId: completeSheet.id,
    sheetName: completeSheet.sheetName,
    mappedColumns: 3,
    totalColumns: 3,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: false,
    complete: true,
    fullyMapped: true,
  };

  const cardStatus = deriveSheetCardStatus(validation, []);
  assert.equal(cardStatus.status, "complete");
  assert.equal(cardStatus.label, "Đã ghép đủ");
  assert.equal(cardStatus.iconText, "✓");
  assert.equal(cardStatus.badgeClass, "complete");

  const markup = renderToStaticMarkup(
    <ImportSheetCard
      item={completeSheet}
      validation={validation}
      selected={false}
      onSelect={() => undefined}
      feedbackItems={[]}
    />,
  );
  assert.match(markup, /✓/);
  assert.match(markup, /Đã ghép đủ/);
  assert.match(markup, /mapping-state complete/);
});

// Test Case C: partially mapped sheet
test("C. partially mapped sheet displays review badge + issue count", () => {
  const partialSheet = createMockSheet({
    columns: ["Ngày", "Món", "Số lượng", "Ghi chú 1", "Ghi chú 2", "Ghi chú 3"],
    mapping: {
      "Ngày": "date",
      "Món": "product",
      "Số lượng": "quantity",
      "Ghi chú 1": "__unmapped__",
      "Ghi chú 2": "__unmapped__",
      "Ghi chú 3": "__unmapped__",
    },
  });
  const validation: SheetMappingValidation = {
    sheetId: partialSheet.id,
    sheetName: partialSheet.sheetName,
    mappedColumns: 3,
    totalColumns: 6,
    unresolvedColumns: ["Ghi chú 1", "Ghi chú 2", "Ghi chú 3"],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: false,
    complete: true,
    fullyMapped: false,
  };

  const cardStatus = deriveSheetCardStatus(validation, []);
  assert.equal(cardStatus.status, "review");
  assert.equal(cardStatus.label, "3 mục cần kiểm tra");
  assert.equal(cardStatus.iconText, "⚠");
  assert.equal(cardStatus.badgeClass, "pending");

  const markup = renderToStaticMarkup(
    <ImportSheetCard
      item={partialSheet}
      validation={validation}
      selected={false}
      onSelect={() => undefined}
    />,
  );
  assert.match(markup, /⚠/);
  assert.match(markup, /3 mục cần kiểm tra/);
  assert.match(markup, /mapping-state pending/);
});

// Test Case D: unmapped optional column
test("D. unmapped optional column presents as review/info, not system error", () => {
  const sheet = createMockSheet();
  const rawSellingPriceWarning =
    "Column 'Đơn giá bán' was not mapped to 'selling_price' because revenue and quantity are sufficient.";
  const rawStockoutWarning =
    "Column 'Hết món?' was not mapped to canonical schema";

  const item1 = normalizeRawIssue(rawSellingPriceWarning, false, [sheet], 0);
  assert.equal(item1.severity, "review");
  assert.equal(item1.title, "Đơn giá bán chưa được ghép");
  assert.equal(
    item1.description,
    "Trường này có thể không cần thiết nếu bảng đã có Doanh thu và Số lượng bán.",
  );

  const item2 = normalizeRawIssue(rawStockoutWarning, false, [sheet], 1);
  assert.equal(item2.severity, "review");
  assert.equal(item2.title, "“Hết món?” đang được giữ ngoài mô hình chuẩn");
  assert.equal(
    item2.description,
    "Đây không phải trường bắt buộc của dữ liệu bán hàng.",
  );

  const detailMarkup = renderToStaticMarkup(
    <SheetFeedbackPanel
      sheet={sheet}
      validation={undefined}
      items={[item1, item2]}
    />,
  );
  assert.match(detailMarkup, /feedback-review/);
  assert.match(detailMarkup, /badge-review/);
  assert.doesNotMatch(detailMarkup, /feedback-blocking/);
  assert.doesNotMatch(detailMarkup, /badge-blocking/);
});

// Test Case E: successfully mapped special field
test("E. successfully mapped special field renders in subtle success state", () => {
  const sheet = createMockSheet();
  const rawWasteWarning = "Column 'Hao hụt' maps to waste_quantity";

  const item = normalizeRawIssue(rawWasteWarning, false, [sheet], 0);
  assert.equal(item.severity, "success");
  assert.equal(item.title, "✓ Hao hụt → waste_quantity");
  assert.equal(
    item.description,
    "Đã nhận diện và ánh xạ thành công vào trường lượng hao hụt.",
  );

  const detailMarkup = renderToStaticMarkup(
    <SheetFeedbackPanel
      sheet={sheet}
      validation={undefined}
      items={[item]}
    />,
  );
  assert.match(detailMarkup, /✓ Hao hụt → waste_quantity/);
  assert.match(detailMarkup, /feedback-success/);
  assert.match(detailMarkup, /badge-success/);
  assert.doesNotMatch(detailMarkup, /feedback-review/);
  assert.doesNotMatch(detailMarkup, /badge-review/);
});

// Test Case F: actual blocking required-field issue
test("F. actual blocking required-field issue renders blocking/error presentation", () => {
  const sheet = createMockSheet({
    columns: ["Ghi chú"],
    mapping: { "Ghi chú": "__unmapped__" },
  });
  const validation: SheetMappingValidation = {
    sheetId: sheet.id,
    sheetName: sheet.sheetName,
    mappedColumns: 0,
    totalColumns: 1,
    unresolvedColumns: ["Ghi chú"],
    duplicateFields: [],
    missingCoreFields: ["date", "product", "quantity"],
    unknownSheetType: false,
    complete: false,
    fullyMapped: false,
  };

  const cardStatus = deriveSheetCardStatus(validation, []);
  assert.equal(cardStatus.status, "blocked");
  assert.equal(cardStatus.label, "Thiếu trường bắt buộc");
  assert.equal(cardStatus.iconText, "✕");
  assert.equal(cardStatus.badgeClass, "blocked");

  const importVal: ImportMappingValidation = {
    sheets: [validation],
    processableSheets: 1,
    ignoredSheets: 0,
    mappedColumns: 0,
    totalColumns: 1,
    unresolvedColumns: 1,
    incompleteSheets: 1,
    complete: false,
    fullyMapped: false,
  };

  const feedbackModel = buildImportFeedbackModel([], [], [sheet], importVal);
  assert.equal(feedbackModel.summary.hasBlockingIssues, true);
  assert.equal(feedbackModel.summary.canConfirm, false);

  const blockingItems = feedbackModel.items.filter((i) => i.severity === "blocking");
  assert.ok(blockingItems.length >= 3);

  const detailMarkup = renderToStaticMarkup(
    <SheetFeedbackPanel
      sheet={sheet}
      validation={validation}
      items={blockingItems}
    />,
  );
  assert.match(detailMarkup, /feedback-blocking/);
  assert.match(detailMarkup, /badge-blocking/);
  assert.match(detailMarkup, /Thiếu trường bắt buộc/);
});

// Test Case G: multiple issues across sheets
test("G. multiple issues across sheets produce one global summary banner instead of stacked alerts", () => {
  const sheet1 = createMockSheet({ id: "s1", sheetName: "POS_T7_2026" });
  const sheet2 = createMockSheet({
    id: "s2",
    sheetName: "README",
    sheetType: "unknown",
    columns: ["Info"],
  });
  const sheet3 = createMockSheet({
    id: "s3",
    sheetName: "NL_thực_dùng",
    sheetType: "usage_history",
  });
  const mappings = [sheet1, sheet2, sheet3];

  const val1: SheetMappingValidation = {
    sheetId: "s1",
    sheetName: "POS_T7_2026",
    mappedColumns: 4,
    totalColumns: 7,
    unresolvedColumns: ["Đơn giá bán", "Hết món?", "Ghi chú"],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: false,
    complete: true,
    fullyMapped: false,
  };
  const val2: SheetMappingValidation = {
    sheetId: "s2",
    sheetName: "README",
    mappedColumns: 0,
    totalColumns: 0,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: true,
    complete: true,
    fullyMapped: true,
  };
  const val3: SheetMappingValidation = {
    sheetId: "s3",
    sheetName: "NL_thực_dùng",
    mappedColumns: 5,
    totalColumns: 5,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: false,
    complete: true,
    fullyMapped: true,
  };

  const importVal: ImportMappingValidation = {
    sheets: [val1, val2, val3],
    processableSheets: 2,
    ignoredSheets: 1,
    mappedColumns: 9,
    totalColumns: 12,
    unresolvedColumns: 3,
    incompleteSheets: 0,
    complete: true,
    fullyMapped: false,
  };

  const rawWarnings = [
    "README: Sheet contains metadata/instructional text ('README') rather than transactional data.",
    "POS_T7_2026: Column 'Đơn giá bán' was not mapped to 'selling_price' because revenue and quantity are sufficient.",
    "POS_T7_2026: Column 'Hết món?' was not mapped to canonical schema",
    "NL_thực_dùng: Column 'Hao hụt' maps to waste_quantity",
  ];

  const model = buildImportFeedbackModel(rawWarnings, [], mappings, importVal);
  assert.equal(model.summary.totalSheets, 3);
  assert.equal(model.summary.recognizedSheets, 2);
  assert.equal(model.summary.hasBlockingIssues, false);
  assert.equal(model.summary.canConfirm, true);

  const bannerMarkup = renderToStaticMarkup(
    <ImportSummaryBanner summary={model.summary} onViewDetails={() => undefined} />,
  );

  // Exactly one banner container
  assert.equal((bannerMarkup.match(/class="import-summary-banner"/g) ?? []).length, 1);
  assert.match(bannerMarkup, /AI đã phân tích dữ liệu/);
  assert.match(bannerMarkup, /2\/3/);
  assert.match(bannerMarkup, /bảng đã được nhận diện/);
  assert.match(bannerMarkup, /mục/);
  assert.match(bannerMarkup, /cần bạn kiểm tra/);
  assert.match(bannerMarkup, /Xem chi tiết ↓/);
});

// Test Case H: raw technical message
test("H. raw technical message remains accessible in technical details", () => {
  const sheet = createMockSheet();
  const rawDiagnostic =
    "Column 'Đơn giá bán' was not mapped to 'selling_price' because revenue and quantity are sufficient.";

  const item = normalizeRawIssue(rawDiagnostic, false, [sheet], 0);
  assert.equal(item.rawMessage, rawDiagnostic);
  assert.equal(item.columnName, "Đơn giá bán");
  assert.equal(item.targetField, "selling_price");

  const markup = renderToStaticMarkup(
    <SheetFeedbackPanel
      sheet={sheet}
      validation={undefined}
      items={[item]}
    />,
  );

  assert.match(markup, /<details class="mapping-tech-details"/);
  assert.match(markup, /<summary>Xem chi tiết kỹ thuật<\/summary>/);
  assert.match(markup, /Thông điệp gốc:/);
  assert.match(markup, /because revenue and quantity are sufficient/);
  assert.match(markup, /Cột nguồn:/);
  assert.match(markup, /Đơn giá bán/);
  assert.match(markup, /Trường chuẩn:/);
  assert.match(markup, /selling_price/);
});

// Test Case I: tag anti-collision and responsive truncation
test("I. tag anti-collision: badges and filenames truncate gracefully with ellipsis instead of colliding", () => {
  const sheet = createMockSheet({
    sheetName: "PNK tháng 7",
    fileName: "03_INVENTORY_PURCHASE_snapshot_2026-09-16_SYNTHETIC (1).xlsx",
    rowCount: 20,
    sheetType: "inventory_purchase",
  });
  const validation: SheetMappingValidation = {
    sheetId: sheet.id,
    sheetName: sheet.sheetName,
    mappedColumns: 2,
    totalColumns: 5,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: ["purchase_date"],
    unknownSheetType: false,
    complete: false,
    fullyMapped: false,
  };
  const blockingItem = {
    id: "blocking-1",
    severity: "blocking" as const,
    title: "Thiếu trường bắt buộc: Ngày nhập hàng",
    description: "Cần ghép một cột nguồn với trường Ngày nhập hàng.",
    targetField: "purchase_date",
    sheetName: sheet.sheetName,
  };

  const markup = renderToStaticMarkup(
    <ImportSheetCard
      item={sheet}
      validation={validation}
      selected={false}
      onSelect={() => undefined}
      feedbackItems={[blockingItem]}
    />,
  );

  // 1. Structure: separate icon, text, and title tooltip
  assert.match(markup, /class="mapping-state blocked"/);
  assert.match(markup, /title="✕ Thiếu trường bắt buộc"/);
  assert.match(markup, /aria-label="✕ Thiếu trường bắt buộc"/);
  assert.match(markup, /<span class="mapping-state-icon" aria-hidden="true">✕<\/span>/);
  assert.match(markup, /<span class="mapping-state-text">Thiếu trường bắt buộc<\/span>/);

  // 2. Structured filename & row count
  assert.match(markup, /<span class="sheet-card-filename">03_INVENTORY_PURCHASE_snapshot_2026-09-16_SYNTHETIC \(1\)\.xlsx<\/span>/);
  assert.match(markup, /<span class="sheet-card-count"> · 20 dòng<\/span>/);

  // 3. CSS icon-only layout & tooltip guarantees
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /\.mapping-state\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.mapping-state\s*\{[\s\S]*?right:\s*12px/);
  assert.match(styles, /\.mapping-state\s*\{[\s\S]*?bottom:\s*10px/);
  assert.match(styles, /\.mapping-state\s*\{[\s\S]*?border-radius:\s*999px/);
  assert.match(styles, /\.mapping-state\s*\{[\s\S]*?cursor:\s*help/);
  assert.match(styles, /\.mapping-state-icon\s*\{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(styles, /\.mapping-state-text\s*\{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  assert.match(styles, /\.sheet-card-meta\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(styles, /\.sheet-card em\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(styles, /\.sheet-card-filename\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
});

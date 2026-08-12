import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ImportSheetCard,
  ImportStepper,
  ImportView,
  importSteps,
} from "../app/views/ImportView.tsx";
import type { SheetMappingValidation } from "../lib/ingestion.ts";
import type { EditableSheetMapping } from "../lib/types.ts";

function renderDraft(files: File[], forecastHorizon = 7) {
  return renderToStaticMarkup(
    <ImportView
      store="Cửa hàng kiểm thử"
      defaultStoreId="STORE_TEST"
      defaultForecastDate="2026-07-31"
      defaultForecastHorizon={forecastHorizon}
      connection={{ service: "online", llm: "online" }}
      files={files}
      setFiles={() => undefined}
      onRefreshConnection={async () => undefined}
      onImported={async () => undefined}
    />,
  );
}

test("import draft files remain visible when the view is rendered again", () => {
  const files = [
    new File(["date,product,quantity"], "POS_T7_2026.csv", {
      type: "text/csv",
      lastModified: 1_785_520_800_000,
    }),
  ];
  const beforeTabChange = renderDraft(files);
  const afterTabChange = renderDraft(files);

  assert.match(beforeTabChange, /POS_T7_2026\.csv/);
  assert.match(afterTabChange, /POS_T7_2026\.csv/);
});

test("import controls cap horizon at seven days and accept xlsm files", () => {
  const markup = renderDraft([], 90);
  assert.match(markup, /max="7"/);
  assert.match(markup, /value="7"/);
  assert.match(markup, /accept="\.xlsx,\.xls,\.xlsm,\.csv"/);
});

test("failed imports expose only a retained-file new-import flow", () => {
  const source = readFileSync(
    new URL("../app/views/ImportView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /phase === "failed"[\s\S]*Tạo lần nhập mới/);
  assert.match(source, /onClick=\{resetImport\}/);
  assert.match(source, /if \(!beginAction\("process"\)\) return/);
  assert.match(source, /selectedValidation\?\.unknownSheetType/);
  assert.doesNotMatch(
    source,
    /Kho, công thức và kế hoạch đã được cập nhật/,
  );
});

test("slow imports remain resumable and only backend failed is terminal", () => {
  const source = readFileSync(
    new URL("../app/views/ImportView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /function importStillProcessing/);
  assert.match(source, /const stillProcessing = importStillProcessing\(caught\)/);
  assert.match(source, /setPhase\("processing"\)/);
  assert.match(source, /normalizedImportStatus\(response\.status\) === "failed"/);
  assert.doesNotMatch(source, /nextErrors\.length \|\|/);
  assert.doesNotMatch(
    source,
    /catch \(caught\) \{[\s\S]{0,500}setPhase\("failed"\)/,
  );
});

test("the import view stays mounted while another navigation tab is active", () => {
  const source = readFileSync(
    new URL("../app/ShelfCashApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<section hidden=\{page !== "import"\}/);
  assert.match(source, /<ImportView[\s\S]*files=\{importDraftFiles\}/);
  assert.doesNotMatch(
    source,
    /page === "import"\s*\?\s*\(\s*<ImportView/,
  );
});

test("long sheet-card metadata and mapping status retain separate, labelled regions", () => {
  const item: EditableSheetMapping = {
    id: "long-file",
    profile: {},
    sheetName: "POS_T7_2026",
    fileName:
      "01_POS_Export_2026_fixed_filename_that_must_remain_readable.xlsx",
    sheetType: "sales_history",
    rowCount: 1_075,
    columns: ["Ngày", "Số lượng"],
    sampleRows: [],
    confidence: null,
    source: "rule",
    mapping: {},
    targetFields: [],
  };
  const validation: SheetMappingValidation = {
    sheetId: item.id,
    sheetName: item.sheetName,
    mappedColumns: 2,
    totalColumns: 2,
    unresolvedColumns: [],
    duplicateFields: [],
    missingCoreFields: [],
    unknownSheetType: false,
    complete: true,
    fullyMapped: true,
  };
  const markup = renderToStaticMarkup(
    <ImportSheetCard
      item={item}
      validation={validation}
      selected={false}
      onSelect={() => undefined}
    />,
  );
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.ok(markup.includes(`title="${item.fileName} ·`));
  assert.match(markup, /Lịch sử bán hàng/);
  assert.match(markup, /Đã ghép đủ/);
  assert.match(markup, /sheet-card-content/);
  assert.match(markup, /sheet-card-meta/);
  assert.match(
    styles,
    /\.sheet-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/,
  );
  assert.match(styles, /\.sheet-card-content\s*\{\s*min-width:\s*0/);
  assert.match(styles, /\.sheet-card strong,[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*?\.sheet-grid/);
});

test("import stepper exposes all four labelled steps and a narrow vertical layout", () => {
  const markup = renderToStaticMarkup(<ImportStepper activeStep={1} />);
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.equal(importSteps.length, 4);
  for (const step of importSteps) assert.match(markup, new RegExp(step));
  assert.match(markup, /aria-current="step"/);
  assert.equal((markup.match(/step-connector/g) ?? []).length, 3);
  assert.doesNotMatch(styles, /\.step-track li::after/);
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.step-track\s*\{\s*display:\s*grid/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.step-connector\s*\{\s*display:\s*none/,
  );
});

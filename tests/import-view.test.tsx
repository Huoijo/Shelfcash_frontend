import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportView } from "../app/views/ImportView.tsx";

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
  assert.match(afterTabChange, /1 tệp đang được giữ trong phiên làm việc/);
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

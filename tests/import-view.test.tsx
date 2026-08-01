import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportView } from "../app/views/ImportView.tsx";

function renderDraft(files: File[]) {
  return renderToStaticMarkup(
    <ImportView
      store="Cửa hàng kiểm thử"
      defaultStoreId="STORE_TEST"
      defaultForecastDate="2026-07-31"
      defaultForecastHorizon={7}
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

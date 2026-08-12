import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ForecastChart } from "../app/components/ForecastChart.tsx";
import { InventoryView } from "../app/views/InventoryView.tsx";
import { TodayView } from "../app/views/TodayView.tsx";
import { emptyBackendPlan } from "../lib/contract-adapters.ts";
import { buildEmptyBootstrapData } from "../lib/data.ts";
import type {
  EnrichedInventoryItem,
  ForecastResult,
  InventoryLot,
} from "../lib/types.ts";

function lot(
  lotId: string,
  expiryDate: string,
  status: InventoryLot["status"],
  version: number,
): InventoryLot {
  return {
    lotId,
    ingredientId: "ingredient-cocoa",
    supplierId: "supplier-1",
    ingredient: "Bột cacao",
    sku: "NL-CACAO",
    unit: "kg",
    onHand: status === "stockout" ? 0 : 2,
    usableQuantity: status === "expired" ? 0 : 2,
    expiringQuantity: status === "expiring" ? 2 : 0,
    expiredQuantity: status === "expired" ? 2 : 0,
    unitCost: 120_000,
    receivedDate: "2026-07-01",
    expiryDate,
    supplier: "Nhà cung cấp A",
    status,
    lastCounted: "2026-08-04T08:00:00+07:00",
    version,
  };
}

function fixture() {
  const data = buildEmptyBootstrapData("STORE_TEST", "Cửa hàng kiểm thử");
  const lots = [
    {
      ...lot("LOT-HEALTHY", "2026-09-15", "healthy", 7),
      batchId: "BATCH-HEALTHY",
    },
    {
      ...lot("LOT-EXPIRED", "2026-08-01", "expired", 3),
      batchId: "BATCH-EXPIRED",
    },
    {
      ...lot("LOT-EXPIRING", "2026-08-06", "expiring", 5),
      batchId: "BATCH-EXPIRING",
    },
  ];
  data.settings.remainingBudget = 2_000_000;
  data.settings.reservedBudget = 300_000;
  data.settings.spentBudget = 700_000;
  data.inventory = [
    {
      ingredientId: "ingredient-cocoa",
      ingredient: "Bột cacao",
      sku: "NL-CACAO",
      unit: "kg",
      onHand: 6,
      usableQuantity: 4,
      expiredQty: 2,
      lots,
      unitCost: 120_000,
      expiryDate: "2026-08-01",
      expiringQty: 2,
      safetyStock: 1,
      inbound: 0,
      supplier: "Nhà cung cấp A",
      leadTimeDays: 2,
      moq: 5,
      packSize: 5,
      capacity: 30,
      lastCounted: "2026-08-04T08:00:00+07:00",
      backendStatus: "expired",
    },
  ];
  const plan = emptyBackendPlan(data, "Cân bằng");
  plan.enrichedInventory = data.inventory.map(
    (item): EnrichedInventoryItem => ({
      ...item,
      averageDailyUsage: 0,
      daysSupply: 999,
      expiryDays: -3,
      countAgeDays: 0,
      statusKey: "expired",
      status: "Hết hạn",
      dataQuality: "Kiểm kho ngày 2026-08-04",
    }),
  );
  return { data, plan };
}

test("InventoryView keeps aggregate inventory drillable to FEFO lots and versions", () => {
  const { data, plan } = fixture();
  const html = renderToStaticMarkup(
    <InventoryView data={data} plan={plan} onOpenPlan={() => undefined} />,
  );

  assert.match(html, /Tình trạng lô/);
  assert.match(html, /Lô Bột cacao theo thứ tự FEFO/);
  assert.ok(html.indexOf("BATCH-EXPIRED") < html.indexOf("BATCH-EXPIRING"));
  assert.ok(html.indexOf("BATCH-EXPIRING") < html.indexOf("BATCH-HEALTHY"));
  assert.match(html, />v3</);
  assert.match(html, />v5</);
  assert.match(html, />v7</);
  assert.match(html, /Khả dụng/);
  assert.match(html, /Gần hạn/);
  assert.match(html, /Hết hạn/);
  assert.match(html, /BATCH-HEALTHY/);
});

test("TodayView renders real lot alerts and the backend planning state", () => {
  const { data, plan } = fixture();
  plan.status = "blocked";
  plan.failureCode = "MODEL_NOT_READY";
  plan.failureMessage = "Mô hình của cửa hàng chưa sẵn sàng.";
  const html = renderToStaticMarkup(
    <TodayView data={data} plan={plan} onNavigate={() => undefined} />,
  );

  assert.match(html, /Bột cacao: 2 kg đã hết hạn/);
  assert.match(html, /Bột cacao: 2 kg gần hết hạn/);
  assert.match(html, /Chưa thể lập kế hoạch/);
  assert.match(html, /Mô hình của cửa hàng chưa sẵn sàng/);
  assert.doesNotMatch(html, /Kế hoạch nhập dự kiến/);
});

test("ForecastChart identifies products and shades persisted interval bounds", () => {
  const forecast: ForecastResult = {
    productId: "product-cocoa",
    product: "Cacao đá",
    ingredient: "",
    unit: "ly",
    history: [{ date: "2026-08-03", actual: 8 }],
    forecast: [
      {
        date: "2026-08-04",
        p25: 7,
        p50: 10,
        p75: 13,
        intervalLower: 5,
        intervalUpper: 15,
      },
    ],
    totals: { p25: 7, p50: 10, p75: 13 },
    drivers: [],
    confidence: "Tốt",
    dataNotes: [],
  };
  const html = renderToStaticMarkup(<ForecastChart forecast={forecast} />);
  const source = readFileSync(
    new URL("../app/components/ForecastChart.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /aria-label="Biểu đồ số liệu thực tế và dự báo cho Cacao đá, đơn vị ly\. P25 là nhu cầu thấp, P50 là mức trung tâm và P75 là nhu cầu cao\."/,
  );
  assert.match(html, /data-forecast-series-id="product-cocoa"/);
  assert.match(source, /dataKey="confidenceRange"/);
  assert.match(source, /point\.intervalLower/);
  assert.match(source, /point\.intervalUpper/);
  assert.doesNotMatch(source, /dataKey="p25"/);
  assert.doesNotMatch(source, /dataKey="p75"/);
});

test("inventory surfaces contain no retired low, normal, or overstock states", () => {
  const source = ["InventoryView.tsx", "TodayView.tsx"]
    .map((file) =>
      readFileSync(new URL(`../app/views/${file}`, import.meta.url), "utf8"),
    )
    .join("\n");

  assert.doesNotMatch(source, /statusKey === "low"/);
  assert.doesNotMatch(source, /"overstock"/);
  assert.doesNotMatch(source, /"normal"/);
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { POST as exportOrder } from "../app/api/export/route.ts";
import { GET as sampleWorkbook } from "../app/api/sample/route.ts";
import { detectDataType, inferMapping } from "../lib/logic.ts";
import type { PurchaseOrder } from "../lib/types.ts";

const draftOrder: PurchaseOrder = {
  poId: "PO-TEST-1",
  supplierId: "SUP-1",
  supplier: "Nhà cung cấp A",
  orderDate: "2026-08-04",
  deliveryDate: "2026-08-06",
  strategy: "Cân bằng",
  status: "draft",
  version: 1,
  total: 384_000,
  budgetAfter: 2_116_000,
  lines: [
    {
      recommendationId: "REC-1",
      ingredientId: "ING-MILK",
      supplierId: "SUP-1",
      ingredient: "Sữa tươi",
      unit: "lít",
      status: "Sử dụng được",
      statusKey: "healthy",
      onHand: 4,
      usableStock: 4,
      forecastDemand: 12,
      safetyStock: 2,
      inbound: 0,
      recommendedQty: 10,
      orderQty: 12,
      unitCost: 32_000,
      cost: 384_000,
      supplier: "Nhà cung cấp A",
      moq: 12,
      packSize: 12,
      leadTimeDays: 2,
      expiryRiskQty: 0,
      capacityWarning: false,
      reason: "Khuyến nghị đã persist từ backend.",
    },
  ],
};

test("sample workbook remains a download aid and its sheets can be inferred locally", async () => {
  const response = await sampleWorkbook();
  assert.equal(response.status, 200);
  const bytes = await response.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });

  assert.deepEqual(workbook.SheetNames, [
    "Bán hàng",
    "Kiểm kho",
    "Nhập kho",
    "Công thức",
    "06_Menu",
  ]);

  const salesSheet = workbook.Sheets["Bán hàng"];
  assert.ok(salesSheet);
  const [salesHeaders] = XLSX.utils.sheet_to_json<Array<string>>(salesSheet, {
    header: 1,
  });
  assert.ok(salesHeaders);
  assert.equal(detectDataType(salesHeaders).type, "sales");
  assert.deepEqual(inferMapping(salesHeaders, "sales"), {
    "Ngày GD": "date",
    "Tên hàng": "product",
    SL: "quantity",
    Giá: "unitPrice",
    "Ghi chú": "ignore",
  });
});

test("draft orders export to non-empty Excel and PDF files without local order generation", async () => {
  for (const format of ["xlsx", "pdf"] as const) {
    const response = await exportOrder(
      new Request("http://localhost/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: draftOrder, format }),
      }),
    );
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.byteLength > 500);
    if (format === "pdf") {
      assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
    } else {
      const workbook = XLSX.read(bytes, { type: "array" });
      assert.deepEqual(workbook.SheetNames, ["Đơn đặt hàng"]);
    }
  }
});

test("frontend mock import, plan and order API routes are retired", () => {
  for (const route of ["import", "plan", "orders"]) {
    const routeFile = new URL(`../app/api/${route}/route.ts`, import.meta.url);
    assert.equal(
      existsSync(routeFile),
      false,
      `/api/${route} must not bypass the canonical ShelfCash proxy`,
    );
  }
  assert.equal(
    existsSync(new URL("../app/api/shelfcash/[...path]/route.ts", import.meta.url)),
    true,
  );
});

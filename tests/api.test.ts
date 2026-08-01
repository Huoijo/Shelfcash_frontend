import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { POST as exportOrder } from "../app/api/export/route.ts";
import { POST as importWorkbook } from "../app/api/import/route.ts";
import { POST as createOrders } from "../app/api/orders/route.ts";
import { POST as calculatePlan } from "../app/api/plan/route.ts";
import { GET as sampleWorkbook } from "../app/api/sample/route.ts";
import { buildBootstrapData } from "../lib/data.ts";
import { buildPlan } from "../lib/logic.ts";
import type { PurchaseOrder } from "../lib/types.ts";

test("plan and order endpoints return usable data", async () => {
  const data = buildBootstrapData();
  const planResponse = await calculatePlan(
    new Request("http://localhost/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data, strategy: "Cân bằng" }),
    }),
  );
  assert.equal(planResponse.status, 200);
  const plan = (await planResponse.json()) as ReturnType<typeof buildPlan>;
  assert.ok(plan.recommendations.length > 0);

  const ordersResponse = await createOrders(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recommendations: plan.recommendations,
        strategy: "Cân bằng",
        today: data.today,
        remainingBudget: data.settings.remainingBudget,
      }),
    }),
  );
  assert.equal(ordersResponse.status, 200);
  const payload = (await ordersResponse.json()) as {
    orders: PurchaseOrder[];
  };
  assert.ok(payload.orders.length > 0);
});

test("Excel and PDF order exports are non-empty", async () => {
  const data = buildBootstrapData();
  const plan = buildPlan(data, "Cân bằng");
  const ordersResponse = await createOrders(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recommendations: plan.recommendations,
        strategy: "Cân bằng",
        today: data.today,
        remainingBudget: data.settings.remainingBudget,
      }),
    }),
  );
  const { orders } = (await ordersResponse.json()) as {
    orders: PurchaseOrder[];
  };
  const order = orders[0];
  assert.ok(order);

  for (const format of ["xlsx", "pdf"] as const) {
    const response = await exportOrder(
      new Request("http://localhost/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order, format }),
      }),
    );
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 800);
  }
});

test("sample workbook and import parser preserve multiple sheets", async () => {
  const sample = await sampleWorkbook();
  assert.equal(sample.status, 200);
  const bytes = await sample.arrayBuffer();
  assert.ok(bytes.byteLength > 1_000);

  const form = new FormData();
  form.append(
    "file",
    new File([bytes], "shelfcash_du_lieu_mau.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const parsedResponse = await importWorkbook(
    new Request("http://localhost/api/import", {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(parsedResponse.status, 200);
  const parsed = (await parsedResponse.json()) as {
    sheets: Array<{ name: string; rowCount: number }>;
  };
  assert.equal(parsed.sheets.length, 5);
  assert.ok(parsed.sheets.every((sheet) => sheet.rowCount > 0));

  const workbook = XLSX.read(bytes, { type: "array" });
  assert.equal(workbook.SheetNames.length, 5);
});

test("UTF-8 CSV headers are detected correctly", async () => {
  const csv = [
    "Tên nguyên liệu,Tồn kho,Đơn vị,Hạn sử dụng",
    "Sữa tươi,9,lít,03/08/2026",
  ].join("\n");
  const form = new FormData();
  form.append(
    "file",
    new File([csv], "inventory.csv", { type: "text/csv;charset=utf-8" }),
  );
  const response = await importWorkbook(
    new Request("http://localhost/api/import", {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(response.status, 200);
  const parsed = (await response.json()) as {
    sheets: Array<{ detectedType: string; confidence: number }>;
  };
  assert.equal(parsed.sheets[0]?.detectedType, "inventory");
  assert.ok((parsed.sheets[0]?.confidence ?? 0) >= 0.7);
});

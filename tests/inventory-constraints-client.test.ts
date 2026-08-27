import assert from "node:assert/strict";
import test from "node:test";
import { getInventoryConstraints, saveSupplierConstraint } from "../lib/shelfcash-client.ts";

test("inventory constraints use proxy URL and omit empty query values", async () => {
  const original = globalThis.fetch;
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return Response.json([{ constraint_id: "c1", store_id: "s1", ingredient_id: "i1", constraint_type: "safety_stock", value: "0", unit: "kg", effective_date: null, end_date: null, version: 2, active: true }]);
  };
  try {
    const rows = await getInventoryConstraints({ storeId: "s1", constraintType: "safety_stock", ingredientId: null, asOfDate: "" });
    assert.equal(url, "/api/shelfcash/api/v1/stores/s1/inventory-constraints?constraint_type=safety_stock");
    assert.equal(rows[0]?.value, "0");
  } finally { globalThis.fetch = original; }
});

test("supplier request payload is whitelisted", async () => {
  const original = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_input, init) => { body = String(init?.body); return Response.json({}); };
  try {
    await saveSupplierConstraint({ storeId: "s1", payload: { supplier_id: "sup", ingredient_id: "ing", unit_cost: 1, moq: 2, pack_size: 3, lead_time_days: 4, shelf_life_days: 7, safety_stock: 99, maximum_stock: 100, storage_capacity: 200 } });
    const payload = JSON.parse(body) as Record<string, unknown>;
    assert.equal(payload.shelf_life_days, 7);
    assert.equal(payload.safety_stock, undefined);
    assert.equal(payload.maximum_stock, undefined);
    assert.equal(payload.storage_capacity, undefined);
  } finally { globalThis.fetch = original; }
});

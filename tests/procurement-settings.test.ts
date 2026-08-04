import assert from "node:assert/strict";
import test from "node:test";
import { buildProcurementSettingsRows } from "../lib/procurement-settings.ts";
import type { InventoryConstraint, SupplierConstraintRow } from "../lib/types.ts";

const suppliers: SupplierConstraintRow[] = [
  { ingredientId: "ing-1", ingredient: "Milk", supplier: "A", unitCost: 1, moq: 2, packSize: 2, leadTimeDays: 1 },
  { ingredientId: "ing-1", ingredient: "Milk", supplier: "B", unitCost: 2, moq: 3, packSize: 3, leadTimeDays: 2 },
  { ingredientId: "ing-2", ingredient: "Same name", supplier: "C", unitCost: 1, moq: 1, packSize: 1, leadTimeDays: 1 },
];

const constraint = (patch: Partial<InventoryConstraint>): InventoryConstraint => ({
  constraintId: "c-1", storeId: "store-1", ingredientId: "ing-1",
  ingredientName: "Milk", constraintType: "safety_stock", value: 0,
  unit: "l", effectiveDate: "2026-08-03", endDate: null, version: 1,
  active: true, ...patch,
});

test("joins inventory policies by ingredient id without duplicating per supplier", () => {
  const rows = buildProcurementSettingsRows(suppliers, [
    constraint({ value: 0 }),
    constraint({ constraintId: "max", constraintType: "maximum_stock", value: 20 }),
    constraint({ constraintId: "store", ingredientId: null, constraintType: "storage_capacity", value: 100 }),
    constraint({ constraintId: "wrong-name", ingredientId: "ing-x", ingredientName: "Same name", value: 9 }),
  ]);
  const milk = rows.find((row) => row.ingredientId === "ing-1");
  assert.equal(milk?.supplierTerms.length, 2);
  assert.equal(milk?.safetyStock?.value, 0);
  assert.equal(milk?.maximumStock?.value, 20);
  assert.equal(rows.filter((row) => row.safetyStock?.constraintId === "c-1").length, 1);
  assert.equal(rows.find((row) => row.ingredientId === "ing-2")?.safetyStock, null);
  assert.equal(rows.some((row) => row.ingredientId === ""), false);
  assert.equal(rows.find((row) => row.ingredientId === "ing-2")?.safetyStock?.value, undefined);
});

test("missing safety stock remains null", () => {
  const [row] = buildProcurementSettingsRows([suppliers[0]!], []);
  assert.equal(row?.safetyStock, null);
});

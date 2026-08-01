import assert from "node:assert/strict";
import test from "node:test";
import { buildBootstrapData } from "../lib/data.ts";
import {
  buildPlan,
  createPurchaseOrders,
  evaluateAdjustedOrders,
  roundOrderQuantity,
} from "../lib/logic.ts";

test("forecast quantiles stay ordered", () => {
  const data = buildBootstrapData();
  const plan = buildPlan(data, "Cân bằng");
  for (const forecast of Object.values(plan.forecasts)) {
    assert.ok(forecast.totals.p25 <= forecast.totals.p50);
    assert.ok(forecast.totals.p50 <= forecast.totals.p75);
    for (const point of forecast.forecast) {
      assert.ok((point.p25 ?? 0) <= (point.p50 ?? 0));
      assert.ok((point.p50 ?? 0) <= (point.p75 ?? 0));
    }
  }
});

test("order rounding respects MOQ and pack size", () => {
  assert.equal(roundOrderQuantity(17, 12, 12), 24);
  assert.equal(roundOrderQuantity(2, 5, 5), 5);
  assert.equal(roundOrderQuantity(0, 12, 12), 0);
});

test("adjusting below demand produces a warning", () => {
  const data = buildBootstrapData();
  const plan = buildPlan(data, "An toàn");
  const adjusted = plan.recommendations.map((item) => ({
    ...item,
    orderQty: 0,
  }));
  assert.ok(evaluateAdjustedOrders(adjusted).length > 0);
});

test("draft orders are grouped by supplier", () => {
  const data = buildBootstrapData();
  const plan = buildPlan(data, "Cân bằng");
  const orders = createPurchaseOrders(
    plan.recommendations,
    "Cân bằng",
    data.today,
    data.settings.remainingBudget,
  );
  assert.ok(orders.length > 0);
  for (const order of orders) {
    assert.equal(new Set(order.lines.map((line) => line.supplier)).size, 1);
    assert.equal(order.lines[0]?.supplier, order.supplier);
  }
});

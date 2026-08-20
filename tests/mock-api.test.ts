import assert from "node:assert/strict";
import test from "node:test";
import { handleMockApiRequest } from "../lib/mock-service.ts";

test("Mock API handles decision brief and returns rich 10-ingredient happy path", async () => {
  const response = await handleMockApiRequest("/api/v1/decision-runs/run-1/brief", "GET");
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.status, "completed");
  assert.equal(data.recommendation.strategy, "protected");
  assert.equal(data.recommendation.total_purchase_cost, 8_338_000);
  assert.equal(data.ingredient_demand.length, 10);
  assert.equal(data.procurement_rows.length, 9);
});

test("Mock API handles contextual explanation requests", async () => {
  const response = await handleMockApiRequest(
    "/api/v1/decision-runs/run-1/explanation",
    "POST",
    JSON.stringify({ question: "Tại sao chọn kế hoạch này?" })
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.answer, /Chiến lược An toàn/);
});

test("Mock API handles What-If simulation with calculated deltas", async () => {
  const response = await handleMockApiRequest(
    "/api/v1/decision-runs/run-1/what-if",
    "POST",
    JSON.stringify({ demand_multiplier: 1.2, supplier_delay_days: 2 })
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.comparison.purchase_cost_delta > 0);
  assert.match(data.grounded_explanation.answer, /chi phí nhập hàng/);
});

test("Mock API handles Menu endpoint and returns 12 items including combos", async () => {
  const response = await handleMockApiRequest("/api/v1/stores/STORE_001/menu", "GET");
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.ok(Array.isArray(data.items));
  assert.equal(data.items.length, 12);

  const singles = data.items.filter((i: any) => i.item_type === "single");
  const combos = data.items.filter((i: any) => i.item_type === "combo");
  assert.equal(singles.length, 10);
  assert.equal(combos.length, 2);

  const matcha = data.items.find((i: any) => i.product_id === "PROD_MATCHA_LATTE");
  assert.ok(matcha);
  assert.equal(matcha.price, 49_000);

  const comboFriends = data.items.find((i: any) => i.product_id === "COMBO_FRIENDS");
  assert.ok(comboFriends);
  assert.equal(comboFriends.components.length, 3);
  assert.equal(comboFriends.price, 119_000);
  assert.equal(comboFriends.list_price, 139_000);
  assert.equal(comboFriends.savings_amount, 20_000);
});

test("Mock API handles Recipe retrieval and updates", async () => {
  const getRes = await handleMockApiRequest(
    "/api/v1/stores/STORE_001/products/PROD_MATCHA_LATTE/recipe",
    "GET"
  );
  assert.equal(getRes.status, 200);
  const recipeData = await getRes.json();
  assert.equal(recipeData.product_id, "PROD_MATCHA_LATTE");
  assert.ok(recipeData.lines.length >= 4);

  const putRes = await handleMockApiRequest(
    "/api/v1/stores/STORE_001/products/PROD_MATCHA_LATTE/recipe",
    "PUT",
    JSON.stringify({
      effective_from: "2026-08-25",
      yield_quantity: 2,
      process_loss_rate: 0.03,
      lines: [
        { ingredient_id: "matcha-powder", ingredient: "Bột matcha", quantity: 0.016, unit: "kg" },
      ],
    })
  );
  assert.equal(putRes.status, 200);
  const updated = await putRes.json();
  assert.equal(updated.version, 2);
  assert.equal(updated.effective_from, "2026-08-25");
});

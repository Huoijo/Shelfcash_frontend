import assert from "node:assert/strict";
import test from "node:test";
import {
  detectDataType,
  inferField,
  inferMapping,
  normalizeText,
} from "../lib/logic.ts";

test("Vietnamese import headers normalize deterministically", () => {
  assert.equal(normalizeText("  Nguyên_liệu-ĐẶC BIỆT  "), "nguyen lieu dac biet");
  assert.equal(inferField("Ngày bán"), "date");
  assert.equal(inferField("Tên nguyên liệu"), "ingredient");
  assert.equal(inferField("Hạn sử dụng"), "expiryDate");
  assert.equal(inferField("Cột không xác định"), null);
});

test("mapping inference uses only fields allowed by the selected schema", () => {
  const headers = [
    "Ngày bán",
    "Tên sản phẩm",
    "Số lượng",
    "Giá bán",
    "Nhà cung cấp",
    "Ghi chú",
  ];

  assert.deepEqual(inferMapping(headers, "sales"), {
    "Ngày bán": "date",
    "Tên sản phẩm": "product",
    "Số lượng": "quantity",
    "Giá bán": "unitPrice",
    "Nhà cung cấp": "ignore",
    "Ghi chú": "ignore",
  });
});

test("mapping inference never maps two source columns to one target", () => {
  const mapping = inferMapping(
    ["Số lượng", "SL", "Tên nguyên liệu", "Đơn vị"],
    "inventory",
  );
  assert.equal(mapping["Số lượng"], "ignore");
  assert.equal(mapping.SL, "ignore");
  assert.equal(mapping["Tên nguyên liệu"], "ingredient");
  assert.equal(mapping["Đơn vị"], "unit");
  assert.equal(
    Object.values(mapping).filter((field) => field === "ingredient").length,
    1,
  );
});

test("sheet detection distinguishes canonical operational inputs from unknown sheets", () => {
  const inventory = detectDataType([
    "Tên nguyên liệu",
    "Tồn kho",
    "Đơn vị",
    "Hạn sử dụng",
  ]);
  assert.equal(inventory.type, "inventory");
  assert.ok(inventory.confidence >= 0.7);

  const recipe = detectDataType([
    "Tên sản phẩm",
    "Tên nguyên liệu",
    "Định lượng",
    "Đơn vị",
  ]);
  assert.equal(recipe.type, "recipes");
  assert.ok(recipe.confidence >= 0.7);

  assert.deepEqual(detectDataType(["README", "Hướng dẫn"]), {
    type: "other",
    confidence: 0,
  });
});

test("local forecasting, planning and PO generators are no longer exported", async () => {
  const logic = await import("../lib/logic.ts");
  assert.equal("buildForecasts" in logic, false);
  assert.equal("buildPlan" in logic, false);
  assert.equal("createPurchaseOrders" in logic, false);
  assert.equal("evaluateAdjustedOrders" in logic, false);
});

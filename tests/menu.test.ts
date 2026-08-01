import assert from "node:assert/strict";
import test from "node:test";
import {
  componentSignature,
  componentsPayload,
  createMenuPayload,
  normalizeMenuItems,
  patchMenuPayload,
  summarizeMenu,
  validateMenuDraft,
} from "../lib/menu.ts";
import type { MenuItemDraft } from "../lib/types.ts";

const items = normalizeMenuItems({
  items: [
    {
      product_id: "single-1",
      sku: "MON-001",
      product: "Sinh tố chuối",
      item_type: "single",
      selling_unit: "ly",
      list_price: 35_000,
      price: 35_000,
      status: "active",
      currency: "VND",
      components: [],
      version: 1,
    },
    {
      product_id: "single-2",
      sku: "MON-002",
      product: "Cà phê sữa",
      item_type: "single",
      selling_unit: "ly",
      price: 29_000,
      status: "active",
      components: [],
      version: 2,
    },
    {
      product_id: "combo-1",
      sku: "CMB-001",
      product: "Combo Cặp Đôi",
      item_type: "combo",
      selling_unit: "combo",
      price: 58_000,
      status: "active",
      components: [
        {
          component_product_id: "single-1",
          sku: "MON-001",
          product: "Sinh tố chuối",
          quantity: 1,
          selling_unit: "ly",
          unit_price: 35_000,
          line_list_price: 35_000,
        },
        {
          component_product_id: "single-2",
          sku: "MON-002",
          product: "Cà phê sữa",
          quantity: 1,
          selling_unit: "ly",
          unit_price: 29_000,
          line_list_price: 29_000,
        },
      ],
      version: 3,
    },
  ],
});

test("Menu adapter preserves products, components and derived prices", () => {
  assert.equal(items.length, 3);
  assert.equal(items[2]?.itemType, "combo");
  assert.equal(items[2]?.components.length, 2);
  assert.equal(items[2]?.listPrice, 64_000);
  assert.equal(items[2]?.savingsAmount, 6_000);
  assert.equal(
    Number((items[2]?.discountRate ?? 0).toFixed(6)),
    0.09375,
  );
  assert.deepEqual(summarizeMenu(items), {
    singleCount: 2,
    comboCount: 1,
    activeCount: 3,
    inactiveCount: 0,
  });
});

test("Menu create, patch and component payloads match the contract", () => {
  const draft: MenuItemDraft = {
    sku: "CMB-002",
    product: "Combo Buổi Sáng",
    itemType: "combo",
    sellingUnit: "combo",
    price: 60_000,
    status: "active",
    components: [
      { componentProductId: "single-1", quantity: 1 },
      { componentProductId: "single-2", quantity: 2 },
    ],
  };

  assert.deepEqual(createMenuPayload(draft), {
    sku: "CMB-002",
    product: "Combo Buổi Sáng",
    item_type: "combo",
    selling_unit: "combo",
    price: 60_000,
    status: "active",
    components: [
      { component_product_id: "single-1", quantity: 1 },
      { component_product_id: "single-2", quantity: 2 },
    ],
  });
  assert.deepEqual(patchMenuPayload(items[2]!, draft), {
    version: 3,
    product: "Combo Buổi Sáng",
    price: 60_000,
    status: "active",
  });
  assert.deepEqual(componentsPayload(4, draft.components), {
    version: 4,
    components: [
      { component_product_id: "single-1", quantity: 1 },
      { component_product_id: "single-2", quantity: 2 },
    ],
  });
  assert.equal(
    componentSignature(draft.components),
    componentSignature([...draft.components].reverse()),
  );
});

test("Menu validation blocks empty, duplicate and invalid combo components", () => {
  const draft: MenuItemDraft = {
    sku: "CMB-003",
    product: "Combo lỗi",
    itemType: "combo",
    sellingUnit: "combo",
    price: 50_000,
    status: "active",
    components: [
      { componentProductId: "single-1", quantity: 1 },
      { componentProductId: "single-1", quantity: 0 },
    ],
  };
  const issues = validateMenuDraft(
    draft,
    items.filter((item) => item.itemType === "single"),
  );
  assert.ok(issues.some((issue) => /xuất hiện một lần/i.test(issue)));
  assert.ok(issues.some((issue) => /số nguyên lớn hơn 0/i.test(issue)));

  const valid = {
    ...draft,
    components: [
      { componentProductId: "single-1", quantity: 1 },
      { componentProductId: "single-2", quantity: 1 },
    ],
  };
  assert.deepEqual(
    validateMenuDraft(
      valid,
      items.filter((item) => item.itemType === "single"),
    ),
    [],
  );
});

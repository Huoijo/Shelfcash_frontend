import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsView } from "../app/views/SettingsView.tsx";
import { buildBootstrapData } from "../lib/data.ts";
import type { BootstrapData } from "../lib/types.ts";

type SettingsTab =
  | "Nhà cung cấp"
  | "Ngưỡng tồn kho"
  | "Tên thay thế"
  | "Ngân sách & lịch"
  | "Lịch sử";

function renderInventory(
  value: number | string | undefined,
  error: string | null = null,
  initialTab: SettingsTab = "Ngưỡng tồn kho",
  configure?: (data: BootstrapData) => void,
) {
  const data = buildBootstrapData();
  Object.assign(data.settings, {
    reservedBudget: 400_000,
    spentBudget: 1_200_000,
    defaultStrategy: "safe",
    version: 4,
  });
  data.supplierConstraints = [{
    constraintId: "supplier-c", ingredientId: "ing-1", supplierId: "sup-1",
    ingredient: "Sữa", supplier: "Vendor", unitCost: 10, moq: 2,
    packSize: 2, leadTimeDays: 1, orderUnit: "thùng", baseUnit: "lít",
  }];
  configure?.(data);
  return renderToStaticMarkup(
    <SettingsView data={data} importLogs={[]} recipeVersions={[]}
      onSaveInventory={async () => true} onSaveAliases={async () => true}
      onSaveContext={async () => true} inventoryConstraintsError={error}
      inventoryConstraintsLoading={false} inventoryConstraints={value === undefined ? [] : [{
        constraintId: "inventory-c", storeId: "s", ingredientId: "ing-1",
        ingredientName: "Sữa", constraintType: "safety_stock", value,
        unit: "lít", effectiveDate: null, endDate: null, version: 1, active: true,
      }]} initialTab={initialTab} />,
  );
}

test("supplier settings do not render a safety-stock input or column", () => {
  const html = renderInventory(5, null, "Nhà cung cấp");
  assert.doesNotMatch(html, /aria-label="Tồn an toàn/);
  assert.doesNotMatch(html, /aria-label="Nhà cung cấp Sữa"/);
  assert.match(html, /ID sup-1/);
  assert.match(html, /Nhà cung cấp/);
  assert.match(html, /Ngưỡng tồn kho/);
});

test("inventory policy keeps zero distinct from missing and exposes partial error", () => {
  assert.match(renderInventory(0), />0 lít</);
  assert.doesNotMatch(renderInventory(0), /Chưa cấu hình ngưỡng tồn kho/);
  assert.match(renderInventory(undefined), /Chưa cấu hình/);
  assert.match(renderInventory(undefined, "Không tải được"), /Không tải được/);
});

test("budget state is read-only while horizon and default strategy remain editable", () => {
  const html = renderInventory(undefined, null, "Ngân sách & lịch");
  for (const label of [
    "Ngân sách đã giữ chỗ",
    "Ngân sách đã chi",
    "Ngân sách còn lại",
  ]) {
    const input = html.match(
      new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`),
    )?.[0];
    assert.ok(input, `missing ${label}`);
    assert.match(input, /readOnly=""/);
  }
  const horizonInput = html.match(
    /<input[^>]*aria-label="Số ngày dự báo"[^>]*>/,
  )?.[0];
  assert.ok(horizonInput);
  assert.match(horizonInput, /min="1"/);
  assert.match(horizonInput, /max="7"/);
  assert.match(html, /aria-label="Chiến lược mặc định"/);
  assert.match(html, /<option value="economy">Tiết kiệm<\/option>/);
  assert.match(html, /<option value="balanced">Cân bằng<\/option>/);
  assert.match(html, /<option value="safe" selected="">An toàn<\/option>/);
});

test("calendar exposes only supported holiday, promotion and promotion-note fields", () => {
  const html = renderInventory(undefined, null, "Ngân sách & lịch");
  assert.match(html, /aria-label="Ngày lễ [^"]+"/);
  assert.match(html, /aria-label="Khuyến mãi [^"]+"/);
  assert.match(html, /aria-label="Ghi chú khuyến mãi [^"]+"/);
});

test("alias choices come from the ingredient catalog even without inventory lots", () => {
  const html = renderInventory(
    undefined,
    null,
    "Tên thay thế",
    (data) => {
      data.inventory = [];
      data.ingredients = [
        {
          ingredientId: "ingredient-catalog-only",
          ingredient: "Nguyên liệu chỉ có trong danh mục",
          unit: "kg",
        },
      ];
      data.aliases = [
        {
          sourceName: "NL DANH MUC",
          canonicalName: "Nguyên liệu chỉ có trong danh mục",
          ingredientId: "ingredient-catalog-only",
        },
      ];
    },
  );
  assert.match(html, /Nguyên liệu chỉ có trong danh mục/);
});

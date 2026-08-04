import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsView } from "../app/views/SettingsView.tsx";
import { buildBootstrapData } from "../lib/data.ts";

function renderInventory(value: number | string | undefined, error: string | null = null, initialTab: "Nhà cung cấp" | "Ngưỡng tồn kho" = "Ngưỡng tồn kho") {
  const data = buildBootstrapData();
  data.supplierConstraints = [{
    constraintId: "supplier-c", ingredientId: "ing-1", supplierId: "sup-1",
    ingredient: "Sữa", supplier: "Vendor", unitCost: 10, moq: 2,
    packSize: 2, leadTimeDays: 1, orderUnit: "thùng", baseUnit: "lít",
  }];
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
  assert.match(html, /Nhà cung cấp/);
  assert.match(html, /Ngưỡng tồn kho/);
});

test("inventory policy keeps zero distinct from missing and exposes partial error", () => {
  assert.match(renderInventory(0), />0 lít</);
  assert.doesNotMatch(renderInventory(0), /Chưa cấu hình ngưỡng tồn kho/);
  assert.match(renderInventory(undefined), /Chưa cấu hình/);
  assert.match(renderInventory(undefined, "Không tải được"), /Không tải được/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipesView } from "../app/views/RecipesView.tsx";
import { adaptBootstrap } from "../lib/contract-adapters.ts";
import { buildEmptyBootstrapData } from "../lib/data.ts";
import { canEditDirectRecipe } from "../lib/recipes.ts";
import type { StoreBootstrapResponse } from "../lib/types.ts";
import { bootstrapRecipesComponentsFixture } from "./fixtures/bootstrap-recipes-components.ts";

function renderRecipes(
  options: {
    recipes?: StoreBootstrapResponse["recipes"];
    recipeYieldQuantity?: number;
    recipeProcessLossRate?: number;
  } = {
    recipes: bootstrapRecipesComponentsFixture.recipes,
  },
) {
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    recipes: options.recipes,
  });
  if (data.products[0]) {
    Object.assign(data.products[0], {
      recipeYieldQuantity: options.recipeYieldQuantity,
      recipeProcessLossRate: options.recipeProcessLossRate,
    });
  }
  return renderToStaticMarkup(
    <RecipesView
      data={data}
      versions={[]}
      onSave={async () => true}
      onOpenPlan={() => undefined}
    />,
  );
}

test("RecipesView shows ID-linked counts, backend metadata and ingredient options", () => {
  const html = renderRecipes();
  const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  for (const [product, count] of [
    ["Sản phẩm 1", 1],
    ["Sản phẩm 2", 2],
    ["Sản phẩm 3", 3],
    ["Sản phẩm 4", 4],
    ["Sản phẩm 5", 9],
  ] as const) {
    const productRow = tableRows.find((row) => row.includes(product));
    assert.ok(productRow);
    assert.match(productRow, new RegExp(`${count} nguyên liệu`));
  }
  assert.match(html, /Chọn một món để xem và chỉnh công thức/);
  assert.doesNotMatch(html, /aria-label="Nguyên liệu dòng 1"/);
});

test("RecipesView safely shows empty recipes without inventing metadata", () => {
  const html = renderRecipes({ recipes: undefined });
  assert.match(html, /0 nguyên liệu/);
  assert.doesNotMatch(html, /undefined\/undefined\/undefined/);
});

test("RecipesView can be remounted from application data without losing recipes", () => {
  const beforeTabChange = renderRecipes();
  const afterTabChange = renderRecipes();
  assert.equal(afterTabChange, beforeTabChange);
  assert.match(afterTabChange, /9 nguyên liệu/);
});

test("RecipesView does not crash when the bootstrap payload is malformed", () => {
  const data = adaptBootstrap(
    buildEmptyBootstrapData(),
    null as unknown as StoreBootstrapResponse,
  );
  assert.doesNotThrow(() =>
    renderToStaticMarkup(
      <RecipesView
        data={data}
        versions={[]}
        onSave={async () => true}
        onOpenPlan={() => undefined}
      />,
    ),
  );
});

test("RecipesView renders effective date, yield and process-loss controls from backend detail", () => {
  const source = readFileSync(
    new URL("../app/views/RecipesView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /aria-label="Ngày hiệu lực công thức"/);
  assert.match(source, /aria-label="Sản lượng công thức"/);
  assert.match(source, /aria-label="Tỷ lệ hao hụt công thức"/);
  assert.doesNotMatch(source, /Phiên bản trước/);
});

test("RecipesView passes the canonical recipe metadata and starts without a recipe at version zero", () => {
  const source = readFileSync(
    new URL("../app/views/RecipesView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /version: product\.recipeVersion \?\? 0/);
  assert.match(source, /effectiveFrom,/);
  assert.match(source, /yieldQuantity,/);
  assert.match(source, /processLossRate,/);
  assert.doesNotMatch(source, /productVersions/);
});

test("RecipesView excludes combo products and only opens direct recipes for single items", () => {
  const combo = {
    product_id: "COMBO_001",
    product: "Combo buổi sáng",
    sku: "CMB-001",
    price: 55_000,
    item_type: "combo",
    selling_unit: "combo",
    status: "active",
    version: 7,
    components: [
      {
        component_product_id: "PROD_001",
        product: "Sản phẩm 1",
        sku: "SP-001",
        quantity: 2,
        selling_unit: "ly",
      },
    ],
  };
  const singles = bootstrapRecipesComponentsFixture.products.map((item) => ({
    ...item,
    selling_unit: "ly",
    status: "active",
    version: 1,
    components: [],
  }));
  const data = adaptBootstrap(buildEmptyBootstrapData(), {
    ...bootstrapRecipesComponentsFixture,
    products: [combo, ...bootstrapRecipesComponentsFixture.products],
    menu: [combo, ...singles],
  });
  const html = renderToStaticMarkup(
    <RecipesView
      data={data}
      versions={[]}
      onSave={async () => true}
      onSaveComponents={async () => ({ saved: true })}
      onOpenPlan={() => undefined}
    />,
  );

  assert.doesNotMatch(html, /Combo buổi sáng/);
  assert.doesNotMatch(html, /Thành phần Combo/);
  assert.doesNotMatch(html, /Lưu thành phần Combo/);
  assert.match(html, /Sản phẩm 1/);
  assert.doesNotMatch(html, /Lưu công thức/);
  assert.equal(canEditDirectRecipe({ itemType: "combo" }), false);
  assert.equal(canEditDirectRecipe({ itemType: "single" }), true);
  assert.equal(canEditDirectRecipe({}), false);

  const source = readFileSync(
    new URL("../app/views/RecipesView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /data\.products\.filter\(\(item\) => item\.itemType === "single"\)/);
  assert.match(source, /Lưu công thức/);

  const appSource = readFileSync(
    new URL("../app/ShelfCashApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /!canEditDirectRecipe\(product\)/);
  assert.match(appSource, /caught\.code === "RECIPE_NOT_ALLOWED_FOR_COMBO"/);
});

test("RecipesView starts as a scan list and scrolls the selected recipe into focus", () => {
  const source = readFileSync(
    new URL("../app/views/RecipesView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useState\(""\)/);
  assert.match(source, /recipe-selected-detail/);
  assert.match(source, /detailAnchorRef\.current/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /--recipe-detail-scroll-gap/);
  assert.match(source, /Quay lại danh sách món/);
  assert.match(source, /Tiếp tục chọn món/);
  assert.ok(
    source.indexOf('className="recipe-selected-detail"') <
      source.indexOf('className="table-wrap product-table"'),
  );
});

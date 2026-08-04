import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipesView } from "../app/views/RecipesView.tsx";
import { adaptBootstrap } from "../lib/contract-adapters.ts";
import { buildEmptyBootstrapData } from "../lib/data.ts";
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
  assert.match(html, /01\/06\/2026/);
  assert.match(html, />v1</);

  const ingredientSelect = html.match(
    /<select[^>]*aria-label="Nguyên liệu dòng 1"[^>]*>(.*?)<\/select>/s,
  );
  assert.ok(ingredientSelect);
  assert.equal(ingredientSelect[1]?.match(/<option\b/g)?.length, 10);
  for (const ingredient of bootstrapRecipesComponentsFixture.ingredients ?? []) {
    assert.match(html, new RegExp(String(ingredient.ingredient)));
  }
});

test("RecipesView safely shows empty recipes without inventing metadata", () => {
  const html = renderRecipes({ recipes: undefined });
  assert.match(html, /0 nguyên liệu/);
  assert.match(html, />Chưa có</);
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
  const html = renderRecipes({
    recipes: bootstrapRecipesComponentsFixture.recipes,
    recipeYieldQuantity: 2,
    recipeProcessLossRate: 0.05,
  });

  assert.match(html, /aria-label="Ngày hiệu lực công thức"/);
  assert.match(
    html,
    /aria-label="Sản lượng công thức"[^>]*value="2"/,
  );
  assert.match(
    html,
    /aria-label="Tỷ lệ hao hụt công thức"[^>]*value="0\.05"/,
  );
  assert.doesNotMatch(html, /Phiên bản trước/);
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

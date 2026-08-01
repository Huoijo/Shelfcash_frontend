import type {
  Ingredient,
  InventoryItem,
  Product,
  RecipeLine,
} from "./types";

export function normalizedEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stableEntityName(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/\s+/g, " ")
    .trim();
}

export function recipeMatchesProduct(
  line: RecipeLine,
  product: Product,
): boolean {
  if (line.productId && product.productId) {
    return line.productId === product.productId;
  }
  return (
    Boolean(line.product && product.product) &&
    normalizedEntityName(line.product) ===
      normalizedEntityName(product.product)
  );
}

export function recipeLinesForProduct(
  lines: RecipeLine[],
  product: Product | undefined,
): RecipeLine[] {
  if (!product) return [];
  return lines.filter((line) => recipeMatchesProduct(line, product));
}

export function productIdentityKey(product: Product): string {
  return product.productId
    ? `id:${product.productId}`
    : `name:${stableEntityName(product.product)}`;
}

export function ingredientIdentityKey(
  ingredient: Pick<Ingredient, "ingredientId" | "ingredient">,
): string {
  return ingredient.ingredientId
    ? `id:${ingredient.ingredientId}`
    : `name:${stableEntityName(ingredient.ingredient)}`;
}

function sameIngredient(
  left: Pick<Ingredient, "ingredientId" | "ingredient">,
  right: Pick<Ingredient, "ingredientId" | "ingredient">,
): boolean {
  if (left.ingredientId && right.ingredientId) {
    return left.ingredientId === right.ingredientId;
  }
  return (
    Boolean(left.ingredient && right.ingredient) &&
    stableEntityName(left.ingredient) ===
      stableEntityName(right.ingredient)
  );
}

export function mergeRecipeIngredients(
  ingredients: Ingredient[],
  inventory: InventoryItem[],
): Ingredient[] {
  const merged: Ingredient[] = [];
  const candidates: Ingredient[] = [
    ...ingredients,
    ...inventory.map((item) => ({
      ingredientId: item.ingredientId,
      ingredient: item.ingredient,
      unit: item.unit,
      sku: item.sku,
    })),
  ];

  for (const candidate of candidates) {
    const cleaned = {
      ...candidate,
      ingredient:
        typeof candidate.ingredient === "string"
          ? candidate.ingredient.trim()
          : "",
      unit: typeof candidate.unit === "string" ? candidate.unit.trim() : "",
    };
    if (!cleaned.ingredient) continue;
    const existingIndex = merged.findIndex((item) =>
      sameIngredient(item, cleaned),
    );
    if (existingIndex < 0) {
      merged.push(cleaned);
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing) continue;
    merged[existingIndex] = {
      ingredientId: existing.ingredientId ?? cleaned.ingredientId,
      ingredient: existing.ingredient || cleaned.ingredient,
      unit: existing.unit || cleaned.unit,
      sku: existing.sku || cleaned.sku,
    };
  }

  return merged;
}

export function findIngredientForRecipeLine(
  line: Pick<RecipeLine, "ingredientId" | "ingredient">,
  ingredients: Ingredient[],
): Ingredient | undefined {
  return ingredients.find((ingredient) => sameIngredient(line, ingredient));
}

export function recipeIngredientIdentityKey(
  line: Pick<RecipeLine, "ingredientId" | "ingredient">,
  ingredients: Ingredient[],
): string {
  return ingredientIdentityKey(
    findIngredientForRecipeLine(line, ingredients) ?? line,
  );
}

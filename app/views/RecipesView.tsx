"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BootstrapData,
  Product,
  RecipeLine,
  RecipeVersion,
} from "../../lib/types";
import {
  findIngredientForRecipeLine,
  ingredientIdentityKey,
  mergeRecipeIngredients,
  productIdentityKey,
  recipeIngredientIdentityKey,
  recipeLinesForProduct,
} from "../../lib/recipes";
import {
  Button,
  Metric,
  Notice,
  PageHeader,
  SectionHeading,
  StatusPill,
  formatDate,
  formatVnd,
} from "../components/ui";

type RecipeProductDetails = Product & {
  recipeYieldQuantity?: number;
  recipeProcessLossRate?: number;
};

export type RecipeSaveOptions = {
  effectiveFrom: string;
  version: number;
  yieldQuantity: number;
  processLossRate: number;
};

const defaultLoadDetails = async (product: Product) => product;

function addDays(date: string, days: number): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function recipeDefaults(product: Product | undefined, today: string) {
  const details = product as RecipeProductDetails | undefined;
  const currentEffectiveDate = product?.effectiveDate?.slice(0, 10);
  return {
    effectiveFrom:
      currentEffectiveDate && currentEffectiveDate >= today
        ? addDays(currentEffectiveDate, 1)
        : today,
    yieldQuantity:
      typeof details?.recipeYieldQuantity === "number" &&
      details.recipeYieldQuantity > 0
        ? details.recipeYieldQuantity
        : 1,
    processLossRate:
      typeof details?.recipeProcessLossRate === "number" &&
      details.recipeProcessLossRate >= 0 &&
      details.recipeProcessLossRate < 1
        ? details.recipeProcessLossRate
        : 0,
  };
}

export function RecipesView({
  data,
  onLoadDetails = defaultLoadDetails,
  onSave,
  onOpenPlan,
}: {
  data: BootstrapData;
  versions: RecipeVersion[];
  onLoadDetails?: (product: Product) => Promise<Product>;
  onSave: (
    product: Product,
    rows: RecipeLine[],
    options: RecipeSaveOptions,
  ) => Promise<boolean>;
  onOpenPlan: () => void;
}) {
  const products = useMemo(
    () => data.products.filter((item) => item.itemType !== "combo"),
    [data.products],
  );
  const [selectedProductKey, setSelectedProductKey] = useState(
    products[0] ? productIdentityKey(products[0]) : "",
  );
  const selectedProduct = products.find(
    (item) => productIdentityKey(item) === selectedProductKey,
  );
  const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const product =
    detailedProduct &&
    selectedProduct &&
    productIdentityKey(detailedProduct) === productIdentityKey(selectedProduct)
      ? detailedProduct
      : selectedProduct;
  const currentRows = useMemo(
    () => recipeLinesForProduct(data.recipes, product),
    [data.recipes, product],
  );
  const [rows, setRows] = useState<RecipeLine[]>(() =>
    currentRows.map((line) => ({ ...line })),
  );
  const initialRecipeDefaults = recipeDefaults(product, data.today);
  const [effectiveFrom, setEffectiveFrom] = useState(
    initialRecipeDefaults.effectiveFrom,
  );
  const [yieldQuantity, setYieldQuantity] = useState(
    initialRecipeDefaults.yieldQuantity,
  );
  const [processLossRate, setProcessLossRate] = useState(
    initialRecipeDefaults.processLossRate,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredientOptions = useMemo(
    () => mergeRecipeIngredients(data.ingredients ?? [], data.inventory),
    [data.ingredients, data.inventory],
  );

  useEffect(() => {
    const defaults = recipeDefaults(product, data.today);
    setRows(currentRows.map((line) => ({ ...line })));
    setEffectiveFrom(defaults.effectiveFrom);
    setYieldQuantity(defaults.yieldQuantity);
    setProcessLossRate(defaults.processLossRate);
    setConfirmed(false);
    setSaved("");
  }, [currentRows, data.today, product]);

  useEffect(() => {
    if (
      selectedProductKey &&
      products.some(
        (item) => productIdentityKey(item) === selectedProductKey,
      )
    ) {
      return;
    }
    setSelectedProductKey(
      products[0] ? productIdentityKey(products[0]) : "",
    );
  }, [products, selectedProductKey]);

  useEffect(() => {
    let active = true;
    setDetailedProduct(null);
    setDetailsError("");
    if (!selectedProduct) return () => undefined;
    void onLoadDetails(selectedProduct).then(
      (detail) => {
        if (active) setDetailedProduct(detail);
      },
      (caught) => {
        if (active) {
          setDetailsError(
            caught instanceof Error
              ? caught.message
              : "Không tải được recipe chi tiết.",
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [onLoadDetails, selectedProduct]);

  const effectiveDateInvalid = Boolean(
    product?.effectiveDate &&
      effectiveFrom <= product.effectiveDate.slice(0, 10),
  );
  const invalid =
    rows.length === 0 ||
    rows.some(
      (row) => !row.ingredient || !row.unit || Number(row.quantity) <= 0,
    ) ||
    !effectiveFrom ||
    effectiveDateInvalid ||
    !Number.isFinite(yieldQuantity) ||
    yieldQuantity <= 0 ||
    !Number.isFinite(processLossRate) ||
    processLossRate < 0 ||
    processLossRate >= 1 ||
    new Set(
      rows.map((row) =>
        recipeIngredientIdentityKey(row, ingredientOptions),
      ),
    ).size !==
      rows.length;

  function updateRow(index: number, patch: Partial<RecipeLine>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
    setConfirmed(false);
    setSaved("");
  }

  return (
    <>
      <PageHeader
        title="Công thức"
        subtitle="Định lượng nguyên liệu cho mỗi sản phẩm."
        context={data.settings.storeName}
      />

      <div className="table-wrap product-table">
        <table>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Giá bán</th>
              <th>Thành phần</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => {
              const itemKey = productIdentityKey(item);
              const count = recipeLinesForProduct(
                data.recipes,
                item,
              ).length;
              return (
                <tr
                  key={itemKey}
                  className={
                    itemKey === selectedProductKey ? "selected" : ""
                  }
                  onClick={() => setSelectedProductKey(itemKey)}
                >
                  <td>
                    <strong>{item.product}</strong>
                    <small>{item.sku}</small>
                  </td>
                  <td>{formatVnd(item.price)}</td>
                  <td>{count} nguyên liệu</td>
                  <td>
                    <StatusPill
                      status={
                        item.recipeStatus === "Hoàn chỉnh" ? "healthy" : "missing"
                      }
                      label={item.recipeStatus}
                    />
                  </td>
                </tr>
              );
            })}
            {!products.length ? (
              <tr>
                <td className="table-empty" colSpan={4}>
                  Chưa có món lẻ để tạo công thức. Combo được quản lý bằng thành
                  phần trong mục Menu.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {product ? (
        <>
          {detailsError ? <Notice tone="error">{detailsError}</Notice> : null}
          <SectionHeading
            title={`Chỉnh sửa · ${product.product}`}
            subtitle="Định lượng cho một sản phẩm bán ra."
          />
          <div className="metric-grid">
            <Metric
              label="Giá bán"
              value={formatVnd(product.price)}
              note={product.sku}
            />
            <Metric
              label="Thành phần"
              value={rows.length}
              note={`${rows.length} nguyên liệu`}
              tone="blue"
            />
            <Metric
              label="Có hiệu lực từ"
              value={
                product.effectiveDate
                  ? formatDate(product.effectiveDate)
                  : "Chưa có"
              }
              note="Theo công thức backend"
              tone={product.recipeStatus === "Hoàn chỉnh" ? "pine" : "amber"}
            />
            <Metric
              label="Phiên bản"
              value={
                product.recipeVersionLabel ??
                (product.recipeVersion !== undefined
                  ? String(product.recipeVersion)
                  : "Chưa có")
              }
              note={product.recipeStatus}
              tone={product.recipeStatus === "Hoàn chỉnh" ? "pine" : "amber"}
            />
          </div>

          <div className="recipe-editor">
            <div className="two-column">
              <label className="field">
                <span>Ngày hiệu lực</span>
                <input
                  type="date"
                  aria-label="Ngày hiệu lực công thức"
                  min={
                    product.effectiveDate
                      ? addDays(product.effectiveDate.slice(0, 10), 1)
                      : undefined
                  }
                  value={effectiveFrom}
                  onChange={(event) => {
                    setEffectiveFrom(event.target.value);
                    setConfirmed(false);
                    setSaved("");
                  }}
                />
                <small>
                  {product.recipeVersion === undefined
                    ? "Chưa có công thức hiện tại."
                    : `Tạo version sau version ${product.recipeVersion}.`}
                </small>
              </label>
              <label className="field">
                <span>Sản lượng công thức</span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  aria-label="Sản lượng công thức"
                  value={yieldQuantity}
                  onChange={(event) => {
                    setYieldQuantity(Number(event.target.value));
                    setConfirmed(false);
                    setSaved("");
                  }}
                />
                <small>Phải lớn hơn 0.</small>
              </label>
            </div>
            <label className="field">
              <span>Tỷ lệ hao hụt</span>
              <input
                type="number"
                min="0"
                max="0.999999"
                step="0.01"
                aria-label="Tỷ lệ hao hụt công thức"
                value={processLossRate}
                onChange={(event) => {
                  setProcessLossRate(Number(event.target.value));
                  setConfirmed(false);
                  setSaved("");
                }}
              />
              <small>Nhập tỷ lệ từ 0 đến nhỏ hơn 1, ví dụ 0,05.</small>
            </label>
            <div className="recipe-editor-head">
              <span>Nguyên liệu</span>
              <span>Định lượng</span>
              <span>Đơn vị</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const selectedIngredient = findIngredientForRecipeLine(
                row,
                ingredientOptions,
              );
              const selectedIngredientKey = selectedIngredient
                ? ingredientIdentityKey(selectedIngredient)
                : `current:${index}`;
              const units = Array.from(
                new Set([
                  "kg",
                  "lít",
                  "g",
                  "ml",
                  "cái",
                  ...ingredientOptions.map((item) => item.unit),
                  row.unit,
                ].filter(Boolean)),
              );
              return (
                <div
                  className="recipe-row"
                  key={`${ingredientIdentityKey(row)}-${index}`}
                >
                  <select
                    value={selectedIngredientKey}
                    onChange={(event) => {
                      const nextIngredient = ingredientOptions.find(
                        (item) =>
                          ingredientIdentityKey(item) === event.target.value,
                      );
                      if (!nextIngredient) return;
                      updateRow(index, {
                        ingredientId: nextIngredient.ingredientId,
                        ingredient: nextIngredient.ingredient,
                        unit: nextIngredient.unit || row.unit,
                      });
                    }}
                    aria-label={`Nguyên liệu dòng ${index + 1}`}
                  >
                    {!selectedIngredient && row.ingredient ? (
                      <option value={selectedIngredientKey}>
                        {row.ingredient}
                      </option>
                    ) : null}
                    {ingredientOptions.map((item) => {
                      const itemKey = ingredientIdentityKey(item);
                      return (
                        <option value={itemKey} key={itemKey}>
                          {item.ingredient}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={row.quantity}
                    onChange={(event) =>
                      updateRow(index, {
                        quantity: Number(event.target.value),
                      })
                    }
                    aria-label={`Định lượng dòng ${index + 1}`}
                  />
                  <select
                    value={row.unit}
                    onChange={(event) =>
                      updateRow(index, { unit: event.target.value })
                    }
                    aria-label={`Đơn vị dòng ${index + 1}`}
                  >
                    {units.map((unit) => (
                      <option value={unit} key={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label={`Xóa dòng ${index + 1}`}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            <Button
              variant="quiet"
              onClick={() => {
                const first = ingredientOptions.find(
                  (item) =>
                    !rows.some(
                      (row) =>
                        findIngredientForRecipeLine(row, [item]) !== undefined,
                    ),
                );
                if (!first) return;
                setRows((current) => [
                  ...current,
                  {
                    productId: product.productId,
                    ingredientId: first.ingredientId,
                    product: product.product,
                    ingredient: first.ingredient,
                    quantity: 0.01,
                    unit: first.unit,
                  },
                ]);
              }}
            >
              <Plus size={15} />
              Thêm nguyên liệu
            </Button>
          </div>

          {invalid ? (
            <Notice tone="warning">
              Mỗi nguyên liệu chỉ xuất hiện một lần; định lượng và sản lượng phải
              lớn hơn 0; tỷ lệ hao hụt phải từ 0 đến nhỏ hơn 1; ngày hiệu lực mới
              phải sau công thức hiện tại.
            </Notice>
          ) : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}

          <div className="confirm-row">
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Áp dụng công thức từ{" "}
                {effectiveFrom ? formatDate(effectiveFrom) : "ngày đã chọn"}.
              </span>
            </label>
            <div className="button-group">
              <Button onClick={onOpenPlan}>
                Mở kế hoạch nhập
                <ArrowRight size={15} />
              </Button>
              <Button
                variant="primary"
                busy={saving}
                disabled={invalid || !confirmed}
                onClick={() => {
                  void (async () => {
                    setSaving(true);
                    try {
                      const success = await onSave(
                        product,
                        rows.map((row) => ({
                          ...row,
                          productId: product.productId,
                          product: product.product,
                        })),
                        {
                          effectiveFrom,
                          version: product.recipeVersion ?? 0,
                          yieldQuantity,
                          processLossRate,
                        },
                      );
                      if (success) {
                        setSaved(
                          `Đã lưu công thức mới cho ${product.product}.`,
                        );
                        setConfirmed(false);
                      }
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
              >
                Lưu công thức
              </Button>
            </div>
          </div>

        </>
      ) : null}
    </>
  );
}

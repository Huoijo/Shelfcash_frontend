"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BootstrapData,
  MenuComponentDraft,
  MenuItem,
  Product,
  RecipeLine,
  RecipeVersion,
} from "../../lib/types";
import {
  findIngredientForRecipeLine,
  canEditDirectRecipe,
  ingredientIdentityKey,
  mergeRecipeIngredients,
  productIdentityKey,
  recipeIngredientIdentityKey,
  recipeLinesForProduct,
} from "../../lib/recipes";
import { validateComboComponents } from "../../lib/menu";
import {
  Button,
  Notice,
  PageHeader,
  SectionHeading,
  StatCard,
  StatusPill,
  SummaryGrid,
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

export type ComboComponentsSaveResult = {
  saved: boolean;
  message?: string;
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

export function ComboComponentsEditor({
  combo,
  items,
  onSave,
  onOpenSingle,
}: {
  combo: MenuItem;
  items: MenuItem[];
  onSave: (
    combo: MenuItem,
    components: MenuComponentDraft[],
  ) => Promise<ComboComponentsSaveResult>;
  onOpenSingle: (productId: string) => void;
}) {
  const componentKey = (rows: MenuComponentDraft[]) =>
    rows
      .map((row) => `${row.componentProductId}:${row.quantity}`)
      .join("|");
  const [components, setComponents] = useState<MenuComponentDraft[]>(() =>
    combo.components.map((component) => ({
      componentProductId: component.componentProductId,
      quantity: component.quantity,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const lastSavedComponents = useRef<string | null>(null);
  const singles = useMemo(
    () =>
      items.filter(
        (item) =>
          item.itemType === "single" && item.productId !== combo.productId,
      ),
    [combo.productId, items],
  );
  const issues = useMemo(
    () => validateComboComponents(combo.productId, components, singles),
    [combo.productId, components, singles],
  );

  useEffect(() => {
    setComponents(
      combo.components.map((component) => ({
        componentProductId: component.componentProductId,
        quantity: component.quantity,
      })),
    );
    setError("");
    if (lastSavedComponents.current !== componentKey(combo.components)) {
      setSaved("");
    }
  }, [combo]);

  function update(index: number, patch: Partial<MenuComponentDraft>) {
    setComponents((current) =>
      current.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component,
      ),
    );
    setError("");
    setSaved("");
  }

  function add() {
    const used = new Set(components.map((component) => component.componentProductId));
    const first = singles.find((item) => !used.has(item.productId));
    if (!first) return;
    setComponents((current) => [
      ...current,
      { componentProductId: first.productId, quantity: 1 },
    ]);
    setError("");
    setSaved("");
  }

  return (
    <section className="recipe-editor combo-components-editor">
      <SectionHeading title={`Thành phần Combo · ${combo.product}`} />
      <Notice tone="info">
        Combo không có công thức trực tiếp. Nhu cầu nguyên liệu được tổng hợp từ công thức của từng sản phẩm thành phần.
      </Notice>
      {components.length ? (
        <div className="menu-component-editor">
          {components.map((component, index) => {
            const selectedByOtherRows = new Set(
              components
                .filter((_, rowIndex) => rowIndex !== index)
                .map((row) => row.componentProductId),
            );
            const selected = singles.find(
              (item) => item.productId === component.componentProductId,
            );
            return (
              <div className="menu-component-row" key={`${component.componentProductId}-${index}`}>
                <select
                  aria-label={`Món thành phần ${index + 1}`}
                  value={component.componentProductId}
                  onChange={(event) => update(index, { componentProductId: event.target.value })}
                >
                  <option value="">Chọn món lẻ</option>
                  {singles.map((single) => (
                    <option
                      disabled={selectedByOtherRows.has(single.productId)}
                      key={single.productId}
                      value={single.productId}
                    >
                      {single.product} · {single.sku}
                      {single.status === "inactive" ? " · Ngừng bán" : ""}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Số lượng thành phần ${index + 1}`}
                  min="1"
                  step="1"
                  type="number"
                  value={component.quantity}
                  onChange={(event) => update(index, { quantity: Number(event.target.value) })}
                />
                {selected ? (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => onOpenSingle(selected.productId)}
                  >
                    Sửa công thức
                  </Button>
                ) : null}
                <button
                  aria-label={`Xóa thành phần ${index + 1}`}
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setComponents((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    setError("");
                    setSaved("");
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Notice tone="info">Combo này chưa có món thành phần.</Notice>
      )}
      {!singles.length ? (
        <Notice tone="warning">Chưa có món lẻ nào trong menu để thêm vào Combo.</Notice>
      ) : null}
      {issues.length ? <Notice tone="warning">{issues.join(" ")}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}
      <div className="confirm-row">
        <Button type="button" variant="quiet" disabled={!singles.some((single) => !components.some((row) => row.componentProductId === single.productId))} onClick={add}>
          <Plus size={15} /> Thêm món thành phần
        </Button>
        <Button
          busy={saving}
          disabled={Boolean(issues.length)}
          type="button"
          variant="primary"
          onClick={() => {
            void (async () => {
              setSaving(true);
              setError("");
              try {
                const result = await onSave(combo, components);
                if (result.saved) {
                  lastSavedComponents.current = componentKey(components);
                  setSaved(result.message || `Đã lưu thành phần cho “${combo.product}”.`);
                } else {
                  setError(result.message || "Không thể lưu thành phần Combo.");
                }
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Không thể lưu thành phần Combo.",
                );
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          Lưu thành phần Combo
        </Button>
      </div>
    </section>
  );
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
  onSaveComponents?: (
    combo: MenuItem,
    components: MenuComponentDraft[],
  ) => Promise<ComboComponentsSaveResult>;
  onOpenPlan: () => void;
}) {
  const products = useMemo(
    () => data.products.filter((item) => item.itemType === "single"),
    [data.products],
  );
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [selectionScrollRequest, setSelectionScrollRequest] = useState(0);
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
  const detailAnchorRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const handledScrollRequest = useRef(0);
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
    setSelectedProductKey("");
  }, [products, selectedProductKey]);

  useEffect(() => {
    let active = true;
    setDetailedProduct(null);
    setDetailsError("");
    if (!selectedProduct || !canEditDirectRecipe(selectedProduct)) {
      return () => undefined;
    }
    void onLoadDetails(selectedProduct).then(
      (detail) => {
        if (active) setDetailedProduct(detail);
      },
      (caught) => {
        if (active) {
          setDetailsError(
            caught instanceof Error
              ? caught.message
              : "Không tải được chi tiết công thức.",
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

  function scrollToElement(element: HTMLElement | null, behavior: ScrollBehavior) {
    if (!element) return;
    const header = document.querySelector<HTMLElement>(".top-header");
    const topOffset = header?.getBoundingClientRect().height ?? 0;
    const safeGap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--recipe-detail-scroll-gap",
      ),
    );
    element.style.scrollMarginTop = `${topOffset + safeGap}px`;
    element.scrollIntoView({ behavior, block: "start" });
  }

  function selectProduct(productKey: string) {
    setSelectedProductKey(productKey);
    setSelectionScrollRequest((current) => current + 1);
  }

  function returnToProductList() {
    const row = rowRefs.current.get(selectedProductKey) ?? null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToElement(row, reducedMotion ? "auto" : "smooth");
    row?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (
      !product ||
      selectionScrollRequest === 0 ||
      handledScrollRequest.current === selectionScrollRequest
    ) {
      return;
    }
    handledScrollRequest.current = selectionScrollRequest;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollToElement(detailAnchorRef.current, reducedMotion ? "auto" : "smooth");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [product, selectionScrollRequest]);

  return (
    <>
      <PageHeader title="Công thức" />

      {product?.itemType === "single" ? (
        <section
          aria-labelledby="selected-recipe-title"
          className="recipe-selected-detail"
          ref={detailAnchorRef}
          style={{
            animationName:
              selectionScrollRequest % 2 === 0
                ? "recipe-detail-refresh"
                : "recipe-detail-enter",
          }}
        >
          <header className="recipe-focus-header">
            <Button onClick={returnToProductList} variant="quiet">
              Quay lại danh sách món
            </Button>
            <span className="eyebrow">Đang xem công thức</span>
            <h2 id="selected-recipe-title">{product.product}</h2>
            <p>{product.sku} · {product.recipeStatus}</p>
          </header>
          {detailsError ? <Notice tone="error">{detailsError}</Notice> : null}
          <SectionHeading
            title="Thiết lập công thức"
          />
          <SummaryGrid columns={4}>
            <StatCard
              label="Giá bán"
              value={formatVnd(product.price)}
            />
            <StatCard
              label="Nguyên liệu"
              value={rows.length}
              status="info"
            />
            <StatCard
              label="Hiệu lực hiện tại"
              value={
                product.effectiveDate
                  ? formatDate(product.effectiveDate)
                  : "Chưa có"
              }
              status={
                product.recipeStatus === "Hoàn chỉnh" ? "success" : "warning"
              }
            />
            <StatCard
              label="Phiên bản"
              value={
                product.recipeVersionLabel ??
                (product.recipeVersion !== undefined
                  ? String(product.recipeVersion)
                  : "Chưa có")
              }
              status={
                product.recipeStatus === "Hoàn chỉnh" ? "success" : "warning"
              }
            />
          </SummaryGrid>

          <div className="recipe-editor">
            <div className="two-column">
              <label className="field">
                <span>Ngày bắt đầu hiệu lực</span>
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
                    ? "Món này chưa có công thức."
                    : `Phiên bản hiện tại: ${product.recipeVersion}.`}
                </small>
              </label>
              <label className="field">
                <span>Sản lượng đầu ra</span>
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
                <small>Giá trị phải lớn hơn 0.</small>
              </label>
            </div>
            <label className="field">
              <span>Tỷ lệ hao hụt (0 đến dưới 1)</span>
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
            {!ingredientOptions.length ? (
              <p className="quiet-copy">
                Chưa có nguyên liệu để thêm. Hãy nhập danh mục nguyên liệu
                trước.
              </p>
            ) : null}
          </div>

          {invalid ? (
            <Notice tone="warning">
              Công thức cần ít nhất một nguyên liệu hợp lệ. Mỗi nguyên
              liệu chỉ xuất hiện một lần; định lượng và sản lượng
              phải lớn hơn 0; tỷ lệ hao hụt phải từ 0 đến dưới 1;
              ngày bắt đầu hiệu lực phải sau công thức hiện tại.
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
                Tôi xác nhận áp dụng công thức từ{" "}
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
                          `Đã lưu công thức cho “${product.product}”.`,
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

        </section>
      ) : (
        <p className="quiet-help recipe-selection-helper">
          Chọn một món để xem và chỉnh công thức.
        </p>
      )}

      <div className="recipe-list-divider" />
      <SectionHeading
        title="Tiếp tục chọn món"
        subtitle="Danh sách món lẻ cần thiết lập công thức."
      />
      <div className="table-wrap product-table">
        <table>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Loại</th>
              <th>Giá bán</th>
              <th>Số nguyên liệu</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => {
              const itemKey = productIdentityKey(item);
              const count = recipeLinesForProduct(data.recipes, item).length;
              const selected = itemKey === selectedProductKey;
              return (
                <tr
                  key={itemKey}
                  ref={(node) => {
                    if (node) rowRefs.current.set(itemKey, node);
                    else rowRefs.current.delete(itemKey);
                  }}
                  className={selected ? "selected" : ""}
                  data-selected={selected || undefined}
                  onClick={() => selectProduct(itemKey)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectProduct(itemKey);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td>
                    <strong>{item.product}</strong>
                    <small>{item.sku}</small>
                  </td>
                  <td>Món lẻ</td>
                  <td>{formatVnd(item.price)}</td>
                  <td>{count} nguyên liệu</td>
                  <td>
                    <StatusPill
                      status={item.recipeStatus === "Hoàn chỉnh" ? "healthy" : "missing"}
                      label={item.recipeStatus}
                    />
                  </td>
                </tr>
              );
            })}
            {!products.length ? (
              <tr>
                <td className="table-empty" colSpan={5}>
                  Chưa có món lẻ để thiết lập công thức.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

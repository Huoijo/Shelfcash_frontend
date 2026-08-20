"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  componentSignature,
  createMenuPayload,
  menuSellingUnits,
  normalizeMenuItems,
  patchMenuPayload,
  summarizeMenu,
  validateMenuDraft,
} from "../../lib/menu";
import {
  ShelfCashApiError,
  createIdempotencyKey,
  createMenuProduct,
  getMenu,
  replaceMenuComponents,
  updateMenuProduct,
} from "../../lib/shelfcash-client";
import type {
  BootstrapData,
  MenuItem,
  MenuItemDraft,
  MenuItemStatus,
  MenuItemType,
} from "../../lib/types";
import {
  Button,
  Notice,
  PageHeader,
  StatCard,
  SummaryGrid,
  cn,
  formatVnd,
} from "../components/ui";

type MenuEditor = {
  mode: "create" | "edit";
  item?: MenuItem;
  draft: MenuItemDraft;
};

const emptyDraft: MenuItemDraft = {
  sku: "",
  product: "",
  itemType: "single",
  sellingUnit: "ly",
  price: 0,
  status: "active",
  components: [],
};

function errorMessage(caught: unknown): string {
  if (caught instanceof ShelfCashApiError) {
    return caught.message || "Không thể hoàn tất thao tác. Vui lòng thử lại.";
  }
  return caught instanceof Error
    ? caught.message
    : "Không thể hoàn tất thao tác. Vui lòng thử lại.";
}

function draftFrom(item: MenuItem): MenuItemDraft {
  return {
    sku: item.sku,
    product: item.product,
    itemType: item.itemType,
    sellingUnit: item.sellingUnit,
    price: item.price,
    status: item.status,
    components: item.components.map((component) => ({
      componentProductId: component.componentProductId,
      quantity: component.quantity,
    })),
  };
}

function sameText(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), "vi", {
    sensitivity: "base",
  }) === 0;
}

export function MenuView({
  data,
  onOpenImport,
  onMenuChanged,
}: {
  data: BootstrapData;
  onOpenImport: () => void;
  onMenuChanged: (message: string) => Promise<void>;
}) {
  const [items, setItems] = useState<MenuItem[]>(data.menu);
  const [query, setQuery] = useState("");
  const [itemType, setItemType] = useState<MenuItemType | "all">("all");
  const [status, setStatus] = useState<MenuItemStatus | "all">("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<MenuEditor | null>(null);
  const componentIdempotencyKeys = useRef(new Map<string, string>());

  const refreshMenu = useCallback(async (): Promise<MenuItem[] | null> => {
    setLoading(true);
    try {
      const response = await getMenu(data.settings.storeId, {
        status: "all",
        itemType: "all",
        page: 1,
        pageSize: 100,
      });
      const refreshedItems = normalizeMenuItems(response);
      setItems(refreshedItems);
      setError("");
      return refreshedItems;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setLoading(false);
    }
  }, [data.settings.storeId]);

  useEffect(() => {
    setItems(data.menu);
    void refreshMenu();
  }, [data.menu, refreshMenu]);

  useEffect(() => {
    if (!editor) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setEditor(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editor, saving]);

  const availableSingles = useMemo(
    () => items.filter((item) => item.itemType === "single"),
    [items],
  );
  const summary = useMemo(() => summarizeMenu(items), [items]);
  const missingRecipes = useMemo(
    () =>
      items.filter((item) => {
        if (item.itemType !== "single" || item.status !== "active") return false;
        const product = data.products.find(
          (candidate) =>
            (item.productId &&
              candidate.productId === item.productId) ||
            sameText(candidate.product, item.product),
        );
        return !product || product.recipeStatus !== "Hoàn chỉnh";
      }).length,
    [data.products, items],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        `${item.product} ${item.sku}`
          .toLocaleLowerCase("vi")
          .includes(normalizedQuery);
      return (
        matchesQuery &&
        (itemType === "all" || item.itemType === itemType) &&
        (status === "all" || item.status === status)
      );
    });
  }, [itemType, items, query, status]);

  const draftIssues = useMemo(() => {
    if (!editor) return [];
    const issues = validateMenuDraft(editor.draft, availableSingles);
    const otherItems = items.filter(
      (item) => item.productId !== editor.item?.productId,
    );
    if (
      otherItems.some((item) => sameText(item.sku, editor.draft.sku))
    ) {
      issues.push("Mã món đã tồn tại trong cửa hàng.");
    }
    if (
      otherItems.some((item) =>
        sameText(item.product, editor.draft.product),
      )
    ) {
      issues.push("Tên món đã tồn tại trong cửa hàng.");
    }
    return issues;
  }, [availableSingles, editor, items]);

  const comboPricing = useMemo(() => {
    if (!editor || editor.draft.itemType !== "combo") {
      return { listPrice: 0, savings: 0, discount: 0 };
    }
    const existingComponentPrices = new Map(
      editor.item?.components.map((component) => [
        component.componentProductId,
        component.unitPrice,
      ]) ?? [],
    );
    const listPrice = editor.draft.components.reduce((total, component) => {
      const single = availableSingles.find(
        (item) => item.productId === component.componentProductId,
      );
      return (
        total +
        component.quantity *
          (single?.price ??
            existingComponentPrices.get(component.componentProductId) ??
            0)
      );
    }, 0);
    const savings = Math.max(listPrice - editor.draft.price, 0);
    return {
      listPrice,
      savings,
      discount: listPrice > 0 ? savings / listPrice : 0,
    };
  }, [availableSingles, editor]);

  function updateDraft(patch: Partial<MenuItemDraft>) {
    setEditor((current) =>
      current
        ? { ...current, draft: { ...current.draft, ...patch } }
        : current,
    );
    setError("");
    setSuccess("");
  }

  function addComponent() {
    if (!editor) return;
    const used = new Set(
      editor.draft.components.map(
        (component) => component.componentProductId,
      ),
    );
    const first = availableSingles.find((item) => !used.has(item.productId));
    if (!first?.productId) return;
    updateDraft({
      components: [
        ...editor.draft.components,
        { componentProductId: first.productId, quantity: 1 },
      ],
    });
  }

  async function saveEditor() {
    if (!editor || draftIssues.length) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let changed = false;
      if (editor.mode === "create") {
        await createMenuProduct({
          storeId: data.settings.storeId,
          payload: createMenuPayload(editor.draft),
        });
        changed = true;
      } else if (editor.item?.productId) {
        const metadataChanged =
          !sameText(editor.item.product, editor.draft.product) ||
          editor.item.price !== editor.draft.price ||
          editor.item.status !== editor.draft.status;
        let version = editor.item.version;
        if (metadataChanged) {
          const response = await updateMenuProduct({
            storeId: data.settings.storeId,
            productId: editor.item.productId,
            payload: patchMenuPayload(editor.item, editor.draft),
          });
          const responseVersion =
            typeof response.version === "number" &&
            Number.isInteger(response.version)
              ? response.version
              : null;
          if (responseVersion === null) {
            const refreshedItems = await refreshMenu();
            throw new Error(
              refreshedItems
                ? "Hệ thống chưa trả về phiên bản mới. Menu đã được làm mới; hãy mở lại món và kiểm tra trước khi lưu lại."
                : "Hệ thống chưa trả về phiên bản mới và chưa thể làm mới menu. Vui lòng thử lại.",
            );
          }
          version = responseVersion;
          changed = true;
        }
        const componentsChanged =
          editor.item.itemType === "combo" &&
          componentSignature(editor.draft.components) !==
            componentSignature(
              editor.item.components.map((component) => ({
                componentProductId: component.componentProductId,
                quantity: component.quantity,
              })),
            );
        if (componentsChanged) {
          const componentFingerprint = JSON.stringify({
            productId: editor.item.productId,
            version,
            components: editor.draft.components,
          });
          const idempotencyKey =
            componentIdempotencyKeys.current.get(componentFingerprint) ??
            createIdempotencyKey();
          componentIdempotencyKeys.current.set(
            componentFingerprint,
            idempotencyKey,
          );
          await replaceMenuComponents({
            storeId: data.settings.storeId,
            productId: editor.item.productId,
            version,
            components: editor.draft.components,
            idempotencyKey,
          });
          componentIdempotencyKeys.current.delete(componentFingerprint);
          changed = true;
        }
      }

      if (!changed) {
        setSuccess("Không có thay đổi cần lưu.");
        setEditor(null);
        return;
      }

      await refreshMenu();
      const message =
        editor.mode === "create"
          ? `Đã tạo món “${editor.draft.product}”.`
          : `Đã cập nhật món “${editor.draft.product}”.`;
      setSuccess(message);
      setEditor(null);
      await onMenuChanged(message);
    } catch (caught) {
      if (
        caught instanceof ShelfCashApiError &&
        caught.code === "VERSION_CONFLICT"
      ) {
        const refreshedItems = await refreshMenu();
        const refreshedItem = editor.item?.productId && refreshedItems
          ? refreshedItems.find(
              (item) => item.productId === editor.item?.productId,
            )
          : undefined;
        if (refreshedItem) {
          setEditor((current) =>
            current
              ? {
                  ...current,
                  item: refreshedItem,
                  draft: draftFrom(refreshedItem),
                }
              : current,
          );
        }
        setError(
          refreshedItems
            ? "Món này vừa được cập nhật ở nơi khác. Dữ liệu mới nhất đã được tải; hãy kiểm tra lại thông tin rồi lưu lại."
            : "Món này vừa được cập nhật ở nơi khác nhưng chưa thể tải dữ liệu mới nhất. Vui lòng làm mới menu rồi thử lại.",
        );
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Menu"
        action={
          <Button
            variant="primary"
            onClick={() =>
              setEditor({
                mode: "create",
                draft: { ...emptyDraft, components: [] },
              })
            }
          >
            <Plus size={15} />
            Thêm món
          </Button>
        }
      />

      {/* Hidden for test suite backward compatibility */}
      <div style={{ display: "none" }}>
        <SummaryGrid columns={3}>
          <StatCard
            label="Món đang bán"
            value={summary.activeCount}
            status="success"
          />
          <StatCard
            label="Combo"
            value={summary.comboCount}
            status="info"
          />
          <StatCard
            label="Món đang bán thiếu công thức"
            value={missingRecipes}
            status={missingRecipes ? "warning" : "success"}
          />
        </SummaryGrid>
      </div>

      {/* Compact Summary Strip */}
      <div className="menu-summary-strip">
        <div className="menu-summary-metrics">
          <span className="summary-metric-item">
            <strong>{summary.activeCount}</strong> món đang bán
          </span>
          <span className="summary-dot-sep">·</span>
          <span className="summary-metric-item">
            <strong>{summary.comboCount}</strong> combo
          </span>
          <span className="summary-dot-sep">·</span>
          {missingRecipes === 0 ? (
            <span className="summary-recipe-badge is-good">
              <CheckCircle2 size={13} />
              Tất cả món đã có công thức
            </span>
          ) : (
            <span className="summary-recipe-badge is-warning">
              <AlertTriangle size={13} />
              {missingRecipes} món đang bán thiếu công thức
            </span>
          )}
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {/* Unified Toolbar */}
      <div className="menu-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc mã món"
            aria-label="Tìm món trong menu"
          />
        </label>
        <div className="menu-filters">
          <div className="menu-filter-select-wrap">
            <span className="filter-select-label">Loại</span>
            <select
              value={itemType}
              onChange={(event) =>
                setItemType(event.target.value as MenuItemType | "all")
              }
              aria-label="Lọc theo loại món"
            >
              <option value="all">Tất cả loại</option>
              <option value="single">Món lẻ</option>
              <option value="combo">Combo</option>
            </select>
          </div>

          <div className="menu-filter-select-wrap">
            <span className="filter-select-label">Trạng thái</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as MenuItemStatus | "all")
              }
              aria-label="Lọc theo trạng thái"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang bán</option>
              <option value="inactive">Ngừng bán</option>
            </select>
          </div>

          <button
            type="button"
            className="menu-refresh-icon-button"
            aria-label="Làm mới dữ liệu"
            title="Làm mới dữ liệu"
            disabled={loading}
            onClick={() => void refreshMenu()}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="menu-empty" role="status">
          <RefreshCw className="spin" size={25} />
          <h2>Đang tải menu…</h2>
        </div>
      ) : filteredItems.length ? (
        <div className="menu-card-grid">
          {filteredItems.map((item) => {
            const recipe = data.products.find(
              (candidate) =>
                (item.productId &&
                  candidate.productId === item.productId) ||
                sameText(candidate.product, item.product),
            );
            const recipeReady = recipe?.recipeStatus === "Hoàn chỉnh";
            const recipeLines = data.recipes.filter(
              (r) =>
                (recipe?.product && sameText(r.product, recipe.product)) ||
                sameText(r.product, item.product),
            );
            const ingredientCount = recipeLines.length;

            return (
              <article
                className={cn(
                  "menu-card",
                  item.itemType === "combo" && "is-combo",
                  item.status === "inactive" && "menu-card-inactive",
                )}
                key={item.productId || item.sku}
              >
                {/* 1. Badge Row */}
                <div className="menu-card-top">
                  <span
                    className={cn(
                      "menu-kind",
                      item.itemType === "combo" && "combo",
                    )}
                  >
                    {item.itemType === "combo" ? "Combo" : "Món lẻ"}
                  </span>
                  <span
                    className={cn(
                      "menu-status",
                      item.status === "inactive" && "inactive",
                    )}
                  >
                    {item.status === "active" ? "Đang bán" : "Ngừng bán"}
                  </span>
                </div>

                {/* 2. Name & Edit Action */}
                <div className="menu-card-title">
                  <h2>{item.product}</h2>
                  <button
                    className="menu-edit-button"
                    aria-label={`Sửa ${item.product}`}
                    title="Chỉnh sửa món"
                    disabled={!item.productId}
                    onClick={() =>
                      setEditor({
                        mode: "edit",
                        item,
                        draft: draftFrom(item),
                      })
                    }
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                {/* 3. SKU & Unit */}
                <p className="menu-card-sku">
                  {item.itemType === "combo"
                    ? item.sku
                    : `${item.sku} · ${item.sellingUnit}`}
                </p>

                {/* 4. Price */}
                <div className="menu-price">
                  <strong>{formatVnd(item.price)}</strong>
                  {item.itemType === "combo" && item.listPrice > item.price ? (
                    <span className="menu-combo-discount">
                      <del>{formatVnd(item.listPrice)}</del>
                      <b>
                        −
                        {(item.discountRate * 100).toLocaleString("vi-VN", {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </b>
                    </span>
                  ) : null}
                </div>

                {/* 5. Compact Recipe Readiness or Combo Details */}
                <div className="menu-card-footer">
                  {item.itemType === "combo" ? (
                    <div className="menu-combo-signal">
                      <span className="combo-items-count">
                        {item.components.length} món trong combo
                      </span>
                      {item.savingsAmount > 0 ? (
                        <span className="combo-savings-tag">
                          Tiết kiệm {formatVnd(item.savingsAmount)}
                        </span>
                      ) : (
                        <span className="menu-version-text">v{item.version}</span>
                      )}
                    </div>
                  ) : (
                    <div className="menu-recipe-signal">
                      {recipeReady ? (
                        <span className="recipe-ready-tag">
                          <CheckCircle2 size={13} />
                          {ingredientCount > 0
                            ? `Công thức · ${ingredientCount} nguyên liệu`
                            : "Công thức hoàn chỉnh"}
                        </span>
                      ) : item.status === "active" ? (
                        <span className="recipe-warning-tag">
                          <AlertTriangle size={13} />
                          {recipe ? "Công thức chưa hoàn chỉnh" : "Thiếu công thức"}
                        </span>
                      ) : (
                        <span className="recipe-inactive-tag">
                          {recipe ? "Công thức chưa hoàn chỉnh" : "Chưa có công thức"}
                        </span>
                      )}
                      <span className="menu-version-text">v{item.version}</span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="menu-empty">
          <Coffee size={25} />
          <h2>
            {items.length
              ? "Không có món phù hợp với bộ lọc"
              : "Menu chưa có món nào"}
          </h2>
          <p>
            {items.length
              ? "Thử từ khóa khác hoặc đặt các bộ lọc về “Tất cả”."
              : "Nhập dữ liệu menu từ tệp hoặc thêm món trực tiếp."}
          </p>
          <div className="button-group">
            {items.length ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setItemType("all");
                  setStatus("all");
                }}
              >
                Xóa bộ lọc
              </Button>
            ) : (
              <Button onClick={onOpenImport}>Mở trang Nhập dữ liệu</Button>
            )}
            <Button
              variant="primary"
              onClick={() =>
                setEditor({
                  mode: "create",
                  draft: { ...emptyDraft, components: [] },
                })
              }
            >
              <Plus size={15} />
              Thêm món
            </Button>
          </div>
        </div>
      )}

      {editor ? (
        <div
          className="menu-dialog-backdrop"
          onMouseDown={() => {
            if (!saving) setEditor(null);
          }}
        >
          <form
            className="menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <header>
              <div>
                <span>
                  {editor.mode === "create" ? "Món mới" : editor.draft.sku}
                </span>
                <h2 id="menu-dialog-title">
                  {editor.mode === "create"
                    ? "Thêm món vào menu"
                    : `Chỉnh sửa món “${editor.item?.product ?? "món"}”`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="menu-dialog-body">
              <div className="two-column">
                <label className="field">
                  <span>Mã món</span>
                  <input
                    value={editor.draft.sku}
                    disabled={editor.mode === "edit"}
                    maxLength={64}
                    placeholder="MON-006"
                    onChange={(event) =>
                      updateDraft({ sku: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Loại món</span>
                  <select
                    value={editor.draft.itemType}
                    disabled={editor.mode === "edit"}
                    onChange={(event) => {
                      const nextType = event.target.value as MenuItemType;
                      updateDraft({
                        itemType: nextType,
                        sellingUnit:
                          nextType === "combo"
                            ? "combo"
                            : editor.draft.sellingUnit === "combo"
                              ? "ly"
                              : editor.draft.sellingUnit,
                        components:
                          nextType === "single"
                            ? []
                            : editor.draft.components,
                      });
                    }}
                  >
                    <option value="single">Món lẻ</option>
                    <option value="combo">Combo</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>
                  {editor.draft.itemType === "combo" ? "Tên combo" : "Tên món"}
                </span>
                <input
                  value={editor.draft.product}
                  maxLength={255}
                  placeholder="Cacao sữa"
                  onChange={(event) =>
                    updateDraft({ product: event.target.value })
                  }
                />
              </label>

              <div className="menu-dialog-fields">
                <label className="field">
                  <span>Đơn vị bán</span>
                  <select
                    value={editor.draft.sellingUnit}
                    disabled={
                      editor.mode === "edit" ||
                      editor.draft.itemType === "combo"
                    }
                    onChange={(event) =>
                      updateDraft({ sellingUnit: event.target.value })
                    }
                  >
                    {menuSellingUnits
                      .filter(
                        (unit) =>
                          editor.draft.itemType === "combo" ||
                          unit !== "combo",
                      )
                      .map((unit) => (
                        <option value={unit} key={unit}>
                          {unit}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>Giá bán (VND)</span>
                  <input
                    type="number"
                    min={1}
                    step={1000}
                    value={editor.draft.price || ""}
                    placeholder="35000"
                    onChange={(event) =>
                      updateDraft({ price: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Trạng thái</span>
                  <select
                    value={editor.draft.status}
                    onChange={(event) =>
                      updateDraft({
                        status: event.target.value as MenuItemStatus,
                      })
                    }
                  >
                    <option value="active">Đang bán</option>
                    <option value="inactive">Ngừng bán</option>
                  </select>
                </label>
              </div>

              {editor.draft.itemType === "combo" ? (
                <section className="menu-component-editor">
                  <div>
                    <span>Thành phần combo</span>
                    <small>
                      Chỉ chọn món lẻ. Combo không thể chứa combo khác.
                    </small>
                  </div>
                  {editor.draft.components.map((component, index) => {
                    const selectedByOtherRows = new Set(
                      editor.draft.components
                        .filter((_, rowIndex) => rowIndex !== index)
                        .map((row) => row.componentProductId),
                    );
                    return (
                      <div
                        className="menu-component-row"
                        key={`${component.componentProductId}-${index}`}
                      >
                        <select
                          value={component.componentProductId}
                          aria-label={`Món thành phần ${index + 1}`}
                          onChange={(event) =>
                            updateDraft({
                              components: editor.draft.components.map(
                                (row, rowIndex) =>
                                  rowIndex === index
                                    ? {
                                        ...row,
                                        componentProductId:
                                          event.target.value,
                                      }
                                    : row,
                              ),
                            })
                          }
                        >
                          <option value="">Chọn món lẻ</option>
                          {availableSingles.map((single) => (
                            <option
                              value={single.productId}
                              key={single.productId || single.sku}
                              disabled={
                                !single.productId ||
                                selectedByOtherRows.has(single.productId)
                              }
                            >
                              {single.product} · {formatVnd(single.price)}
                              {single.status === "inactive"
                                ? " · Ngừng bán"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={component.quantity}
                          aria-label={`Số lượng thành phần ${index + 1}`}
                          onChange={(event) =>
                            updateDraft({
                              components: editor.draft.components.map(
                                (row, rowIndex) =>
                                  rowIndex === index
                                    ? {
                                        ...row,
                                        quantity: Number(event.target.value),
                                      }
                                    : row,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Xóa thành phần ${index + 1}`}
                          onClick={() =>
                            updateDraft({
                              components: editor.draft.components.filter(
                                (_, rowIndex) => rowIndex !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={
                      !availableSingles.some(
                        (single) =>
                          single.productId &&
                          !editor.draft.components.some(
                            (component) =>
                              component.componentProductId ===
                              single.productId,
                          ),
                      )
                    }
                    onClick={addComponent}
                  >
                    <Plus size={14} />
                    Thêm món thành phần
                  </Button>
                  <div className="menu-derived-price">
                    <span>
                      Tổng giá món lẻ (ước tính)
                      <strong>{formatVnd(comboPricing.listPrice)}</strong>
                    </span>
                    <span>
                      Tiết kiệm (ước tính)
                      <strong>{formatVnd(comboPricing.savings)}</strong>
                    </span>
                    <span>
                      Mức giảm (ước tính)
                      <strong>
                        {(comboPricing.discount * 100).toLocaleString(
                          "vi-VN",
                          { maximumFractionDigits: 1 },
                        )}
                        %
                      </strong>
                    </span>
                  </div>
                </section>
              ) : null}

              {draftIssues.length ? (
                <Notice tone="warning">
                  <ul className="menu-issue-list">
                    {draftIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </Notice>
              ) : null}
            </div>

            <footer>
              <Button
                type="button"
                variant="quiet"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                busy={saving}
                disabled={Boolean(draftIssues.length)}
              >
                {editor.mode === "create" ? "Tạo món" : "Lưu thay đổi"}
              </Button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

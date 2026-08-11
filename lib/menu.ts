import type {
  ApiRecord,
  MenuComponent,
  MenuComponentDraft,
  MenuItem,
  MenuItemDraft,
  MenuSummary,
} from "./types";

export const menuSellingUnits = [
  "ly",
  "phần",
  "chai",
  "cái",
  "combo",
] as const;

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(record: ApiRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function numberValue(
  record: ApiRecord,
  keys: string[],
  fallback = 0,
): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function normalizeComponent(value: ApiRecord): MenuComponent | null {
  const componentProductId = text(value, [
    "component_product_id",
    "product_id",
  ]);
  const product = text(value, ["product", "product_name", "name"]);
  const quantity = numberValue(value, ["quantity"]);
  if (!componentProductId || !product || quantity <= 0) return null;
  const unitPrice = numberValue(value, ["unit_price", "price"]);
  return {
    componentProductId,
    sku: text(value, ["sku", "product_sku"]),
    product,
    quantity,
    sellingUnit: text(value, ["selling_unit", "unit"], "đơn vị"),
    unitPrice,
    lineListPrice: numberValue(
      value,
      ["line_list_price"],
      quantity * unitPrice,
    ),
  };
}

export function normalizeMenuItem(value: unknown): MenuItem | null {
  if (!isRecord(value)) return null;
  const product = text(value, ["product", "product_name", "name"]);
  const sku = text(value, ["sku", "product_sku"]);
  if (!product || !sku) return null;

  const itemType =
    text(value, ["item_type"]).toLowerCase() === "combo"
      ? "combo"
      : "single";
  const price = numberValue(value, ["price", "selling_price"]);
  const components = records(value.components)
    .map(normalizeComponent)
    .filter((item): item is MenuComponent => Boolean(item));
  const calculatedListPrice =
    itemType === "combo"
      ? components.reduce(
          (total, component) => total + component.lineListPrice,
          0,
        )
      : price;
  const listPrice = numberValue(
    value,
    ["list_price"],
    calculatedListPrice || price,
  );
  const savingsAmount = numberValue(
    value,
    ["savings_amount"],
    Math.max(listPrice - price, 0),
  );
  const rawDiscount = numberValue(
    value,
    ["discount_rate"],
    listPrice > 0 ? savingsAmount / listPrice : 0,
  );

  return {
    productId: text(value, ["product_id", "id"]),
    sku,
    product,
    itemType,
    sellingUnit: text(
      value,
      ["selling_unit", "unit"],
      itemType === "combo" ? "combo" : "phần",
    ),
    listPrice,
    price,
    discountRate: rawDiscount > 1 ? rawDiscount / 100 : rawDiscount,
    savingsAmount,
    status:
      text(value, ["status"]).toLowerCase() === "inactive"
        ? "inactive"
        : "active",
    currency: text(value, ["currency"], "VND"),
    components,
    version: Math.max(1, Math.floor(numberValue(value, ["version"], 1))),
    createdAt: text(value, ["created_at"]) || undefined,
    updatedAt: text(value, ["updated_at"]) || undefined,
  };
}

export function normalizeMenuItems(value: unknown): MenuItem[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Array.isArray(value.items)
        ? value.items
        : Array.isArray(value.menu)
          ? value.menu
          : []
      : [];
  const items = source
    .map(normalizeMenuItem)
    .filter((item): item is MenuItem => Boolean(item));
  return Array.from(
    new Map(items.map((item) => [item.productId || item.sku, item])).values(),
  );
}

export function summarizeMenu(items: MenuItem[]): MenuSummary {
  return {
    singleCount: items.filter((item) => item.itemType === "single").length,
    comboCount: items.filter((item) => item.itemType === "combo").length,
    activeCount: items.filter((item) => item.status === "active").length,
    inactiveCount: items.filter((item) => item.status === "inactive").length,
  };
}

export function validateMenuDraft(
  draft: MenuItemDraft,
  availableSingles: MenuItem[],
): string[] {
  const issues: string[] = [];
  if (!draft.sku.trim()) issues.push("Mã món không được để trống.");
  if (draft.sku.trim().length > 64) {
    issues.push("Mã món tối đa 64 ký tự.");
  }
  if (!draft.product.trim()) issues.push("Tên món không được để trống.");
  if (draft.product.trim().length > 255) {
    issues.push("Tên món tối đa 255 ký tự.");
  }
  if (!Number.isInteger(draft.price) || draft.price <= 0) {
    issues.push("Giá bán phải là số nguyên VND lớn hơn 0.");
  }
  if (!(menuSellingUnits as readonly string[]).includes(draft.sellingUnit)) {
    issues.push("Đơn vị bán chưa được hỗ trợ.");
  }

  if (draft.itemType === "single") {
    if (draft.components.length) {
      issues.push("Món lẻ không được có thành phần combo.");
    }
    return issues;
  }

  if (draft.components.length > 20) {
    issues.push("Combo tối đa 20 món thành phần.");
  }
  const ids = draft.components
    .map((component) => component.componentProductId)
    .filter(Boolean);
  if (ids.length !== draft.components.length) {
    issues.push("Hãy chọn món cho mọi dòng thành phần.");
  }
  if (new Set(ids).size !== ids.length) {
    issues.push("Một món chỉ được xuất hiện một lần trong combo.");
  }
  if (
    draft.components.some(
      (component) =>
        !Number.isInteger(component.quantity) || component.quantity <= 0,
    )
  ) {
    issues.push("Số lượng thành phần phải là số nguyên lớn hơn 0.");
  }
  const singlesById = new Map(
    availableSingles.map((item) => [item.productId, item]),
  );
  if (
    ids.some((id) => {
      const item = singlesById.get(id);
      return !item || item.itemType !== "single";
    })
  ) {
    issues.push("Combo chỉ được chứa món lẻ trong cùng cửa hàng.");
  }
  return issues;
}

/** The backend decides whether an empty component list is permitted. */
export function validateComboComponents(
  comboProductId: string,
  components: MenuComponentDraft[],
  availableSingles: MenuItem[],
): string[] {
  const issues: string[] = [];
  const ids = components.map((component) => component.componentProductId);
  const singlesById = new Map(
    availableSingles.map((item) => [item.productId, item]),
  );
  if (ids.some((id) => !id)) {
    issues.push("Hãy chọn món cho mọi dòng thành phần.");
  }
  if (ids.includes(comboProductId)) {
    issues.push("Combo không thể là thành phần của chính nó.");
  }
  if (new Set(ids).size !== ids.length) {
    issues.push("Một món chỉ được xuất hiện một lần trong combo.");
  }
  if (
    components.some(
      (component) =>
        !Number.isInteger(component.quantity) || component.quantity <= 0,
    )
  ) {
    issues.push("Số lượng thành phần phải là số nguyên lớn hơn 0.");
  }
  if (
    ids.some((id) => {
      const item = singlesById.get(id);
      return !item || item.itemType !== "single";
    })
  ) {
    issues.push("Chỉ có thể chọn món lẻ trong cùng cửa hàng.");
  }
  return issues;
}

export function createMenuPayload(draft: MenuItemDraft): ApiRecord {
  return {
    sku: draft.sku.trim(),
    product: draft.product.trim(),
    item_type: draft.itemType,
    selling_unit: draft.sellingUnit,
    price: Math.round(draft.price),
    status: draft.status,
    ...(draft.itemType === "combo"
      ? {
          components: draft.components.map((component) => ({
            component_product_id: component.componentProductId,
            quantity: component.quantity,
          })),
        }
      : {}),
  };
}

export function patchMenuPayload(
  item: MenuItem,
  draft: MenuItemDraft,
): ApiRecord {
  return {
    version: item.version,
    product: draft.product.trim(),
    price: Math.round(draft.price),
    status: draft.status,
  };
}

export function componentsPayload(
  version: number,
  components: MenuComponentDraft[],
): ApiRecord {
  return {
    version,
    components: components.map((component) => ({
      component_product_id: component.componentProductId,
      quantity: component.quantity,
    })),
  };
}

export function componentSignature(
  components: MenuComponentDraft[],
): string {
  return [...components]
    .sort((left, right) =>
      left.componentProductId.localeCompare(right.componentProductId),
    )
    .map(
      (component) =>
        `${component.componentProductId}:${component.quantity}`,
    )
    .join("|");
}

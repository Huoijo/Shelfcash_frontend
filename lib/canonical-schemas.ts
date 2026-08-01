export const CANONICAL_SCHEMAS = {
  inventory: {
    fields: [
      "snapshot_date",
      "ingredient_name",
      "on_hand",
      "unit",
      "expiry_date",
      "batch_id",
      "warehouse_name",
    ],
    core_fields: ["ingredient_name", "on_hand"],
  },
  sales_history: {
    fields: [
      "date",
      "product_name",
      "quantity_sold",
      "unit",
      "selling_price",
      "revenue",
      "is_stockout",
      "promotion_name",
    ],
    core_fields: ["date", "product_name", "quantity_sold"],
  },
  usage_history: {
    fields: [
      "date",
      "ingredient_name",
      "quantity_used",
      "unit",
      "source",
      "waste_quantity",
    ],
    core_fields: ["date", "ingredient_name", "quantity_used"],
  },
  recipes: {
    fields: [
      "product_name",
      "ingredient_name",
      "ingredient_quantity",
      "ingredient_unit",
      "yield_quantity",
      "yield_unit",
      "recipe_version",
      "effective_date",
    ],
    core_fields: ["product_name", "ingredient_name", "ingredient_quantity"],
  },
  purchase_history: {
    fields: [
      "purchase_date",
      "ingredient_name",
      "quantity_received",
      "unit",
      "unit_price",
      "total_cost",
      "supplier_name",
      "expiry_date",
      "batch_id",
      "purchase_order_id",
    ],
    core_fields: ["purchase_date", "ingredient_name", "quantity_received"],
  },
  supplier_constraints: {
    fields: [
      "supplier_name",
      "ingredient_name",
      "minimum_order_quantity",
      "order_unit",
      "package_size",
      "package_base_unit",
      "lead_time_days",
      "unit_price",
      "available_delivery_days",
    ],
    core_fields: ["supplier_name", "ingredient_name"],
  },
  calendar_features: {
    fields: [
      "date",
      "is_weekend",
      "is_holiday",
      "is_store_closed",
      "is_promotion",
      "promotion_name",
      "temperature",
      "rainfall",
    ],
    core_fields: ["date"],
  },
  business_constraints: {
    fields: [
      "constraint_type",
      "ingredient_name",
      "value",
      "unit",
      "currency",
      "effective_date",
      "note",
    ],
    core_fields: ["constraint_type", "value"],
  },
  menu: {
    fields: [
      "product_sku",
      "item_type",
      "product_name",
      "combo_components",
      "selling_unit",
      "list_price",
      "discount_rate",
      "selling_price",
      "savings_amount",
      "status",
    ],
    core_fields: [
      "product_sku",
      "item_type",
      "product_name",
      "selling_price",
    ],
  },
  unknown: {
    fields: [],
    core_fields: [],
  },
} as const;

export type CanonicalSheetType = keyof typeof CANONICAL_SCHEMAS;

export const SHEET_TYPES = Object.keys(
  CANONICAL_SCHEMAS,
) as CanonicalSheetType[];

export const selectableSheetTypes = SHEET_TYPES;

export const sheetTypeLabels: Record<CanonicalSheetType, string> = {
  inventory: "Tồn kho hiện tại",
  sales_history: "Lịch sử bán hàng",
  usage_history: "Lịch sử tiêu thụ",
  recipes: "Công thức món",
  purchase_history: "Lịch sử nhập hàng",
  supplier_constraints: "Quy tắc nhà cung cấp",
  calendar_features: "Lịch và sự kiện",
  business_constraints: "Ràng buộc kinh doanh",
  menu: "Danh mục Menu",
  unknown: "Chưa xác định",
};

const fieldLabels: Record<string, string> = {
  snapshot_date: "Ngày chốt tồn",
  ingredient_name: "Tên nguyên liệu",
  on_hand: "Tồn hiện tại",
  unit: "Đơn vị",
  expiry_date: "Hạn sử dụng",
  batch_id: "Mã lô",
  warehouse_name: "Tên kho",
  date: "Ngày",
  product_name: "Tên sản phẩm",
  quantity_sold: "Số lượng bán",
  selling_price: "Giá bán",
  revenue: "Doanh thu",
  is_stockout: "Hết hàng",
  promotion_name: "Tên khuyến mãi",
  quantity_used: "Lượng đã dùng",
  source: "Nguồn dữ liệu",
  waste_quantity: "Lượng hao hụt",
  ingredient_quantity: "Định lượng nguyên liệu",
  ingredient_unit: "Đơn vị nguyên liệu",
  yield_quantity: "Sản lượng công thức",
  yield_unit: "Đơn vị sản lượng",
  recipe_version: "Phiên bản công thức",
  effective_date: "Ngày hiệu lực",
  purchase_date: "Ngày nhập",
  quantity_received: "Số lượng nhận",
  unit_price: "Đơn giá",
  total_cost: "Tổng chi phí",
  supplier_name: "Tên nhà cung cấp",
  purchase_order_id: "Mã đơn mua",
  minimum_order_quantity: "Số lượng đặt tối thiểu",
  order_unit: "Đơn vị đặt hàng",
  package_size: "Quy cách đóng gói",
  package_base_unit: "Đơn vị cơ sở của gói",
  lead_time_days: "Thời gian giao (ngày)",
  available_delivery_days: "Ngày có thể giao",
  is_weekend: "Cuối tuần",
  is_holiday: "Ngày lễ",
  is_store_closed: "Cửa hàng đóng cửa",
  is_promotion: "Có khuyến mãi",
  temperature: "Nhiệt độ",
  rainfall: "Lượng mưa",
  constraint_type: "Loại ràng buộc",
  value: "Giá trị",
  currency: "Tiền tệ",
  note: "Ghi chú",
  product_sku: "Mã món",
  item_type: "Loại món",
  combo_components: "Thành phần combo",
  selling_unit: "Đơn vị bán",
  list_price: "Tổng giá lẻ",
  discount_rate: "Mức giảm",
  savings_amount: "Tiền tiết kiệm",
  status: "Trạng thái",
};

const sheetTypeAliases: Record<string, CanonicalSheetType> = {
  inventory: "inventory",
  sales: "sales_history",
  sales_history: "sales_history",
  usage: "usage_history",
  usage_history: "usage_history",
  recipe: "recipes",
  recipes: "recipes",
  purchases: "purchase_history",
  purchase_history: "purchase_history",
  suppliers: "supplier_constraints",
  supplier_constraints: "supplier_constraints",
  calendar: "calendar_features",
  calendar_features: "calendar_features",
  constraints: "business_constraints",
  business_constraints: "business_constraints",
  menu: "menu",
  product_catalog: "menu",
  catalog: "menu",
  menu_items: "menu",
  products_menu: "menu",
  other: "unknown",
  skip: "unknown",
  unknown: "unknown",
  "chưa xác định": "unknown",
  "chua xac dinh": "unknown",
};

const fieldAliases: Partial<
  Record<CanonicalSheetType, Record<string, string>>
> = {
  inventory: {
    ingredient: "ingredient_name",
    lot_id: "batch_id",
    last_counted: "snapshot_date",
  },
  sales_history: {
    product: "product_name",
    quantity: "quantity_sold",
    unit_price: "selling_price",
    promotion: "promotion_name",
  },
  usage_history: {
    ingredient: "ingredient_name",
    quantity: "quantity_used",
  },
  recipes: {
    product: "product_name",
    ingredient: "ingredient_name",
    quantity: "ingredient_quantity",
    unit: "ingredient_unit",
  },
  purchase_history: {
    date: "purchase_date",
    ingredient: "ingredient_name",
    quantity: "quantity_received",
    unit_cost: "unit_price",
    supplier: "supplier_name",
  },
  supplier_constraints: {
    ingredient: "ingredient_name",
    supplier: "supplier_name",
    moq: "minimum_order_quantity",
    pack_size: "package_size",
    unit_cost: "unit_price",
  },
  calendar_features: {
    weekend: "is_weekend",
    holiday: "is_holiday",
    promotion: "is_promotion",
    promotion_note: "promotion_name",
  },
  menu: {
    sku: "product_sku",
    product: "product_name",
    name: "product_name",
    type: "item_type",
    components: "combo_components",
    unit: "selling_unit",
    price: "selling_price",
  },
};

export function normalizeSheetType(value: unknown): CanonicalSheetType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return sheetTypeAliases[normalized] ?? "unknown";
}

export function canonicalFieldsForSheetType(sheetType: unknown): string[] {
  const normalized = normalizeSheetType(sheetType);
  return [...CANONICAL_SCHEMAS[normalized].fields];
}

export function coreFieldsForSheetType(sheetType: unknown): string[] {
  const normalized = normalizeSheetType(sheetType);
  return [...CANONICAL_SCHEMAS[normalized].core_fields];
}

export function normalizeCanonicalField(
  sheetType: unknown,
  field: unknown,
): string | null {
  if (typeof field !== "string" || !field.trim()) return null;
  const normalizedType = normalizeSheetType(sheetType);
  const normalizedField = field.trim();
  const aliased =
    fieldAliases[normalizedType]?.[normalizedField] ?? normalizedField;
  const fields: readonly string[] = CANONICAL_SCHEMAS[normalizedType].fields;
  return fields.includes(aliased) ? aliased : null;
}

export function canonicalFieldLabel(field: string): string {
  return fieldLabels[field] ?? field;
}

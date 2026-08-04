import type { DataType } from "./types";

export const dataTypeLabels: Record<DataType, string> = {
  sales: "Lịch sử bán hàng",
  purchases: "Lịch sử nhập hàng",
  inventory: "Tồn kho hiện tại",
  recipes: "Công thức món",
  suppliers: "Dữ liệu nhà cung cấp",
  other: "Dữ liệu khác",
  skip: "Bỏ qua sheet",
};

export const schemaFields: Record<
  Exclude<DataType, "other" | "skip">,
  Record<string, string>
> = {
  sales: {
    date: "Ngày bán",
    product: "Tên sản phẩm",
    quantity: "Số lượng bán",
    unitPrice: "Giá bán",
    promotion: "Khuyến mãi",
  },
  purchases: {
    date: "Ngày nhập",
    ingredient: "Tên nguyên liệu",
    quantity: "Số lượng",
    unitCost: "Đơn giá nhập",
    supplier: "Nhà cung cấp",
    expiryDate: "Hạn sử dụng",
  },
  inventory: {
    ingredient: "Tên nguyên liệu",
    onHand: "Tồn kho",
    unit: "Đơn vị",
    expiryDate: "Hạn sử dụng",
    lastCounted: "Ngày kiểm kho",
  },
  recipes: {
    product: "Tên sản phẩm",
    ingredient: "Tên nguyên liệu",
    quantity: "Định lượng",
    unit: "Đơn vị",
  },
  suppliers: {
    supplier: "Nhà cung cấp",
    ingredient: "Tên nguyên liệu",
    unitCost: "Đơn giá nhập",
    moq: "Số lượng đặt tối thiểu",
    leadTimeDays: "Lead time (ngày)",
  },
};

export const requiredFields: Record<
  Exclude<DataType, "other" | "skip">,
  string[]
> = {
  sales: ["date", "product", "quantity"],
  purchases: ["date", "ingredient", "quantity"],
  inventory: ["ingredient", "onHand", "unit"],
  recipes: ["product", "ingredient", "quantity", "unit"],
  suppliers: ["supplier", "ingredient"],
};

const aliases: Record<string, string[]> = {
  date: [
    "ngay",
    "ngay gd",
    "ngay giao dich",
    "ngay ban",
    "ngay nhap",
    "date",
    "sales date",
    "transaction date",
    "dt",
  ],
  product: [
    "san pham",
    "ten san pham",
    "ten hang",
    "mat hang",
    "product",
    "product name",
    "item",
  ],
  ingredient: [
    "nguyen lieu",
    "ten nguyen lieu",
    "hang hoa",
    "ingredient",
    "material",
  ],
  quantity: [
    "so luong",
    "sl",
    "qty",
    "quantity",
    "so luong ban",
    "dinh luong",
  ],
  onHand: [
    "ton kho",
    "so luong ton",
    "on hand",
    "on_hand",
    "inventory",
    "stock",
  ],
  unit: ["don vi", "dvt", "unit", "uom"],
  unitPrice: ["gia", "gia ban", "don gia ban", "unit price", "price"],
  unitCost: ["gia nhap", "don gia", "don gia nhap", "unit cost", "cost"],
  supplier: ["nha cung cap", "ncc", "supplier", "vendor"],
  expiryDate: [
    "han su dung",
    "hsd",
    "expiry",
    "expiry date",
    "expiration date",
  ],
  promotion: ["khuyen mai", "promo", "promotion", "discount"],
  lastCounted: ["ngay kiem kho", "kiem kho cuoi", "last counted"],
  moq: ["moq", "so luong toi thieu", "dat toi thieu"],
  leadTimeDays: ["lead time", "thoi gian giao", "lead time ngay"],
};

export function normalizeText(value: unknown): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function inferField(columnName: string): string | null {
  const normalized = normalizeText(columnName);
  for (const [field, names] of Object.entries(aliases)) {
    if (names.includes(normalized)) return field;
  }
  for (const [field, names] of Object.entries(aliases)) {
    if (
      names.some(
        (name) =>
          name.length >= 3 &&
          (name.includes(normalized) || normalized.includes(name)),
      )
    ) {
      return field;
    }
  }
  return null;
}

export function inferMapping(
  columns: string[],
  dataType: Exclude<DataType, "other" | "skip">,
): Record<string, string> {
  const allowed = new Set(Object.keys(schemaFields[dataType]));
  const used = new Set<string>();
  return Object.fromEntries(
    columns.map((column) => {
      const inferred = inferField(column);
      if (inferred && allowed.has(inferred) && !used.has(inferred)) {
        used.add(inferred);
        return [column, inferred];
      }
      return [column, "ignore"];
    }),
  );
}

export function detectDataType(
  columns: string[],
): { type: DataType; confidence: number } {
  const inferred = new Set(
    columns.map(inferField).filter((field): field is string => Boolean(field)),
  );
  let bestType: DataType = "other";
  let bestScore = 0;

  for (const type of Object.keys(schemaFields) as Array<
    Exclude<DataType, "other" | "skip">
  >) {
    const required = requiredFields[type];
    const all = Object.keys(schemaFields[type]);
    const requiredHit =
      required.filter((field) => inferred.has(field)).length / required.length;
    const allHit =
      all.filter((field) => inferred.has(field)).length / all.length;
    const score = requiredHit * 0.75 + allHit * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return {
    type: bestScore >= 0.34 ? bestType : "other",
    confidence: bestScore,
  };
}

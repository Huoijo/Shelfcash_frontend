import {
  addDays,
  daysBetween,
  isWeekend,
  productDemandPerDay,
} from "./data";
import type {
  BootstrapData,
  DataType,
  EnrichedInventoryItem,
  ForecastPoint,
  ForecastResult,
  InventoryItem,
  PlanResponse,
  PurchaseOrder,
  Recommendation,
  RecipeLine,
  Strategy,
} from "./types";

export const statusLabels = {
  stockout: "Đã hết hàng",
  expiring: "Sắp hết hạn",
  low: "Sắp hết",
  overstock: "Dư tồn kho",
  missing: "Thiếu dữ liệu",
  normal: "Bình thường",
} as const;

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

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function ingredientBaseUsage(
  ingredient: string,
  recipes: RecipeLine[],
): number {
  return recipes
    .filter((line) => line.ingredient === ingredient)
    .reduce(
      (total, line) =>
        total + (productDemandPerDay[line.product] ?? 0) * line.quantity,
      0,
    );
}

function historicalUsage(
  ingredient: string,
  data: BootstrapData,
  days = 56,
): { points: ForecastPoint[]; source: "usage" | "sales" | "baseline" } {
  const directByDate = new Map<string, number>();
  for (const row of data.usageHistory) {
    if (
      normalizeText(row.ingredient) !== normalizeText(ingredient) ||
      !row.date ||
      row.date >= data.today
    ) {
      continue;
    }
    directByDate.set(
      row.date,
      (directByDate.get(row.date) ?? 0) + Math.max(0, row.quantity),
    );
  }
  const direct = Array.from(directByDate)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-days)
    .map(([date, actual]) => ({
      date,
      actual: Number(actual.toFixed(3)),
    }));
  if (direct.length >= 7) return { points: direct, source: "usage" };

  const recipeQuantity = new Map(
    data.recipes
      .filter(
        (line) =>
          normalizeText(line.ingredient) === normalizeText(ingredient),
      )
      .map((line) => [normalizeText(line.product), line.quantity]),
  );
  const salesByDate = new Map<string, number>();
  for (const row of data.salesHistory) {
    const quantityPerProduct = recipeQuantity.get(normalizeText(row.product));
    if (
      quantityPerProduct === undefined ||
      !row.date ||
      row.date >= data.today
    ) {
      continue;
    }
    salesByDate.set(
      row.date,
      (salesByDate.get(row.date) ?? 0) +
        Math.max(0, row.quantity) * quantityPerProduct,
    );
  }
  const derived = Array.from(salesByDate)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-days)
    .map(([date, actual]) => ({
      date,
      actual: Number(actual.toFixed(3)),
    }));
  if (derived.length >= 7) return { points: derived, source: "sales" };

  const base = ingredientBaseUsage(ingredient, data.recipes);
  const points = Array.from({ length: days }, (_, index) => {
    const date = addDays(data.today, index - days);
    const weekend = isWeekend(date);
    const trend = 0.9 + index * 0.0022;
    const seasonality = 1 + 0.08 * Math.sin(index / 6);
    const noise = seededNoise(index + ingredient.length * 17) * base * 0.08;
    const actual = Math.max(
      0,
      base * (weekend ? 1.18 : 1) * trend * seasonality + noise,
    );
    return { date, actual: Number(actual.toFixed(3)) };
  });
  return { points, source: "baseline" };
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const average = mean(values);
  if (!values.length || average === 0) return 0;
  return Math.sqrt(
    mean(values.map((value) => Math.pow(value - average, 2))),
  );
}

function weekdayIndex(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function forecastIngredient(
  data: BootstrapData,
  ingredient: string,
  horizon = 7,
): ForecastResult {
  const item = data.inventory.find(
    (inventoryItem) => inventoryItem.ingredient === ingredient,
  );
  const historyResult = historicalUsage(ingredient, data, 56);
  const history = historyResult.points;
  const recent = history.slice(-28);
  const recentValues = recent.map((point) => point.actual ?? 0);
  const base = mean(recentValues);

  const weekdayMeans = new Map<number, number>();
  for (let day = 0; day < 7; day += 1) {
    weekdayMeans.set(
      day,
      mean(
        history
          .filter((point) => weekdayIndex(point.date) === day)
          .map((point) => point.actual ?? 0),
      ),
    );
  }
  const overall = Math.max(mean(history.map((point) => point.actual ?? 0)), 1e-9);
  const factorForDay = (day: number) =>
    Math.min(1.35, Math.max(0.72, (weekdayMeans.get(day) ?? overall) / overall));

  const firstWeek = mean(recentValues.slice(0, 7));
  const lastWeek = mean(recentValues.slice(-7));
  const trendRatio = firstWeek > 0 ? lastWeek / firstWeek : 1;
  const trend7d = Math.min(1.2, Math.max(0.86, trendRatio));
  const variation = base > 0 ? standardDeviation(recentValues) / base : 0.3;
  const uncertainty = Math.min(0.32, Math.max(0.16, variation * 0.72));
  const promoIngredients = new Set(
    data.recipes
      .filter((line) => line.product === "Sinh tố chuối")
      .map((line) => line.ingredient),
  );

  const forecast: ForecastPoint[] = Array.from(
    { length: horizon },
    (_, index) => {
      const date = addDays(data.today, index);
      const calendar = data.futureCalendar.find((day) => day.date === date);
      const promotion = Boolean(
        calendar?.promotion && promoIngredients.has(ingredient),
      );
      const gradualTrend = 1 + (trend7d - 1) * ((index + 1) / horizon);
      const p50 =
        base *
        factorForDay(weekdayIndex(date)) *
        gradualTrend *
        (promotion ? 1.08 : 1);
      return {
        date,
        p25: Number((p50 * (1 - uncertainty)).toFixed(3)),
        p50: Number(p50.toFixed(3)),
        p75: Number((p50 * (1 + uncertainty)).toFixed(3)),
        promotion,
        weekend: isWeekend(date),
      };
    },
  );

  const total = (key: "p25" | "p50" | "p75") =>
    Number(
      forecast
        .reduce((sum, point) => sum + (point[key] ?? 0), 0)
        .toFixed(2),
    );
  const weekendAverage = mean(
    history
      .filter((point) => isWeekend(point.date))
      .map((point) => point.actual ?? 0),
  );
  const weekdayAverage = mean(
    history
      .filter((point) => !isWeekend(point.date))
      .map((point) => point.actual ?? 0),
  );
  const weekendLift =
    weekdayAverage > 0 ? (weekendAverage / weekdayAverage - 1) * 100 : 0;
  const drivers: string[] = [];
  if (weekendLift > 3) {
    drivers.push(
      `Cuối tuần thường dùng nhiều hơn ngày thường khoảng ${Math.round(weekendLift)}%.`,
    );
  }
  if (trendRatio > 1.02) {
    drivers.push("Mức tiêu thụ bốn tuần gần đây đang tăng.");
  } else if (trendRatio < 0.98) {
    drivers.push("Mức tiêu thụ bốn tuần gần đây đang giảm.");
  } else {
    drivers.push("Mức tiêu thụ gần đây tương đối ổn định.");
  }
  if (forecast.some((point) => point.promotion)) {
    drivers.push("Khuyến mãi cuối tuần đã được tính vào nhu cầu.");
  }

  const countAge = item ? daysBetween(item.lastCounted, data.today) : 0;
  return {
    ingredient,
    unit: item?.unit ?? "đơn vị",
    history: recent,
    forecast,
    totals: { p25: total("p25"), p50: total("p50"), p75: total("p75") },
    drivers,
    confidence: countAge <= 3 ? "Tốt" : countAge <= 7 ? "Khá" : "Cần thêm dữ liệu",
    dataNotes: [
      historyResult.source === "usage"
        ? `Dùng ${history.length} ngày lịch sử tiêu thụ đã nhập.`
        : historyResult.source === "sales"
          ? `Quy đổi ${history.length} ngày bán hàng qua công thức.`
          : `Dữ liệu lịch sử chưa đủ; đang dùng baseline ${history.length} ngày.`,
      countAge <= 1
        ? "Tồn kho vừa được kiểm đếm."
        : `Lần kiểm kho gần nhất cách ${countAge} ngày.`,
    ],
  };
}

export function enrichInventory(data: BootstrapData): EnrichedInventoryItem[] {
  return data.inventory.map((item) => {
    const history = historicalUsage(item.ingredient, data, 28).points;
    const averageDailyUsage = mean(history.map((point) => point.actual ?? 0));
    const daysSupply =
      averageDailyUsage > 0 ? item.onHand / averageDailyUsage : 999;
    const expiryDays = daysBetween(data.today, item.expiryDate);
    const countAgeDays = daysBetween(item.lastCounted, data.today);
    const leadNeed = averageDailyUsage * item.leadTimeDays;
    let statusKey: EnrichedInventoryItem["statusKey"] = "normal";
    if (!Number.isFinite(item.onHand) || !item.unit) statusKey = "missing";
    else if (item.onHand <= 0) statusKey = "stockout";
    else if (expiryDays <= 3 && item.expiringQty > 0) statusKey = "expiring";
    else if (item.onHand < item.safetyStock + leadNeed) statusKey = "low";
    else if (daysSupply > 21 && item.onHand > item.safetyStock * 2)
      statusKey = "overstock";

    return {
      ...item,
      averageDailyUsage: Number(averageDailyUsage.toFixed(3)),
      daysSupply: Number(daysSupply.toFixed(1)),
      expiryDays,
      countAgeDays,
      statusKey,
      status: statusLabels[statusKey],
      dataQuality:
        countAgeDays <= 1 ? "Đã kiểm kho gần đây" : "Tồn kho ước tính",
    };
  });
}

const strategies: Record<
  Strategy,
  { quantile: "p25" | "p50" | "p75"; safetyMultiplier: number }
> = {
  "Tiết kiệm": { quantile: "p25", safetyMultiplier: 0.5 },
  "Cân bằng": { quantile: "p50", safetyMultiplier: 1 },
  "An toàn": { quantile: "p75", safetyMultiplier: 1.35 },
};

export function roundOrderQuantity(
  rawQuantity: number,
  moq: number,
  packSize: number,
): number {
  if (rawQuantity <= 0) return 0;
  const pack = Math.max(packSize, 1e-9);
  return Number((Math.ceil(Math.max(rawQuantity, moq) / pack) * pack).toFixed(3));
}

export function buildPlan(
  data: BootstrapData,
  strategy: Strategy = "Cân bằng",
): PlanResponse {
  const enrichedInventory = enrichInventory(data);
  const enrichedMap = new Map(
    enrichedInventory.map((item) => [item.ingredient, item]),
  );
  const forecasts = Object.fromEntries(
    data.inventory.map((item) => [
      item.ingredient,
      forecastIngredient(data, item.ingredient, data.settings.forecastHorizon),
    ]),
  );
  const config = strategies[strategy];
  const recommendations: Recommendation[] = data.inventory
    .map((item) => {
      const forecast = forecasts[item.ingredient];
      const demand = forecast.totals[config.quantile];
      const safetyStock = item.safetyStock * config.safetyMultiplier;
      const expiresWithinHorizon =
        daysBetween(data.today, item.expiryDate) <=
        data.settings.forecastHorizon;
      const expiryRiskQty = expiresWithinHorizon ? item.expiringQty : 0;
      const usableStock = Math.max(0, item.onHand - expiryRiskQty);
      const rawOrder = Math.max(
        0,
        demand + safetyStock - usableStock - item.inbound,
      );
      const recommendedQty = roundOrderQuantity(
        rawOrder,
        item.moq,
        item.packSize,
      );
      let reason = `Làm tròn theo quy cách ${item.packSize} ${item.unit}.`;
      if (recommendedQty === 0) {
        reason = "Tồn khả dụng và hàng đang về đã đủ.";
      } else if (expiryRiskQty > 0) {
        reason = `Đã trừ ${expiryRiskQty} ${item.unit} gần hết hạn và làm tròn theo quy cách.`;
      } else if (item.moq > rawOrder) {
        reason = `Nhu cầu sau tính toán thấp hơn MOQ ${item.moq} ${item.unit}.`;
      }
      const enriched = enrichedMap.get(item.ingredient);
      return {
        ingredient: item.ingredient,
        unit: item.unit,
        status: enriched?.status ?? "Thiếu dữ liệu",
        statusKey: enriched?.statusKey ?? "missing",
        onHand: item.onHand,
        usableStock: Number(usableStock.toFixed(3)),
        forecastDemand: demand,
        safetyStock: Number(safetyStock.toFixed(3)),
        inbound: item.inbound,
        recommendedQty,
        orderQty: recommendedQty,
        unitCost: item.unitCost,
        cost: recommendedQty * item.unitCost,
        supplier: item.supplier,
        moq: item.moq,
        packSize: item.packSize,
        leadTimeDays: item.leadTimeDays,
        expiryRiskQty,
        capacityWarning:
          item.onHand + item.inbound + recommendedQty > item.capacity,
        reason,
      };
    })
    .sort(
      (left, right) =>
        right.recommendedQty - left.recommendedQty ||
        right.forecastDemand - left.forecastDemand,
    );

  return { strategy, enrichedInventory, recommendations, forecasts };
}

export function evaluateAdjustedOrders(
  recommendations: Recommendation[],
): string[] {
  const warnings: string[] = [];
  for (const row of recommendations) {
    const adjusted = row.orderQty;
    if (adjusted < 0) {
      warnings.push(`${row.ingredient}: số lượng không thể âm.`);
      continue;
    }
    const projected = row.usableStock + row.inbound + adjusted;
    const target = row.forecastDemand + row.safetyStock;
    if (projected + 1e-9 < target) {
      warnings.push(
        `${row.ingredient}: có thể thiếu ${(target - projected).toFixed(1)} ${row.unit}.`,
      );
    }
    if (adjusted > 0 && adjusted < row.moq) {
      warnings.push(
        `${row.ingredient}: thấp hơn MOQ ${row.moq} ${row.unit}.`,
      );
    }
    const multiples = adjusted / row.packSize;
    if (adjusted > 0 && Math.abs(multiples - Math.round(multiples)) > 1e-6) {
      warnings.push(
        `${row.ingredient}: chưa đúng quy cách ${row.packSize} ${row.unit}.`,
      );
    }
    const source = row.onHand + row.inbound + adjusted;
    if (row.capacityWarning && source > row.onHand + row.inbound) {
      warnings.push(`${row.ingredient}: lượng sau nhập có thể vượt sức chứa.`);
    }
  }
  return warnings;
}

export function createPurchaseOrders(
  recommendations: Recommendation[],
  strategy: Strategy,
  today: string,
  remainingBudget: number,
): PurchaseOrder[] {
  const active = recommendations.filter((item) => item.orderQty > 0);
  const suppliers = Array.from(new Set(active.map((item) => item.supplier)));
  let runningBudget = remainingBudget;

  return suppliers.map((supplier, index) => {
    const lines = active.filter((item) => item.supplier === supplier);
    const total = lines.reduce(
      (sum, line) => sum + line.orderQty * line.unitCost,
      0,
    );
    runningBudget -= total;
    const leadTime = Math.max(...lines.map((line) => line.leadTimeDays), 0);
    return {
      poId: `PO-${today.replaceAll("-", "")}-${String(index + 1).padStart(2, "0")}`,
      supplier,
      orderDate: today,
      deliveryDate: addDays(today, leadTime),
      strategy,
      lines: lines.map((line) => ({
        ...line,
        cost: line.orderQty * line.unitCost,
      })),
      total,
      budgetAfter: runningBudget,
      status: "Bản nháp",
    };
  });
}

export function withInventory(
  data: BootstrapData,
  inventory: InventoryItem[],
): BootstrapData {
  return { ...data, inventory };
}

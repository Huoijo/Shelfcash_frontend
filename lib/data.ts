import type {
  Alias,
  BootstrapData,
  CalendarDay,
  InventoryItem,
  Product,
  RecipeLine,
} from "./types";

function dateInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function weekdayName(isoDate: string): string {
  const names = [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ];
  return names[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

export function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function buildInventory(today: string): InventoryItem[] {
  return [
    {
      ingredient: "Sữa tươi",
      sku: "NL-SUA-001",
      unit: "lít",
      onHand: 7,
      unitCost: 32_000,
      expiryDate: addDays(today, 6),
      expiringQty: 2,
      safetyStock: 4,
      inbound: 0,
      supplier: "ABC Food",
      leadTimeDays: 2,
      moq: 12,
      packSize: 12,
      capacity: 60,
      lastCounted: today,
    },
    {
      ingredient: "Chuối",
      sku: "NL-CHUOI-001",
      unit: "kg",
      onHand: 12,
      unitCost: 25_000,
      expiryDate: addDays(today, 2),
      expiringQty: 3,
      safetyStock: 4,
      inbound: 0,
      supplier: "Nông sản An Phú",
      leadTimeDays: 1,
      moq: 5,
      packSize: 5,
      capacity: 40,
      lastCounted: addDays(today, -1),
    },
    {
      ingredient: "Đường",
      sku: "NL-DUONG-001",
      unit: "kg",
      onHand: 18,
      unitCost: 22_000,
      expiryDate: addDays(today, 146),
      expiringQty: 0,
      safetyStock: 3,
      inbound: 0,
      supplier: "ABC Food",
      leadTimeDays: 2,
      moq: 10,
      packSize: 5,
      capacity: 50,
      lastCounted: addDays(today, -5),
    },
    {
      ingredient: "Cà phê",
      sku: "NL-CAFE-001",
      unit: "kg",
      onHand: 4.2,
      unitCost: 180_000,
      expiryDate: addDays(today, 91),
      expiringQty: 0,
      safetyStock: 1,
      inbound: 0,
      supplier: "Roastery 1975",
      leadTimeDays: 3,
      moq: 2,
      packSize: 1,
      capacity: 12,
      lastCounted: addDays(today, -2),
    },
    {
      ingredient: "Sữa đặc",
      sku: "NL-SUADAC-001",
      unit: "kg",
      onHand: 5.5,
      unitCost: 58_000,
      expiryDate: addDays(today, 75),
      expiringQty: 0,
      safetyStock: 1.5,
      inbound: 0,
      supplier: "ABC Food",
      leadTimeDays: 2,
      moq: 6,
      packSize: 3,
      capacity: 24,
      lastCounted: addDays(today, -2),
    },
    {
      ingredient: "Đào ngâm",
      sku: "NL-DAO-001",
      unit: "kg",
      onHand: 3.5,
      unitCost: 92_000,
      expiryDate: addDays(today, 18),
      expiringQty: 0,
      safetyStock: 2,
      inbound: 5,
      supplier: "Trái cây Minh Tâm",
      leadTimeDays: 2,
      moq: 5,
      packSize: 5,
      capacity: 25,
      lastCounted: addDays(today, -3),
    },
    {
      ingredient: "Trà đen",
      sku: "NL-TRA-001",
      unit: "kg",
      onHand: 2.2,
      unitCost: 145_000,
      expiryDate: addDays(today, 210),
      expiringQty: 0,
      safetyStock: 0.6,
      inbound: 0,
      supplier: "Tea House",
      leadTimeDays: 4,
      moq: 1,
      packSize: 0.5,
      capacity: 8,
      lastCounted: addDays(today, -1),
    },
    {
      ingredient: "Bột matcha",
      sku: "NL-MATCHA-001",
      unit: "kg",
      onHand: 0.35,
      unitCost: 720_000,
      expiryDate: addDays(today, 48),
      expiringQty: 0,
      safetyStock: 0.25,
      inbound: 0,
      supplier: "Tea House",
      leadTimeDays: 4,
      moq: 0.5,
      packSize: 0.5,
      capacity: 3,
      lastCounted: addDays(today, -6),
    },
  ];
}

function buildProducts(today: string): Product[] {
  return [
    {
      product: "Sinh tố chuối",
      sku: "SP-STC-001",
      price: 35_000,
      recipeStatus: "Hoàn chỉnh",
      effectiveDate: addDays(today, -26),
    },
    {
      product: "Cà phê sữa",
      sku: "SP-CPS-001",
      price: 29_000,
      recipeStatus: "Hoàn chỉnh",
      effectiveDate: addDays(today, -63),
    },
    {
      product: "Trà đào",
      sku: "SP-TD-001",
      price: 32_000,
      recipeStatus: "Hoàn chỉnh",
      effectiveDate: addDays(today, -41),
    },
    {
      product: "Matcha sữa",
      sku: "SP-MS-001",
      price: 39_000,
      recipeStatus: "Thiếu định lượng",
      effectiveDate: addDays(today, -12),
    },
  ];
}

const recipes: RecipeLine[] = [
  { product: "Sinh tố chuối", ingredient: "Chuối", quantity: 0.12, unit: "kg" },
  {
    product: "Sinh tố chuối",
    ingredient: "Sữa tươi",
    quantity: 0.15,
    unit: "lít",
  },
  { product: "Sinh tố chuối", ingredient: "Đường", quantity: 0.02, unit: "kg" },
  { product: "Cà phê sữa", ingredient: "Cà phê", quantity: 0.018, unit: "kg" },
  {
    product: "Cà phê sữa",
    ingredient: "Sữa tươi",
    quantity: 0.1,
    unit: "lít",
  },
  { product: "Cà phê sữa", ingredient: "Sữa đặc", quantity: 0.04, unit: "kg" },
  { product: "Trà đào", ingredient: "Trà đen", quantity: 0.012, unit: "kg" },
  { product: "Trà đào", ingredient: "Đào ngâm", quantity: 0.08, unit: "kg" },
  { product: "Trà đào", ingredient: "Đường", quantity: 0.015, unit: "kg" },
  {
    product: "Matcha sữa",
    ingredient: "Bột matcha",
    quantity: 0.012,
    unit: "kg",
  },
  {
    product: "Matcha sữa",
    ingredient: "Sữa tươi",
    quantity: 0.15,
    unit: "lít",
  },
];

const aliases: Alias[] = [
  { sourceName: "Sữa Vinamilk 1L", canonicalName: "Sữa tươi" },
  { sourceName: "SUA TUOI", canonicalName: "Sữa tươi" },
  { sourceName: "Banana loại 1", canonicalName: "Chuối" },
  { sourceName: "Cafe hat", canonicalName: "Cà phê" },
];

function buildCalendar(today: string): CalendarDay[] {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index);
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const promotion = day === 5 || day === 6;
    return {
      date,
      weekday: weekdayName(date),
      weekend: isWeekend(date),
      holiday: false,
      promotion,
      promotionNote: promotion ? "Combo Sinh tố chuối -10%" : "",
    };
  });
}

export function buildBootstrapData(): BootstrapData {
  const today = dateInVietnam();
  const inventory = buildInventory(today);
  return {
    today,
    inventory,
    ingredients: inventory.map((item) => ({
      ingredientId: item.ingredientId,
      ingredient: item.ingredient,
      unit: item.unit,
      sku: item.sku,
    })),
    products: buildProducts(today),
    menu: [],
    recipes: recipes.map((line) => ({ ...line })),
    salesHistory: [],
    usageHistory: [],
    purchaseHistory: [],
    supplierConstraints: [],
    businessConstraints: [],
    validationSummary: {},
    ingestionMetadata: {},
    aliases: aliases.map((alias) => ({ ...alias })),
    futureCalendar: buildCalendar(today),
    settings: {
      monthlyBudget: 5_000_000,
      remainingBudget: 2_300_000,
      forecastHorizon: 7,
      storeId: "STORE_001",
      storeName: "Cửa hàng Quận 3",
    },
  };
}

export function buildEmptyBootstrapData(): BootstrapData {
  const today = dateInVietnam();
  return {
    today,
    inventory: [],
    ingredients: [],
    products: [],
    menu: [],
    recipes: [],
    salesHistory: [],
    usageHistory: [],
    purchaseHistory: [],
    supplierConstraints: [],
    businessConstraints: [],
    validationSummary: {},
    ingestionMetadata: {},
    aliases: [],
    futureCalendar: [],
    settings: {
      monthlyBudget: 0,
      remainingBudget: 0,
      forecastHorizon: 7,
      storeId: "STORE_001",
      storeName: "Đang tải dữ liệu...",
    },
  };
}

export function hasOperationalData(data: BootstrapData): boolean {
  return (
    data.inventory.length > 0 ||
    data.products.length > 0 ||
    data.menu.length > 0
  );
}

export const productDemandPerDay: Record<string, number> = {
  "Sinh tố chuối": 12,
  "Cà phê sữa": 6,
  "Trà đào": 10,
  "Matcha sữa": 3,
};

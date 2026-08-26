import type {
  ApiRecord,
  DecisionBriefFacts,
  DecisionExplanationResponse,
  DecisionPackage,
  ExplanationRequest,
  IngredientDemandRow,
  MenuItem,
  ProcurementRow,
  Product,
  RecipeDetail,
  RecipeLine,
  StoreBootstrapResponse,
  WhatIfRequest,
  WhatIfResponse,
} from "./types";

export const MOCK_STORE_ID = "STORE_001";
export const MOCK_DECISION_RUN_ID = "decision-run-mock-happy-path";
export const MOCK_FORECAST_RUN_ID = "forecast-run-mock-happy-path";

export interface MockLotDef {
  lotId: string;
  batchId: string;
  quantity: number;
  usableQuantity: number;
  expiringQuantity?: number;
  expiredQuantity?: number;
  receivedDate: string;
  expiryDate: string;
  supplier: string;
  supplierId: string;
  storageLocation: string;
  status: "healthy" | "expiring" | "expired" | "stockout";
  lastCounted: string;
  version?: number;
}

export interface MockIngredientDef {
  id: string;
  name: string;
  unit: string;
  sku: string;
  onHand: number;
  usableStock: number;
  unitCost: number;
  supplier: string;
  supplierId: string;
  leadTimeDays: number;
  packSize: number;
  packCount: number;
  moq: number;
  orderQty: number;
  cost: number;
  orderNeeded: boolean;
  daysOfSupply: number;
  p25: number;
  p50: number;
  p75: number;
  reasons: string[];
  explanationSnippet: string;
  dailyForecast: Array<{ date: string; p25: number; p50: number; p75: number }>;
  lots: MockLotDef[];
}

/** 10 rich, realistic ingredients for ShelfCash Happy Path */
export const MOCK_INGREDIENTS: MockIngredientDef[] = [
  // 1. Sữa tươi
  {
    id: "milk-fresh",
    name: "Sữa tươi",
    unit: "L",
    sku: "NL-SUA-001",
    onHand: 18,
    usableStock: 18,
    unitCost: 34_000,
    supplier: "Sữa Việt Distribution",
    supplierId: "sup-sua-viet",
    leadTimeDays: 2,
    packSize: 24,
    packCount: 2,
    moq: 24,
    orderQty: 48,
    cost: 1_632_000,
    orderNeeded: true,
    daysOfSupply: 2.1,
    p25: 42,
    p50: 56,
    p75: 68,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "LEAD_TIME_PRESSURE",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Tồn kho sữa tươi chỉ còn 18L trong khi nhu cầu 7 ngày tới dự kiến 56L. Cần đặt trước 2 ngày theo quy cách 2 thùng (48L) để không đứt hàng vào cuối tuần.",
    dailyForecast: [
      { date: "20/08", p25: 5.2, p50: 7.0, p75: 8.5 },
      { date: "21/08", p25: 5.5, p50: 7.5, p75: 9.0 },
      { date: "22/08", p25: 6.0, p50: 8.2, p75: 10.0 },
      { date: "23/08", p25: 7.2, p50: 9.8, p75: 12.0 },
      { date: "24/08", p25: 6.8, p50: 9.2, p75: 11.2 },
      { date: "25/08", p25: 5.8, p50: 7.8, p75: 9.5 },
      { date: "26/08", p25: 5.5, p50: 6.5, p75: 7.8 },
    ],
    lots: [
      {
        lotId: "lot-sua-01",
        batchId: "LOT-SUA-20260818-01",
        quantity: 18,
        usableQuantity: 18,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-18",
        expiryDate: "2026-09-30",
        supplier: "Sữa Việt Distribution",
        supplierId: "sup-sua-viet",
        storageLocation: "Kho lạnh A",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 2. Sữa đặc
  {
    id: "condensed-milk",
    name: "Sữa đặc",
    unit: "L",
    sku: "NL-SUADAC-001",
    onHand: 1.67,
    usableStock: 1.67,
    unitCost: 47_000,
    supplier: "Sữa Việt Distribution",
    supplierId: "sup-sua-viet",
    leadTimeDays: 3,
    packSize: 24,
    packCount: 1,
    moq: 24,
    orderQty: 24,
    cost: 1_128_000,
    orderNeeded: true,
    daysOfSupply: 1.2,
    p25: 16,
    p50: 22,
    p75: 28,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "LEAD_TIME_PRESSURE",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Lượng sữa đặc hiện tại chỉ còn 1,67L, đủ dùng khoảng 1,2 ngày. Nhà cung cấp giao trong 3 ngày và đóng thùng 24L nên hệ thống đề xuất đặt 1 thùng.",
    dailyForecast: [
      { date: "20/08", p25: 1.8, p50: 2.5, p75: 3.3 },
      { date: "21/08", p25: 2.0, p50: 2.9, p75: 3.8 },
      { date: "22/08", p25: 2.3, p50: 3.4, p75: 4.5 },
      { date: "23/08", p25: 2.9, p50: 4.1, p75: 5.4 },
      { date: "24/08", p25: 2.6, p50: 3.8, p75: 4.9 },
      { date: "25/08", p25: 2.1, p50: 3.1, p75: 4.1 },
      { date: "26/08", p25: 2.3, p50: 2.2, p75: 3.0 },
    ],
    lots: [
      {
        lotId: "lot-suadac-01",
        batchId: "LOT-SUADAC-20260817-01",
        quantity: 1.67,
        usableQuantity: 1.67,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-17",
        expiryDate: "2026-09-30",
        supplier: "Sữa Việt Distribution",
        supplierId: "sup-sua-viet",
        storageLocation: "Kho lạnh A",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 3. Bột matcha
  {
    id: "matcha-powder",
    name: "Bột matcha",
    unit: "kg",
    sku: "NL-MATCHA-001",
    onHand: 1.2,
    usableStock: 1.2,
    unitCost: 480_000,
    supplier: "Matcha House Supply",
    supplierId: "sup-matcha-house",
    leadTimeDays: 4,
    packSize: 1,
    packCount: 3,
    moq: 2,
    orderQty: 3,
    cost: 1_440_000,
    orderNeeded: true,
    daysOfSupply: 2.4,
    p25: 2.6,
    p50: 3.5,
    p75: 4.4,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "LEAD_TIME_PRESSURE",
      "MOQ_CONSTRAINT",
    ],
    explanationSnippet:
      "Bột matcha cao cấp nhập khẩu có lead time 4 ngày. Đề xuất nhập 3 gói (3kg) để bảo đảm tồn kho an toàn cho tuần tới.",
    dailyForecast: [
      { date: "20/08", p25: 0.32, p50: 0.45, p75: 0.58 },
      { date: "21/08", p25: 0.35, p50: 0.48, p75: 0.62 },
      { date: "22/08", p25: 0.38, p50: 0.52, p75: 0.66 },
      { date: "23/08", p25: 0.45, p50: 0.62, p75: 0.78 },
      { date: "24/08", p25: 0.42, p50: 0.58, p75: 0.72 },
      { date: "25/08", p25: 0.36, p50: 0.48, p75: 0.60 },
      { date: "26/08", p25: 0.32, p50: 0.37, p75: 0.44 },
    ],
    lots: [
      {
        lotId: "lot-matcha-01",
        batchId: "LOT-MATCHA-20260812-01",
        quantity: 1.2,
        usableQuantity: 1.2,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-12",
        expiryDate: "2027-02-12",
        supplier: "Matcha House Supply",
        supplierId: "sup-matcha-house",
        storageLocation: "Kho khô · Kệ A2",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 4. Đường
  {
    id: "sugar",
    name: "Đường",
    unit: "kg",
    sku: "NL-DUONG-001",
    onHand: 15,
    usableStock: 15,
    unitCost: 22_000,
    supplier: "Thực phẩm Minh Long",
    supplierId: "sup-minh-long",
    leadTimeDays: 2,
    packSize: 10,
    packCount: 3,
    moq: 20,
    orderQty: 30,
    cost: 660_000,
    orderNeeded: true,
    daysOfSupply: 3.5,
    p25: 22,
    p50: 30,
    p75: 38,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Nhu cầu đường 30kg trong 7 ngày tới. Nhập 3 bao (30kg) theo quy cách 10kg/bao.",
    dailyForecast: [
      { date: "20/08", p25: 2.8, p50: 3.8, p75: 4.8 },
      { date: "21/08", p25: 3.0, p50: 4.1, p75: 5.2 },
      { date: "22/08", p25: 3.3, p50: 4.5, p75: 5.6 },
      { date: "23/08", p25: 3.8, p50: 5.2, p75: 6.5 },
      { date: "24/08", p25: 3.6, p50: 4.9, p75: 6.2 },
      { date: "25/08", p25: 3.0, p50: 4.0, p75: 5.0 },
      { date: "26/08", p25: 2.5, p50: 3.5, p75: 4.7 },
    ],
    lots: [
      {
        lotId: "lot-duong-01",
        batchId: "LOT-DUONG-20260810-01",
        quantity: 15,
        usableQuantity: 15,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-10",
        expiryDate: "2027-08-10",
        supplier: "Thực phẩm Minh Long",
        supplierId: "sup-minh-long",
        storageLocation: "Kho khô · Kệ B1",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 5. Ly nhựa 500ml
  {
    id: "plastic-cups-500",
    name: "Ly nhựa 500ml",
    unit: "cái",
    sku: "NL-LY-500",
    onHand: 350,
    usableStock: 350,
    unitCost: 750,
    supplier: "Bao bì Việt Pack",
    supplierId: "sup-viet-pack",
    leadTimeDays: 3,
    packSize: 500,
    packCount: 2,
    moq: 500,
    orderQty: 1000,
    cost: 750_000,
    orderNeeded: true,
    daysOfSupply: 1.8,
    p25: 980,
    p50: 1350,
    p75: 1650,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "LEAD_TIME_PRESSURE",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Tồn kho ly nhựa chỉ còn 350 cái trong khi nhu cầu dự kiến 1.350 cái. Đề xuất đặt 2 thùng (1.000 cái).",
    dailyForecast: [
      { date: "20/08", p25: 120, p50: 170, p75: 210 },
      { date: "21/08", p25: 130, p50: 185, p75: 225 },
      { date: "22/08", p25: 145, p50: 200, p75: 245 },
      { date: "23/08", p25: 175, p50: 240, p75: 290 },
      { date: "24/08", p25: 165, p50: 230, p75: 280 },
      { date: "25/08", p25: 135, p50: 180, p75: 220 },
      { date: "26/08", p25: 110, p50: 145, p75: 180 },
    ],
    lots: [
      {
        lotId: "lot-ly500-01",
        batchId: "LOT-LY500-20260815-01",
        quantity: 350,
        usableQuantity: 350,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-15",
        expiryDate: "2028-12-31",
        supplier: "Bao bì Việt Pack",
        supplierId: "sup-viet-pack",
        storageLocation: "Kho bao bì · Kệ P1",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 6. Chuối
  {
    id: "banana",
    name: "Chuối",
    unit: "kg",
    sku: "NL-CHUOI-001",
    onHand: 8,
    usableStock: 8,
    unitCost: 24_000,
    supplier: "Nông sản An Phú",
    supplierId: "sup-an-phu",
    leadTimeDays: 1,
    packSize: 5,
    packCount: 4,
    moq: 5,
    orderQty: 20,
    cost: 480_000,
    orderNeeded: true,
    daysOfSupply: 1.5,
    p25: 26,
    p50: 36,
    p75: 45,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "EXPIRING_INVENTORY",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Chuối tươi có hạn dùng ngắn (hết hạn 26/08). Cần nhập 4 rổ (20kg) để bù đắp.",
    dailyForecast: [
      { date: "20/08", p25: 3.2, p50: 4.5, p75: 5.6 },
      { date: "21/08", p25: 3.5, p50: 4.9, p75: 6.0 },
      { date: "22/08", p25: 3.9, p50: 5.4, p75: 6.8 },
      { date: "23/08", p25: 4.6, p50: 6.5, p75: 8.0 },
      { date: "24/08", p25: 4.3, p50: 6.0, p75: 7.5 },
      { date: "25/08", p25: 3.6, p50: 4.8, p75: 6.0 },
      { date: "26/08", p25: 2.9, p50: 3.9, p75: 5.1 },
    ],
    lots: [
      {
        lotId: "lot-chuoi-01",
        batchId: "LOT-CHUOI-20260818-01",
        quantity: 8,
        usableQuantity: 8,
        expiringQuantity: 8,
        expiredQuantity: 0,
        receivedDate: "2026-08-18",
        expiryDate: "2026-08-26",
        supplier: "Nông sản An Phú",
        supplierId: "sup-an-phu",
        storageLocation: "Kho mát · Kệ F1",
        status: "expiring",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 7. Trân châu
  {
    id: "tapioca-pearls",
    name: "Trân châu",
    unit: "kg",
    sku: "NL-TRANCHAU-001",
    onHand: 4,
    usableStock: 4,
    unitCost: 48_000,
    supplier: "Nguyên liệu Trà Việt",
    supplierId: "sup-tra-viet",
    leadTimeDays: 2,
    packSize: 5,
    packCount: 3,
    moq: 10,
    orderQty: 15,
    cost: 720_000,
    orderNeeded: true,
    daysOfSupply: 2.0,
    p25: 10,
    p50: 14,
    p75: 18,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "PACK_SIZE_ROUNDING",
      "MOQ_CONSTRAINT",
    ],
    explanationSnippet:
      "Tồn kho trân châu chỉ còn 4kg, dự báo nhu cầu 14kg. Đề xuất đặt 3 bao (15kg).",
    dailyForecast: [
      { date: "20/08", p25: 1.2, p50: 1.8, p75: 2.3 },
      { date: "21/08", p25: 1.4, p50: 2.0, p75: 2.5 },
      { date: "22/08", p25: 1.5, p50: 2.2, p75: 2.8 },
      { date: "23/08", p25: 1.9, p50: 2.7, p75: 3.4 },
      { date: "24/08", p25: 1.8, p50: 2.5, p75: 3.2 },
      { date: "25/08", p25: 1.3, p50: 1.8, p75: 2.3 },
      { date: "26/08", p25: 0.9, p50: 1.0, p75: 1.5 },
    ],
    lots: [
      {
        lotId: "lot-tran-01",
        batchId: "LOT-TRAN-20260816-01",
        quantity: 4,
        usableQuantity: 4,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-16",
        expiryDate: "2026-10-15",
        supplier: "Nguyên liệu Trà Việt",
        supplierId: "sup-tra-viet",
        storageLocation: "Kho khô · Kệ B3",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 8. Trà đen
  {
    id: "black-tea",
    name: "Trà đen",
    unit: "kg",
    sku: "NL-TRADEN-001",
    onHand: 2.5,
    usableStock: 2.5,
    unitCost: 140_000,
    supplier: "Nguyên liệu Trà Việt",
    supplierId: "sup-tra-viet",
    leadTimeDays: 3,
    packSize: 1,
    packCount: 6,
    moq: 5,
    orderQty: 6,
    cost: 840_000,
    orderNeeded: true,
    daysOfSupply: 3.0,
    p25: 5.2,
    p50: 7.0,
    p75: 8.8,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "LEAD_TIME_PRESSURE",
      "MOQ_CONSTRAINT",
    ],
    explanationSnippet:
      "Trà đen Bảo Lộc cần 6 gói (6kg) để đảm bảo không bị thiếu cốt trà pha chế trong tuần.",
    dailyForecast: [
      { date: "20/08", p25: 0.65, p50: 0.9, p75: 1.15 },
      { date: "21/08", p25: 0.7, p50: 0.95, p75: 1.2 },
      { date: "22/08", p25: 0.75, p50: 1.05, p75: 1.3 },
      { date: "23/08", p25: 0.95, p50: 1.3, p75: 1.6 },
      { date: "24/08", p25: 0.9, p50: 1.2, p75: 1.5 },
      { date: "25/08", p25: 0.7, p50: 0.9, p75: 1.15 },
      { date: "26/08", p25: 0.55, p50: 0.7, p75: 0.9 },
    ],
    lots: [
      {
        lotId: "lot-traden-01",
        batchId: "LOT-TRADEN-20260811-01",
        quantity: 2.5,
        usableQuantity: 2.5,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-11",
        expiryDate: "2027-02-11",
        supplier: "Nguyên liệu Trà Việt",
        supplierId: "sup-tra-viet",
        storageLocation: "Kho khô · Kệ A4",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 9. Cam (2 Lots)
  {
    id: "orange",
    name: "Cam",
    unit: "kg",
    sku: "NL-CAM-001",
    onHand: 8.28,
    usableStock: 8.28,
    unitCost: 27_520,
    supplier: "Nông sản An Phú",
    supplierId: "sup-an-phu",
    leadTimeDays: 1,
    packSize: 5,
    packCount: 5,
    moq: 10,
    orderQty: 25,
    cost: 688_000,
    orderNeeded: true,
    daysOfSupply: 2.2,
    p25: 22,
    p50: 32,
    p75: 40,
    reasons: [
      "DEMAND_EXCEEDS_AVAILABLE_SUPPLY",
      "PACK_SIZE_ROUNDING",
    ],
    explanationSnippet:
      "Cam tươi vắt nước tiêu thụ mạnh, tồn kho 8.28kg chỉ đủ 2 ngày. Đề xuất nhập 5 túi (25kg).",
    dailyForecast: [
      { date: "20/08", p25: 2.8, p50: 4.0, p75: 5.0 },
      { date: "21/08", p25: 3.0, p50: 4.4, p75: 5.5 },
      { date: "22/08", p25: 3.4, p50: 4.8, p75: 6.0 },
      { date: "23/08", p25: 4.2, p50: 5.8, p75: 7.2 },
      { date: "24/08", p25: 3.8, p50: 5.4, p75: 6.8 },
      { date: "25/08", p25: 2.8, p50: 4.2, p75: 5.2 },
      { date: "26/08", p25: 2.0, p50: 3.4, p75: 4.3 },
    ],
    lots: [
      {
        lotId: "lot-cam-01",
        batchId: "LOT-CAM-20260819-01",
        quantity: 3.28,
        usableQuantity: 3.28,
        expiringQuantity: 3.28,
        expiredQuantity: 0,
        receivedDate: "2026-08-19",
        expiryDate: "2026-08-24",
        supplier: "Nông sản An Phú",
        supplierId: "sup-an-phu",
        storageLocation: "Kho mát · Kệ F2",
        status: "expiring",
        lastCounted: "2026-08-19",
        version: 1,
      },
      {
        lotId: "lot-cam-02",
        batchId: "LOT-CAM-20260820-01",
        quantity: 5.0,
        usableQuantity: 5.0,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-20",
        expiryDate: "2026-08-29",
        supplier: "Nông sản An Phú",
        supplierId: "sup-an-phu",
        storageLocation: "Kho mát · Kệ F2",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
  // 10. Cà phê hạt
  {
    id: "coffee-beans",
    name: "Cà phê hạt",
    unit: "kg",
    sku: "NL-CAFE-001",
    onHand: 5,
    usableStock: 5,
    unitCost: 180_000,
    supplier: "Highland Roastery Supply",
    supplierId: "sup-highland",
    leadTimeDays: 3,
    packSize: 5,
    packCount: 0,
    moq: 5,
    orderQty: 0,
    cost: 0,
    orderNeeded: false,
    daysOfSupply: 8.5,
    p25: 8.5,
    p50: 11.5,
    p75: 14.5,
    reasons: [],
    explanationSnippet:
      "Tồn kho cà phê hạt còn 5kg, đủ dùng hơn 8 ngày. Kế hoạch hiện tại chưa cần đặt thêm.",
    dailyForecast: [
      { date: "20/08", p25: 1.1, p50: 1.5, p75: 1.9 },
      { date: "21/08", p25: 1.2, p50: 1.6, p75: 2.0 },
      { date: "22/08", p25: 1.3, p50: 1.7, p75: 2.1 },
      { date: "23/08", p25: 1.5, p50: 2.0, p75: 2.5 },
      { date: "24/08", p25: 1.4, p50: 1.9, p75: 2.4 },
      { date: "25/08", p25: 1.1, p50: 1.5, p75: 1.9 },
      { date: "26/08", p25: 0.9, p50: 1.3, p75: 1.7 },
    ],
    lots: [
      {
        lotId: "lot-cafe-01",
        batchId: "LOT-CAFE-20260814-01",
        quantity: 5,
        usableQuantity: 5,
        expiringQuantity: 0,
        expiredQuantity: 0,
        receivedDate: "2026-08-14",
        expiryDate: "2027-02-14",
        supplier: "Highland Roastery Supply",
        supplierId: "sup-highland",
        storageLocation: "Kho khô · Kệ C1",
        status: "healthy",
        lastCounted: "2026-08-19",
        version: 1,
      },
    ],
  },
];

/** ════════════════════════════════════════════════════════════════════
    12 SHELFCASH MENU PRODUCTS & RECIPES (HAPPY PATH)
════════════════════════════════════════════════════════════════════ */

export interface MockProductDef {
  productId: string;
  sku: string;
  product: string;
  category: string;
  price: number;
  itemType: "single" | "combo";
  sellingUnit: string;
  status: "active" | "inactive";
  recipeStatus: "Hoàn chỉnh" | "Thiếu định lượng";
  recipeVersion: number;
  effectiveDate: string;
  recipeYieldQuantity: number;
  recipeProcessLossRate: number;
  recipeLines: Array<{
    ingredientId: string;
    ingredient: string;
    quantity: number;
    unit: string;
  }>;
  components?: Array<{
    componentProductId: string;
    quantity: number;
  }>;
}

export const MOCK_MENU_PRODUCTS: MockProductDef[] = [
  // 1. Cà phê đen đá
  {
    productId: "PROD_CAFE_DEN",
    sku: "SP-CAFE-DEN",
    product: "Cà phê đen đá",
    category: "Cà phê",
    price: 29_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.05,
    recipeLines: [
      { ingredientId: "coffee-beans", ingredient: "Cà phê hạt", quantity: 0.022, unit: "kg" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 2. Cà phê sữa đá
  {
    productId: "PROD_CAFE_SUA",
    sku: "SP-CAFE-SUA",
    product: "Cà phê sữa đá",
    category: "Cà phê",
    price: 35_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.05,
    recipeLines: [
      { ingredientId: "coffee-beans", ingredient: "Cà phê hạt", quantity: 0.02, unit: "kg" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.04, unit: "L" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 3. Trà đào
  {
    productId: "PROD_TRA_DAO",
    sku: "SP-TRA-DAO",
    product: "Trà đào",
    category: "Trà",
    price: 39_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.02,
    recipeLines: [
      { ingredientId: "black-tea", ingredient: "Trà đen", quantity: 0.012, unit: "kg" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.02, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 4. Trà sữa trân châu
  {
    productId: "PROD_TRA_SUA",
    sku: "SP-TRA-SUA",
    product: "Trà sữa trân châu",
    category: "Trà",
    price: 45_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 2,
    effectiveDate: "2026-08-10",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.03,
    recipeLines: [
      { ingredientId: "black-tea", ingredient: "Trà đen", quantity: 0.015, unit: "kg" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.035, unit: "L" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.06, unit: "L" },
      { ingredientId: "tapioca-pearls", ingredient: "Trân châu", quantity: 0.05, unit: "kg" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 5. Matcha Latte
  {
    productId: "PROD_MATCHA_LATTE",
    sku: "SP-MATCHA-LATTE",
    product: "Matcha Latte",
    category: "Matcha",
    price: 49_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.02,
    recipeLines: [
      { ingredientId: "matcha-powder", ingredient: "Bột matcha", quantity: 0.008, unit: "kg" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.18, unit: "L" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.02, unit: "L" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 6. Sinh tố chuối
  {
    productId: "PROD_SINH_TO_CHUOI",
    sku: "SP-SINH-TO-CHUOI",
    product: "Sinh tố chuối",
    category: "Sinh tố",
    price: 45_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.05,
    recipeLines: [
      { ingredientId: "banana", ingredient: "Chuối", quantity: 0.15, unit: "kg" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.12, unit: "L" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.025, unit: "L" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 7. Nước cam
  {
    productId: "PROD_NUOC_CAM",
    sku: "SP-NUOC-CAM",
    product: "Nước cam",
    category: "Nước trái cây",
    price: 42_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.08,
    recipeLines: [
      { ingredientId: "orange", ingredient: "Cam", quantity: 0.35, unit: "kg" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.02, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 8. Cà phê sữa đặc biệt
  {
    productId: "PROD_SIGNATURE_COFFEE",
    sku: "SP-SIGNATURE-COFFEE",
    product: "Cà phê sữa đặc biệt",
    category: "Signature",
    price: 49_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-05",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.04,
    recipeLines: [
      { ingredientId: "coffee-beans", ingredient: "Cà phê hạt", quantity: 0.025, unit: "kg" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.08, unit: "L" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.035, unit: "L" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 9. Matcha Kem Sữa
  {
    productId: "PROD_MATCHA_CREAM",
    sku: "SP-MATCHA-CREAM",
    product: "Matcha Kem Sữa",
    category: "Signature",
    price: 55_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-05",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.02,
    recipeLines: [
      { ingredientId: "matcha-powder", ingredient: "Bột matcha", quantity: 0.01, unit: "kg" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.15, unit: "L" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.03, unit: "L" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 10. Trà đen sữa (inactive for diversity testing)
  {
    productId: "PROD_BLACK_MILK_TEA",
    sku: "SP-BLACK-MILK-TEA",
    product: "Trà đen sữa",
    category: "Trà",
    price: 42_000,
    itemType: "single",
    sellingUnit: "ly",
    status: "inactive",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0.03,
    recipeLines: [
      { ingredientId: "black-tea", ingredient: "Trà đen", quantity: 0.015, unit: "kg" },
      { ingredientId: "milk-fresh", ingredient: "Sữa tươi", quantity: 0.12, unit: "L" },
      { ingredientId: "condensed-milk", ingredient: "Sữa đặc", quantity: 0.02, unit: "L" },
      { ingredientId: "sugar", ingredient: "Đường", quantity: 0.015, unit: "kg" },
      { ingredientId: "plastic-cups-500", ingredient: "Ly nhựa 500ml", quantity: 1, unit: "cái" },
    ],
  },
  // 11. Combo Cà phê sáng
  {
    productId: "COMBO_BREAKFAST",
    sku: "SP-COMBO-SANG",
    product: "Combo Cà phê sáng",
    category: "Combo",
    price: 59_000,
    itemType: "combo",
    sellingUnit: "combo",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0,
    recipeLines: [],
    components: [
      { componentProductId: "PROD_CAFE_SUA", quantity: 1 },
      { componentProductId: "PROD_CAFE_DEN", quantity: 1 },
    ],
  },
  // 12. Combo Bạn bè
  {
    productId: "COMBO_FRIENDS",
    sku: "SP-COMBO-BAN-BE",
    product: "Combo Bạn bè",
    category: "Combo",
    price: 119_000,
    itemType: "combo",
    sellingUnit: "combo",
    status: "active",
    recipeStatus: "Hoàn chỉnh",
    recipeVersion: 1,
    effectiveDate: "2026-08-01",
    recipeYieldQuantity: 1,
    recipeProcessLossRate: 0,
    recipeLines: [],
    components: [
      { componentProductId: "PROD_MATCHA_LATTE", quantity: 1 },
      { componentProductId: "PROD_TRA_SUA", quantity: 1 },
      { componentProductId: "PROD_SINH_TO_CHUOI", quantity: 1 },
    ],
  },
];

/** In-memory dynamic store for interactive menu editing during session */
let memoryMenuProducts: MockProductDef[] = JSON.parse(JSON.stringify(MOCK_MENU_PRODUCTS));

export function getMockMenuProducts(): MockProductDef[] {
  return memoryMenuProducts;
}

export function resetMockMenuProducts(): void {
  memoryMenuProducts = JSON.parse(JSON.stringify(MOCK_MENU_PRODUCTS));
}

/** Convert MockProductDef into API Record for MenuItem */
export function buildMockMenuItemRecord(product: MockProductDef): ApiRecord {
  const singleProducts = memoryMenuProducts.filter((p) => p.itemType === "single");

  const components = (product.components ?? []).map((comp) => {
    const single = singleProducts.find((p) => p.productId === comp.componentProductId);
    const unitPrice = single?.price ?? 0;
    return {
      component_product_id: comp.componentProductId,
      sku: single?.sku ?? "",
      product: single?.product ?? "",
      quantity: comp.quantity,
      selling_unit: single?.sellingUnit ?? "ly",
      unit_price: unitPrice,
      line_list_price: comp.quantity * unitPrice,
    };
  });

  const calculatedListPrice =
    product.itemType === "combo"
      ? components.reduce((sum, c) => sum + c.line_list_price, 0)
      : product.price;

  const savingsAmount = Math.max(calculatedListPrice - product.price, 0);
  const discountRate = calculatedListPrice > 0 ? savingsAmount / calculatedListPrice : 0;

  return {
    product_id: product.productId,
    sku: product.sku,
    product: product.product,
    category: product.category,
    item_type: product.itemType,
    selling_unit: product.sellingUnit,
    price: product.price,
    list_price: calculatedListPrice,
    savings_amount: savingsAmount,
    discount_rate: discountRate,
    status: product.status,
    currency: "VND",
    version: product.recipeVersion,
    components,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
  };
}

/** Build RecipeDetail for a specific product */
export function buildMockRecipeDetail(productId: string): RecipeDetail | null {
  const prod = memoryMenuProducts.find((p) => p.productId === productId);
  if (!prod) return null;

  return {
    product_id: prod.productId,
    product: prod.product,
    recipe_version_id: `rec-ver-${prod.productId}-v${prod.recipeVersion}`,
    version: prod.recipeVersion,
    effective_from: prod.effectiveDate,
    effective_to: null,
    yield_quantity: prod.recipeYieldQuantity,
    process_loss_rate: prod.recipeProcessLossRate,
    lines: prod.recipeLines.map((line) => ({
      ingredient_id: line.ingredientId,
      ingredient_name: line.ingredient,
      ingredient: line.ingredient,
      quantity: line.quantity,
      ingredient_quantity: line.quantity,
      unit: line.unit,
      ingredient_unit: line.unit,
    })),
  };
}

/** Build the DecisionBriefFacts fixture */
export function buildMockDecisionBrief(today: string = "2026-08-20"): DecisionBriefFacts {
  const procurementRows: ProcurementRow[] = MOCK_INGREDIENTS.filter(
    (i) => i.orderNeeded
  ).map((i) => {
    const orderDate = today;
    const arrivalDate = new Date(`${today}T00:00:00Z`);
    arrivalDate.setUTCDate(arrivalDate.getUTCDate() + i.leadTimeDays);

    return {
      ingredient_id: i.id,
      ingredient_name: i.name,
      supplier_id: i.supplierId,
      supplier_name: i.supplier,
      quantity: i.orderQty,
      unit: i.unit,
      pack_count: i.packCount,
      pack_size: i.packSize,
      order_date: orderDate,
      arrival_date: arrivalDate.toISOString().slice(0, 10),
      purchase_cost: i.cost,
      reason_codes: i.reasons,
    };
  });

  const ingredientDemandRows: IngredientDemandRow[] = MOCK_INGREDIENTS.map((i) => ({
    ingredient_id: i.id,
    ingredient_name: i.name,
    unit: i.unit,
    p25: i.p25,
    p50: i.p50,
    p75: i.p75,
    contributions: [],
  }));

  const totalCost = procurementRows.reduce((sum, row) => sum + (row.purchase_cost ?? 0), 0);

  return {
    decision_run_id: MOCK_DECISION_RUN_ID,
    store_id: MOCK_STORE_ID,
    status: "completed",
    forecast: {
      forecast_run_id: MOCK_FORECAST_RUN_ID,
      model_version: "v2.4-stochastic-saa",
      horizon_days: 7,
      cutoff_date: today,
    },
    recommendation: {
      available: true,
      strategy: "protected",
      summary:
        "Kế hoạch nhập hàng An toàn (Protected) được đề xuất: Nhập 9 nguyên liệu thiết yếu với tổng chi phí 8.338.000 ₫ nhằm duy trì Fill Rate 98.8% và ngăn chặn rủi ro thiếu hàng.",
      total_purchase_cost: totalCost,
      expected_fill_rate: 0.988,
    },
    procurement_rows: procurementRows,
    ingredient_demand: ingredientDemandRows,
    risk: {
      stockout_probability: 0.015,
      expected_fill_rate: 0.988,
      shortage_quantity: 0,
      waste_quantity: 0,
    },
    critic: {
      hard_violations: [],
      warnings: [
        "Sữa đặc và Bột matcha có thời gian giao hàng 3-4 ngày, cần gửi đơn đặt hàng sớm trong hôm nay.",
      ],
    },
    evidence: [],
    data_availability: {
      sales_history: "available",
      inventory: "available",
      recipes: "available",
    },
    generated_at: new Date().toISOString(),
  };
}

/** Build the DecisionPackage fixture */
export function buildMockDecisionPackage(today: string = "2026-08-20"): DecisionPackage {
  const brief = buildMockDecisionBrief(today);
  return {
    decision_run_id: MOCK_DECISION_RUN_ID,
    status: "completed",
    as_of_date: today,
    horizon_days: 7,
    recommended_strategy: "protected",
    business_metrics: {
      projected_purchase_cost: brief.recommendation.total_purchase_cost,
      expected_fill_rate: 0.988,
      stockout_probability: 0.015,
      expected_waste_quantity: 0,
    },
    recommended_plan: {
      valid: true,
      items: brief.procurement_rows.map((row) => ({
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name ?? undefined,
        quantity: row.quantity,
        unit: row.unit ?? undefined,
        supplier_name: row.supplier_name,
        supplier_id: row.supplier_id,
        order_date: row.order_date,
        expected_arrival_date: row.arrival_date,
        estimated_cost: row.purchase_cost,
      })),
    },
    strategies: [
      {
        strategy: "protected",
        feasible: true,
        business_metrics: {
          projected_purchase_cost: 8_338_000,
          expected_fill_rate: 0.988,
          stockout_probability: 0.015,
        },
      },
      {
        strategy: "balanced",
        feasible: true,
        business_metrics: {
          projected_purchase_cost: 7_650_000,
          expected_fill_rate: 0.965,
          stockout_probability: 0.038,
        },
      },
      {
        strategy: "lean",
        feasible: true,
        business_metrics: {
          projected_purchase_cost: 6_890_000,
          expected_fill_rate: 0.920,
          stockout_probability: 0.082,
        },
      },
    ],
    inventory_risk: MOCK_INGREDIENTS.map((i) => ({
      ingredient_id: i.id,
      ingredient_name: i.name,
      stockout_probability: i.orderNeeded ? (i.daysOfSupply <= 2 ? 0.08 : 0.03) : 0.005,
      expected_shortage: 0,
      days_of_supply: i.daysOfSupply,
      risk_category: i.orderNeeded ? "high" : "low",
    })),
  };
}

/** Build contextual AI Explanation response */
export function buildMockExplanation(
  request: ExplanationRequest
): DecisionExplanationResponse {
  const q = (request.question || "").toLowerCase();

  let answer =
    "ShelfCash đề xuất kế hoạch An toàn (Protected) với tổng chi phí 8.338.000 ₫ cho 9 nguyên liệu. Kế hoạch này được tối ưu dựa trên phân tích xác suất nhu cầu 7 ngày tới, tính toán buffer an toàn trước thời gian giao hàng của NCC.";

  if (q.includes("chọn kế hoạch") || q.includes("tại sao chọn")) {
    answer =
      "Chiến lược An toàn (Protected) được chọn vì mô hình phát hiện biến động nhu cầu tăng vào dịp cuối tuần sắp tới. Kế hoạch đảm bảo tỷ lệ đáp ứng đơn hàng (Fill Rate) đạt 98.8% với chi phí 8.338.000 ₫ (vẫn nằm trong 68% ngân sách khả dụng).";
  } else if (q.includes("mặt hàng") || q.includes("sữa") || q.includes("tại sao phải")) {
    answer =
      "Đặc biệt đối với Sữa tươi (còn 18L, đủ 2,1 ngày) và Sữa đặc (còn 1,67L, đủ 1,2 ngày), tốc độ tiêu thụ hàng ngày vượt quá lượng tồn an toàn. Do NCC giao trong 2-3 ngày và bán theo thùng 24L, hệ thống đề xuất đặt ngay 2 thùng sữa tươi và 1 thùng sữa đặc.";
  } else if (q.includes("thiếu hàng") || q.includes("rủi ro")) {
    answer =
      "Rủi ro thiếu hàng tổng thể của quán được kiểm soát ở mức cực thấp 1.5%. Điểm rủi ro duy nhất là nếu đặt hàng trễ hôm nay, Sữa đặc có thể bị cạn kho tạm thời vào chiều ngày 22/08.";
  } else if (q.includes("ngân sách") || q.includes("vượt")) {
    answer =
      "Kế hoạch KHÔNG vượt ngân sách. Tổng chi phí là 8.338.000 ₫ trên tổng hạn mức tháng 15.000.000 ₫, chiếm khoảng 55.6% ngân sách của chu kỳ hiện tại.";
  }

  return {
    source: "shelfcash-decision-engine-v2",
    language: "vi",
    detail_level: "simple",
    intent: "explain_procurement_plan",
    decision_run_id: MOCK_DECISION_RUN_ID,
    summary: "Giải thích cơ sở ra quyết định của thuật toán tối ưu nhập hàng ShelfCash",
    answer,
    why_this_plan: [
      "Bảo vệ nguồn cung trước nhu cầu cao điểm cuối tuần",
      "Tối ưu chi phí vận chuyển bằng cách gộp đơn NCC",
      "Làm tròn theo quy cách đóng gói (thùng/bao) giúp hưởng giá sỉ",
    ],
    main_risks: [
      "Nhà cung cấp Sữa Việt có thể giao trễ nếu đặt sau 15:00 hôm nay",
      "Chuối có 3kg sắp hết hạn cần ưu tiên xuất kho trước (FEFO)",
    ],
    tradeoffs: [
      "Chi phí tồn trữ cao hơn 8.5% so với chiến lược Tiết kiệm để đổi lấy 98.8% Fill Rate",
    ],
    important_assumptions: [
      "Lead time nhà cung cấp đúng cam kết (1-3 ngày)",
      "Không có biến động đột biến ngoài dự báo thời tiết",
    ],
    entities: {
      ingredient_ids: ["ing_01", "ing_02", "ing_04"],
      supplier_ids: ["sup_01", "sup_02"],
    },
    claims: [
      {
        type: "cost",
        value: 8338000,
        unit: "VND",
        evidence_ids: ["ev_plan_01"],
      },
    ],
    citations: [
      {
        evidence_id: "ev_plan_01",
        label: "Kế hoạch nhập hàng tối ưu",
        source_type: "decision_plan",
      },
    ],
    grounded: true,
    provider: "shelfcash_decision_intelligence",
  };
}

/** Build dynamic What-If simulation response */
export function buildMockWhatIfResponse(
  mutation: WhatIfRequest,
  today: string = "2026-08-20"
): WhatIfResponse {
  const multiplier = mutation.demand_multiplier ?? 1.0;
  const delay = mutation.supplier_delay_days ?? 0;
  const baseBrief = buildMockDecisionBrief(today);
  const baseCost = baseBrief.recommendation.total_purchase_cost ?? 8_338_000;

  const costMultiplier = multiplier * (1 + delay * 0.04);
  const hypotheticalCost = Math.round(baseCost * costMultiplier);
  const costDelta = hypotheticalCost - baseCost;

  const fillRateDelta = multiplier > 1 && delay > 0 ? -0.018 : 0.012;
  const stockoutRiskDelta = delay > 0 ? 0.024 * delay : multiplier > 1 ? 0.008 : -0.005;

  const hypotheticalRows: ProcurementRow[] = baseBrief.procurement_rows.map((row) => {
    const extraPacks = multiplier > 1.15 || delay >= 2 ? 1 : 0;
    const packCount = (row.pack_count ?? 1) + extraPacks;
    const packSize = row.pack_size ?? 1;
    const quantity = packCount * packSize;
    const cost = Math.round((row.purchase_cost ?? 0) * (quantity / (row.quantity || 1)));

    return {
      ...row,
      pack_count: packCount,
      quantity,
      purchase_cost: cost,
    };
  });

  const hypotheticalBrief: DecisionBriefFacts = {
    ...baseBrief,
    recommendation: {
      ...baseBrief.recommendation,
      total_purchase_cost: hypotheticalCost,
      expected_fill_rate: Math.min(1, Math.max(0, (baseBrief.recommendation.expected_fill_rate ?? 0.988) + fillRateDelta)),
    },
    risk: {
      ...baseBrief.risk,
      stockout_probability: Math.min(1, Math.max(0, (baseBrief.risk?.stockout_probability ?? 0.015) + stockoutRiskDelta)),
      expected_fill_rate: Math.min(1, Math.max(0, (baseBrief.risk?.expected_fill_rate ?? 0.988) + fillRateDelta)),
    },
    procurement_rows: hypotheticalRows,
    ingredient_demand: baseBrief.ingredient_demand.map((d) => ({
      ...d,
      p50: d.p50 ? Math.round(d.p50 * multiplier) : null,
    })),
  };

  return {
    decision_run_id: MOCK_DECISION_RUN_ID,
    baseline: baseBrief,
    hypothetical: hypotheticalBrief,
    mutations: mutation,
    comparison: {
      recommendation_changed: false,
      baseline_strategy: "protected",
      hypothetical_strategy: "protected",
      purchase_cost_delta: costDelta,
      expected_fill_rate_delta: fillRateDelta,
      stockout_probability_delta: stockoutRiskDelta,
      shortage_quantity_delta: 0,
      waste_quantity_delta: 0,
      order_changes: [],
      warnings_added: [],
      warnings_removed: [],
      hard_violations_added: [],
      hard_violations_removed: [],
    },
    grounded_explanation: {
      answer: `Khi nhu cầu tăng ${(multiplier * 100 - 100).toFixed(0)}% và trễ giao hàng ${delay} ngày, chi phí nhập hàng dự kiến tăng thêm ${costDelta.toLocaleString("vi-VN")} ₫ để bảo đảm không đứt gãy nguồn cung.`,
      citations: [
        {
          evidence_id: "ev_whatif_01",
          label: "Mô phỏng thay đổi tham số What-If",
          source_type: "what_if_simulation",
        },
      ],
      grounded: true,
      authority: "HYPOTHETICAL",
    },
    generated_at: new Date().toISOString(),
  };
}

/** Build full StoreBootstrapResponse fixture including 12 Menu Products & Recipes */
export function buildMockBootstrapResponse(today: string = "2026-08-20"): StoreBootstrapResponse {
  const menuRecords = memoryMenuProducts.map(buildMockMenuItemRecord);

  const productRecords = memoryMenuProducts.map((p) => ({
    product_id: p.productId,
    sku: p.sku,
    product: p.product,
    price: p.price,
    item_type: p.itemType,
    status: p.status,
    selling_unit: p.sellingUnit,
    recipe_status: p.recipeStatus,
    recipe_version: p.recipeVersion,
    effective_date: p.effectiveDate,
    recipe_yield_quantity: p.recipeYieldQuantity,
    recipe_process_loss_rate: p.recipeProcessLossRate,
  }));

  const recipeRecords: ApiRecord[] = memoryMenuProducts
    .filter((p) => p.itemType === "single")
    .map((p) => ({
      product_id: p.productId,
      product: p.product,
      recipe_version: p.recipeVersion,
      effective_from: p.effectiveDate,
      yield_quantity: p.recipeYieldQuantity,
      process_loss_rate: p.recipeProcessLossRate,
      lines: p.recipeLines.map((line) => ({
        ingredient_id: line.ingredientId,
        ingredient_name: line.ingredient,
        quantity: line.quantity,
        unit: line.unit,
      })),
    }));

  return {
    today,
    store: {
      store_id: MOCK_STORE_ID,
      store_name: "ShelfCash Flagship Coffee & Tea",
      timezone: "Asia/Ho_Chi_Minh",
      currency: "VND",
    },
    inventory: MOCK_INGREDIENTS.flatMap((i) => {
      return i.lots.map((lot) => ({
        lot_id: lot.lotId,
        batch_id: lot.batchId,
        ingredient_id: i.id,
        ingredient: i.name,
        sku: i.sku,
        unit: i.unit,
        on_hand: lot.quantity,
        quantity: lot.quantity,
        usable_quantity: lot.usableQuantity,
        expiring_quantity: lot.expiringQuantity ?? 0,
        expired_quantity: lot.expiredQuantity ?? 0,
        unit_cost: i.unitCost,
        received_date: lot.receivedDate,
        expiry_date: lot.expiryDate,
        supplier: lot.supplier,
        supplier_name: lot.supplier,
        supplier_id: lot.supplierId,
        storage_location: lot.storageLocation,
        status: lot.status,
        snapshot_date: lot.lastCounted,
        version: lot.version ?? 1,
      }));
    }),
    products: productRecords,
    menu: menuRecords,
    recipes: recipeRecords,
    supplier_constraints: MOCK_INGREDIENTS.map((i) => ({
      ingredient_id: i.id,
      ingredient: i.name,
      supplier_id: i.supplierId,
      supplier_name: i.supplier,
      lead_time_days: i.leadTimeDays,
      moq: i.moq,
      pack_size: i.packSize,
      unit_cost: i.unitCost,
      unit: i.unit,
      version: 1,
    })),
    aliases: [],
    future_calendar: [],
    settings: {
      monthly_budget: 15_000_000,
      spent_budget: 3_200_000,
      remaining_budget: 11_800_000,
      forecast_horizon: 7,
      default_strategy: "safe",
    },
    latest_runs: {
      forecast_run_id: MOCK_FORECAST_RUN_ID,
      plan_run_id: MOCK_DECISION_RUN_ID,
    },
    data_freshness: {
      inventory_synced_at: new Date().toISOString(),
      sales_synced_at: new Date().toISOString(),
    },
  };
}

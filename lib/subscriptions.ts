/**
 * Central Subscription & Pricing Configuration for ShelfCash
 * 
 * Philosophy:
 * - FREE: Understand current operational state (NOW)
 * - FORECAST: Plan for future demand & procurement (NEXT) [Recommended Monthly Subscription]
 * - DECISION: Deeply understand, explain & discuss decisions with AI (WHY / WHAT-IF)
 * - POSTPAID (TRẢ SAU): Flexible pay-as-you-go billing model without monthly commitment (USE WHEN NEEDED)
 */

export type PlanId = "free" | "forecast" | "decision" | "postpaid";

export interface PlanFeature {
  text: string;
  detail?: string;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  badgeLabel?: string;
  priceMonthly: number;
  priceFormatted: string;
  priceUnit: string;
  subPrice?: string;
  recommended?: boolean;
  description: string;
  ctaText: string;
  includesPrevious?: string;
  features: PlanFeature[];
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "FREE",
    priceMonthly: 0,
    priceFormatted: "0đ",
    priceUnit: "",
    description: "Quản lý dữ liệu và vận hành cơ bản.",
    ctaText: "Gói hiện tại",
    features: [
      { text: "Nhập dữ liệu từ Excel" },
      { text: "Theo dõi tồn kho và lô hàng" },
      { text: "FEFO & theo dõi hạn sử dụng" },
      { text: "Quản lý Menu và công thức" },
      { text: "Kiểm tra dữ liệu vận hành cơ bản" },
    ],
  },
  forecast: {
    id: "forecast",
    name: "FORECAST",
    badgeLabel: "ĐỀ XUẤT",
    priceMonthly: 299000,
    priceFormatted: "299.000đ",
    priceUnit: "/ tháng",
    recommended: true,
    description: "Lập kế hoạch nhập hàng cho nhu cầu tương lai.",
    ctaText: "Nâng cấp Forecast",
    includesPrevious: "Bao gồm Free, và:",
    features: [
      { text: "Dự báo nhu cầu 7 ngày" },
      { text: "Khoảng nhu cầu P25 / P50 / P75" },
      { text: "Quy đổi nhu cầu theo nguyên liệu" },
      { text: "Kế hoạch nhập hàng 7 ngày" },
      { text: "3 chiến lược: Tiết kiệm · Cân bằng · An toàn" },
      { text: "Giả lập thay đổi kế hoạch (What-if)" },
    ],
  },
  decision: {
    id: "decision",
    name: "DECISION",
    priceMonthly: 599000,
    priceFormatted: "599.000đ",
    priceUnit: "/ tháng",
    description: "Hiểu và trao đổi sâu về các quyết định.",
    ctaText: "Nâng cấp Decision",
    includesPrevious: "Bao gồm Forecast, và:",
    features: [
      { text: "Trò chuyện với ShelfCash AI" },
      { text: "Giải thích lý do đề xuất nhập hàng" },
      { text: "Phân tích rủi ro theo kế hoạch" },
      { text: "What-if bằng hội thoại tương tác" },
      { text: "Câu trả lời dựa trên dữ liệu ShelfCash" },
    ],
  },
  postpaid: {
    id: "postpaid",
    name: "TRẢ SAU",
    badgeLabel: "LINH HOẠT",
    priceMonthly: 0,
    priceFormatted: "0đ",
    priceUnit: "phí cố định",
    subPrice: "Tính theo mức sử dụng",
    description: "Chỉ thanh toán cho những tính năng bạn thực sự sử dụng.",
    ctaText: "Chọn Trả sau",
    features: [
      { text: "Bao gồm toàn bộ tính năng Free" },
      { text: "Forecast tính theo lượt sử dụng" },
      { text: "Decision AI tính theo phiên sử dụng" },
      { text: "Không cam kết thuê bao tháng" },
      { text: "Theo dõi chi phí sử dụng" },
      { text: "Tổng hợp thanh toán vào cuối kỳ" },
    ],
  },
};

/**
 * Placeholder for future postpaid metered pricing configuration.
 * Avoids hardcoding ad-hoc prices in components.
 */
export interface PostpaidPricingConfig {
  forecastRun: number | null;
  decisionSession: number | null;
}

export const POSTPAID_PRICING_CONFIG: PostpaidPricingConfig = {
  forecastRun: null,
  decisionSession: null,
};

export type FeatureCapability =
  | "excel_import"
  | "inventory_fefo"
  | "menu_recipes"
  | "demand_forecast"
  | "procurement_planning"
  | "what_if_simulation"
  | "ai_decision_chat"
  | "ai_explanation";

export type Entitlement = "included" | "metered" | "locked";

export type PlanEntitlements = Record<FeatureCapability, Entitlement>;

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    excel_import: "included",
    inventory_fefo: "included",
    menu_recipes: "included",
    demand_forecast: "locked",
    procurement_planning: "locked",
    what_if_simulation: "locked",
    ai_decision_chat: "locked",
    ai_explanation: "locked",
  },
  forecast: {
    excel_import: "included",
    inventory_fefo: "included",
    menu_recipes: "included",
    demand_forecast: "included",
    procurement_planning: "included",
    what_if_simulation: "included",
    ai_decision_chat: "locked",
    ai_explanation: "locked",
  },
  decision: {
    excel_import: "included",
    inventory_fefo: "included",
    menu_recipes: "included",
    demand_forecast: "included",
    procurement_planning: "included",
    what_if_simulation: "included",
    ai_decision_chat: "included",
    ai_explanation: "included",
  },
  postpaid: {
    excel_import: "included",
    inventory_fefo: "included",
    menu_recipes: "included",
    demand_forecast: "metered",
    procurement_planning: "metered",
    what_if_simulation: "metered",
    ai_decision_chat: "metered",
    ai_explanation: "metered",
  },
};

export function getFeatureEntitlement(plan: PlanId, feature: FeatureCapability): Entitlement {
  return PLAN_ENTITLEMENTS[plan]?.[feature] ?? "locked";
}

export function canUseFeature(currentPlan: PlanId, feature: FeatureCapability): boolean {
  const entitlement = getFeatureEntitlement(currentPlan, feature);
  return entitlement === "included" || entitlement === "metered";
}

const STORAGE_KEY = "shelfcash_current_plan";

export function getStoredPlan(): PlanId {
  if (typeof window === "undefined") return "free";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      raw === "free" ||
      raw === "forecast" ||
      raw === "decision" ||
      raw === "postpaid"
    ) {
      return raw;
    }
  } catch {}
  return "free";
}

export function saveStoredPlan(planId: PlanId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, planId);
  } catch {}
}

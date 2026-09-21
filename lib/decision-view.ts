import type { BootstrapData, DecisionBriefFacts, DecisionPackage, PlanResponse } from "./types";

type RecordValue = Record<string, unknown>;

export type DecisionDemandContributionView = {
  productId: string;
  productName: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  forecastP25: number | null;
  forecastP50: number | null;
  forecastP75: number | null;
  recipeQuantity: number | null;
  recipeUnit: string;
  unit: string;
};

export type DecisionProductForecastView = {
  productId: string;
  productName: string;
  unit: string;
  points: Array<{
    targetDate: string;
    p25: number | null;
    p50: number | null;
    p75: number | null;
  }>;
};

export type DecisionDemandView = {
  ingredientId: string;
  ingredientName: string;
  targetDate: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  unit: string;
  contributions: DecisionDemandContributionView[];
};

export type DecisionRiskView = {
  ingredientId: string;
  ingredientName: string;
  stockoutDate?: string | null;
  shortageQuantity?: number | null;
  beginningInventory: number | null;
  fillRate?: number | null;
  stockoutProbability?: number | null;
  daysOfSupply?: number | null;
  riskCategory?: string | null;
  unit: string;
};

export type DecisionBlockerView = {
  title: string;
  observed: number | null;
  required: number | null;
};

export type DecisionStrategyView = {
  key: string;
  label: string;
  feasible: boolean | null;
  itemCount: number;
  purchaseCost: number | null;
  observedFillRate: number | null;
  requiredFillRate: number | null;
  items: Array<{
    ingredientId: string;
    ingredientName: string;
    supplierId: string;
    supplierName: string;
    orderQuantity: number | null;
    unit: string;
    packCount: number | null;
    packSize: number | null;
    unitPrice: number | null;
    purchaseCost: number | null;
    deliveryCost: number | null;
    orderDate: string;
    arrivalDate: string;
    emergency: boolean | null;
  }>;
};

export type DecisionRunView = {
  demand: DecisionDemandView[];
  dates: string[];
  productForecasts: DecisionProductForecastView[];
  risks: DecisionRiskView[];
  blockers: DecisionBlockerView[];
  warnings: string[];
  strategies: DecisionStrategyView[];
};

export type ProcurementIngredientRowView = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  onHand: number | null;
  inbound: number | null;
  safetyStock: number | null;
  supplierName: string;
  leadTimeDays: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  stockoutDate: string;
  shortageQuantity: number | null;
  recommendedQuantity: number | null;
  packCount: number | null;
  packSize: number | null;
  unitPrice: number | null;
  purchaseCost: number | null;
  feasible: boolean;
};

const strategyLabels: Record<string, string> = {
  lean: "Tiết kiệm",
  balanced: "Cân bằng",
  protected: "An toàn",
};

const warningCopy: Record<string, string> = {
  AGGREGATE_MODEL_COUNTS_UNKNOWN_EXPIRY_LOT:
    "Một phần tồn kho chưa có thông tin lô hoặc hạn dùng đầy đủ.",
  AGGREGATE_MODEL_EXCLUDED_PRESTART_EXPIRED_LOT:
    "Đã loại trừ tồn kho hết hạn trước ngày mô phỏng.",
  CAPACITY_NOT_EVALUATED: "Chưa đủ dữ liệu để đánh giá sức chứa kho.",
  RISK_METRIC_NOT_AVAILABLE: "Một số chỉ số rủi ro chưa thể tính.",
  SCENARIO_HISTORY_INSUFFICIENT:
    "Chưa đủ lịch sử để đánh giá đầy đủ các kịch bản.",
  SHORTAGE_COST_FALLBACK_USED:
    "Chi phí thiếu hàng đang dùng giá trị ước tính thay thế.",
  STRESS_SHORTAGE_OBSERVED:
    "Có thiếu hàng trong một kịch bản kiểm tra căng thẳng.",
};

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const candidate = record(value);
  return Object.keys(candidate).length ? Object.values(candidate) : [];
}

function text(source: RecordValue, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numeric(source: RecordValue, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boolean(source: RecordValue, keys: string[]): boolean | null {
  for (const key of keys) {
    if (typeof source[key] === "boolean") return source[key] as boolean;
  }
  return null;
}

function ingredientName(
  ingredientId: string,
  source: RecordValue,
  data?: BootstrapData | null,
): string {
  const direct = text(source, ["ingredient_name", "ingredient"]);
  if (direct) return direct;
  return (
    data?.ingredients?.find((item) => item.ingredientId === ingredientId)
      ?.ingredient ||
    data?.inventory?.find((item) => item.ingredientId === ingredientId)
      ?.ingredient ||
    "Nguyên liệu chưa xác định"
  );
}

function productName(
  productId: string,
  source: RecordValue,
  data?: BootstrapData | null,
): string {
  const direct = text(source, ["product_name", "product"]);
  if (direct) return direct;
  return (
    data?.products?.find((item) => item.productId === productId)?.product ||
    data?.menu?.find((item) => item.productId === productId)?.product ||
    "Món chưa xác định"
  );
}

function friendlyWarning(value: unknown): string {
  const source = record(value);
  const code = typeof value === "string" ? value : text(source, ["code"]);
  return (
    warningCopy[code] ||
    text(source, ["message"]) ||
    "Có một lưu ý kỹ thuật cần được kiểm tra thêm."
  );
}

function findingTitle(code: string): string {
  if (code === "EXACT_SIMULATION_SAFETY_FLOOR") {
    return "Mức đáp ứng thấp nhất trong các kịch bản chưa đạt ngưỡng yêu cầu.";
  }
  if (code === "SERVICE_LEVEL_REQUIREMENT") {
    return "Mức phục vụ yêu cầu chưa được đáp ứng.";
  }
  if (code === "SOLVER_STATUS:INFEASIBLE" || code === "INFEASIBLE") {
    return "Không tìm được tổ hợp mua hàng thỏa tất cả ràng buộc hiện tại.";
  }
  return "Một điều kiện lập kế hoạch chưa được đáp ứng.";
}

function findingMetrics(source: RecordValue): {
  observed: number | null;
  required: number | null;
} {
  const evidence = record(source.evidence);
  return {
    observed: numeric(evidence, [
      "observed",
      "observed_fill_rate",
      "actual",
      "value",
    ]),
    required: numeric(evidence, [
      "required",
      "required_fill_rate",
      "minimum",
      "threshold",
    ]),
  };
}

function strategyEntries(raw: RecordValue): Array<[string, RecordValue]> {
  if (Array.isArray(raw.strategies)) {
    return raw.strategies.map((value) => {
      const source = record(value);
      return [text(source, ["strategy", "mode"]) || "scenario", source];
    });
  }
  const strategies = record(raw.strategies);
  return Object.entries(strategies).map(([key, value]) => [key, record(value)]);
}

export function adaptDecisionRunView(
  decision: DecisionPackage | null,
  data: BootstrapData,
): DecisionRunView {
  const raw = record(decision);
  const demand = list(raw.ingredient_demand)
    .map((value) => {
      const source = record(value);
      const ingredientId = text(source, ["ingredient_id", "ingredientId"]);
      const contributions = list(source.contributions).map((contribution) => {
        const item = record(contribution);
        const productId = text(item, ["product_id", "productId"]);
        return {
          productId,
          productName: productName(productId, item, data),
          p25: numeric(item, ["contribution_p25", "p25"]),
          p50: numeric(item, ["contribution_p50", "p50"]),
          p75: numeric(item, ["contribution_p75", "p75"]),
          forecastP25: numeric(item, ["forecast_p25", "product_p25"]),
          forecastP50: numeric(item, ["forecast_p50", "product_p50"]),
          forecastP75: numeric(item, ["forecast_p75", "product_p75"]),
          recipeQuantity: numeric(item, ["recipe_quantity"]),
          recipeUnit: text(item, ["recipe_unit"]),
          unit: text(item, ["contribution_unit", "unit"]),
        };
      });
      return {
        ingredientId,
        ingredientName: ingredientName(ingredientId, source, data),
        targetDate: text(source, ["target_date", "date"]),
        p25: numeric(source, ["p25"]),
        p50: numeric(source, ["p50"]),
        p75: numeric(source, ["p75"]),
        unit: text(source, ["unit"]),
        contributions,
      };
    })
    .filter((item) => Boolean(item.targetDate))
    .sort(
      (left, right) =>
        left.targetDate.localeCompare(right.targetDate) ||
        left.ingredientName.localeCompare(right.ingredientName, "vi"),
    );
  const demandByIngredient = new Map(
    demand.map((item) => [item.ingredientId, item]),
  );
  const productForecastMap = new Map<string, DecisionProductForecastView>();
  for (const demandItem of demand) {
    for (const contribution of demandItem.contributions) {
      const key = contribution.productId || contribution.productName;
      if (!key) continue;
      const entry = productForecastMap.get(key) ?? {
        productId: contribution.productId,
        productName: contribution.productName,
        unit: "sản phẩm",
        points: [],
      };
      if (
        !entry.points.some(
          (point) => point.targetDate === demandItem.targetDate,
        )
      ) {
        entry.points.push({
          targetDate: demandItem.targetDate,
          p25: contribution.forecastP25,
          p50: contribution.forecastP50,
          p75: contribution.forecastP75,
        });
      }
      productForecastMap.set(key, entry);
    }
  }

  let rawRiskItems: unknown[] = [];
  if (Array.isArray(raw.inventory_risk)) {
    rawRiskItems = raw.inventory_risk;
  } else if (raw.inventory_risk && typeof raw.inventory_risk === "object") {
    const ir = record(raw.inventory_risk);
    if (Array.isArray(ir.results)) {
      const results = ir.results as RecordValue[];
      const p50Design =
        results.find((v) => record(v)?.scenario_id === "p50_design") ??
        results[0];
      const p50Record = record(p50Design);
      const summaryRecord = record(p50Record.summary);
      const byKey =
        summaryRecord.by_key ?? p50Record.by_key ?? p50Record.summary;
      if (Array.isArray(byKey)) {
        rawRiskItems = byKey;
      }
    } else {
      rawRiskItems = Object.values(raw.inventory_risk);
    }
  }

  const risks: DecisionRiskView[] = rawRiskItems
    .map((value) => {
      const source = record(value);
      const ingredientId = text(source, ["ingredient_id", "ingredientId", "key"]);
      const demandItem = demandByIngredient.get(ingredientId);
      const invRecord = data?.inventory?.find((i) => i.ingredientId === ingredientId);
      const daysOfSupply = numeric(source, ["days_of_supply", "days_supply", "daysOfSupply"]);
      const stockoutProb = numeric(source, ["stockout_probability", "stockout_prob", "stockoutProbability"]);
      const begInv = numeric(source, ["beginning_inventory", "begin_inventory", "beginningInventory", "onHand"]) ?? invRecord?.onHand ?? null;

      return {
        ingredientId,
        ingredientName: ingredientName(ingredientId, source, data),
        stockoutDate: text(source, [
          "projected_stockout_date",
          "stockout_date",
          "risk_date",
          "stockoutDate",
        ]),
        shortageQuantity: numeric(source, [
          "shortage_quantity",
          "expected_shortage",
          "shortageQuantity",
        ]),
        beginningInventory: begInv,
        fillRate: numeric(source, ["fill_rate", "expected_fill_rate", "fillRate"]),
        stockoutProbability: stockoutProb,
        daysOfSupply,
        riskCategory: text(source, ["risk_category", "riskCategory", "risk_level"]),
        unit: text(source, ["unit"]) || demandItem?.unit || invRecord?.unit || "",
      };
    })
    .filter((item) => Boolean(item.ingredientId));

  const strategies = strategyEntries(raw).map(([key, source]) => {
    const plan = record(source.recommended_plan);
    const items = list(source.items).length
      ? list(source.items)
      : list(plan.items);
    const findings = list(record(source.critic).findings);
    const safetyFinding = findings.find(
      (value) =>
        text(record(value), ["code"]) === "EXACT_SIMULATION_SAFETY_FLOOR",
    );
    const metrics = findingMetrics(record(safetyFinding));
    const businessMetrics = record(source.business_metrics);
    return {
      key,
      label: strategyLabels[key] || key,
      feasible:
        boolean(source, ["is_feasible", "feasible", "valid"]) ??
        boolean(plan, ["valid"]),
      itemCount: items.length,
      purchaseCost:
        numeric(source, ["purchase_cost"]) ??
        numeric(businessMetrics, ["projected_purchase_cost"]),
      observedFillRate:
        metrics.observed ?? numeric(businessMetrics, ["expected_fill_rate"]),
      requiredFillRate: metrics.required,
      items: items.map((value) => {
        const item = record(value);
        const ingredientId = text(item, ["ingredient_id"]);
        return {
          ingredientId,
          ingredientName: ingredientName(ingredientId, item, data),
          supplierId: text(item, ["supplier_id"]),
          supplierName: text(item, ["supplier_name", "supplier"]),
          orderQuantity: numeric(item, ["order_quantity", "quantity"]),
          unit: text(item, ["unit"]),
          packCount: numeric(item, ["pack_count"]),
          packSize: numeric(item, ["pack_size"]),
          unitPrice: numeric(item, ["unit_price", "unit_cost"]),
          purchaseCost: numeric(item, [
            "purchase_cost",
            "line_cost",
            "estimated_cost",
          ]),
          deliveryCost: numeric(item, ["delivery_cost"]),
          orderDate: text(item, ["order_date"]),
          arrivalDate: text(item, ["arrival_date", "expected_arrival_date"]),
          emergency: boolean(item, ["emergency"]),
        };
      }),
    };
  });
  const blockers = strategyEntries(raw)
    .flatMap(([, source]) => list(record(source.critic).findings))
    .map((value) => {
      const finding = record(value);
      const metrics = findingMetrics(finding);
      return { title: findingTitle(text(finding, ["code"])), ...metrics };
    })
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.title === item.title) === index,
    );
  const warnings = [
    ...list(raw.warnings),
    ...strategyEntries(raw).flatMap(([, source]) => [
      ...list(source.warnings),
      ...list(record(source.critic).warnings),
    ]),
  ]
    .map(friendlyWarning)
    .filter((item, index, all) => Boolean(item) && all.indexOf(item) === index);

  return {
    demand,
    dates: Array.from(new Set(demand.map((item) => item.targetDate))).sort(),
    productForecasts: Array.from(productForecastMap.values()).map((item) => ({
      ...item,
      points: item.points.sort((left, right) =>
        left.targetDate.localeCompare(right.targetDate),
      ),
    })),
    risks,
    blockers,
    warnings,
    strategies,
  };
}

export function buildProcurementIngredientRows(
  decision: DecisionPackage | null,
  data: BootstrapData,
  strategyKey?: string,
): ProcurementIngredientRowView[] {
  const view = adaptDecisionRunView(decision, data);
  const demandByIngredient = new Map<string, DecisionDemandView[]>();
  for (const demand of view.demand) {
    demandByIngredient.set(demand.ingredientId, [
      ...(demandByIngredient.get(demand.ingredientId) ?? []),
      demand,
    ]);
  }
  const riskByIngredient = new Map(
    view.risks.map((risk) => [risk.ingredientId, risk]),
  );
  const recommended = strategyKey
    ? view.strategies.find((strategy) => strategy.key === strategyKey)
    : (view.strategies.find((strategy) => strategy.feasible === true) ??
      (decision?.recommended_strategy
        ? view.strategies.find(
            (strategy) => strategy.key === decision.recommended_strategy,
          )
        : undefined));
  const recommendationByIngredient = new Map(
    recommended?.items.map((item) => [item.ingredientId, item]) ?? [],
  );
  return Array.from(demandByIngredient.entries())
    .map(([ingredientId, demand]) => {
      const inventory = data.inventory.find(
        (item) => item.ingredientId === ingredientId,
      );
      const supplier = data.supplierConstraints.find(
        (item) => item.ingredientId === ingredientId && item.active !== false,
      );
      const risk = riskByIngredient.get(ingredientId);
      const proposed = recommendationByIngredient.get(ingredientId);
      const totals = demand.reduce(
        (sum, item) => ({
          p25: sum.p25 + (item.p25 ?? 0),
          p50: sum.p50 + (item.p50 ?? 0),
          p75: sum.p75 + (item.p75 ?? 0),
          anyP25: sum.anyP25 || item.p25 != null,
          anyP50: sum.anyP50 || item.p50 != null,
          anyP75: sum.anyP75 || item.p75 != null,
        }),
        { p25: 0, p50: 0, p75: 0, anyP25: false, anyP50: false, anyP75: false },
      );
      return {
        ingredientId,
        ingredientName:
          demand[0]?.ingredientName || "Nguyên liệu chưa xác định",
        unit: demand[0]?.unit || inventory?.unit || "",
        onHand: inventory?.onHand ?? null,
        inbound: inventory?.inbound ?? null,
        safetyStock: inventory?.safetyStock ?? null,
        supplierName:
          proposed?.supplierName ||
          supplier?.supplier ||
          inventory?.supplier ||
          "",
        leadTimeDays: supplier?.leadTimeDays ?? inventory?.leadTimeDays ?? null,
        p25: totals.anyP25 ? totals.p25 : null,
        p50: totals.anyP50 ? totals.p50 : null,
        p75: totals.anyP75 ? totals.p75 : null,
        stockoutDate: risk?.stockoutDate || "",
        shortageQuantity: risk?.shortageQuantity ?? null,
        recommendedQuantity: proposed?.orderQuantity ?? null,
        packCount: proposed?.packCount ?? null,
        packSize: proposed?.packSize ?? null,
        unitPrice: proposed?.unitPrice ?? supplier?.unitCost ?? null,
        purchaseCost: proposed?.purchaseCost ?? null,
        feasible: recommended?.feasible === true,
      };
    })
    .sort((left, right) => {
      if (left.stockoutDate && right.stockoutDate)
        return left.stockoutDate.localeCompare(right.stockoutDate);
      if (left.stockoutDate) return -1;
      if (right.stockoutDate) return 1;
      if (left.recommendedQuantity != null && right.recommendedQuantity == null)
        return -1;
      if (right.recommendedQuantity != null && left.recommendedQuantity == null)
        return 1;
      return left.ingredientName.localeCompare(right.ingredientName, "vi");
    });
}

export interface ManagerDecisionViewModel {
  hasDecision: boolean;
  status:
    | "idle"
    | "loading"
    | "ready"
    | "no_feasible_strategy"
    | "no_recommendation"
    | "data_unavailable"
    | "request_error";
  hasFeasiblePlan: boolean;
  isNoFeasible: boolean;
  recommendedStrategy: {
    key: string | null;
    label: string;
  } | null;
  totalPlannedCost: number | null;
  purchaseItemCount: number;
  purchasePlanItems: Array<{
    ingredientId: string;
    ingredientName: string;
    orderQuantity: number | null;
    unit: string;
    estimatedCost: number | null;
    orderDate?: string | null;
    arrivalDate?: string | null;
    supplierName?: string | null;
    reasonCodes?: string[] | null;
  }>;
  headline: string | null;
  summary: string | null;
  hasForecast: boolean;
  hasDemand: boolean;
  isRunning: boolean;
}

export interface AdaptManagerDecisionOptions {
  brief?: DecisionBriefFacts | null;
  technicalDecision?: DecisionPackage | null;
  decision?: DecisionPackage | null;
  plan?: PlanResponse | null;
  lifecycleStatus?: string | null;
  briefLoading?: boolean;
  briefError?: string | null;
}

export function adaptManagerDecisionViewModel(
  briefOrOptions?: DecisionBriefFacts | AdaptManagerDecisionOptions | null,
  technicalDecision?: DecisionPackage | null,
  plan?: PlanResponse | null,
  briefLoading?: boolean,
  briefError?: string | null,
): ManagerDecisionViewModel {
  const isOptionsObject =
    Boolean(briefOrOptions) &&
    typeof briefOrOptions === "object" &&
    !("decision_run_id" in (briefOrOptions as Record<string, unknown>));

  const options: AdaptManagerDecisionOptions = isOptionsObject
    ? (briefOrOptions as AdaptManagerDecisionOptions)
    : {
        brief: briefOrOptions as DecisionBriefFacts | null | undefined,
        technicalDecision,
        plan,
        briefLoading,
        briefError,
      };

  const brief = options.brief ?? null;
  const decision = options.technicalDecision ?? options.decision ?? null;
  const currentPlan = options.plan ?? null;
  const isBriefLoading = Boolean(options.briefLoading);
  const currentBriefError = options.briefError ?? null;

  const isRunning =
    decision?.status === "queued" ||
    decision?.status === "running" ||
    brief?.status === "queued" ||
    brief?.status === "running" ||
    options.lifecycleStatus === "queued" ||
    options.lifecycleStatus === "running";

  const hasDemand = Boolean(
    (brief?.ingredient_demand && brief.ingredient_demand.length > 0) ||
      (decision?.ingredient_demand && decision.ingredient_demand.length > 0),
  );

  const hasForecast = Boolean(
    brief?.forecast?.forecast_run_id ||
      (decision as unknown as Record<string, unknown>)?.forecast_run_id ||
      (currentPlan?.forecasts && Object.keys(currentPlan.forecasts).length > 0) ||
      hasDemand,
  );

  // 1. BRIEF IS PRESENT -> Canonical Manager-Facing Read Model
  if (brief) {
    if (isBriefLoading) {
      return {
        hasDecision: true,
        status: "loading",
        hasFeasiblePlan: false,
        isNoFeasible: false,
        recommendedStrategy: null,
        totalPlannedCost: null,
        purchaseItemCount: 0,
        purchasePlanItems: [],
        headline: null,
        summary: null,
        hasForecast,
        hasDemand,
        isRunning: true,
      };
    }

    const isNoFeasible =
      brief.status === "completed_with_no_feasible_recommendation" ||
      brief.recommendation?.available === false ||
      brief.strategy_selection_presentation?.outcome === "no_feasible_strategy";

    const hasFeasiblePlan =
      !isNoFeasible &&
      brief.recommendation?.available === true &&
      (brief.procurement_rows?.length > 0 || brief.recommendation.total_purchase_cost != null);

    const stratKey =
      brief.strategy_selection_presentation?.selected_strategy ??
      brief.recommendation?.strategy ??
      null;

    const stratLabel =
      stratKey && strategyLabels[stratKey]
        ? strategyLabels[stratKey]
        : stratKey || "Khả thi";

    const purchasePlanItems = (brief.procurement_rows ?? []).map((row) => ({
      ingredientId: row.ingredient_id,
      ingredientName: row.ingredient_name || row.ingredient_id,
      orderQuantity: row.quantity,
      unit: row.unit || "",
      estimatedCost: row.purchase_cost ?? null,
      orderDate: row.order_date,
      arrivalDate: row.arrival_date,
      supplierName: row.supplier_name,
      reasonCodes: row.reason_codes,
    }));

    const totalPlannedCost =
      brief.recommendation?.total_purchase_cost ??
      (purchasePlanItems.some((i) => i.estimatedCost != null)
        ? purchasePlanItems.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0)
        : null);

    const headline =
      brief.strategy_selection_presentation?.headline ??
      brief.recommendation?.summary ??
      null;

    const summary =
      brief.strategy_selection_presentation?.summary ??
      brief.assistant_summary?.summary ??
      null;

    const status: ManagerDecisionViewModel["status"] = isRunning
      ? "loading"
      : isNoFeasible
        ? "no_feasible_strategy"
        : hasFeasiblePlan
          ? "ready"
          : "no_recommendation";

    return {
      hasDecision: true,
      status,
      hasFeasiblePlan,
      isNoFeasible,
      recommendedStrategy: stratKey ? { key: stratKey, label: stratLabel } : null,
      totalPlannedCost,
      purchaseItemCount: purchasePlanItems.length,
      purchasePlanItems,
      headline,
      summary,
      hasForecast,
      hasDemand,
      isRunning,
    };
  }

  // 2. BRIEF IS MISSING -> NEVER infer Manager business truth from raw DecisionPackage!
  if (currentBriefError) {
    return {
      hasDecision: Boolean(decision),
      status: "request_error",
      hasFeasiblePlan: false,
      isNoFeasible: false,
      recommendedStrategy: null,
      totalPlannedCost: null,
      purchaseItemCount: 0,
      purchasePlanItems: [],
      headline: null,
      summary: null,
      hasForecast,
      hasDemand,
      isRunning,
    };
  }

  if (isRunning || isBriefLoading) {
    return {
      hasDecision: Boolean(decision),
      status: "loading",
      hasFeasiblePlan: false,
      isNoFeasible: false,
      recommendedStrategy: null,
      totalPlannedCost: null,
      purchaseItemCount: 0,
      purchasePlanItems: [],
      headline: null,
      summary: null,
      hasForecast,
      hasDemand,
      isRunning: true,
    };
  }

  if (decision) {
    const status: ManagerDecisionViewModel["status"] =
      decision.status === "failed" || decision.status === "blocked"
        ? "request_error"
        : "data_unavailable";

    return {
      hasDecision: true,
      status,
      hasFeasiblePlan: false,
      isNoFeasible: false,
      recommendedStrategy: null,
      totalPlannedCost: null,
      purchaseItemCount: 0,
      purchasePlanItems: [],
      headline: null,
      summary: null,
      hasForecast,
      hasDemand,
      isRunning: false,
    };
  }

  // 3. IDLE / NO DECISION
  return {
    hasDecision: false,
    status: "idle",
    hasFeasiblePlan: false,
    isNoFeasible: false,
    recommendedStrategy: null,
    totalPlannedCost: null,
    purchaseItemCount: 0,
    purchasePlanItems: [],
    headline: null,
    summary: null,
    hasForecast,
    hasDemand,
    isRunning: false,
  };
}


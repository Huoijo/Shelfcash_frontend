import type { BootstrapData, DecisionPackage } from "./types";

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
  stockoutDate: string;
  shortageQuantity: number | null;
  beginningInventory: number | null;
  fillRate: number | null;
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
  data: BootstrapData,
): string {
  const direct = text(source, ["ingredient_name", "ingredient"]);
  if (direct) return direct;
  return (
    data.ingredients.find((item) => item.ingredientId === ingredientId)
      ?.ingredient ||
    data.inventory.find((item) => item.ingredientId === ingredientId)
      ?.ingredient ||
    "Nguyên liệu chưa xác định"
  );
}

function productName(
  productId: string,
  source: RecordValue,
  data: BootstrapData,
): string {
  const direct = text(source, ["product_name", "product"]);
  if (direct) return direct;
  return (
    data.products.find((item) => item.productId === productId)?.product ||
    data.menu.find((item) => item.productId === productId)?.product ||
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

  const inventoryRisk = record(raw.inventory_risk);
  const p50Design = list(inventoryRisk.results).find(
    (value) => text(record(value), ["scenario_id"]) === "p50_design",
  );
  const riskSummary = record(record(p50Design).summary);
  const risks = list(riskSummary.by_key)
    .map((value) => {
      const source = record(value);
      const ingredientId = text(source, ["ingredient_id", "key"]);
      const demandItem = demandByIngredient.get(ingredientId);
      return {
        ingredientId,
        ingredientName: ingredientName(ingredientId, source, data),
        stockoutDate: text(source, [
          "projected_stockout_date",
          "stockout_date",
        ]),
        shortageQuantity: numeric(source, [
          "shortage_quantity",
          "expected_shortage",
        ]),
        beginningInventory: numeric(source, [
          "beginning_inventory",
          "begin_inventory",
        ]),
        fillRate: numeric(source, ["fill_rate"]),
        unit: text(source, ["unit"]) || demandItem?.unit || "",
      };
    })
    .filter(
      (item) => Boolean(item.stockoutDate) || (item.shortageQuantity ?? 0) > 0,
    );

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

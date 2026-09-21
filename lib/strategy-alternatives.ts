import type {
  DecisionBriefStrategyAlternative,
  DecisionBriefStrategyReason,
  DecisionBriefStrategyPresentation,
} from "./types";

/**
 * Checks whether an item looks like a candidate strategy object
 * from brief.json / decision engine.
 */
export function isCandidateStrategyObject(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;

  const hasStrategyIdentifier =
    typeof obj.strategy === "string" ||
    typeof obj.label === "string" ||
    (obj.presentation !== null &&
      typeof obj.presentation === "object" &&
      typeof (obj.presentation as Record<string, unknown>).headline === "string");

  const hasStrategyTraits =
    obj.status !== undefined ||
    obj.reason_status !== undefined ||
    obj.presentation !== undefined ||
    obj.reasons !== undefined ||
    obj.purchase_cost !== undefined ||
    obj.feasible !== undefined ||
    obj.selected !== undefined ||
    obj.kind !== undefined;

  return Boolean(hasStrategyIdentifier && hasStrategyTraits);
}

/**
 * Normalizes a candidate strategy object, inferring standard keys if missing
 * (e.g. from Vietnamese labels or headlines).
 */
export function normalizeCandidateStrategy(
  raw: unknown,
  index: number = 0,
  allCandidatesRaw: unknown[] = [],
): DecisionBriefStrategyAlternative {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawStrategy = typeof obj.strategy === "string" ? obj.strategy.trim() : "";
  const rawLabel = typeof obj.label === "string" ? obj.label.trim() : "";
  const presentation =
    obj.presentation && typeof obj.presentation === "object"
      ? (obj.presentation as DecisionBriefStrategyPresentation)
      : null;

  const headline = presentation?.headline || "";

  // Strategy identity comes strictly from typed strategy field (no regex/text inference)
  const strategy = rawStrategy || `strategy_${index + 1}`;

  // Label from raw label or headline
  const label = rawLabel || headline || `Phương án ${index + 1}`;

  // Determine selection & feasibility strictly from typed status/boolean
  const rawStatus = typeof obj.status === "string" ? obj.status : null;
  let selected = typeof obj.selected === "boolean" ? obj.selected : null;
  let feasible = typeof obj.feasible === "boolean" ? obj.feasible : null;

  if (selected === null) {
    if (rawStatus === "selected") {
      selected = true;
    } else if (rawStatus === "feasible_not_selected" || rawStatus === "rejected" || rawStatus === "not_selected") {
      selected = false;
    }
  }

  if (feasible === null) {
    if (rawStatus === "feasible_not_selected" || rawStatus === "selected" || selected === true) {
      feasible = true;
    } else if (rawStatus === "infeasible") {
      feasible = false;
    }
  }

  // Determine purchase_cost
  let purchaseCost: number | null =
    typeof obj.purchase_cost === "number" && !Number.isNaN(obj.purchase_cost)
      ? obj.purchase_cost
      : typeof obj.total_purchase_cost === "number" && !Number.isNaN(obj.total_purchase_cost)
        ? obj.total_purchase_cost
        : typeof obj.cost === "number" && !Number.isNaN(obj.cost)
          ? obj.cost
          : null;

  const reasonStatus = typeof obj.reason_status === "string" ? obj.reason_status : null;
  const reasons = Array.isArray(obj.reasons) ? (obj.reasons as DecisionBriefStrategyReason[]) : null;

  // If purchase_cost is still null, inspect reasons inside this candidate
  if (purchaseCost === null && reasons && reasons.length > 0) {
    for (const r of reasons) {
      if (typeof r.values?.candidate_purchase_cost === "number") {
        purchaseCost = r.values.candidate_purchase_cost;
        break;
      }
    }
  }

  // If this strategy is the selected one and purchase_cost is null, inspect if sibling candidates have selected_purchase_cost
  if (purchaseCost === null && selected === true && allCandidatesRaw.length > 0) {
    for (const sibling of allCandidatesRaw) {
      if (sibling && typeof sibling === "object") {
        const sibReasons = (sibling as Record<string, unknown>).reasons;
        if (Array.isArray(sibReasons)) {
          for (const r of sibReasons) {
            if (typeof (r as Record<string, unknown>)?.values === "object") {
              const selCost = ((r as Record<string, unknown>).values as Record<string, unknown>)?.selected_purchase_cost;
              if (typeof selCost === "number" && !Number.isNaN(selCost)) {
                purchaseCost = selCost;
                break;
              }
            }
          }
        }
      }
      if (purchaseCost !== null) break;
    }
  }

  // Metric values (or null if missing)
  const expectedFillRate =
    typeof obj.expected_fill_rate === "number" && !Number.isNaN(obj.expected_fill_rate)
      ? obj.expected_fill_rate
      : typeof obj.fill_rate === "number" && !Number.isNaN(obj.fill_rate)
        ? obj.fill_rate
        : null;

  const stockoutProbability =
    typeof obj.stockout_probability === "number" && !Number.isNaN(obj.stockout_probability)
      ? obj.stockout_probability
      : null;

  const rawWaste = obj.expected_waste ?? obj.waste_quantity;
  const expectedWaste =
    typeof rawWaste === "number" || typeof rawWaste === "string"
      ? rawWaste
      : null;

  return {
    ...obj,
    strategy,
    label,
    status: rawStatus,
    selected,
    feasible,
    purchase_cost: purchaseCost,
    reason_status: reasonStatus,
    reasons,
    presentation,
    expected_fill_rate: expectedFillRate,
    stockout_probability: stockoutProbability,
    expected_waste: expectedWaste,
  };
}

/**
 * Searches and discovers the candidate strategies / alternatives array
 * within brief.json, regardless of whether backend nests it or uses
 * different field names.
 */
export function findStrategyAlternativesInBrief(
  brief: unknown,
): DecisionBriefStrategyAlternative[] {
  if (!brief) return [];

  let data = brief;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }

  if (typeof data !== "object" || data === null) return [];

  const candidateKeys = [
    "candidate_strategies",
    "strategies",
    "strategy_comparison",
    "strategy_alternatives",
    "alternatives",
    "strategy_evaluations",
    "strategy_candidates",
    "candidate_plans",
    "candidate_options",
    "other_strategies",
  ];

  // Helper to validate and normalize array
  const tryExtract = (arr: unknown): DecisionBriefStrategyAlternative[] | null => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const matchCount = arr.filter(isCandidateStrategyObject).length;
    // If at least 1 item matches or > 50% match
    if (matchCount > 0 && matchCount >= arr.length / 2) {
      return arr.map((item, idx) => normalizeCandidateStrategy(item, idx, arr));
    }
    return null;
  };

  const b = data as Record<string, unknown>;

  // 1. Check top-level known keys
  for (const key of candidateKeys) {
    const val = b[key];
    const res = tryExtract(val);
    if (res) return res;
  }

  // 2. Check within common nested containers (recommendation, evaluation, presentation, decision, brief)
  const commonContainers = ["recommendation", "evaluation", "presentation", "decision", "brief", "analysis", "data"];
  for (const containerKey of commonContainers) {
    const container = b[containerKey];
    if (container && typeof container === "object" && !Array.isArray(container)) {
      const containerObj = container as Record<string, unknown>;
      for (const key of candidateKeys) {
        const res = tryExtract(containerObj[key]);
        if (res) return res;
      }
    }
  }

  // 3. Recursive deep search (up to depth 5)
  const searchDeep = (node: unknown, depth: number): DecisionBriefStrategyAlternative[] | null => {
    if (depth > 5 || !node || typeof node !== "object") return null;

    if (Array.isArray(node)) {
      const res = tryExtract(node);
      if (res) return res;
      for (const item of node) {
        const nestedRes = searchDeep(item, depth + 1);
        if (nestedRes) return nestedRes;
      }
    } else {
      const obj = node as Record<string, unknown>;
      // Check candidate keys on this node first
      for (const key of candidateKeys) {
        if (obj[key]) {
          const res = tryExtract(obj[key]);
          if (res) return res;
        }
      }
      // Recursively check all children
      for (const val of Object.values(obj)) {
        if (val && typeof val === "object") {
          const res = searchDeep(val, depth + 1);
          if (res) return res;
        }
      }
    }
    return null;
  };

  const deepResult = searchDeep(b, 1);
  if (deepResult) return deepResult;

  return [];
}

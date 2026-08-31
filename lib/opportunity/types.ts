export type OpportunityRunStatus =
  | "idle"
  | "scanning"
  | "analyzing_context"
  | "matching_candidates"
  | "ranking"
  | "building_portfolio"
  | "completed"
  | "failed";

export type OpportunityCandidateDomain = "same_domain" | "cross_domain";

export interface PoiPoint {
  id: string;
  label: string;
  type: "university" | "transit" | "competition" | "retail";
  angleDeg: number;
  distanceNormalized: number; // 0.1 to 0.95 from center
}

export interface ContextMetric {
  key: string;
  label: string;
  count: number;
}

export interface ContextSignal {
  key: string;
  label: string;
  badgeType?: "info" | "success" | "warning";
}

export interface LocalOpportunityContext {
  radiusKm: number;
  totalPois: number;
  scannedPois: number;
  metrics: ContextMetric[];
  signals: ContextSignal[];
  poiPoints: PoiPoint[];
}

export interface OpportunityCandidateCriteria {
  areaFit: "Rất cao" | "Cao" | "Trung bình" | "Thấp";
  ingredientLeverage: "Rất cao" | "Cao" | "Trung bình" | "Thấp";
  menuDifferentiation: "Rất cao" | "Tốt" | "Khá" | "Thấp";
  complexity: "Thấp" | "Trung bình" | "Cao";
}

export interface OpportunityCandidate {
  id: string;
  name: string;
  category: string;
  domain: OpportunityCandidateDomain;
  opportunityScore: number; // 0.0 to 1.0 (ranking score, not probability)
  rank: number;
  criteria: OpportunityCandidateCriteria;
  priceRange: {
    min: number;
    max: number;
  };
  trialCost: number; // Cost in VND to run a trial batch
  keyHighlights: string[];
  whyPath: string[];
  reusableIngredients: string[];
  newIngredients: string[];
  preparationTimeMinutes?: number;
  constraints?: string[];
}

export interface TrialPortfolioItem {
  candidateId: string;
  candidateName: string;
  category: string;
  trialCost: number;
  score: number;
  domain: OpportunityCandidateDomain;
  selected: boolean;
  whySnippet?: string;
}

export interface TrialPortfolio {
  budget: number;
  allocatedCost: number;
  remainingBudget: number;
  candidateCount: number;
  items: TrialPortfolioItem[];
}

export interface OpportunityRunInput {
  storeId: string;
  storeName: string;
  radiusKm: number;
  trialBudget: number;
}

export interface OpportunityRun {
  runId: string;
  storeId: string;
  storeName: string;
  radiusKm: number;
  trialBudget: number;
  status: OpportunityRunStatus;
  currentStageIndex: number;
  totalStages: number;
  progressPercent: number;
  stageMessage: string;
  scannedCount: number;
  totalPoisCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface OpportunityResult {
  runId: string;
  storeId: string;
  status: "completed" | "failed";
  localContext: LocalOpportunityContext;
  rankedCandidates: OpportunityCandidate[];
  trialPortfolio: TrialPortfolio;
  scanTimestamp: string;
}

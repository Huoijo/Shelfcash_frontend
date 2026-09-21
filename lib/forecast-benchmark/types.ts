export type ForecastBenchmarkModelType =
  | "lightgbm_quantile"
  | "seasonal_naive"
  | "ma7"
  | "ma28"
  | "ets";

export type ForecastBenchmarkFamily = "shelfcash" | "baseline";

export interface BenchmarkMetric {
  mae: number;
  wape: number;
  bias: number;
}

export interface BenchmarkHorizonPoint {
  horizon: number; // 1..7
  horizonLabel: string; // "Ngày +1", "Ngày +2", ...
  mae: number;
  wape: number;
  bias: number;
}

export interface ForecastBenchmarkModel {
  id: string;
  label: string;
  shortLabel: string;
  modelType: ForecastBenchmarkModelType;
  family: ForecastBenchmarkFamily;
  description: string;
  overall: BenchmarkMetric;
  byHorizon: BenchmarkHorizonPoint[];
  supportsQuantiles: boolean;
  quantiles?: string[];
  isOverallBest?: boolean;
  isBaselineBest?: boolean; // backwards-compatible alias
  isBaselineStrongest?: boolean;
}

export interface CalibrationMetric {
  targetCoverage: number; // e.g. 0.50 (50%)
  calibratedCoverage: number; // e.g. 0.4897959183673469 (~49.0%)
  gapPercentagePoints: number; // e.g. 1.02
}

export interface ForecastBenchmarkData {
  evaluationProtocol: string;
  foldsCount: number;
  forecastPointsCount: number;
  models: ForecastBenchmarkModel[];
  calibration: CalibrationMetric;
}

export interface BenchmarkComparisonSummary {
  lightGbmWape: number;
  lightGbmMae: number;
  seasonalNaiveWape: number;
  etsWape: number;
  seasonalNaiveAdvantagePoints: number; // 2.55 điểm % (10.37 - 7.82)
  etsAdvantagePoints: number; // 0.88 điểm % (8.70 - 7.82)
}

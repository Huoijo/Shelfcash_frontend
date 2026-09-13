import { FORECAST_BENCHMARK_MOCK_DATA } from "./mock-data";
import type {
  BenchmarkComparisonSummary,
  ForecastBenchmarkData,
  ForecastBenchmarkModel,
} from "./types";

/**
 * Service boundary for Forecast Benchmark data.
 *
 * NOTE: Currently powered by the centralized walk-forward validation mock fixture.
 * Future: replace local preview fixture with normalized Backend benchmark response
 * via API adapter once backend benchmark endpoint is available.
 */
export function getForecastBenchmarkPreview(): ForecastBenchmarkData {
  return FORECAST_BENCHMARK_MOCK_DATA;
}

/**
 * Format decimal ratios into readable percentages.
 * e.g. 0.0942306 -> "9.42%"
 * Crucial invariant: Multiplies by 100 exactly once.
 */
export function formatBenchmarkPercent(val: number, decimals: number = 2): string {
  if (!Number.isFinite(val)) return "—";
  const factor = Math.pow(10, decimals);
  const percentVal = val * 100;
  const sign = percentVal < 0 ? -1 : 1;
  const rounded = (Math.round((Math.abs(percentVal) + Number.EPSILON) * factor) / factor) * sign;
  return `${rounded.toFixed(decimals)}%`;
}

/**
 * Format raw float metric into rounded string.
 * e.g. 3.5494328 -> "3.55"
 */
export function formatBenchmarkMetric(val: number, decimals: number = 2): string {
  if (!Number.isFinite(val)) return "—";
  const factor = Math.pow(10, decimals);
  const sign = val < 0 ? -1 : 1;
  const rounded = (Math.round((Math.abs(val) + Number.EPSILON) * factor) / factor) * sign;
  return rounded.toFixed(decimals);
}

/**
 * Sort models ascending by WAPE (lower error is better).
 * Expected ranking: LightGBM (7.82%) -> ETS (8.70%) -> Seasonal Naive (10.37%) -> MA28 (18.10%) -> MA7 (18.50%)
 */
export function getModelsSortedByWape(
  models: ForecastBenchmarkModel[]
): ForecastBenchmarkModel[] {
  return [...models].sort((a, b) => a.overall.wape - b.overall.wape);
}

/**
 * Sort models ascending by MAE (lower error is better).
 * Expected ranking: LightGBM (2.96) -> ETS (3.28) -> Seasonal Naive (3.91) -> MA28 (6.82) -> MA7 (6.97)
 */
export function getModelsSortedByMae(
  models: ForecastBenchmarkModel[]
): ForecastBenchmarkModel[] {
  return [...models].sort((a, b) => a.overall.mae - b.overall.mae);
}

/**
 * Derive exact numerical comparison deltas between LightGBM and key baselines.
 */
export function getBenchmarkComparisonSummary(
  models: ForecastBenchmarkModel[]
): BenchmarkComparisonSummary {
  const lightGbm = models.find((m) => m.modelType === "lightgbm_quantile");
  const seasonalNaive = models.find((m) => m.modelType === "seasonal_naive");
  const ets = models.find((m) => m.modelType === "ets");

  const lightGbmWape = lightGbm?.overall.wape ?? 0.0782;
  const lightGbmMae = lightGbm?.overall.mae ?? 2.96;
  const seasonalNaiveWape = seasonalNaive?.overall.wape ?? 0.1037;
  const etsWape = ets?.overall.wape ?? 0.087;

  // Improvement over Seasonal Naive in percentage points: (10.37% - 7.82% = 2.55)
  const seasonalNaiveAdvantagePoints = (seasonalNaiveWape - lightGbmWape) * 100;
  // Reduction of LightGBM over ETS in percentage points: (8.70% - 7.82% = 0.88)
  const etsAdvantagePoints = (etsWape - lightGbmWape) * 100;

  return {
    lightGbmWape,
    lightGbmMae,
    seasonalNaiveWape,
    etsWape,
    seasonalNaiveAdvantagePoints,
    etsAdvantagePoints,
  };
}

"use client";

import React, { useMemo } from "react";
import { Award, BarChart3, CheckCircle2, Cpu, Info, ShieldCheck, TrendingDown } from "lucide-react";
import {
  formatBenchmarkMetric,
  formatBenchmarkPercent,
  getBenchmarkComparisonSummary,
  getForecastBenchmarkPreview,
} from "../../../lib/forecast-benchmark/selectors";
import { BenchmarkBarChart } from "./BenchmarkBarChart";
import { BenchmarkHorizonChart } from "./BenchmarkHorizonChart";
import { BenchmarkTable } from "./BenchmarkTable";

export function ForecastBenchmark() {
  const benchmarkData = useMemo(() => getForecastBenchmarkPreview(), []);
  const comparison = useMemo(
    () => getBenchmarkComparisonSummary(benchmarkData.models),
    [benchmarkData.models]
  );

  const lightGbm = benchmarkData.models.find(
    (m) => m.modelType === "lightgbm_quantile"
  );
  const ets = benchmarkData.models.find((m) => m.modelType === "ets");

  return (
    <section
      className="forecast-benchmark-section"
      aria-label="Benchmark mô hình dự báo"
      id="forecast-benchmark-workspace"
    >
      {/* Section Header */}
      <div className="forecast-benchmark-header">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="benchmark-header-icon">
            <BarChart3 size={20} className="text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                BENCHMARK MÔ HÌNH DỰ BÁO
              </h3>
              <span className="benchmark-preview-tag">
                Benchmark Preview
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Đánh giá: {benchmarkData.evaluationProtocol} · {benchmarkData.foldsCount} folds ·{" "}
              {benchmarkData.forecastPointsCount.toLocaleString("vi-VN")} điểm dự báo
            </p>
          </div>
        </div>

        <div className="benchmark-honest-statement">
          <Info size={14} className="text-emerald-600 shrink-0 mt-0.5" />
          <span className="text-xs text-slate-600">
            LightGBM Quantile đạt sai số thấp nhất trong benchmark mô phỏng, đồng thời cung cấp khoảng dự báo P25–P75 để hỗ trợ quyết định tồn kho.
          </span>
        </div>
      </div>

      {/* KPI Comparison Strip */}
      <div className="benchmark-kpi-grid">
        {/* Card 1: ShelfCash LightGBM - BEST OVERALL */}
        <div className="benchmark-kpi-card card-shelfcash">
          <div className="flex-between mb-2">
            <span className="benchmark-kpi-eyebrow flex items-center gap-1.5 text-emerald-800 font-semibold">
              <Cpu size={14} />
              Mô hình ShelfCash
            </span>
            <div className="flex items-center gap-1">
              <span className="benchmark-badge badge-shelfcash">
                MÔ HÌNH SHELFCASH
              </span>
              <span className="benchmark-badge badge-best">
                TỐT NHẤT
              </span>
            </div>
          </div>
          <div className="benchmark-kpi-title">{lightGbm?.label || "LightGBM Quantile"}</div>
          <div className="benchmark-kpi-stats">
            <div className="stat-box">
              <span className="stat-label">WAPE</span>
              <span className="stat-value text-emerald-700 font-bold">
                {formatBenchmarkPercent(comparison.lightGbmWape)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">MAE</span>
              <span className="stat-value text-slate-800">
                {formatBenchmarkMetric(comparison.lightGbmMae)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Khoảng phân vị</span>
              <span className="stat-pill">P25 · P50 · P75</span>
            </div>
          </div>
        </div>

        {/* Card 2: Strongest Baseline (ETS) */}
        <div className="benchmark-kpi-card card-baseline">
          <div className="flex-between mb-2">
            <span className="benchmark-kpi-eyebrow flex items-center gap-1.5 text-blue-800 font-semibold">
              <Award size={14} />
              Baseline mạnh nhất
            </span>
            <span className="benchmark-badge badge-baseline-strongest">
              BASELINE MẠNH NHẤT
            </span>
          </div>
          <div className="benchmark-kpi-title">{ets?.label || "ETS"}</div>
          <div className="benchmark-kpi-stats">
            <div className="stat-box">
              <span className="stat-label">WAPE</span>
              <span className="stat-value text-blue-700 font-bold">
                {formatBenchmarkPercent(comparison.etsWape)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">MAE</span>
              <span className="stat-value text-slate-800">
                {formatBenchmarkMetric(ets?.overall.mae ?? 3.28)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Dự báo</span>
              <span className="text-xs text-slate-500 font-medium">Point forecast</span>
            </div>
          </div>
        </div>

        {/* Card 3: Relative Deltas */}
        <div className="benchmark-kpi-card card-deltas">
          <div className="benchmark-kpi-eyebrow flex items-center gap-1.5 text-slate-700 font-semibold mb-2">
            <TrendingDown size={14} />
            So sánh tương quan
          </div>
          <div className="space-y-2 mt-1 text-xs">
            <div className="delta-row flex items-center justify-between">
              <span className="text-slate-600">So với ETS:</span>
              <strong className="text-emerald-700 font-medium">
                LightGBM giảm WAPE khoảng {comparison.etsAdvantagePoints.toFixed(2)} điểm %
              </strong>
            </div>
            <div className="delta-row flex items-center justify-between">
              <span className="text-slate-600">So với Seasonal Naive:</span>
              <strong className="text-emerald-700 font-medium">
                LightGBM giảm WAPE khoảng {comparison.seasonalNaiveAdvantagePoints.toFixed(2)} điểm %
              </strong>
            </div>
            <div className="pt-1 border-t border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
              Ngoài độ chính xác tốt hơn, LightGBM còn cung cấp P25–P75 để biểu diễn mức bất định của nhu cầu.
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Visual Benchmark: Primary Horizontal Bar Chart + Secondary Horizon Line Chart */}
      <div className="benchmark-charts-grid">
        <BenchmarkBarChart models={benchmarkData.models} />
        <BenchmarkHorizonChart models={benchmarkData.models} />
      </div>

      {/* Detail Metrics Table */}
      <BenchmarkTable models={benchmarkData.models} />

      {/* Quantile Advantage & Calibration Highlight Strip */}
      <div className="benchmark-quantile-strip">
        <div className="strip-header">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <span className="font-bold text-sm text-emerald-900">
              Lợi thế mô hình phân vị (Quantile Forecast)
            </span>
          </div>
          <span className="text-xs text-emerald-700 font-medium">
            Độ chính xác cao nhất (7.82% WAPE) + Dự báo bất định (P25/P50/P75) → Quyết định tồn kho
          </span>
        </div>

        <div className="strip-content">
          <div className="strip-metric">
            <div className="metric-tag">Khoảng P25–P75 sau hiệu chỉnh</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xs text-slate-600">Mục tiêu danh định: <strong>50%</strong></span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-600">
                Thực tế quan sát: <strong className="text-emerald-700">{formatBenchmarkPercent(benchmarkData.calibration.calibratedCoverage, 1)}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500">
                Độ lệch: ~{benchmarkData.calibration.gapPercentagePoints.toFixed(2)} điểm %
              </span>
            </div>
          </div>
          <p className="strip-text">
            Khoảng P25–P75 sau hiệu chỉnh bám sát mức coverage mục tiêu 50%, cho phép hệ thống lập kế hoạch mua hàng cân bằng tối ưu giữa rủi ro thiếu hàng và rủi ro tồn ứ.
          </p>
        </div>
      </div>
    </section>
  );
}

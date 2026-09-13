"use client";

import React, { useState } from "react";
import type { ForecastBenchmarkModel } from "../../../lib/forecast-benchmark/types";
import { formatBenchmarkPercent } from "../../../lib/forecast-benchmark/selectors";

export interface BenchmarkHorizonChartProps {
  models: ForecastBenchmarkModel[];
}

export function BenchmarkHorizonChart({ models }: BenchmarkHorizonChartProps) {
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [hoveredHorizon, setHoveredHorizon] = useState<number | null>(null);

  const activeModels = showAllSeries
    ? models
    : models.filter(
        (m) =>
          m.modelType === "lightgbm_quantile" ||
          m.modelType === "ets" ||
          m.modelType === "seasonal_naive"
      );

  const horizons = [1, 2, 3, 4, 5, 6, 7];

  // Color mapping for lines
  const modelColors: Record<string, { stroke: string; label: string }> = {
    lightgbm_quantile: { stroke: "#10b981", label: "LightGBM Quantile (ShelfCash)" },
    ets: { stroke: "#2563eb", label: "ETS (Baseline tốt nhất)" },
    seasonal_naive: { stroke: "#f59e0b", label: "Seasonal Naive (Chu kỳ 7d)" },
    ma28: { stroke: "#8b5cf6", label: "MA 28 ngày" },
    ma7: { stroke: "#ec4899", label: "MA 7 ngày" },
  };

  // SVG dimensions
  const svgWidth = 640;
  const svgHeight = 220;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Y-axis domain: 0.07 (7%) to 0.20 (20%)
  const minY = 0.07;
  const maxY = showAllSeries ? 0.20 : 0.12;

  const getX = (horizon: number) => {
    return padding.left + ((horizon - 1) / 6) * chartWidth;
  };

  const getY = (wape: number) => {
    const clamped = Math.min(maxY, Math.max(minY, wape));
    const ratio = (clamped - minY) / (maxY - minY);
    return padding.top + (1 - ratio) * chartHeight;
  };

  // Generate Y-axis grid ticks
  const yTicks = showAllSeries
    ? [0.08, 0.11, 0.14, 0.17, 0.20]
    : [0.07, 0.08, 0.09, 0.10, 0.11, 0.12];

  return (
    <div className="benchmark-card benchmark-chart-container">
      <div className="benchmark-card-header flex-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="benchmark-card-title">Độ chính xác theo khoảng dự báo</h4>
            <span className="benchmark-direction-tag">WAPE ↓ Càng thấp càng tốt</span>
          </div>
          <p className="benchmark-card-subtitle">
            Biến động sai số WAPE từ Ngày +1 đến Ngày +7 trong chu kỳ dự báo hàng tuần.
          </p>
        </div>

        <div className="benchmark-toggle-group" role="tablist" aria-label="Bộ lọc chuỗi dữ liệu">
          <button
            type="button"
            role="tab"
            aria-selected={!showAllSeries}
            className={`benchmark-toggle-btn ${!showAllSeries ? "active" : ""}`}
            onClick={() => setShowAllSeries(false)}
          >
            3 mô hình chính
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showAllSeries}
            className={`benchmark-toggle-btn ${showAllSeries ? "active" : ""}`}
            onClick={() => setShowAllSeries(true)}
          >
            Tất cả (5 mô hình)
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="benchmark-legend">
        {activeModels.map((m) => {
          const cfg = modelColors[m.modelType] || { stroke: "#64748b", label: m.label };
          const isShelfCash = m.modelType === "lightgbm_quantile";
          return (
            <div key={m.id} className="benchmark-legend-item">
              <span
                className="benchmark-legend-dot"
                style={{ backgroundColor: cfg.stroke }}
              />
              <span className={`benchmark-legend-label ${isShelfCash ? "font-semibold text-slate-800" : ""}`}>
                {m.shortLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Responsive SVG Chart */}
      <div className="benchmark-svg-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="benchmark-horizon-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y Grid Lines */}
          {yTicks.map((tickVal) => {
            const y = getY(tickVal);
            return (
              <g key={tickVal} className="benchmark-grid-line">
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                >
                  {formatBenchmarkPercent(tickVal, 0)}
                </text>
              </g>
            );
          })}

          {/* X Axis ticks */}
          {horizons.map((h) => {
            const x = getX(h);
            const isHovered = hoveredHorizon === h;
            return (
              <g key={h} className="benchmark-x-tick">
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartHeight}
                  stroke={isHovered ? "#94a3b8" : "#f1f5f9"}
                  strokeWidth={isHovered ? "1.5" : "1"}
                />
                <text
                  x={x}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isHovered ? "700" : "500"}
                  fill={isHovered ? "#0f172a" : "#64748b"}
                >
                  Ngày +{h}
                </text>
              </g>
            );
          })}

          {/* Model Polylines & Points */}
          {activeModels.map((m) => {
            const cfg = modelColors[m.modelType] || { stroke: "#64748b" };
            const isLightGbm = m.modelType === "lightgbm_quantile";

            const pointsString = m.byHorizon
              .map((pt) => `${getX(pt.horizon)},${getY(pt.wape)}`)
              .join(" ");

            return (
              <g key={m.id} className="benchmark-series-group">
                <polyline
                  points={pointsString}
                  fill="none"
                  stroke={cfg.stroke}
                  strokeWidth={isLightGbm ? 2.75 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                />
                {m.byHorizon.map((pt) => {
                  const cx = getX(pt.horizon);
                  const cy = getY(pt.wape);
                  const isHovered = hoveredHorizon === pt.horizon;
                  return (
                    <circle
                      key={pt.horizon}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? (isLightGbm ? 5.5 : 4.5) : (isLightGbm ? 4 : 3)}
                      fill={isLightGbm ? "#ffffff" : cfg.stroke}
                      stroke={cfg.stroke}
                      strokeWidth={isLightGbm ? 2.5 : 1}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredHorizon(pt.horizon)}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Transparent Hover Hit Boxes for each horizon column */}
          {horizons.map((h) => {
            const x = getX(h);
            const colWidth = chartWidth / 6;
            return (
              <rect
                key={h}
                x={x - colWidth / 2}
                y={padding.top}
                width={colWidth}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredHorizon(h)}
                onMouseLeave={() => setHoveredHorizon(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Interactive Tooltip Card */}
      {hoveredHorizon !== null && (
        <div className="benchmark-horizon-tooltip" aria-live="polite">
          <div className="tooltip-header">
            <strong>Ngày +{hoveredHorizon}</strong>
            <span className="text-xs text-slate-500">Mức WAPE tương ứng</span>
          </div>
          <div className="tooltip-grid">
            {activeModels.map((m) => {
              const pt = m.byHorizon.find((p) => p.horizon === hoveredHorizon);
              const cfg = modelColors[m.modelType] || { stroke: "#64748b" };
              const isLightGbm = m.modelType === "lightgbm_quantile";
              return (
                <div key={m.id} className="tooltip-row">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: cfg.stroke }}
                    />
                    <span className={`text-xs ${isLightGbm ? "font-bold text-slate-900" : "text-slate-600"}`}>
                      {m.label}
                    </span>
                  </div>
                  <strong className={`text-xs font-mono ${isLightGbm ? "text-emerald-700" : "text-slate-700"}`}>
                    {pt ? formatBenchmarkPercent(pt.wape) : "—"}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

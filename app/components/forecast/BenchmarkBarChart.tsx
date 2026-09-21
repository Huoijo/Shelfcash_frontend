"use client";

import React, { useState } from "react";
import type { ForecastBenchmarkModel } from "../../../lib/forecast-benchmark/types";
import {
  formatBenchmarkMetric,
  formatBenchmarkPercent,
  getModelsSortedByMae,
  getModelsSortedByWape,
} from "../../../lib/forecast-benchmark/selectors";

export interface BenchmarkBarChartProps {
  models: ForecastBenchmarkModel[];
}

export function BenchmarkBarChart({ models }: BenchmarkBarChartProps) {
  const [metric, setMetric] = useState<"wape" | "mae">("wape");

  const sortedModels =
    metric === "wape"
      ? getModelsSortedByWape(models)
      : getModelsSortedByMae(models);

  // Maximum scale starting strictly from 0 to prevent exaggerated visual differences
  const maxWape = 0.22; // 22%
  const maxMae = 8.0;

  const currentMax = metric === "wape" ? maxWape : maxMae;

  return (
    <div className="benchmark-card benchmark-chart-container">
      <div className="benchmark-card-header flex-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="benchmark-card-title">
              {metric === "wape" ? "WAPE theo mô hình" : "MAE theo mô hình"}
            </h4>
            <span className="benchmark-direction-tag">
              {metric === "wape" ? "WAPE ↓ Càng thấp càng tốt" : "MAE ↓ Càng thấp càng tốt"}
            </span>
          </div>
          <p className="benchmark-card-subtitle">
            So sánh sai số dự báo giữa LightGBM và các phương pháp cơ bản trên toàn bộ walk-forward evaluation.
          </p>
        </div>

        <div className="benchmark-toggle-group" role="tablist" aria-label="Chọn chỉ số so sánh">
          <button
            type="button"
            role="tab"
            aria-selected={metric === "wape"}
            className={`benchmark-toggle-btn ${metric === "wape" ? "active" : ""}`}
            onClick={() => setMetric("wape")}
          >
            WAPE (%)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={metric === "mae"}
            className={`benchmark-toggle-btn ${metric === "mae" ? "active" : ""}`}
            onClick={() => setMetric("mae")}
          >
            MAE (đơn vị)
          </button>
        </div>
      </div>

      {/* Axis Scale Markers starting from 0 */}
      <div className="benchmark-axis-scale">
        <span>0{metric === "wape" ? "%" : ""}</span>
        <span>{metric === "wape" ? "5%" : "2.0"}</span>
        <span>{metric === "wape" ? "10%" : "4.0"}</span>
        <span>{metric === "wape" ? "15%" : "6.0"}</span>
        <span>{metric === "wape" ? "20%" : "8.0"}</span>
      </div>

      {/* Horizontal Bars */}
      <div className="benchmark-bars-list" role="list">
        {sortedModels.map((model) => {
          const rawValue =
            metric === "wape" ? model.overall.wape : model.overall.mae;
          const displayValue =
            metric === "wape"
              ? formatBenchmarkPercent(rawValue)
              : formatBenchmarkMetric(rawValue);

          // Percent width relative to 0 -> currentMax
          const barWidthPercent = Math.min(100, Math.max(2, (rawValue / currentMax) * 100));

          const isShelfCash = model.family === "shelfcash";
          const isBaselineBest = model.isBaselineBest;

          return (
            <div
              key={model.id}
              className={`benchmark-bar-row ${isShelfCash ? "is-shelfcash" : ""} ${isBaselineBest ? "is-baseline-best" : ""}`}
              role="listitem"
            >
              <div className="benchmark-bar-label-col">
                <div className="benchmark-model-name-wrap">
                  <span className="benchmark-model-name">{model.label}</span>
                  {isShelfCash && (
                    <>
                      <span className="benchmark-badge badge-shelfcash">
                        MÔ HÌNH SHELFCASH
                      </span>
                      <span className="benchmark-badge badge-best">
                        TỐT NHẤT
                      </span>
                    </>
                  )}
                  {isBaselineBest && (
                    <span className="benchmark-badge badge-baseline-strongest">
                      BASELINE MẠNH NHẤT
                    </span>
                  )}
                  {model.supportsQuantiles && (
                    <span className="benchmark-badge badge-quantile">
                      P25 / P50 / P75
                    </span>
                  )}
                </div>
                <span className="benchmark-model-desc">{model.description}</span>
              </div>

              <div className="benchmark-bar-track-col">
                <div className="benchmark-bar-track">
                  <div
                    className={`benchmark-bar-fill ${
                      isShelfCash
                        ? "fill-shelfcash"
                        : isBaselineBest
                        ? "fill-baseline-best"
                        : "fill-baseline"
                    }`}
                    style={{ width: `${barWidthPercent}%` }}
                    aria-label={`${model.label}: ${displayValue}`}
                  />
                </div>
              </div>

              <div className="benchmark-bar-value-col">
                <strong className={`benchmark-bar-value ${isShelfCash ? "text-emerald-700 font-bold" : ""}`}>
                  {displayValue}
                </strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="benchmark-chart-footnote">
        <span>* Thang đo bắt đầu từ 0 để phản ánh trung thực tỉ lệ sai số, không phóng đại độ chênh lệch.</span>
      </div>
    </div>
  );
}

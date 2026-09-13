"use client";

import React from "react";
import { HelpCircle } from "lucide-react";
import type { ForecastBenchmarkModel } from "../../../lib/forecast-benchmark/types";
import {
  formatBenchmarkMetric,
  formatBenchmarkPercent,
  getModelsSortedByWape,
} from "../../../lib/forecast-benchmark/selectors";

export interface BenchmarkTableProps {
  models: ForecastBenchmarkModel[];
}

export function BenchmarkTable({ models }: BenchmarkTableProps) {
  const sortedModels = getModelsSortedByWape(models);

  return (
    <div className="benchmark-card benchmark-table-container">
      <div className="benchmark-card-header">
        <h4 className="benchmark-card-title">Bảng chỉ số tổng hợp chi tiết</h4>
        <p className="benchmark-card-subtitle">
          Số liệu đánh giá chuẩn qua quy trình walk-forward validation (3 folds, 1.400 điểm dự báo).
        </p>
      </div>

      <div className="table-wrap">
        <table className="benchmark-table">
          <thead>
            <tr>
              <th style={{ width: "38%" }}>Mô hình</th>
              <th className="text-right" style={{ width: "16%" }}>
                <span className="inline-flex items-center gap-1 justify-end">
                  WAPE
                  <span
                    className="benchmark-info-icon"
                    title="Sai số tuyệt đối có trọng số theo tổng nhu cầu. Càng thấp càng tốt."
                  >
                    <HelpCircle size={13} />
                  </span>
                </span>
              </th>
              <th className="text-right" style={{ width: "14%" }}>
                <span className="inline-flex items-center gap-1 justify-end">
                  MAE
                  <span
                    className="benchmark-info-icon"
                    title="Sai số tuyệt đối trung bình giữa dự báo và thực tế. Càng thấp càng tốt."
                  >
                    <HelpCircle size={13} />
                  </span>
                </span>
              </th>
              <th className="text-right" style={{ width: "14%" }}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Bias
                  <span
                    className="benchmark-info-icon"
                    title="Xu hướng dự báo cao hoặc thấp hơn thực tế. Gần 0 hơn là cân bằng hơn (ít thiên lệch hơn)."
                  >
                    <HelpCircle size={13} />
                  </span>
                </span>
              </th>
              <th className="text-center" style={{ width: "18%" }}>
                <span className="inline-flex items-center gap-1 justify-center">
                  Phân vị Quantile
                  <span
                    className="benchmark-info-icon"
                    title="P25/P50/P75 thể hiện các khoảng nhu cầu từ thấp đến cao để phục vụ ra quyết định tồn kho."
                  >
                    <HelpCircle size={13} />
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.map((model) => {
              const isShelfCash = model.family === "shelfcash";
              const isBaselineBest = model.isBaselineBest;

              return (
                <tr
                  key={model.id}
                  className={`benchmark-table-row ${
                    isShelfCash ? "row-shelfcash bg-emerald-50/50" : ""
                  }`}
                >
                  <td>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className={isShelfCash ? "text-emerald-900 font-bold" : "text-slate-800"}>
                          {model.label}
                        </strong>
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
                      </div>
                      <span className="text-xs text-slate-500 mt-0.5">{model.description}</span>
                    </div>
                  </td>
                  <td className="text-right font-mono font-semibold">
                    <span className={isShelfCash ? "text-emerald-700 font-bold" : ""}>
                      {formatBenchmarkPercent(model.overall.wape)}
                    </span>
                  </td>
                  <td className="text-right font-mono">
                    {formatBenchmarkMetric(model.overall.mae)}
                  </td>
                  <td className="text-right font-mono text-slate-600">
                    {formatBenchmarkMetric(model.overall.bias)}
                  </td>
                  <td className="text-center">
                    {model.supportsQuantiles ? (
                      <span className="benchmark-badge badge-quantile">
                        P25/P50/P75
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs font-medium">Điểm</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="benchmark-table-footer">
        <span className="text-xs text-slate-500">
          * Bias: Gần 0 hơn thể hiện mô hình ít thiên lệch dự đoán thừa/thiếu hơn.
        </span>
      </div>
    </div>
  );
}

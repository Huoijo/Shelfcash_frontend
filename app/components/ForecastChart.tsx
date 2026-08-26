"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId } from "react";
import { addDaysToDateOnly } from "../../lib/api-contract";
import type { ForecastResult } from "../../lib/types";
import { formatDate, formatQuantity } from "./ui";

type ForecastTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: ForecastResult["forecast"][number] & { label?: string } }>;
  unit: string;
};

function ForecastTooltip({ active, payload, unit }: ForecastTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="forecast-tooltip">
      <strong>Ngày {point.label}</strong>
      {point.quantilesValid === false ? (
        <span>Dữ liệu dự báo không hợp lệ</span>
      ) : (
        <>
          <span>Nhu cầu thấp (P25): {point.p25 == null ? "—" : formatQuantity(point.p25, unit)}</span>
          <span>Mức dự báo trung tâm (P50): {point.p50 == null ? "—" : formatQuantity(point.p50, unit)}</span>
          <span>Nhu cầu cao (P75): {point.p75 == null ? "—" : formatQuantity(point.p75, unit)}</span>
        </>
      )}
      {point.actual == null ? null : <span>Số liệu thực tế: {formatQuantity(point.actual, unit)}</span>}
    </div>
  );
}

export function forecastPointsForRun(
  points: ForecastResult["forecast"],
  cutoffDate?: string,
  horizonDays?: number,
): ForecastResult["forecast"] {
  if (
    !cutoffDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) ||
    !Number.isInteger(horizonDays) ||
    horizonDays < 1
  ) {
    return points;
  }

  const lastDate = addDaysToDateOnly(cutoffDate, horizonDays);
  return points.filter(
    (point) => point.date >= cutoffDate && point.date <= lastDate,
  );
}

export function ForecastChart({
  forecast,
  compact = false,
  cutoffDate,
  horizonDays,
}: {
  forecast: ForecastResult;
  compact?: boolean;
  cutoffDate?: string;
  horizonDays?: number;
}) {
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const seriesName = forecast.product || forecast.ingredient || "sản phẩm";
  const seriesId =
    forecast.productId || forecast.ingredientId || seriesName;
  const gradientId = `forecast-confidence-${chartId}`;
  const forecastPoints = forecastPointsForRun(
    forecast.forecast,
    cutoffDate,
    horizonDays,
  );
  const hasRunWindow = forecastPoints !== forecast.forecast;
  const data = [
    ...(hasRunWindow ? [] : forecast.history.slice(compact ? -10 : -18)).map((point) => ({
      ...point,
      label: formatDate(point.date).slice(0, 5),
      confidenceRange: undefined,
    })),
    ...forecastPoints.map((point) => {
      const quantilesValid = point.quantilesValid !== false;
      return {
        ...point,
        p50: quantilesValid ? point.p50 : undefined,
        intervalLower: quantilesValid ? point.intervalLower : undefined,
        intervalUpper: quantilesValid ? point.intervalUpper : undefined,
        label: formatDate(point.date).slice(0, 5),
        confidenceRange:
          !quantilesValid || point.intervalLower == null || point.intervalUpper == null
            ? undefined
            : [point.intervalLower, point.intervalUpper],
      };
    }),
  ];

  return (
    <div
      className={compact ? "chart chart-compact" : "chart"}
      role="img"
      aria-label={`Biểu đồ số liệu thực tế và dự báo cho ${seriesName}, đơn vị ${forecast.unit}. P25 là nhu cầu thấp, P50 là mức trung tâm và P75 là nhu cầu cao.`}
      data-forecast-series-id={seriesId}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#70a99c" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#70a99c" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dfded7" strokeDasharray="2 5" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7773", fontSize: 13 }}
            minTickGap={22}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7773", fontSize: 13 }}
            width={45}
          />
          <Tooltip content={<ForecastTooltip unit={forecast.unit} />} />
          <Area
            type="monotone"
            dataKey="confidenceRange"
            stroke="none"
            fill={`url(#${gradientId})`}
            tooltipType="none"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="intervalLower"
            stroke="#a8c8c1"
            strokeDasharray="3 4"
            dot={false}
            strokeWidth={1.3}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="intervalUpper"
            stroke="#8cb7ad"
            strokeDasharray="3 4"
            dot={false}
            strokeWidth={1.3}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#9baaa6"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#315e55"
            dot={{ r: 3, fill: "#315e55", stroke: "#fbfbf8", strokeWidth: 2 }}
            strokeWidth={2.6}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

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
import type { ForecastResult } from "../../lib/types";
import { formatDate, formatQuantity } from "./ui";

export function ForecastChart({
  forecast,
  compact = false,
}: {
  forecast: ForecastResult;
  compact?: boolean;
}) {
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const seriesName = forecast.product || forecast.ingredient || "sản phẩm";
  const seriesId =
    forecast.productId || forecast.ingredientId || seriesName;
  const gradientId = `forecast-confidence-${chartId}`;
  const data = [
    ...forecast.history.slice(compact ? -10 : -18).map((point) => ({
      ...point,
      label: formatDate(point.date).slice(0, 5),
      confidenceRange: undefined,
    })),
    ...forecast.forecast.map((point) => ({
      ...point,
      label: formatDate(point.date).slice(0, 5),
      confidenceRange:
        point.intervalLower == null || point.intervalUpper == null
          ? undefined
          : [point.intervalLower, point.intervalUpper],
    })),
  ];

  return (
    <div
      className={compact ? "chart chart-compact" : "chart"}
      role="img"
      aria-label={`Dự báo ${seriesName}`}
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
            tick={{ fill: "#84908c", fontSize: 11 }}
            minTickGap={22}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#84908c", fontSize: 11 }}
            width={45}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #d7d7cf",
              borderRadius: 10,
              boxShadow: "0 10px 28px rgba(36,48,45,.08)",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatQuantity(Number(value), forecast.unit),
              name === "actual"
                ? "Thực tế"
                : name === "p50"
                  ? "Trung vị"
                  : name === "intervalLower"
                    ? "Cận tin cậy dưới"
                    : "Cận tin cậy trên",
            ]}
          />
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

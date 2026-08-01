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
import type { ForecastResult } from "../../lib/types";
import { formatDate, formatQuantity } from "./ui";

export function ForecastChart({
  forecast,
  compact = false,
}: {
  forecast: ForecastResult;
  compact?: boolean;
}) {
  const data = [
    ...forecast.history.slice(compact ? -10 : -18).map((point) => ({
      ...point,
      label: formatDate(point.date).slice(0, 5),
    })),
    ...forecast.forecast.map((point) => ({
      ...point,
      label: formatDate(point.date).slice(0, 5),
    })),
  ];

  return (
    <div className={compact ? "chart chart-compact" : "chart"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id={`forecast-${forecast.ingredient}`} x1="0" y1="0" x2="0" y2="1">
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
                  : name === "p25"
                    ? "Mức thấp"
                    : "Mức cao",
            ]}
          />
          <Area
            type="monotone"
            dataKey="p75"
            stroke="#8cb7ad"
            strokeDasharray="3 4"
            fill={`url(#forecast-${forecast.ingredient})`}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="p25"
            stroke="#a8c8c1"
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

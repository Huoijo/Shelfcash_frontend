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
import type { DecisionDemandView } from "../../lib/decision-view";
import { formatDate, formatQuantity, GuidanceHint } from "./ui";

type DemandChartProps = {
  rows: DecisionDemandView[];
  ingredientName: string;
  unit: string;
};

export function DemandChart({ rows, ingredientName, unit }: DemandChartProps) {
  const data = rows.map((row) => ({
    ...row,
    label: formatDate(row.targetDate).slice(0, 5),
    range: row.p25 == null || row.p75 == null ? undefined : [row.p25, row.p75],
  }));
  const summary = data.length
    ? `Nhu cầu ${ingredientName} từ ${formatDate(data[0].targetDate)} đến ${formatDate(data.at(-1)?.targetDate ?? data[0].targetDate)}. P50 là nhu cầu dự kiến; vùng màu thể hiện khoảng P25 đến P75.`
    : `Chưa có chuỗi nhu cầu cho ${ingredientName}.`;

  return <section aria-labelledby="demand-chart-title" className="decision-chart-panel">
    <div className="decision-chart-heading"><div><span className="eyebrow">Nhu cầu nguyên liệu</span><h3 id="demand-chart-title">{ingredientName} <GuidanceHint content="P50 là nhu cầu dự kiến; vùng màu là khoảng P25–P75." label="Cách đọc biểu đồ nhu cầu" /></h3></div><span>{unit || "Đơn vị chưa xác định"}</span></div>
    <p className="sr-only">{summary}</p>
    <div aria-label={summary} className="chart" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#dfded7" strokeDasharray="2 5" vertical={false} />
          <XAxis axisLine={false} dataKey="label" minTickGap={22} tick={{ fill: "#6b7773", fontSize: 13 }} tickLine={false} />
          <YAxis axisLine={false} tick={{ fill: "#6b7773", fontSize: 13 }} tickLine={false} width={45} />
          <Tooltip content={({ active, payload }) => {
            const point = payload?.[0]?.payload as typeof data[number] | undefined;
            return active && point ? <div className="forecast-tooltip"><strong>Ngày {point.label}</strong><span>Dự kiến: {point.p50 == null ? "—" : formatQuantity(point.p50, unit)}</span><span>Khoảng: {point.p25 == null ? "—" : formatQuantity(point.p25, unit)} – {point.p75 == null ? "—" : formatQuantity(point.p75, unit)}</span></div> : null;
          }} />
          <Area dataKey="range" fill="#70a99c" fillOpacity={0.18} stroke="none" tooltipType="none" />
          <Line connectNulls={false} dataKey="p50" dot={{ r: 3, fill: "#315e55", stroke: "#fbfbf8", strokeWidth: 2 }} stroke="#315e55" strokeWidth={2.8} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </section>;
}

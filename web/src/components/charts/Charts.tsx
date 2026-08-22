"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export function BarChartCard({
  data,
  xKey,
  yKey,
  color = "#016FD0",
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  color?: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#D0E4F6" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "#5B7A9A", fontSize: 11 }} />
          <YAxis tick={{ fill: "#5B7A9A", fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineChartCard({
  data,
  xKey,
  series,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Array<{ key: string; color: string; name?: string }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#D0E4F6" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "#5B7A9A", fontSize: 11 }} />
          <YAxis tick={{ fill: "#5B7A9A", fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name || s.key}
              stroke={s.color}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

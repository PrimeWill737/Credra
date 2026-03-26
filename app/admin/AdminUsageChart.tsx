"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./admin.module.scss";

type Row = Record<string, unknown>;

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function AdminUsageChart({ rows }: { rows: Row[] }) {
  const sorted = [...rows]
    .map((r) => ({
      day: String(r.day ?? "").slice(0, 10),
      api_calls: toNum(r.api_calls),
      revenue: toNum(r.revenue),
      error_count: toNum(r.error_count),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  if (!sorted.length) {
    return <p className={styles.chartEmpty}>No usage series yet.</p>;
  }

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={sorted} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(10, 37, 64, 0.1)" />
          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(10, 37, 64, 0.55)", fontSize: 11 }}
            stroke="rgba(10, 37, 64, 0.15)"
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "rgba(10, 37, 64, 0.55)", fontSize: 11 }}
            stroke="rgba(10, 37, 64, 0.15)"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "rgba(10, 37, 64, 0.45)", fontSize: 11 }}
            stroke="rgba(10, 37, 64, 0.15)"
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid rgba(10, 37, 64, 0.1)",
              borderRadius: "8px",
              color: "#0a2540",
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="api_calls"
            name="API calls"
            stroke="#0a2540"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#6c5ce7"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

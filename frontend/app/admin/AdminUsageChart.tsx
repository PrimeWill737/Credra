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
          <CartesianGrid strokeDasharray="3 3" stroke="#1f3a52" />
          <XAxis dataKey="day" tick={{ fill: "#9fb4cc", fontSize: 11 }} stroke="#2a4a66" />
          <YAxis yAxisId="left" tick={{ fill: "#9fb4cc", fontSize: 11 }} stroke="#2a4a66" />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#83ddcf", fontSize: 11 }}
            stroke="#2a4a66"
          />
          <Tooltip
            contentStyle={{
              background: "#0d1d2a",
              border: "1px solid #1a2f44",
              borderRadius: "8px",
              color: "#e6f2ff",
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="api_calls"
            name="API calls"
            stroke="#5b9bd5"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#11b7aa"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

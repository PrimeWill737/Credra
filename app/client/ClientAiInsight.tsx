"use client";

import styles from "./client.module.scss";

export type AiEndpointKind = "credit-score" | "fraud-check" | "risk-analysis";

type Props = {
  kind: AiEndpointKind;
  data: Record<string, unknown>;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function notesList(data: Record<string, unknown>): string[] {
  const n = data.notes;
  if (Array.isArray(n)) {
    return n.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}

function bandLabel(band: string): string {
  const b = band.toLowerCase();
  if (b === "low") return "Lower risk";
  if (b === "medium") return "Moderate risk";
  if (b === "high") return "Higher risk";
  return band;
}

function parseRiskBand(data: Record<string, unknown>, analysis?: Record<string, unknown>): string {
  const top = str(data.risk_band);
  if (top) return top;
  const h = analysis?.headline;
  if (typeof h === "string" && /risk band:/i.test(h)) {
    return h.replace(/^Risk band:\s*/i, "").trim() || "medium";
  }
  return "medium";
}

function suggestionsFor(band: string, fraudProb: number | null): string[] {
  const out: string[] = [];
  const b = band.toLowerCase();
  if (b === "low") {
    out.push("Cashflow signals look stable for the window you tested.");
    out.push("Keep linking real accounts when you go live so scores stay grounded in behaviour.");
  } else if (b === "medium") {
    out.push("Review spend versus income — consider a shorter lookback or extra income verification.");
    out.push("If this is a borderline applicant, queue for manual review before a large limit.");
  } else {
    out.push("Treat this as elevated risk: gather more verified income and bank history.");
    out.push("Avoid automated approvals until behaviour improves or documentation is on file.");
  }
  if (fraudProb != null && fraudProb > 0.35) {
    out.push("Fraud probability is on the high side — add step-up verification or device checks.");
  }
  return out;
}

export function ClientAiInsight({ kind, data }: Props) {
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? undefined;

  const score =
    kind === "risk-analysis"
      ? num(analysis?.score) ?? num(data.score)
      : num(data.score);

  const fraudProb =
    kind === "risk-analysis"
      ? num(analysis?.fraud_probability) ?? num(data.fraud_probability)
      : num(data.fraud_probability);

  const defaultRisk =
    kind === "risk-analysis" ? num(analysis?.default_risk) ?? num(data.default_risk) : num(data.default_risk);

  const bandRaw = parseRiskBand(data, analysis);
  const notes = notesList(data);

  const bandClass =
    bandRaw.toLowerCase() === "low"
      ? styles.aiBandLow
      : bandRaw.toLowerCase() === "high"
        ? styles.aiBandHigh
        : styles.aiBandMid;

  const sug = suggestionsFor(bandRaw, fraudProb);

  const scorePct = score != null ? Math.min(100, Math.max(0, score)) : null;
  const fraudPct = fraudProb != null ? Math.min(100, Math.max(0, fraudProb * 100)) : null;

  return (
    <div className={styles.aiInsight}>
      <div className={styles.aiInsightHeader}>
        <span className={styles.aiInsightKicker}>
          {kind === "credit-score" && "Credit score"}
          {kind === "fraud-check" && "Fraud check"}
          {kind === "risk-analysis" && "Risk analysis"}
        </span>
        <span className={`${styles.aiBand} ${bandClass}`}>{bandLabel(bandRaw)}</span>
      </div>

      {kind === "risk-analysis" && typeof analysis?.headline === "string" ? (
        <p className={styles.aiHeadline}>{String(analysis.headline)}</p>
      ) : null}

      <div className={styles.aiChartsRow}>
        {scorePct != null ? (
          <div className={styles.aiChartCard}>
            <div className={styles.aiChartTitle}>Trust score (0–100)</div>
            <div className={styles.aiScoreBig}>{Math.round(score ?? 0)}</div>
            <div className={styles.aiMeterTrack} aria-hidden>
              <div className={styles.aiMeterFill} style={{ width: `${scorePct}%` }} />
            </div>
            {defaultRisk != null ? (
              <p className={styles.aiMutedSmall}>
                Model default-risk estimate: <strong>{(defaultRisk * 100).toFixed(1)}%</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        {fraudPct != null ? (
          <div className={styles.aiChartCard}>
            <div className={styles.aiChartTitle}>Fraud probability</div>
            <div className={styles.aiScoreBig}>
              {fraudProb != null ? (fraudProb * 100).toFixed(1) : "—"}%
            </div>
            <div className={styles.aiMeterTrack} aria-hidden>
              <div
                className={`${styles.aiMeterFill} ${styles.aiMeterFillFraud}`}
                style={{ width: `${fraudPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {notes.length > 0 ? (
        <div className={styles.aiBlock}>
          <h4 className={styles.aiBlockTitle}>Model notes</h4>
          <ul className={styles.aiBulletList}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.aiBlock}>
        <h4 className={styles.aiBlockTitle}>Suggested next steps</h4>
        <ul className={styles.aiBulletList}>
          {sug.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

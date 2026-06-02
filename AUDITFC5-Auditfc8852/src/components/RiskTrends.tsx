import React, { useMemo } from "react";
import { ComplianceReport } from "../types";
import { CHECKLIST_ITEMS } from "../constants";

// ── FC design-system tokens ───────────────────────────────────────────
const FC = {
  navy900: "#1a2e4a",
  navy700: "#2a4266",
  navy500: "#3d5a80",
  navy50:  "#e8eff8",
  coral:   "#e8424b",
  amber:   "#f59e0b",
  emerald: "#10b981",
  blue:    "#3b82f6",
  violet:  "#8b5cf6",
  pink:    "#ec4899",
};

const STRIPE = [FC.coral, FC.amber, FC.emerald, FC.blue, FC.violet, FC.pink];

// Bar colour: red at high %, green at low %
function gapBarColor(pct: number) {
  if (pct >= 60) return FC.coral;
  if (pct >= 40) return FC.amber;
  if (pct >= 25) return "#f59e0b";
  return FC.emerald;
}

// Score ring colour
function scoreColor(s: number) {
  if (s >= 80) return FC.emerald;
  if (s >= 60) return FC.amber;
  return FC.coral;
}

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function currentQuarterEnd() {
  const n = new Date();
  const qEndMonth = Math.floor(n.getMonth() / 3) * 3 + 3;
  return new Date(n.getFullYear(), qEndMonth, 0);
}

// ─────────────────────────────────────────────────────────────────────

interface Props {
  reports: ComplianceReport[];
  onStartAudit: () => void;
}

export default function RiskTrends({ reports, onStartAudit }: Props) {
  const ninetyDaysAgo = useMemo(() => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), []);
  const quarterEnd    = useMemo(() => currentQuarterEnd(), []);

  // ── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const dueThisQuarter = reports.filter(r =>
      r.remedialActions.some(a => a.status === "PENDING" && new Date(a.dueDate) <= quarterEnd)
    ).length;

    const completed = reports.filter(r =>
      r.remedialActions.length === 0 || r.remedialActions.every(a => a.status === "RESOLVED")
    ).length;

    const remedialOpen = reports.reduce(
      (sum, r) => sum + r.remedialActions.filter(a => a.status === "PENDING").length, 0
    );

    const highRisk = reports.filter(r => r.score < 60).length;

    return [
      { label: "Due this quarter", value: dueThisQuarter, color: FC.coral },
      { label: "Completed",        value: completed,       color: FC.emerald },
      { label: "Remedial open",    value: remedialOpen,    color: FC.amber },
      { label: "High risk files",  value: highRisk,        color: FC.coral },
    ];
  }, [reports, quarterEnd]);

  // ── Top compliance gaps (last 90 days) ───────────────────────────
  const topGaps = useMemo(() => {
    const recent = reports.filter(r => new Date(r.createdAt) >= ninetyDaysAgo);
    if (recent.length === 0) return [];

    const counts: Record<string, number> = {};
    recent.forEach(r => r.findings.forEach(f => {
      if (f.status === "NO") counts[f.itemId] = (counts[f.itemId] ?? 0) + 1;
    }));

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        label: CHECKLIST_ITEMS.find(i => i.id === id)?.text ?? id,
        count,
        pct: Math.round((count / recent.length) * 100),
      }));
  }, [reports, ninetyDaysAgo]);

  // ── Per-representative latest scores ────────────────────────────
  const reps = useMemo(() => {
    const map: Record<string, ComplianceReport> = {};
    reports.forEach(r => {
      const n = r.metadata.representativeName;
      if (!map[n] || r.createdAt > map[n].createdAt) map[n] = r;
    });
    return Object.entries(map)
      .map(([name, r]) => ({
        name,
        score: r.score,
        lastAudit: r.createdAt,
        overdue: new Date(r.createdAt) < ninetyDaysAgo,
      }))
      .sort((a, b) => b.score - a.score);
  }, [reports, ninetyDaysAgo]);

  // ── Score distribution ───────────────────────────────────────────
  const distribution = useMemo(() => {
    const bands = [
      { label: "Excellent (90–100%)", min: 90,  max: 100, color: FC.emerald },
      { label: "Good (75–89%)",       min: 75,  max: 89,  color: "#34d399" },
      { label: "Fair (60–74%)",       min: 60,  max: 74,  color: FC.amber },
      { label: "Poor (<60%)",         min: 0,   max: 59,  color: FC.coral },
    ];
    return bands.map(b => ({
      ...b,
      count: reports.filter(r => r.score >= b.min && r.score <= b.max).length,
    }));
  }, [reports]);

  const maxBand = Math.max(...distribution.map(d => d.count), 1);

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden relative"
        style={{ background: FC.navy900 }}
      >
        <div className="px-8 py-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Old Mutual Wealth · Mandated Brokerage
            </p>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
              FAIRBAIRN <span className="font-light">CONSULT</span>
            </h1>
            {/* Rainbow stripe */}
            <div className="flex h-1 rounded-full overflow-hidden mt-3" style={{ width: 120 }}>
              {STRIPE.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Risk &amp; Trends Dashboard
            </p>
            <p className="text-lg font-semibold" style={{ color: "#fff" }}>
              {reports.length} audit{reports.length !== 1 ? "s" : ""} on record
            </p>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              Last updated {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        {/* Bottom rainbow strip */}
        <div className="flex h-1">
          {STRIPE.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: FC.navy50 }}>
            <svg className="w-7 h-7" fill="none" stroke={FC.navy900} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <p className="font-bold text-slate-800 text-lg mb-1">No audits yet</p>
          <p className="text-slate-500 text-sm mb-6">Complete your first audit to see risk trends and representative scores.</p>
          <button
            onClick={onStartAudit}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-colors"
            style={{ background: FC.navy900 }}
          >
            Start first audit
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        </div>
      ) : (
        <>
          {/* ── KPI tiles ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-2xl p-5 flex flex-col gap-2"
                style={{ background: FC.navy900 }}
              >
                <span className="text-4xl font-bold" style={{ color }}>{value}</span>
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Two-column section ─────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Top compliance gaps */}
            <div
              className="rounded-2xl p-6"
              style={{ background: FC.navy900 }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Top Compliance Gaps — Last 90 Days
              </p>
              {topGaps.length === 0 ? (
                <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.4)" }}>No failures recorded in last 90 days.</p>
              ) : (
                <div className="space-y-4">
                  {topGaps.map(({ id, label, pct }) => (
                    <div key={id}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {label.replace(/\?$/, "")}
                        </span>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: gapBarColor(pct) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Score distribution */}
            <div
              className="rounded-2xl p-6"
              style={{ background: FC.navy900 }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Score Distribution — All Audits
              </p>
              <div className="space-y-4">
                {distribution.map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</span>
                      <span className="text-xs font-bold" style={{ color }}>
                        {count} audit{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((count / maxBand) * 100)}%`, background: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Representatives ────────────────────────────────── */}
          <div
            className="rounded-2xl p-6"
            style={{ background: FC.navy900 }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
              Representatives — Compliance Score
            </p>

            {reps.length === 0 ? (
              <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.4)" }}>No representative data yet.</p>
            ) : (
              <div className="space-y-4">
                {reps.map(({ name, score, lastAudit, overdue }) => {
                  const sc = scoreColor(score);
                  return (
                    <div key={name} className="flex items-center gap-4">
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: `${sc}22`, color: sc, border: `1.5px solid ${sc}44` }}
                      >
                        {initials(name)}
                      </div>

                      {/* Name + date + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold truncate" style={{ color: "#fff" }}>{name}</span>
                          <span
                            className="text-xs flex-shrink-0"
                            style={{ color: overdue ? FC.coral : "rgba(255,255,255,0.4)" }}
                          >
                            {overdue ? "Overdue — " : "Last audited "}
                            {formatDate(lastAudit)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${score}%`, background: sc }}
                          />
                        </div>
                      </div>

                      {/* Score badge */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{ background: `${sc}18`, color: sc, border: `1.5px solid ${sc}44` }}
                      >
                        {score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Start new audit CTA */}
            <button
              onClick={onStartAudit}
              className="mt-6 w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)";
                (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)";
              }}
            >
              Start new audit
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
            </button>
          </div>

          {/* ── Remedial actions summary ─────────────────────── */}
          {reports.some(r => r.remedialActions.some(a => a.status === "PENDING")) && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div
                className="px-6 py-4 flex items-center gap-3"
                style={{ background: FC.navy50, borderBottom: `1px solid rgba(26,46,74,0.12)` }}
              >
                <svg className="w-4 h-4" fill="none" stroke={FC.navy900} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: FC.navy900 }}>
                  Pending Remedial Actions
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {reports
                  .flatMap(r => r.remedialActions
                    .filter(a => a.status === "PENDING")
                    .map(a => ({ action: a, rep: r.metadata.representativeName, client: r.metadata.clientName }))
                  )
                  .sort((a, b) => a.action.dueDate.localeCompare(b.action.dueDate))
                  .slice(0, 8)
                  .map(({ action, rep, client }) => {
                    const daysLeft = Math.ceil((new Date(action.dueDate).getTime() - Date.now()) / 86400000);
                    const overdue = daysLeft < 0;
                    const urgent = daysLeft >= 0 && daysLeft <= 7;
                    return (
                      <div key={action.id} className="px-6 py-4 flex items-start gap-4">
                        <div
                          className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                          style={{ background: overdue ? FC.coral : urgent ? FC.amber : FC.emerald }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-snug">{action.description}</p>
                          <p className="text-xs text-slate-400 mt-1">{rep} · {client}</p>
                        </div>
                        <span
                          className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                          style={{
                            background: overdue ? "#fef2f2" : urgent ? "#fffbeb" : "#ecfdf5",
                            color: overdue ? FC.coral : urgent ? "#92400e" : "#065f46",
                          }}
                        >
                          {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

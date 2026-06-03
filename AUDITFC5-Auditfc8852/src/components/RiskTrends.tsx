import React, { useMemo, useState } from "react";
import { ComplianceReport } from "../types";
import { CHECKLIST_ITEMS } from "../constants";

// ── FC design-system tokens ───────────────────────────────────────────
const FC = {
  navy900: "#1a2e4a",
  navy700: "#2a4266",
  navy50:  "#e8eff8",
  coral:   "#e8424b",
  amber:   "#f59e0b",
  emerald: "#10b981",
  blue:    "#3b82f6",
  violet:  "#8b5cf6",
  pink:    "#ec4899",
};

const STRIPE = [FC.coral, FC.amber, FC.emerald, FC.blue, FC.violet, FC.pink];

function gapBarColor(pct: number) {
  if (pct >= 60) return FC.coral;
  if (pct >= 40) return FC.amber;
  if (pct >= 25) return FC.amber;
  return FC.emerald;
}

function scoreColor(s: number) {
  if (s >= 80) return FC.emerald;
  if (s >= 60) return FC.amber;
  return FC.coral;
}

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function currentQuarterEnd() {
  const n = new Date();
  return new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3 + 3, 0);
}

// ─────────────────────────────────────────────────────────────────────

interface Period { year: number; month: number }

interface Props {
  reports: ComplianceReport[];
  onStartAudit: () => void;
}

export default function RiskTrends({ reports, onStartAudit }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [isExporting, setIsExporting]       = useState(false);

  const quarterEnd = useMemo(() => currentQuarterEnd(), []);

  // ── Available months derived from report dates ────────────────────
  const availablePeriods = useMemo<(Period & { label: string })[]>(() => {
    const seen = new Set<string>();
    const out: (Period & { label: string })[] = [];
    reports.forEach(r => {
      const d = new Date(r.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          label: d.toLocaleString("en-ZA", { month: "long", year: "numeric" }),
        });
      }
    });
    return out.sort((a, b) => b.year - a.year || b.month - a.month);
  }, [reports]);

  // ── Period-filtered subset (for charts) ──────────────────────────
  const filtered = useMemo(() => {
    if (!selectedPeriod) return reports;
    return reports.filter(r => {
      const d = new Date(r.createdAt);
      return d.getFullYear() === selectedPeriod.year && d.getMonth() === selectedPeriod.month;
    });
  }, [reports, selectedPeriod]);

  const periodLabel = selectedPeriod
    ? new Date(selectedPeriod.year, selectedPeriod.month, 1).toLocaleString("en-ZA", { month: "long", year: "numeric" })
    : "All time";

  // ── KPIs (action items always use all reports; counts use filtered) ─
  const kpis = useMemo(() => {
    const dueThisQuarter = reports.filter(r =>
      r.remedialActions.some(a => a.status === "PENDING" && new Date(a.dueDate) <= quarterEnd)
    ).length;
    const completed = filtered.filter(r =>
      r.remedialActions.length === 0 || r.remedialActions.every(a => a.status === "RESOLVED")
    ).length;
    const remedialOpen = reports.reduce(
      (s, r) => s + r.remedialActions.filter(a => a.status === "PENDING").length, 0
    );
    const highRisk = filtered.filter(r => r.score < 60).length;
    return [
      { label: "Due this quarter", value: dueThisQuarter, color: FC.coral,   note: "all-time" },
      { label: "Completed",        value: completed,       color: FC.emerald, note: periodLabel },
      { label: "Remedial open",    value: remedialOpen,    color: FC.amber,   note: "all-time" },
      { label: "High risk files",  value: highRisk,        color: FC.coral,   note: periodLabel },
    ];
  }, [reports, filtered, quarterEnd, periodLabel]);

  // ── Top compliance gaps ───────────────────────────────────────────
  const topGaps = useMemo(() => {
    if (filtered.length === 0) return [];
    const counts: Record<string, number> = {};
    filtered.forEach(r => r.findings.forEach(f => {
      if (f.status === "NO") counts[f.itemId] = (counts[f.itemId] ?? 0) + 1;
    }));
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        label: CHECKLIST_ITEMS.find(i => i.id === id)?.text ?? id,
        count,
        pct: Math.round((count / filtered.length) * 100),
      }));
  }, [filtered]);

  // ── Score distribution ───────────────────────────────────────────
  const distribution = useMemo(() => {
    const bands = [
      { label: "Excellent (90–100%)", min: 90, max: 100, color: FC.emerald },
      { label: "Good (75–89%)",       min: 75, max: 89,  color: "#34d399"  },
      { label: "Fair (60–74%)",       min: 60, max: 74,  color: FC.amber   },
      { label: "Poor (<60%)",         min: 0,  max: 59,  color: FC.coral   },
    ];
    return bands.map(b => ({
      ...b,
      count: filtered.filter(r => r.score >= b.min && r.score <= b.max).length,
    }));
  }, [filtered]);
  const maxBand = Math.max(...distribution.map(d => d.count), 1);

  // ── Per-representative scores (filtered period) ───────────────────
  const reps = useMemo(() => {
    const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const map: Record<string, ComplianceReport> = {};
    filtered.forEach(r => {
      const n = r.metadata.representativeName;
      if (!map[n] || r.createdAt > map[n].createdAt) map[n] = r;
    });
    return Object.entries(map)
      .map(([name, r]) => ({
        name,
        score: r.score,
        lastAudit: r.createdAt,
        overdue: !selectedPeriod && new Date(r.createdAt) < ninetyAgo,
      }))
      .sort((a, b) => b.score - a.score);
  }, [filtered, selectedPeriod]);

  // ── Word export ───────────────────────────────────────────────────
  const handleDownloadWord = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel,
              Table, TableRow, TableCell, WidthType, AlignmentType,
              BorderStyle } = await import("docx");

      const gap = () => new Paragraph({ text: "" });
      const ruled = () => new Paragraph({
        border: { bottom: { color: "CCCCCC", style: BorderStyle.SINGLE, size: 6 } },
        text: "",
      });

      const sectionHead = (text: string) =>
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 80 },
          children: [new TextRun({ text, bold: true, color: "1A2E4A", size: 26 })],
        });

      const metaRow = (label: string, value: string) =>
        new TableRow({ children: [
          new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: "666666" })] })],
          }),
          new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20 })] })],
          }),
        ]});

      // KPI summary table
      const kpiCells = kpis.map(k =>
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: "E8EFF8" },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(k.value), bold: true, size: 52, color: "1A2E4A" })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.label.toUpperCase(), size: 16, color: "666666" })] }),
          ],
        })
      );
      const kpiTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: kpiCells })],
      });

      // Gap bars (text-based)
      const gapParas = topGaps.length === 0
        ? [new Paragraph({ children: [new TextRun({ text: "No failures recorded for this period.", italics: true, color: "888888", size: 20 })] })]
        : topGaps.flatMap(g => [
            new Paragraph({ spacing: { before: 80 },
              children: [
                new TextRun({ text: g.label.replace(/\?$/, ""), size: 20 }),
                new TextRun({ text: `  ${g.pct}%`, bold: true, size: 20,
                  color: g.pct >= 60 ? "E8424B" : g.pct >= 40 ? "F59E0B" : "10B981" }),
              ],
            }),
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: Math.max(4, Math.round(g.pct / 5)),
                color: g.pct >= 60 ? "E8424B" : g.pct >= 40 ? "F59E0B" : "10B981" } },
              text: "",
            }),
          ]);

      // Rep scores
      const repParas = reps.length === 0
        ? [new Paragraph({ children: [new TextRun({ text: "No data for selected period.", italics: true, color: "888888", size: 20 })] })]
        : reps.map(r =>
            new Paragraph({ spacing: { before: 60 },
              children: [
                new TextRun({ text: r.name, bold: true, size: 22 }),
                new TextRun({ text: `   ${r.score}%`, bold: true, size: 22,
                  color: r.score >= 80 ? "10B981" : r.score >= 60 ? "F59E0B" : "E8424B" }),
                new TextRun({ text: `   Last audited ${fmtDate(r.lastAudit)}`, size: 18, color: "888888" }),
              ],
            })
          );

      // Pending actions
      const pendingAll = reports.flatMap(r =>
        r.remedialActions.filter(a => a.status === "PENDING")
          .map(a => ({ ...a, rep: r.metadata.representativeName, client: r.metadata.clientName }))
      ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      const actionParas = pendingAll.length === 0
        ? [new Paragraph({ children: [new TextRun({ text: "No pending remedial actions.", italics: true, color: "10B981", size: 20 })] })]
        : pendingAll.map((a, i) => {
            const days = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400000);
            return new Paragraph({ spacing: { before: 80 },
              children: [
                new TextRun({ text: `${i + 1}. `, bold: true, size: 20 }),
                new TextRun({ text: a.description, size: 20 }),
                new TextRun({ text: `\n    ${a.rep} · ${a.client} · Due: ${fmtDate(a.dueDate)}`,
                  size: 18, color: days < 0 ? "E8424B" : "888888" }),
              ],
            });
          });

      const doc = new Document({
        styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
        sections: [{
          children: [
            // Title block
            new Paragraph({
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "FAIRBAIRN CONSULT", bold: true, size: 52, color: "1A2E4A" })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Risk & Trends Report", size: 32, color: "3D5A80" })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 280 },
              children: [new TextRun({ text: `Period: ${periodLabel}`, bold: true, size: 24, color: "1A2E4A" })],
            }),
            ruled(),
            gap(),

            // Report metadata
            sectionHead("Report Details"),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                metaRow("Period",          periodLabel),
                metaRow("Audits included", String(filtered.length)),
                metaRow("Generated",       new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })),
                metaRow("Total audits",    String(reports.length)),
              ],
            }),
            gap(),

            // KPIs
            sectionHead("Key Performance Indicators"),
            kpiTable,
            gap(),

            // Compliance gaps
            sectionHead("Top Compliance Gaps"),
            new Paragraph({ spacing: { after: 80 },
              children: [new TextRun({ text: `Based on ${filtered.length} audit${filtered.length !== 1 ? "s" : ""} in ${periodLabel}`, italics: true, size: 18, color: "888888" })],
            }),
            ...gapParas,
            gap(),

            // Score distribution
            sectionHead("Score Distribution"),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ tableHeader: true, children: [
                  new TableCell({ shading: { fill: "1A2E4A" }, children: [new Paragraph({ children: [new TextRun({ text: "Band", bold: true, color: "FFFFFF", size: 20 })] })] }),
                  new TableCell({ shading: { fill: "1A2E4A" }, children: [new Paragraph({ children: [new TextRun({ text: "Audits", bold: true, color: "FFFFFF", size: 20 })] })] }),
                  new TableCell({ shading: { fill: "1A2E4A" }, children: [new Paragraph({ children: [new TextRun({ text: "Share", bold: true, color: "FFFFFF", size: 20 })] })] }),
                ]}),
                ...distribution.map(d => new TableRow({ children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.label, size: 20 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(d.count), bold: true, size: 20, color: d.color.replace("#", "") })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${filtered.length ? Math.round(d.count / filtered.length * 100) : 0}%`, size: 20 })] })] }),
                ]})),
              ],
            }),
            gap(),

            // Representative scores
            sectionHead("Representative Compliance Scores"),
            new Paragraph({ spacing: { after: 80 },
              children: [new TextRun({ text: `Showing latest score per representative for ${periodLabel}`, italics: true, size: 18, color: "888888" })],
            }),
            ...repParas,
            gap(),

            // Pending actions
            sectionHead("All Pending Remedial Actions"),
            new Paragraph({ spacing: { after: 80 },
              children: [new TextRun({ text: `${pendingAll.length} action${pendingAll.length !== 1 ? "s" : ""} outstanding across all audits`, italics: true, size: 18, color: "888888" })],
            }),
            ...actionParas,
            gap(),
            ruled(),

            // Footer
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200 },
              children: [
                new TextRun({ text: "FAIRBAIRN CONSULT · ", bold: true, size: 18, color: "1A2E4A" }),
                new TextRun({ text: "Wealth creation and protection · Licensed Financial Services Provider", size: 18, color: "888888" }),
              ],
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `FC_RiskTrends_${periodLabel.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Word export failed:", e);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: FC.navy900 }}>
        <div className="px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          {/* Branding */}
          <div>
            <h1 className="text-2xl font-bold tracking-wide" style={{ color: "#fff" }}>
              FAIRBAIRN <span className="font-light">CONSULT</span>
            </h1>
            <p className="text-xs uppercase tracking-widest mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Risk &amp; Trends Dashboard
            </p>
            <div className="flex h-1 rounded-full overflow-hidden mt-3" style={{ width: 120 }}>
              {STRIPE.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
            </div>
          </div>

          {/* Period selector + export */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                Period:
              </label>
              <select
                value={selectedPeriod ? `${selectedPeriod.year}-${selectedPeriod.month}` : "all"}
                onChange={e => {
                  if (e.target.value === "all") { setSelectedPeriod(null); return; }
                  const [y, m] = e.target.value.split("-").map(Number);
                  setSelectedPeriod({ year: y, month: m });
                }}
                className="text-sm font-semibold rounded-xl px-3 py-2 border-0 focus:ring-2 cursor-pointer"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                <option value="all" style={{ background: FC.navy900 }}>All time</option>
                {availablePeriods.map(p => (
                  <option
                    key={`${p.year}-${p.month}`}
                    value={`${p.year}-${p.month}`}
                    style={{ background: FC.navy900 }}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Download Word */}
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={isExporting || reports.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              {isExporting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                  <path d="M14 2v6h6" fill="none" stroke="white" strokeWidth="1.5"/>
                </svg>
              )}
              {isExporting ? "Exporting…" : "Download Word"}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-8 px-8 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Showing</span>
            <span className="text-sm font-semibold ml-2" style={{ color: "#fff" }}>
              {filtered.length} of {reports.length} audit{reports.length !== 1 ? "s" : ""}
            </span>
            <span className="text-sm ml-1" style={{ color: "rgba(255,255,255,0.45)" }}>· {periodLabel}</span>
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
          <button onClick={onStartAudit} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white" style={{ background: FC.navy900 }}>
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
            {kpis.map(({ label, value, color, note }) => (
              <div key={label} className="rounded-2xl p-5 flex flex-col gap-1" style={{ background: FC.navy900 }}>
                <span className="text-4xl font-bold" style={{ color }}>{value}</span>
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {label}
                </span>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{note}</span>
              </div>
            ))}
          </div>

          {/* ── Gaps + Distribution ────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-6" style={{ background: FC.navy900 }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Top Compliance Gaps — {periodLabel}
              </p>
              {topGaps.length === 0 ? (
                <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.4)" }}>No failures recorded for this period.</p>
              ) : (
                <div className="space-y-4">
                  {topGaps.map(({ id, label, pct }) => (
                    <div key={id}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{label.replace(/\?$/, "")}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: gapBarColor(pct) }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl p-6" style={{ background: FC.navy900 }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Score Distribution — {periodLabel}
              </p>
              <div className="space-y-4">
                {distribution.map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</span>
                      <span className="text-xs font-bold" style={{ color }}>{count} audit{count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((count / maxBand) * 100)}%`, background: color }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Representatives ────────────────────────────────── */}
          <div className="rounded-2xl p-6" style={{ background: FC.navy900 }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
              Representatives — Compliance Score — {periodLabel}
            </p>
            {reps.length === 0 ? (
              <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.4)" }}>No audits for this period.</p>
            ) : (
              <div className="space-y-4">
                {reps.map(({ name, score, lastAudit, overdue }) => {
                  const sc = scoreColor(score);
                  return (
                    <div key={name} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: `${sc}22`, color: sc, border: `1.5px solid ${sc}44` }}>
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold truncate" style={{ color: "#fff" }}>{name}</span>
                          <span className="text-xs flex-shrink-0" style={{ color: overdue ? FC.coral : "rgba(255,255,255,0.4)" }}>
                            {overdue ? "Overdue — " : "Last audited "}{fmtDate(lastAudit)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: sc }}/>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{ background: `${sc}18`, color: sc, border: `1.5px solid ${sc}44` }}>
                        {score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={onStartAudit}
              className="mt-6 w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
            >
              Start new audit
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
            </button>
          </div>

          {/* ── Pending remedial actions (always all-time) ───────── */}
          {reports.some(r => r.remedialActions.some(a => a.status === "PENDING")) && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3" style={{ background: FC.navy50, borderBottom: `1px solid rgba(26,46,74,0.12)` }}>
                <svg className="w-4 h-4" fill="none" stroke={FC.navy900} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: FC.navy900 }}>
                  Pending Remedial Actions — All Time
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {reports
                  .flatMap(r => r.remedialActions.filter(a => a.status === "PENDING")
                    .map(a => ({ action: a, rep: r.metadata.representativeName, client: r.metadata.clientName })))
                  .sort((a, b) => a.action.dueDate.localeCompare(b.action.dueDate))
                  .slice(0, 10)
                  .map(({ action, rep, client }) => {
                    const daysLeft = Math.ceil((new Date(action.dueDate).getTime() - Date.now()) / 86400000);
                    const overdue = daysLeft < 0;
                    const urgent  = daysLeft >= 0 && daysLeft <= 7;
                    return (
                      <div key={action.id} className="px-6 py-4 flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                          style={{ background: overdue ? FC.coral : urgent ? FC.amber : FC.emerald }}/>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-snug">{action.description}</p>
                          <p className="text-xs text-slate-400 mt-1">{rep} · {client}</p>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                          style={{ background: overdue ? "#fef2f2" : urgent ? "#fffbeb" : "#ecfdf5",
                            color: overdue ? FC.coral : urgent ? "#92400e" : "#065f46" }}>
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

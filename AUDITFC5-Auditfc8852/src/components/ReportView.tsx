import React, { useState, useEffect } from "react";
import { ComplianceReport, RemedialAction } from "../types";
import { CHECKLIST_ITEMS } from "../constants";
import { generateReportSummary } from "../azureOpenAIService";

interface ReportViewProps {
  report: ComplianceReport;
  onBack: () => void;
  onUpdateReport: (updatedReport: ComplianceReport) => void;
  onFollowUp: () => void;
}

const ReportView: React.FC<ReportViewProps> = ({ 
  report, 
  onBack,
  onUpdateReport,
  onFollowUp
}) => {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  useEffect(() => {
    const fetchSummary = async () => {
      setIsSummarizing(true);
      try {
        const summary = await generateReportSummary(report.metadata, report.findings);
        setAiSummary(summary);
      } catch (err) {
        console.error("Failed to fetch AI summary", err);
        setAiSummary("Summary generation failed. Please try refreshing.");
      } finally {
        setIsSummarizing(false);
      }
    };
    fetchSummary();
  }, [report.id]);

  const positiveCount = report.findings.filter(f => f.status === "YES").length;
  const totalCount = report.findings.length;
  const complianceScore = report.score || Math.round((positiveCount / totalCount) * 100);

  const resolvedActionsCount = report.remedialActions.filter(a => a.status === "RESOLVED").length;
  const totalActionsCount = report.remedialActions.length;
  const unresolvedActions = report.remedialActions.filter(a => a.status === "PENDING");

  const getStatusColor = (rate: number) => {
    if (rate >= 90) return '#10b981';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const statusColor = getStatusColor(complianceScore);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "ASAP";
    return new Date(dateStr).toLocaleDateString(undefined, { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const handleUpdateActionStatus = (actionId: string, status: "PENDING" | "RESOLVED") => {
    const updatedActions = report.remedialActions.map(action =>
      action.id === actionId ? { ...action, status } : action
    );
    onUpdateReport({ ...report, remedialActions: updatedActions });
  };

  const handleStartEditAction = (action: RemedialAction) => {
    setEditingActionId(action.id);
    setEditDescription(action.description);
    setEditDueDate(action.dueDate);
  };

  const handleSaveActionEdit = (actionId: string) => {
    const updatedActions = report.remedialActions.map(action =>
      action.id === actionId
        ? { ...action, description: editDescription, dueDate: editDueDate }
        : action
    );
    onUpdateReport({ ...report, remedialActions: updatedActions });
    setEditingActionId(null);
  };

  const handleAcceptReport = () => {
    if (window.confirm("Accept this report? This marks it as formally reviewed and approved by the auditor.")) {
      onUpdateReport({ ...report, accepted: true, acceptedAt: new Date().toISOString() });
    }
  };

  const generateEmailBody = () => {
    const unresolvedActions = report.remedialActions.filter(a => a.status === "PENDING");
    const actionsText = unresolvedActions.length > 0 
      ? unresolvedActions.map((a, i) => `${i + 1}. ${a.description}${a.dueDate ? ` (Due: ${formatDate(a.dueDate)})` : ""}`).join("\n")
      : "All remedial actions have been resolved.";

    const isFollowUp = report.iteration && report.iteration > 1;
    const iterationText = isFollowUp 
      ? `\n\n⚠️ FOLLOW-UP ${report.iteration - 1}: This is the ${report.iteration === 2 ? '2nd' : report.iteration === 3 ? '3rd' : `${report.iteration}th`} review of outstanding remedial actions.\n${unresolvedActions.length} action(s) remain unresolved and require immediate attention.\n\nCC: zein@fairbairnconsult.co.za`
      : "";

    return `COMPLIANCE AUDIT REPORT: ${report.metadata.representativeName}${iterationText}
--------------------------------------------------
Audit Reference: FC-AUDIT-${report.id.split("-").pop()?.toUpperCase()}
${isFollowUp ? `Original Audit Date: ${formatDate(report.createdAt.split('T')[0])}\nFollow-Up Date: ${formatDate(report.metadata.reviewDate)}` : `Audit Date: ${formatDate(report.metadata.reviewDate)}`}
Client: ${report.metadata.clientName}
Policy No: ${report.metadata.policyNo}
Compliance Score: ${complianceScore}%

EXECUTIVE SUMMARY:
${(aiSummary || "Analysis pending.").replace(/\*\*/g, "").replace(/---/g, "---").trim()}

${isFollowUp ? 'OUTSTANDING ' : ''}REMEDIAL ACTION PLAN:
${actionsText}

${isFollowUp ? `\nDue Date for Resolution: ${formatDate(report.remedialActions[0]?.dueDate)}\n\nThis is a formal follow-up notice. Continued non-compliance may result in escalation to senior management and potential regulatory implications.` : ''}

Regards,
Fairbairn Consult Compliance Team${isFollowUp ? '\n\nCC: Zein - Compliance Oversight' : ''}`;
  };

  const generateHtmlEmailBody = () => {
    const unresolvedActions = report.remedialActions.filter(a => a.status === "PENDING");
    const isFollowUp = !!(report.iteration && report.iteration > 1);
    const refId = report.id.split("-").pop()?.toUpperCase();
    const scoreCol = complianceScore >= 90 ? "#065f46" : complianceScore >= 70 ? "#78350f" : "#7f1d1d";
    const scoreBg  = complianceScore >= 90 ? "#ecfdf5" : complianceScore >= 70 ? "#fffbeb" : "#fef2f2";
    const scoreBdr = complianceScore >= 90 ? "#10b981" : complianceScore >= 70 ? "#f59e0b" : "#e8424b";
    const FONT = "Calibri, Arial, 'Helvetica Neue', sans-serif";
    const cleanSummary = (aiSummary || "Summary not yet available.")
      .replace(/\*\*/g, "")
      .split("\n")
      .map(l => {
        const t = l.trim();
        if (!t) return "";
        if (t === "---") return `<hr style="border:none;border-top:1px solid #e8eff8;margin:10px 0;">`;
        if (t.endsWith(":") && t.length < 40) return `<p style="margin:8px 0 2px;font-weight:bold;color:#1a2e4a;font-size:11pt;">${t}</p>`;
        if (t.startsWith("- ")) return `<p style="margin:2px 0 2px 12px;color:#374151;font-size:11pt;">&bull;&nbsp;${t.slice(2)}</p>`;
        return `<p style="margin:3px 0;color:#374151;font-size:11pt;line-height:1.55;">${t}</p>`;
      })
      .join("");

    const metaRows = [
      ["Representative", report.metadata.representativeName],
      ["Client",         report.metadata.clientName],
      ["Policy Number",  report.metadata.policyNo || "—"],
      ["Insurer",        report.metadata.insurerName || "—"],
      ["Audited By",     report.metadata.managerName || "—"],
      ["Audit Date",     isFollowUp
        ? `Follow-up ${report.iteration! - 1} &bull; Original: ${formatDate(report.createdAt?.split("T")[0])}`
        : formatDate(report.metadata.reviewDate)],
      ["Audit Reference", `FC-AUDIT-${refId}`],
    ].map(([label, value]) => `
      <tr>
        <td style="padding:7px 12px 7px 0;font-family:${FONT};font-size:9pt;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e8eff8;width:38%;vertical-align:top;">${label}</td>
        <td style="padding:7px 0;font-family:${FONT};font-size:11pt;font-weight:600;color:#1a2e4a;border-bottom:1px solid #e8eff8;">${value}</td>
      </tr>`).join("");

    const actionRows = unresolvedActions.length === 0
      ? `<p style="font-family:${FONT};font-size:11pt;color:#065f46;margin:0;">All remedial actions have been resolved.</p>`
      : unresolvedActions.map((a, i) => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
          <tr>
            <td style="width:28px;vertical-align:top;padding-top:2px;">
              <span style="display:inline-block;width:22px;height:22px;background:#1a2e4a;border-radius:50%;text-align:center;line-height:22px;font-family:${FONT};font-size:9pt;font-weight:bold;color:#ffffff;">${i + 1}</span>
            </td>
            <td style="font-family:${FONT};font-size:11pt;color:#374151;line-height:1.5;padding-left:8px;">
              ${a.description}
              ${a.dueDate ? `<br><span style="font-size:9pt;color:#e8424b;font-weight:bold;">Due: ${formatDate(a.dueDate)}</span>` : ""}
            </td>
          </tr>
        </table>`).join("");

    const rainbowTable = `<table cellpadding="0" cellspacing="0" style="width:140px;height:3px;margin-top:10px;border-radius:99px;overflow:hidden;">
      <tr>
        <td style="background:#e8424b;height:3px;"></td>
        <td style="background:#f59e0b;height:3px;"></td>
        <td style="background:#10b981;height:3px;"></td>
        <td style="background:#3b82f6;height:3px;"></td>
        <td style="background:#8b5cf6;height:3px;"></td>
        <td style="background:#ec4899;height:3px;"></td>
      </tr>
    </table>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:640px;padding:32px 24px;font-family:${FONT};font-size:11pt;color:#111827;">

  <!-- FC branded header -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a2e4a;border-radius:10px;margin-bottom:28px;">
    <tr><td style="padding:22px 28px;">
      <span style="font-family:${FONT};font-size:20pt;font-weight:bold;color:#ffffff;letter-spacing:1px;">FAIRBAIRN</span><span style="font-family:${FONT};font-size:20pt;font-weight:300;color:#ffffff;"> CONSULT</span>
      <div style="font-family:${FONT};font-size:8pt;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:2px;margin-top:4px;">Old Mutual Wealth &middot; Mandated Brokerage</div>
      ${rainbowTable}
    </td></tr>
  </table>

  <!-- Report title -->
  <p style="font-family:${FONT};font-size:15pt;font-weight:bold;color:#1a2e4a;margin:0 0 4px 0;">Compliance Audit Report</p>
  <p style="font-family:${FONT};font-size:10pt;color:#9ca3af;margin:0 0 24px 0;">FC-AUDIT-${refId} &middot; ${formatDate(report.metadata.reviewDate)}${isFollowUp ? ` &middot; <strong style="color:#f59e0b;">Follow-Up ${report.iteration! - 1}</strong>` : ""}</p>

  ${isFollowUp ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-radius:8px;overflow:hidden;background:#fffbeb;border-left:4px solid #f59e0b;">
    <tr><td style="padding:12px 16px;font-family:${FONT};font-size:11pt;color:#78350f;">
      <strong>Follow-Up Notice ${report.iteration! - 1}:</strong> This is the ${report.iteration === 2 ? "second" : "third"} review of outstanding remedial actions. ${unresolvedActions.length} action(s) remain unresolved and require immediate attention.
    </td></tr>
  </table>` : ""}

  <!-- Case details -->
  <p style="font-family:${FONT};font-size:9pt;font-weight:bold;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Case Details</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${metaRows}</table>

  <!-- Score -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:${scoreBg};border-radius:8px;border-left:4px solid ${scoreBdr};">
    <tr><td style="padding:14px 20px;">
      <span style="font-family:${FONT};font-size:9pt;font-weight:bold;color:${scoreCol};text-transform:uppercase;letter-spacing:1px;">Compliance Score</span>
      <span style="font-family:${FONT};font-size:26pt;font-weight:bold;color:${scoreBdr};margin-left:14px;">${complianceScore}%</span>
    </td></tr>
  </table>

  <!-- Summary -->
  <p style="font-family:${FONT};font-size:9pt;font-weight:bold;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Executive Summary</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:#e8eff8;border-radius:0 8px 8px 0;border-left:4px solid #1a2e4a;">
    <tr><td style="padding:16px 20px;">${cleanSummary}</td></tr>
  </table>

  <!-- Remedial actions -->
  <p style="font-family:${FONT};font-size:9pt;font-weight:bold;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">${isFollowUp ? "Outstanding " : ""}Remedial Action Plan</p>
  <div style="margin-bottom:32px;">${actionRows}</div>

  ${isFollowUp ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-radius:8px;overflow:hidden;background:#fef2f2;border-left:4px solid #e8424b;"><tr><td style="padding:12px 16px;font-family:${FONT};font-size:11pt;color:#7f1d1d;">This is a formal follow-up notice. Continued non-compliance may result in escalation to senior management and potential regulatory implications.</td></tr></table>` : ""}

  <!-- Sign-off -->
  <p style="font-family:${FONT};font-size:11pt;color:#374151;margin:0 0 4px 0;">Regards,</p>
  <p style="font-family:${FONT};font-size:11pt;font-weight:bold;color:#1a2e4a;margin:0 0 28px 0;">Fairbairn Consult Compliance Team${isFollowUp ? "<br><span style='font-size:10pt;color:#6b7280;font-weight:normal;'>CC: Zein &mdash; Compliance Oversight</span>" : ""}</p>

  <!-- FC signature block (matching Guy's style) -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
    <tr>
      <td style="vertical-align:middle;padding-right:20px;border-right:1px solid #e5e7eb;width:160px;">
        <span style="font-family:${FONT};font-size:14pt;font-weight:bold;color:#1a2e4a;">FAIRBAIRN</span><span style="font-family:${FONT};font-size:14pt;font-weight:300;color:#1a2e4a;"> CONSULT</span>
        <div style="font-family:${FONT};font-size:7pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px;">Wealth creation and protection</div>
        <table cellpadding="0" cellspacing="0" style="margin-top:6px;width:120px;height:3px;">
          <tr>
            <td style="background:#e8424b;height:3px;"></td><td style="background:#f59e0b;height:3px;"></td>
            <td style="background:#10b981;height:3px;"></td><td style="background:#3b82f6;height:3px;"></td>
            <td style="background:#8b5cf6;height:3px;"></td><td style="background:#ec4899;height:3px;"></td>
          </tr>
        </table>
      </td>
      <td style="vertical-align:middle;padding-left:20px;">
        <p style="font-family:${FONT};font-size:9pt;color:#6b7280;margin:0;">A member of the Old Mutual Group</p>
        <p style="font-family:${FONT};font-size:8pt;color:#9ca3af;margin:3px 0 0 0;">Licensed Financial Services Provider</p>
      </td>
    </tr>
  </table>

</div></body></html>`;
  };

  const handleCopyEmail = async () => {
    const html = generateHtmlEmailBody();
    const plain = generateEmailBody();
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html":  new Blob([html],  { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleOpenEmailClient = () => {
    const isFollowUp = report.iteration && report.iteration > 1;
    const subject = encodeURIComponent(
      `${isFollowUp ? `FOLLOW-UP ${report.iteration - 1}: ` : ""}Compliance Audit Report - ${report.metadata.representativeName}`
    );
    const body = encodeURIComponent(generateEmailBody());
    const cc = isFollowUp ? "&cc=zein@fairbairnconsult.co.za" : "";
    window.location.href = `mailto:?subject=${subject}&body=${body}${cc}`;
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('report-capture-area');
    if (!element) return;
    setIsDownloading(true);
    
    try {
      // @ts-ignore - html2pdf is loaded via CDN
      const html2pdf = window.html2pdf;
      if (!html2pdf) {
        alert('PDF library not loaded. Using print instead.');
        window.print();
        return;
      }

      const opt = {
        margin: [15, 15],
        filename: `Compliance_Report_${report.metadata.representativeName.replace(/\s+/g, '_')}_FC-AUDIT-${report.id.split('-').pop()?.toUpperCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation error:", err);
      alert('PDF generation failed. Using print dialog instead.');
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 px-1 sm:px-0">
      {/* UI Controls - Hidden from PDF */}
      <div className="flex flex-col gap-6 border-b border-gray-200 pb-8 print:hidden">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div
              className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase"
              style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
            >
              SCORE: {complianceScore}%
            </div>
            {report.iteration && report.iteration > 1 && (
              <div className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-100 text-amber-700 border border-amber-200">
                ITERATION {report.iteration}
              </div>
            )}
            <div className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-500 border border-slate-200">
              CONFIDENTIAL — Internal Use Only
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Compliance Report
          </h2>
        </div>
        
        <div className="flex flex-wrap gap-2 md:gap-3">
          {report.accepted ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 text-sm font-black">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ACCEPTED {report.acceptedAt ? `· ${formatDate(report.acceptedAt.split('T')[0])}` : ''}
            </div>
          ) : (
            <button
              onClick={handleAcceptReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Accept Report
            </button>
          )}
          {unresolvedActions.length > 0 && (
            <button
              onClick={onFollowUp}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all bg-amber-500 text-white shadow-lg hover:bg-amber-600 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Initiate Follow-Up Review
            </button>
          )}
          <button 
            onClick={handleDownloadPdf} 
            disabled={isDownloading}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all text-white shadow-lg text-sm ${isDownloading ? 'bg-slate-400' : 'bg-[#005f6b] hover:bg-[#004b54]'}`}
          >
            {isDownloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </>
            )}
          </button>
          <button 
            onClick={() => setShowEmailModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all bg-white border-2 border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email Report
          </button>
          <button 
            onClick={onBack} 
            className="w-full sm:w-auto px-8 py-2.5 rounded-xl font-black border-2 border-slate-200 hover:bg-slate-50 transition-all text-sm text-slate-600"
          >
            Back to History
          </button>
        </div>
      </div>

      {/* Capture Area for PDF Generation */}
      <div id="report-capture-area" className="space-y-8 bg-white rounded-2xl overflow-hidden p-2">

        {/* FC-branded report header */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a2e4a" }}>
          <div className="px-8 py-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "6px" }}>
                Old Mutual Wealth · Mandated Brokerage
              </p>
              <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, letterSpacing: "0.01em" }}>
                FAIRBAIRN <span style={{ fontWeight: 300 }}>CONSULT</span>
              </h1>
              <div style={{ display: "flex", height: "4px", width: "160px", borderRadius: "99px", overflow: "hidden", marginTop: "10px" }}>
                {(["#e8424b","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"] as const).map((c, i) =>
                  <span key={i} style={{ flex: 1, background: c }} />
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                Compliance Audit Report
              </p>
              <p style={{ color: "#fff", fontSize: "18px", fontWeight: 600 }}>{report.metadata.representativeName}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginTop: "4px" }}>
                {report.metadata.clientName} · {formatDate(report.metadata.reviewDate)}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", padding: "12px 32px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              { label: "Compliance Score", value: `${complianceScore}%`, color: statusColor },
              { label: "Remedial Actions", value: String(report.remedialActions.length), color: "#fff" },
              { label: "Policy Number", value: report.metadata.policyNo || "—", color: "#fff" },
              { label: "Audited By", value: report.metadata.managerName || "—", color: "rgba(255,255,255,0.7)" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.35)" }}>{label}</div>
                <div style={{ fontSize: "15px", fontWeight: 600, color, marginTop: "2px" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", height: "5px" }}>
            {(["#e8424b","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"] as const).map((c, i) =>
              <span key={i} style={{ flex: 1, background: c }} />
            )}
          </div>
        </div>

        {/* CONFIDENTIAL banner — always visible in PDF */}
        <div style={{
          background: "#f8f4e8",
          border: "1px solid #e5d9b6",
          borderRadius: "10px",
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}>
          <svg width="14" height="14" fill="none" stroke="#92742a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#92742a",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            CONFIDENTIAL — Internal Use Only — Not for Distribution
          </span>
          <svg width="14" height="14" fill="none" stroke="#92742a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>

        {/* AI Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div className="flex items-center gap-2 mb-5" style={{ borderBottom: "1px solid #e8eff8", paddingBottom: "12px" }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="#1a2e4a" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a2e4a" }}>
              AI Compliance Summary
            </h3>
          </div>
          {isSummarizing ? (
            <div className="flex items-center gap-3 text-slate-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Generating analysis…</span>
            </div>
          ) : (
            <div className="text-sm leading-relaxed" style={{ color: "#4b5563" }}>
              {(aiSummary || "Summary unavailable.")
                .replace(/\*\*/g, "")
                .split("\n")
                .map((line, i) => {
                  const t = line.trim();
                  if (t === "---") return <hr key={i} style={{ border: "none", borderTop: "1px solid #e8eff8", margin: "12px 0" }} />;
                  if (t.endsWith(":") && t.length < 40) return <p key={i} style={{ fontWeight: 600, color: "#1a2e4a", marginTop: "10px" }}>{t}</p>;
                  if (t.startsWith("- ")) return <p key={i} style={{ paddingLeft: "1em", textIndent: "-0.75em" }}>• {t.slice(2)}</p>;
                  if (!t) return <div key={i} style={{ height: "4px" }} />;
                  return <p key={i}>{t}</p>;
                })}
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Review Context */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <h3 className="text-sm font-semibold mb-6 flex items-center gap-2" style={{ color: "#1a2e4a", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              <svg className="w-4 h-4" fill="none" stroke="#1a2e4a" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Case Details
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Representative', value: report.metadata.representativeName },
                { label: 'Client', value: report.metadata.clientName },
                { label: 'Policy Number', value: report.metadata.policyNo },
                { label: 'Insurer', value: report.metadata.insurerName },
                { label: 'Audited By', value: report.metadata.managerName },
                { label: 'Audit Date', value: formatDate(report.metadata.reviewDate) }
              ].map((meta, i) => (
                <div key={i} className="flex flex-col pl-4 py-1" style={{ borderLeft: "2px solid #e8eff8" }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>
                    {meta.label}
                  </span>
                  <span style={{ fontWeight: 600, color: "#1a2e4a" }}>
                    {meta.value || 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Findings & Remediation */}
          <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 print:shadow-none print:border-slate-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                Findings & Remediation
              </h3>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                {report.remedialActions.length} Actions Required
              </div>
            </div>
            
            <div className="space-y-5">
              {report.remedialActions.length === 0 ? (
                <div className="text-center py-10 bg-emerald-50 rounded-3xl border border-dashed border-emerald-200">
                  <svg className="w-12 h-12 mx-auto mb-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p className="text-emerald-700 font-bold">Perfect Score: No gaps identified during this review.</p>
                </div>
              ) : (
                report.remedialActions.map((action, index) => (
                  <div
                    key={action.id}
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    className={`p-5 rounded-[2rem] border transition-all ${
                      action.status === 'RESOLVED'
                        ? 'bg-emerald-50/20 opacity-60 border-emerald-100'
                        : 'bg-rose-50/10 border-rose-100 shadow-sm'
                    } print:rounded-xl`}
                  >
                    <div className="flex gap-4 items-start">
                      <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                        action.status === 'RESOLVED'
                          ? 'bg-emerald-500'
                          : 'bg-rose-500 animate-pulse'
                      }`}></div>
                      <div className="flex-1">

                        {editingActionId === action.id ? (
                          /* ── Inline edit mode ── */
                          <div className="space-y-3 print:hidden">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Corrective Step
                              </label>
                              <textarea
                                value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                rows={3}
                                className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Deadline
                              </label>
                              <input
                                type="date"
                                value={editDueDate}
                                onChange={e => setEditDueDate(e.target.value)}
                                className="text-sm font-medium text-slate-800 border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveActionEdit(action.id)}
                                className="text-[10px] font-bold px-3 py-1 rounded-full bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors uppercase tracking-wider"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingActionId(null)}
                                className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors uppercase tracking-wider"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read mode ── */
                          <>
                            <p className="text-sm font-bold text-slate-800 leading-relaxed">
                              {action.description}
                            </p>
                            {action.dueDate && action.status !== 'RESOLVED' && (
                              <div className="flex items-center gap-2 mt-2">
                                <svg className="w-3 h-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                                  Due: {formatDate(action.dueDate)}
                                </p>
                              </div>
                            )}
                            {action.status === 'RESOLVED' && (
                              <div className="flex items-center gap-2 mt-2">
                                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                                </svg>
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                                  Resolved
                                </p>
                              </div>
                            )}

                            {/* Action buttons – hidden from PDF */}
                            <div className="flex gap-2 mt-3 print:hidden">
                              {action.status === 'PENDING' && (
                                <button
                                  onClick={() => handleUpdateActionStatus(action.id, 'RESOLVED')}
                                  className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors uppercase tracking-wider"
                                >
                                  Mark Resolved
                                </button>
                              )}
                              {action.status === 'RESOLVED' && (
                                <button
                                  onClick={() => handleUpdateActionStatus(action.id, 'PENDING')}
                                  className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors uppercase tracking-wider"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                onClick={() => handleStartEditAction(action)}
                                className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors uppercase tracking-wider flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                Edit
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* FC-branded PDF footer */}
        <div className="mt-4 pt-5 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: "1px solid #e8eff8" }}>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "#1a2e4a" }}>
              FAIRBAIRN <span style={{ fontWeight: 300 }}>CONSULT</span>
              <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: "8px" }}>· Old Mutual Wealth · Mandated Brokerage</span>
            </p>
            <p style={{ fontSize: "10px", color: "#9ca3af", marginTop: "3px" }}>
              CONFIDENTIAL — Internal Use Only · FC-AUDIT-{report.id.split('-').pop()?.toUpperCase()}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0", height: "3px", width: "60px", borderRadius: "99px", overflow: "hidden" }}>
            {(["#e8424b","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"] as const).map((c, i) =>
              <span key={i} style={{ flex: 1, background: c }} />
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Email Report</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Share compliance findings
                </p>
              </div>
              <button 
                onClick={() => setShowEmailModal(false)} 
                className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed select-all">
                {generateEmailBody()}
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4">
              <button 
                onClick={handleCopyEmail}
                className={`flex-1 min-w-[150px] py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 shadow-lg ${
                  copyFeedback 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-[#005f6b] text-white hover:bg-[#004b54]'
                }`}
              >
                {copyFeedback ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy to Clipboard
                  </>
                )}
              </button>
              <button 
                onClick={handleOpenEmailClient}
                className="flex-1 min-w-[150px] py-4 rounded-2xl font-black bg-white border-2 border-[#005f6b] text-[#005f6b] hover:bg-teal-50 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Open in Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportView;

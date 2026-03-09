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
    const updatedReport = { ...report, remedialActions: updatedActions };
    onUpdateReport(updatedReport);
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
${aiSummary || "Analysis pending..."}

${isFollowUp ? 'OUTSTANDING ' : ''}REMEDIAL ACTION PLAN:
${actionsText}

${isFollowUp ? `\nDue Date for Resolution: ${formatDate(report.remedialActions[0]?.dueDate)}\n\nThis is a formal follow-up notice. Continued non-compliance may result in escalation to senior management and potential regulatory implications.` : ''}

Regards,
Fairbairn Consult Compliance Team${isFollowUp ? '\n\nCC: Zein - Compliance Oversight' : ''}`;
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(generateEmailBody());
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
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Compliance Report
          </h2>
        </div>
        
        <div className="flex flex-wrap gap-2 md:gap-3">
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
      <div id="report-capture-area" className="space-y-10 bg-white md:bg-transparent rounded-3xl overflow-hidden p-2">
        <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black text-slate-900">FAIRBAIRN COMPLIANCE AUDIT</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                Audit Reference: FC-AUDIT-{report.id.split('-').pop()?.toUpperCase()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-400 uppercase">Generated On</p>
              <p className="text-sm font-bold">{new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {/* AI Summary Section */}
        <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden print:rounded-3xl print:p-8 print:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">
              Auditor's AI Summary
            </h3>
          </div>
          
          {isSummarizing ? (
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-teal-200">Generating AI analysis...</span>
            </div>
          ) : (
            <p className="text-base md:text-lg font-medium leading-relaxed whitespace-pre-wrap">
              {aiSummary || "AI summary unavailable"}
            </p>
          )}
          
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Review Context */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 print:shadow-none print:border-slate-200">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Review Context
            </h3>
            <div className="space-y-5">
              {[
                { label: 'Representative', value: report.metadata.representativeName },
                { label: 'Client', value: report.metadata.clientName },
                { label: 'Policy Number', value: report.metadata.policyNo },
                { label: 'Insurer', value: report.metadata.insurerName },
                { label: 'Audited By', value: report.metadata.managerName },
                { label: 'Audit Date', value: formatDate(report.metadata.reviewDate) }
              ].map((meta, i) => (
                <div key={i} className="flex flex-col border-l-2 border-slate-100 pl-4 py-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1.5">
                    {meta.label}
                  </span>
                  <span className="font-extrabold text-slate-700 leading-tight">
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
                        
                        {/* Action buttons - only show in UI, not in PDF */}
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
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer for PDF */}
        <div className="hidden print:block mt-12 pt-8 border-t border-slate-200 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            Confidential - Fairbairn Consult Internal Audit Record
          </p>
          <div className="flex justify-center gap-6 mt-2">
            <span className="text-[9px] text-slate-300 font-bold italic">
              Powered by Azure AI
            </span>
            <span className="text-[9px] text-slate-300 font-bold italic">
              Report ID: {report.id.split('-').pop()?.toUpperCase()}
            </span>
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

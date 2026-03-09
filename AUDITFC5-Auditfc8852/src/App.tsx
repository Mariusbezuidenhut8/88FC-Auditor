import React, { useEffect, useState } from "react";
import ChecklistForm from "./components/ChecklistForm";
import ReportView from "./components/ReportView";
import AuditHistory from "./components/AuditHistory";
import AccessCodeGate from "./components/AccessCodeGate";
import AdminPortal from "./components/AdminPortal";
import {
  ComplianceReport,
  Finding,
  ReviewMetadata,
  RemedialAction,
  AccessCode,
  UserRole,
} from "./types";
import { generateRemedialActions } from "./azureOpenAIService";
import { CHECKLIST_ITEMS } from "./constants";
import CARAnalyzer from "./components/CARAnalyzer";

type View = "history" | "form" | "report" | "admin" | "car";

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>("NONE");
  const [view, setView] = useState<View>("history");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);

  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [activeCodeId, setActiveCodeId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<{
    metadata: ReviewMetadata;
    findings: Finding[];
  } | null>(null);

  const [editingData, setEditingData] = useState<{
    metadata: ReviewMetadata;
    findings: Finding[];
    iteration: number;
    parentReportId?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/.netlify/functions/ping-azure");
        setHasApiKey(r.ok);
      } catch {
        setHasApiKey(false);
      }
    })();

    try {
      const savedReports = localStorage.getItem("audit_reports");
      if (savedReports) setReports(JSON.parse(savedReports));
    } catch (e) {
      console.error("Error loading reports", e);
      localStorage.removeItem("audit_reports");
    }

    try {
      const savedCodes = localStorage.getItem("access_codes");
      if (savedCodes) {
        setAccessCodes(JSON.parse(savedCodes));
      } else {
        const initialCode: AccessCode = {
          id: "seed-1",
          code: "FC-WELCOME-2025",
          expiryDate: "2030-12-31",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          label: "Initial Access Code",
          usageCount: 0,
        };
        setAccessCodes([initialCode]);
        localStorage.setItem("access_codes", JSON.stringify([initialCode]));
      }
    } catch (e) {
      console.error("Error loading codes", e);
      localStorage.removeItem("access_codes");
    }

    const isAdmin = sessionStorage.getItem("is_admin") === "true";
    const savedActiveCodeId = localStorage.getItem("active_code_id");

    if (isAdmin) {
      setRole("ADMIN");
      setView("admin");
    } else if (savedActiveCodeId) {
      setRole("USER");
      setActiveCodeId(savedActiveCodeId);
      setView("history");
    }
  }, []);

  const handleAccessGranted = (codeId: string, roleType: UserRole) => {
    setRole(roleType);

    if (roleType === "ADMIN") {
      sessionStorage.setItem("is_admin", "true");
      setView("admin");
      return;
    }

    setActiveCodeId(codeId);
    localStorage.setItem("active_code_id", codeId);

    const updatedCodes = accessCodes.map((c) =>
      c.id === codeId ? { ...c, usageCount: (c.usageCount || 0) + 1 } : c
    );
    setAccessCodes(updatedCodes);
    localStorage.setItem("access_codes", JSON.stringify(updatedCodes));

    setView("history");
  };

  const handleLogout = () => {
    setRole("NONE");
    setView("history");
    sessionStorage.removeItem("is_admin");
    localStorage.removeItem("active_code_id");
    setActiveCodeId(null);
  };

  const handleStartNewReview = () => {
    setEditingData(null);
    setCurrentReportId(null);
    setView("form");
  };

  const handleEditReport = (report: ComplianceReport) => {
    setEditingData({
      metadata: report.metadata,
      findings: report.findings,
      iteration: report.iteration,
      parentReportId: report.parentReportId || report.id,
    });
    setCurrentReportId(report.id);
    setView("form");
  };

  const handleFollowUp = (report: ComplianceReport) => {
    const unresolvedActions = report.remedialActions.filter(a => a.status === "PENDING");
    
    if (unresolvedActions.length === 0) {
      alert("All remedial actions have been resolved. No follow-up needed.");
      return;
    }

    const followUpFindings: Finding[] = report.findings.map(f => {
      const hasUnresolvedAction = unresolvedActions.some(action => 
        action.description.toLowerCase().includes(f.itemId.replace(/_/g, " "))
      );
      
      return {
        itemId: f.itemId,
        status: hasUnresolvedAction ? "NO" : f.status,
        comment: hasUnresolvedAction 
          ? `Follow-up ${report.iteration || 1}: Still outstanding from previous review` 
          : f.comment
      };
    });

    setEditingData({
      metadata: {
        ...report.metadata,
        reviewDate: new Date().toISOString().split("T")[0],
      },
      findings: followUpFindings,
      iteration: (report.iteration || 1) + 1,
      parentReportId: report.parentReportId || report.id,
    });
    
    setCurrentReportId(report.id);
    setView("form");
  };

  const handleViewReport = (report: ComplianceReport) => {
    setCurrentReportId(report.id);
    setView("report");
  };

  const handleUpdateReport = (updatedReport: ComplianceReport) => {
    const updatedReports = reports.map((r) =>
      r.id === updatedReport.id ? updatedReport : r
    );
    setReports(updatedReports);
    localStorage.setItem("audit_reports", JSON.stringify(updatedReports));
    alert("Report updated successfully!");
  };

  const handleDeleteReport = (id: string) => {
    if (window.confirm("Are you sure you want to delete this report?")) {
      const updated = reports.filter((r) => r.id !== id);
      setReports(updated);
      localStorage.setItem("audit_reports", JSON.stringify(updated));
      if (currentReportId === id) setView("history");
    }
  };

  const handlePreview = (data: {
    metadata: ReviewMetadata;
    findings: Finding[];
  }) => {
    setPreviewData(data);
  };

  const handleConfirmSubmit = () => {
    if (previewData) {
      handleFormSubmit(previewData);
      setPreviewData(null);
    }
  };

  const handleEditPreview = () => {
    setPreviewData(null);
  };

  const handleFormSubmit = async (data: {
    metadata: ReviewMetadata;
    findings: Finding[];
  }) => {
    setIsSubmitting(true);
    try {
      const actions = await generateRemedialActions(data.metadata, data.findings);

      const remedialActions: RemedialAction[] = actions.map((action) => ({
        id: crypto.randomUUID(),
        description: action,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        status: "PENDING",
      }));

      const score = Math.round(
        (data.findings.filter((f) => f.status === "YES").length /
          data.findings.length) *
          100
      );

      const newReport: ComplianceReport = {
        id: editingData?.parentReportId || crypto.randomUUID(),
        metadata: data.metadata,
        findings: data.findings,
        remedialActions,
        score,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        iteration: editingData ? editingData.iteration + 1 : 1,
        parentReportId: editingData?.parentReportId,
        createdByCodeId: activeCodeId || "unknown",
      };

      const updatedReports = [newReport].concat(reports);
      setReports(updatedReports);
      localStorage.setItem("audit_reports", JSON.stringify(updatedReports));

      setCurrentReportId(newReport.id);
      setView("report");
    } catch (error) {
      console.error("Submission failed", error);
      
      let errorMessage = "Failed to generate report. ";
      
      if (error instanceof Error) {
        if (error.message.includes("filter")) {
          errorMessage += "Invalid form data. Please refresh and try again.";
        } else if (error.message.includes("HTTP")) {
          errorMessage += "Server error. Please check your connection.";
        } else if (error.message.includes("Non-JSON")) {
          errorMessage += "Invalid response from server.";
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += "Please try again.";
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateCode = (label: string, isPermanent: boolean = false) => {
    const newCode: AccessCode = {
      id: crypto.randomUUID(),
      code: `FC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      expiryDate: isPermanent ? "PERMANENT" : "2030-12-31",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      label,
      usageCount: 0,
    };

    const updated = [...accessCodes, newCode];
    setAccessCodes(updated);
    localStorage.setItem("access_codes", JSON.stringify(updated));
  };

  const handleRevokeCode = (id: string) => {
    const updated = accessCodes.map((c) =>
      c.id === id ? { ...c, status: "REVOKED" as const } : c
    );
    setAccessCodes(updated);
    localStorage.setItem("access_codes", JSON.stringify(updated));
  };

  if (role === "NONE") {
    return (
      <AccessCodeGate
        accessCodes={accessCodes}
        onAccessGranted={handleAccessGranted}
      />
    );
  }

  const currentReport = currentReportId
    ? reports.find((r) => r.id === currentReportId) || null
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#005f6b] rounded-lg flex items-center justify-center font-bold text-sm">
              FC
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Audit Tool</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                Fairbairn Consult
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {role === "ADMIN" && (
              <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded">
                ADMIN MODE
              </span>
            )}

            {role !== "NONE" && (
              <button
                onClick={() => setView("car")}
                className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-all ${
                  view === "car"
                    ? "bg-[#005f6b] text-white"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                CAR Evaluator
              </button>
            )}

            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  hasApiKey === true
                    ? "bg-emerald-400"
                    : hasApiKey === false
                    ? "bg-red-500"
                    : "bg-slate-400"
                }`}
              />
              <span className="text-xs font-medium text-slate-300">
                {hasApiKey === true
                  ? "AZURE AI ACTIVE"
                  : hasApiKey === false
                  ? "AI OFFLINE"
                  : "CHECKING AI..."}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-300 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === "history" && (
          <AuditHistory
            reports={reports}
            onView={(report) => handleViewReport(report)}
            onDelete={(id) => handleDeleteReport(id)}
            onNewReview={handleStartNewReview}
            onEdit={(report) => handleEditReport(report)}
            isAdminView={role === "ADMIN"}
            accessCodes={accessCodes}
          />
        )}

        {view === "form" && !previewData && (
          <ChecklistForm
            onSubmit={(data) => {
              // Do nothing on direct submit, only preview
            }}
            onPreview={handlePreview}
            isSubmitting={isSubmitting}
            initialMetadata={editingData?.metadata || null}
            initialFindings={editingData?.findings || null}
            iteration={editingData?.iteration || 0}
            hasApiKey={hasApiKey === true}
            onSelectKey={() => setView("history")}
          />
        )}

        {previewData && (
          <div className="space-y-6">
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <h2 className="text-2xl font-bold text-amber-900">Preview Mode</h2>
              </div>
              <p className="text-amber-800 mb-4">
                Review the information below before final submission. You can go back to make changes or confirm to generate the report.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleEditPreview}
                  className="px-6 py-3 bg-white border-2 border-amber-600 text-amber-700 font-bold rounded-xl hover:bg-amber-50 transition-colors"
                >
                  ← Go Back & Edit
                </button>
                <button
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors disabled:bg-slate-400"
                >
                  {isSubmitting ? "Generating Report..." : "✓ Confirm & Generate Report"}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Review Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Representative</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.representativeName}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Client</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.clientName}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Policy Number</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.policyNo || "N/A"}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Insurer</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.insurerName || "N/A"}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Manager / Auditor</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.managerName}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Review Date</label>
                  <p className="text-lg font-semibold text-slate-900">{previewData.metadata.reviewDate}</p>
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mt-8 mb-4">Findings Summary</h3>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-700">
                    {previewData.findings.filter(f => f.status === "YES").length}
                  </p>
                  <p className="text-sm font-medium text-emerald-600">Passed</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-700">
                    {previewData.findings.filter(f => f.status === "NO").length}
                  </p>
                  <p className="text-sm font-medium text-red-600">Failed</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-slate-700">
                    {Math.round((previewData.findings.filter(f => f.status === "YES").length / previewData.findings.length) * 100)}%
                  </p>
                  <p className="text-sm font-medium text-slate-600">Score</p>
                </div>
              </div>

              {previewData.findings.filter(f => f.status === "NO").length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-red-700 mb-3">Issues Identified:</h4>
                  <div className="space-y-2">
                    {previewData.findings
                      .filter(f => f.status === "NO")
                      .map((finding, idx) => {
                        const item = CHECKLIST_ITEMS.find(i => i.id === finding.itemId);
                        return (
                          <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold text-red-900">{item?.text || finding.itemId}</p>
                            {finding.comment && (
                              <p className="text-sm text-red-700 mt-1">Note: {finding.comment}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "report" && currentReport && (
          <ReportView
            report={currentReport}
            onBack={() => setView("history")}
            onUpdateReport={handleUpdateReport}
            onFollowUp={() => handleFollowUp(currentReport)}
          />
        )}

        {view === "admin" && role === "ADMIN" && (
          <AdminPortal
            accessCodes={accessCodes}
            reports={reports}
            onGenerateCode={handleGenerateCode}
            onRevokeCode={handleRevokeCode}
            onBack={() => setView("history")}
          />
        )}

        {view === "car" && (
          <CARAnalyzer
            onBack={() => setView("history")}
            activeCodeId={activeCodeId || "unknown"}
          />
        )}
      </main>
    </div>
  );
};

export default App;

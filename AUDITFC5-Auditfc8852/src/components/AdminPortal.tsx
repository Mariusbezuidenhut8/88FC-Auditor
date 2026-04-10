import React, { useState, useRef } from "react";
import { AccessCode, ComplianceReport } from "../types";

interface AdminPortalProps {
  accessCodes: AccessCode[];
  reports: ComplianceReport[];
  onGenerateCode: (label: string, isPermanent?: boolean) => void;
  onRevokeCode: (id: string) => void;
  onBack: () => void;
  onImportData: (reports: ComplianceReport[], codes: AccessCode[]) => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({
  accessCodes,
  reports,
  onGenerateCode,
  onRevokeCode,
  onBack,
  onImportData,
}) => {
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [isPermanent, setIsPermanent] = useState(false);
  const [activeTab, setActiveTab] = useState<"codes" | "reports" | "data">("codes");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      reports,
      accessCodes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fairbairn-audit-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (!Array.isArray(parsed.reports) || !Array.isArray(parsed.accessCodes)) {
          alert("Invalid backup file format.");
          return;
        }
        if (!window.confirm(`This will replace all current data with:\n• ${parsed.reports.length} reports\n• ${parsed.accessCodes.length} access codes\n\nContinue?`)) return;
        onImportData(parsed.reports, parsed.accessCodes);
      } catch {
        alert("Could not read file. Make sure it is a valid Fairbairn backup (.json).");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleGenerateCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCodeLabel.trim()) {
      alert("Please enter a label for the access code");
      return;
    }
    onGenerateCode(newCodeLabel, isPermanent);
    setNewCodeLabel("");
    setIsPermanent(false);
  };

  const activeCodes = accessCodes.filter((c) => c.status === "ACTIVE");
  const revokedCodes = accessCodes.filter((c) => c.status === "REVOKED");

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage access codes and view all audit reports
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg border-2 border-slate-200 hover:bg-slate-50 transition-colors font-medium text-slate-700"
        >
          Back to History
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("codes")}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === "codes"
                ? "border-[#005f6b] text-[#005f6b]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Access Codes ({accessCodes.length})
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === "reports"
                ? "border-[#005f6b] text-[#005f6b]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            All Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab("data")}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === "data"
                ? "border-[#005f6b] text-[#005f6b]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Backup & Restore
          </button>
        </div>
      </div>

      {/* Access Codes Tab */}
      {activeTab === "codes" && (
        <div className="space-y-6">
          {/* Generate New Code */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              Generate New Access Code
            </h2>
            <form onSubmit={handleGenerateCode} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newCodeLabel}
                  onChange={(e) => setNewCodeLabel(e.target.value)}
                  placeholder="Label (e.g., Representative Name, Branch)"
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#005f6b] focus:border-transparent outline-none"
                />
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#005f6b] text-white font-medium rounded-lg hover:bg-[#004b54] transition-colors"
                >
                  Generate Code
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPermanent}
                  onChange={(e) => setIsPermanent(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#005f6b] focus:ring-[#005f6b]"
                />
                <span>
                  Permanent code (no expiry) - <span className="font-semibold">Use for personal admin codes</span>
                </span>
              </label>
            </form>
          </div>

          {/* Active Codes */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              Active Codes ({activeCodes.length})
            </h2>
            {activeCodes.length === 0 ? (
              <p className="text-slate-500 italic text-center py-8">
                No active access codes
              </p>
            ) : (
              <div className="space-y-3">
                {activeCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-200"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <code className="text-lg font-bold text-emerald-700 bg-white px-3 py-1 rounded-lg">
                          {code.code}
                        </code>
                        <span className="text-sm font-medium text-slate-700">
                          {code.label}
                        </span>
                        {code.expiryDate === "PERMANENT" && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">
                            PERMANENT
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>Created: {formatDate(code.createdAt)}</span>
                        <span>
                          Expires: {code.expiryDate === "PERMANENT" ? "Never" : formatDate(code.expiryDate)}
                        </span>
                        <span>Used: {code.usageCount || 0} times</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke access code "${code.code}"? This cannot be undone.`
                          )
                        ) {
                          onRevokeCode(code.id);
                        }
                      }}
                      className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 transition-colors text-sm"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revoked Codes */}
          {revokedCodes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                Revoked Codes ({revokedCodes.length})
              </h2>
              <div className="space-y-3">
                {revokedCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 opacity-60"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <code className="text-lg font-bold text-slate-500 bg-white px-3 py-1 rounded-lg line-through">
                          {code.code}
                        </code>
                        <span className="text-sm font-medium text-slate-500">
                          {code.label}
                        </span>
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                          REVOKED
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span>Created: {formatDate(code.createdAt)}</span>
                        <span>Used: {code.usageCount || 0} times</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backup & Restore Tab */}
      {activeTab === "data" && (
        <div className="space-y-6">
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

          {/* Export */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Export Backup</h2>
            <p className="text-sm text-slate-500 mb-4">
              Download all reports and access codes as a <strong>.json</strong> file. Save this file somewhere safe — you can use it to restore your data on any device or after a redeployment.
            </p>
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
              <div className="flex-1 text-sm text-slate-600 space-y-1">
                <p><span className="font-bold text-slate-800">{reports.length}</span> audit reports</p>
                <p><span className="font-bold text-slate-800">{accessCodes.length}</span> access codes</p>
              </div>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#005f6b] text-white font-bold rounded-xl hover:bg-[#004b54] transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Download Backup
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Tip: export a backup before every Netlify redeployment to avoid losing data.
            </p>
          </div>

          {/* Import */}
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Restore from Backup</h2>
            <p className="text-sm text-slate-500 mb-4">
              Upload a previously exported <strong>.json</strong> backup file to restore all reports and access codes. <span className="text-amber-600 font-semibold">This will replace all current data.</span>
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              Upload Backup File
            </button>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === "reports" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            All Audit Reports
          </h2>
          {reports.length === 0 ? (
            <p className="text-slate-500 italic text-center py-8">
              No reports created yet
            </p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const codeLabel = accessCodes.find(
                  (c) => c.id === report.createdByCodeId
                )?.label || "Unknown";
                
                return (
                  <div
                    key={report.id}
                    className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-slate-900">
                            {report.metadata.representativeName}
                          </h3>
                          <span className="text-sm text-slate-500">→</span>
                          <span className="text-sm text-slate-600">
                            {report.metadata.clientName}
                          </span>
                          {report.iteration && report.iteration > 1 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                              Iteration {report.iteration}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>Policy: {report.metadata.policyNo}</span>
                          <span>Score: {report.score}%</span>
                          <span>
                            Actions: {report.remedialActions.length}
                          </span>
                          <span>Date: {formatDate(report.createdAt)}</span>
                          <span className="text-[#005f6b] font-medium">
                            Code: {codeLabel}
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-16 h-16 rounded-lg flex items-center justify-center font-bold text-lg"
                        style={{
                          backgroundColor:
                            report.score >= 90
                              ? "#10b98120"
                              : report.score >= 70
                              ? "#f59e0b20"
                              : "#ef444420",
                          color:
                            report.score >= 90
                              ? "#10b981"
                              : report.score >= 70
                              ? "#f59e0b"
                              : "#ef4444",
                        }}
                      >
                        {report.score}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPortal;


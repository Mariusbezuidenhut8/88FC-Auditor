import React, { useState } from "react";
import { AccessCode, ComplianceReport } from "../types";

interface AdminPortalProps {
  accessCodes: AccessCode[];
  reports: ComplianceReport[];
  onGenerateCode: (label: string, isPermanent?: boolean) => void;
  onRevokeCode: (id: string) => void;
  onBack: () => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({
  accessCodes,
  reports,
  onGenerateCode,
  onRevokeCode,
  onBack,
}) => {
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [isPermanent, setIsPermanent] = useState(false);
  const [activeTab, setActiveTab] = useState<"codes" | "reports">("codes");

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


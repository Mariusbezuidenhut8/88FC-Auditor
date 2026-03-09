import React, { useState } from "react";
import type { AccessCode, UserRole } from "../types";

interface AccessCodeGateProps {
  accessCodes: AccessCode[];
  onAccessGranted: (codeId: string, role: UserRole) => void;
}

const AccessCodeGate: React.FC<AccessCodeGateProps> = ({
  accessCodes,
  onAccessGranted,
}) => {
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState("");
  const [isAdminMode, setIsAdminMode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanInput = inputCode.trim();

    // --- ADMIN MODE ---
    if (isAdminMode) {
      if (cleanInput === "ADMIN-8851") {
        onAccessGranted("admin-id", "ADMIN");
      } else {
        setError("Invalid Admin Credentials");
      }
      return;
    }

    // --- USER MODE ---
    const foundCode = accessCodes.find(
      (c) =>
        (c.code || "").trim().toUpperCase() === cleanInput.toUpperCase() &&
        String(c.status || "").toUpperCase() === "ACTIVE"
    );

    if (!foundCode) {
      setError("Invalid Access Code");
      return;
    }

    // Expiry check (treat invalid/missing date as not expired)
    if (foundCode.expiryDate) {
      const exp = new Date(foundCode.expiryDate);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        setError("This access code has expired.");
        return;
      }
    }

    onAccessGranted(foundCode.id, "USER");
  };

  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-xl">
      {/* Header Section */}
      <div className="bg-[#005f6b] p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <div
            className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
            title="System Ready"
          />
        </div>

        <div className="w-20 h-20 bg-white/10 rounded-3xl mx-auto flex items-center justify-center mb-6">
          <h1 className="text-4xl font-black text-white">FC</h1>
        </div>

        <h1 className="text-3xl font-black text-white tracking-tight">
          {isAdminMode ? "Admin Portal" : "Access Gate"}
        </h1>
        <p className="text-teal-100/80 text-sm mt-2 font-medium">
          Fairbairn Consult Security
        </p>
      </div>

      {/* Form Section */}
      <div className="p-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] px-1">
              {isAdminMode ? "Admin Password" : "Secure Access Code"}
            </label>

            <div className="relative group">
              <input
                type={isAdminMode ? "password" : "text"}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder={isAdminMode ? "Enter Password" : "FC-XXXX-XXXX"}
                className="w-full border-2 border-slate-200 p-5 rounded-2xl text-center text-xl font-bold bg-slate-50 text-slate-900 focus:bg-white focus:border-[#005f6b] focus:ring-4 focus:ring-[#005f6b]/10 outline-none transition-all placeholder-slate-300"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl border border-rose-100 flex items-center gap-3">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-sm ${
              isAdminMode ? "bg-slate-800" : "bg-[#005f6b]"
            }`}
          >
            {isAdminMode ? "Authenticate Admin" : "Enter Application"}
          </button>
        </form>

        {/* Toggle Switch (Admin vs User) */}
        <div className="mt-8 pt-8 border-t border-slate-100 flex justify-between items-center">
          <button
            type="button"
            onClick={() => {
              setIsAdminMode(!isAdminMode);
              setInputCode("");
              setError("");
            }}
            className="text-xs font-black text-slate-400 hover:text-[#005f6b] transition-colors flex items-center gap-2"
          >
            {isAdminMode ? <>← Back to User Access</> : <>⚙️ Admin Panel</>}
          </button>

          <div className="text-[10px] text-slate-300 font-mono font-bold">
            SECURE-V4.0
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessCodeGate;




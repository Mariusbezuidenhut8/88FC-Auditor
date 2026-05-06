import React from "react";
import { Status } from "../types";

type Props = {
  id?: string;
  title: string;
  subtitle?: string;
  status: Status;
  comment: string;
  disabled?: boolean;
  onStatusChange: (next: Status) => void;
  onCommentChange: (next: string) => void;
};

const OPTIONS: { value: Status; label: string; icon: string }[] = [
  { value: "YES", label: "Yes", icon: "✓" },
  { value: "NO",  label: "No",  icon: "✕" },
  { value: "N/A", label: "N/A", icon: "—" },
];

const ACTIVE_STYLES: Record<Status, string> = {
  YES:  "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200 shadow-md",
  NO:   "bg-rose-500   border-rose-500   text-white shadow-rose-200   shadow-md",
  "N/A":"bg-slate-400  border-slate-400  text-white shadow-slate-200  shadow-md",
};

export default function ChecklistRow({
  title,
  subtitle,
  status,
  comment,
  disabled,
  onStatusChange,
  onCommentChange,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6 space-y-4 transition-all hover:shadow-md hover:border-slate-200">
      {/* Question */}
      <div>
        <p className="font-bold text-slate-800 text-base leading-snug">{title}</p>
        {subtitle && (
          <p className="text-xs text-slate-400 font-medium mt-1">{subtitle}</p>
        )}
      </div>

      {/* Status buttons */}
      <div className="flex gap-3">
        {OPTIONS.map((opt) => {
          const isActive = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onStatusChange(opt.value)}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 font-black text-sm
                transition-all duration-150 select-none
                ${isActive
                  ? ACTIVE_STYLES[opt.value]
                  : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"}
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <span className={`text-base leading-none ${isActive ? "opacity-100" : "opacity-40"}`}>
                {opt.icon}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Detail input */}
      <input
        type="text"
        placeholder="Add detail or auditor note…"
        value={comment || ""}
        onChange={(e) => onCommentChange(e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all disabled:opacity-50"
      />
    </div>
  );
}

import React from "react";
import { Status } from "../types";

type Props = {
  title: string;
  subtitle?: string;
  status: Status;
  comment: string;
  disabled?: boolean;
  onStatusChange: (next: Status) => void;
  onCommentChange: (next: string) => void;
};

const OPTIONS: { value: Status; label: string }[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NA", label: "N/A" },
];

export default function ChecklistRow({
  title,
  subtitle,
  status,
  comment,
  disabled,
  onStatusChange,
  onCommentChange,
}: Props) {
  const groupName = `status-${title.replace(/\s+/g, "-")}`;

  return (
    <div className="cl-row">
      <div className="cl-left">
        <div className="cl-title">{title}</div>
        {subtitle && <div className="cl-subtitle">{subtitle}</div>}
      </div>

      <div className="cl-status">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="cl-dot">
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={status === opt.value}
              onChange={() => onStatusChange(opt.value)}
              disabled={disabled}
            />
            <span className="cl-dotLabel">{opt.label}</span>
          </label>
        ))}
      </div>

      <input
        className="cl-detail"
        placeholder="Add detail..."
        value={comment || ""}
        onChange={(e) => onCommentChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}



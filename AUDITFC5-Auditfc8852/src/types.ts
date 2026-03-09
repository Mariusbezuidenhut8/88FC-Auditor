export type Status = 'YES' | 'NO' | 'N/A';
export type ActionStatus = 'PENDING' | 'RESOLVED';
export type UserRole = 'NONE' | 'USER' | 'ADMIN'; // ← MISSING TYPE ADDED

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  defaultRemedialAction: string;
}

export interface Finding {
  itemId: string;
  status: Status;
  comment?: string;
}

export interface ReviewMetadata {
  representativeName: string;
  clientName: string;
  reviewDate: string;
  policyNo: string;
  insurerName: string;
  managerName: string;
}

export interface RemedialAction {
  id: string;
  description: string; // Changed from 'text' to match your Azure service
  dueDate: string;     // Changed from 'targetDate' to match your Azure service
  status: ActionStatus;
  completionDate?: string;
}

export interface ComplianceReport {
  id: string;
  metadata: ReviewMetadata;
  findings: Finding[];
  remedialActions: RemedialAction[];
  score: number;        // ADDED - your App.tsx creates this
  createdAt: string;
  updatedAt: string;    // ADDED - your App.tsx creates this
  iteration: number;
  parentReportId?: string;
  createdByCodeId: string; // ADDED - your App.tsx uses this
}

/**
 * Interface for security access codes managed in the admin panel.
 */
export interface AccessCode {
  id: string;
  code: string;
  label: string;
  expiryDate: string;
  createdAt: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED'; // Added REVOKED status
  usageCount: number;
}

export interface CARIssue {
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  whatWasWritten: string;
  whatIsWrong: string;
  whatShouldBeWritten: string;
  industryExample: string;
}

export interface CARIssue {
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  whatWasWritten: string;
  whatIsWrong: string;
  whatShouldBeWritten: string;
  industryExample: string;
}

export interface CARAnalysis {
  id: string;
  representativeName: string;
  clientName: string;
  caseNumber: string;
  productType: string;
  policyNumber: string;
  insurerName: string;
  adviceDate: string;
  submittedAt: string;
  carText: string;
  overallScore: number;
  overallVerdict: string;
  issues: CARIssue[];
  strengths: string[];
  createdByCodeId: string;
}











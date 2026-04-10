// src/constants.ts

export type ChecklistItem = {
  id: string;
  text: string;
  subtitle?: string;
};

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "contact_disclosure",
    text: "Contact Stage Disclosures made?",
    subtitle: "Adviser licensed and accredited, signed disclosure letter",
  },
  {
    id: "client_authority",
    text: "Client Authority / Brokers Note on file?",
    subtitle: "Mandate or broker appointment note",
  },

  // --- Items you pasted (converted from label/description to text/subtitle) ---
  {
    id: "fica_id",
    text: "FICA - Client ID/Verification docs?",
    subtitle: "Certified ID, registration, utility bills",
  },
  {
    id: "fica_dd",
    text: "FICA - Addendum/Due Diligence?",
    subtitle: "Enhanced due diligence or FICA addendum",
  },
  {
    id: "popi",
    text: "POPI Consent form?",
    subtitle: "Protection of Personal Information Act compliance",
  },
  {
    id: "policy_schedule",
    text: "Policy Schedule?",
    subtitle: "Current valid policy document",
  },
  {
    id: "fact_find",
    text: "Fact Find (Needs/Obj/Affordability)?",
    subtitle: "Documenting client situation and requirements",
  },
  {
    id: "risk_profile",
    text: "Completed risk profile?",
    subtitle: "Signed risk appetite questionnaire",
  },
  {
    id: "fna",
    text: "Financial Needs Analysis conducted?",
    subtitle: "Analysis of financial gaps",
  },
  {
    id: "quotes",
    text: "Comparative quotes/schedule?",
    subtitle: "Evidence of market analysis",
  },
  {
    id: "limited_advice",
    text: "Client warned (Limited Advice)?",
    subtitle: "Warning letter where scope is restricted",
  },
  {
    id: "advice_record",
    text: "Client Advice Record (ROA)?",
    subtitle: "Detailed record of advice provided",
  },
  {
    id: "replacements",
    text: "Replacement Consequences advised?",
    subtitle: "Costs, penalties, and tax implications",
  },
  {
    id: "suitability",
    text: "Product sold aligns with needs?",
    subtitle: "Suitability of the recommendation",
  },
  {
    id: "deviations",
    text: "Implications explained (Deviations)?",
    subtitle: "Records of client not following advice",
  },
  {
    id: "storage",
    text: "Docs stored and retrievable?",
    subtitle: "Signed docs in central repository",
  },
  {
    id: "supervision",
    text: "Supervision obligations met?",
    subtitle: "Supervisor sign-off and contract check",
  },
];

// Admin gate (note: for production, move this to backend)
export const ADMIN_PASSWORD = "88Wealth-88-26";

export const THEME_COLORS = {
  primary: "#005f6b",
  secondary: "#f39200",
  success: "#10b981",
  danger: "#ef4444",
  neutral: "#6b7280",
};


// src/constants.ts

export type ChecklistItem = {
  id: string;
  text: string;
  subtitle?: string;
};

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "contact_disclosure",
    text: "Contact Stage Disclosures made",
    subtitle: "Client signed copy, is adviser licenced and accredited to sell product?",
  },
  {
    id: "client_authority",
    text: "Client Authority / Brokers Note on file.",
  },
  {
    id: "fica_id",
    text: "If transaction falls within ambit of FICA - client identification and verification documents.",
    subtitle: "Copy of ID document / registration docs / utility bill / Beeswax reports",
  },
  {
    id: "fica_dd",
    text: "FICA Documentation",
    subtitle: "FICA Addendum / Transactional due diligence / Beeswax reports",
  },
  {
    id: "popi",
    text: "POPI Consent form",
  },
  {
    id: "policy_schedule",
    text: "Policy Schedule",
  },
  {
    id: "fact_find",
    text: "Process of seeking information from client / completed Fact Finding document.",
    subtitle: "Needs / Objectives / Affordability / Astute",
  },
  {
    id: "risk_profile",
    text: "Completed risk profile.",
  },
  {
    id: "fna",
    text: "Financial Needs Analysis conducted.",
  },
  {
    id: "quotes",
    text: "Comparative quotes / schedule of quotes.",
  },
  {
    id: "limited_advice",
    text: "Client warned where limited advice given.",
  },
  {
    id: "advice_record",
    text: "Client Advice Record.",
    subtitle: "Summary of info and material advice provided, products considered and recommended",
  },
  {
    id: "replacements",
    text: "Client fully advised of consequences of replacements.",
    subtitle: "Cost, Financial Implications, Tax implications, product differences, penalties, restrictions",
  },
  {
    id: "suitability",
    text: "Product sold aligns with identified needs",
  },
  {
    id: "deviations",
    text: "Implications explained to the client where client didn't follow advice",
  },
  {
    id: "storage",
    text: "Information, documents and advice records properly stored and retrievable.",
    subtitle: "Signed quote and application form",
  },
  {
    id: "supervision",
    text: "Supervision obligations met",
    subtitle: "If applicable",
  },
  {
    id: "other_noncompliance",
    text: "Other: is there evidence of any other non-compliance not mentioned above?",
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


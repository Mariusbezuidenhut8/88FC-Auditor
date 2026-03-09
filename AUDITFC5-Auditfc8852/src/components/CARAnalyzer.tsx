import React, { useEffect, useMemo, useRef, useState } from "react";
import { CARAnalysis, CARIssue } from "../types";
import { evaluateCAR } from "../azureOpenAIService";
import html2pdf from "html2pdf.js";


// PDF.js
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

interface CARAnalyzerProps {
  onBack: () => void;
  activeCodeId: string;
}

interface CARMeta {
  caseNumber: string;
  productType: string;
  policyNumber: string;
  insurerName: string;
  adviceDate: string;
}

type Step = "input" | "analyzing" | "results" | "history";

const severityConfig: Record<
  "HIGH" | "MEDIUM" | "LOW",
  { color: string; bg: string; border: string; label: string }
> = {
  HIGH: { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", label: "HIGH RISK" },
  MEDIUM: { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "MEDIUM RISK" },
  LOW: { color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", label: "LOW RISK" },
};

function safeFilePart(s: string) {
  return (s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]+/g, "")
    .slice(0, 60);
}

/** Extract first JSON object from messy model output */
function extractJsonObject(text: string) {
  const cleaned = (text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // find first balanced {...}
    const start = cleaned.indexOf("{");
    if (start === -1) throw new Error("No JSON object start '{' found");

    let depth = 0;
    let end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) throw new Error("No complete JSON object found");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((it: any) => it.str);
    fullText += strings.join(" ") + "\n";
  }

  return fullText.trim();
}

const CARAnalyzer: React.FC<CARAnalyzerProps> = ({ onBack, activeCodeId }) => {
  const [step, setStep] = useState<Step>("input");
  const [inputMethod, setInputMethod] = useState<"paste" | "upload">("paste");

  const [carText, setCarText] = useState("");
  const [repName, setRepName] = useState("");
  const [clientName, setClientName] = useState("");

  const [meta, setMeta] = useState<CARMeta>({
    caseNumber: "",
    productType: "",
    policyNumber: "",
    insurerName: "",
    adviceDate: "",
  });

  const [analysis, setAnalysis] = useState<CARAnalysis | null>(null);
  const [history, setHistory] = useState<CARAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── Load history ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("car_analyses");
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.error("Error loading CAR history", e);
    }
  }, []);

  const saveToHistory = (newAnalysis: CARAnalysis) => {
    const updated = [newAnalysis, ...history];
    setHistory(updated);
    localStorage.setItem("car_analyses", JSON.stringify(updated));
  };

  const deleteFromHistory = (id: string) => {
    if (!window.confirm("Delete this CAR analysis?")) return;
    const updated = history.filter((a) => a.id !== id);
    setHistory(updated);
    localStorage.setItem("car_analyses", JSON.stringify(updated));
  };

  // ── Auto-extract details from text ───────────────────────────
  const autoExtract = async (text: string) => {
    if (text.trim().length < 120) return; // avoid weak docs

    setIsExtracting(true);
    setError(null);

    try {
      const response = await fetch("/.netlify/functions/azure-openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a document parser. Extract key details from financial advice documents. Return ONLY valid JSON. No markdown. No commentary.",
            },
            {
              role: "user",
              content: `Extract the following details from this Client Advice Record document. If a field is not found, return an empty string.

DOCUMENT:
"""
${text.substring(0, 4500)}
"""

Return ONLY this JSON:
{
  "representativeName": "",
  "clientName": "",
  "caseNumber": "",
  "productType": "",
  "policyNumber": "",
  "insurerName": "",
  "adviceDate": ""
}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Extract call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Be tolerant to different Netlify function response shapes:
      const content =
        data?.choices?.[0]?.message?.content ??
        data?.message?.content ??
        data?.content ??
        data?.result ??
        data?.text ??
        "";

      if (!content) {
        console.log("AutoExtract: unexpected response shape", data);
        throw new Error("No model content returned from server");
      }

      const extracted = extractJsonObject(content);

      // Only fill missing fields (don’t overwrite user’s manual inputs with blanks)
      if (typeof extracted.representativeName === "string" && extracted.representativeName.trim()) {
        setRepName((prev) => (prev.trim() ? prev : extracted.representativeName.trim()));
      }
      if (typeof extracted.clientName === "string" && extracted.clientName.trim()) {
        setClientName((prev) => (prev.trim() ? prev : extracted.clientName.trim()));
      }

      setMeta((prev) => ({
        caseNumber: (extracted.caseNumber || "").trim() || prev.caseNumber,
        productType: (extracted.productType || "").trim() || prev.productType,
        policyNumber: (extracted.policyNumber || "").trim() || prev.policyNumber,
        insurerName: (extracted.insurerName || "").trim() || prev.insurerName,
        adviceDate: (extracted.adviceDate || "").trim() || prev.adviceDate,
      }));
    } catch (e) {
      console.error("Auto-extract failed:", e);
      setError("Auto-extraction could not read details. You can still enter them manually.");
    } finally {
      setIsExtracting(false);
    }
  };

  // Debounce extraction on carText changes
  useEffect(() => {
    if (step !== "input") return;
    if (carText.trim().length < 120) return;

    const t = window.setTimeout(() => {
      autoExtract(carText);
    }, 900);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carText, step]);

  // ── File upload ──────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // TXT
    if (file.type === "text/plain") {
      const text = await file.text();
      setCarText(text);
      return;
    }

    // PDF (REAL extraction)
    if (file.type === "application/pdf") {
      setIsExtracting(true);
      try {
        const text = await extractTextFromPdf(file);
        setCarText(text);
      } catch (err) {
        console.error(err);
        setError("Could not extract text from PDF (maybe scanned). Please paste the CAR text instead.");
        setCarText("");
      } finally {
        setIsExtracting(false);
      }
      return;
    }

    // Images (no OCR here)
    if (file.type.startsWith("image/")) {
      setCarText(
        `[Image uploaded: ${file.name}]\n\nThis tool does not OCR images. Please copy/paste the CAR text for best results.`
      );
      return;
    }

    setCarText(`[File uploaded: ${file.name}]\n\nPlease copy/paste the text content of your CAR document.`);
  };

  // ── Analyze gating ───────────────────────────────────────────
  const hasSomeMeta = useMemo(() => {
    return !!(
      meta.caseNumber.trim() ||
      meta.productType.trim() ||
      meta.policyNumber.trim() ||
      meta.adviceDate.trim()
    );
  }, [meta]);

  const canAnalyze = useMemo(() => {
    return (
      carText.trim().length > 0 &&
      repName.trim().length > 0 &&
      clientName.trim().length > 0 &&
      !isExtracting &&
      hasSomeMeta
    );
  }, [carText, repName, clientName, isExtracting, hasSomeMeta]);

  // ── Submit for analysis ───────────────────────────────────────
  const handleAnalyze = async () => {
    if (!canAnalyze) {
      setError("Please complete the required info and wait for extraction to finish.");
      return;
    }

    setError(null);
    setStep("analyzing");

    try {
      const result = await evaluateCAR(carText, repName, clientName, meta);

      const fullAnalysis: CARAnalysis = {
        id: crypto.randomUUID(),
        representativeName: repName,
        clientName,

        caseNumber: result.extractedMeta?.caseNumber || meta.caseNumber || "",
        productType: result.extractedMeta?.productType || meta.productType || "",
        policyNumber: result.extractedMeta?.policyNumber || meta.policyNumber || "",
        insurerName: result.extractedMeta?.insurerName || meta.insurerName || "",
        adviceDate: result.extractedMeta?.adviceDate || meta.adviceDate || "",

        submittedAt: new Date().toISOString(),
        carText,
        overallScore: result.overallScore ?? 0,
        overallVerdict: result.overallVerdict ?? "Analysis complete.",
        issues: result.issues ?? [],
        strengths: result.strengths ?? [],
        createdByCodeId: activeCodeId,
      };

      saveToHistory(fullAnalysis);
      setAnalysis(fullAnalysis);
      setStep("results");
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Please check your Azure connection and try again.");
      setStep("input");
    }
  };

  // ── PDF download ──────────────────────────────────────────────
  const handleDownloadPdf = async () => {
  if (!resultRef.current) {
    alert("Nothing to download yet. Run an analysis first.");
    return;
  }

  setIsDownloading(true);
  try {
    const filenameParts = [
      "CAR_Analysis",
      repName?.trim(),
      clientName?.trim(),
      meta.productType?.trim(),
      meta.policyNumber?.trim(),
      meta.adviceDate?.trim(),
    ].filter(Boolean);

    const filename =
      filenameParts.map(p => p!.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "")).join("_") +
      ".pdf";

    await (html2pdf as any)()
      .set({
        margin: [15, 15],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(resultRef.current)
      .save();
  } catch (e) {
    console.error("PDF download failed:", e);
    alert("PDF download failed. Open Console (F12) and send me the error shown.");
  } finally {
    setIsDownloading(false);
  }
};


  const scoreColor = (s: number) => (s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444");

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  // ──────────────────────────────────────────────────────────────
  // RENDER (keeps your original UI layout)
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">CAR Evaluator</h1>
          <p className="text-slate-500 text-sm mt-1">
            AI-powered Client Advice Record analysis against FAIS and TCF standards
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(step === "history" ? "input" : "history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all border-2 ${
              step === "history"
                ? "bg-[#005f6b] text-white border-[#005f6b]"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            History ({history.length})
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border-2 border-slate-200 hover:bg-slate-50 font-medium text-slate-600 transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      {/* HISTORY */}
      {step === "history" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Previous CAR Analyses</h2>
          {history.length === 0 ? (
            <p className="text-slate-500 italic text-center py-12">No analyses saved yet</p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 cursor-pointer" onClick={() => { setAnalysis(h); setStep("results"); }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-slate-900">{h.representativeName}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-700">{h.clientName}</span>
                      {h.caseNumber && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-mono">
                          {h.caseNumber}
                        </span>
                      )}
                      {h.productType && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                          {h.productType}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      <span>{formatDate(h.submittedAt)}</span>
                      {h.insurerName && <span>{h.insurerName}</span>}
                      {h.policyNumber && <span>Policy: {h.policyNumber}</span>}
                      <span>{h.issues.length} issues found</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: `${scoreColor(h.overallScore)}20`, color: scoreColor(h.overallScore) }}
                    >
                      {h.overallScore}%
                    </div>
                    <button
                      onClick={() => deleteFromHistory(h.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INPUT */}
      {step === "input" && (
        <div className="space-y-6">
          {/* Required details */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Document Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Representative Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-[#005f6b]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Client Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-[#005f6b]"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Auto-Extracted Details</p>
                {isExtracting ? (
                  <span className="text-xs text-[#005f6b] font-medium animate-pulse">Extracting…</span>
                ) : hasSomeMeta ? (
                  <span className="text-xs text-emerald-600 font-medium">Auto-filled</span>
                ) : (
                  <span className="text-xs text-slate-400">Upload/Paste document to auto-fill</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Case Number", key: "caseNumber", placeholder: "e.g. FC-2026-001" },
                  { label: "Product Type", key: "productType", placeholder: "e.g. Life Cover" },
                  { label: "Policy Number", key: "policyNumber", placeholder: "e.g. 11426555000" },
                  { label: "Insurer", key: "insurerName", placeholder: "e.g. Old Mutual" },
                  { label: "Date of Advice", key: "adviceDate", placeholder: "e.g. 2026-01-15" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={(meta as any)[key]}
                      onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                      placeholder={isExtracting ? "Extracting…" : placeholder}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border-0 focus:ring-2 focus:ring-[#005f6b]"
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-400 mt-3">
                Tip: At least one of Case / Product / Policy / Advice Date must be filled to enable Analyse.
              </p>
            </div>
          </div>

          {/* Input method */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setInputMethod("paste")}
                className={`flex-1 py-3 rounded-xl font-bold ${
                  inputMethod === "paste" ? "bg-[#005f6b] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setInputMethod("upload")}
                className={`flex-1 py-3 rounded-xl font-bold ${
                  inputMethod === "upload" ? "bg-[#005f6b] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                Upload File
              </button>
            </div>

            {inputMethod === "paste" ? (
              <textarea
                value={carText}
                onChange={(e) => setCarText(e.target.value)}
                rows={14}
                className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-[#005f6b] font-mono text-sm"
                placeholder="Paste the full CAR/ROA text here..."
              />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#005f6b] hover:bg-slate-50 transition-all"
              >
                <p className="font-bold text-slate-700 mb-1">Click to upload</p>
                <p className="text-sm text-slate-400">Supports .txt, .pdf (digital text), images (no OCR)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {carText && (
                  <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
                    <p className="text-emerald-700 font-medium text-sm">File loaded successfully</p>
                    <p className="text-emerald-600 text-xs mt-1">{carText.length} characters extracted</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>}

          {/* Analyse button */}
          <div className="sticky bottom-8 flex justify-center">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-12 py-4 bg-gradient-to-r from-[#005f6b] to-[#007b8a] text-white font-bold text-lg rounded-full shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isExtracting ? "Extracting details…" : "Analyse CAR Document"}
            </button>
          </div>
        </div>
      )}

      {/* ANALYZING */}
      {step === "analyzing" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-16 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Analysing CAR Document</h2>
          <p className="text-slate-500">Azure AI is evaluating your document…</p>
        </div>
      )}

      {/* RESULTS */}
      {step === "results" && analysis && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 print:hidden">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="px-6 py-2.5 bg-[#005f6b] text-white font-bold rounded-xl hover:bg-[#004b54]"
            >
              {isDownloading ? "Generating…" : "Download PDF"}
            </button>

            <button
              onClick={() => {
                setStep("input");
                setAnalysis(null);
                setCarText("");
                setRepName("");
                setClientName("");
                setMeta({ caseNumber: "", productType: "", policyNumber: "", insurerName: "", adviceDate: "" });
              }}
              className="px-6 py-2.5 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
            >
              Analyse Another CAR
            </button>

            <button
              onClick={() => setStep("history")}
              className="px-6 py-2.5 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
            >
              View History
            </button>
          </div>

          <div ref={resultRef} className="space-y-6 bg-white p-2 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="flex-shrink-0">
                  <div
                    className="w-32 h-32 rounded-full flex items-center justify-center font-black text-4xl"
                    style={{
                      background: `${scoreColor(analysis.overallScore)}20`,
                      color: scoreColor(analysis.overallScore),
                      border: `4px solid ${scoreColor(analysis.overallScore)}40`,
                    }}
                  >
                    {analysis.overallScore}%
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                      {analysis.representativeName}
                    </span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                      {analysis.clientName}
                    </span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">
                      {formatDate(analysis.submittedAt)}
                    </span>
                  </div>

                  <p className="text-slate-700">{analysis.overallVerdict}</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">
                Issues Identified ({analysis.issues.length})
              </h2>

              <div className="space-y-4">
                {analysis.issues.map((issue: CARIssue, idx: number) => {
                  const cfg = severityConfig[issue.severity] || severityConfig.LOW;
                  const isOpen = expandedIssue === idx;

                  return (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl shadow-sm border overflow-hidden"
                      style={{ borderColor: cfg.border }}
                    >
                      <button
                        onClick={() => setExpandedIssue(isOpen ? null : idx)}
                        className="w-full text-left p-6 flex items-start justify-between gap-4 hover:bg-slate-50"
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <span className="px-2 py-1 rounded-lg text-xs font-black" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <div>
                            <p className="font-bold text-slate-900">{issue.category}</p>
                            <p className="text-sm text-slate-500 mt-1">{issue.whatIsWrong}</p>
                          </div>
                        </div>
                        <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100">
                          <div className="p-6" style={{ backgroundColor: cfg.bg }}>
                            <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: cfg.color }}>
                              What Was Written
                            </p>
                            <p className="text-slate-700 italic bg-white rounded-lg p-4 border text-sm">
                              {issue.whatWasWritten || "Not addressed in the document"}
                            </p>
                          </div>

                          <div className="p-6 bg-white">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                              What Should Have Been Written
                            </p>
                            <p className="text-slate-800 text-sm bg-white rounded-lg p-4 border font-medium">
                              {issue.whatShouldBeWritten}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default CARAnalyzer;

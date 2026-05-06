import React, { useRef, useState } from "react";
import ChecklistRow from "./ChecklistRow";
import { Status, Finding, ReviewMetadata } from "../types";
import { CHECKLIST_ITEMS } from "../constants";
import { extractAuditDataFromFile, extractAuditDataFromPages } from "../azureOpenAIService";

interface ExcelRow {
  representativeName: string;
  accountCode: string;
  clientName: string;
  insurerName: string;
  policyNo: string;
}

// PDF.js for rendering PDF pages as images (supports handwritten notes)
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

interface ChecklistFormProps {
  onSubmit: (metadata: ReviewMetadata, findings: Finding[]) => void;
  onPreview: (metadata: ReviewMetadata, findings: Finding[]) => void;
  isSubmitting: boolean;
  initialMetadata?: ReviewMetadata | null;
  initialFindings?: Finding[] | null;
  iteration?: number;
  hasApiKey: boolean;
  onSelectKey: () => void;
}

const ChecklistForm: React.FC<ChecklistFormProps> = ({
  onSubmit,
  onPreview,
  isSubmitting,
  initialMetadata,
  initialFindings,
  iteration = 0,
  hasApiKey,
  onSelectKey,
}) => {
  const [metadata, setMetadata] = useState<ReviewMetadata>(
    initialMetadata || {
      representativeName: "",
      clientName: "",
      reviewDate: new Date().toISOString().split("T")[0],
      policyNo: "",
      insurerName: "",
      managerName: "",
    }
  );

  const [findings, setFindings] = useState<Finding[]>(
    initialFindings ||
      CHECKLIST_ITEMS.map((item) => ({
        itemId: item.id,
        status: "NO" as Status,
        comment: "",
      }))
  );

  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [excelPasteText, setExcelPasteText] = useState("");

  const parseExcelText = (text: string): ExcelRow[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const rows: ExcelRow[] = [];
    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 8) continue;
      const accountName = cols[1]?.trim() || '';
      if (!accountName || accountName.toLowerCase() === 'account name') continue;
      rows.push({
        representativeName: accountName,
        accountCode: cols[2]?.trim() || '',
        clientName: cols[3]?.trim() || '',
        insurerName: cols[4]?.trim() || '',
        policyNo: cols[7]?.trim() || '',
      });
    }
    return rows;
  };

  const handleExcelPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    setExcelPasteText(text);
    setExcelRows(parseExcelText(text));
  };

  const handleExcelTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setExcelPasteText(text);
    setExcelRows(parseExcelText(text));
  };

  const handleSelectExcelRow = (row: ExcelRow) => {
    setMetadata(prev => ({
      ...prev,
      representativeName: row.representativeName,
      clientName: row.clientName,
      insurerName: row.insurerName,
      policyNo: row.policyNo,
    }));
    setShowExcelImport(false);
    setExcelRows([]);
    setExcelPasteText('');
  };

  const handleStatusChange = (itemId: string, status: Status) => {
    setFindings((prev) => prev.map((f) => (f.itemId === itemId ? { ...f, status } : f)));
  };

  const handleCommentChange = (itemId: string, comment: string) => {
    setFindings((prev) => prev.map((f) => (f.itemId === itemId ? { ...f, comment } : f)));
  };

  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMetadata({ ...metadata, [e.target.name]: e.target.value });
  };

  const compressImage = async (file: File): Promise<{ base64DataUrl: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => {
        const img = new Image();
        img.src = String(reader.result);

        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          const maxDim = 800;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          const mimeType = "image/jpeg";
          const base64DataUrl = canvas.toDataURL(mimeType, 0.85);
          resolve({ base64DataUrl, mimeType });
        };

        img.onerror = () => reject(new Error("Failed to load image"));
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
    });
  };

  // Renders each PDF page to a JPEG image so the Vision API can read handwritten notes
  const extractPDFPagesAsImages = async (file: File): Promise<Array<{ base64: string; mimeType: string }>> => {
    const buffer = await file.arrayBuffer();
    const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;
    const maxPages = Math.min(pdf.numPages, 10); // Azure OpenAI Vision supports up to 10 images
    const pages: Array<{ base64: string; mimeType: string }> = [];

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); // Scale 1.5 gives good OCR quality
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const mimeType = "image/jpeg";
      const base64 = canvas.toDataURL(mimeType, 0.85).split(",")[1] || "";
      pages.push({ base64, mimeType });
    }

    return pages;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPDF) {
      alert("Please upload an image or PDF document.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!hasApiKey) {
      onSelectKey();
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsExtracting(true);

    try {
      let extracted: { metadata?: Partial<ReviewMetadata>; findings?: Partial<Finding>[] } = {};

      if (isPDF) {
        const pages = await extractPDFPagesAsImages(file);
        extracted = await extractAuditDataFromPages(pages);
      } else {
        const { base64DataUrl, mimeType } = await compressImage(file);
        const base64Only = base64DataUrl.split(",")[1] || "";
        extracted = await extractAuditDataFromFile(base64Only, mimeType);
      }

      if (extracted?.metadata) {
        setMetadata((prev) => ({ ...prev, ...extracted.metadata }));
      }

      if (extracted?.findings?.length) {
        setFindings((prev) => {
          const updated = [...prev];
          extracted.findings!.forEach((extFinding: any) => {
            const idx = updated.findIndex((f) => f.itemId === extFinding.itemId);
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                status: extFinding.status || updated[idx].status,
                comment: extFinding.comment || updated[idx].comment,
              };
            }
          });
          return updated;
        });
      }
    } catch (err) {
      console.error("Scan failed:", err);
      alert("Scan failed. Please check the Azure function response in Network tab.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    onPreview({ metadata, findings });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-slate-900">
          Fairbairn Compliance
        </h1>
        <p className="text-slate-500 uppercase tracking-wider text-sm font-semibold">
          Azure AI Powered Management {iteration > 0 ? `• Iteration ${iteration}` : ""}
        </p>
      </div>

      {/* Excel Import Panel */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => { setShowExcelImport(v => !v); setExcelRows([]); setExcelPasteText(''); }}
          className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Load from Excel</p>
              <p className="text-xs text-slate-400">Copy rows from your spreadsheet and paste below to select a file</p>
            </div>
          </div>
          <svg className={`w-5 h-5 text-slate-400 transition-transform ${showExcelImport ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        {showExcelImport && (
          <div className="border-t border-slate-100 px-8 py-6 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Step 1 — Select all rows in Excel (Ctrl+A or highlight rows), then Ctrl+C and paste below
              </p>
              <textarea
                rows={3}
                value={excelPasteText}
                onPaste={handleExcelPaste}
                onChange={handleExcelTextChange}
                placeholder="Paste Excel rows here…"
                className="w-full text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {excelRows.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Step 2 — Click a row to load it into the audit form ({excelRows.length} records found)
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {excelRows.map((row, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectExcelRow(row)}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 truncate group-hover:text-emerald-800">
                            {row.representativeName}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {row.clientName} · {row.insurerName}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Policy</p>
                          <p className="text-xs font-black text-slate-700">{row.policyNo || '—'}</p>
                        </div>
                        {row.accountCode && (
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Code</p>
                            <p className="text-xs font-black text-slate-700">{row.accountCode}</p>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {excelPasteText && excelRows.length === 0 && (
              <p className="text-xs text-rose-500 font-bold">
                No valid rows detected. Make sure you copy from column A (Payment Period) through at least column H (Policy Number).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Metadata Form Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
        <form onSubmit={handlePreview}>
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Name of Representative
              </label>
              <input
                type="text"
                name="representativeName"
                placeholder="e.g. John Doe"
                value={metadata.representativeName}
                onChange={handleMetaChange}
                required
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Client Name
              </label>
              <input
                type="text"
                name="clientName"
                placeholder="e.g. Jane Smith"
                value={metadata.clientName}
                onChange={handleMetaChange}
                required
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Review Date
              </label>
              <input
                type="date"
                name="reviewDate"
                value={metadata.reviewDate}
                onChange={handleMetaChange}
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Policy No
              </label>
              <input
                type="text"
                name="policyNo"
                placeholder="e.g. FC-123456"
                value={metadata.policyNo}
                onChange={handleMetaChange}
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Name of Insurer
              </label>
              <input
                type="text"
                name="insurerName"
                placeholder="e.g. Discovery / Old Mutual"
                value={metadata.insurerName}
                onChange={handleMetaChange}
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Manager Name
              </label>
              <input
                type="text"
                name="managerName"
                placeholder="e.g. Mike Manager"
                value={metadata.managerName}
                onChange={handleMetaChange}
                required
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#005f6b] focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* File Upload Section */}
          {hasApiKey && (
            <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-blue-900 mb-2">
                    AI Auto-Fill (Optional)
                  </label>
                  <p className="text-xs text-blue-700 mb-3">
                    Upload an image or PDF (including handwritten notes) to automatically extract information
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isExtracting || isSubmitting}
                    accept="image/*,application/pdf,.pdf"
                    className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                  />
                </div>
                {isExtracting && (
                  <div className="flex-shrink-0">
                    <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Checklist Items */}
      <div className="space-y-4">
        {findings.map((finding) => {
          const item = CHECKLIST_ITEMS.find((i) => i.id === finding.itemId);

          return (
            <ChecklistRow
              key={finding.itemId}
              id={finding.itemId}
              title={item?.text ?? finding.itemId}
              subtitle={(item as any)?.subtitle}
              status={finding.status}
              comment={finding.comment || ""}
              disabled={isSubmitting || isExtracting}
              onStatusChange={(next) => handleStatusChange(finding.itemId, next)}
              onCommentChange={(next) => handleCommentChange(finding.itemId, next)}
            />
          );
        })}
      </div>

      {/* Action Button */}
      <div className="sticky bottom-8 flex justify-center">
        <button
          onClick={handlePreview}
          disabled={isSubmitting || isExtracting}
          className="px-12 py-4 bg-gradient-to-r from-[#005f6b] to-[#007b8a] text-white font-bold text-lg rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            "Complete Audit Review"
          )}
        </button>
      </div>
    </div>
  );
};

export default ChecklistForm;

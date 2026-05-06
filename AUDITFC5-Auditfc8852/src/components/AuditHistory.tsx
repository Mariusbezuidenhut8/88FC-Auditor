import React, { useState, useMemo } from 'react';
import { ComplianceReport, AccessCode } from '../types';

// Ons pas die Props aan om by App.tsx te pas
interface AuditHistoryProps {
  reports: ComplianceReport[];
  onView: (report: ComplianceReport) => void;  // Was onSelect
  onDelete: (id: string) => void;
  onNewReview: () => void;                     // Was onStartNew
  onEdit: (report: ComplianceReport) => void;  // Was onFollowUp
  isAdminView?: boolean;
  accessCodes?: AccessCode[];
}

type SortOption = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc';

const AuditHistory: React.FC<AuditHistoryProps> = ({ 
  reports, 
  onView, 
  onDelete, 
  onNewReview, 
  onEdit,
  isAdminView = false,
  accessCodes = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchClient, setSearchClient] = useState('');
  const [minScore, setMinScore] = useState<string>('0');
  const [maxScore, setMaxScore] = useState<string>('100');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [activeTab, setActiveTab] = useState<'audits' | 'advisers'>('audits');
  const [expandedAdviser, setExpandedAdviser] = useState<string | null>(null);
  const [copiedAdviser, setCopiedAdviser] = useState<string | null>(null);

  const filteredAndSortedReports = useMemo(() => {
    return reports
      .filter(report => {
        // Search Filter
        const matchesRep = report.metadata.representativeName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false;
        const matchesClient = report.metadata.clientName?.toLowerCase().includes(searchClient.toLowerCase()) ?? false;
        
        // Score Filter
        const positiveCount = report.findings.filter(f => f.status === 'YES').length;
        const total = report.findings.length;
        const score = total > 0 ? Math.round((positiveCount / total) * 100) : 0;
        const matchesScore = score >= Number(minScore || 0) && score <= Number(maxScore || 100);

        // Date Filter
        const reportDate = new Date(report.createdAt);
        const matchesStartDate = !startDate || reportDate >= new Date(startDate);
        const matchesEndDate = !endDate || reportDate <= new Date(endDate + 'T23:59:59');

        return matchesRep && matchesClient && matchesScore && matchesStartDate && matchesEndDate;
      })
      .sort((a, b) => {
        const getScore = (r: ComplianceReport) => {
          const pos = r.findings.filter(f => f.status === 'YES').length;
          return r.findings.length > 0 ? Math.round((pos / r.findings.length) * 100) : 0;
        };

        switch (sortBy) {
          case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'score-desc': return getScore(b) - getScore(a);
          case 'score-asc': return getScore(a) - getScore(b);
          default: return 0;
        }
      });
  }, [reports, searchTerm, searchClient, minScore, maxScore, startDate, endDate, sortBy]);

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const adviserSummaries = useMemo(() => {
    const map = new Map<string, ComplianceReport[]>();
    reports.forEach(r => {
      const name = r.metadata.representativeName || 'Unknown';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(r);
    });
    return Array.from(map.entries()).map(([name, reps]) => {
      const allPending = reps.flatMap(r =>
        r.remedialActions.filter(a => a.status === 'PENDING').map(a => ({ ...a, report: r }))
      );
      const overdueCount = allPending.filter(a => a.dueDate && new Date(a.dueDate) < todayDate).length;
      return { name, reports: reps, pending: allPending, overdueCount };
    }).sort((a, b) => b.overdueCount - a.overdueCount || b.pending.length - a.pending.length);
  }, [reports]);

  const generateAdviserEmail = (name: string, adviserReports: ComplianceReport[]) => {
    const sections = adviserReports
      .map(r => ({ report: r, pending: r.remedialActions.filter(a => a.status === 'PENDING') }))
      .filter(x => x.pending.length > 0);
    if (sections.length === 0) return '';
    const body = sections.map(({ report, pending }) => {
      const header = `CLIENT: ${report.metadata.clientName} (Policy: ${report.metadata.policyNo || 'N/A'})  |  Audit Date: ${new Date(report.createdAt).toLocaleDateString()}`;
      const items = pending.map((a, i) => {
        const due = a.dueDate ? `Due: ${new Date(a.dueDate).toLocaleDateString()}` : '';
        const flag = a.dueDate && new Date(a.dueDate) < todayDate ? '  ⚠ OVERDUE' : '';
        return `  ${i + 1}. ${a.description}\n     ${due}${flag}`;
      }).join('\n');
      return `${header}\n${items}`;
    }).join('\n\n');
    return `OUTSTANDING COMPLIANCE ACTIONS\nRepresentative: ${name}\nGenerated: ${new Date().toLocaleDateString()}\n${'─'.repeat(60)}\n\nThe following compliance actions remain outstanding and require your immediate attention:\n\n${body}\n\n${'─'.repeat(60)}\nPlease complete all items above and confirm resolution to the Fairbairn Consult compliance team.\n\nRegards,\nFairbairn Consult Compliance Team`;
  };

  const handleEmailAdviser = (name: string, adviserReports: ComplianceReport[]) => {
    const body = generateAdviserEmail(name, adviserReports);
    const subject = encodeURIComponent(`Outstanding Compliance Actions — ${name}`);
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  const handleCopyAdviser = (name: string, adviserReports: ComplianceReport[]) => {
    const body = generateAdviserEmail(name, adviserReports);
    navigator.clipboard.writeText(body);
    setCopiedAdviser(name);
    setTimeout(() => setCopiedAdviser(null), 2000);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSearchClient('');
    setMinScore('0');
    setMaxScore('100');
    setStartDate('');
    setEndDate('');
    setSortBy('date-desc');
  };

  const getManagerLabel = (codeId?: string) => {
    if (!codeId) return 'System';
    const code = accessCodes.find(c => c.id === codeId);
    return code ? code.label : 'System Admin';
  };

  const inputStyles = "w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none transition-all";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  // --- LEË STAAT ---
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-gray-200 animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 text-gray-300">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-800">No audit records found</h3>
        <p className="text-gray-500 mt-2 mb-8 text-center max-w-md">
          {isAdminView ? 'No audits have been submitted across the entire system yet.' : 'Begin your first representative review to generate a compliance report.'}
        </p>
        {!isAdminView && (
          <button 
            onClick={onNewReview}
            className="bg-[#005f6b] text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-[#004b54] transition-all hover:scale-105 active:scale-95"
          >
            Start First Audit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER & NEW AUDIT BUTTON */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {isAdminView ? 'Global Audit Registry' : 'My Audit History'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm font-bold text-slate-500">Managing {reports.length} records</p>
            {!isAdminView && (
              <span className="bg-[#005f6b]/10 text-[#005f6b] text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-widest border border-[#005f6b]/20">
                Private Session
              </span>
            )}
          </div>
        </div>
        
        {/* HIER IS DIE KNOPPIE WAT NIE GEWERK HET NIE - NOU GEKOPPEL AAN onNewReview */}
        <div className="flex gap-2">
           <button 
             onClick={onNewReview}
             className="bg-[#005f6b] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-[#005f6b]/20 hover:bg-[#004b54] transition-all active:scale-95 flex items-center gap-2"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
             New Audit
           </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('audits')}
          className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${activeTab === 'audits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Audit History
        </button>
        <button
          onClick={() => setActiveTab('advisers')}
          className={`px-5 py-2 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'advisers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Advisers
          {adviserSummaries.filter(a => a.overdueCount > 0).length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {adviserSummaries.filter(a => a.overdueCount > 0).length}
            </span>
          )}
        </button>
      </div>

      {/* FILTER SECTION + TABLE */}
      {activeTab === 'audits' && <><div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Search Inputs */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Search</label>
            <div className="space-y-2">
              <input placeholder="Rep Name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={inputStyles} />
              <input placeholder="Client Name..." value={searchClient} onChange={e => setSearchClient(e.target.value)} className={inputStyles} />
            </div>
          </div>

          {/* Score Range */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Score Range (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="0" min="0" max="100" value={minScore} onChange={e => setMinScore(e.target.value)} className={inputStyles} />
              <span className="text-slate-300 font-bold">-</span>
              <input type="number" placeholder="100" min="0" max="100" value={maxScore} onChange={e => setMaxScore(e.target.value)} className={inputStyles} />
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time Period</label>
            <div className="space-y-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputStyles} />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputStyles} />
            </div>
          </div>

          {/* Sorting & Clear */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)} className={inputStyles}>
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="score-desc">Highest Score</option>
              <option value="score-asc">Lowest Score</option>
            </select>
            <button onClick={resetFilters} className="w-full text-[10px] font-bold text-rose-500 hover:bg-rose-50 p-2 rounded-xl border border-rose-100 transition-colors uppercase tracking-widest">
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Date</th>
                {isAdminView && <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Auth</th>}
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Representative</th>
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Score</th>
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedReports.length === 0 ? (
                <tr>
                  <td colSpan={isAdminView ? 8 : 7} className="p-20 text-center">
                    <div className="text-slate-400 font-bold italic">No audits match your filters.</div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedReports.map((report) => {
                  const positiveCount = report.findings.filter(f => f.status === 'YES').length;
                  const total = report.findings.length;
                  const score = total > 0 ? Math.round((positiveCount / total) * 100) : 0;
                  const pendingActions = report.remedialActions ? report.remedialActions.filter(a => a.status === 'PENDING').length : 0;
                  const isCompleted = pendingActions === 0;
                  const auditDate = new Date(report.createdAt);
                  const followUpDate = new Date(auditDate.getTime() + 21 * 24 * 60 * 60 * 1000);
                  followUpDate.setHours(0, 0, 0, 0);
                  const isOverdue = !isCompleted && today > followUpDate;
                  const isApproaching = !isCompleted && !isOverdue && followUpDate <= sevenDaysFromNow;
                  return (
                    <tr key={report.id} onClick={() => onView(report)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors group">
                      <td className="p-5">
                        <div className="font-bold text-slate-700">{auditDate.toLocaleDateString()}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#005f6b]">
                          {report.iteration === 0 ? 'Initial' : `Follow-up ${report.iteration}`}
                        </div>
                      </td>
                      {isAdminView && (
                        <td className="p-5">
                          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded">
                            {getManagerLabel(report.createdByCodeId)}
                          </span>
                        </td>
                      )}
                      <td className="p-5">
                        <div className="font-extrabold text-slate-800">{report.metadata.representativeName}</div>
                      </td>
                      <td className="p-5">
                        <div className="text-sm font-semibold text-slate-600">{report.metadata.clientName}</div>
                        <div className="text-xs text-slate-400 font-mono">{report.metadata.policyNo}</div>
                      </td>
                      <td className="p-5 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-black ${score >= 90 ? 'bg-emerald-100 text-emerald-700' : score >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {score}%
                        </span>
                      </td>
                      <td className="p-5 text-center">
                        {isCompleted ? (
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Closed</span>
                        ) : (
                          <div className={`text-xs font-bold px-3 py-1 rounded-full inline-block border ${isOverdue ? 'bg-rose-50 text-rose-600 border-rose-100' : isApproaching ? 'bg-amber-50 text-amber-600 border-amber-100' : 'text-slate-500 border-slate-200'}`}>
                            {isOverdue ? 'OVERDUE' : 'OPEN'}
                          </div>
                        )}
                      </td>
                      <td className="p-5 text-right space-x-2">
                        {!isCompleted && !isAdminView && (
                          <button onClick={(e) => { e.stopPropagation(); onEdit(report); }} className="p-2 text-[#005f6b] hover:bg-teal-50 rounded-lg transition-all" title="Perform Follow-up Review">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onDelete(report.id); }} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>}

      {/* ADVISERS TAB */}
      {activeTab === 'advisers' && (
        <div className="space-y-4">
          {adviserSummaries.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-bold">No adviser data yet.</div>
          ) : (
            adviserSummaries.map((adviser) => {
              const isExpanded = expandedAdviser === adviser.name;
              const hasPending = adviser.pending.length > 0;
              return (
                <div key={adviser.name} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-all ${adviser.overdueCount > 0 ? 'border-rose-200' : hasPending ? 'border-amber-200' : 'border-slate-100'}`}>
                  {/* Adviser card header */}
                  <div className="flex items-center gap-4 p-6">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${adviser.overdueCount > 0 ? 'bg-rose-100 text-rose-700' : hasPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {adviser.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 truncate">{adviser.name}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs font-bold">
                        <span className="text-slate-400">{adviser.reports.length} audit{adviser.reports.length !== 1 ? 's' : ''}</span>
                        {hasPending ? (
                          <span className={adviser.overdueCount > 0 ? 'text-rose-500' : 'text-amber-500'}>
                            {adviser.pending.length} pending action{adviser.pending.length !== 1 ? 's' : ''}
                            {adviser.overdueCount > 0 && ` · ${adviser.overdueCount} overdue`}
                          </span>
                        ) : (
                          <span className="text-emerald-600">All clear</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasPending && (
                        <>
                          <button
                            onClick={() => handleCopyAdviser(adviser.name, adviser.reports)}
                            className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all uppercase tracking-wider ${copiedAdviser === adviser.name ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                          >
                            {copiedAdviser === adviser.name ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => handleEmailAdviser(adviser.name, adviser.reports)}
                            className="text-[10px] font-black px-3 py-1.5 rounded-xl bg-[#005f6b] text-white hover:bg-[#004b54] transition-all uppercase tracking-wider"
                          >
                            Email
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedAdviser(isExpanded ? null : adviser.name)}
                        className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded: pending actions grouped by report */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-6 pb-6 pt-4 space-y-4">
                      {!hasPending ? (
                        <p className="text-sm text-emerald-600 font-bold text-center py-4">No outstanding actions — this adviser is fully compliant.</p>
                      ) : (
                        adviser.reports
                          .filter(r => r.remedialActions.some(a => a.status === 'PENDING'))
                          .map(r => {
                            const pending = r.remedialActions.filter(a => a.status === 'PENDING');
                            return (
                              <div key={r.id} className="space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  <span>{r.metadata.clientName}</span>
                                  <span>·</span>
                                  <span className="font-mono">{r.metadata.policyNo || 'No Policy'}</span>
                                  <span>·</span>
                                  <span>Audit: {new Date(r.createdAt).toLocaleDateString()}</span>
                                </div>
                                {pending.map((action, i) => {
                                  const isActionOverdue = action.dueDate && new Date(action.dueDate) < todayDate;
                                  return (
                                    <div key={action.id} className={`flex gap-3 p-3 rounded-xl text-sm ${isActionOverdue ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50 border border-slate-100'}`}>
                                      <span className={`font-black shrink-0 ${isActionOverdue ? 'text-rose-400' : 'text-slate-300'}`}>{i + 1}.</span>
                                      <div className="flex-1">
                                        <p className="font-semibold text-slate-700 leading-snug">{action.description}</p>
                                        {action.dueDate && (
                                          <p className={`text-[10px] font-black uppercase tracking-wider mt-1 ${isActionOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
                                            Due: {new Date(action.dueDate).toLocaleDateString()}{isActionOverdue ? ' · OVERDUE' : ''}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default AuditHistory;

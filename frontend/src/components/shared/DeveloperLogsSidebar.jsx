import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getItemLogs } from '../../services/item.service';
import {
  Terminal, ChevronRight, ChevronLeft, Search, Copy, Download,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Server, Cpu, BookOpen,
  Activity, ArrowDownToLine, Check,
} from 'lucide-react';

/* ----------------------------------------------------------------------------
 * Developer Logs Sidebar
 *
 * Real-time, step-by-step visibility into the intake → grade pipeline. Renders
 * the unified itemLogs stream — backend (server) steps AND the ML service's
 * internal trace (image fetches, Bedrock attempts, vision calls) — as a
 * chronological, severity-coloured, phase-aware timeline.
 *
 * Two views:
 *   • Live      — the actual run for this item, polled every ~1.5s.
 *   • Reference — an annotated example of a *healthy* return cycle, so you can
 *                 compare "what I'm seeing" against "what should happen".
 * -------------------------------------------------------------------------- */

const POLL_INTERVAL = 1500;
const LOG_LIMIT_NOTE = 500;

// --- Severity styling -------------------------------------------------------
const LEVEL_META = {
  error: {
    text: 'text-red-300', dot: 'bg-red-500', border: 'border-l-red-500',
    bg: 'bg-red-500/10', chip: 'bg-red-500/20 text-red-300', label: 'ERROR',
  },
  warn: {
    text: 'text-amber-300', dot: 'bg-amber-400', border: 'border-l-amber-400',
    bg: 'bg-amber-400/5', chip: 'bg-amber-400/20 text-amber-300', label: 'WARN',
  },
  success: {
    text: 'text-emerald-300', dot: 'bg-emerald-400', border: 'border-l-emerald-500',
    bg: 'bg-transparent', chip: 'bg-emerald-500/20 text-emerald-300', label: 'OK',
  },
  debug: {
    text: 'text-zinc-500', dot: 'bg-zinc-600', border: 'border-l-zinc-700',
    bg: 'bg-transparent', chip: 'bg-zinc-700/40 text-zinc-400', label: 'DBG',
  },
  info: {
    text: 'text-sky-300', dot: 'bg-sky-400', border: 'border-l-sky-500/60',
    bg: 'bg-transparent', chip: 'bg-sky-500/20 text-sky-300', label: 'INFO',
  },
};

// --- Phase metadata (detailed) ---------------------------------------------
const PHASE_META = {
  init:      { label: 'Intake',   color: 'text-zinc-300' },
  trust:     { label: 'Trust',    color: 'text-violet-300' },
  pass1:     { label: 'Pass 1 · Form', color: 'text-cyan-300' },
  evidence:  { label: 'Evidence', color: 'text-teal-300' },
  request:   { label: 'ML Request', color: 'text-blue-300' },
  fraud:     { label: 'Fraud',    color: 'text-orange-300' },
  analysis:  { label: 'Analysis', color: 'text-indigo-300' },
  pass2:     { label: 'Pass 2 · Grade', color: 'text-fuchsia-300' },
  persist:   { label: 'Persist',  color: 'text-lime-300' },
  lifecycle: { label: 'Lifecycle', color: 'text-lime-300' },
  complete:  { label: 'Complete', color: 'text-emerald-300' },
  response:  { label: 'Result',   color: 'text-emerald-300' },
  error:     { label: 'Error',    color: 'text-red-300' },
  general:   { label: 'General',  color: 'text-zinc-400' },
};

// Macro phase tracker (the strip at the top).
const MACRO_PHASES = [
  { key: 'intake', label: 'Intake' },
  { key: 'trust', label: 'Trust' },
  { key: 'form', label: 'Form' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'grade', label: 'Grade' },
  { key: 'result', label: 'Result' },
];
const PHASE_TO_MACRO = {
  init: 'intake', trust: 'trust', pass1: 'form', evidence: 'evidence',
  request: 'analysis', fraud: 'analysis', analysis: 'analysis',
  pass2: 'grade', persist: 'result', lifecycle: 'result',
  complete: 'result', response: 'result', error: null, general: null,
};

// --- Healthy-cycle reference (what a clean return run looks like) ----------
const HEALTHY_CYCLE = [
  { phase: 'init', emoji: '🚀', t: 'Return initiated by user', d: 'Item record created; intake path + reason captured.' },
  { phase: 'trust', emoji: '✅', t: 'Trust tier resolved', d: 'e.g. STANDARD — gates how strict the flow is.' },
  { phase: 'pass1', emoji: '📝', t: 'Pass 1 form requested', d: 'Bedrock generates a tailored evidence form (or cache hit).' },
  { phase: 'pass1', emoji: '🤖', t: 'Bedrock Pass 1 responds', d: 'Model returns a form schema; cached for reuse.' },
  { phase: 'evidence', emoji: '📤', t: 'Evidence submitted', d: 'User uploads N photos to S3; status → EVIDENCE_PENDING.' },
  { phase: 'request', emoji: '📡', t: 'Grading request sent to ML', d: 'POST /grade/ with evidence + listing reference photos.' },
  { phase: 'request', emoji: '📥', t: 'Images fetched from S3', d: 'Each photo downloaded; size + type logged (no 403/404).' },
  { phase: 'fraud', emoji: '🛡️', t: 'Fraud preflight CLEAN', d: 'phash / EXIF / Rekognition show no hard signal.' },
  { phase: 'analysis', emoji: '🔬', t: 'Parallel analysis fan-out', d: 'OpenCV, CLIP, Rekognition, Textract run concurrently.' },
  { phase: 'analysis', emoji: '🏷️', t: 'Each analysis returns', d: 'Colour delta, similarity %, labels, OCR lines logged.' },
  { phase: 'pass2', emoji: '🤖', t: 'Bedrock Pass 2 synthesizes', d: 'Text summary → Nova Pro returns canonical Grade JSON.' },
  { phase: 'pass2', emoji: '🎯', t: 'Grade synthesized', d: 'e.g. Grade B, 78/100, confidence high, routing resell.' },
  { phase: 'persist', emoji: '💾', t: 'Grade persisted to MongoDB', d: 'Evidence bundle + prompts + analysis stored.' },
  { phase: 'persist', emoji: '⛓️', t: 'Lifecycle GRADED emitted', d: 'Tamper-evident event appended (Health Card chain).' },
  { phase: 'complete', emoji: '🎯', t: 'Grade assigned to item', d: 'Status GRADING → GRADED; grade linked.' },
  { phase: 'complete', emoji: '✨', t: 'Flow complete', d: 'Ready for routing. ~10–20s end to end.' },
];

// --- helpers ---------------------------------------------------------------
function levelOf(log) {
  return LEVEL_META[log?.level] ? log.level : 'info';
}
function phaseOf(log) {
  return PHASE_META[log?.phase] ? log.phase : 'general';
}
function fmtDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(2) : s.toFixed(1)}s`;
}
function latencyChipColor(ms) {
  if (ms == null) return '';
  if (ms < 800) return 'bg-emerald-500/15 text-emerald-300';
  if (ms < 4000) return 'bg-amber-400/15 text-amber-300';
  return 'bg-red-500/20 text-red-300';
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour12: false }); }
  catch { return ''; }
}

// --- Metadata block --------------------------------------------------------
function MetaBlock({ metadata, level }) {
  const [open, setOpen] = useState(level === 'error');
  if (!metadata || typeof metadata !== 'object') return null;

  const entries = Object.entries(metadata).filter(
    ([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'error'
  );
  const stack = typeof metadata.error === 'string' && metadata.error.length > 0 ? metadata.error : null;
  if (entries.length === 0 && !stack) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline decoration-dotted"
      >
        {open ? '▾ hide detail' : `▸ ${entries.length + (stack ? 1 : 0)} field(s)`}
      </button>
      {open && (
        <div className="mt-1 bg-black/50 border border-zinc-800 rounded p-2 space-y-0.5 text-[10.5px]">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-zinc-500 flex-shrink-0">{k}:</span>
              <span className="text-zinc-300 break-all">
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
          {stack && (
            <div className="mt-1">
              <div className="text-red-400/80 mb-0.5">error / stack:</div>
              <pre className="text-[10px] text-red-300/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {stack}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- A single log row ------------------------------------------------------
function LogRow({ log, showPhaseDivider }) {
  const level = levelOf(log);
  const meta = LEVEL_META[level];
  const phase = phaseOf(log);
  const isML = log.source === 'ml';
  const duration = fmtDuration(log.durationMs);

  return (
    <>
      {showPhaseDivider && (
        <div className="flex items-center gap-2 pt-2 pb-0.5 select-none">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${PHASE_META[phase].color}`}>
            {PHASE_META[phase].label}
          </span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>
      )}
      <div className={`group flex gap-2 items-start border-l-2 pl-2 py-1 rounded-r ${meta.border} ${meta.bg}`}>
        <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-bold px-1 py-px rounded ${meta.chip}`}>{meta.label}</span>
            <span
              className={`text-[8px] font-bold px-1 rounded ${isML ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-zinc-700/50 text-zinc-400'}`}
              title={isML ? 'Emitted by the ML / FastAPI service' : 'Emitted by the backend'}
            >
              {isML ? 'ML' : 'SRV'}
            </span>
            <span className={`font-semibold text-[10.5px] ${meta.text}`}>{log.step.replace(/_/g, ' ')}</span>
            {duration && (
              <span className={`text-[9px] font-mono px-1 rounded ${latencyChipColor(log.durationMs)}`}>
                {duration}
              </span>
            )}
          </div>
          <div className="text-zinc-300 mt-0.5 break-words whitespace-pre-wrap leading-snug">{log.message}</div>
          <MetaBlock metadata={log.metadata} level={level} />
          <div className="text-zinc-600 text-[9px] mt-0.5">{fmtTime(log.timestamp)}</div>
        </div>
      </div>
    </>
  );
}

// --- Macro phase tracker ---------------------------------------------------
function PhaseTracker({ logs, running }) {
  const { reached, errored, current } = useMemo(() => {
    const reachedSet = new Set();
    const errSet = new Set();
    let cur = null;
    for (const l of logs) {
      const macro = PHASE_TO_MACRO[phaseOf(l)];
      if (!macro) continue;
      reachedSet.add(macro);
      cur = macro;
      if (levelOf(l) === 'error') errSet.add(macro);
    }
    return { reached: reachedSet, errored: errSet, current: cur };
  }, [logs]);

  return (
    <div className="flex flex-wrap gap-1">
      {MACRO_PHASES.map((p, i) => {
        const isReached = reached.has(p.key);
        const isError = errored.has(p.key);
        const isCurrent = running && current === p.key;
        let cls = 'bg-zinc-800/60 text-zinc-600';
        if (isError) cls = 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40';
        else if (isCurrent) cls = 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50 animate-pulse';
        else if (isReached) cls = 'bg-emerald-500/15 text-emerald-300';
        return (
          <span key={p.key} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
            {i + 1}.{p.label}
          </span>
        );
      })}
    </div>
  );
}

// --- Run summary -----------------------------------------------------------
function useRunSummary(logs) {
  return useMemo(() => {
    const errorCount = logs.filter((l) => levelOf(l) === 'error').length;
    const warnCount = logs.filter((l) => levelOf(l) === 'warn').length;
    const steps = new Set(logs.map((l) => l.step));
    const rejected = steps.has('GRADE_REJECTED');
    const completed = steps.has('FLOW_COMPLETE') || steps.has('GRADE_ASSIGNED');
    const flagged = steps.has('REVIEW_FLAGGED');
    const running = logs.length > 0 && !completed && !rejected;

    let status = 'idle';
    if (rejected) status = 'rejected';
    else if (completed && errorCount > 0) status = 'degraded';
    else if (completed && flagged) status = 'review';
    else if (completed) status = 'complete';
    else if (running) status = 'running';

    // Model + grade extraction.
    let model = null;
    let grade = null;
    let score = null;
    for (const l of logs) {
      const m = l.metadata || {};
      if (m.model_id && l.level === 'success') model = m.model_id;
      if (!model && m.pass2Model) model = m.pass2Model;
      if (m.grade && (l.step === 'GRADE_ASSIGNED' || l.step === 'PERSIST_GRADE' || l.step === 'PASS2_GRADE')) {
        grade = m.grade;
        if (m.qualityScore != null) score = m.qualityScore;
        if (m.quality_score != null) score = m.quality_score;
      }
    }

    let elapsed = null;
    if (logs.length >= 2) {
      const t0 = new Date(logs[0].timestamp).getTime();
      const t1 = new Date(logs[logs.length - 1].timestamp).getTime();
      if (!Number.isNaN(t0) && !Number.isNaN(t1)) elapsed = t1 - t0;
    }

    return { errorCount, warnCount, status, model, grade, score, elapsed, running };
  }, [logs]);
}

const STATUS_META = {
  idle: { label: 'Idle', cls: 'bg-zinc-700 text-zinc-300', Icon: Activity },
  running: { label: 'Running…', cls: 'bg-blue-500/20 text-blue-300', Icon: Loader2, spin: true },
  complete: { label: 'Completed', cls: 'bg-emerald-500/20 text-emerald-300', Icon: CheckCircle2 },
  degraded: { label: 'Completed w/ errors', cls: 'bg-amber-400/20 text-amber-300', Icon: AlertTriangle },
  review: { label: 'Needs review', cls: 'bg-amber-400/20 text-amber-300', Icon: AlertTriangle },
  rejected: { label: 'Rejected', cls: 'bg-red-500/20 text-red-300', Icon: XCircle },
};

function SummaryBar({ summary }) {
  const s = STATUS_META[summary.status] || STATUS_META.idle;
  const { Icon } = s;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${s.cls}`}>
          <Icon className={`w-3 h-3 ${s.spin ? 'animate-spin' : ''}`} />
          {s.label}
        </span>
        {summary.elapsed != null && (
          <span className="text-[10px] text-zinc-400 font-mono">⏱ {fmtDuration(summary.elapsed)}</span>
        )}
        {summary.grade && (
          <span className="text-[10px] font-bold px-1.5 rounded bg-fuchsia-500/20 text-fuchsia-300">
            Grade {summary.grade}{summary.score != null ? ` · ${summary.score}/100` : ''}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        {summary.errorCount > 0 && (
          <span className="font-bold px-1.5 rounded bg-red-500/20 text-red-300">{summary.errorCount} error(s)</span>
        )}
        {summary.warnCount > 0 && (
          <span className="font-bold px-1.5 rounded bg-amber-400/20 text-amber-300">{summary.warnCount} warning(s)</span>
        )}
        {summary.model && (
          <span className="text-zinc-400 font-mono truncate" title={summary.model}>🤖 {summary.model}</span>
        )}
      </div>
    </div>
  );
}

// --- Reference (healthy cycle) panel ---------------------------------------
function ReferencePanel() {
  return (
    <div className="p-3 space-y-2 text-[11px]">
      <div className="text-zinc-400 leading-snug">
        This is what a <span className="text-emerald-300 font-semibold">healthy return cycle</span> looks like, in
        order. Compare it against the <span className="text-blue-300 font-semibold">Live</span> tab to spot exactly
        where a run diverges or stalls.
      </div>
      <div className="space-y-1.5 mt-2">
        {HEALTHY_CYCLE.map((step, i) => (
          <div key={i} className="flex gap-2 items-start border-l-2 border-l-emerald-500/40 pl-2 py-0.5">
            <span className="text-sm leading-none mt-0.5">{step.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold uppercase px-1 rounded bg-zinc-800 ${PHASE_META[step.phase]?.color || 'text-zinc-400'}`}>
                  {PHASE_META[step.phase]?.label || step.phase}
                </span>
                <span className="text-zinc-200 font-semibold">{step.t}</span>
              </div>
              <div className="text-zinc-500 mt-0.5 leading-snug">{step.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 leading-snug">
        <span className="text-amber-300 font-semibold">Red rows</span> in Live mean a step failed — the most common
        culprits are <span className="text-zinc-300">image fetch 403/404</span> (expired S3 URL) and
        <span className="text-zinc-300"> Bedrock AccessDenied / ValidationException</span> (model not enabled, or
        sent without required images). The exact cause now appears inline.
      </div>
    </div>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'key', label: 'Key' },
  { key: 'warn', label: 'Warn+' },
  { key: 'errors', label: 'Errors' },
];

/**
 * DeveloperLogsSidebar — real-time flow visibility for an item's pipeline.
 */
export default function DeveloperLogsSidebar({ itemId }) {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(true);
  const [view, setView] = useState('live'); // 'live' | 'reference'
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [autoFollow, setAutoFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);

  const summary = useRunSummary(logs);

  // --- polling ---
  useEffect(() => {
    if (!itemId) return undefined;
    let active = true;
    const fetchLogs = async () => {
      try {
        const res = await getItemLogs(itemId);
        if (active && res.success) setLogs(res.data.logs || []);
      } catch {
        /* keep last logs on transient failure */
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, [itemId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  useEffect(() => {
    if (autoFollow && pinnedRef.current && scrollRef.current && view === 'live') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoFollow, view]);

  // --- filtering ---
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      const lvl = levelOf(log);
      if (filter === 'errors' && lvl !== 'error') return false;
      if (filter === 'warn' && lvl !== 'error' && lvl !== 'warn') return false;
      if (filter === 'key' && lvl === 'debug') return false;
      if (q) {
        const hay = `${log.step} ${log.message} ${log.phase || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, filter, query]);

  const copyAll = useCallback(() => {
    const text = filtered
      .map((l) => {
        const dur = l.durationMs != null ? ` (${fmtDuration(l.durationMs)})` : '';
        return `[${fmtTime(l.timestamp)}] [${levelOf(l).toUpperCase()}] [${phaseOf(l)}/${l.source || 'server'}] ${l.step}: ${l.message}${dur}`;
      })
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [filtered]);

  const downloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `item-${itemId}-logs.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, itemId]);

  const firstError = useMemo(() => filtered.find((l) => levelOf(l) === 'error'), [filtered]);

  return (
    <div
      className={`hidden lg:flex flex-col bg-zinc-950 text-zinc-100 border-l border-zinc-800 transition-all duration-300 sticky top-0 h-screen ${
        isOpen ? 'w-[30rem]' : 'w-12'
      }`}
    >
      {/* Toggle */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="absolute -left-3 top-6 w-6 h-6 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center shadow-lg z-10 border border-zinc-700"
        title={isOpen ? 'Collapse logs' : 'Expand logs'}
      >
        {isOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {!isOpen ? (
        <div className="flex flex-col items-center pt-6 gap-2">
          <Terminal className="w-5 h-5 text-[#FF9900]" />
          {summary.errorCount > 0 && (
            <span className="text-[9px] font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              {summary.errorCount}
            </span>
          )}
          {summary.running && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-3 border-b border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#FF9900]" />
                <h3 className="text-sm font-bold">Developer Logs</h3>
              </div>
              {/* View switch */}
              <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
                <button
                  onClick={() => setView('live')}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    view === 'live' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Activity className="w-3 h-3" /> Live
                </button>
                <button
                  onClick={() => setView('reference')}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    view === 'reference' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <BookOpen className="w-3 h-3" /> Reference
                </button>
              </div>
            </div>

            {view === 'live' && (
              <>
                <SummaryBar summary={summary} />
                <PhaseTracker logs={logs} running={summary.running} />

                {/* Controls */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search step / message / phase…"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-7 pr-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-0.5 bg-zinc-900 rounded-lg p-0.5 flex-1">
                      {FILTERS.map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setFilter(f.key)}
                          className={`flex-1 text-[10px] font-semibold py-0.5 rounded-md transition-colors ${
                            filter === f.key ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setAutoFollow((a) => !a)}
                      title="Auto-scroll to newest"
                      className={`p-1 rounded ${autoFollow ? 'text-[#FF9900]' : 'text-zinc-600 hover:text-zinc-300'}`}
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={copyAll} title="Copy logs" className="p-1 rounded text-zinc-500 hover:text-zinc-200">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={downloadJson} title="Download JSON" className="p-1 rounded text-zinc-500 hover:text-zinc-200">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Error spotlight */}
                {firstError && (
                  <button
                    onClick={() => {
                      const el = document.getElementById(`log-${firstError._id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="w-full text-left flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-md p-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-red-300">
                        {summary.errorCount} error{summary.errorCount === 1 ? '' : 's'} in this run — click to jump
                      </div>
                      <div className="text-[10px] text-red-200/80 truncate">{firstError.message}</div>
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Body */}
          {view === 'reference' ? (
            <div className="flex-1 overflow-y-auto">
              <ReferencePanel />
            </div>
          ) : (
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px]"
            >
              {filtered.length === 0 ? (
                <div className="text-zinc-600 text-center mt-8 text-xs">
                  {logs.length === 0
                    ? 'No logs yet. Start a return or listing to watch the pipeline run.'
                    : 'No logs match this filter.'}
                </div>
              ) : (
                filtered.map((log, idx) => (
                  <div id={`log-${log._id || idx}`} key={log._id || idx}>
                    <LogRow
                      log={log}
                      showPhaseDivider={idx === 0 || phaseOf(filtered[idx - 1]) !== phaseOf(log)}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 flex items-center justify-between">
            <span>
              {view === 'live'
                ? `${filtered.length}/${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`
                : `${HEALTHY_CYCLE.length}-step reference`}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><Server className="w-3 h-3" /> backend</span>
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> ML trace</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

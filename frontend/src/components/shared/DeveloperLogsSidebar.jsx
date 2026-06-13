import { useState, useEffect, useRef } from 'react';
import { getItemLogs } from '../../services/item.service';
import { Terminal, ChevronRight, ChevronLeft } from 'lucide-react';

const STEP_ICONS = {
  INITIATE: '🚀',
  TRUST_START: '🔍',
  TRUST_COMPLETE: '✅',
  ITEM_CREATED: '✅',
  PASS1_START: '📝',
  PASS1_BEDROCK: '🤖',
  PASS1_COMPLETE: '✅',
  EVIDENCE_SUBMIT: '📤',
  PHOTO_UPLOAD: '📸',
  GRADING_REQUEST: '📡',
  PASS2_START: '⚙️',
  FRAUD_CHECK: '🛡️',
  FRAUD_RESULT: '🛡️',
  FRAUD_DETECTED: '⚠️',
  FRAUD_PASS: '✅',
  ANALYSIS_PARALLEL: '🔬',
  ANALYSIS_OPENCV: '🎨',
  ANALYSIS_CLIP: '🧠',
  ANALYSIS_REKOGNITION: '🏷️',
  ANALYSIS_TEXTRACT: '🔤',
  ANALYSIS_COMPLETE: '✅',
  ANALYSIS_WARNING: '⚠️',
  PASS2_BEDROCK: '🤖',
  MODEL_INVOKE: '🤖',
  GRADE_ASSIGNED: '🎯',
  GRADE_REJECTED: '🚫',
  REVIEW_FLAGGED: '⚠️',
  ML_UNAVAILABLE: '🔌',
  ML_INVALID_RESPONSE: '⚠️',
  LIFECYCLE_EMIT: '⛓️',
  STATUS_UPDATE: '📊',
  FLOW_COMPLETE: '✨',
  ERROR: '❌',
};

const POLL_INTERVAL = 2000;

/**
 * Renders structured metadata as a compact, collapsible technical block.
 * Skips noisy/internal keys and pretty-prints nested objects.
 */
function LogMetadata({ metadata }) {
  const [open, setOpen] = useState(false);
  if (!metadata || typeof metadata !== 'object') return null;

  const entries = Object.entries(metadata).filter(
    ([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'error'
  );
  const hasStack = typeof metadata.error === 'string' && metadata.error.length > 0;
  if (entries.length === 0 && !hasStack) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline decoration-dotted"
      >
        {open ? '▾ hide detail' : '▸ detail'}
      </button>
      {open && (
        <div className="mt-1 bg-black/40 border border-zinc-800 rounded p-2 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-zinc-500 flex-shrink-0">{k}:</span>
              <span className="text-zinc-300 break-all">
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
          {hasStack && (
            <pre className="text-[10px] text-red-300/80 whitespace-pre-wrap break-all mt-1 max-h-40 overflow-y-auto">
              {metadata.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function stepColor(step) {
  if (step.includes('ERROR') || step.includes('REJECTED')) return 'text-red-400';
  if (step.includes('COMPLETE') || step === 'FRAUD_PASS' || step.includes('ASSIGNED')) return 'text-emerald-400';
  if (step.includes('START') || step.includes('PENDING') || step.includes('BEDROCK')) return 'text-blue-400';
  if (step.includes('FRAUD_DETECTED') || step.includes('FLAGGED') || step.includes('WARNING')) return 'text-orange-400';
  return 'text-zinc-300';
}

const LEVELS = [
  { key: 'all', label: 'All' },
  { key: 'key', label: 'Key Steps' },
  { key: 'errors', label: 'Errors' },
];

/**
 * DeveloperLogsSidebar — Phase 3.5 real-time flow visibility.
 * Polls GET /api/items/:itemId/logs every 2s and renders plain-English logs.
 */
export default function DeveloperLogsSidebar({ itemId }) {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(true);
  const [level, setLevel] = useState('all');
  const scrollRef = useRef(null);
  const pinnedToBottomRef = useRef(true);

  // Track whether the user is scrolled (near) the bottom. Only then do we auto-follow.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 48;
  };

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
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [itemId]);

  // Auto-follow new logs ONLY when the user is already pinned to the bottom.
  useEffect(() => {
    if (pinnedToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = logs.filter((log) => {
    if (level === 'errors') return log.step.includes('ERROR') || log.step.includes('REJECTED');
    if (level === 'key') {
      return (
        log.step.includes('COMPLETE') ||
        log.step.includes('ASSIGNED') ||
        log.step.includes('START') ||
        log.step === 'INITIATE' ||
        log.step.includes('REJECTED')
      );
    }
    return true;
  });

  return (
    <div
      className={`hidden lg:flex flex-col bg-zinc-950 text-zinc-100 border-l border-zinc-800 transition-all duration-300 sticky top-0 h-screen ${
        isOpen ? 'w-96' : 'w-12'
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
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#FF9900]" />
              <h3 className="text-sm font-bold">Developer Logs</h3>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Real-time flow visibility</p>
            <div className="flex gap-1 mt-3 bg-zinc-900 rounded-lg p-1">
              {LEVELS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLevel(l.key)}
                  className={`flex-1 text-[11px] font-semibold py-1 rounded-md transition-colors ${
                    level === l.key ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logs */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-[11px]"
          >
            {filtered.length === 0 ? (
              <div className="text-zinc-600 text-center mt-8 text-xs">
                No logs yet. Start a return or listing.
              </div>
            ) : (
              filtered.map((log, idx) => (
                <div key={log._id || idx} className="flex gap-2 items-start">
                  <span className="text-sm flex-shrink-0 leading-none mt-0.5">
                    {STEP_ICONS[log.step] || '•'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold ${stepColor(log.step)}`}>
                      {log.step.replace(/_/g, ' ')}
                    </div>
                    <div className="text-zinc-400 mt-0.5 break-words whitespace-pre-wrap">{log.message}</div>
                    <LogMetadata metadata={log.metadata} />
                    <div className="text-zinc-600 mt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-zinc-800 text-[11px] text-zinc-600">
            {filtered.length} log {filtered.length === 1 ? 'entry' : 'entries'}
          </div>
        </>
      )}
    </div>
  );
}

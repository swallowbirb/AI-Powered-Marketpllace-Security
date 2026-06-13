import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getItemById } from '../services/item.service';
import { Loader2, CheckCircle2, Clock, AlertCircle, Recycle, ShoppingBag, Package } from 'lucide-react';

const STEPS = [
  { key: 'INITIATED', label: 'Initiated', icon: Package },
  { key: 'EVIDENCE_PENDING', label: 'Evidence', icon: Clock },
  { key: 'GRADING', label: 'AI Grading', icon: Recycle },
  { key: 'GRADED', label: 'Graded', icon: CheckCircle2 },
  { key: 'ROUTED', label: 'Routed', icon: ShoppingBag },
];

const STATUS_ORDER = ['INITIATED', 'EVIDENCE_PENDING', 'GRADING', 'GRADED', 'ROUTED', 'IN_TRANSIT', 'LISTED', 'SOLD', 'DONATED', 'LIQUIDATED'];

const TERMINAL = ['SOLD', 'DONATED', 'LIQUIDATED', 'REJECTED', 'CANCELLED'];
const POLLING_INTERVAL = 4000;

export default function ItemStatusPage() {
  const { itemId } = useParams();
  const location = useLocation();
  const intakePath = location.state?.intakePath || 'return';
  const productTitle = location.state?.productTitle || 'Your item';

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItem = async () => {
    try {
      const res = await getItemById(itemId);
      if (res.success) setItem(res.data);
    } catch {
      setError('Could not load item status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItem();
    // Poll while item is in progress
    const interval = setInterval(() => {
      if (item && !TERMINAL.includes(item.status) && item.status !== 'LISTED') {
        fetchItem();
      }
    }, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [itemId, item?.status]);

  const currentStepIdx = item ? STATUS_ORDER.indexOf(item.status) : 0;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-600">{error}</p>
        <Link to="/orders" className="mt-4 inline-block text-sm text-[#FF9900] underline">Back to orders</Link>
      </div>
    );
  }

  const label = intakePath === 'sell-used' ? 'Sell Used' : 'Return';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 font-sans">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className="uppercase tracking-widest font-semibold text-[#FF9900]">{label}</span>
          <span>/</span>
          <span>Status</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900">{productTitle}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Current status: <span className="font-semibold text-gray-800">{item?.status?.replace('_', ' ')}</span>
        </p>
      </motion.div>

      {/* Step tracker */}
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-100 z-0" />

        <div className="relative z-10 flex justify-between">
          {STEPS.map((step, i) => {
            const stepIdx = STATUS_ORDER.indexOf(step.key);
            const done = currentStepIdx > stepIdx;
            const active = currentStepIdx === stepIdx;
            const Icon = step.icon;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex flex-col items-center gap-2"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${done ? 'bg-emerald-500 border-emerald-500 text-white'
                    : active ? 'bg-[#FF9900] border-[#FF9900] text-black'
                    : 'bg-white border-gray-200 text-gray-300'}`}
                >
                  {active && !TERMINAL.includes(item?.status) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : done ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span className={`text-[10px] font-semibold text-center leading-tight w-14
                  ${done ? 'text-emerald-600' : active ? 'text-[#FF9900]' : 'text-gray-300'}`}
                >
                  {step.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Status message card */}
      <motion.div
        key={item?.status}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-10 bg-gray-50 border border-gray-200 rounded-2xl p-6"
      >
        {item?.status === 'GRADING' && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Recycle className="w-5 h-5 text-[#FF9900]" />
              </div>
              <div>
                <p className="font-bold text-gray-900">AI grading in progress</p>
                <p className="text-xs text-gray-500">Usually completes in 10–20 seconds</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Our AI is analysing your photos to objectively grade the item's condition.
              This page will update automatically.
            </p>
          </>
        )}
        {item?.status === 'INITIATED' && (
          <p className="text-sm text-gray-600">Your {label.toLowerCase()} has been initiated. Upload your evidence photos to continue.</p>
        )}
        {item?.status === 'EVIDENCE_PENDING' && (
          <p className="text-sm text-gray-600">Photos received. Preparing grading...</p>
        )}
        {item?.status === 'GRADED' && (
          <p className="text-sm text-gray-600">Grading complete! The routing engine is deciding the best path for your item.</p>
        )}
        {item?.status === 'ROUTED' && (
          <p className="text-sm text-gray-600">A disposition path has been chosen for your item. More details coming soon.</p>
        )}
      </motion.div>

      {/* Item ID reference */}
      <p className="text-xs text-gray-300 text-center mt-6">Item ID: {itemId}</p>
    </div>
  );
}

import { ShieldCheck, Shield, ShieldAlert, ShieldX, Eye } from 'lucide-react';

/**
 * Phase 3.5 — Trust tier visibility. Maps a trust tier to a badge + meaning.
 */
const TIER_META = {
  verified: {
    label: 'Verified',
    icon: ShieldCheck,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    tooltip: 'Trusted account. Your return is fast-tracked with an abbreviated evidence flow.',
    message: 'Your return is fast-tracked. Refund will be issued shortly.',
  },
  trusted: {
    label: 'Trusted',
    icon: Shield,
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    tooltip: 'Good standing. Standard flow, fast-tracked through routing.',
    message: 'Your return is being processed.',
  },
  standard: {
    label: 'Standard',
    icon: Shield,
    classes: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    tooltip: 'Default flow. Standard evidence and review.',
    message: 'Your return is under review.',
  },
  watch: {
    label: 'Watch',
    icon: Eye,
    classes: 'bg-orange-50 text-orange-700 border-orange-200',
    tooltip: 'Extra verification is required. Refund is withheld until grading clears.',
    message: 'Additional verification required. Refund will be issued after grading completes.',
  },
  restricted: {
    label: 'Restricted',
    icon: ShieldX,
    classes: 'bg-red-50 text-red-700 border-red-200',
    tooltip: 'Manual review only. This item requires in-person inspection.',
    message: 'This return requires manual inspection.',
  },
};

export function getTierMeta(tier) {
  return TIER_META[tier] || TIER_META.standard;
}

export default function TrustTierBadge({ tier, showMessage = false, className = '' }) {
  if (!tier) return null;
  const meta = getTierMeta(tier);
  const Icon = meta.icon;

  return (
    <div className={className}>
      <span
        title={meta.tooltip}
        className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.classes}`}
      >
        <Icon className="w-3.5 h-3.5" />
        Trust Tier: {meta.label}
      </span>
      {showMessage && (
        <p className="text-xs text-gray-500 mt-2">{meta.message}</p>
      )}
    </div>
  );
}

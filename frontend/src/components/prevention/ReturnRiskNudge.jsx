import { useEffect, useState } from 'react';
import { getCheckoutRisk, updateNudgeEvent } from '../../services/prevention.service';

/**
 * <ReturnRiskNudge items onContinue onAdjust /> — Phase 7 §9.3
 *
 * Drops into a checkout / Buy Now confirm flow. Calls /checkout-risk before
 * finalising the order. If basketRisk !== 'low' AND there's an actionable
 * intervention, renders a non-blocking banner with a concrete CTA.
 *
 * Never blocks the buyer — `onContinue` always proceeds with the purchase.
 * Logs the nudge outcome via PATCH /nudge-event/:id when the buyer acts.
 *
 * Props:
 *   items:       [{ productId, quantity, sizeAdjusted? }]
 *   onContinue:  () => void   — buyer chose to proceed despite the nudge
 *   onAdjust:    (action) => void  — buyer chose to follow the suggestion
 *                                    (action: 'SIZE_UP' | 'SIZE_DOWN' | 'KEEP_ONE')
 *   children:    optional fallback render when nothing to show
 */

const NUDGE_LABELS = {
  FIT_NUDGE: 'Fit hint',
  INFO_NUDGE: 'Heads up',
  BRACKETING_NUDGE: 'About your basket',
  COOLING_OFF: 'Heads up',
  CONFIDENCE_BOOST: 'Looking good',
};

export default function ReturnRiskNudge({ items, onContinue, onAdjust, children }) {
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acted, setActed] = useState(false);

  useEffect(() => {
    if (!items || items.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCheckoutRisk(items)
      .then((data) => {
        if (!cancelled) setRisk(data);
      })
      .catch(() => {
        if (!cancelled) setRisk(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(items || [])]);

  if (loading) return null;
  if (!risk || !risk.items || risk.items.length === 0) return children || null;

  // Show only the worst-band item that has a non-NONE intervention.
  const order = { high: 3, medium: 2, low: 1 };
  const candidates = risk.items.filter(
    (i) => i.intervention && i.intervention.type && i.intervention.type !== 'NONE'
  );
  if (candidates.length === 0) return children || null;
  const focus = candidates.sort(
    (a, b) => (order[b.riskBand] || 0) - (order[a.riskBand] || 0)
  )[0];

  const interventionType = focus.intervention.type;

  const accent =
    interventionType === 'CONFIDENCE_BOOST'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : focus.riskBand === 'high'
      ? 'border-orange-300 bg-orange-50 text-orange-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';

  const titleColor =
    interventionType === 'CONFIDENCE_BOOST' ? 'text-emerald-800' : 'text-amber-800';

  // Build human messages
  const headline = NUDGE_LABELS[interventionType] || 'Heads up';
  const lines = [];
  const ctas = [];

  if (interventionType === 'FIT_NUDGE') {
    if (focus.fit?.message) lines.push(focus.fit.message);
    if (focus.intervention.action === 'SIZE_UP') {
      ctas.push({
        label: 'Pick a larger size',
        action: () => {
          markActed(focus.nudgeEventId);
          onAdjust?.('SIZE_UP');
        },
      });
    } else if (focus.intervention.action === 'SIZE_DOWN') {
      ctas.push({
        label: 'Pick a smaller size',
        action: () => {
          markActed(focus.nudgeEventId);
          onAdjust?.('SIZE_DOWN');
        },
      });
    }
  } else if (interventionType === 'BRACKETING_NUDGE') {
    lines.push(
      "You've added multiple of the same item. Most shoppers keep one — want the recommended size only?"
    );
    ctas.push({
      label: 'Keep one, remove extras',
      action: () => {
        markActed(focus.nudgeEventId);
        onAdjust?.('KEEP_ONE');
      },
    });
  } else if (interventionType === 'INFO_NUDGE') {
    if (focus.topReasons && focus.topReasons.length) {
      lines.push(focus.topReasons[0].message);
    } else {
      lines.push('This item is more commonly returned than average.');
    }
  } else if (interventionType === 'CONFIDENCE_BOOST') {
    lines.push("This is a low-risk purchase. We'll process your refund instantly if needed.");
  } else if (interventionType === 'COOLING_OFF') {
    lines.push(
      `Refund will be processed after grading clears (~${risk.coolingOffHours || 36}h cooling-off).`
    );
  }

  if (risk.refundTiming === 'delayed' && interventionType !== 'CONFIDENCE_BOOST') {
    lines.push(
      `Note: refunds for high-risk baskets are processed ~${risk.coolingOffHours || 36}h after item grading clears.`
    );
  }

  return (
    <div
      className={`my-4 rounded-lg border p-4 text-sm ${accent}`}
      role="alert"
      aria-live="polite"
    >
      <div className={`mb-1 font-semibold ${titleColor}`}>{headline}</div>
      <ul className="space-y-1">
        {lines.map((l, idx) => (
          <li key={idx}>{l}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {ctas.map((c, idx) => (
          <button
            key={idx}
            type="button"
            onClick={c.action}
            disabled={acted}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            // mark NOT acted but proceeded — analytics will pick this up via the recompute job
            onContinue?.();
          }}
          className="rounded-md border border-current px-3 py-1.5 text-xs font-medium hover:bg-white/40"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );

  function markActed(nudgeEventId) {
    setActed(true);
    if (nudgeEventId) {
      updateNudgeEvent(nudgeEventId, { acted: true }).catch(() => {});
    }
  }
}

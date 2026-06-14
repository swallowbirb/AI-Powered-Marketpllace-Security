import { useEffect, useState } from 'react';
import { getSellerInsights } from '../../services/prevention.service';

/**
 * <ReturnInsightsPanel /> — Phase 7 §9.5
 *
 * Drops onto the seller dashboard. For each of the seller's SKUs, shows:
 *   - return rate
 *   - dominant reason
 *   - fit / compat / dimension verdict (whichever applies)
 *   - nightly cached LLM summary sentence (if generated)
 *   - before/after rate-change indicator (§17 — positive reinforcement)
 */

const DIRECTION_BADGES = {
  improved: { label: '↓ improved', cls: 'text-emerald-700 bg-emerald-100' },
  worsened: { label: '↑ worsened', cls: 'text-red-700 bg-red-100' },
  stable:   { label: '— stable',   cls: 'text-zinc-700 bg-zinc-100' },
};

export default function ReturnInsightsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSellerInsights()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="text-sm text-zinc-500">Loading return insights…</div>;
  if (error) return <div className="text-sm text-red-600">Couldn't load insights: {error}</div>;
  if (!data || !data.items || data.items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        No return insights yet. Run the prevention recompute job after orders/returns accumulate.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Return insights</h3>
      <div className="space-y-2">
        {data.items.map((item) => {
          const rate =
            item.returnRate == null
              ? null
              : `${(item.returnRate * 100).toFixed(1)}%`;
          const direction = DIRECTION_BADGES[item.rateChangeDirection];
          const verdicts = [
            item.fitVerdict && item.fitVerdict !== 'unknown' ? `fit: ${item.fitVerdict.replace(/_/g, ' ')}` : null,
            item.compatVerdict === 'issues_reported' ? 'compat: issues reported' : null,
            item.dimensionVerdict && !['unknown', 'no_issues'].includes(item.dimensionVerdict)
              ? `dim: ${item.dimensionVerdict.replace(/_/g, ' ')}`
              : null,
          ].filter(Boolean);

          return (
            <div
              key={item.productId}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-medium">{item.title}</div>
                {direction && (
                  <span className={`rounded px-2 py-0.5 text-xs ${direction.cls}`}>
                    {direction.label}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{item.category}</div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat label="Sold" value={item.unitsSold ?? 0} />
                <Stat label="Returned" value={item.unitsReturned ?? 0} />
                <Stat
                  label="Return rate"
                  value={rate || '—'}
                  emphasis={(item.returnRate || 0) >= 0.20 ? 'warn' : null}
                />
                <Stat
                  label="Top reason"
                  value={item.dominantReason ? item.dominantReason.replace(/_/g, ' ') : '—'}
                />
              </div>

              {verdicts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {verdicts.map((v) => (
                    <span
                      key={v}
                      className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}

              {item.sellerSummary && (
                <p className="mt-2 rounded-md bg-zinc-50 p-2 text-sm italic text-zinc-700">
                  💡 {item.sellerSummary}
                </p>
              )}

              {direction?.label === '↓ improved' && item.previousReturnRate30d != null && (
                <p className="mt-2 text-xs text-emerald-700">
                  ✅ Return rate dropped from{' '}
                  {(item.previousReturnRate30d * 100).toFixed(0)}% to{' '}
                  {((item.returnRate || 0) * 100).toFixed(0)}% over the last 30 days.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }) {
  const cls =
    emphasis === 'warn'
      ? 'text-orange-700 font-semibold'
      : 'text-zinc-900 font-medium';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={cls}>{value}</div>
    </div>
  );
}

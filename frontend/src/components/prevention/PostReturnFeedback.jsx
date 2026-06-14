import { useEffect, useState } from 'react';
import { getPostReturnMessage } from '../../services/prevention.service';

/**
 * <PostReturnFeedback userId productId /> — Phase 7 §16
 *
 * Drops onto the return confirmation/success page. If the buyer was shown a
 * nudge and ignored it, surfaces a brief, non-accusatory learning moment
 * pointing them to the fit hint / return insights for next time.
 *
 * Renders nothing when no relevant nudge event was found.
 */

export default function PostReturnFeedback({ userId, productId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!userId || !productId) return;
    let cancelled = false;
    getPostReturnMessage(userId, productId)
      .then((d) => {
        if (!cancelled && d && d.message) setData(d);
      })
      .catch(() => {
        // silent — feedback is purely additive
      });
    return () => {
      cancelled = true;
    };
  }, [userId, productId]);

  if (!data) return null;

  return (
    <div
      className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
      role="note"
    >
      <div className="mb-1 font-semibold text-sky-800">A small tip for next time</div>
      <p>{data.message}</p>
    </div>
  );
}

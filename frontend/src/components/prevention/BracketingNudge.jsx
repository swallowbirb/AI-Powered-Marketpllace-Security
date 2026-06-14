import { useCart } from '../../context/CartContext';

/**
 * <BracketingNudge productId /> — Phase 7 §9.4
 *
 * Reads the client-side cart. If the user has added the same productId
 * multiple times (or multiple variants), shows a non-blocking nudge with
 * a one-tap "Keep one, remove extras" CTA.
 *
 * Detection is identical to the backend's detectBracketingIntent so the UI
 * and the scorecard agree on what counts as bracketing.
 */

export default function BracketingNudge({ productId }) {
  const { cart, keepOneOf } = useCart();

  const sameProduct = cart.filter((i) => i.productId === productId);
  const totalQty = sameProduct.reduce((n, i) => n + (i.quantity || 1), 0);

  if (sameProduct.length <= 1 && totalQty <= 1) return null;

  return (
    <div
      className="my-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
      role="alert"
    >
      <div className="mb-1 font-semibold text-blue-800">📐 About your basket</div>
      <p>
        You've added {totalQty} of this item. Most shoppers keep just one — try the
        recommended size first to save on shipping and returns.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => keepOneOf(productId)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Keep one, remove extras
        </button>
      </div>
    </div>
  );
}

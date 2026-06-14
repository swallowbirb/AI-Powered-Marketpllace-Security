import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, X, ShieldCheck, Lock, Package } from 'lucide-react';

/**
 * CheckoutModal — reusable for both single-product (Buy Now) and cart checkout.
 *
 * Single product:  pass `productTitle` + `price`
 * Cart:            pass `items` = [{ title, price, quantity }] — renders a line-item summary
 *
 * Either way calls `onConfirm(mockCreditCard)` when the buyer submits.
 */
export default function CheckoutModal({
  isOpen,
  onClose,
  onConfirm,
  // Single-product props
  productTitle,
  price,
  // Cart props
  items,
  // Shared
  isProcessing,
}) {
  const [creditCard, setCreditCard] = useState('');
  const [error, setError] = useState('');

  const isCartMode = Array.isArray(items) && items.length > 0;

  const total = isCartMode
    ? items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)
    : price || 0;

  const itemCount = isCartMode
    ? items.reduce((sum, i) => sum + (i.quantity || 1), 0)
    : 1;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!creditCard.trim()) {
      setError('Please enter a mock credit card number.');
      return;
    }
    setError('');
    onConfirm(creditCard);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="checkout-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#f3f3f3] border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-gray-500" /> Secure Checkout
              </h2>
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="text-gray-500 hover:text-gray-900 p-1 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Order summary */}
              <div className="mb-6">
                {isCartMode ? (
                  <>
                    <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" /> {itemCount} item{itemCount !== 1 ? 's' : ''} in your order
                    </p>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {items.map((item, i) => (
                        <li key={i} className="flex justify-between text-sm text-gray-700">
                          <span className="line-clamp-1 flex-1 mr-2">
                            <span className="text-gray-400 mr-1">×{item.quantity}</span>
                            {item.title}
                          </span>
                          <span className="font-medium flex-shrink-0">
                            ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-xl font-bold text-[#B12704]">${total.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-1">Purchasing:</p>
                    <p className="font-medium text-gray-900 line-clamp-2 leading-tight">{productTitle}</p>
                    <p className="text-xl font-bold text-[#B12704] mt-2">${total.toFixed(2)}</p>
                  </>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="creditCard" className="block text-sm font-bold text-gray-700 mb-1">
                    Mock Credit Card Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CreditCard className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="creditCard"
                      value={creditCard}
                      onChange={(e) => setCreditCard(e.target.value)}
                      placeholder="e.g. 4111 1111 1111 1111"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-[#FF9900] focus:border-[#FF9900] sm:text-sm transition-colors text-gray-900"
                      disabled={isProcessing}
                    />
                  </div>
                  {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    This is a secure, mock environment. Any input will simulate a successful purchase instantly without charging you.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center px-4 py-2 text-sm font-bold text-black bg-[#FF9900] border border-transparent rounded-md hover:bg-[#FFB347] transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin w-4 h-4 border-2 border-black/30 border-t-black rounded-full inline-block" />
                        Processing
                      </span>
                    ) : (
                      `Confirm Purchase • $${total.toFixed(2)}`
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

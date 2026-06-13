import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getBuyerOrders } from '../services/order.service';
import { initiateReturn } from '../services/return.service';
import { Package, Loader2, Calendar, CreditCard, ChevronRight, RotateCcw, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const REASON_OPTIONS = [
  { value: 'defective', label: 'Item is defective or broken' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'other', label: 'Other' },
];

export default function BuyerOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [returnModal, setReturnModal] = useState(null); // { order }
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [returnError, setReturnError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await getBuyerOrders(1, 50);
        if (res.success) {
          setOrders(res.data.orders);
        }
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const openReturnModal = (order) => {
    setReturnModal({ order });
    setReasonCode('');
    setReasonText('');
    setReturnError(null);
  };

  const closeReturnModal = () => {
    setReturnModal(null);
    setReturnError(null);
  };

  const handleInitiateReturn = async () => {
    if (!reasonCode) { setReturnError('Please select a reason.'); return; }
    setSubmitting(true);
    setReturnError(null);
    try {
      const res = await initiateReturn({
        orderId: returnModal.order._id,
        reasonCode,
        reasonText,
      });
      if (res.success) {
        const isCatalog = !!returnModal.order.catalogEntryId;
        const productTitle = isCatalog
          ? returnModal.order.catalogEntryId?.title
          : returnModal.order.productId?.title;
        closeReturnModal();
        navigate(`/items/${res.data.itemId}/evidence`, {
          state: { intakePath: 'return', productTitle },
        });
      }
    } catch (err) {
      setReturnError(err.response?.data?.message || 'Failed to initiate return.');
    } finally {
      setSubmitting(false);
    }
  };
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 mb-2">Your Orders</h1>
        <p className="text-sm text-gray-600">Track and view your recent purchases.</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No orders yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            You haven't placed any orders yet. Discover great products from verified brands and trusted sellers.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-[#FF9900] hover:bg-[#FFB347] text-black font-bold px-6 py-2.5 rounded-xl transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const isCatalogOrder = !!order.catalogEntryId;
            const itemTitle = isCatalogOrder ? order.catalogEntryId?.title : order.productId?.title;
            const itemImage = isCatalogOrder 
              ? order.catalogEntryId?.officialImages?.[0] 
              : order.productId?.images?.[0];
            const itemLink = isCatalogOrder 
              ? `/p/${order.catalogEntryId?._id}` 
              : `/products/${order.productId?._id}`;
            const sellerName = order.sellerId?.storeName || `${order.sellerId?.firstName} ${order.sellerId?.lastName}`.trim();

            return (
              <div key={order._id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex flex-wrap gap-6 items-center justify-between text-sm">
                  <div className="flex gap-6">
                    <div>
                      <p className="text-gray-500 mb-0.5">ORDER PLACED</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {new Date(order.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5">TOTAL</p>
                      <p className="font-medium text-gray-900">${order.totalPrice.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-right flex-1 sm:flex-none">
                    <p className="text-gray-500 mb-0.5">ORDER # {order._id.slice(-8).toUpperCase()}</p>
                    <Link to={itemLink} className="text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-0.5">
                      View details <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="font-bold text-emerald-600 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> Delivered instantly
                  </h3>

                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 p-2 overflow-hidden border border-gray-200">
                      {itemImage ? (
                        <img src={itemImage} alt={itemTitle} className="w-full h-full object-contain mix-blend-multiply" />
                      ) : (
                        <Package className="w-8 h-8 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <Link to={itemLink} className="text-lg font-bold text-gray-900 hover:text-blue-600 hover:underline line-clamp-2 leading-tight mb-2">
                        {itemTitle}
                      </Link>
                      <p className="text-sm text-gray-600 mb-1">
                        Sold by: <span className="font-medium text-gray-900">{sellerName}</span>
                      </p>
                      <p className="text-sm text-gray-600 mb-3">
                        Quantity: <span className="font-medium text-gray-900">{order.quantity}</span>
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          to={itemLink}
                          className="inline-flex items-center justify-center bg-[#FF9900] hover:bg-[#FFB347] text-black font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
                        >
                          Buy it again
                        </Link>
                        <Link
                          to={`${itemLink}#reviews`}
                          className="inline-flex items-center justify-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
                        >
                          Write a product review
                        </Link>
                        <button
                          onClick={() => openReturnModal(order)}
                          className="inline-flex items-center gap-1.5 justify-center bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Return item
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Payment summary footer */}
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  Paid with mock card ending in {order.paymentDetails?.mockCreditCard?.slice(-4) || '****'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Return Modal */}
    <AnimatePresence>
      {returnModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeReturnModal}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-[#FF9900]" />
                <h2 className="text-lg font-black text-gray-900">Initiate Return</h2>
              </div>
              <button onClick={closeReturnModal} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for return *</label>
              <div className="relative">
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-[#FF9900] focus:border-transparent"
                >
                  <option value="">Select a reason…</option>
                  {REASON_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Additional details <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF9900] resize-none"
              />
            </div>

            {returnError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4">{returnError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeReturnModal}
                className="flex-1 border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateReturn}
                disabled={submitting}
                className="flex-1 bg-[#FF9900] hover:bg-[#FFB347] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors inline-flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? 'Starting…' : 'Continue to Photos'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBuyerOrders } from '../services/order.service';
import { Package, Loader2, Calendar, CreditCard, ChevronRight } from 'lucide-react';

export default function BuyerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
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
  );
}

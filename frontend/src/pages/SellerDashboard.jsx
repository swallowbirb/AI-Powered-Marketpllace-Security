import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getSellerProducts, deleteProduct } from '../services/product.service';
import { getSellerEnrollments, requestEnrollment } from '../services/brand.service';
import { getMyOffers, deleteOffer, updateOffer } from '../services/offer.service';
import {
  PlusCircle, Package, Activity, AlertTriangle, CheckCircle, Clock,
  AlertCircle, Shield, Tag, ChevronRight, Loader2, Store, Users,
  ShoppingBag, Zap, ExternalLink, Trash2, ToggleLeft, ToggleRight, X,
} from 'lucide-react';
import { useCustomUser } from '../context/CustomUserContext';

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'published':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><CheckCircle className="w-3 h-3" /> Published</span>;
    case 'approved':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle className="w-3 h-3" /> Approved</span>;
    case 'pending_review':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20"><Clock className="w-3 h-3" /> Pending Review</span>;
    case 'pending':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"><Clock className="w-3 h-3" /> Pending</span>;
    case 'flagged':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20"><AlertTriangle className="w-3 h-3" /> Flagged</span>;
    case 'rejected':
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><AlertTriangle className="w-3 h-3" /> Rejected</span>;
    default:
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">Unknown</span>;
  }
};

const EnrollmentBadge = ({ status }) => {
  if (!status) return <span className="text-xs text-zinc-500">Not Applied</span>;
  const styles = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const icons = {
    pending: <Clock className="w-3 h-3" />,
    approved: <CheckCircle className="w-3 h-3" />,
    rejected: <AlertTriangle className="w-3 h-3" />,
  };
  const label = { pending: 'Pending Review', approved: 'Approved', rejected: 'Rejected' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {icons[status]} {label[status]}
    </span>
  );
};

const TABS = [
  { id: 'listings', label: 'My Listings', icon: Package },
  { id: 'offers', label: 'My Offers', icon: ShoppingBag },
  { id: 'brands', label: 'Brand Authorization', icon: Tag },
];

const SellerDashboard = () => {
  const [activeTab, setActiveTab] = useState('listings');
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [offers, setOffers] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [applyingId, setApplyingId] = useState(null);
  const [applyError, setApplyError] = useState('');
  const [showListingModal, setShowListingModal] = useState(false);
  const navigate = useNavigate();
  const { mongoUser } = useCustomUser();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await getSellerProducts();
        if (response.success) setProducts(response.data);
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  // Load brands when tab is switched to 'brands'
  useEffect(() => {
    if (activeTab !== 'brands' || brands.length > 0) return;
    const fetchBrands = async () => {
      setIsLoadingBrands(true);
      try {
        const res = await getSellerEnrollments();
        if (res.success) setBrands(res.data);
      } catch (err) {
        console.error('Failed to fetch brands:', err);
      } finally {
        setIsLoadingBrands(false);
      }
    };
    fetchBrands();
  }, [activeTab]);

  // Load offers when tab is switched to 'offers'
  useEffect(() => {
    if (activeTab !== 'offers' || offers.length > 0) return;
    const fetchOffers = async () => {
      setIsLoadingOffers(true);
      try {
        const res = await getMyOffers();
        if (res.success) setOffers(res.data);
      } catch (err) {
        console.error('Failed to fetch offers:', err);
      } finally {
        setIsLoadingOffers(false);
      }
    };
    fetchOffers();
  }, [activeTab]);

  const handleRequestEnrollment = async (brandId) => {
    setApplyingId(brandId);
    setApplyError('');
    try {
      await requestEnrollment(brandId);
      setBrands((prev) =>
        prev.map((b) =>
          b._id === brandId ? { ...b, enrollmentStatus: 'pending' } : b
        )
      );
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to apply';
      setApplyError(msg);
    } finally {
      setApplyingId(null);
    }
  };

  const handleToggleOffer = async (offer) => {
    const newStatus = offer.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await updateOffer(offer._id, { status: newStatus });
      if (res.success) {
        setOffers((prev) => prev.map((o) => o._id === offer._id ? { ...o, status: newStatus, isBuyBoxWinner: res.data.isBuyBoxWinner } : o));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOffer = async (offerId) => {
    if (!confirm('Remove this offer?')) return;
    try {
      await deleteOffer(offerId);
      setOffers((prev) => prev.filter((o) => o._id !== offerId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm('Are you sure you want to permanently delete this listing?')) return;
    try {
      const res = await deleteProduct(productId);
      if (res.success) {
        setProducts((prev) => prev.filter((p) => p._id !== productId));
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  const approvedBrandsCount = brands.filter((b) => b.enrollmentStatus === 'approved').length;
  const pendingBrandsCount = brands.filter((b) => b.enrollmentStatus === 'pending').length;
  const activeOffersCount = offers.filter((o) => o.status === 'active').length;
  const buyBoxCount = offers.filter((o) => o.isBuyBoxWinner).length;

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* New Listing Choice Modal */}
        <AnimatePresence>
          {showListingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Create New Listing</h2>
                    <p className="text-sm text-zinc-500 mt-0.5">Choose your listing type</p>
                  </div>
                  <button onClick={() => setShowListingModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Catalog path */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setShowListingModal(false); navigate('/seller/new-offer'); }}
                    className="w-full text-left bg-[#FF9900]/5 border border-[#FF9900]/30 hover:border-[#FF9900]/60 rounded-2xl p-5 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#FF9900]/10 border border-[#FF9900]/20 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-6 h-6 text-[#FF9900]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white group-hover:text-[#FF9900] transition-colors flex items-center gap-2">
                          List on an Existing Brand Product
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-normal">Recommended</span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                          Compete for the Buy Box on a brand's official catalog entry.
                          Product title, images, and description are inherited from the brand — fully authorized.
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-[#FF9900] transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </motion.button>

                  {/* Standalone path */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setShowListingModal(false); navigate('/seller/new-product'); }}
                    className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-5 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Package className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white group-hover:text-zinc-200 transition-colors">Create an Independent Listing</p>
                        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                          List a product with your own title, images, and description.
                          If you claim a registered brand name, your listing will be automatically
                          cross-referenced against that brand's official catalog.
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Seller Dashboard
            </h1>
            <p className="text-zinc-400 mt-1">Manage your listings and brand authorizations.</p>
          </div>
          <button
            onClick={() => setShowListingModal(true)}
            className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-full font-medium hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
          >
            <PlusCircle className="w-5 h-5" />
            New Listing
          </button>
        </motion.div>

        {/* Suspension Notice */}
        {mongoUser?.suspended && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Account Suspended</p>
              <p className="text-xs text-amber-400/80 mt-0.5">Your seller account has been temporarily suspended. You cannot create new listings until this is resolved. Please contact support for more information.</p>
            </div>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Listings', value: products.length, icon: Package, color: 'text-blue-400' },
            { label: 'Active Offers', value: offers.length > 0 ? activeOffersCount : '—', icon: ShoppingBag, color: 'text-[#FF9900]' },
            { label: 'Buy Box Wins', value: buyBoxCount || '—', icon: Zap, color: 'text-emerald-400' },
            { label: 'Flagged Issues', value: products.filter((p) => p.status === 'flagged').length, icon: AlertTriangle, color: 'text-rose-400' },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex items-center justify-between"
            >
              <div>
                <p className="text-sm text-zinc-400 font-medium">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-full bg-zinc-800/50 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.id === 'brands' && pendingBrandsCount > 0 && (
                <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingBrandsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'listings' && (
            <motion.div
              key="listings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-zinc-400" />
                  Recent Listings
                </h2>
              </div>

              <div className="overflow-x-auto">
                {isLoadingProducts ? (
                  <div className="p-8 text-center text-zinc-500">Loading products...</div>
                ) : products.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-zinc-500" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-1">No products yet</h3>
                    <p className="text-zinc-400 mb-6">Start by creating your first listing.</p>
                    <button
                      onClick={() => navigate('/seller/new-product')}
                      className="text-sm bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-full transition-colors"
                    >
                      Create Listing
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-900/50 text-sm text-zinc-400 border-b border-zinc-800">
                        <th className="p-4 font-medium">Product</th>
                        <th className="p-4 font-medium">Category</th>
                        <th className="p-4 font-medium">Price</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          key={product._id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                        >
                          <td className="p-4">
                            <p className="font-medium text-zinc-200">{product.title}</p>
                            {product.brandName && (
                              <p className="text-xs text-zinc-500 mt-0.5">Brand: {product.brandName}</p>
                            )}
                          </td>
                          <td className="p-4 text-xs text-zinc-400">{product.category || '—'}</td>
                          <td className="p-4 text-zinc-300 font-medium">${product.price.toFixed(2)}</td>
                          <td className="p-4">
                            <StatusBadge status={product.status} />
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end items-center gap-3">
                              <button
                                onClick={() => navigate(`/seller/edit-product/${product._id}`)}
                                className="text-sm text-zinc-400 hover:text-white transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product._id)}
                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                title="Delete listing"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          )}
          {activeTab === 'offers' && (
            <motion.div
              key="offers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="bg-[#FF9900]/5 border border-[#FF9900]/20 rounded-2xl p-4 flex items-start gap-3">
                <Zap className="w-5 h-5 text-[#FF9900] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#FF9900]">Catalog Offers</p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    These are your offers on brand catalog entries. The Buy Box is awarded to the lowest-price active offer.
                    Toggle offers inactive without deleting them, or remove permanently.
                  </p>
                </div>
              </div>

              {isLoadingOffers ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : offers.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                  <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold mb-2">No Catalog Offers Yet</h3>
                  <p className="text-zinc-400 text-sm mb-6">Create offers on brand catalog entries to compete for the Buy Box.</p>
                  <button
                    onClick={() => { setShowListingModal(true); }}
                    className="inline-flex items-center gap-2 bg-[#FF9900] text-black text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#FFB347] transition-colors"
                  >
                    <Zap className="w-4 h-4" /> Create First Offer
                  </button>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-800">
                    <h2 className="font-bold text-lg">My Catalog Offers ({offers.length})</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">{activeOffersCount} active · {buyBoxCount} Buy Box win{buyBoxCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-800/50 text-xs text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3 font-medium">Product</th>
                          <th className="px-4 py-3 font-medium">Your Price</th>
                          <th className="px-4 py-3 font-medium">Buy Box</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offers.map((offer) => (
                          <motion.tr
                            key={offer._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`border-b border-zinc-800/50 transition-colors ${
                              offer.isBuyBoxWinner ? 'bg-[#FF9900]/3' : 'hover:bg-zinc-800/20'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <Link
                                to={`/p/${offer.catalogEntryId?._id}`}
                                className="font-medium text-sm text-zinc-200 hover:text-[#FF9900] transition-colors flex items-center gap-1 group"
                              >
                                {offer.catalogEntryId?.title || 'Unknown product'}
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold text-white">${offer.price.toFixed(2)}</span>
                            </td>

                            <td className="px-4 py-3">
                              {offer.isBuyBoxWinner ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-[#FF9900]/10 text-[#FF9900] border border-[#FF9900]/20 px-2 py-0.5 rounded-full font-bold">
                                  <Zap className="w-3 h-3" /> Winner
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                offer.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                                offer.status === 'flagged' ? 'bg-red-500/10 text-red-400' :
                                'bg-zinc-700 text-zinc-400'
                              }`}>
                                {offer.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleToggleOffer(offer)}
                                  title={offer.status === 'active' ? 'Deactivate' : 'Activate'}
                                  className="text-zinc-500 hover:text-white transition-colors"
                                >
                                  {offer.status === 'active'
                                    ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                                    : <ToggleLeft className="w-5 h-5" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteOffer(offer._id)}
                                  className="text-zinc-500 hover:text-red-400 transition-colors"
                                  title="Remove offer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}


          {activeTab === 'brands' && (
            <motion.div
              key="brands"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Info banner */}
              <div className="bg-[#FF9900]/5 border border-[#FF9900]/20 rounded-2xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#FF9900] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#FF9900]">Brand Authorization</p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Request enrollment from a registered brand to become an authorized reseller. 
                    Approved sellers can list brand products without triggering the AI counterfeit honeypot. 
                    Brand owners review and approve requests manually.
                  </p>
                </div>
              </div>

              {applyError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm"
                >
                  {applyError}
                </motion.div>
              )}

              {isLoadingBrands ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : brands.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                  <Users className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold mb-2">No Brands Registered</h3>
                  <p className="text-zinc-400 text-sm">No brands have been registered on the platform yet.</p>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-800">
                    <h2 className="font-bold text-lg">Registered Brands ({brands.length})</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {approvedBrandsCount} authorized · {pendingBrandsCount} pending
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-800/50 text-xs text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3 font-medium">Brand</th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Protected Keywords</th>
                          <th className="px-4 py-3 font-medium">Authorization Status</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brands.map((brand) => (
                          <motion.tr
                            key={brand._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {brand.logoUrl ? (
                                  <img src={brand.logoUrl} alt={brand.name} className="w-8 h-8 rounded object-contain bg-white p-0.5" />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-[#FF9900] flex items-center justify-center text-black font-bold text-xs flex-shrink-0">
                                    {brand.name?.[0]?.toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-sm">{brand.name}</p>
                                  {brand.isVerified && (
                                    <p className="text-[10px] text-emerald-400">✓ Verified</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400">
                              {brand.category || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {brand.protectedKeywords?.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {brand.protectedKeywords.slice(0, 3).map((kw) => (
                                    <span key={kw} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                                      {kw}
                                    </span>
                                  ))}
                                  {brand.protectedKeywords.length > 3 && (
                                    <span className="text-[10px] text-zinc-500">+{brand.protectedKeywords.length - 3}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <EnrollmentBadge status={brand.enrollmentStatus} />
                            </td>
                            <td className="px-4 py-3">
                              {!brand.enrollmentStatus ? (
                                <button
                                  disabled={applyingId === brand._id}
                                  onClick={() => handleRequestEnrollment(brand._id)}
                                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {applyingId === brand._id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                  Request Auth
                                </button>
                              ) : brand.enrollmentStatus === 'rejected' ? (
                                <button
                                  disabled={applyingId === brand._id}
                                  onClick={() => handleRequestEnrollment(brand._id)}
                                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  Re-apply
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-600">—</span>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SellerDashboard;

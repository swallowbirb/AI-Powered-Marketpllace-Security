const Product = require('./product.model');

const createProduct = async (productData) => {
  const product = new Product(productData);
  return await product.save();
};

const getProductsBySeller = async (sellerId) => {
  return await Product.find({ sellerId }).sort({ createdAt: -1 }).lean();
};

const SellerOffer = require('../offers/sellerOffer.model');

const getAllPublishedProducts = async () => {
  const products = await Product.find({
    status: { $in: ['published', 'approved', 'pending_review'] },
    banned: false,
    suspended: false,
  })
    .populate('sellerId', 'firstName lastName storeName averageRating')
    .sort({ createdAt: -1 })
    .lean();

  const buyBoxOffers = await SellerOffer.find({ status: 'active', isBuyBoxWinner: true })
    .populate('catalogEntryId', 'title officialImages category tags createdAt activeOfferCount')
    .populate('sellerId', 'firstName lastName storeName averageRating')
    .lean();

  const catalogProducts = buyBoxOffers
    .filter(offer => offer.catalogEntryId)
    .map(offer => ({
      _id: offer.catalogEntryId._id,
      isCatalogEntry: true,
      title: offer.catalogEntryId.title,
      price: offer.price,
      category: offer.catalogEntryId.category,
      images: offer.catalogEntryId.officialImages,
      sellerId: offer.sellerId,
      averageRating: 0,
      reviewCount: 0,
      createdAt: offer.catalogEntryId.createdAt
    }));

  const combined = [...products, ...catalogProducts].sort((a, b) => b.createdAt - a.createdAt);
  return combined;
};

const getProductById = async (productId) => {
  return await Product.findById(productId)
    .populate('sellerId', 'firstName lastName storeName averageRating totalReviewsReceived createdAt')
    .populate('brandId', 'name logoUrl')
    .populate('claimedCatalogEntryId', 'title sku officialImages brandId')
    .lean();
};

const updateProduct = async (productId, sellerId, updateData) => {
  return await Product.findOneAndUpdate(
    { _id: productId, sellerId },
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();
};

const deleteProduct = async (productId, sellerId) => {
  return await Product.findOneAndDelete({ _id: productId, sellerId }).lean();
};

/**
 * Search products with text query, category filter, price range, rating filter.
 * Returns paginated results for the Search Results page.
 */
const searchProducts = async (filters = {}, page = 1, limit = 20) => {
  const query = {
    status: { $in: ['published', 'approved', 'pending_review'] },
    banned: false,
    suspended: false,
  };

  const catalogQuery = {
    isActive: true,
    activeOfferCount: { $gt: 0 }
  };

  if (filters.q) {
    query.$or = [
      { title: new RegExp(filters.q, 'i') },
      { description: new RegExp(filters.q, 'i') },
      { brandName: new RegExp(filters.q, 'i') },
    ];
    catalogQuery.$or = [
      { title: new RegExp(filters.q, 'i') },
      { description: new RegExp(filters.q, 'i') },
      { tags: new RegExp(filters.q, 'i') },
    ];
  }

  if (filters.brandName) {
    query.brandName = new RegExp(filters.brandName, 'i');
  }

  if (filters.category) {
    query.category = new RegExp(filters.category, 'i');
    catalogQuery.category = new RegExp(filters.category, 'i');
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.price = {};
    if (filters.minPrice !== undefined) query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice !== undefined) query.price.$lte = Number(filters.maxPrice);
  }

  if (filters.minRating !== undefined) {
    query.averageRating = { $gte: Number(filters.minRating) };
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { averageRating: -1 },
    popularity: { totalSales: -1 },
  };
  const sort = sortOptions[filters.sort] || sortOptions.newest;

  const [products] = await Promise.all([
    Product.find(query)
      .populate('sellerId', 'firstName lastName storeName averageRating')
      .lean()
  ]);

  // For catalog entries, we first find matching entries, then find their buy box offers
  const matchingCatalogEntries = await require('../brandCatalog/brandCatalogEntry.model').find(catalogQuery).lean();
  const catalogEntryIds = matchingCatalogEntries.map(e => e._id);
  
  let buyBoxOffers = [];
  if (catalogEntryIds.length > 0) {
    buyBoxOffers = await SellerOffer.find({ 
      catalogEntryId: { $in: catalogEntryIds },
      status: 'active', 
      isBuyBoxWinner: true 
    })
      .populate('catalogEntryId', 'title officialImages category tags createdAt activeOfferCount')
      .populate('sellerId', 'firstName lastName storeName averageRating')
      .lean();
  }

  let catalogProducts = buyBoxOffers
    .filter(offer => offer.catalogEntryId)
    .map(offer => ({
      _id: offer.catalogEntryId._id,
      isCatalogEntry: true,
      title: offer.catalogEntryId.title,
      price: offer.price,
      category: offer.catalogEntryId.category,
      images: offer.catalogEntryId.officialImages,
      sellerId: offer.sellerId,
      averageRating: 0,
      reviewCount: 0,
      createdAt: offer.catalogEntryId.createdAt
    }));

  // Apply price filter to catalog products manually if needed since we couldn't query price directly on catalog entry
  if (filters.minPrice !== undefined) {
    catalogProducts = catalogProducts.filter(p => p.price >= Number(filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    catalogProducts = catalogProducts.filter(p => p.price <= Number(filters.maxPrice));
  }

  let combined = [...products, ...catalogProducts];

  // Manual sort
  if (filters.sort === 'price_asc') combined.sort((a, b) => a.price - b.price);
  else if (filters.sort === 'price_desc') combined.sort((a, b) => b.price - a.price);
  else if (filters.sort === 'rating') combined.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
  else if (filters.sort === 'popularity') combined.sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0));
  else combined.sort((a, b) => b.createdAt - a.createdAt);

  const total = combined.length;
  const skip = (page - 1) * limit;
  const paginated = combined.slice(skip, skip + limit);

  return { products: paginated, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get all products for a specific seller's public store page.
 */
const getPublishedProductsBySeller = async (sellerId) => {
  return await Product.find({
    sellerId,
    status: { $in: ['published', 'approved'] },
    banned: false,
    suspended: false,
  })
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  createProduct,
  getProductsBySeller,
  getAllPublishedProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProducts,
  getPublishedProductsBySeller,
};

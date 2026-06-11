const axios = require('axios');
const User = require('../users/user.model');
const Brand = require('../brands/brand.model');
const BrandCatalogEntry = require('../brandCatalog/brandCatalogEntry.model');
const SellerOffer = require('../offers/sellerOffer.model');
const Product = require('../products/product.model');
const Order = require('../orders/order.model');
const Review = require('../reviews/review.model');
const BrandEnrollment = require('../brands/brandEnrollment.model');

// Erase all data except base mock users
const eraseData = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' });
    }

    // Erase content collections
    await Brand.deleteMany({});
    await BrandCatalogEntry.deleteMany({});
    await SellerOffer.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await Review.deleteMany({});
    await BrandEnrollment.deleteMany({});

    // Erase users that are not base dev users
    await User.deleteMany({ clerkId: { $not: /^mock_/ } });

    res.status(200).json({ success: true, message: 'All data erased except base dev users.' });
  } catch (error) {
    next(error);
  }
};

// Populate data from FakeStoreAPI
const populateData = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' });
    }

    // Find the mock seller to assign products to
    const seller = await User.findOne({ clerkId: 'mock_seller' });
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Mock seller not found. Cannot populate.' });
    }

    // Fetch from FakeStoreAPI
    const response = await axios.get('https://fakestoreapi.com/products');
    const fakeProducts = response.data;

    const productsToInsert = fakeProducts.map((p) => ({
      title: p.title,
      description: p.description,
      price: p.price,
      category: p.category,
      images: [p.image],
      brandName: '', // Unbranded
      sellerId: seller._id,
      status: 'approved',
      condition: 'New'
    }));

    await Product.insertMany(productsToInsert);

    res.status(200).json({ 
      success: true, 
      message: `Successfully populated ${productsToInsert.length} products from FakeStoreAPI.` 
    });
  } catch (error) {
    next(error);
  }
};

// Save a JSON snapshot of the DB
const saveData = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' });
    }

    // Query all collections
    const [
      users, brands, brandCatalogEntries,
      sellerOffers, products, orders,
      reviews, brandEnrollments
    ] = await Promise.all([
      User.find({}).lean(),
      Brand.find({}).lean(),
      BrandCatalogEntry.find({}).lean(),
      SellerOffer.find({}).lean(),
      Product.find({}).lean(),
      Order.find({}).lean(),
      Review.find({}).lean(),
      BrandEnrollment.find({}).lean(),
    ]);

    const snapshot = {
      timestamp: new Date().toISOString(),
      data: {
        users,
        brands,
        brandCatalogEntries,
        sellerOffers,
        products,
        orders,
        reviews,
        brandEnrollments
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=marketplace-snapshot.json');
    res.status(200).send(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  eraseData,
  populateData,
  saveData
};

const axios = require('axios');
const Product = require('../modules/products/product.model');
const Brand = require('../modules/brands/brand.model');
const BrandCatalogEntry = require('../modules/brandCatalog/brandCatalogEntry.model');

const FASTAPI_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Asynchronously analyze a product listing using the FastAPI ML service.
 * @param {string} productId - The ID of the product to analyze.
 */
const analyzeProductListing = async (productId) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      console.error(`AI Pipeline Error: Product ${productId} not found.`);
      return;
    }

    // Only analyze if brandName is provided
    if (!product.brandName) {
      // No brand claim, low risk by default for this vector
      await Product.findByIdAndUpdate(productId, {
        productRS: 0,
        riskLevel: 'low',
        status: 'approved'
      });
      return;
    }

    // Gather all registered brands and their catalog entries for the category
    // In a huge DB, we'd filter by category or run text search. For MVP, we fetch all.
    const brands = await Brand.find().lean();
    
    // Fetch catalog entries for these brands
    const brandPayloads = await Promise.all(brands.map(async (brand) => {
      const entries = await BrandCatalogEntry.find({ brandId: brand._id }).lean();
      return {
        id: brand._id.toString(),
        name: brand.name,
        protectedKeywords: brand.protectedKeywords || [],
        catalogEntries: entries.map(e => ({
          id: e._id.toString(),
          title: e.title,
          description: e.description,
          officialImages: e.officialImages || []
        }))
      };
    }));

    const payload = {
      productId: product._id.toString(),
      title: product.title,
      description: product.description,
      brandName: product.brandName,
      images: product.images || [],
      category: product.category,
      brands: brandPayloads
    };

    console.log(`Sending product ${productId} to FastAPI for analysis...`);
    const response = await axios.post(`${FASTAPI_URL}/ml/analyze-product`, payload);
    const result = response.data;
    
    console.log(`AI Analysis complete for ${productId}:`, result);

    // Default to 'approved' for low risk
    let newStatus = 'approved';
    if (result.riskLevel === 'high') {
      newStatus = 'suspended'; // Suspend counterfeit attempts immediately
    } else if (result.riskLevel === 'medium') {
      newStatus = 'flagged';   // Flag for brand/admin review
    }

    // Update the product with the ML results
    await Product.findByIdAndUpdate(productId, {
      productRS: result.productRS,
      riskLevel: result.riskLevel,
      brandId: result.matchedBrandId || null,
      claimedCatalogEntryId: result.matchedCatalogEntryId || null,
      catalogMatchScore: result.catalogMatchScore || null,
      status: newStatus
    });

  } catch (error) {
    console.error(`AI Pipeline Error for product ${productId}:`, error.message);
    // On ML server failure, we can flag the product as pending_review or fallback to approved
    // We'll leave it in pending_review if the server is unreachable
  }
};

module.exports = {
  analyzeProductListing
};

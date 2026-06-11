const mongoose = require('mongoose');
const productService = require('./src/modules/products/product.service');
const Product = require('./src/modules/products/product.model');
const User = require('./src/modules/users/user.model');

mongoose.connect('mongodb://localhost:27017/ai_marketplace_dev', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log("Connected to MongoDB.");
  
  // Create a mock seller if doesn't exist
  let seller = await User.findOne({ role: 'seller' });
  if (!seller) {
    seller = await User.create({
      clerkId: 'test_seller_123',
      role: 'seller',
      email: 'seller@test.com',
      firstName: 'Test',
      lastName: 'Seller',
      storeName: 'Test Store'
    });
  }

  const productData = {
    title: 'Test Generic Desk',
    description: 'A generic wooden desk for your office.',
    price: 150,
    category: 'Furniture',
    sellerId: seller._id
  };

  console.log("Creating product...");
  const newProduct = await productService.createProduct(productData);
  console.log("Product created:", newProduct._id, "| Status:", newProduct.status);

  console.log("Waiting 3 seconds for AI pipeline to finish processing...");
  setTimeout(async () => {
    const updatedProduct = await Product.findById(newProduct._id);
    console.log("After AI Pipeline -> Status:", updatedProduct.status, "| Risk Level:", updatedProduct.riskLevel, "| Product RS:", updatedProduct.productRS);
    mongoose.connection.close();
  }, 3000);
})
.catch(err => console.error(err));

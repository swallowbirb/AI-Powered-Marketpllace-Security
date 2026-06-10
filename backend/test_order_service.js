require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./src/modules/users/user.model');
  const Product = require('./src/modules/products/product.model');
  const orderService = require('./src/modules/orders/order.service');

  const buyer = await User.findOne({ role: 'buyer' });
  const product = await Product.findOne({});

  if (!buyer || !product) {
    console.log('No buyer or product found');
    process.exit(1);
  }

  try {
    const order = await orderService.createOrder({
      buyerId: buyer._id,
      productId: product._id,
      quantity: 1,
      mockCreditCard: '1234'
    });
    console.log('Success!', order);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

run();

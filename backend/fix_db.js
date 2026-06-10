require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const Product = require('./src/modules/products/product.model');
    const res = await Product.updateMany({ status: { $nin: ['published', 'approved'] } }, { status: 'approved' });
    console.log('Migration done', res);
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

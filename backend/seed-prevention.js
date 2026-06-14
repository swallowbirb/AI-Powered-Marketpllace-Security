/**
 * seed-prevention.js — ADDITIVE demo seed for Phase 7 (Prevention Layer).
 *
 * Never edits seed.js. Idempotent: tags everything it creates (emails p7demo+*,
 * product titles prefixed with [P7-DEMO]) and deletes only those on re-run.
 *
 * Creates 3 demo SKUs, 3 buyer personas at different trust tiers, and seeds
 * historical orders + returns + reviews so the nightly recompute has signal
 * Day 1 (cold-start solved for the demo). Then runs recomputeReturnInsights()
 * and prints the resulting RIKB table.
 *
 * Run: node seed-prevention.js
 */

require('dotenv').config();
// Match server.js network config so the seed works on the same network as the server.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');

const User = require('./src/modules/users/user.model');
const Product = require('./src/modules/products/product.model');
const Order = require('./src/modules/orders/order.model');
const Return = require('./src/modules/returns/return.model');
const Review = require('./src/modules/reviews/review.model');
const ReturnInsight = require('./src/modules/prevention/returnInsight.model');
const NudgeEvent = require('./src/modules/prevention/nudgeEvent.model');
const TrustProfile = require('./src/modules/trust/trust.model');
const trustService = require('./src/modules/trust/trust.service');

const { recomputeReturnInsights } = require('./src/modules/prevention/prevention.job');

const DAY_MS = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

// ── DB connection (mirrors seed-trust.js) ──────────────────────────────────
async function connect() {
  const primaryUri = process.env.MONGODB_URI;
  const fallbackUri = 'mongodb://127.0.0.1:27017/marketplace';
  try {
    console.log('Connecting to primary database...');
    await mongoose.connect(primaryUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to primary DB');
  } catch (err) {
    console.warn(`Primary DB connection failed: ${err.message}`);
    console.log(`Connecting to fallback local DB: ${fallbackUri}`);
    await mongoose.connect(fallbackUri);
    console.log('Connected to fallback DB');
  }
}

// Backdate timestamps via the native driver (timestamps:true makes createdAt immutable).
async function backdate(Model, id, date) {
  await Model.collection.updateOne({ _id: id }, { $set: { createdAt: date } });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
async function clearPrevious() {
  const demoUsers = await User.find({ email: /^p7demo\+/ }).select('_id').lean();
  const demoProducts = await Product.find({ title: /^\[P7-DEMO\]/ }).select('_id').lean();
  const userIds = demoUsers.map((u) => u._id);
  const productIds = demoProducts.map((p) => p._id);

  await Order.deleteMany({
    $or: [{ buyerId: { $in: userIds } }, { productId: { $in: productIds } }],
  });
  await Return.deleteMany({
    $or: [{ userId: { $in: userIds } }, { originalProductId: { $in: productIds } }],
  });
  await Review.deleteMany({ productId: { $in: productIds } });
  await NudgeEvent.deleteMany({
    $or: [{ userId: { $in: userIds } }, { productId: { $in: productIds } }],
  });
  await ReturnInsight.deleteMany({ productId: { $in: productIds } });
  await TrustProfile.deleteMany({ userId: { $in: userIds } });
  await Product.deleteMany({ _id: { $in: productIds } });
  await User.deleteMany({ _id: { $in: userIds } });
}

// ── Builders ────────────────────────────────────────────────────────────────
async function makeUser(handle, extra = {}) {
  const u = await User.create({
    clerkId: `mock_p7_${handle}`,
    email: `p7demo+${handle}@example.com`,
    role: 'buyer',
    firstName: handle,
    ...extra,
  });
  if (extra.accountAgeDays) {
    await backdate(User, u._id, daysAgo(extra.accountAgeDays));
  }
  return u;
}

async function makeProduct(seller, { title, category, price, brandName, averageRating = 4.0, reviewCount = 0 }) {
  const p = await Product.create({
    title: `[P7-DEMO] ${title}`,
    description: `Demo product for Phase 7 prevention layer — ${title}`,
    price,
    category,
    brandName,
    images: [`https://picsum.photos/seed/${encodeURIComponent(title)}/600/600`],
    sellerId: seller._id,
    averageRating,
    reviewCount,
    status: 'approved',
  });
  return p;
}

async function makeOrder(buyer, seller, product, daysOld = 30) {
  const o = await Order.create({
    buyerId: buyer._id,
    sellerId: seller._id,
    productId: product._id,
    quantity: 1,
    totalPrice: product.price,
    status: 'completed',
    paymentDetails: { mockCreditCard: '4242' },
  });
  await backdate(Order, o._id, daysAgo(daysOld));
  return o;
}

async function makeReturn(buyer, order, product, { reasonCode, reasonText, daysOld = 10 }) {
  const r = await Return.create({
    orderId: order._id,
    userId: buyer._id,
    itemId: new mongoose.Types.ObjectId(),
    reasonCode,
    reasonText,
    originalProductId: product._id,
    productTitle: product.title,
    productCategory: product.category,
    orderTotal: product.price,
  });
  await backdate(Return, r._id, daysAgo(daysOld));
  return r;
}

async function makeReview(buyer, seller, product, { rating, text, daysOld = 20 }) {
  const r = await Review.create({
    productId: product._id,
    buyerId: buyer._id,
    sellerId: seller._id,
    rating,
    text,
    isVerifiedPurchase: true,
  });
  await backdate(Review, r._id, daysAgo(daysOld));
  return r;
}

// ── Demo scenarios ──────────────────────────────────────────────────────────
async function run() {
  await connect();
  console.log('\nClearing previous p7-prev-demo data...');
  await clearPrevious();

  // Seller for the demo SKUs
  const seller = await makeUser('seller', {
    role: 'seller',
    storeName: 'p7-prevention demo store',
  });

  // ── BUYER 1 — Priya: verified, loyal (~30 past purchases, 1 old return)
  const priya = await makeUser('priya', { accountAgeDays: 730 });

  // ── BUYER 2 — Rahul: trusted (~12 purchases, 1 fresh return) — drives "frictionless"
  const rahul = await makeUser('rahul', { accountAgeDays: 250 });

  // ── BUYER 3 — Bracketer: standard tier with bracketing pattern
  const bracketer = await makeUser('bracketer', { accountAgeDays: 90 });

  // ── SKU 1: runs-small footwear (~30% return rate, fit verdict runs_small)
  const shoes = await makeProduct(seller, {
    title: 'Marathon Running Shoes',
    category: 'footwear',
    price: 1200, // ₹1200 — upper-mid band
    brandName: 'PaceRunner',
    averageRating: 4.1,
    reviewCount: 30,
  });

  // ~30 buyers (give Priya history elsewhere) — generate orders + 9 returns citing tightness.
  const shoeBuyers = [];
  for (let i = 0; i < 30; i++) {
    shoeBuyers.push(
      await makeUser(`shoe-buyer-${i}`, { accountAgeDays: 100 + i * 5 })
    );
  }
  const shoeOrders = [];
  for (let i = 0; i < shoeBuyers.length; i++) {
    shoeOrders.push(await makeOrder(shoeBuyers[i], seller, shoes, 60 + (i % 90)));
  }
  // 9 returns citing fit tightness → ~30% return rate, runs_small verdict
  const fitTightTexts = [
    'Too tight in the toe box — had to size up',
    'Runs small. Sized up half a size and it fit perfectly.',
    'Very narrow, my feet feel cramped',
    'Snug across the forefoot — too tight for me',
    'Tight fit, returned for a larger size',
    'Smaller than expected — definitely size up',
    'Toe box too narrow, pinches',
    'Runs small. Get one size up.',
    'Too tight. Should have ordered larger.',
  ];
  for (let i = 0; i < 9; i++) {
    await makeReturn(shoeBuyers[i], shoeOrders[i], shoes, {
      reasonCode: 'not_as_described',
      reasonText: fitTightTexts[i],
      daysOld: 30 + i * 2,
    });
  }
  // A handful of reviews that echo it (to push fit confidence up)
  const fitReviewTexts = [
    'Comfortable but runs small. Size up!',
    'Great shoe but tight on the sides — order larger.',
    'Runs small for sure',
  ];
  for (let i = 0; i < fitReviewTexts.length; i++) {
    await makeReview(shoeBuyers[10 + i], seller, shoes, {
      rating: 4,
      text: fitReviewTexts[i],
      daysOld: 25 + i * 3,
    });
  }

  // ── SKU 2: healthy electronics (~6% returns) — drives Rahul (frictionless)
  const monitor = await makeProduct(seller, {
    title: 'BabyView Smart Monitor',
    category: 'electronics',
    price: 4500, // ₹4500 — premium band
    brandName: 'BabyView',
    averageRating: 4.6,
    reviewCount: 80,
  });
  const monBuyers = [];
  for (let i = 0; i < 50; i++) {
    monBuyers.push(await makeUser(`mon-buyer-${i}`, { accountAgeDays: 200 + i * 4 }));
  }
  for (let i = 0; i < monBuyers.length; i++) {
    await makeOrder(monBuyers[i], seller, monitor, 30 + (i % 60));
  }
  // Only 3 returns out of 50 → 6%, with non-fit reasons
  await makeReturn(monBuyers[0],
    await Order.findOne({ buyerId: monBuyers[0]._id, productId: monitor._id }),
    monitor,
    { reasonCode: 'defective', reasonText: 'Stopped working after 2 weeks', daysOld: 5 });
  await makeReturn(monBuyers[1],
    await Order.findOne({ buyerId: monBuyers[1]._id, productId: monitor._id }),
    monitor,
    { reasonCode: 'changed_mind', reasonText: 'Bought a different one', daysOld: 8 });
  await makeReturn(monBuyers[2],
    await Order.findOne({ buyerId: monBuyers[2]._id, productId: monitor._id }),
    monitor,
    { reasonCode: 'other', reasonText: 'Bought it as a gift, not needed', daysOld: 12 });

  // ── SKU 3: high-return apparel (~35% returns, mixed complaints) — seller dashboard demo
  const tshirt = await makeProduct(seller, {
    title: 'Premium Cotton Tee',
    category: 'apparel',
    price: 600, // ₹600 — mid band (riskiest)
    brandName: 'TrendKnits',
    averageRating: 3.6,
    reviewCount: 25,
  });
  const tshirtBuyers = [];
  for (let i = 0; i < 20; i++) {
    tshirtBuyers.push(await makeUser(`tee-buyer-${i}`, { accountAgeDays: 60 + i * 7 }));
  }
  const tshirtOrders = [];
  for (let i = 0; i < tshirtBuyers.length; i++) {
    tshirtOrders.push(await makeOrder(tshirtBuyers[i], seller, tshirt, 20 + (i % 70)));
  }
  // 7 returns out of 20 → 35%
  const teeComplaints = [
    'Color completely different from photos',
    'Not as described — much thinner fabric',
    'Runs large, baggy fit',
    'Doesn\'t match expectations',
    'Different shade of blue than shown',
    'Looser than I wanted, oversized',
    'Quality issues, fabric feels cheap',
  ];
  const teeReasons = [
    'not_as_described', 'not_as_described', 'changed_mind', 'changed_mind',
    'not_as_described', 'changed_mind', 'defective',
  ];
  for (let i = 0; i < 7; i++) {
    await makeReturn(tshirtBuyers[i], tshirtOrders[i], tshirt, {
      reasonCode: teeReasons[i],
      reasonText: teeComplaints[i],
      daysOld: 15 + i * 2,
    });
  }

  // ── Bracketer history: 3× of the same shirt SKU previously, all returned
  const bracketerOrders = [];
  for (let i = 0; i < 4; i++) {
    bracketerOrders.push(await makeOrder(bracketer, seller, tshirt, 40 + i * 5));
  }
  for (let i = 0; i < 3; i++) {
    await makeReturn(bracketer, bracketerOrders[i], tshirt, {
      reasonCode: 'changed_mind',
      reasonText: 'Wrong size — keeping a different one',
      daysOld: 30 + i * 4,
    });
  }

  // ── Priya's loyal history (40 orders, 1 old return) — verified tier
  for (let i = 0; i < 40; i++) {
    await makeOrder(priya, seller, monitor, 5 + i * 18);
  }
  const priyaFirstOrder = await Order.findOne({ buyerId: priya._id }).sort({ createdAt: 1 });
  await makeReturn(priya, priyaFirstOrder, monitor, {
    reasonCode: 'changed_mind',
    reasonText: 'Bought a different model',
    daysOld: 700,
  });

  // ── Rahul's history (12 orders, 1 fresh return) — trusted tier
  for (let i = 0; i < 12; i++) {
    await makeOrder(rahul, seller, monitor, 30 + i * 15);
  }
  const rahulRecentOrder = await Order.findOne({ buyerId: rahul._id }).sort({ createdAt: -1 });
  await makeReturn(rahul, rahulRecentOrder, monitor, {
    reasonCode: 'defective',
    reasonText: 'Faulty unit',
    daysOld: 5,
  });

  // ── Trust profiles
  console.log('\nComputing trust profiles...');
  await trustService.computeTrustProfile(priya._id);
  await trustService.computeTrustProfile(rahul._id);
  await trustService.computeTrustProfile(bracketer._id);

  // ── Run nightly recompute (no LLM — keeps the cost rule honest)
  console.log('\nRunning recomputeReturnInsights()...');
  const result = await recomputeReturnInsights();
  console.log('Result:', result);

  // ── Print the RIKB table
  const insights = await ReturnInsight.find({
    productId: { $in: [shoes._id, monitor._id, tshirt._id] },
  }).lean();

  console.log('\nRIKB table:');
  console.log('SKU                              sold  returned  rate    fitVerdict      compatVerdict     dimVerdict       dominantReason');
  console.log('───────────────────────────────  ────  ────────  ──────  ──────────────  ────────────────  ───────────────  ────────────────');
  for (const i of insights) {
    const product = await Product.findById(i.productId).lean();
    const fitVerdict = i.fitSignal?.verdict || 'unknown';
    const compatVerdict = i.compatSignal?.verdict || 'unknown';
    const dimVerdict = i.dimensionSignal?.verdict || 'unknown';
    console.log(
      `${(product.title || '').substring(0, 31).padEnd(31)}  ${String(i.unitsSold).padStart(4)}  ${String(i.unitsReturned).padStart(8)}  ${(i.returnRate * 100).toFixed(1).padStart(5)}%  ${fitVerdict.padEnd(14)}  ${compatVerdict.padEnd(16)}  ${dimVerdict.padEnd(15)}  ${(i.dominantReason || 'none')}`
    );
  }

  console.log('\nDemo personas:');
  const tiers = await TrustProfile.find({
    userId: { $in: [priya._id, rahul._id, bracketer._id] },
  }).lean();
  for (const t of tiers) {
    const u = await User.findById(t.userId).lean();
    console.log(`  ${u.firstName.padEnd(12)}  tier=${t.tier.padEnd(10)}  score=${t.score}  bracketing=${t.bracketingFlag}`);
  }

  await mongoose.disconnect();
  console.log('\nDone. Disconnected.');
}

run().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});

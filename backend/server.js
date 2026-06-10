require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./src/config/database");
const { errorHandler } = require("./src/middleware/error.middleware");

// Routes
const userRoutes = require("./src/modules/users/user.routes");
const webhookRoutes = require("./src/modules/webhooks/webhook.routes");
const productRoutes = require("./src/modules/products/product.routes");
const adminRoutes = require("./src/modules/admin/admin.routes");
const reviewRoutes = require("./src/modules/reviews/review.routes");
const orderRoutes = require("./src/modules/orders/order.routes");
const brandRoutes = require("./src/modules/brands/brand.routes");
const brandCatalogRoutes = require("./src/modules/brandCatalog/brandCatalogEntry.routes");
const offerRoutes = require("./src/modules/offers/sellerOffer.routes");

const app = express();

// Database Connection
connectDB();

// Middleware
app.use(helmet());
app.use(cors());

// Webhook routes must come before express.json() so they can parse raw bodies
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());


// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Routes
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/brand-catalog", brandCatalogRoutes);
app.use("/api/offers", offerRoutes);

// Error Handler
app.use(errorHandler);

// Port configuration updated to resolve EADDRINUSE conflict
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("hi");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

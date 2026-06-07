require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./src/config/database");
const { errorHandler } = require("./src/middleware/error.middleware");

// Routes
const userRoutes = require("./src/modules/users/user.routes");
const webhookRoutes = require("./src/modules/webhooks/webhook.routes");

const app = express();

// Database Connection
connectDB();

// Middleware
app.use(helmet());
app.use(cors());

// Webhook routes must come before express.json() so they can parse raw bodies
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Routes
app.use("/api/users", userRoutes);

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("hi");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

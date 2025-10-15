const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();

// Security Middleware
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// CORS Configuration for multi-tenant support
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In production, you'll want to restrict this to your actual domains
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      // Add your production domains here
    ];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

// Apply security middleware
app.use(limiter);
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Database Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Load Models
require("./models");

// Load Models
const { Company, User, InventoryItem } = require("./models");

// API Routes
const registrationRoutes = require("./routes/registration");
const adminRoutes = require("./routes/admin");

// Mount routes
app.use("/api/registration", registrationRoutes);
app.use("/api/admin", adminRoutes);

// Debug route
app.get("/api/debug", (req, res) => {
  res.json({ message: "Debug route working" });
});

// Routes (we'll add more in the next steps)
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "GUARDIAN API is running",
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint for database models
app.get("/api/test/models", async (req, res) => {
  try {
    const stats = {
      companies: await Company.countDocuments(),
      users: await User.countDocuments(),
      inventoryItems: await InventoryItem.countDocuments(),
      collections: mongoose.connection.db
        .listCollections()
        .toArray()
        .then((cols) => cols.map((c) => c.name)),
    };

    res.json({
      status: "OK",
      message: "Multi-tenant database models loaded successfully",
      stats: stats,
      modelInfo: {
        Company:
          "Multi-tenant company management with plans, limits, and settings",
        User: "Company-scoped users with RBAC and 2FA support",
        InventoryItem:
          "Company-isolated inventory with stock management and audit trails",
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Database model test failed",
      error: error.message,
    });
  }
});

// Default route - serve login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);

  // Don't leak error details in production
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "Something went wrong!" });
  } else {
    res.status(500).json({
      error: "Something went wrong!",
      details: err.message,
      stack: err.stack,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 GUARDIAN server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(
    `🔒 Security features enabled: CORS, Rate Limiting, Security Headers`
  );
});

module.exports = app;

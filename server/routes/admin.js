const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getCompanyBilling,
  setCustomPricing,
  addBillingAdjustment,
  removeBillingAdjustment,
  getCustomPricingOverview,
} = require("../controllers/adminController");

const router = express.Router();

// Rate limiting for admin operations
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Higher limit for admin operations
  message: {
    success: false,
    error: "Too many admin requests, please try again later.",
  },
});

// Apply rate limiting to all admin routes
router.use(adminLimiter);

// TODO: Add authentication middleware to protect these routes
// router.use(authMiddleware); // Will be added when we implement JWT auth
// router.use(adminMiddleware); // Will ensure only admins can access

/**
 * GET /api/admin/billing/overview
 * Get overview of all companies with custom pricing
 */
router.get("/billing/overview", getCustomPricingOverview);

/**
 * GET /api/admin/billing/:companyId
 * Get detailed billing information for a specific company
 */
router.get("/billing/:companyId", getCompanyBilling);

/**
 * POST /api/admin/billing/:companyId/custom-pricing
 * Set custom pricing for a company
 * Body: { customMonthlyRate, customYearlyRate?, billingCycle?, dealInfo?, reason? }
 */
router.post("/billing/:companyId/custom-pricing", setCustomPricing);

/**
 * POST /api/admin/billing/:companyId/adjustments
 * Add a billing adjustment (discount, credit, fee, etc.)
 * Body: { type, amount, description, reason?, isRecurring?, expiresAt? }
 */
router.post("/billing/:companyId/adjustments", addBillingAdjustment);

/**
 * DELETE /api/admin/billing/:companyId/adjustments/:adjustmentId
 * Remove/deactivate a billing adjustment
 */
router.delete(
  "/billing/:companyId/adjustments/:adjustmentId",
  removeBillingAdjustment
);

module.exports = router;

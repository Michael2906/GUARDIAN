const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  checkAvailability,
  registerCompany,
  verifyEmail,
  completeSetup,
  resendVerification,
  getSubscriptionPlans,
} = require("../controllers/registrationController");

const router = express.Router();

// Rate limiting for registration endpoints
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 registration attempts per windowMs
  message: {
    success: false,
    error: "Too many registration attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const verificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Allow more verification attempts
  message: {
    success: false,
    error: "Too many verification attempts, please try again later.",
  },
});

// Registration Routes

/**
 * GET /api/registration/plans
 * Get available subscription plans and pricing
 */
router.get("/plans", getSubscriptionPlans);

/**
 * GET /api/registration/check-availability
 * Check if company name, email, or slug is available
 * Query params: name, email, slug
 */
router.get("/check-availability", checkAvailability);

/**
 * POST /api/registration/register
 * Register a new storage company
 */
router.post("/register", registrationLimiter, registerCompany);

/**
 * GET /api/registration/verify/:token
 * Verify email address with token
 */
router.get("/verify/:token", verificationLimiter, verifyEmail);

/**
 * POST /api/registration/setup/:companyId
 * Complete company onboarding setup
 */
router.post("/setup/:companyId", completeSetup);

/**
 * POST /api/registration/resend-verification
 * Resend verification email
 */
router.post("/resend-verification", verificationLimiter, resendVerification);

module.exports = router;

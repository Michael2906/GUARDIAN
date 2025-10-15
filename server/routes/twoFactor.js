const express = require("express");
const router = express.Router();

// Controllers
const twoFactorController = require("../controllers/twoFactorController");

// Middleware
const {
  authenticateToken,
  requireEmailVerification,
  authRateLimit,
} = require("../middleware/auth");

/**
 * Two-Factor Authentication Routes
 *
 * Base URL: /api/auth/2fa
 */

// Rate limiting specifically for 2FA operations (stricter limits)
const twoFactorRateLimit = require("express-rate-limit")({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: "Too many 2FA attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   GET /api/auth/2fa/status
 * @desc    Get current 2FA status for user
 * @access  Private
 */
router.get("/status", authenticateToken, twoFactorController.get2FAStatus);

/**
 * @route   GET /api/auth/2fa/setup
 * @desc    Generate 2FA setup (secret and QR code)
 * @access  Private
 */
router.get(
  "/setup",
  authenticateToken,
  requireEmailVerification,
  twoFactorController.generate2FASetup
);

/**
 * @route   POST /api/auth/2fa/verify-setup
 * @desc    Verify setup token and enable 2FA
 * @access  Private
 * @body    { token }
 */
router.post(
  "/verify-setup",
  twoFactorRateLimit,
  authenticateToken,
  requireEmailVerification,
  twoFactorController.verifyAndEnable2FA
);

/**
 * @route   POST /api/auth/2fa/verify
 * @desc    Verify 2FA token during login
 * @access  Public (used during login process)
 * @body    { userId, token }
 */
router.post("/verify", twoFactorRateLimit, twoFactorController.verify2FAToken);

/**
 * @route   POST /api/auth/2fa/disable
 * @desc    Disable 2FA for user
 * @access  Private
 * @body    { password, token }
 */
router.post(
  "/disable",
  twoFactorRateLimit,
  authenticateToken,
  requireEmailVerification,
  twoFactorController.disable2FA
);

/**
 * @route   POST /api/auth/2fa/regenerate-backup-codes
 * @desc    Regenerate backup codes
 * @access  Private
 * @body    { password }
 */
router.post(
  "/regenerate-backup-codes",
  twoFactorRateLimit,
  authenticateToken,
  requireEmailVerification,
  twoFactorController.regenerateBackupCodes
);

module.exports = router;

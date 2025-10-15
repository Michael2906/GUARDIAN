const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getCompanyBilling,
  setCustomPricing,
  addBillingAdjustment,
  removeBillingAdjustment,
  getCustomPricingOverview,
} = require("../controllers/adminController");

// Authentication middleware
const { authenticateToken, requireRole } = require("../middleware/auth");

// User model for 2FA management
const User = require("../models/User");

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

// Protect all admin routes - require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(["guardian-admin", "storage-admin"])); // Allow both GUARDIAN and storage admins

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

/**
 * 2FA Management Routes for GUARDIAN Admins
 */

/**
 * PUT /api/admin/users/:userId/2fa/enable
 * Enable 2FA for a specific user
 */
router.put("/users/:userId/2fa/enable", async (req, res) => {
  try {
    const { userId } = req.params;

    // Only GUARDIAN admins can manage 2FA for other users
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Only GUARDIAN administrators can manage 2FA settings",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Prevent self-modification unless explicitly allowed
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify your own 2FA settings through admin interface",
      });
    }

    // Enable 2FA
    user.twoFactorAuth.enabled = true;
    user.twoFactorAuth.enabledAt = new Date();
    user.twoFactorAuth.enabledBy = req.user.id;

    await user.save();

    res.json({
      success: true,
      message: `2FA enabled for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user._id,
        twoFactorEnabled: user.twoFactorAuth.enabled,
        enabledAt: user.twoFactorAuth.enabledAt,
      },
    });
  } catch (error) {
    console.error("Error enabling 2FA:", error);
    res.status(500).json({
      success: false,
      error: "Failed to enable 2FA",
    });
  }
});

/**
 * PUT /api/admin/users/:userId/2fa/disable
 * Disable 2FA for a specific user
 */
router.put("/users/:userId/2fa/disable", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body; // Optional reason for disabling

    // Only GUARDIAN admins can manage 2FA for other users
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Only GUARDIAN administrators can manage 2FA settings",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Prevent self-modification unless explicitly allowed
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify your own 2FA settings through admin interface",
      });
    }

    // Disable 2FA
    user.twoFactorAuth.enabled = false;
    user.twoFactorAuth.disabledAt = new Date();
    user.twoFactorAuth.disabledBy = req.user.id;
    if (reason) {
      user.twoFactorAuth.disabledReason = reason;
    }

    await user.save();

    res.json({
      success: true,
      message: `2FA disabled for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user._id,
        twoFactorEnabled: user.twoFactorAuth.enabled,
        disabledAt: user.twoFactorAuth.disabledAt,
        reason: reason || "No reason provided",
      },
    });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    res.status(500).json({
      success: false,
      error: "Failed to disable 2FA",
    });
  }
});

/**
 * POST /api/admin/users/:userId/2fa/reset
 * Reset 2FA configuration for a user (removes backup codes, resets secret)
 */
router.post("/users/:userId/2fa/reset", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Only GUARDIAN admins can reset 2FA
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Only GUARDIAN administrators can reset 2FA settings",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Prevent self-modification
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot reset your own 2FA settings through admin interface",
      });
    }

    // Reset 2FA configuration
    user.twoFactorAuth.secret = null;
    user.twoFactorAuth.backupCodes = [];
    user.twoFactorAuth.enabled = false;
    user.twoFactorAuth.resetAt = new Date();
    user.twoFactorAuth.resetBy = req.user.id;
    if (reason) {
      user.twoFactorAuth.resetReason = reason;
    }

    await user.save();

    res.json({
      success: true,
      message: `2FA configuration reset for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user._id,
        twoFactorEnabled: false,
        resetAt: user.twoFactorAuth.resetAt,
        reason: reason || "Admin reset",
      },
    });
  } catch (error) {
    console.error("Error resetting 2FA:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset 2FA configuration",
    });
  }
});

/**
 * GET /api/admin/users/:userId/2fa/status
 * Get detailed 2FA status for a user
 */
router.get("/users/:userId/2fa/status", async (req, res) => {
  try {
    const { userId } = req.params;

    // Only GUARDIAN admins can view 2FA status
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Only GUARDIAN administrators can view 2FA status",
      });
    }

    // Find the user
    const user = await User.findById(userId).select(
      "firstName lastName email twoFactorAuth"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        userInfo: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        },
        twoFactorAuth: {
          isEnabled: user.twoFactorAuth.enabled,
          hasSecret: !!user.twoFactorAuth.secret,
          backupCodesCount: user.twoFactorAuth.backupCodes?.length || 0,
          enabledAt: user.twoFactorAuth.enabledAt,
          disabledAt: user.twoFactorAuth.disabledAt,
          resetAt: user.twoFactorAuth.resetAt,
          lastUsed: user.twoFactorAuth.lastUsedAt,
        },
      },
    });
  } catch (error) {
    console.error("Error getting 2FA status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve 2FA status",
    });
  }
});

/**
 * GET /api/admin/2fa/overview
 * Get overview of 2FA usage across the platform
 */
router.get("/2fa/overview", async (req, res) => {
  try {
    // Only GUARDIAN admins can view platform 2FA overview
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Only GUARDIAN administrators can view 2FA overview",
      });
    }

    // Aggregate 2FA statistics
    const totalUsers = await User.countDocuments();
    const usersWithTwoFactorEnabled = await User.countDocuments({
      "twoFactorAuth.enabled": true,
    });
    const usersWithTwoFactorSetup = await User.countDocuments({
      "twoFactorAuth.secret": { $exists: true, $ne: null },
    });

    // Get recent 2FA activities
    const recentActivities = await User.find(
      {
        $or: [
          { "twoFactorAuth.enabledAt": { $exists: true } },
          { "twoFactorAuth.disabledAt": { $exists: true } },
          { "twoFactorAuth.resetAt": { $exists: true } },
        ],
      },
      {
        firstName: 1,
        lastName: 1,
        email: 1,
        "twoFactorAuth.enabledAt": 1,
        "twoFactorAuth.disabledAt": 1,
        "twoFactorAuth.resetAt": 1,
        "twoFactorAuth.enabled": 1,
      }
    )
      .sort({
        $or: [
          { "twoFactorAuth.enabledAt": -1 },
          { "twoFactorAuth.disabledAt": -1 },
          { "twoFactorAuth.resetAt": -1 },
        ],
      })
      .limit(10);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          usersWithTwoFactorEnabled,
          usersWithTwoFactorSetup,
          enabledPercentage:
            totalUsers > 0
              ? Math.round((usersWithTwoFactorEnabled / totalUsers) * 100)
              : 0,
          setupPercentage:
            totalUsers > 0
              ? Math.round((usersWithTwoFactorSetup / totalUsers) * 100)
              : 0,
        },
        recentActivities: recentActivities.map((user) => ({
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          isEnabled: user.twoFactorAuth.enabled,
          enabledAt: user.twoFactorAuth.enabledAt,
          disabledAt: user.twoFactorAuth.disabledAt,
          resetAt: user.twoFactorAuth.resetAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting 2FA overview:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve 2FA overview",
    });
  }
});

module.exports = router;

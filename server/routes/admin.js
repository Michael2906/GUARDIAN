const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getCompanyBilling,
  setCustomPricing,
  addBillingAdjustment,
  removeBillingAdjustment,
  getCustomPricingOverview,
} = require("../controllers/adminController");

const { authenticateToken, requireRole } = require("../middleware/auth");
const { User } = require("../models");

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: "Too many admin requests, please try again later.",
  },
});

router.use(adminLimiter);
router.use(authenticateToken);
router.use(requireRole(["guardian-admin", "storage-admin"]));

// ----- Billing / custom pricing -----
router.get("/billing/overview", getCustomPricingOverview);
router.get("/billing/:companyId", getCompanyBilling);
router.post("/billing/:companyId/custom-pricing", setCustomPricing);
router.post("/billing/:companyId/adjustments", addBillingAdjustment);
router.delete("/billing/:companyId/adjustments/:adjustmentId", removeBillingAdjustment);

// ----- 2FA management (GUARDIAN admins) -----
const guardianAdminOnly = (req, res) => {
  if (req.user.role !== "guardian-admin") {
    res.status(403).json({
      success: false,
      error: "Only GUARDIAN administrators can manage 2FA settings",
    });
    return false;
  }
  return true;
};

/**
 * PUT /api/admin/users/:userId/2fa/enable
 */
router.put("/users/:userId/2fa/enable", async (req, res) => {
  try {
    if (!guardianAdminOnly(req, res)) return;

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (String(user.id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify your own 2FA settings through admin interface",
      });
    }

    const tfa = user.twoFactorAuth;
    tfa.enabled = true;
    tfa.enabledAt = new Date();
    tfa.enabledBy = req.user.id;
    user.twoFactorAuth = tfa;
    await user.save();

    res.json({
      success: true,
      message: `2FA enabled for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user.id,
        twoFactorEnabled: true,
        enabledAt: tfa.enabledAt,
      },
    });
  } catch (error) {
    console.error("Error enabling 2FA:", error);
    res.status(500).json({ success: false, error: "Failed to enable 2FA" });
  }
});

/**
 * PUT /api/admin/users/:userId/2fa/disable
 */
router.put("/users/:userId/2fa/disable", async (req, res) => {
  try {
    if (!guardianAdminOnly(req, res)) return;
    const { reason } = req.body;

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (String(user.id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify your own 2FA settings through admin interface",
      });
    }

    const tfa = user.twoFactorAuth;
    tfa.enabled = false;
    tfa.disabledAt = new Date();
    tfa.disabledBy = req.user.id;
    if (reason) tfa.disabledReason = reason;
    user.twoFactorAuth = tfa;
    await user.save();

    res.json({
      success: true,
      message: `2FA disabled for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user.id,
        twoFactorEnabled: false,
        disabledAt: tfa.disabledAt,
        reason: reason || "No reason provided",
      },
    });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    res.status(500).json({ success: false, error: "Failed to disable 2FA" });
  }
});

/**
 * POST /api/admin/users/:userId/2fa/reset
 */
router.post("/users/:userId/2fa/reset", async (req, res) => {
  try {
    if (!guardianAdminOnly(req, res)) return;
    const { reason } = req.body;

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (String(user.id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: "Cannot reset your own 2FA settings through admin interface",
      });
    }

    const tfa = user.twoFactorAuth;
    tfa.secret = null;
    tfa.backupCodes = [];
    tfa.enabled = false;
    tfa.resetAt = new Date();
    tfa.resetBy = req.user.id;
    if (reason) tfa.resetReason = reason;
    user.twoFactorAuth = tfa;
    await user.save();

    res.json({
      success: true,
      message: `2FA configuration reset for user ${user.firstName} ${user.lastName}`,
      data: {
        userId: user.id,
        twoFactorEnabled: false,
        resetAt: tfa.resetAt,
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
 */
router.get("/users/:userId/2fa/status", async (req, res) => {
  try {
    if (!guardianAdminOnly(req, res)) return;

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const tfa = user.twoFactorAuth || {};
    res.json({
      success: true,
      data: {
        userId: user.id,
        userInfo: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        },
        twoFactorAuth: {
          isEnabled: !!tfa.enabled,
          hasSecret: !!tfa.secret,
          backupCodesCount: tfa.backupCodes ? tfa.backupCodes.length : 0,
          enabledAt: tfa.enabledAt,
          disabledAt: tfa.disabledAt,
          resetAt: tfa.resetAt,
          lastUsed: tfa.lastUsedAt,
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
 */
router.get("/2fa/overview", async (req, res) => {
  try {
    if (!guardianAdminOnly(req, res)) return;

    const users = await User.findAll();
    const totalUsers = users.length;

    let enabledCount = 0;
    let setupCount = 0;
    const activities = [];

    users.forEach((u) => {
      const tfa = u.twoFactorAuth || {};
      if (tfa.enabled) enabledCount += 1;
      if (tfa.secret) setupCount += 1;
      const lastActivity = tfa.enabledAt || tfa.disabledAt || tfa.resetAt;
      if (lastActivity) {
        activities.push({
          userId: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          isEnabled: !!tfa.enabled,
          enabledAt: tfa.enabledAt,
          disabledAt: tfa.disabledAt,
          resetAt: tfa.resetAt,
          _sort: new Date(lastActivity).getTime(),
        });
      }
    });

    activities.sort((a, b) => b._sort - a._sort);
    const recentActivities = activities.slice(0, 10).map(({ _sort, ...a }) => a);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          usersWithTwoFactorEnabled: enabledCount,
          usersWithTwoFactorSetup: setupCount,
          enabledPercentage: totalUsers ? Math.round((enabledCount / totalUsers) * 100) : 0,
          setupPercentage: totalUsers ? Math.round((setupCount / totalUsers) * 100) : 0,
        },
        recentActivities,
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

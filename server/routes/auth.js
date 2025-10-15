const express = require("express");
const router = express.Router();

// Controllers
const authController = require("../controllers/authController");

// Middleware
const {
  authenticateToken,
  requireRole,
  requirePermission,
  requireEmailVerification,
  authRateLimit,
} = require("../middleware/auth");

/**
 * Authentication Routes
 *
 * Base URL: /api/auth
 */

/**
 * @route   POST /api/auth/login
 * @desc    User login with email and password (role auto-detected)
 * @access  Public
 * @body    { email, password }
 */
router.post("/login", authRateLimit, authController.login);

/**
 * @route   POST /api/auth/login-2fa
 * @desc    Complete 2FA login process
 * @access  Public
 * @body    { userId, token, tempSession }
 */
router.post("/login-2fa", authRateLimit, authController.complete2FALogin);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken }
 */
router.post("/refresh", authController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Private
 * @body    { refreshToken }
 */
router.post("/logout", authenticateToken, authController.logout);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout user from all devices
 * @access  Private
 */
router.post("/logout-all", authenticateToken, authController.logoutAll);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if current token is valid and get user data
 * @access  Private
 */
router.get("/verify", authenticateToken, authController.verifyToken);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 * @body    { currentPassword, newPassword }
 */
router.post(
  "/change-password",
  authenticateToken,
  requireEmailVerification,
  authController.changePassword
);

/**
 * User Profile Routes
 */

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/profile", authenticateToken, authController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 * @body    { firstName, lastName, preferences }
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, preferences } = req.body;
    const { User } = require("../models");

    // Validation
    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: "First name and last name are required",
      });
    }

    // Update user profile
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();

    if (preferences && typeof preferences === "object") {
      user.preferences = { ...user.preferences, ...preferences };
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          preferences: user.preferences,
        },
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update profile",
    });
  }
});

/**
 * User Management Routes (Admin Only)
 */

/**
 * @route   GET /api/auth/users
 * @desc    List users (admin only)
 * @access  Private (Admin)
 */
router.get(
  "/users",
  authenticateToken,
  requirePermission("administration", "manageUsers"),
  authController.listUsers
);

/**
 * @route   PUT /api/auth/users/:userId/role
 * @desc    Update user role (admin only)
 * @access  Private (Admin)
 * @body    { userType, permissions }
 */
router.put(
  "/users/:userId/role",
  authenticateToken,
  requirePermission("administration", "manageUsers"),
  authController.updateUserRole
);

/**
 * Session Management Routes
 */

/**
 * @route   GET /api/auth/sessions
 * @desc    Get all active sessions (refresh tokens) for current user
 * @access  Private
 */
router.get("/sessions", authenticateToken, async (req, res) => {
  try {
    const { User } = require("../models");

    const user = await User.findById(req.user.userId).select("refreshTokens");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const activeSessions =
      user.refreshTokens
        ?.filter((tokenObj) => tokenObj.expiresAt > new Date())
        .map((tokenObj) => ({
          id: tokenObj._id,
          createdAt: tokenObj.createdAt,
          expiresAt: tokenObj.expiresAt,
          userAgent: tokenObj.userAgent,
          ipAddress: tokenObj.ipAddress,
          isCurrentSession: false, // We'd need to match current refresh token to determine this
        })) || [];

    res.json({
      success: true,
      data: {
        sessions: activeSessions,
        totalSessions: activeSessions.length,
      },
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get sessions",
    });
  }
});

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Revoke a specific session (refresh token)
 * @access  Private
 */
router.delete("/sessions/:sessionId", authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { User } = require("../models");

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Remove the specific refresh token
    user.refreshTokens =
      user.refreshTokens?.filter(
        (tokenObj) => tokenObj._id.toString() !== sessionId
      ) || [];

    await user.save();

    res.json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    console.error("Revoke session error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to revoke session",
    });
  }
});

/**
 * Debug Routes (Development Only)
 */
if (process.env.NODE_ENV === "development") {
  /**
   * @route   GET /api/auth/debug/user-roles
   * @desc    Get all available user roles and permissions (dev only)
   * @access  Private (Guardian Admin)
   */
  router.get(
    "/debug/user-roles",
    authenticateToken,
    requireRole(["guardian-admin"]),
    (req, res) => {
      res.json({
        success: true,
        data: {
          roles: {
            "guardian-admin": {
              description: "GUARDIAN platform administrator",
              permissions: ["*"], // All permissions
            },
            "company-admin": {
              description: "Storage company administrator",
              permissions: [
                "manage_company",
                "manage_users",
                "manage_inventory",
                "manage_warehouses",
                "view_analytics",
                "manage_clients",
                "manage_api_keys",
              ],
            },
            "staff": {
              description: "Storage company staff member",
              permissions: [
                "view_inventory",
                "manage_inventory",
                "view_warehouses",
              ],
            },
            "client-user": {
              description: "Client business user",
              permissions: ["view_own_inventory", "view_reports"],
            },
          },
        },
      });
    }
  );
}

/**
 * Mount Two-Factor Authentication Routes
 */
router.use("/2fa", require("./twoFactor"));

module.exports = router;

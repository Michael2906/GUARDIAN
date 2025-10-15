const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { User, Company } = require("../models");

// JWT Token Generation Helpers
const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "15m",
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d",
  });
};

const generateTokenPair = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.userType, // Use userType from User model
    storageCompanyId: user.storageCompanyId,
    permissions: user.permissions || {},
    isEmailVerified: user.isEmailVerified,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken({ userId: user._id }),
  };
};

/**
 * User Login
 * POST /api/auth/login
 *
 * Simplified login - users just need email and password.
 * Role is automatically detected from their account.
 *
 * Supports multiple user types:
 * - storage-admin, storage-manager, storage-employee
 * - client-admin, client-user, client-viewer
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Find user by email only - role is pre-assigned
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    })
      .populate("storageCompanyId", "name email isActive billing")
      .populate("clientBusinessId", "name clientCode isActive");

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // User account is already checked in the query (isActive: true)
    // Additional checks for storage company and client business
    if (user.storageCompanyId && !user.storageCompanyId.isActive) {
      return res.status(401).json({
        success: false,
        error:
          "Storage company account is inactive. Please contact GUARDIAN support.",
      });
    }

    if (user.clientBusinessId && !user.clientBusinessId.isActive) {
      return res.status(401).json({
        success: false,
        error:
          "Client business account is inactive. Please contact your storage company.",
      });
    }

    // Get the password field (it's excluded by default)
    const userWithPassword = await User.findById(user._id).select("+password");

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      userWithPassword.password
    );

    if (!isPasswordValid) {
      // Update failed login attempts
      user.failedLoginAttempts += 1;
      user.lastFailedLogin = new Date();

      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await user.save();

        return res.status(401).json({
          success: false,
          error:
            "Account locked due to too many failed login attempts. Try again in 30 minutes.",
        });
      }

      await user.save();

      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // Check if account is locked
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const lockTimeRemaining = Math.ceil(
        (user.accountLockedUntil - new Date()) / (60 * 1000)
      );
      return res.status(401).json({
        success: false,
        error: `Account is locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    // Reset failed login attempts on successful password verification
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;

    // Check if 2FA is enabled for this user
    if (user.twoFactorAuth && user.twoFactorAuth.enabled) {
      // Generate temporary session token
      const tempSessionToken = jwt.sign(
        { userId: user._id, step: "2fa_required" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" } // 10-minute temporary token
      );

      // For 2FA users, return a temporary token that requires 2FA verification
      return res.json({
        success: true,
        message:
          "Password verified. Please enter your 6-digit authentication code.",
        requiresTwoFactor: true,
        data: {
          userId: user._id,
          email: user.email,
          tempSession: tempSessionToken,
        },
      });
    }

    // For non-2FA users, complete the login
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;

    // Generate JWT tokens
    const tokens = generateTokenPair(user);

    // Save refresh token to user record (for token revocation)
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: tokens.refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent: req.get("User-Agent"),
      ipAddress: req.ip,
    });

    // Keep only last 5 refresh tokens (security measure)
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    // Prepare user data for response (exclude sensitive fields)
    const userData = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.userType, // Map userType to role for frontend compatibility
      permissions: user.permissions,
      isEmailVerified: user.isEmailVerified,
      storageCompany: user.storageCompanyId
        ? {
            id: user.storageCompanyId._id,
            name: user.storageCompanyId.name,
            email: user.storageCompanyId.email,
            isActive: user.storageCompanyId.isActive,
          }
        : null,
      clientBusiness: user.clientBusinessId
        ? {
            id: user.clientBusinessId._id,
            name: user.clientBusinessId.name,
            clientCode: user.clientBusinessId.clientCode,
            isActive: user.clientBusinessId.isActive,
          }
        : null,
    };

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: userData,
        tokens: tokens,
        sessionExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed. Please try again.",
    });
  }
};

/**
 * Complete 2FA Login
 * POST /api/auth/login-2fa
 * Body: { userId, token, tempSession }
 */
const complete2FALogin = async (req, res) => {
  try {
    const { userId, token, tempSession } = req.body;

    // Validation
    if (!userId || !token || !tempSession) {
      return res.status(400).json({
        success: false,
        error: "User ID, 2FA token, and temporary session are required",
      });
    }

    // Verify temporary session token
    let decoded;
    try {
      decoded = jwt.verify(tempSession, process.env.JWT_SECRET);
      if (decoded.userId !== userId || decoded.step !== "2fa_required") {
        throw new Error("Invalid session");
      }
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired temporary session",
      });
    }

    // Find user and verify 2FA token using the twoFactor controller
    const user = await User.findById(userId)
      .populate("storageCompanyId", "name email isActive billing")
      .populate("clientBusinessId", "name clientCode isActive");

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    if (!user.twoFactorAuth || !user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA is not enabled for this user",
      });
    }

    // Verify 2FA token
    const speakeasy = require("speakeasy");
    const crypto = require("crypto");

    let verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.secret,
      encoding: "base32",
      token: token,
      window: 2,
    });

    let usedBackupCode = false;

    // If TOTP fails, try backup codes
    if (!verified && user.twoFactorAuth.backupCodes.length > 0) {
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const backupCodeIndex =
        user.twoFactorAuth.backupCodes.indexOf(hashedToken);

      if (backupCodeIndex !== -1) {
        // Remove used backup code
        user.twoFactorAuth.backupCodes.splice(backupCodeIndex, 1);
        verified = true;
        usedBackupCode = true;
      }
    }

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: "Invalid 2FA code or backup code",
      });
    }

    // Complete login process
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;
    user.twoFactorAuth.lastUsedAt = new Date();

    // Generate JWT tokens
    const tokens = generateTokenPair(user);

    // Save refresh token to user record (for token revocation)
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: tokens.refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent: req.get("User-Agent"),
      ipAddress: req.ip,
    });

    // Keep only last 5 refresh tokens (security measure)
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    // Prepare user data for response (exclude sensitive fields)
    const userData = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.userType,
      permissions: user.permissions,
      isEmailVerified: user.isEmailVerified,
      storageCompany: user.storageCompanyId
        ? {
            id: user.storageCompanyId._id,
            name: user.storageCompanyId.name,
            email: user.storageCompanyId.email,
            isActive: user.storageCompanyId.isActive,
          }
        : null,
      clientBusiness: user.clientBusinessId
        ? {
            id: user.clientBusinessId._id,
            name: user.clientBusinessId.name,
            clientCode: user.clientBusinessId.clientCode,
            isActive: user.clientBusinessId.isActive,
          }
        : null,
      twoFactorEnabled: true,
    };

    res.json({
      success: true,
      message: usedBackupCode
        ? `2FA login successful using backup code. ${user.twoFactorAuth.backupCodes.length} backup codes remaining.`
        : "2FA login successful",
      data: {
        user: userData,
        tokens: tokens,
        sessionExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
        usedBackupCode,
        remainingBackupCodes: user.twoFactorAuth.backupCodes.length,
      },
    });
  } catch (error) {
    console.error("2FA login completion error:", error);
    res.status(500).json({
      success: false,
      error: "2FA login failed. Please try again.",
    });
  }
};

/**
 * Refresh Access Token
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired refresh token",
      });
    }

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    // Check if refresh token exists in user's token list
    const tokenExists = user.refreshTokens?.some(
      (tokenObj) =>
        tokenObj.token === refreshToken && tokenObj.expiresAt > new Date()
    );

    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        error: "Refresh token not found or expired",
      });
    }

    // Generate new token pair
    const tokens = generateTokenPair(user);

    // Remove old refresh token and add new one
    user.refreshTokens = user.refreshTokens.filter(
      (tokenObj) => tokenObj.token !== refreshToken
    );

    user.refreshTokens.push({
      token: tokens.refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await user.save();

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        tokens: tokens,
        sessionExpiry: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      success: false,
      error: "Token refresh failed",
    });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user?.userId; // From auth middleware

    if (userId && refreshToken) {
      // Remove specific refresh token
      const user = await User.findById(userId);
      if (user) {
        user.refreshTokens =
          user.refreshTokens?.filter(
            (tokenObj) => tokenObj.token !== refreshToken
          ) || [];
        await user.save();
      }
    }

    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
};

/**
 * Logout All Devices
 * POST /api/auth/logout-all
 */
const logoutAll = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        user.refreshTokens = [];
        await user.save();
      }
    }

    res.json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (error) {
    console.error("Logout all error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
};

/**
 * Verify Token (for client-side token validation)
 * GET /api/auth/verify
 */
const verifyToken = async (req, res) => {
  try {
    // User data is already available from auth middleware
    const user = await User.findById(req.user.userId)
      .select("-password -refreshTokens -twoFactorAuth.secret")
      .populate("storageCompanyId", "name email isActive");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.userType,
          permissions: user.permissions,
          isEmailVerified: user.isEmailVerified,
          storageCompany: user.storageCompanyId
            ? {
                id: user.storageCompanyId._id,
                name: user.storageCompanyId.name,
                email: user.storageCompanyId.email,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      success: false,
      error: "Token verification failed",
    });
  }
};

/**
 * Change Password
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters long",
      });
    }

    // Find user
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    // Update password and clear all refresh tokens (force re-login on all devices)
    user.password = newPassword; // Will be hashed by pre-save middleware
    user.refreshTokens = [];
    user.lastModifiedBy = userId;

    await user.save();

    res.json({
      success: true,
      message:
        "Password changed successfully. Please log in again on all devices.",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      error: "Password change failed",
    });
  }
};

/**
 * Get User Profile
 * GET /api/auth/profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("-password -refreshTokens -twoFactorAuth.secret")
      .populate("storageCompanyId", "name email isActive")
      .populate("clientBusinessId", "name clientCode isActive")
      .populate("createdBy", "firstName lastName email")
      .populate("lastModifiedBy", "firstName lastName email");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve profile",
    });
  }
};

/**
 * Update User Role (Admin Only)
 * PUT /api/auth/users/:userId/role
 */
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType, permissions } = req.body;
    const adminUserId = req.user.userId;

    // Validation
    if (!userType) {
      return res.status(400).json({
        success: false,
        error: "User type is required",
      });
    }

    const validUserTypes = [
      "storage-admin",
      "storage-manager",
      "storage-employee",
      "client-admin",
      "client-user",
      "client-viewer",
    ];

    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user type",
      });
    }

    // Find the admin user to check permissions
    const adminUser = await User.findById(adminUserId);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        error: "Admin user not found",
      });
    }

    // Check if admin has permission to manage users
    if (!adminUser.hasPermission("administration", "manageUsers")) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions to manage users",
      });
    }

    // Find the user to update
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Storage admins can only manage users within their company
    if (
      adminUser.userType === "storage-admin" &&
      user.storageCompanyId.toString() !== adminUser.storageCompanyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        error: "Can only manage users within your storage company",
      });
    }

    // Client admins can only manage users within their client business
    if (
      adminUser.userType === "client-admin" &&
      user.clientBusinessId &&
      user.clientBusinessId.toString() !== adminUser.clientBusinessId.toString()
    ) {
      return res.status(403).json({
        success: false,
        error: "Can only manage users within your client business",
      });
    }

    // Update user role
    const oldUserType = user.userType;
    user.userType = userType;
    user.lastModifiedBy = adminUserId;

    // Reset to default permissions for new role
    user.setDefaultPermissions();

    // Apply custom permissions if provided
    if (permissions) {
      Object.keys(permissions).forEach((category) => {
        if (user.permissions[category]) {
          Object.keys(permissions[category]).forEach((action) => {
            user.permissions[category][action] = permissions[category][action];
          });
        }
      });
    }

    // Clear all refresh tokens to force re-login with new permissions
    user.refreshTokens = [];

    await user.save();

    res.json({
      success: true,
      message: `User role updated from ${oldUserType} to ${userType}`,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          permissions: user.permissions,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user role",
    });
  }
};

/**
 * List Users (Admin Only)
 * GET /api/auth/users
 */
const listUsers = async (req, res) => {
  try {
    const adminUserId = req.user.userId;
    const { page = 1, limit = 20, userType, search } = req.query;

    // Find the admin user to check permissions
    const adminUser = await User.findById(adminUserId);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        error: "Admin user not found",
      });
    }

    // Check if admin has permission to view users
    if (
      !adminUser.hasPermission("administration", "manageUsers") &&
      !adminUser.hasPermission("administration", "viewAllData")
    ) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions to view users",
      });
    }

    // Build query based on admin's scope
    let query = { isActive: true };

    // Storage admins can only see users within their company
    if (adminUser.userType === "storage-admin") {
      query.storageCompanyId = adminUser.storageCompanyId;
    }

    // Client admins can only see users within their client business
    if (adminUser.userType === "client-admin") {
      query.clientBusinessId = adminUser.clientBusinessId;
    }

    // Filter by user type if specified
    if (userType) {
      query.userType = userType;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select("-password -refreshTokens -twoFactorAuth.secret")
        .populate("storageCompanyId", "name email")
        .populate("clientBusinessId", "name clientCode")
        .populate("createdBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve users",
    });
  }
};

module.exports = {
  login,
  complete2FALogin,
  refreshToken,
  logout,
  logoutAll,
  verifyToken,
  changePassword,
  getProfile,
  updateUserRole,
  listUsers,
  generateTokenPair, // For internal use
};

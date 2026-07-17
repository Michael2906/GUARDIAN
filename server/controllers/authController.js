const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, StorageCompany, ClientBusiness } = require("../models");

// Standard includes to emulate Mongo's populate of company/client business.
const AUTH_INCLUDES = [
  { model: StorageCompany, as: "storageCompany" },
  { model: ClientBusiness, as: "clientBusiness" },
];

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
    userId: user.id,
    email: user.email,
    role: user.userType,
    storageCompanyId: user.storageCompanyId || null,
    permissions: user.permissions || {},
    isEmailVerified: user.isEmailVerified,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken({ userId: user.id }),
  };
};

// Build the frontend-facing user object (identical shape to the Mongo build).
const buildUserData = (user, extra = {}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.userType,
  permissions: user.permissions,
  isEmailVerified: user.isEmailVerified,
  storageCompany: user.storageCompany
    ? {
        id: user.storageCompany.id,
        name: user.storageCompany.name,
        email: user.storageCompany.email,
        isActive: user.storageCompany.isActive,
      }
    : null,
  clientBusiness: user.clientBusiness
    ? {
        id: user.clientBusiness.id,
        name: user.clientBusiness.name,
        clientCode: user.clientBusiness.clientCode,
        isActive: user.clientBusiness.isActive,
      }
    : null,
  ...extra,
});

const pushRefreshToken = (user, refreshToken, req) => {
  const list = user.refreshTokens || [];
  list.push({
    token: refreshToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: req.get("User-Agent"),
    ipAddress: req.ip,
  });
  user.refreshTokens = list.slice(-5); // keep last 5
};

/**
 * User Login — POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const user = await User.findOne({
      where: { email: email.toLowerCase(), isActive: true },
      include: AUTH_INCLUDES,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    if (user.storageCompany && !user.storageCompany.isActive) {
      return res.status(401).json({
        success: false,
        error:
          "Storage company account is inactive. Please contact GUARDIAN support.",
      });
    }

    if (user.clientBusiness && !user.clientBusiness.isActive) {
      return res.status(401).json({
        success: false,
        error:
          "Client business account is inactive. Please contact your storage company.",
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

    // Verify password (password column is always loaded)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
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

    // Reset failed attempts on success
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;

    // 2FA gate
    if (user.twoFactorAuth && user.twoFactorAuth.enabled) {
      const tempSessionToken = jwt.sign(
        { userId: user.id, step: "2fa_required" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );

      await user.save();

      return res.json({
        success: true,
        message:
          "Password verified. Please enter your 6-digit authentication code.",
        requiresTwoFactor: true,
        data: {
          userId: user.id,
          email: user.email,
          tempSession: tempSessionToken,
        },
      });
    }

    // Complete login for non-2FA users
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;

    const tokens = generateTokenPair(user);
    pushRefreshToken(user, tokens.refreshToken, req);
    await user.save();

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: buildUserData(user),
        tokens,
        sessionExpiry: new Date(Date.now() + 15 * 60 * 1000),
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
 * Complete 2FA Login — POST /api/auth/login-2fa
 */
const complete2FALogin = async (req, res) => {
  try {
    const { userId, token, tempSession } = req.body;

    if (!userId || !token || !tempSession) {
      return res.status(400).json({
        success: false,
        error: "User ID, 2FA token, and temporary session are required",
      });
    }

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

    const user = await User.findByPk(userId, { include: AUTH_INCLUDES });

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

    const speakeasy = require("speakeasy");
    const crypto = require("crypto");

    let verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.secret,
      encoding: "base32",
      token,
      window: 2,
    });

    let usedBackupCode = false;
    const tfa = user.twoFactorAuth;

    if (!verified && tfa.backupCodes && tfa.backupCodes.length > 0) {
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
      const idx = tfa.backupCodes.indexOf(hashedToken);
      if (idx !== -1) {
        tfa.backupCodes.splice(idx, 1);
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

    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;
    tfa.lastUsedAt = new Date();
    user.twoFactorAuth = tfa; // ensure setter marks the column dirty

    const tokens = generateTokenPair(user);
    pushRefreshToken(user, tokens.refreshToken, req);
    await user.save();

    res.json({
      success: true,
      message: usedBackupCode
        ? `2FA login successful using backup code. ${tfa.backupCodes.length} backup codes remaining.`
        : "2FA login successful",
      data: {
        user: buildUserData(user, { twoFactorEnabled: true }),
        tokens,
        sessionExpiry: new Date(Date.now() + 15 * 60 * 1000),
        usedBackupCode,
        remainingBackupCodes: tfa.backupCodes.length,
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
 * Refresh Access Token — POST /api/auth/refresh
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

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired refresh token",
      });
    }

    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    const tokenExists = (user.refreshTokens || []).some(
      (t) => t.token === refreshToken && new Date(t.expiresAt) > new Date()
    );

    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        error: "Refresh token not found or expired",
      });
    }

    const tokens = generateTokenPair(user);

    // Rotate: drop old token, add new
    user.refreshTokens = (user.refreshTokens || []).filter(
      (t) => t.token !== refreshToken
    );
    pushRefreshToken(user, tokens.refreshToken, req);
    await user.save();

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        tokens,
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
 * Logout — POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user?.userId;

    if (userId && refreshToken) {
      const user = await User.findByPk(userId);
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter(
          (t) => t.token !== refreshToken
        );
        await user.save();
      }
    }

    res.json({ success: true, message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false, error: "Logout failed" });
  }
};

/**
 * Logout All — POST /api/auth/logout-all
 */
const logoutAll = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (userId) {
      const user = await User.findByPk(userId);
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
    res.status(500).json({ success: false, error: "Logout failed" });
  }
};

/**
 * Verify Token — GET /api/auth/verify
 */
const verifyToken = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      include: [{ model: StorageCompany, as: "storageCompany" }],
    });

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
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.userType,
          permissions: user.permissions,
          isEmailVerified: user.isEmailVerified,
          storageCompany: user.storageCompany
            ? {
                id: user.storageCompany.id,
                name: user.storageCompany.name,
                email: user.storageCompany.email,
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
 * Change Password — POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

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

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

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

    user.password = newPassword; // hashed by beforeUpdate hook
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
    res.status(500).json({ success: false, error: "Password change failed" });
  }
};

/**
 * Get Profile — GET /api/auth/profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      include: AUTH_INCLUDES,
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve profile",
    });
  }
};

/**
 * Update User Role (Admin) — PUT /api/auth/users/:userId/role
 */
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType, permissions } = req.body;
    const adminUserId = req.user.userId;

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
      return res.status(400).json({ success: false, error: "Invalid user type" });
    }

    const adminUser = await User.findByPk(adminUserId);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        error: "Admin user not found",
      });
    }

    if (!adminUser.hasPermission("administration", "manageUsers")) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions to manage users",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (
      adminUser.userType === "storage-admin" &&
      String(user.storageCompanyId) !== String(adminUser.storageCompanyId)
    ) {
      return res.status(403).json({
        success: false,
        error: "Can only manage users within your storage company",
      });
    }

    if (
      adminUser.userType === "client-admin" &&
      user.clientBusinessId &&
      String(user.clientBusinessId) !== String(adminUser.clientBusinessId)
    ) {
      return res.status(403).json({
        success: false,
        error: "Can only manage users within your client business",
      });
    }

    const oldUserType = user.userType;
    user.userType = userType;
    user.lastModifiedBy = adminUserId;
    user.setDefaultPermissions();

    if (permissions) {
      const merged = user.permissions;
      Object.keys(permissions).forEach((category) => {
        if (merged[category]) {
          Object.keys(permissions[category]).forEach((action) => {
            merged[category][action] = permissions[category][action];
          });
        }
      });
      user.permissions = merged;
    }

    user.refreshTokens = [];
    await user.save();

    res.json({
      success: true,
      message: `User role updated from ${oldUserType} to ${userType}`,
      data: {
        user: {
          id: user.id,
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
 * List Users (Admin) — GET /api/auth/users
 */
const listUsers = async (req, res) => {
  try {
    const adminUserId = req.user.userId;
    const { page = 1, limit = 20, userType, search } = req.query;

    const adminUser = await User.findByPk(adminUserId);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        error: "Admin user not found",
      });
    }

    if (
      !adminUser.hasPermission("administration", "manageUsers") &&
      !adminUser.hasPermission("administration", "viewAllData")
    ) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions to view users",
      });
    }

    const where = { isActive: true };

    if (adminUser.userType === "storage-admin") {
      where.storageCompanyId = adminUser.storageCompanyId;
    }
    if (adminUser.userType === "client-admin") {
      where.clientBusinessId = adminUser.clientBusinessId;
    }
    if (userType) where.userType = userType;

    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { rows: users, count: totalCount } = await User.findAndCountAll({
      where,
      include: [
        { model: StorageCompany, as: "storageCompany" },
        { model: ClientBusiness, as: "clientBusiness" },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
      distinct: true,
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
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
  generateTokenPair,
};

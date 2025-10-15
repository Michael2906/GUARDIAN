const jwt = require("jsonwebtoken");
const { User } = require("../models");

/**
 * JWT Authentication Middleware
 *
 * Verifies JWT access token and adds user information to req.user
 * Supports different user roles and multi-tenant access control
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access token required",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("JWT decoded payload:", decoded);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Access token expired",
          tokenExpired: true,
        });
      }

      return res.status(401).json({
        success: false,
        error: "Invalid access token",
      });
    }

    // Verify user still exists and is active
    const user = await User.findById(decoded.userId).populate(
      "storageCompanyId"
    );
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    // Check if password was changed after token was issued (if this field exists)
    if (
      user.passwordChangedAt &&
      user.passwordChangedAt > new Date(decoded.iat * 1000)
    ) {
      return res.status(401).json({
        success: false,
        error: "Password was changed. Please log in again.",
      });
    }

    // Check if storage company is still active (for non-guardian users)
    if (decoded.role !== "guardian-admin" && user.storageCompanyId) {
      if (user.storageCompanyId.registrationStatus !== "active") {
        return res.status(401).json({
          success: false,
          error: "Storage company is inactive",
        });
      }
    }

    // Add user information to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      userType: decoded.role, // Add userType for backward compatibility
      storageCompanyId: decoded.storageCompanyId,
      permissions: decoded.permissions || [],
      isEmailVerified: decoded.isEmailVerified,
      userData: user, // Full user object for additional checks
    };

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
};

/**
 * Role-based Authorization Middleware
 *
 * Usage: requireRole(['guardian-admin', 'company-admin'])
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
      });
    }

    next();
  };
};

/**
 * Permission-based Authorization Middleware
 *
 * Usage: requirePermission('manage_inventory')
 */
const requirePermission = (category, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Storage admins have all permissions within their scope
    if (req.user.role === "storage-admin") {
      return next();
    }

    // Check if user has the required permission
    const hasPermission =
      req.user.permissions &&
      req.user.permissions[category] &&
      req.user.permissions[category][action] === true;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: `Permission '${category}.${action}' required`,
      });
    }

    next();
  };
};

/**
 * Multi-tenant Data Isolation Middleware
 *
 * Ensures users can only access data from their own storage company
 * Guardian admins can access all data
 */
const enforceDataIsolation = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  // Guardian admins can access all data
  if (req.user.role === "guardian-admin") {
    return next();
  }

  // Add storage company filter to request for database queries
  req.tenantFilter = {
    storageCompanyId: req.user.storageCompanyId,
  };

  next();
};

/**
 * Email Verification Middleware
 *
 * Requires user to have verified their email address
 */
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      error: "Email verification required",
    });
  }

  next();
};

/**
 * Optional Authentication Middleware
 *
 * Adds user info to request if token is provided, but doesn't require authentication
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).populate(
        "storageCompanyId"
      );

      if (user && user.isActive) {
        req.user = {
          id: decoded.userId,
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          userType: decoded.role, // Add userType for backward compatibility
          storageCompanyId: decoded.storageCompanyId,
          permissions: decoded.permissions || [],
          isEmailVerified: decoded.isEmailVerified,
          userData: user,
        };
      }
    } catch (error) {
      // Token invalid but we don't care for optional auth
      console.log("Optional auth token invalid:", error.message);
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next(); // Continue without authentication
  }
};

/**
 * API Key Authentication Middleware (for external integrations)
 *
 * Supports API key authentication for storage companies
 */
const authenticateAPIKey = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key required",
      });
    }

    // Find storage company by API key
    const { Company } = require("../models");
    const company = await Company.findOne({
      "apiKeys.key": apiKey,
      "apiKeys.isActive": true,
      isActive: true,
    });

    if (!company) {
      return res.status(401).json({
        success: false,
        error: "Invalid API key",
      });
    }

    // Add company info to request
    req.apiAuth = {
      storageCompanyId: company._id,
      companyName: company.name,
      apiKeyUsed: apiKey,
    };

    // Add tenant filter for data isolation
    req.tenantFilter = {
      storageCompanyId: company._id,
    };

    next();
  } catch (error) {
    console.error("API key authentication error:", error);
    res.status(500).json({
      success: false,
      error: "API authentication failed",
    });
  }
};

/**
 * Rate limiting for authentication endpoints
 */
const authRateLimit = require("express-rate-limit")({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: "Too many authentication attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true,
});

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
  enforceDataIsolation,
  requireEmailVerification,
  optionalAuth,
  authenticateAPIKey,
  authRateLimit,
};

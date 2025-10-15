const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { User, Company } = require("../models");
const { authenticateToken } = require("../middleware/auth");

/**
 * User Management Routes
 * For GUARDIAN admins and storage company admins to manage users
 */

/**
 * GET /api/users
 * List all users (filtered by permissions)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userType,
      search,
      storageCompanyId,
      twoFactorStatus,
    } = req.query;
    const currentUser = req.user;

    // Debug logging
    console.log("Current user in users route:", {
      userId: currentUser.userId,
      email: currentUser.email,
      role: currentUser.role,
      userType: currentUser.userType,
    });

    // Build query based on user permissions
    let query = { isActive: true };

    // GUARDIAN admins can see all users
    if (currentUser.userType !== "guardian-admin") {
      // Storage admins can only see users within their company
      if (currentUser.userType === "storage-admin") {
        query.storageCompanyId = currentUser.storageCompanyId;
      }
      // Client admins can only see users within their client business
      else if (currentUser.userType === "client-admin") {
        query.clientBusinessId = currentUser.clientBusinessId;
      } else {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions to view users",
        });
      }
    }

    // Apply filters
    if (userType) query.userType = userType;
    if (storageCompanyId) query.storageCompanyId = storageCompanyId;

    // Filter by 2FA status
    if (twoFactorStatus) {
      if (twoFactorStatus === "enabled") {
        query["twoFactorAuth.enabled"] = true;
      } else if (twoFactorStatus === "disabled") {
        query["twoFactorAuth.enabled"] = { $ne: true };
      }
    }

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
        .populate("createdBy", "firstName lastName email")
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
});

/**
 * POST /api/users
 * Create new user
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      userType,
      storageCompanyId,
      clientBusinessId,
      jobTitle,
      department,
      permissions,
    } = req.body;

    const currentUser = req.user;

    // Validation
    if (!email || !password || !firstName || !lastName || !userType) {
      return res.status(400).json({
        success: false,
        error:
          "Email, password, first name, last name, and user type are required",
      });
    }

    // Storage company is required for non-GUARDIAN admin users
    if (userType !== "guardian-admin" && !storageCompanyId) {
      return res.status(400).json({
        success: false,
        error: "Storage company is required for this user type",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters long",
      });
    }

    // Valid user types
    const validUserTypes = [
      "guardian-admin",
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

    // Check permissions
    if (currentUser.userType !== "guardian-admin") {
      // Only GUARDIAN admins can create GUARDIAN admins
      if (userType === "guardian-admin") {
        return res.status(403).json({
          success: false,
          error: "Only GUARDIAN admins can create GUARDIAN admin users",
        });
      }

      // Storage admins can only create users within their company
      if (currentUser.userType === "storage-admin") {
        if (storageCompanyId !== currentUser.storageCompanyId._id.toString()) {
          return res.status(403).json({
            success: false,
            error: "Can only create users within your storage company",
          });
        }
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      storageCompanyId,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User with this email already exists in this storage company",
      });
    }

    // Verify storage company exists (if provided)
    if (storageCompanyId) {
      const storageCompany = await Company.findById(storageCompanyId);
      if (!storageCompany) {
        return res.status(400).json({
          success: false,
          error: "Storage company not found",
        });
      }
    }

    // For client users, verify client business exists
    if (["client-admin", "client-user", "client-viewer"].includes(userType)) {
      if (!clientBusinessId) {
        return res.status(400).json({
          success: false,
          error: "Client business ID is required for client users",
        });
      }
    }

    // Create new user
    const newUser = new User({
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save middleware
      firstName,
      lastName,
      userType,
      storageCompanyId,
      clientBusinessId: clientBusinessId || null,
      jobTitle: jobTitle || "",
      department: department || "",
      isEmailVerified: true, // Admin-created users are pre-verified
      createdBy: currentUser.userId,
    });

    // Apply custom permissions if provided
    if (permissions) {
      Object.keys(permissions).forEach((category) => {
        if (newUser.permissions[category]) {
          Object.keys(permissions[category]).forEach((action) => {
            newUser.permissions[category][action] =
              permissions[category][action];
          });
        }
      });
    }

    await newUser.save();

    // Return user without sensitive data
    const userResponse = await User.findById(newUser._id)
      .select("-password -refreshTokens -twoFactorAuth.secret")
      .populate("storageCompanyId", "name email")
      .populate("clientBusinessId", "name clientCode")
      .populate("createdBy", "firstName lastName email");

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { user: userResponse },
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create user",
    });
  }
});

/**
 * GET /api/users/:userId
 * Get user by ID
 */
router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    const user = await User.findById(userId)
      .select("-password -refreshTokens -twoFactorAuth.secret")
      .populate("storageCompanyId", "name email")
      .populate("clientBusinessId", "name clientCode")
      .populate("createdBy", "firstName lastName email")
      .populate("lastModifiedBy", "firstName lastName email");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check permissions
    if (currentUser.userType !== "guardian-admin") {
      if (currentUser.userType === "storage-admin") {
        if (
          user.storageCompanyId._id.toString() !==
          currentUser.storageCompanyId._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            error: "Cannot access users from other storage companies",
          });
        }
      } else if (currentUser.userType === "client-admin") {
        if (
          !user.clientBusinessId ||
          user.clientBusinessId._id.toString() !==
            currentUser.clientBusinessId._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            error: "Cannot access users from other client businesses",
          });
        }
      }
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve user",
    });
  }
});

/**
 * PUT /api/users/:userId
 * Update user
 */
router.put("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    const updates = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check permissions
    if (currentUser.userType !== "guardian-admin") {
      if (currentUser.userType === "storage-admin") {
        if (
          user.storageCompanyId.toString() !==
          currentUser.storageCompanyId._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            error: "Cannot modify users from other storage companies",
          });
        }
      }
    }

    // Prevent updating sensitive fields
    delete updates.password;
    delete updates._id;
    delete updates.refreshTokens;
    delete updates.twoFactorAuth;

    // Update allowed fields
    const allowedUpdates = [
      "firstName",
      "lastName",
      "jobTitle",
      "department",
      "userType",
      "permissions",
      "isActive",
    ];

    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        user[key] = updates[key];
      }
    });

    user.lastModifiedBy = currentUser.userId;
    await user.save();

    const updatedUser = await User.findById(userId)
      .select("-password -refreshTokens -twoFactorAuth.secret")
      .populate("storageCompanyId", "name email")
      .populate("clientBusinessId", "name clientCode")
      .populate("lastModifiedBy", "firstName lastName email");

    res.json({
      success: true,
      message: "User updated successfully",
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
});

/**
 * DELETE /api/users/:userId
 * Soft delete user (set isActive to false)
 */
router.delete("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check permissions
    if (currentUser.userType !== "guardian-admin") {
      if (currentUser.userType === "storage-admin") {
        if (
          user.storageCompanyId.toString() !==
          currentUser.storageCompanyId._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            error: "Cannot delete users from other storage companies",
          });
        }
      }
    }

    // Prevent self-deletion
    if (userId === currentUser.userId) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete your own account",
      });
    }

    // Soft delete
    user.isActive = false;
    user.lastModifiedBy = currentUser.userId;
    await user.save();

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user",
    });
  }
});

module.exports = router;

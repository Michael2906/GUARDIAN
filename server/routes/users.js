const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { User, StorageCompany, ClientBusiness } = require("../models");
const { authenticateToken } = require("../middleware/auth");

const USER_INCLUDES = [
  { model: StorageCompany, as: "storageCompany" },
  { model: ClientBusiness, as: "clientBusiness" },
];

const VALID_USER_TYPES = [
  "guardian-admin",
  "storage-admin",
  "storage-manager",
  "storage-employee",
  "client-admin",
  "client-user",
  "client-viewer",
];

/**
 * GET /api/users — list users (scoped by permissions)
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

    const where = { isActive: true };

    if (currentUser.userType !== "guardian-admin") {
      if (currentUser.userType === "storage-admin") {
        where.storageCompanyId = currentUser.storageCompanyId;
      } else if (currentUser.userType === "client-admin") {
        where.clientBusinessId = currentUser.clientBusinessId;
      } else {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions to view users",
        });
      }
    }

    if (userType) where.userType = userType;
    if (storageCompanyId) where.storageCompanyId = storageCompanyId;

    // twoFactorAuth is a JSON string column; match on its serialised content.
    if (twoFactorStatus === "enabled") {
      where.twoFactorAuth = { [Op.like]: '%"enabled":true%' };
    } else if (twoFactorStatus === "disabled") {
      where.twoFactorAuth = { [Op.notLike]: '%"enabled":true%' };
    }

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
      include: USER_INCLUDES,
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
    res.status(500).json({ success: false, error: "Failed to retrieve users" });
  }
});

/**
 * POST /api/users — create a user
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

    if (!email || !password || !firstName || !lastName || !userType) {
      return res.status(400).json({
        success: false,
        error:
          "Email, password, first name, last name, and user type are required",
      });
    }

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

    if (!VALID_USER_TYPES.includes(userType)) {
      return res.status(400).json({ success: false, error: "Invalid user type" });
    }

    if (currentUser.userType !== "guardian-admin") {
      if (userType === "guardian-admin") {
        return res.status(403).json({
          success: false,
          error: "Only GUARDIAN admins can create GUARDIAN admin users",
        });
      }
      if (
        currentUser.userType === "storage-admin" &&
        String(storageCompanyId) !== String(currentUser.storageCompanyId)
      ) {
        return res.status(403).json({
          success: false,
          error: "Can only create users within your storage company",
        });
      }
    }

    const existingUser = await User.findOne({
      where: { email: email.toLowerCase(), storageCompanyId: storageCompanyId || null },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User with this email already exists in this storage company",
      });
    }

    if (storageCompanyId) {
      const company = await StorageCompany.findByPk(storageCompanyId);
      if (!company) {
        return res.status(400).json({
          success: false,
          error: "Storage company not found",
        });
      }
    }

    if (["client-admin", "client-user", "client-viewer"].includes(userType) && !clientBusinessId) {
      return res.status(400).json({
        success: false,
        error: "Client business ID is required for client users",
      });
    }

    const newUser = await User.create({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      userType,
      storageCompanyId: storageCompanyId || null,
      clientBusinessId: clientBusinessId || null,
      jobTitle: jobTitle || "",
      department: department || "",
      isEmailVerified: true,
      createdBy: currentUser.userId,
    });

    // Apply any custom permission overrides on top of role defaults.
    if (permissions) {
      const merged = newUser.permissions;
      Object.keys(permissions).forEach((category) => {
        if (merged[category]) {
          Object.keys(permissions[category]).forEach((action) => {
            merged[category][action] = permissions[category][action];
          });
        }
      });
      newUser.permissions = merged;
      await newUser.save();
    }

    const userResponse = await User.findByPk(newUser.id, { include: USER_INCLUDES });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { user: userResponse },
    });
  } catch (error) {
    console.error("Create user error:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        error: "A user with this email already exists",
      });
    }
    res.status(500).json({ success: false, error: "Failed to create user" });
  }
});

/**
 * GET /api/users/:userId
 */
router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    const user = await User.findByPk(userId, { include: USER_INCLUDES });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (currentUser.userType === "storage-admin") {
      if (String(user.storageCompanyId) !== String(currentUser.storageCompanyId)) {
        return res.status(403).json({
          success: false,
          error: "Cannot access users from other storage companies",
        });
      }
    } else if (currentUser.userType === "client-admin") {
      if (String(user.clientBusinessId) !== String(currentUser.clientBusinessId)) {
        return res.status(403).json({
          success: false,
          error: "Cannot access users from other client businesses",
        });
      }
    }

    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve user" });
  }
});

/**
 * PUT /api/users/:userId
 */
router.put("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    const updates = { ...req.body };

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (
      currentUser.userType === "storage-admin" &&
      String(user.storageCompanyId) !== String(currentUser.storageCompanyId)
    ) {
      return res.status(403).json({
        success: false,
        error: "Cannot modify users from other storage companies",
      });
    }

    // Never allow these through a profile update.
    delete updates.password;
    delete updates.id;
    delete updates._id;
    delete updates.refreshTokens;
    delete updates.twoFactorAuth;

    const allowedUpdates = [
      "firstName",
      "lastName",
      "jobTitle",
      "department",
      "userType",
      "permissions",
      "isActive",
    ];

    allowedUpdates.forEach((key) => {
      if (updates[key] !== undefined) user[key] = updates[key];
    });

    user.lastModifiedBy = currentUser.userId;
    await user.save();

    const updatedUser = await User.findByPk(userId, { include: USER_INCLUDES });

    res.json({
      success: true,
      message: "User updated successfully",
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});

/**
 * DELETE /api/users/:userId — soft delete
 */
router.delete("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (
      currentUser.userType === "storage-admin" &&
      String(user.storageCompanyId) !== String(currentUser.storageCompanyId)
    ) {
      return res.status(403).json({
        success: false,
        error: "Cannot delete users from other storage companies",
      });
    }

    if (String(userId) === String(currentUser.userId)) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete your own account",
      });
    }

    user.isActive = false;
    user.lastModifiedBy = currentUser.userId;
    await user.save();

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
});

module.exports = router;

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// User Schema for 3PL Platform - Supports Multiple User Types
const userSchema = new mongoose.Schema(
  {
    // User Type & Company Associations
    userType: {
      type: String,
      enum: [
        "storage-admin",
        "storage-manager",
        "storage-employee",
        "client-admin",
        "client-user",
        "client-viewer",
      ],
      required: true,
      index: true,
    },

    // Storage Company Association (Always Required)
    storageCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageCompany",
      required: true,
      index: true,
    },

    // Client Business Association (Only for client users)
    clientBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientBusiness",
      index: true,
    },

    // User Authentication
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false, // Don't return password by default
    },

    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    // Job Information
    jobTitle: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    // Role-Based Permissions (varies by user type)
    permissions: {
      // Storage Company Operations
      storageOperations: {
        viewAllClients: { type: Boolean, default: false },
        manageClients: { type: Boolean, default: false },
        viewInventory: { type: Boolean, default: true },
        manageInventory: { type: Boolean, default: false },
        processReceiving: { type: Boolean, default: false },
        processShipping: { type: Boolean, default: false },
        manageBilling: { type: Boolean, default: false },
      },

      // Client Business Operations (for client users)
      clientOperations: {
        viewOwnInventory: { type: Boolean, default: true },
        submitOrders: { type: Boolean, default: false },
        viewReports: { type: Boolean, default: true },
        exportData: { type: Boolean, default: false },
        viewBilling: { type: Boolean, default: false },
        manageUsers: { type: Boolean, default: false },
      },

      // Administrative Functions
      administration: {
        manageUsers: { type: Boolean, default: false },
        viewAllData: { type: Boolean, default: false },
        modifySettings: { type: Boolean, default: false },
        accessReports: { type: Boolean, default: false },
        manageIntegrations: { type: Boolean, default: false },
      },

      // System Access
      systemAccess: {
        mobileApp: { type: Boolean, default: true },
        webPortal: { type: Boolean, default: true },
        apiAccess: { type: Boolean, default: false },
        bulkOperations: { type: Boolean, default: false },
      },
    },

    // Access Restrictions (based on user type and client)
    accessRestrictions: {
      // For client users: which warehouses can they see?
      allowedWarehouses: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
      ],

      // IP restrictions
      allowedIPs: [String],

      // Time restrictions
      accessSchedule: {
        allowedDays: [{ type: Number, min: 0, max: 6 }], // 0=Sunday, 6=Saturday
        allowedHours: {
          start: String, // "08:00"
          end: String, // "18:00"
        },
      },

      // Feature restrictions
      restrictedFeatures: [String], // Features this user cannot access
    },

    // Two-Factor Authentication
    twoFactorAuth: {
      enabled: { type: Boolean, default: false },
      secret: String, // TOTP secret
      backupCodes: [String], // Single-use backup codes
      lastUsedAt: Date,
    },

    // User Preferences
    preferences: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      language: { type: String, default: "en" },
      timezone: String,
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        lowStock: { type: Boolean, default: true },
        reports: { type: Boolean, default: false },
      },
    },

    // Security & Session Management
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    isEmailVerified: { type: Boolean, default: false },

    // Login tracking
    lastLoginAt: Date,
    lastLoginIP: String,
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: Date,

    // Refresh tokens for JWT
    refreshTokens: [
      {
        token: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        userAgent: String,
        ipAddress: String,
      },
    ],

    // Status
    isActive: { type: Boolean, default: true },

    // Audit Trail
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

// Compound indexes for 3PL multi-tenant queries
userSchema.index({ storageCompanyId: 1, email: 1 }, { unique: true }); // Unique email per storage company
userSchema.index({ storageCompanyId: 1, userType: 1 });
userSchema.index({ storageCompanyId: 1, isActive: 1 });
userSchema.index({ clientBusinessId: 1, userType: 1 }); // For client user queries
userSchema.index({ email: 1 });
userSchema.index({ userType: 1, isActive: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ emailVerificationToken: 1 });

// Pre-save middleware for password hashing
userSchema.pre("save", async function (next) {
  // Only hash password if it's modified
  if (!this.isModified("password")) return next();

  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to set default permissions and validate associations
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Set default permissions if this is a new user
  if (this.isNew) {
    this.setDefaultPermissions();
  }

  // Validate that client users have a clientBusinessId
  if (this.isClientUser() && !this.clientBusinessId) {
    return next(new Error("Client users must have a clientBusinessId"));
  }

  // Validate that storage users don't have a clientBusinessId
  if (this.isStorageUser() && this.clientBusinessId) {
    return next(
      new Error("Storage company users should not have a clientBusinessId")
    );
  }

  next();
});

// Instance Methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

userSchema.methods.generatePasswordResetToken = function () {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return token;
};

userSchema.methods.generateEmailVerificationToken = function () {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");

  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  return token;
};

userSchema.methods.incrementFailedAttempts = function () {
  // Lock account after 5 failed attempts for 30 minutes
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    this.accountLockedUntil = Date.now() + 30 * 60 * 1000;
  }
  this.failedLoginAttempts += 1;
  return this.save();
};

userSchema.methods.resetFailedAttempts = function () {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  return this.save();
};

userSchema.methods.addRefreshToken = function (token, userAgent, ipAddress) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  this.refreshTokens.push({
    token,
    userAgent,
    ipAddress,
    expiresAt,
  });

  // Keep only last 5 refresh tokens
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }

  return this.save();
};

userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
  return this.save();
};

userSchema.methods.hasPermission = function (category, action) {
  // Storage admins have all storage permissions
  if (this.userType === "storage-admin") {
    return category !== "clientOperations"; // Can't perform client-only operations
  }

  const permission = this.permissions[category];
  return permission && permission[action] === true;
};

userSchema.methods.canAccessClient = function (clientBusinessId) {
  // Storage company users can access all clients
  if (
    ["storage-admin", "storage-manager", "storage-employee"].includes(
      this.userType
    )
  ) {
    return true;
  }

  // Client users can only access their own business
  return (
    this.clientBusinessId &&
    this.clientBusinessId.toString() === clientBusinessId.toString()
  );
};

userSchema.methods.canAccessWarehouse = function (warehouseId) {
  // Storage company users can access all warehouses
  if (
    ["storage-admin", "storage-manager", "storage-employee"].includes(
      this.userType
    )
  ) {
    return true;
  }

  // Client users can only access allowed warehouses
  if (this.accessRestrictions.allowedWarehouses.length === 0) return true;
  return this.accessRestrictions.allowedWarehouses.some(
    (id) => id.toString() === warehouseId.toString()
  );
};

userSchema.methods.isStorageUser = function () {
  return ["storage-admin", "storage-manager", "storage-employee"].includes(
    this.userType
  );
};

userSchema.methods.isClientUser = function () {
  return ["client-admin", "client-user", "client-viewer"].includes(
    this.userType
  );
};

// Set default permissions based on user type
userSchema.methods.setDefaultPermissions = function () {
  const defaults = {
    "storage-admin": {
      storageOperations: {
        viewAllClients: true,
        manageClients: true,
        viewInventory: true,
        manageInventory: true,
        processReceiving: true,
        processShipping: true,
        manageBilling: true,
      },
      administration: {
        manageUsers: true,
        viewAllData: true,
        modifySettings: true,
        accessReports: true,
        manageIntegrations: true,
      },
    },

    "storage-manager": {
      storageOperations: {
        viewAllClients: true,
        manageClients: false,
        viewInventory: true,
        manageInventory: true,
        processReceiving: true,
        processShipping: true,
        manageBilling: false,
      },
      administration: {
        accessReports: true,
      },
    },

    "storage-employee": {
      storageOperations: {
        viewInventory: true,
        processReceiving: true,
        processShipping: true,
      },
    },

    "client-admin": {
      clientOperations: {
        viewOwnInventory: true,
        submitOrders: true,
        viewReports: true,
        exportData: true,
        viewBilling: true,
        manageUsers: true,
      },
    },

    "client-user": {
      clientOperations: {
        viewOwnInventory: true,
        submitOrders: true,
        viewReports: true,
      },
    },

    "client-viewer": {
      clientOperations: {
        viewOwnInventory: true,
        viewReports: true,
      },
    },
  };

  const defaultPerms = defaults[this.userType] || {};
  Object.keys(defaultPerms).forEach((category) => {
    Object.keys(defaultPerms[category]).forEach((action) => {
      if (!this.permissions[category]) this.permissions[category] = {};
      this.permissions[category][action] = defaultPerms[category][action];
    });
  });
};

// Virtual properties
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual("isLocked").get(function () {
  return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
});

// Static methods for 3PL multi-tenant queries
userSchema.statics.findByStorageCompanyAndEmail = function (
  storageCompanyId,
  email
) {
  return this.findOne({ storageCompanyId, email, isActive: true });
};

userSchema.statics.findStorageCompanyUsers = function (
  storageCompanyId,
  options = {}
) {
  const query = { storageCompanyId, isActive: true };
  if (options.userType) query.userType = options.userType;
  if (options.clientBusinessId)
    query.clientBusinessId = options.clientBusinessId;

  return this.find(query)
    .populate("clientBusinessId", "name clientCode")
    .populate("createdBy", "firstName lastName email")
    .sort({ createdAt: -1 });
};

userSchema.statics.findClientBusinessUsers = function (
  clientBusinessId,
  options = {}
) {
  const query = { clientBusinessId, isActive: true };
  if (options.userType) query.userType = options.userType;

  return this.find(query)
    .populate("storageCompanyId", "name slug")
    .sort({ createdAt: -1 });
};

userSchema.statics.findStorageUsers = function (storageCompanyId) {
  return this.find({
    storageCompanyId,
    userType: { $in: ["storage-admin", "storage-manager", "storage-employee"] },
    isActive: true,
  });
};

userSchema.statics.findClientUsers = function (
  storageCompanyId,
  clientBusinessId = null
) {
  const query = {
    storageCompanyId,
    userType: { $in: ["client-admin", "client-user", "client-viewer"] },
    isActive: true,
  };

  if (clientBusinessId) query.clientBusinessId = clientBusinessId;

  return this.find(query);
};

userSchema.statics.countStorageCompanyUsers = function (storageCompanyId) {
  return this.countDocuments({ storageCompanyId, isActive: true });
};

userSchema.statics.countClientUsers = function (clientBusinessId) {
  return this.countDocuments({ clientBusinessId, isActive: true });
};

// Ensure we don't return sensitive data by default
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.twoFactorAuth.secret;
  delete user.refreshTokens;
  delete user.passwordResetToken;
  delete user.emailVerificationToken;
  return user;
};

module.exports = mongoose.model("User", userSchema);

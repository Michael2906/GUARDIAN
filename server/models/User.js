const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { jsonAttr, attachJsonHooks, deepClone } = require("./_json");

const USER_TYPES = [
  "guardian-admin",
  "storage-admin",
  "storage-manager",
  "storage-employee",
  "client-admin",
  "client-user",
  "client-viewer",
];

// Default permission matrix by user type (mirrors the original Mongoose model).
const DEFAULT_PERMISSIONS = {
  "guardian-admin": {
    storageOperations: { viewAllClients: true, manageClients: true, viewInventory: true, manageInventory: true, processReceiving: true, processShipping: true, manageBilling: true },
    clientOperations: { viewOwnInventory: true, submitOrders: true, viewReports: true, exportData: true, viewBilling: true, manageUsers: true },
    administration: { manageUsers: true, viewAllData: true, modifySettings: true, accessReports: true, manageIntegrations: true },
    systemAccess: { mobileApp: true, webPortal: true, apiAccess: true, bulkOperations: true },
  },
  "storage-admin": {
    storageOperations: { viewAllClients: true, manageClients: true, viewInventory: true, manageInventory: true, processReceiving: true, processShipping: true, manageBilling: true },
    administration: { manageUsers: true, viewAllData: true, modifySettings: true, accessReports: true, manageIntegrations: true },
  },
  "storage-manager": {
    storageOperations: { viewAllClients: true, manageClients: false, viewInventory: true, manageInventory: true, processReceiving: true, processShipping: true, manageBilling: false },
    administration: { accessReports: true },
  },
  "storage-employee": {
    storageOperations: { viewInventory: true, processReceiving: true, processShipping: true },
  },
  "client-admin": {
    clientOperations: { viewOwnInventory: true, submitOrders: true, viewReports: true, exportData: true, viewBilling: true, manageUsers: true },
  },
  "client-user": {
    clientOperations: { viewOwnInventory: true, submitOrders: true, viewReports: true },
  },
  "client-viewer": {
    clientOperations: { viewOwnInventory: true, viewReports: true },
  },
};

const BASE_PERMISSIONS = () => ({
  storageOperations: { viewAllClients: false, manageClients: false, viewInventory: true, manageInventory: false, processReceiving: false, processShipping: false, manageBilling: false },
  clientOperations: { viewOwnInventory: true, submitOrders: false, viewReports: true, exportData: false, viewBilling: false, manageUsers: false },
  administration: { manageUsers: false, viewAllData: false, modifySettings: false, accessReports: false, manageIntegrations: false },
  systemAccess: { mobileApp: true, webPortal: true, apiAccess: false, bulkOperations: false },
});

const DEFAULT_2FA = () => ({
  enabled: false,
  secret: null,
  backupCodes: [],
  lastUsedAt: null,
});

const DEFAULT_PREFERENCES = () => ({
  theme: "light",
  language: "en",
  timezone: null,
  notifications: { email: true, push: true, lowStock: true, reports: false },
});

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      userType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [USER_TYPES] },
      },

      storageCompanyId: { type: DataTypes.UUID, allowNull: true },
      clientBusinessId: { type: DataTypes.UUID, allowNull: true },

      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        set(val) {
          this.setDataValue("email", (val || "").toLowerCase().trim());
        },
        validate: { isEmail: true },
      },

      password: { type: DataTypes.STRING(255), allowNull: false },

      firstName: { type: DataTypes.STRING(50), allowNull: false },
      lastName: { type: DataTypes.STRING(50), allowNull: false },
      jobTitle: { type: DataTypes.STRING(100), allowNull: true },
      department: { type: DataTypes.STRING(100), allowNull: true },

      permissions: jsonAttr("permissions", BASE_PERMISSIONS()),
      accessRestrictions: jsonAttr("accessRestrictions", {
        allowedWarehouses: [],
        allowedIPs: [],
        restrictedFeatures: [],
      }),
      twoFactorAuth: jsonAttr("twoFactorAuth", DEFAULT_2FA()),
      preferences: jsonAttr("preferences", DEFAULT_PREFERENCES()),
      refreshTokens: jsonAttr("refreshTokens", []),

      passwordResetToken: { type: DataTypes.STRING(255), allowNull: true },
      passwordResetExpires: { type: DataTypes.DATE, allowNull: true },
      emailVerificationToken: { type: DataTypes.STRING(255), allowNull: true },
      isEmailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },

      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      lastLoginIP: { type: DataTypes.STRING(64), allowNull: true },
      failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
      accountLockedUntil: { type: DataTypes.DATE, allowNull: true },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "users",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["storageCompanyId", "email"] },
        { fields: ["email"] },
        { fields: ["userType", "isActive"] },
      ],
    }
  );

  attachJsonHooks(User, [
    "permissions",
    "accessRestrictions",
    "twoFactorAuth",
    "preferences",
    "refreshTokens",
  ]);

  // Hash the password whenever it is set to a new plaintext value.
  const hashPassword = async (user) => {
    if (user.changed("password")) {
      const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
      user.password = await bcrypt.hash(user.password, rounds);
    }
  };
  User.beforeCreate(async (user) => {
    if (user.isNewRecord) user.setDefaultPermissions();
    await hashPassword(user);
  });
  User.beforeUpdate(hashPassword);

  // ----- Virtuals for Mongo compatibility -----
  Object.defineProperty(User.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  Object.defineProperty(User.prototype, "fullName", {
    get() {
      return `${this.firstName} ${this.lastName}`;
    },
  });
  Object.defineProperty(User.prototype, "isLocked", {
    get() {
      return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
    },
  });

  // ----- Instance methods -----
  User.prototype.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
  };

  User.prototype.setDefaultPermissions = function () {
    const perms = BASE_PERMISSIONS();
    const overrides = DEFAULT_PERMISSIONS[this.userType] || {};
    Object.keys(overrides).forEach((category) => {
      perms[category] = { ...(perms[category] || {}), ...overrides[category] };
    });
    this.permissions = perms;
  };

  User.prototype.hasPermission = function (category, action) {
    if (this.userType === "storage-admin") {
      return category !== "clientOperations";
    }
    if (this.userType === "guardian-admin") {
      return true;
    }
    const p = this.permissions || {};
    return !!(p[category] && p[category][action] === true);
  };

  User.prototype.isGuardianAdmin = function () {
    return this.userType === "guardian-admin";
  };
  User.prototype.isStorageUser = function () {
    return ["storage-admin", "storage-manager", "storage-employee"].includes(this.userType);
  };
  User.prototype.isClientUser = function () {
    return ["client-admin", "client-user", "client-viewer"].includes(this.userType);
  };

  User.prototype.addRefreshToken = async function (token, userAgent, ipAddress) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const list = this.refreshTokens || [];
    list.push({ token, userAgent, ipAddress, createdAt: new Date(), expiresAt });
    this.refreshTokens = list.slice(-5);
    return this.save();
  };
  User.prototype.removeRefreshToken = function (token) {
    this.refreshTokens = (this.refreshTokens || []).filter((rt) => rt.token !== token);
    return this.save();
  };

  User.prototype.generatePasswordResetToken = function () {
    const token = crypto.randomBytes(32).toString("hex");
    this.passwordResetToken = crypto.createHash("sha256").update(token).digest("hex");
    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
    return token;
  };
  User.prototype.generateEmailVerificationToken = function () {
    const token = crypto.randomBytes(32).toString("hex");
    this.emailVerificationToken = crypto.createHash("sha256").update(token).digest("hex");
    return token;
  };

  // Strip sensitive fields from any JSON serialisation of a raw user row.
  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    delete values.password;
    delete values.refreshTokens;
    delete values.passwordResetToken;
    delete values.emailVerificationToken;
    if (values.twoFactorAuth) {
      const { secret, backupCodes, ...safe2fa } = values.twoFactorAuth;
      values.twoFactorAuth = safe2fa;
    }
    // Surface included associations under their Mongo-era names.
    if (this.storageCompany !== undefined) {
      values.storageCompanyId = this.storageCompany ? this.storageCompany.toJSON() : null;
    }
    if (this.clientBusiness !== undefined) {
      values.clientBusinessId = this.clientBusiness ? this.clientBusiness.toJSON() : null;
    }
    return values;
  };

  User.USER_TYPES = USER_TYPES;

  return User;
};

const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

const DEFAULT_PLATFORM_LIMITS = () => ({
  maxClientBusinesses: 5,
  maxWarehouses: 2,
  maxUsersTotal: 10,
  maxItemsPerWarehouse: 5000,
  maxStorageGB: 5,
  maxAPICallsPerMonth: 25000,
  maxMonthlyInvoices: 50,
});

const DEFAULT_PLATFORM_USAGE = () => ({
  clientBusinesses: 0,
  warehouses: 0,
  users: 0,
  totalItems: 0,
  storageUsedGB: 0,
  apiCallsThisMonth: 0,
  invoicesThisMonth: 0,
});

const DEFAULT_GUARDIAN_BILLING = () => ({
  subscriptionId: null,
  planName: "basic",
  billingStatus: "trial",
  monthlyRecurringRevenue: 0,
  customPricing: { isCustomPlan: false, adjustments: [] },
});

module.exports = (sequelize) => {
  const StorageCompany = sequelize.define(
    "StorageCompany",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      name: { type: DataTypes.STRING(100), allowNull: false },
      slug: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      companyType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "3pl-provider",
      },
      contactName: { type: DataTypes.STRING(100), allowNull: true },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        set(val) {
          this.setDataValue("email", (val || "").toLowerCase().trim());
        },
      },
      phone: { type: DataTypes.STRING(32), allowNull: true },

      guardianPlan: { type: DataTypes.STRING(30), defaultValue: "starter" },

      registrationStatus: { type: DataTypes.STRING(30), defaultValue: "pending" },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: false },
      isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
      verificationToken: { type: DataTypes.STRING(255), allowNull: true },
      verificationExpires: { type: DataTypes.DATE, allowNull: true },
      onboardingCompleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      setupStep: { type: DataTypes.INTEGER, defaultValue: 1 },

      // Nested config blobs preserved as JSON.
      address: jsonAttr("address", {}),
      platformLimits: jsonAttr("platformLimits", DEFAULT_PLATFORM_LIMITS()),
      platformUsage: jsonAttr("platformUsage", DEFAULT_PLATFORM_USAGE()),
      clientBillingConfig: jsonAttr("clientBillingConfig", {}),
      settings: jsonAttr("settings", {}),
      security: jsonAttr("security", {}),
      guardianBilling: jsonAttr("guardianBilling", DEFAULT_GUARDIAN_BILLING()),

      suspensionReason: { type: DataTypes.STRING(500), allowNull: true },
      suspendedAt: { type: DataTypes.DATE, allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },

      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "storage_companies",
      timestamps: true,
      indexes: [
        { fields: ["slug"] },
        { fields: ["email"] },
        { fields: ["registrationStatus"] },
        { fields: ["companyType"] },
      ],
    }
  );

  attachJsonHooks(StorageCompany, [
    "address",
    "platformLimits",
    "platformUsage",
    "clientBillingConfig",
    "settings",
    "security",
    "guardianBilling",
  ]);

  Object.defineProperty(StorageCompany.prototype, "_id", {
    get() {
      return this.id;
    },
  });

  StorageCompany.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    // Mongo-era code often reads `.status` as an alias of registrationStatus.
    if (values.status === undefined) values.status = values.registrationStatus;
    return values;
  };

  return StorageCompany;
};

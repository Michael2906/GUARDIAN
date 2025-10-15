const mongoose = require("mongoose");

// Storage Company Schema for 3PL Platform
const storageCompanySchema = new mongoose.Schema(
  {
    // Basic Storage Company Information
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    // Unique identifier for URLs and API access
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
      minlength: 3,
      maxlength: 50,
    },

    // Storage Company Type
    companyType: {
      type: String,
      enum: ["3pl-provider", "self-storage", "warehouse-operator"],
      default: "3pl-provider",
      required: true,
    },

    // Contact Information
    contactName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    phone: {
      type: String,
      trim: true,
      match: /^[\+]?[1-9][\d]{0,15}$/,
    },

    // Address Information
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },

    // GUARDIAN Subscription & Plan (what they pay YOU)
    guardianPlan: {
      type: String,
      enum: ["starter", "professional", "enterprise", "white-label"],
      default: "starter",
    },

    // GUARDIAN Platform Limits (what you allow them)
    platformLimits: {
      maxClientBusinesses: { type: Number, default: 5 },
      maxWarehouses: { type: Number, default: 2 },
      maxUsersTotal: { type: Number, default: 10 },
      maxItemsPerWarehouse: { type: Number, default: 5000 },
      maxStorageGB: { type: Number, default: 5 },
      maxAPICallsPerMonth: { type: Number, default: 25000 },
      maxMonthlyInvoices: { type: Number, default: 50 },
    },

    // Current Platform Usage Tracking
    platformUsage: {
      clientBusinesses: { type: Number, default: 0 },
      warehouses: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      totalItems: { type: Number, default: 0 },
      storageUsedGB: { type: Number, default: 0 },
      apiCallsThisMonth: { type: Number, default: 0 },
      invoicesThisMonth: { type: Number, default: 0 },
    },

    // Client Billing Configuration (how they charge their clients)
    clientBillingConfig: {
      currency: { type: String, default: "USD" },
      billingCycle: {
        type: String,
        enum: ["monthly", "quarterly", "yearly"],
        default: "monthly",
      },

      // Rate structures they can use
      rateStructures: [
        {
          name: String, // "Standard Rate", "Premium Rate"
          storageRatePerCubicFt: { type: Number, default: 0 },
          handlingFeePerItem: { type: Number, default: 0 },
          monthlyBaseFee: { type: Number, default: 0 },
          transactionFeePerMove: { type: Number, default: 0 },
        },
      ],

      // Default rates for new clients
      defaultRates: {
        storageRatePerCubicFt: { type: Number, default: 2.5 },
        handlingFeePerItem: { type: Number, default: 0.5 },
        monthlyBaseFee: { type: Number, default: 100.0 },
        transactionFeePerMove: { type: Number, default: 1.0 },
      },
    },

    // Storage Company Settings
    settings: {
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "USD" },
      dateFormat: { type: String, default: "YYYY-MM-DD" },
      businessHours: {
        open: { type: String, default: "08:00" },
        close: { type: String, default: "18:00" },
        timezone: { type: String, default: "UTC" },
      },

      // Warehouse Management Settings
      warehouseDefaults: {
        defaultStorageTypes: [
          {
            type: String,
            enum: ["ambient", "refrigerated", "frozen", "hazmat"],
          },
        ],
        defaultLocationFormat: String, // "A-1-1" format pattern
        enableBarcodeScanning: { type: Boolean, default: true },
        requirePhotosForReceiving: { type: Boolean, default: false },
      },

      // Client Portal Settings
      clientPortalSettings: {
        allowClientSelfService: { type: Boolean, default: true },
        allowClientReports: { type: Boolean, default: true },
        allowClientOrderHistory: { type: Boolean, default: true },
        hideStorageCosts: { type: Boolean, default: false }, // Hide your internal costs
      },
    },

    // Security Settings for Storage Company
    security: {
      requireTwoFactor: { type: Boolean, default: false },
      requireClientTwoFactor: { type: Boolean, default: false },
      passwordExpiryDays: { type: Number, default: 90 },
      sessionTimeoutMinutes: { type: Number, default: 30 },
      allowedIPs: [String], // Optional IP whitelist
      backupCodes: [String], // 2FA backup codes

      // Client access restrictions
      restrictClientAccess: {
        ipWhitelist: { type: Boolean, default: false },
        businessHoursOnly: { type: Boolean, default: false },
        requireApprovalForNewUsers: { type: Boolean, default: true },
      },
    },

    // Registration and Status
    registrationStatus: {
      type: String,
      enum: [
        "pending",
        "email-verified",
        "setup-completed",
        "active",
        "suspended",
      ],
      default: "pending",
    },
    isActive: { type: Boolean, default: false }, // Changed default to false
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpires: Date,
    onboardingCompleted: { type: Boolean, default: false },
    setupStep: { type: Number, default: 1 }, // Current step in onboarding process

    // GUARDIAN Platform Billing (what they pay you)
    guardianBilling: {
      subscriptionId: String,
      planName: {
        type: String,
        enum: ["basic", "pro", "enterprise", "custom"],
        default: "basic",
      },
      billingStatus: {
        type: String,
        enum: ["trial", "active", "past-due", "cancelled", "suspended"],
        default: "trial",
      },
      trialEndsAt: Date, // All companies get a trial period
      lastPaymentDate: Date,
      nextBillingDate: Date,
      paymentMethod: String,
      monthlyRecurringRevenue: { type: Number, default: 0 },

      // Custom Pricing & Manual Adjustments
      customPricing: {
        isCustomPlan: { type: Boolean, default: false },
        customMonthlyRate: Number, // Override standard plan pricing
        customYearlyRate: Number,
        billingCycle: {
          type: String,
          enum: ["monthly", "yearly", "quarterly", "custom"],
          default: "monthly",
        },

        // Manual adjustments and discounts
        adjustments: [
          {
            type: {
              type: String,
              enum: [
                "discount",
                "credit",
                "fee",
                "refund",
                "manual-adjustment",
              ],
              required: true,
            },
            amount: { type: Number, required: true }, // Positive or negative
            description: { type: String, required: true },
            reason: String, // Internal notes
            appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Which admin applied it
            appliedAt: { type: Date, default: Date.now },
            isRecurring: { type: Boolean, default: false }, // Apply every billing cycle
            expiresAt: Date, // For temporary discounts
            isActive: { type: Boolean, default: true },
          },
        ],

        // Enterprise/Custom Deal Information
        dealInfo: {
          contractStartDate: Date,
          contractEndDate: Date,
          contractLength: Number, // in months
          dealValue: Number, // Total contract value
          paymentTerms: String, // "Net 30", "Annual prepaid", etc.
          discountPercentage: Number,
          specialTerms: String, // Custom terms description
          salesRep: String, // Who negotiated the deal
          approvedBy: String, // Who approved custom pricing
        },
      },
    },

    // Audit Trail
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastLoginAt: Date,
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
    collection: "storage_companies",
  }
);

// Indexes for performance
storageCompanySchema.index({ slug: 1 });
storageCompanySchema.index({ email: 1 });
storageCompanySchema.index({ isActive: 1 });
storageCompanySchema.index({ companyType: 1 });
storageCompanySchema.index({ guardianPlan: 1 });
storageCompanySchema.index({ createdAt: -1 });

// Pre-save middleware to update timestamp
storageCompanySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Instance methods for platform usage tracking
storageCompanySchema.methods.incrementPlatformUsage = function (
  type,
  amount = 1
) {
  if (this.platformUsage[type] !== undefined) {
    this.platformUsage[type] += amount;
  }
  return this.save();
};

storageCompanySchema.methods.checkPlatformLimit = function (type, amount = 1) {
  if (this.platformLimits[type] === undefined) return true;
  return this.platformUsage[type] + amount <= this.platformLimits[type];
};

storageCompanySchema.methods.resetMonthlyUsage = function () {
  this.platformUsage.apiCallsThisMonth = 0;
  this.platformUsage.invoicesThisMonth = 0;
  return this.save();
};

// Client billing methods
storageCompanySchema.methods.calculateClientBill = function (
  clientId,
  billingPeriod
) {
  // This will calculate what the storage company should charge their client
  // Based on storage used, transactions, handling fees, etc.
  // To be implemented when we build the billing system
  return {
    storageFees: 0,
    handlingFees: 0,
    transactionFees: 0,
    baseFee: this.clientBillingConfig.defaultRates.monthlyBaseFee,
    total: this.clientBillingConfig.defaultRates.monthlyBaseFee,
  };
};

storageCompanySchema.methods.addRateStructure = function (rateStructure) {
  this.clientBillingConfig.rateStructures.push(rateStructure);
  return this.save();
};

// Static methods
storageCompanySchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug, isActive: true });
};

storageCompanySchema.statics.findActiveCompanies = function () {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

storageCompanySchema.statics.findByPlan = function (plan) {
  return this.find({ guardianPlan: plan, isActive: true });
};

module.exports = mongoose.model("StorageCompany", storageCompanySchema);

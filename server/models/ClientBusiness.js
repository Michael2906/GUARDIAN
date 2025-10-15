const mongoose = require("mongoose");

// Client Business Schema - Businesses that store items with Storage Companies
const clientBusinessSchema = new mongoose.Schema(
  {
    // Link to Storage Company (Multi-Tenant Key)
    storageCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageCompany",
      required: true,
      index: true,
    },

    // Basic Client Business Information
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    // Unique identifier within the storage company
    clientCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },

    // Business Type
    businessType: {
      type: String,
      enum: ["ecommerce", "retail", "manufacturing", "distribution", "other"],
      default: "other",
    },

    // Contact Information
    primaryContact: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      email: {
        type: String,
        required: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      },
      phone: String,
      title: String,
    },

    // Business Address
    businessAddress: {
      companyName: String,
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },

    // Billing Information
    billingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
      sameAsBusinessAddress: { type: Boolean, default: true },
    },

    // Contract & Billing Details
    contractInfo: {
      contractStartDate: Date,
      contractEndDate: Date,
      billingCycle: {
        type: String,
        enum: ["monthly", "quarterly", "yearly"],
        default: "monthly",
      },

      // Which rate structure they use (from storage company's rate structures)
      rateStructureName: String,

      // Custom rates for this specific client (overrides rate structure)
      customRates: {
        storageRatePerCubicFt: Number,
        handlingFeePerItem: Number,
        monthlyBaseFee: Number,
        transactionFeePerMove: Number,

        // Volume discounts
        volumeDiscounts: [
          {
            minItems: Number,
            discountPercent: Number,
          },
        ],
      },

      // Payment terms
      paymentTerms: {
        dueDays: { type: Number, default: 30 }, // Net 30
        lateFeePercent: { type: Number, default: 1.5 },
        requirePrepayment: { type: Boolean, default: false },
      },
    },

    // Client Limits (set by storage company)
    clientLimits: {
      maxItems: { type: Number, default: 1000 },
      maxWarehouses: { type: Number, default: 1 },
      maxUsers: { type: Number, default: 3 },
      maxStorageVolumeCubicFt: { type: Number, default: 1000 },
      maxMonthlyTransactions: { type: Number, default: 500 },
    },

    // Current Usage by this client
    currentUsage: {
      totalItems: { type: Number, default: 0 },
      warehouses: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      storageVolumeCubicFt: { type: Number, default: 0 },
      transactionsThisMonth: { type: Number, default: 0 },
    },

    // Billing Status
    billingStatus: {
      currentBalance: { type: Number, default: 0 },
      lastBilledDate: Date,
      nextBillingDate: Date,
      autoPayEnabled: { type: Boolean, default: false },
      paymentMethodId: String, // Stripe payment method ID

      // Account status
      accountStatus: {
        type: String,
        enum: ["active", "suspended", "overdue", "closed"],
        default: "active",
      },
      suspendedReason: String,
      suspendedDate: Date,
    },

    // Client Portal Access Settings
    portalAccess: {
      enabled: { type: Boolean, default: true },
      allowInventoryView: { type: Boolean, default: true },
      allowReports: { type: Boolean, default: true },
      allowOrderSubmission: { type: Boolean, default: true },
      allowBillingView: { type: Boolean, default: true },
      customDashboardSettings: {
        hideStorageCosts: { type: Boolean, default: false },
        showOnlyOwnItems: { type: Boolean, default: true },
        allowBulkOperations: { type: Boolean, default: false },
      },
    },

    // Special Instructions & Notes
    specialInstructions: {
      receivingInstructions: String,
      shippingInstructions: String,
      handlingNotes: String,
      internalNotes: String, // Only visible to storage company staff
    },

    // Integration Settings
    integrations: {
      ediEnabled: { type: Boolean, default: false },
      apiAccess: {
        enabled: { type: Boolean, default: false },
        apiKey: String,
        webhookUrl: String,
        allowedOperations: [String], // ['view', 'create', 'update', 'delete']
      },
    },

    // Audit Trail
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Storage company user
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    collection: "client_businesses",
  }
);

// Compound indexes for multi-tenant queries
clientBusinessSchema.index(
  { storageCompanyId: 1, clientCode: 1 },
  { unique: true }
); // Unique client code per storage company
clientBusinessSchema.index({ storageCompanyId: 1, "primaryContact.email": 1 });
clientBusinessSchema.index({
  storageCompanyId: 1,
  "billingStatus.accountStatus": 1,
});
clientBusinessSchema.index({
  storageCompanyId: 1,
  "contractInfo.contractEndDate": 1,
});
clientBusinessSchema.index({ "billingStatus.nextBillingDate": 1 });

// Pre-save middleware
clientBusinessSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Auto-generate client code if not provided
  if (!this.clientCode && this.name) {
    // Generate from company name + timestamp
    const nameCode = this.name
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .substring(0, 6);
    const timestamp = Date.now().toString().slice(-4);
    this.clientCode = `${nameCode}${timestamp}`;
  }

  next();
});

// Instance Methods
clientBusinessSchema.methods.incrementUsage = function (type, amount = 1) {
  if (this.currentUsage[type] !== undefined) {
    this.currentUsage[type] += amount;
  }
  return this.save();
};

clientBusinessSchema.methods.checkLimit = function (type, amount = 1) {
  if (this.clientLimits[type] === undefined) return true;
  return this.currentUsage[type] + amount <= this.clientLimits[type];
};

clientBusinessSchema.methods.calculateCurrentBill = function () {
  // Calculate current bill based on usage and rates
  const rates = this.customRates || {};

  return {
    baseFee: rates.monthlyBaseFee || 0,
    storageFee:
      (this.currentUsage.storageVolumeCubicFt || 0) *
      (rates.storageRatePerCubicFt || 0),
    handlingFee:
      (this.currentUsage.totalItems || 0) * (rates.handlingFeePerItem || 0),
    transactionFee:
      (this.currentUsage.transactionsThisMonth || 0) *
      (rates.transactionFeePerMove || 0),
  };
};

clientBusinessSchema.methods.suspend = function (reason, suspendedBy) {
  this.billingStatus.accountStatus = "suspended";
  this.billingStatus.suspendedReason = reason;
  this.billingStatus.suspendedDate = new Date();
  this.portalAccess.enabled = false;
  this.lastModifiedBy = suspendedBy;
  return this.save();
};

clientBusinessSchema.methods.reactivate = function (reactivatedBy) {
  this.billingStatus.accountStatus = "active";
  this.billingStatus.suspendedReason = undefined;
  this.billingStatus.suspendedDate = undefined;
  this.portalAccess.enabled = true;
  this.lastModifiedBy = reactivatedBy;
  return this.save();
};

// Static Methods for Storage Company Queries
clientBusinessSchema.statics.findByStorageCompany = function (
  storageCompanyId,
  options = {}
) {
  const query = { storageCompanyId };

  if (options.status) query["billingStatus.accountStatus"] = options.status;
  if (options.businessType) query.businessType = options.businessType;

  return this.find(query)
    .populate("createdBy", "firstName lastName")
    .populate("lastModifiedBy", "firstName lastName")
    .sort(options.sort || { createdAt: -1 });
};

clientBusinessSchema.statics.findByClientCode = function (
  storageCompanyId,
  clientCode
) {
  return this.findOne({ storageCompanyId, clientCode });
};

clientBusinessSchema.statics.findActiveClients = function (storageCompanyId) {
  return this.find({
    storageCompanyId,
    "billingStatus.accountStatus": "active",
  });
};

clientBusinessSchema.statics.findOverdueClients = function (storageCompanyId) {
  return this.find({
    storageCompanyId,
    "billingStatus.accountStatus": "overdue",
    "billingStatus.currentBalance": { $gt: 0 },
  });
};

clientBusinessSchema.statics.getTotalUsageByStorageCompany = function (
  storageCompanyId
) {
  return this.aggregate([
    {
      $match: {
        storageCompanyId: new mongoose.Types.ObjectId(storageCompanyId),
      },
    },
    {
      $group: {
        _id: null,
        totalClients: { $sum: 1 },
        totalItems: { $sum: "$currentUsage.totalItems" },
        totalVolume: { $sum: "$currentUsage.storageVolumeCubicFt" },
        totalUsers: { $sum: "$currentUsage.users" },
        totalRevenue: { $sum: "$billingStatus.currentBalance" },
      },
    },
  ]);
};

module.exports = mongoose.model("ClientBusiness", clientBusinessSchema);

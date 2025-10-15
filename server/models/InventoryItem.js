const mongoose = require("mongoose");

// Inventory Item Schema for 3PL Platform - Client-Owned Items
const inventoryItemSchema = new mongoose.Schema(
  {
    // 3PL Multi-Tenant Keys
    storageCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageCompany",
      required: true,
      index: true,
    },

    clientBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientBusiness",
      required: true,
      index: true,
    },

    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },

    // Basic Item Information
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // Client's SKU (unique within client business)
    clientSku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },

    // Storage Company's internal SKU (optional)
    internalSku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },

    // Barcodes and identifiers
    barcode: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    upc: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    lotNumber: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    serialNumber: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    // Client's categorization
    category: {
      type: String,
      required: true,
      trim: true,
    },

    subcategory: {
      type: String,
      trim: true,
    },

    tags: [String],

    // Client's Pricing Information (what they value it at)
    clientPricing: {
      cost: { type: Number, min: 0 }, // Client's cost
      retailPrice: { type: Number, min: 0 }, // Client's selling price
      declaredValue: { type: Number, min: 0 }, // For insurance purposes
      currency: { type: String, default: "USD" },
    },

    // Storage Company's Billing Information
    storageBilling: {
      storageRatePerUnit: { type: Number, default: 0 }, // Per unit storage cost
      handlingFee: { type: Number, default: 0 }, // Per unit handling fee
      specialHandlingRequired: { type: Boolean, default: false },
      specialHandlingRate: { type: Number, default: 0 },
      billableVolumeCubicFt: { type: Number, default: 0 }, // For billing calculations
    },

    // Stock Management - Enhanced for 3PL
    stock: {
      totalQuantity: { type: Number, required: true, min: 0, default: 0 },
      availableQuantity: { type: Number, default: 0, min: 0 },
      reservedQuantity: { type: Number, default: 0, min: 0 }, // Reserved for orders
      quarantineQuantity: { type: Number, default: 0, min: 0 }, // Quarantined items
      damagedQuantity: { type: Number, default: 0, min: 0 }, // Damaged items

      // Client reorder settings
      reorderPoint: { type: Number, min: 0 },
      reorderQuantity: { type: Number, min: 0 },

      // Lot tracking
      lotTracking: { type: Boolean, default: false },
      expirationTracking: { type: Boolean, default: false },
    },

    // Detailed Location Tracking for 3PL
    locationDetails: {
      primaryLocation: {
        zone: String, // "A", "B", "Refrigerated"
        aisle: String, // "A1", "B2"
        rack: String, // "01", "02"
        shelf: String, // "A", "B", "C"
        bin: String, // "001", "002"
        position: String, // Full position: "A-A1-01-A-001"
      },

      // Items may be stored in multiple locations
      additionalLocations: [
        {
          zone: String,
          aisle: String,
          rack: String,
          shelf: String,
          bin: String,
          position: String,
          quantity: { type: Number, min: 0 },
          locationType: {
            type: String,
            enum: ["primary", "overflow", "quarantine", "damaged"],
          },
        },
      ],

      lastLocationUpdate: { type: Date, default: Date.now },
      locationVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // Physical Properties & Packaging
    physicalProperties: {
      // Individual unit dimensions
      unitDimensions: {
        length: Number,
        width: Number,
        height: Number,
        weight: Number,
        dimensionUnit: {
          type: String,
          enum: ["in", "cm", "ft", "m"],
          default: "in",
        },
        weightUnit: {
          type: String,
          enum: ["lbs", "kg", "oz", "g"],
          default: "lbs",
        },
      },

      // Packaging information
      packaging: {
        unitsPerCase: { type: Number, default: 1 },
        caseDimensions: {
          length: Number,
          width: Number,
          height: Number,
          weight: Number,
        },
        palletQuantity: { type: Number, default: 0 }, // Units per pallet
        stackable: { type: Boolean, default: true },
        fragile: { type: Boolean, default: false },
      },
    },

    // Storage Requirements
    storageRequirements: {
      temperatureControlled: { type: Boolean, default: false },
      temperatureRange: {
        min: Number, // Fahrenheit
        max: Number,
      },
      humidityControlled: { type: Boolean, default: false },
      humidityRange: {
        min: Number, // Percentage
        max: Number,
      },
      hazmat: { type: Boolean, default: false },
      hazmatClass: String,
      specialInstructions: String,
    },

    // Client's Supplier Information (for reference)
    supplierInfo: {
      supplierName: String,
      supplierSku: String,
      contactEmail: String,
      contactPhone: String,
      leadTimeDays: Number,
      minimumOrderQuantity: Number,
      lastOrderDate: Date,
    },

    // Status and Tracking
    status: {
      type: String,
      enum: ["active", "inactive", "discontinued", "on-hold", "quarantined"],
      default: "active",
    },

    // Expiration and Dating
    dateTracking: {
      isPerishable: { type: Boolean, default: false },
      expirationDate: Date,
      manufactureDate: Date,
      receivedDate: { type: Date, default: Date.now },
      bestByDate: Date,
      fifoRequired: { type: Boolean, default: false }, // First In, First Out
    },

    // Quality Control
    qualityControl: {
      inspectionRequired: { type: Boolean, default: false },
      lastInspectionDate: Date,
      inspectionStatus: {
        type: String,
        enum: ["pending", "passed", "failed", "conditional"],
        default: "pending",
      },
      inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      qualityNotes: String,
    },

    // Images and Documents
    media: {
      images: [
        {
          url: String,
          caption: String,
          isPrimary: { type: Boolean, default: false },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],

      documents: [
        {
          name: String,
          url: String,
          type: { type: String, enum: ["msds", "coa", "invoice", "other"] },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
    },

    // Client Custom Fields
    clientCustomFields: [
      {
        fieldName: String,
        fieldValue: mongoose.Schema.Types.Mixed,
        fieldType: {
          type: String,
          enum: ["text", "number", "date", "boolean", "select"],
        },
        isRequired: { type: Boolean, default: false },
      },
    ],

    // Internal Notes (visible only to storage company)
    internalNotes: [
      {
        note: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        isPrivate: { type: Boolean, default: true }, // Not visible to client
      },
    ],

    // Audit Trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Movement and Transaction History
    movementHistory: [
      {
        date: { type: Date, default: Date.now },
        transactionType: {
          type: String,
          enum: [
            "received",
            "shipped",
            "moved",
            "adjusted",
            "damaged",
            "returned",
          ],
          required: true,
        },
        quantityChange: Number, // Positive for inbound, negative for outbound
        newQuantity: Number,
        fromLocation: {
          warehouse: String,
          zone: String,
          aisle: String,
          shelf: String,
          bin: String,
        },
        toLocation: {
          warehouse: String,
          zone: String,
          aisle: String,
          shelf: String,
          bin: String,
        },
        movedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: String,
        reference: String, // PO number, work order, etc.
        notes: String,
      },
    ],

    // Billing and Cost Tracking for 3PL
    billingInfo: {
      storageChargeType: {
        type: String,
        enum: ["per-unit", "per-pallet", "per-cubic-foot", "flat-rate"],
        default: "per-unit",
      },
      storageRate: Number, // Cost per unit based on charge type
      handlingCharges: {
        inbound: Number,
        outbound: Number,
        additional: Number,
      },
      lastBillingDate: Date,
      unbilledTransactions: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: "inventory_items",
  }
);

// Compound Indexes for 3PL Multi-Tenancy
inventoryItemSchema.index(
  { storageCompanyId: 1, clientBusinessId: 1, clientSku: 1 },
  { unique: true }
);
inventoryItemSchema.index(
  { storageCompanyId: 1, internalSku: 1 },
  { unique: true }
);
inventoryItemSchema.index({
  storageCompanyId: 1,
  clientBusinessId: 1,
  category: 1,
});
inventoryItemSchema.index({ storageCompanyId: 1, warehouseId: 1 });

// Location and Status Indexes
inventoryItemSchema.index({
  "locationDetails.primaryLocation.zone": 1,
  "locationDetails.primaryLocation.aisle": 1,
  "locationDetails.primaryLocation.rack": 1,
});
inventoryItemSchema.index({ status: 1, "qualityControl.inspectionStatus": 1 });
inventoryItemSchema.index({ "dateTracking.expirationDate": 1 });

// Legacy indexes (keeping for backward compatibility during transition)
inventoryItemSchema.index({ companyId: 1, sku: 1 });
inventoryItemSchema.index({ barcode: 1 });

// Pre-save middleware
inventoryItemSchema.pre("save", function (next) {
  // Calculate available stock
  this.stock.available = Math.max(0, this.stock.current - this.stock.reserved);

  // Update timestamp
  this.updatedAt = Date.now();

  // Limit recent movements to last 10 entries
  if (this.recentMovements.length > 10) {
    this.recentMovements = this.recentMovements.slice(-10);
  }

  next();
});

// Instance Methods
inventoryItemSchema.methods.updateStock = function (
  quantity,
  type,
  reason,
  userId
) {
  const oldStock = this.stock.current;

  if (type === "in") {
    this.stock.current += quantity;
  } else if (type === "out") {
    this.stock.current = Math.max(0, this.stock.current - quantity);
  } else if (type === "adjustment") {
    this.stock.current = Math.max(0, quantity);
  }

  // Add to movement history
  this.recentMovements.push({
    type,
    quantity: type === "adjustment" ? quantity - oldStock : quantity,
    reason,
    userId,
    timestamp: new Date(),
  });

  this.lastModifiedBy = userId;
  return this.save();
};

inventoryItemSchema.methods.reserveStock = function (quantity) {
  if (this.stock.available >= quantity) {
    this.stock.reserved += quantity;
    return this.save();
  }
  throw new Error("Insufficient stock available for reservation");
};

inventoryItemSchema.methods.releaseReservedStock = function (quantity) {
  this.stock.reserved = Math.max(0, this.stock.reserved - quantity);
  return this.save();
};

inventoryItemSchema.methods.isLowStock = function () {
  return this.stock.current <= this.stock.minimum;
};

inventoryItemSchema.methods.needsReorder = function () {
  return this.stock.current <= this.stock.reorderPoint;
};

// Static Methods for Multi-Tenant Queries
inventoryItemSchema.statics.findByCompany = function (companyId, options = {}) {
  const query = { companyId };

  if (options.status) query.status = options.status;
  if (options.category) query.category = options.category;
  if (options.lowStock) {
    query.$expr = { $lte: ["$stock.current", "$stock.minimum"] };
  }

  return this.find(query)
    .populate("createdBy", "firstName lastName")
    .populate("lastModifiedBy", "firstName lastName")
    .sort(options.sort || { updatedAt: -1 });
};

inventoryItemSchema.statics.searchByCompany = function (companyId, searchTerm) {
  return this.find({
    companyId,
    $or: [
      { name: { $regex: searchTerm, $options: "i" } },
      { sku: { $regex: searchTerm, $options: "i" } },
      { barcode: { $regex: searchTerm, $options: "i" } },
      { description: { $regex: searchTerm, $options: "i" } },
    ],
  });
};

inventoryItemSchema.statics.getLowStockItems = function (companyId) {
  return this.find({
    companyId,
    $expr: { $lte: ["$stock.current", "$stock.minimum"] },
    status: "active",
  });
};

// Static Methods for 3PL Operations
inventoryItemSchema.statics.findByClient = function (
  storageCompanyId,
  clientBusinessId
) {
  return this.find({ storageCompanyId, clientBusinessId });
};

inventoryItemSchema.statics.findByWarehouse = function (
  storageCompanyId,
  warehouseId
) {
  return this.find({ storageCompanyId, warehouseId });
};

inventoryItemSchema.statics.findExpiringItems = function (
  storageCompanyId,
  days = 30
) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    storageCompanyId,
    "dateTracking.isPerishable": true,
    "dateTracking.expirationDate": { $lte: futureDate, $gte: new Date() },
  });
};

inventoryItemSchema.statics.getLowStockItems = function (
  storageCompanyId,
  clientBusinessId
) {
  return this.find({
    storageCompanyId,
    clientBusinessId,
    $expr: { $lte: ["$quantityOnHand", "$reorderPoint"] },
  });
};

inventoryItemSchema.statics.getClientInventoryValue = function (
  storageCompanyId,
  clientBusinessId
) {
  return this.aggregate([
    {
      $match: {
        storageCompanyId: new mongoose.Types.ObjectId(storageCompanyId),
        clientBusinessId: new mongoose.Types.ObjectId(clientBusinessId),
        status: "active",
      },
    },
    {
      $group: {
        _id: null,
        totalValue: {
          $sum: {
            $multiply: ["$quantityOnHand", "$pricing.clientCost"],
          },
        },
        totalItems: { $sum: 1 },
        totalStock: { $sum: "$quantityOnHand" },
      },
    },
  ]);
};

inventoryItemSchema.statics.getWarehouseUtilization = function (
  storageCompanyId,
  warehouseId
) {
  return this.aggregate([
    {
      $match: {
        storageCompanyId: new mongoose.Types.ObjectId(storageCompanyId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
        status: "active",
      },
    },
    {
      $group: {
        _id: "$locationDetails.primaryLocation.zone",
        itemCount: { $sum: 1 },
        totalQuantity: { $sum: "$quantityOnHand" },
      },
    },
    { $sort: { itemCount: -1 } },
  ]);
};

inventoryItemSchema.statics.getCategorySummary = function (companyId) {
  return this.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: "active",
      },
    },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        totalStock: { $sum: "$stock.current" },
        totalValue: {
          $sum: {
            $multiply: ["$stock.current", "$pricing.cost"],
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);

const mongoose = require("mongoose");

const WarehouseSchema = new mongoose.Schema(
  {
    // 3PL Multi-Tenant Keys
    storageCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageCompany",
      required: true,
      index: true,
    },

    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Address and Contact
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, default: "USA" },
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },

    contactInfo: {
      phone: String,
      email: String,
      managerName: String,
      emergencyContact: {
        name: String,
        phone: String,
        relationship: String,
      },
    },

    // Operational Status
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance", "closed"],
      default: "active",
    },

    operatingHours: {
      monday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      tuesday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      wednesday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      thursday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      friday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      saturday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      sunday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: true },
      },
    },

    // Physical Specifications
    specifications: {
      totalSquareFeet: Number,
      ceilingHeight: Number,
      dockDoors: {
        loading: Number,
        crossDock: Number,
        total: Number,
      },

      storageTypes: [
        {
          type: {
            type: String,
            enum: [
              "ambient",
              "refrigerated",
              "frozen",
              "climate-controlled",
              "hazmat",
              "outdoor",
            ],
          },
          squareFeet: Number,
          temperatureRange: {
            min: Number,
            max: Number,
            unit: { type: String, enum: ["F", "C"], default: "F" },
          },
          humidityRange: {
            min: Number,
            max: Number,
          },
        },
      ],
    },

    // Zone and Location Structure
    layout: {
      zones: [
        {
          zoneId: { type: String, required: true }, // "A", "B", "REFRIG"
          zoneName: String, // "General Storage", "Refrigerated"
          zoneType: {
            type: String,
            enum: [
              "ambient",
              "refrigerated",
              "frozen",
              "climate-controlled",
              "hazmat",
              "receiving",
              "shipping",
            ],
            default: "ambient",
          },

          aisles: [
            {
              aisleId: { type: String, required: true }, // "A1", "A2"

              racks: [
                {
                  rackId: { type: String, required: true }, // "01", "02"

                  shelves: [
                    {
                      shelfId: { type: String, required: true }, // "A", "B", "C"
                      shelfHeight: Number, // Height from floor in inches
                      maxWeight: Number, // Weight capacity in lbs

                      bins: [
                        {
                          binId: { type: String, required: true }, // "001", "002"
                          binType: {
                            type: String,
                            enum: [
                              "standard",
                              "oversized",
                              "small-parts",
                              "bulk",
                            ],
                            default: "standard",
                          },
                          dimensions: {
                            length: Number,
                            width: Number,
                            height: Number,
                            unit: {
                              type: String,
                              enum: ["in", "ft"],
                              default: "in",
                            },
                          },
                          isOccupied: { type: Boolean, default: false },
                          lastInventoryDate: Date,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // Equipment and Resources
    equipment: {
      forklifts: {
        electric: Number,
        propane: Number,
        reach: Number,
        other: Number,
      },

      conveyors: [
        {
          type: String, // "belt", "roller", "chain"
          length: Number,
          capacity: Number, // lbs per hour
        },
      ],

      scales: [
        {
          type: String, // "floor", "bench", "truck"
          capacity: Number, // max weight in lbs
          location: String,
        },
      ],

      racking: {
        selective: { type: Number, default: 0 }, // positions
        drive_in: { type: Number, default: 0 },
        pushback: { type: Number, default: 0 },
        cantilever: { type: Number, default: 0 },
      },
    },

    // Security and Access
    security: {
      accessControlSystem: {
        type: String,
        enum: ["keycard", "biometric", "pin", "physical-key"],
        default: "keycard",
      },

      cameras: {
        indoor: Number,
        outdoor: Number,
        recordingRetention: Number, // days
      },

      alarms: {
        fire: Boolean,
        security: Boolean,
        temperature: Boolean,
        humidity: Boolean,
      },

      securityGuard: {
        onSite: Boolean,
        schedule: String, // "24/7", "business hours", "weekends"
      },
    },

    // Compliance and Certifications
    compliance: {
      certifications: [
        {
          type: String, // "ISO 9001", "SQF", "HACCP", "C-TPAT"
          issueDate: Date,
          expirationDate: Date,
          certifyingBody: String,
        },
      ],

      insurance: {
        general: {
          carrier: String,
          policyNumber: String,
          coverage: Number, // coverage amount
          expirationDate: Date,
        },

        cargo: {
          carrier: String,
          policyNumber: String,
          coverage: Number,
          expirationDate: Date,
        },
      },

      licenses: [
        {
          type: String, // "bonded warehouse", "customs", "hazmat"
          number: String,
          issuingAuthority: String,
          expirationDate: Date,
        },
      ],
    },

    // Client Access and Billing
    clientAccess: [
      {
        clientBusinessId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ClientBusiness",
        },

        accessLevel: {
          type: String,
          enum: ["full", "view-only", "restricted-zones"],
          default: "view-only",
        },

        allowedZones: [String], // Array of zone IDs client can access

        billingRates: {
          storage: {
            rate: Number,
            unit: {
              type: String,
              enum: ["per-pallet", "per-cubic-foot", "per-unit"],
            },
          },

          handling: {
            inbound: Number, // per unit/pallet
            outbound: Number,
            additional: Number, // special handling
          },
        },

        contractStartDate: Date,
        contractEndDate: Date,
      },
    ],

    // Performance Metrics
    metrics: {
      utilizationRate: Number, // percentage of capacity used

      throughput: {
        daily: Number, // units processed per day
        monthly: Number,
        yearly: Number,
      },

      accuracy: {
        inventory: Number, // percentage accuracy
        picking: Number,
        shipping: Number,
      },

      lastUpdated: { type: Date, default: Date.now },
    },

    // Audit Trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Notes and Documentation
    notes: [
      {
        note: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        isPrivate: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for Performance
WarehouseSchema.index({ storageCompanyId: 1, code: 1 }, { unique: true });
WarehouseSchema.index({ storageCompanyId: 1, name: 1 });
WarehouseSchema.index({ storageCompanyId: 1, status: 1 });
WarehouseSchema.index({ "address.city": 1, "address.state": 1 });
WarehouseSchema.index({ "clientAccess.clientBusinessId": 1 });

// Static Methods
WarehouseSchema.statics.findByStorageCompany = function (storageCompanyId) {
  return this.find({ storageCompanyId, status: "active" });
};

WarehouseSchema.statics.findByClient = function (
  storageCompanyId,
  clientBusinessId
) {
  return this.find({
    storageCompanyId,
    "clientAccess.clientBusinessId": clientBusinessId,
    status: "active",
  });
};

WarehouseSchema.statics.getUtilizationSummary = function (storageCompanyId) {
  return this.aggregate([
    {
      $match: {
        storageCompanyId: new mongoose.Types.ObjectId(storageCompanyId),
        status: "active",
      },
    },
    {
      $group: {
        _id: null,
        totalWarehouses: { $sum: 1 },
        totalSquareFeet: { $sum: "$specifications.totalSquareFeet" },
        averageUtilization: { $avg: "$metrics.utilizationRate" },
        totalDockDoors: { $sum: "$specifications.dockDoors.total" },
      },
    },
  ]);
};

// Virtual for full location path
WarehouseSchema.virtual("locationPath").get(function () {
  return `${this.address.city}, ${this.address.state} ${this.address.zipCode}`;
});

// Method to generate location codes
WarehouseSchema.methods.generateLocationCode = function (
  zoneId,
  aisleId,
  rackId,
  shelfId,
  binId
) {
  return `${this.code}-${zoneId}-${aisleId}-${rackId}-${shelfId}-${binId}`;
};

// Method to check if location exists
WarehouseSchema.methods.isValidLocation = function (
  zoneId,
  aisleId,
  rackId,
  shelfId,
  binId
) {
  const zone = this.layout.zones.find((z) => z.zoneId === zoneId);
  if (!zone) return false;

  const aisle = zone.aisles.find((a) => a.aisleId === aisleId);
  if (!aisle) return false;

  const rack = aisle.racks.find((r) => r.rackId === rackId);
  if (!rack) return false;

  const shelf = rack.shelves.find((s) => s.shelfId === shelfId);
  if (!shelf) return false;

  const bin = shelf.bins.find((b) => b.binId === binId);
  return !!bin;
};

module.exports = mongoose.model("Warehouse", WarehouseSchema);

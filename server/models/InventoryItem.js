const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

const ITEM_STATUSES = ["active", "inactive", "discontinued"];

module.exports = (sequelize) => {
  const InventoryItem = sequelize.define(
    "InventoryItem",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

      storageCompanyId: { type: DataTypes.UUID, allowNull: false },
      clientBusinessId: { type: DataTypes.UUID, allowNull: true },
      warehouseId: { type: DataTypes.UUID, allowNull: true },

      sku: { type: DataTypes.STRING(80), allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.STRING(1000), allowNull: true },
      category: { type: DataTypes.STRING(80), allowNull: true },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      unit: { type: DataTypes.STRING(24), defaultValue: "each" },
      reorderPoint: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      location: { type: DataTypes.STRING(80), allowNull: true }, // bin / aisle

      attributes: jsonAttr("attributes", {}),

      status: {
        type: DataTypes.STRING(20),
        defaultValue: "active",
        validate: { isIn: [ITEM_STATUSES] },
      },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "inventory_items",
      timestamps: true,
      indexes: [
        { fields: ["storageCompanyId"] },
        { fields: ["storageCompanyId", "warehouseId"] },
        { fields: ["storageCompanyId", "clientBusinessId"] },
        { fields: ["sku"] },
      ],
    }
  );

  attachJsonHooks(InventoryItem, ["attributes"]);

  Object.defineProperty(InventoryItem.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  // Convenience virtual: is the item at/below its reorder threshold?
  Object.defineProperty(InventoryItem.prototype, "isLowStock", {
    get() {
      return this.reorderPoint > 0 && this.quantity <= this.reorderPoint;
    },
  });

  InventoryItem.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    values.isLowStock = this.reorderPoint > 0 && this.quantity <= this.reorderPoint;
    if (this.warehouse !== undefined) {
      values.warehouseId = this.warehouse ? this.warehouse.toJSON() : null;
    }
    if (this.clientBusiness !== undefined) {
      values.clientBusinessId = this.clientBusiness ? this.clientBusiness.toJSON() : null;
    }
    if (this.storageCompany !== undefined) {
      values.storageCompanyId = this.storageCompany ? this.storageCompany.toJSON() : null;
    }
    if (this.movements !== undefined) {
      values.movements = this.movements.map((m) => m.toJSON());
    }
    return values;
  };

  InventoryItem.ITEM_STATUSES = ITEM_STATUSES;

  return InventoryItem;
};

const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

// Minimal InventoryItem model. There are no inventory routes yet; this exists so
// counts/associations resolve and the feature can be built out later.
module.exports = (sequelize) => {
  const InventoryItem = sequelize.define(
    "InventoryItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },
      clientBusinessId: { type: DataTypes.UUID, allowNull: true },
      warehouseId: { type: DataTypes.UUID, allowNull: true },
      sku: { type: DataTypes.STRING(80), allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      attributes: jsonAttr("attributes", {}),
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "inventory_items", timestamps: true }
  );

  attachJsonHooks(InventoryItem, ["attributes"]);

  Object.defineProperty(InventoryItem.prototype, "_id", {
    get() {
      return this.id;
    },
  });

  return InventoryItem;
};

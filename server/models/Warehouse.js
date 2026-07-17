const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

// Minimal Warehouse model. There are no warehouse routes yet; this exists so
// counts/associations resolve and the feature can be built out later.
module.exports = (sequelize) => {
  const Warehouse = sequelize.define(
    "Warehouse",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(40), allowNull: true },
      address: jsonAttr("address", {}),
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "warehouses", timestamps: true }
  );

  attachJsonHooks(Warehouse, ["address"]);

  Object.defineProperty(Warehouse.prototype, "_id", {
    get() {
      return this.id;
    },
  });

  return Warehouse;
};

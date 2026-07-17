const { DataTypes } = require("sequelize");

const MOVEMENT_TYPES = ["receive", "ship", "adjust"];

// Append-only log of inventory quantity changes (receiving, shipping, manual
// adjustments). Provides an audit trail and per-item history.
module.exports = (sequelize) => {
  const StockMovement = sequelize.define(
    "StockMovement",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

      inventoryItemId: { type: DataTypes.UUID, allowNull: false },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },

      type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [MOVEMENT_TYPES] },
      },
      quantityChange: { type: DataTypes.INTEGER, allowNull: false }, // +/-
      quantityAfter: { type: DataTypes.INTEGER, allowNull: false },

      reason: { type: DataTypes.STRING(300), allowNull: true },
      reference: { type: DataTypes.STRING(120), allowNull: true }, // PO/SO number

      performedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "stock_movements",
      timestamps: true,
      indexes: [
        { fields: ["inventoryItemId"] },
        { fields: ["storageCompanyId"] },
      ],
    }
  );

  Object.defineProperty(StockMovement.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  StockMovement.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    return values;
  };

  StockMovement.MOVEMENT_TYPES = MOVEMENT_TYPES;

  return StockMovement;
};

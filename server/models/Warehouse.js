const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

const WAREHOUSE_TYPES = ["ambient", "refrigerated", "frozen", "hazmat", "mixed"];
const WAREHOUSE_STATUSES = ["active", "inactive", "maintenance"];

module.exports = (sequelize) => {
  const Warehouse = sequelize.define(
    "Warehouse",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },

      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(40), allowNull: true },
      description: { type: DataTypes.STRING(500), allowNull: true },

      warehouseType: {
        type: DataTypes.STRING(20),
        defaultValue: "mixed",
        validate: { isIn: [WAREHOUSE_TYPES] },
      },

      address: jsonAttr("address", {}),

      squareFootage: { type: DataTypes.INTEGER, allowNull: true },
      capacityUnits: { type: DataTypes.INTEGER, allowNull: true },

      contactName: { type: DataTypes.STRING(100), allowNull: true },
      contactPhone: { type: DataTypes.STRING(32), allowNull: true },

      status: {
        type: DataTypes.STRING(20),
        defaultValue: "active",
        validate: { isIn: [WAREHOUSE_STATUSES] },
      },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "warehouses",
      timestamps: true,
      indexes: [
        { fields: ["storageCompanyId"] },
        { fields: ["storageCompanyId", "status"] },
      ],
    }
  );

  attachJsonHooks(Warehouse, ["address"]);

  Object.defineProperty(Warehouse.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  Warehouse.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    if (this.storageCompany !== undefined) {
      values.storageCompanyId = this.storageCompany ? this.storageCompany.toJSON() : null;
    }
    if (this.itemCount !== undefined) values.itemCount = this.itemCount;
    return values;
  };

  Warehouse.WAREHOUSE_TYPES = WAREHOUSE_TYPES;
  Warehouse.WAREHOUSE_STATUSES = WAREHOUSE_STATUSES;

  return Warehouse;
};

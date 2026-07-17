const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

module.exports = (sequelize) => {
  const ClientBusiness = sequelize.define(
    "ClientBusiness",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      clientCode: { type: DataTypes.STRING(40), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      address: jsonAttr("address", {}),
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: "client_businesses", timestamps: true }
  );

  attachJsonHooks(ClientBusiness, ["address"]);

  Object.defineProperty(ClientBusiness.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  ClientBusiness.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    return values;
  };

  return ClientBusiness;
};

const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

// Default per-client billing configuration a storage company uses to charge
// this client. Supports multiple charge components; storageBasis picks how the
// recurring storage fee is measured (default per unit/pallet per month).
const DEFAULT_BILLING_CONFIG = () => ({
  currency: "USD",
  billingCycle: "monthly", // monthly | quarterly | yearly
  storageBasis: "per-unit-month", // per-unit-month | per-pallet-month | per-cubic-ft-month
  storageRate: 0, // charge per unit/pallet/cuft, per month
  monthlyBaseFee: 0, // flat recurring fee
  handlingFeePerMovement: 0, // per receive/ship event
  transactionFeePerUnit: 0, // per unit received/shipped
  notes: "",
});

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
      contactName: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      address: jsonAttr("address", {}),
      billingConfig: jsonAttr("billingConfig", DEFAULT_BILLING_CONFIG()),
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "client_businesses",
      timestamps: true,
      indexes: [{ fields: ["storageCompanyId"] }, { fields: ["storageCompanyId", "isActive"] }],
    }
  );

  attachJsonHooks(ClientBusiness, ["address", "billingConfig"]);

  Object.defineProperty(ClientBusiness.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  ClientBusiness.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    if (this.itemCount !== undefined) values.itemCount = this.itemCount;
    return values;
  };

  ClientBusiness.DEFAULT_BILLING_CONFIG = DEFAULT_BILLING_CONFIG;

  return ClientBusiness;
};

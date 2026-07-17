const { DataTypes } = require("sequelize");
const { jsonAttr, attachJsonHooks } = require("./_json");

const INVOICE_STATUSES = ["draft", "sent", "paid", "void"];

// An invoice a storage company issues to one of its client businesses for a
// billing period. Line items are stored as JSON.
module.exports = (sequelize) => {
  const Invoice = sequelize.define(
    "Invoice",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      storageCompanyId: { type: DataTypes.UUID, allowNull: false },
      clientBusinessId: { type: DataTypes.UUID, allowNull: false },

      invoiceNumber: { type: DataTypes.STRING(40), allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "draft",
        validate: { isIn: [INVOICE_STATUSES] },
      },
      currency: { type: DataTypes.STRING(8), defaultValue: "USD" },

      // Stored as plain YYYY-MM-DD strings to avoid mssql DATEONLY timezone shifts.
      periodStart: { type: DataTypes.STRING(10), allowNull: true },
      periodEnd: { type: DataTypes.STRING(10), allowNull: true },
      issuedAt: { type: DataTypes.DATE, allowNull: true },
      dueAt: { type: DataTypes.DATE, allowNull: true },
      paidAt: { type: DataTypes.DATE, allowNull: true },

      lineItems: jsonAttr("lineItems", []),
      subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      notes: { type: DataTypes.STRING(1000), allowNull: true },

      createdBy: { type: DataTypes.UUID, allowNull: true },
      lastModifiedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "invoices",
      timestamps: true,
      indexes: [
        { fields: ["storageCompanyId"] },
        { fields: ["clientBusinessId"] },
        { fields: ["storageCompanyId", "status"] },
      ],
    }
  );

  attachJsonHooks(Invoice, ["lineItems"]);

  Object.defineProperty(Invoice.prototype, "_id", {
    get() {
      return this.id;
    },
  });
  Invoice.prototype.toJSON = function () {
    const values = { ...this.get() };
    values._id = values.id;
    // DECIMAL comes back as string from mssql; coerce for the frontend.
    values.subtotal = values.subtotal != null ? Number(values.subtotal) : 0;
    values.total = values.total != null ? Number(values.total) : 0;
    if (this.clientBusiness !== undefined) {
      values.clientBusinessId = this.clientBusiness ? this.clientBusiness.toJSON() : null;
    }
    return values;
  };

  Invoice.INVOICE_STATUSES = INVOICE_STATUSES;
  return Invoice;
};

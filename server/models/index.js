// Central model registry — Azure SQL / Sequelize edition.
const { sequelize, Sequelize } = require("../config/database");

const User = require("./User")(sequelize);
const StorageCompany = require("./Company")(sequelize);
const ClientBusiness = require("./ClientBusiness")(sequelize);
const InventoryItem = require("./InventoryItem")(sequelize);
const Warehouse = require("./Warehouse")(sequelize);
const StockMovement = require("./StockMovement")(sequelize);
const Invoice = require("./Invoice")(sequelize);

/**
 * Associations. `constraints: false` avoids physical FK creation (and the
 * circular createdBy/storageCompanyId ordering problems that come with it);
 * includes still work for read-side "populate" behaviour.
 */
User.belongsTo(StorageCompany, {
  foreignKey: "storageCompanyId",
  as: "storageCompany",
  constraints: false,
});
User.belongsTo(ClientBusiness, {
  foreignKey: "clientBusinessId",
  as: "clientBusiness",
  constraints: false,
});
StorageCompany.hasMany(User, {
  foreignKey: "storageCompanyId",
  as: "users",
  constraints: false,
});
ClientBusiness.belongsTo(StorageCompany, {
  foreignKey: "storageCompanyId",
  as: "storageCompany",
  constraints: false,
});
Warehouse.belongsTo(StorageCompany, {
  foreignKey: "storageCompanyId",
  as: "storageCompany",
  constraints: false,
});
InventoryItem.belongsTo(StorageCompany, {
  foreignKey: "storageCompanyId",
  as: "storageCompany",
  constraints: false,
});
InventoryItem.belongsTo(Warehouse, {
  foreignKey: "warehouseId",
  as: "warehouse",
  constraints: false,
});
InventoryItem.belongsTo(ClientBusiness, {
  foreignKey: "clientBusinessId",
  as: "clientBusiness",
  constraints: false,
});
InventoryItem.hasMany(StockMovement, {
  foreignKey: "inventoryItemId",
  as: "movements",
  constraints: false,
});
StockMovement.belongsTo(InventoryItem, {
  foreignKey: "inventoryItemId",
  as: "item",
  constraints: false,
});
Warehouse.hasMany(InventoryItem, {
  foreignKey: "warehouseId",
  as: "items",
  constraints: false,
});
Invoice.belongsTo(ClientBusiness, {
  foreignKey: "clientBusinessId",
  as: "clientBusiness",
  constraints: false,
});
ClientBusiness.hasMany(Invoice, {
  foreignKey: "clientBusinessId",
  as: "invoices",
  constraints: false,
});

/**
 * Create/patch tables. Safe to run on every boot for exploration.
 * Set SQL_SYNC_ALTER=true to let Sequelize ALTER existing tables to match.
 */
async function syncDatabase() {
  const alter = process.env.SQL_SYNC_ALTER === "true";
  await sequelize.sync({ alter });
}

module.exports = {
  sequelize,
  Sequelize,
  syncDatabase,
  User,
  Company: StorageCompany, // legacy alias
  StorageCompany,
  ClientBusiness,
  InventoryItem,
  Warehouse,
  StockMovement,
  Invoice,
};

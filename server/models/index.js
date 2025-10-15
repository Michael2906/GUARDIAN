// Central export point for all models
const User = require("./User");
const StorageCompany = require("./Company"); // Renamed but keeping Company reference for compatibility
const ClientBusiness = require("./ClientBusiness");
const InventoryItem = require("./InventoryItem");
const Warehouse = require("./Warehouse");

module.exports = {
  User,
  Company: StorageCompany, // Legacy alias for backward compatibility
  StorageCompany,
  ClientBusiness,
  InventoryItem,
  Warehouse,
};

// Export individual models as well for convenience
module.exports.User = User;
module.exports.Company = StorageCompany;
module.exports.StorageCompany = StorageCompany;
module.exports.ClientBusiness = ClientBusiness;
module.exports.InventoryItem = InventoryItem;
module.exports.Warehouse = Warehouse;

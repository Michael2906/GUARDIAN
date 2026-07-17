const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Warehouse, InventoryItem, StorageCompany } = require("../models");
const { authenticateToken } = require("../middleware/auth");

// Roles allowed to create/update/delete warehouses.
const WRITE_ROLES = ["guardian-admin", "storage-admin", "storage-manager"];
const canWrite = (req) => WRITE_ROLES.includes(req.user.role);

// Build the tenant scope for the current user.
// isActive is the soft-delete flag; deleted warehouses never appear in lists/stats.
const scopeWhere = (req) => {
  if (req.user.role === "guardian-admin") return { isActive: true };
  return { isActive: true, storageCompanyId: req.user.storageCompanyId };
};

const denyWrite = (res) =>
  res.status(403).json({
    success: false,
    error: "You do not have permission to manage warehouses",
  });

const attachItemCounts = async (warehouses) => {
  return Promise.all(
    warehouses.map(async (w) => {
      const itemCount = await InventoryItem.count({
        where: { warehouseId: w.id, isActive: true },
      });
      w.itemCount = itemCount;
      return w.toJSON();
    })
  );
};

/**
 * GET /api/warehouses — list (scoped)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, warehouseType } = req.query;
    const where = { ...scopeWhere(req) };

    if (status) where.status = status;
    if (warehouseType) where.warehouseType = warehouseType;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { rows, count } = await Warehouse.findAndCountAll({
      where,
      include: [{ model: StorageCompany, as: "storageCompany" }],
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
    });

    res.json({
      success: true,
      data: {
        warehouses: await attachItemCounts(rows),
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("List warehouses error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve warehouses" });
  }
});

/**
 * GET /api/warehouses/statistics
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const scope = scopeWhere(req);
    const [totalWarehouses, activeWarehouses, totalItems] = await Promise.all([
      Warehouse.count({ where: scope }),
      Warehouse.count({ where: { ...scope, status: "active" } }),
      InventoryItem.count({ where: { ...scope, isActive: true } }),
    ]);

    // Sum of capacity across warehouses in scope.
    const warehouses = await Warehouse.findAll({ where: scope });
    const totalCapacity = warehouses.reduce(
      (sum, w) => sum + (w.capacityUnits || 0),
      0
    );

    res.json({
      success: true,
      data: { totalWarehouses, activeWarehouses, totalItems, totalCapacity },
    });
  } catch (error) {
    console.error("Warehouse statistics error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve statistics" });
  }
});

/**
 * POST /api/warehouses
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);

    const {
      name,
      code,
      description,
      warehouseType,
      address,
      squareFootage,
      capacityUnits,
      contactName,
      contactPhone,
      status,
      storageCompanyId,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: "Warehouse name is required" });
    }

    // Determine owning company.
    let companyId = storageCompanyId;
    if (req.user.role !== "guardian-admin") {
      companyId = req.user.storageCompanyId; // scoped users can't cross tenants
    }
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "storageCompanyId is required",
      });
    }

    const company = await StorageCompany.findByPk(companyId);
    if (!company) {
      return res.status(400).json({ success: false, error: "Storage company not found" });
    }

    const warehouse = await Warehouse.create({
      storageCompanyId: companyId,
      name: name.trim(),
      code: code ? code.trim() : null,
      description: description || null,
      warehouseType: warehouseType || "mixed",
      address: address || {},
      squareFootage: squareFootage || null,
      capacityUnits: capacityUnits || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      status: status || "active",
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Warehouse created successfully",
      data: { warehouse: warehouse.toJSON() },
    });
  } catch (error) {
    console.error("Create warehouse error:", error);
    res.status(500).json({ success: false, error: "Failed to create warehouse" });
  }
});

/**
 * GET /api/warehouses/:id
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const warehouse = await Warehouse.findByPk(req.params.id, {
      include: [{ model: StorageCompany, as: "storageCompany" }],
    });
    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }
    if (
      req.user.role !== "guardian-admin" &&
      String(warehouse.storageCompanyId) !== String(req.user.storageCompanyId)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    warehouse.itemCount = await InventoryItem.count({
      where: { warehouseId: warehouse.id, isActive: true },
    });

    res.json({ success: true, data: { warehouse: warehouse.toJSON() } });
  } catch (error) {
    console.error("Get warehouse error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve warehouse" });
  }
});

/**
 * PUT /api/warehouses/:id
 */
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);

    const warehouse = await Warehouse.findByPk(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }
    if (
      req.user.role !== "guardian-admin" &&
      String(warehouse.storageCompanyId) !== String(req.user.storageCompanyId)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const fields = [
      "name",
      "code",
      "description",
      "warehouseType",
      "address",
      "squareFootage",
      "capacityUnits",
      "contactName",
      "contactPhone",
      "status",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) warehouse[f] = req.body[f];
    });
    warehouse.lastModifiedBy = req.user.userId;
    await warehouse.save();

    res.json({
      success: true,
      message: "Warehouse updated successfully",
      data: { warehouse: warehouse.toJSON() },
    });
  } catch (error) {
    console.error("Update warehouse error:", error);
    res.status(500).json({ success: false, error: "Failed to update warehouse" });
  }
});

/**
 * DELETE /api/warehouses/:id — soft delete (blocked if it holds active stock)
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);

    const warehouse = await Warehouse.findByPk(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }
    if (
      req.user.role !== "guardian-admin" &&
      String(warehouse.storageCompanyId) !== String(req.user.storageCompanyId)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const activeItems = await InventoryItem.count({
      where: { warehouseId: warehouse.id, isActive: true },
    });
    if (activeItems > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete a warehouse holding ${activeItems} active item(s). Move or remove them first.`,
      });
    }

    warehouse.isActive = false;
    warehouse.status = "inactive";
    warehouse.lastModifiedBy = req.user.userId;
    await warehouse.save();

    res.json({ success: true, message: "Warehouse deactivated successfully" });
  } catch (error) {
    console.error("Delete warehouse error:", error);
    res.status(500).json({ success: false, error: "Failed to delete warehouse" });
  }
});

module.exports = router;

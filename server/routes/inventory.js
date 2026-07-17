const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const {
  sequelize,
  InventoryItem,
  StockMovement,
  Warehouse,
  ClientBusiness,
  StorageCompany,
} = require("../models");
const { authenticateToken } = require("../middleware/auth");

const ITEM_INCLUDES = [
  { model: Warehouse, as: "warehouse" },
  { model: ClientBusiness, as: "clientBusiness" },
];

// client-viewer is read-only; everyone else authenticated may write within scope.
const canWrite = (req) => req.user.role !== "client-viewer";
const isClientUser = (req) =>
  ["client-admin", "client-user", "client-viewer"].includes(req.user.role);

// Tenant scope for reads/writes.
const scopeWhere = (req) => {
  // isActive is the soft-delete flag; deleted items never appear in lists/stats.
  if (req.user.role === "guardian-admin") return { isActive: true };
  const where = { isActive: true, storageCompanyId: req.user.storageCompanyId };
  if (isClientUser(req)) where.clientBusinessId = req.user.clientBusinessId;
  return where;
};

// Can the current user act on this specific item?
const canAccessItem = (req, item) => {
  if (req.user.role === "guardian-admin") return true;
  if (String(item.storageCompanyId) !== String(req.user.storageCompanyId)) return false;
  if (isClientUser(req) && String(item.clientBusinessId) !== String(req.user.clientBusinessId))
    return false;
  return true;
};

/**
 * GET /api/inventory — list (scoped, filterable)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      warehouseId,
      clientBusinessId,
      status,
      lowStock,
    } = req.query;

    const and = [scopeWhere(req)];
    if (warehouseId) and.push({ warehouseId });
    if (clientBusinessId && req.user.role !== "guardian-admin" && !isClientUser(req)) {
      and.push({ clientBusinessId });
    } else if (clientBusinessId && req.user.role === "guardian-admin") {
      and.push({ clientBusinessId });
    }
    if (status) and.push({ status });
    if (search) {
      and.push({
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { sku: { [Op.like]: `%${search}%` } },
          { category: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (lowStock === "true") {
      and.push(sequelize.literal("[quantity] <= [reorderPoint] AND [reorderPoint] > 0"));
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { rows, count } = await InventoryItem.findAndCountAll({
      where: { [Op.and]: and },
      include: ITEM_INCLUDES,
      order: [["updatedAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
      distinct: true,
    });

    res.json({
      success: true,
      data: {
        items: rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("List inventory error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve inventory" });
  }
});

/**
 * GET /api/inventory/statistics
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const scope = scopeWhere(req);
    const [totalItems, totalQuantity, outOfStockCount, lowStockCount] =
      await Promise.all([
        InventoryItem.count({ where: { ...scope, isActive: true } }),
        InventoryItem.sum("quantity", { where: { ...scope, isActive: true } }),
        InventoryItem.count({ where: { ...scope, isActive: true, quantity: 0 } }),
        InventoryItem.count({
          where: {
            [Op.and]: [
              { ...scope, isActive: true },
              sequelize.literal("[quantity] <= [reorderPoint] AND [reorderPoint] > 0"),
            ],
          },
        }),
      ]);

    res.json({
      success: true,
      data: {
        totalItems,
        totalQuantity: totalQuantity || 0,
        lowStockCount,
        outOfStockCount,
      },
    });
  } catch (error) {
    console.error("Inventory statistics error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve statistics" });
  }
});

/**
 * POST /api/inventory — create item
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "Read-only access" });
    }

    const {
      name,
      sku,
      description,
      category,
      quantity = 0,
      unit,
      reorderPoint = 0,
      unitCost,
      location,
      warehouseId,
      clientBusinessId,
      status,
      storageCompanyId,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: "Item name is required" });
    }

    // Resolve owning company / client under tenant rules.
    let companyId = storageCompanyId;
    let clientId = clientBusinessId || null;
    if (req.user.role !== "guardian-admin") {
      companyId = req.user.storageCompanyId;
      if (isClientUser(req)) clientId = req.user.clientBusinessId;
    }
    if (!companyId) {
      return res.status(400).json({ success: false, error: "storageCompanyId is required" });
    }

    // Validate the warehouse belongs to the same company.
    if (warehouseId) {
      const wh = await Warehouse.findByPk(warehouseId);
      if (!wh || String(wh.storageCompanyId) !== String(companyId)) {
        return res.status(400).json({
          success: false,
          error: "Warehouse not found for this company",
        });
      }
    }

    const item = await InventoryItem.create({
      storageCompanyId: companyId,
      clientBusinessId: clientId,
      warehouseId: warehouseId || null,
      name: name.trim(),
      sku: sku ? sku.trim() : null,
      description: description || null,
      category: category || null,
      quantity: parseInt(quantity, 10) || 0,
      unit: unit || "each",
      reorderPoint: parseInt(reorderPoint, 10) || 0,
      unitCost: unitCost != null && unitCost !== "" ? unitCost : null,
      location: location || null,
      status: status || "active",
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    // Log the opening balance as a receive movement, if any.
    if (item.quantity > 0) {
      await StockMovement.create({
        inventoryItemId: item.id,
        storageCompanyId: companyId,
        type: "receive",
        quantityChange: item.quantity,
        quantityAfter: item.quantity,
        reason: "Opening balance",
        performedBy: req.user.userId,
      });
    }

    const created = await InventoryItem.findByPk(item.id, { include: ITEM_INCLUDES });
    res.status(201).json({
      success: true,
      message: "Inventory item created successfully",
      data: { item: created },
    });
  } catch (error) {
    console.error("Create inventory item error:", error);
    res.status(500).json({ success: false, error: "Failed to create item" });
  }
});

/**
 * GET /api/inventory/:id — with recent movement history
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id, {
      include: [
        ...ITEM_INCLUDES,
        {
          model: StockMovement,
          as: "movements",
          separate: true,
          limit: 20,
          order: [["createdAt", "DESC"]],
        },
      ],
    });
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }
    if (!canAccessItem(req, item)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    res.json({ success: true, data: { item } });
  } catch (error) {
    console.error("Get inventory item error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve item" });
  }
});

/**
 * PUT /api/inventory/:id — update item metadata (not quantity; use /adjust)
 */
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "Read-only access" });
    }
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }
    if (!canAccessItem(req, item)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    // Validate warehouse change stays within the same company.
    if (req.body.warehouseId) {
      const wh = await Warehouse.findByPk(req.body.warehouseId);
      if (!wh || String(wh.storageCompanyId) !== String(item.storageCompanyId)) {
        return res.status(400).json({
          success: false,
          error: "Warehouse not found for this company",
        });
      }
    }

    // Client reassignment (storage/guardian only) — must stay within the company.
    if (req.body.clientBusinessId !== undefined && !isClientUser(req)) {
      const newClientId = req.body.clientBusinessId || null;
      if (newClientId) {
        const cli = await ClientBusiness.findByPk(newClientId);
        if (!cli || String(cli.storageCompanyId) !== String(item.storageCompanyId)) {
          return res.status(400).json({
            success: false,
            error: "Client not found for this company",
          });
        }
      }
      item.clientBusinessId = newClientId;
    }

    const fields = [
      "name",
      "sku",
      "description",
      "category",
      "unit",
      "reorderPoint",
      "unitCost",
      "location",
      "warehouseId",
      "status",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) item[f] = req.body[f];
    });
    item.lastModifiedBy = req.user.userId;
    await item.save();

    const updated = await InventoryItem.findByPk(item.id, { include: ITEM_INCLUDES });
    res.json({
      success: true,
      message: "Item updated successfully",
      data: { item: updated },
    });
  } catch (error) {
    console.error("Update inventory item error:", error);
    res.status(500).json({ success: false, error: "Failed to update item" });
  }
});

/**
 * POST /api/inventory/:id/adjust — stock movement (receive / ship / adjust)
 * body: { type, quantity, newQuantity, reason, reference }
 *   receive/ship -> quantity is a positive magnitude
 *   adjust       -> newQuantity is the corrected absolute count
 */
router.post("/:id/adjust", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "Read-only access" });
    }
    const { type, quantity, newQuantity, reason, reference } = req.body;
    if (!["receive", "ship", "adjust"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "type must be receive, ship, or adjust",
      });
    }

    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }
    if (!canAccessItem(req, item)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    let quantityChange;
    if (type === "adjust") {
      const target = parseInt(newQuantity, 10);
      if (Number.isNaN(target) || target < 0) {
        return res.status(400).json({
          success: false,
          error: "newQuantity must be a non-negative number for an adjustment",
        });
      }
      quantityChange = target - item.quantity;
    } else {
      const mag = parseInt(quantity, 10);
      if (Number.isNaN(mag) || mag <= 0) {
        return res.status(400).json({
          success: false,
          error: "quantity must be a positive number",
        });
      }
      quantityChange = type === "receive" ? mag : -mag;
    }

    const quantityAfter = item.quantity + quantityChange;
    if (quantityAfter < 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot ship ${Math.abs(quantityChange)} — only ${item.quantity} in stock`,
      });
    }

    item.quantity = quantityAfter;
    item.lastModifiedBy = req.user.userId;
    await item.save();

    await StockMovement.create({
      inventoryItemId: item.id,
      storageCompanyId: item.storageCompanyId,
      type,
      quantityChange,
      quantityAfter,
      reason: reason || null,
      reference: reference || null,
      performedBy: req.user.userId,
    });

    const updated = await InventoryItem.findByPk(item.id, { include: ITEM_INCLUDES });
    res.json({
      success: true,
      message: `Stock ${type} recorded (${quantityChange > 0 ? "+" : ""}${quantityChange})`,
      data: { item: updated },
    });
  } catch (error) {
    console.error("Stock adjust error:", error);
    res.status(500).json({ success: false, error: "Failed to adjust stock" });
  }
});

/**
 * GET /api/inventory/:id/movements — full movement history
 */
router.get("/:id/movements", authenticateToken, async (req, res) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }
    if (!canAccessItem(req, item)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    const movements = await StockMovement.findAll({
      where: { inventoryItemId: item.id },
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    res.json({ success: true, data: { movements } });
  } catch (error) {
    console.error("Get movements error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve movements" });
  }
});

/**
 * DELETE /api/inventory/:id — soft delete
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "Read-only access" });
    }
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }
    if (!canAccessItem(req, item)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    item.isActive = false;
    item.status = "inactive";
    item.lastModifiedBy = req.user.userId;
    await item.save();
    res.json({ success: true, message: "Item deleted successfully" });
  } catch (error) {
    console.error("Delete inventory item error:", error);
    res.status(500).json({ success: false, error: "Failed to delete item" });
  }
});

module.exports = router;

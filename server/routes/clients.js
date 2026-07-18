const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { ClientBusiness, InventoryItem, StorageCompany } = require("../models");
const { authenticateToken } = require("../middleware/auth");
const rbac = require("../lib/rbac");

// Roles that can create/edit/delete client businesses (central authority).
const canWrite = (req) => rbac.canWriteResource(req.user.role, "client");

// Tenant scope. Guardian sees all; storage users their company; client users
// only their own client business.
const scopeWhere = (req) => {
  if (req.user.role === "guardian-admin") return { isActive: true };
  if (["client-admin", "client-user", "client-viewer"].includes(req.user.role)) {
    return { isActive: true, id: req.user.clientBusinessId };
  }
  return { isActive: true, storageCompanyId: req.user.storageCompanyId };
};

const canAccess = (req, client) => {
  if (req.user.role === "guardian-admin") return true;
  if (["client-admin", "client-user", "client-viewer"].includes(req.user.role)) {
    return String(client.id) === String(req.user.clientBusinessId);
  }
  return String(client.storageCompanyId) === String(req.user.storageCompanyId);
};

const denyWrite = (res) =>
  res.status(403).json({ success: false, error: "You cannot manage client businesses" });

const withItemCount = async (client) => {
  client.itemCount = await InventoryItem.count({
    where: { clientBusinessId: client.id, isActive: true },
  });
  return client.toJSON();
};

/**
 * GET /api/clients — list (scoped)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, storageCompanyId } = req.query;
    const where = { ...scopeWhere(req) };
    if (storageCompanyId && req.user.role === "guardian-admin") where.storageCompanyId = storageCompanyId;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { clientCode: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const { rows, count } = await ClientBusiness.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
    });
    const clients = await Promise.all(rows.map(withItemCount));
    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("List clients error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve clients" });
  }
});

/**
 * GET /api/clients/statistics
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const scope = scopeWhere(req);
    const totalClients = await ClientBusiness.count({ where: scope });
    res.json({ success: true, data: { totalClients } });
  } catch (error) {
    console.error("Client statistics error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve statistics" });
  }
});

/**
 * POST /api/clients
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);
    const { name, clientCode, contactName, email, phone, address, billingConfig, storageCompanyId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "Client name is required" });

    let companyId = storageCompanyId;
    if (req.user.role !== "guardian-admin") companyId = req.user.storageCompanyId;
    if (!companyId) return res.status(400).json({ success: false, error: "storageCompanyId is required" });

    const company = await StorageCompany.findByPk(companyId);
    if (!company) return res.status(400).json({ success: false, error: "Storage company not found" });

    const client = await ClientBusiness.create({
      storageCompanyId: companyId,
      name: name.trim(),
      clientCode: clientCode ? clientCode.trim() : null,
      contactName: contactName || null,
      email: email || null,
      phone: phone || null,
      address: address || {},
      // Merge any provided rate fields onto the defaults so nothing is lost.
      billingConfig: { ...ClientBusiness.DEFAULT_BILLING_CONFIG(), ...(billingConfig || {}) },
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Client created successfully",
      data: { client: client.toJSON() },
    });
  } catch (error) {
    console.error("Create client error:", error);
    res.status(500).json({ success: false, error: "Failed to create client" });
  }
});

/**
 * GET /api/clients/:id
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const client = await ClientBusiness.findByPk(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });
    if (!canAccess(req, client)) return res.status(403).json({ success: false, error: "Access denied" });
    res.json({ success: true, data: { client: await withItemCount(client) } });
  } catch (error) {
    console.error("Get client error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve client" });
  }
});

/**
 * PUT /api/clients/:id — includes billingConfig updates
 */
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);
    const client = await ClientBusiness.findByPk(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });
    if (!canAccess(req, client)) return res.status(403).json({ success: false, error: "Access denied" });

    const fields = ["name", "clientCode", "contactName", "email", "phone", "address", "isActive"];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) client[f] = req.body[f];
    });
    // Merge billingConfig onto existing so partial updates keep other rates.
    if (req.body.billingConfig !== undefined) {
      client.billingConfig = { ...client.billingConfig, ...req.body.billingConfig };
    }
    client.lastModifiedBy = req.user.userId;
    await client.save();

    res.json({ success: true, message: "Client updated successfully", data: { client: client.toJSON() } });
  } catch (error) {
    console.error("Update client error:", error);
    res.status(500).json({ success: false, error: "Failed to update client" });
  }
});

/**
 * DELETE /api/clients/:id — soft delete (blocked while it has active stock)
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) return denyWrite(res);
    const client = await ClientBusiness.findByPk(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });
    if (!canAccess(req, client)) return res.status(403).json({ success: false, error: "Access denied" });

    const activeItems = await InventoryItem.count({
      where: { clientBusinessId: client.id, isActive: true },
    });
    if (activeItems > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete a client with ${activeItems} active item(s). Remove their inventory first.`,
      });
    }

    client.isActive = false;
    client.lastModifiedBy = req.user.userId;
    await client.save();
    res.json({ success: true, message: "Client deactivated successfully" });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ success: false, error: "Failed to delete client" });
  }
});

module.exports = router;

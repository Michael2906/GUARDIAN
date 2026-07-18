const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const {
  Invoice,
  ClientBusiness,
  InventoryItem,
  StockMovement,
} = require("../models");
const { authenticateToken } = require("../middleware/auth");
const rbac = require("../lib/rbac");

const canWrite = (req) => rbac.canWriteResource(req.user.role, "invoice");
const isClientUser = (req) => rbac.isClientRole(req.user.role);

const scopeWhere = (req) => {
  if (req.user.role === "guardian-admin") return {};
  if (isClientUser(req)) return { clientBusinessId: req.user.clientBusinessId };
  return { storageCompanyId: req.user.storageCompanyId };
};

const canAccess = (req, inv) => {
  if (req.user.role === "guardian-admin") return true;
  if (isClientUser(req)) return String(inv.clientBusinessId) === String(req.user.clientBusinessId);
  return String(inv.storageCompanyId) === String(req.user.storageCompanyId);
};

/**
 * Compute invoice line items from a client's billing config + activity.
 */
function computeCharges(bc, storageUnits, movementCount, unitsMoved) {
  const lineItems = [];
  const add = (type, description, quantity, rate) => {
    const amount = Math.round(quantity * rate * 100) / 100;
    if (amount !== 0) lineItems.push({ type, description, quantity, rate: Number(rate), amount });
  };
  if (Number(bc.monthlyBaseFee) > 0) add("base", "Monthly base fee", 1, Number(bc.monthlyBaseFee));
  if (Number(bc.storageRate) > 0 && storageUnits > 0)
    add("storage", `Storage (${bc.storageBasis}) — ${storageUnits} units`, storageUnits, Number(bc.storageRate));
  if (Number(bc.handlingFeePerMovement) > 0 && movementCount > 0)
    add("handling", `Handling — ${movementCount} movement(s)`, movementCount, Number(bc.handlingFeePerMovement));
  if (Number(bc.transactionFeePerUnit) > 0 && unitsMoved > 0)
    add("transaction", `Transaction — ${unitsMoved} unit(s) moved`, unitsMoved, Number(bc.transactionFeePerUnit));
  const subtotal = Math.round(lineItems.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return { lineItems, subtotal, total: subtotal };
}

/**
 * GET /api/invoices — list (scoped)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, clientBusinessId, status } = req.query;
    const where = { ...scopeWhere(req) };
    if (clientBusinessId && !isClientUser(req)) where.clientBusinessId = clientBusinessId;
    if (status) where.status = status;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const { rows, count } = await Invoice.findAndCountAll({
      where,
      include: [{ model: ClientBusiness, as: "clientBusiness" }],
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
    });
    res.json({
      success: true,
      data: {
        invoices: rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("List invoices error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve invoices" });
  }
});

/**
 * GET /api/invoices/statistics
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const scope = scopeWhere(req);
    const invoices = await Invoice.findAll({ where: scope });
    let totalInvoiced = 0, outstanding = 0, paidCount = 0;
    invoices.forEach((i) => {
      const t = Number(i.total) || 0;
      if (i.status !== "void") totalInvoiced += t;
      if (i.status === "draft" || i.status === "sent") outstanding += t;
      if (i.status === "paid") paidCount += 1;
    });
    res.json({
      success: true,
      data: {
        count: invoices.length,
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        outstanding: Math.round(outstanding * 100) / 100,
        paidCount,
      },
    });
  } catch (error) {
    console.error("Invoice statistics error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve statistics" });
  }
});

/**
 * POST /api/invoices/generate — build a draft invoice for a client + period
 * body: { clientBusinessId, periodStart, periodEnd, dueAt? }
 */
router.post("/generate", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "You cannot generate invoices" });
    }
    const { clientBusinessId, periodStart, periodEnd, dueAt } = req.body;
    if (!clientBusinessId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: "clientBusinessId, periodStart and periodEnd are required",
      });
    }

    const client = await ClientBusiness.findByPk(clientBusinessId);
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });
    if (req.user.role !== "guardian-admin" && String(client.storageCompanyId) !== String(req.user.storageCompanyId)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const bc = client.billingConfig || {};
    const items = await InventoryItem.findAll({
      where: { clientBusinessId, storageCompanyId: client.storageCompanyId },
    });
    const storageUnits = items.filter((i) => i.isActive).reduce((s, i) => s + (i.quantity || 0), 0);
    const itemIds = items.map((i) => i.id);

    const start = new Date(periodStart);
    const endPlus1 = new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000);
    let movements = [];
    if (itemIds.length) {
      movements = await StockMovement.findAll({
        where: {
          inventoryItemId: { [Op.in]: itemIds },
          createdAt: { [Op.gte]: start, [Op.lt]: endPlus1 },
        },
      });
    }
    const movementCount = movements.length;
    const unitsMoved = movements.reduce((s, m) => s + Math.abs(m.quantityChange || 0), 0);

    const { lineItems, subtotal, total } = computeCharges(bc, storageUnits, movementCount, unitsMoved);

    const num = await Invoice.count({ where: { storageCompanyId: client.storageCompanyId } });
    const invoiceNumber = `INV-${String(num + 1).padStart(5, "0")}`;

    const invoice = await Invoice.create({
      storageCompanyId: client.storageCompanyId,
      clientBusinessId,
      invoiceNumber,
      status: "draft",
      currency: bc.currency || "USD",
      periodStart,
      periodEnd,
      dueAt: dueAt || null,
      lineItems,
      subtotal,
      total,
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    const created = await Invoice.findByPk(invoice.id, {
      include: [{ model: ClientBusiness, as: "clientBusiness" }],
    });
    res.status(201).json({
      success: true,
      message: `Invoice ${invoiceNumber} generated`,
      data: { invoice: created },
    });
  } catch (error) {
    console.error("Generate invoice error:", error);
    res.status(500).json({ success: false, error: "Failed to generate invoice" });
  }
});

/**
 * GET /api/invoices/:id
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: ClientBusiness, as: "clientBusiness" }],
    });
    if (!invoice) return res.status(404).json({ success: false, error: "Invoice not found" });
    if (!canAccess(req, invoice)) return res.status(403).json({ success: false, error: "Access denied" });
    res.json({ success: true, data: { invoice } });
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve invoice" });
  }
});

/**
 * PUT /api/invoices/:id/status — { status }
 */
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "You cannot modify invoices" });
    }
    const { status } = req.body;
    if (!Invoice.INVOICE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: "Invoice not found" });
    if (!canAccess(req, invoice)) return res.status(403).json({ success: false, error: "Access denied" });

    invoice.status = status;
    if (status === "sent" && !invoice.issuedAt) invoice.issuedAt = new Date();
    if (status === "paid") invoice.paidAt = new Date();
    invoice.lastModifiedBy = req.user.userId;
    await invoice.save();

    const updated = await Invoice.findByPk(invoice.id, {
      include: [{ model: ClientBusiness, as: "clientBusiness" }],
    });
    res.json({ success: true, message: `Invoice marked ${status}`, data: { invoice: updated } });
  } catch (error) {
    console.error("Update invoice status error:", error);
    res.status(500).json({ success: false, error: "Failed to update invoice" });
  }
});

/**
 * DELETE /api/invoices/:id — hard-delete a draft, otherwise void it
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json({ success: false, error: "You cannot delete invoices" });
    }
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: "Invoice not found" });
    if (!canAccess(req, invoice)) return res.status(403).json({ success: false, error: "Access denied" });

    if (invoice.status === "draft") {
      await invoice.destroy();
      return res.json({ success: true, message: "Draft invoice deleted" });
    }
    invoice.status = "void";
    invoice.lastModifiedBy = req.user.userId;
    await invoice.save();
    res.json({ success: true, message: "Invoice voided" });
  } catch (error) {
    console.error("Delete invoice error:", error);
    res.status(500).json({ success: false, error: "Failed to delete invoice" });
  }
});

module.exports = router;

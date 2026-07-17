const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { authenticateToken } = require("../middleware/auth");
const { StorageCompany, User } = require("../models");

const guardianOnly = (req, res) => {
  if (req.user.role !== "guardian-admin") {
    res.status(403).json({
      success: false,
      error: "Access denied. GUARDIAN admin privileges required.",
    });
    return false;
  }
  return true;
};

const withUserCount = async (companyInstance) => {
  const userCount = await User.count({
    where: { storageCompanyId: companyInstance.id, isActive: true },
  });
  return { ...companyInstance.toJSON(), userCount };
};

/**
 * GET /api/companies — list (GUARDIAN admin only)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const { page = 1, limit = 20, search, companyType, status } = req.query;

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { slug: { [Op.like]: `%${search}%` } },
      ];
    }
    if (companyType) where.companyType = companyType;
    if (status) where.registrationStatus = status;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { rows, count: totalCount } = await StorageCompany.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit, 10),
    });

    const companies = await Promise.all(rows.map(withUserCount));

    res.json({
      success: true,
      data: {
        companies,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get companies error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve companies",
    });
  }
});

/**
 * GET /api/companies/statistics
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const [totalCompanies, activeCompanies, pendingCompanies, totalCompanyUsers] =
      await Promise.all([
        StorageCompany.count(),
        StorageCompany.count({ where: { registrationStatus: "active" } }),
        StorageCompany.count({ where: { registrationStatus: "pending" } }),
        User.count({
          where: {
            userType: {
              [Op.in]: ["storage-admin", "storage-manager", "storage-employee"],
            },
            isActive: true,
          },
        }),
      ]);

    res.json({
      success: true,
      data: {
        totalCompanies,
        activeCompanies,
        pendingCompanies,
        totalCompanyUsers,
      },
    });
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve statistics",
    });
  }
});

/**
 * POST /api/companies
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const {
      name,
      slug,
      contactName,
      email,
      phone,
      companyType,
      guardianPlan = "starter",
      status = "pending",
      address,
    } = req.body;

    if (!name || !slug || !contactName || !email || !companyType) {
      return res.status(400).json({
        success: false,
        error: "Name, slug, contact name, email, and company type are required",
      });
    }

    if (await StorageCompany.findOne({ where: { slug: slug.toLowerCase().trim() } })) {
      return res.status(400).json({ success: false, error: "Company slug already exists" });
    }
    if (await StorageCompany.findOne({ where: { email: email.toLowerCase().trim() } })) {
      return res.status(400).json({ success: false, error: "Company email already exists" });
    }

    const company = await StorageCompany.create({
      name: name.trim(),
      slug: slug.toLowerCase().trim(),
      contactName: contactName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      companyType,
      guardianPlan,
      registrationStatus: status,
      isActive: status === "active",
      address: address || {},
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Storage company created successfully",
      data: {
        company: {
          id: company.id,
          _id: company.id,
          name: company.name,
          slug: company.slug,
          email: company.email,
          companyType: company.companyType,
          status: company.registrationStatus,
          createdAt: company.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Create company error:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors?.[0]?.path || "field";
      return res.status(400).json({
        success: false,
        error: `Company ${field} already exists`,
      });
    }
    res.status(500).json({ success: false, error: "Failed to create company" });
  }
});

/**
 * GET /api/companies/:companyId
 */
router.get("/:companyId", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    res.json({ success: true, data: { company: await withUserCount(company) } });
  } catch (error) {
    console.error("Get company error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve company" });
  }
});

/**
 * PUT /api/companies/:companyId
 */
router.put("/:companyId", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const { companyId } = req.params;
    const company = await StorageCompany.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const {
      name,
      slug,
      contactName,
      email,
      phone,
      companyType,
      guardianPlan,
      status,
      address,
    } = req.body;

    if (slug && slug !== company.slug) {
      const dup = await StorageCompany.findOne({
        where: { slug, id: { [Op.ne]: companyId } },
      });
      if (dup) {
        return res.status(400).json({ success: false, error: "Company slug already exists" });
      }
    }
    if (email && email.toLowerCase() !== company.email) {
      const dup = await StorageCompany.findOne({
        where: { email: email.toLowerCase(), id: { [Op.ne]: companyId } },
      });
      if (dup) {
        return res.status(400).json({ success: false, error: "Company email already exists" });
      }
    }

    if (name) company.name = name.trim();
    if (slug) company.slug = slug.toLowerCase().trim();
    if (contactName) company.contactName = contactName.trim();
    if (email) company.email = email.toLowerCase().trim();
    if (phone !== undefined) company.phone = phone ? phone.trim() : null;
    if (companyType) company.companyType = companyType;
    if (guardianPlan) company.guardianPlan = guardianPlan;
    if (status) {
      company.registrationStatus = status;
      company.isActive = status === "active";
    }
    if (address) company.address = { ...company.address, ...address };
    company.lastModifiedBy = req.user.userId;

    await company.save();

    res.json({
      success: true,
      message: "Company updated successfully",
      data: { company: company.toJSON() },
    });
  } catch (error) {
    console.error("Update company error:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors?.[0]?.path || "field";
      return res.status(400).json({
        success: false,
        error: `Company ${field} already exists`,
      });
    }
    res.status(500).json({ success: false, error: "Failed to update company" });
  }
});

/**
 * DELETE /api/companies/:companyId — soft delete (suspend)
 */
router.delete("/:companyId", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const { companyId } = req.params;
    const company = await StorageCompany.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const activeUsers = await User.count({
      where: { storageCompanyId: companyId, isActive: true },
    });
    if (activeUsers > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete company with ${activeUsers} active users. Deactivate users first.`,
      });
    }

    company.registrationStatus = "suspended";
    company.isActive = false;
    company.deletedAt = new Date();
    company.lastModifiedBy = req.user.userId;
    await company.save();

    res.json({ success: true, message: "Company deactivated successfully" });
  } catch (error) {
    console.error("Delete company error:", error);
    res.status(500).json({ success: false, error: "Failed to delete company" });
  }
});

/**
 * POST /api/companies/:companyId/activate
 */
router.post("/:companyId/activate", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    company.registrationStatus = "active";
    company.isActive = true;
    company.lastModifiedBy = req.user.userId;
    await company.save();

    res.json({
      success: true,
      message: "Company activated successfully",
      data: { company: company.toJSON() },
    });
  } catch (error) {
    console.error("Activate company error:", error);
    res.status(500).json({ success: false, error: "Failed to activate company" });
  }
});

/**
 * POST /api/companies/:companyId/suspend
 */
router.post("/:companyId/suspend", authenticateToken, async (req, res) => {
  try {
    if (!guardianOnly(req, res)) return;

    const { reason } = req.body;
    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    company.registrationStatus = "suspended";
    company.isActive = false;
    company.suspensionReason = reason;
    company.suspendedAt = new Date();
    company.lastModifiedBy = req.user.userId;
    await company.save();

    res.json({
      success: true,
      message: "Company suspended successfully",
      data: { company: company.toJSON() },
    });
  } catch (error) {
    console.error("Suspend company error:", error);
    res.status(500).json({ success: false, error: "Failed to suspend company" });
  }
});

module.exports = router;

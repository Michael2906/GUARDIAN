const express = require("express");
const router = express.Router();
const { authenticateToken, requirePermission } = require("../middleware/auth");
const { StorageCompany, User } = require("../models");

/**
 * GET /api/companies
 * Get all storage companies (GUARDIAN admin only)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Only GUARDIAN admins can view all companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const {
      page = 1,
      limit = 20,
      search,
      companyType,
      status,
      billingStatus,
    } = req.query;

    // Build query
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
    }

    if (companyType) {
      query.companyType = companyType;
    }

    if (status) {
      query.registrationStatus = status;
    }

    if (billingStatus) {
      query["billing.status"] = billingStatus;
    }

    const skip = (page - 1) * limit;

    console.log("Companies API - Query:", query);
    console.log("Companies API - Page:", page, "Limit:", limit);

    let companies, totalCount;
    try {
      [companies, totalCount] = await Promise.all([
        StorageCompany.find(query)
          .select("-billing.stripeCustomerId -billing.paymentMethods")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        StorageCompany.countDocuments(query),
      ]);

      console.log(
        "Companies found:",
        companies.length,
        "Total count:",
        totalCount
      );
      console.log("Raw companies:", companies);
    } catch (dbError) {
      console.error("Database query error:", dbError);
      throw dbError;
    }

    // Get user counts for each company
    let companiesWithUserCounts;
    try {
      console.log(
        "Starting user count mapping for",
        companies.length,
        "companies"
      );
      companiesWithUserCounts = await Promise.all(
        companies.map(async (company) => {
          try {
            const userCount = await User.countDocuments({
              storageCompanyId: company._id,
              isActive: true,
            });
            return {
              ...company,
              status: company.registrationStatus,
              userCount,
            };
          } catch (userError) {
            console.error(
              "Error counting users for company",
              company._id,
              userError
            );
            return {
              ...company,
              status: company.registrationStatus,
              userCount: 0,
            };
          }
        })
      );
      console.log("User count mapping completed");
    } catch (mappingError) {
      console.error("User count mapping error:", mappingError);
      companiesWithUserCounts = companies.map((c) => ({ ...c, userCount: 0 }));
    }

    console.log("Companies with user counts:", companiesWithUserCounts.length);

    const responseData = {
      success: true,
      data: {
        companies: companiesWithUserCounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      },
    };

    console.log("Final API response:", JSON.stringify(responseData, null, 2));
    res.json(responseData);
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
 * Get company statistics for dashboard
 */
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    // Only GUARDIAN admins can view statistics
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const [
      totalCompanies,
      activeCompanies,
      pendingCompanies,
      totalCompanyUsers,
    ] = await Promise.all([
      StorageCompany.countDocuments(),
      StorageCompany.countDocuments({ registrationStatus: "active" }),
      StorageCompany.countDocuments({ registrationStatus: "pending" }),
      User.countDocuments({
        userType: {
          $in: ["storage-admin", "storage-manager", "storage-employee"],
        },
        isActive: true,
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
 * Create a new storage company
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    // Only GUARDIAN admins can create companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

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

    // Validation
    if (!name || !slug || !contactName || !email || !companyType) {
      return res.status(400).json({
        success: false,
        error: "Name, slug, contact name, email, and company type are required",
      });
    }

    // Check for duplicate slug
    const existingSlug = await StorageCompany.findOne({ slug });
    if (existingSlug) {
      return res.status(400).json({
        success: false,
        error: "Company slug already exists",
      });
    }

    // Check for duplicate email
    const existingEmail = await StorageCompany.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: "Company email already exists",
      });
    }

    // Create company
    const company = new StorageCompany({
      name: name.trim(),
      slug: slug.toLowerCase().trim(),
      contactName: contactName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      companyType,
      guardianPlan,
      registrationStatus: status,
      address: address || {},
      createdBy: req.user.userId,
      lastModifiedBy: req.user.userId,
    });

    await company.save();

    res.status(201).json({
      success: true,
      message: "Storage company created successfully",
      data: {
        company: {
          id: company._id,
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

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: `Company ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create company",
    });
  }
});

/**
 * GET /api/companies/:companyId
 * Get a specific company
 */
router.get("/:companyId", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Only GUARDIAN admins can view company details
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const company = await StorageCompany.findById(companyId)
      .populate("createdBy", "firstName lastName email")
      .populate("lastModifiedBy", "firstName lastName email");

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    // Get user count
    const userCount = await User.countDocuments({
      storageCompanyId: companyId,
      isActive: true,
    });

    res.json({
      success: true,
      data: {
        company: {
          ...company.toObject(),
          userCount,
        },
      },
    });
  } catch (error) {
    console.error("Get company error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve company",
    });
  }
});

/**
 * PUT /api/companies/:companyId
 * Update a storage company
 */
router.put("/:companyId", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Only GUARDIAN admins can update companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const company = await StorageCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
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

    // Check for duplicate slug (excluding current company)
    if (slug && slug !== company.slug) {
      const existingSlug = await StorageCompany.findOne({
        slug,
        _id: { $ne: companyId },
      });
      if (existingSlug) {
        return res.status(400).json({
          success: false,
          error: "Company slug already exists",
        });
      }
    }

    // Check for duplicate email (excluding current company)
    if (email && email !== company.email) {
      const existingEmail = await StorageCompany.findOne({
        email,
        _id: { $ne: companyId },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: "Company email already exists",
        });
      }
    }

    // Update company
    const updateData = {
      lastModifiedBy: req.user.userId,
      updatedAt: new Date(),
    };

    if (name) updateData.name = name.trim();
    if (slug) updateData.slug = slug.toLowerCase().trim();
    if (contactName) updateData.contactName = contactName.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (phone !== undefined) updateData.phone = phone?.trim();
    if (companyType) updateData.companyType = companyType;
    if (guardianPlan) updateData.guardianPlan = guardianPlan;
    if (status) {
      updateData.registrationStatus = status;
      // Sync isActive field with registrationStatus
      updateData.isActive = status === "active";
    }
    if (address) updateData.address = { ...company.address, ...address };

    const updatedCompany = await StorageCompany.findByIdAndUpdate(
      companyId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Company updated successfully",
      data: {
        company: updatedCompany,
      },
    });
  } catch (error) {
    console.error("Update company error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: `Company ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update company",
    });
  }
});

/**
 * DELETE /api/companies/:companyId
 * Delete a storage company (soft delete)
 */
router.delete("/:companyId", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Only GUARDIAN admins can delete companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const company = await StorageCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    // Check if company has active users
    const activeUsers = await User.countDocuments({
      storageCompanyId: companyId,
      isActive: true,
    });

    if (activeUsers > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete company with ${activeUsers} active users. Deactivate users first.`,
      });
    }

    // Soft delete - set status to inactive
    await StorageCompany.findByIdAndUpdate(companyId, {
      registrationStatus: "suspended",
      lastModifiedBy: req.user.userId,
      deletedAt: new Date(),
    });

    res.json({
      success: true,
      message: "Company deactivated successfully",
    });
  } catch (error) {
    console.error("Delete company error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete company",
    });
  }
});

/**
 * POST /api/companies/:companyId/activate
 * Activate a storage company
 */
router.post("/:companyId/activate", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Only GUARDIAN admins can activate companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const company = await StorageCompany.findByIdAndUpdate(
      companyId,
      {
        registrationStatus: "active",
        lastModifiedBy: req.user.userId,
      },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    res.json({
      success: true,
      message: "Company activated successfully",
      data: { company },
    });
  } catch (error) {
    console.error("Activate company error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to activate company",
    });
  }
});

/**
 * POST /api/companies/:companyId/suspend
 * Suspend a storage company
 */
router.post("/:companyId/suspend", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { reason } = req.body;

    // Only GUARDIAN admins can suspend companies
    if (req.user.role !== "guardian-admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. GUARDIAN admin privileges required.",
      });
    }

    const company = await StorageCompany.findByIdAndUpdate(
      companyId,
      {
        registrationStatus: "suspended",
        suspensionReason: reason,
        suspendedAt: new Date(),
        lastModifiedBy: req.user.userId,
      },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    res.json({
      success: true,
      message: "Company suspended successfully",
      data: { company },
    });
  } catch (error) {
    console.error("Suspend company error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to suspend company",
    });
  }
});

module.exports = router;

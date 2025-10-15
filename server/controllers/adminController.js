const { StorageCompany, User } = require("../models");

/**
 * Get company billing details (admin only)
 */
const getCompanyBilling = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await StorageCompany.findById(companyId)
      .select("name email guardianBilling platformLimits registrationStatus")
      .lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    // Calculate current effective rate
    let effectiveRate = company.guardianBilling.monthlyRecurringRevenue || 0;

    if (company.guardianBilling.customPricing?.isCustomPlan) {
      effectiveRate =
        company.guardianBilling.customPricing.customMonthlyRate ||
        effectiveRate;

      // Apply active adjustments
      const activeAdjustments =
        company.guardianBilling.customPricing.adjustments?.filter(
          (adj) =>
            adj.isActive && (!adj.expiresAt || adj.expiresAt > new Date())
        ) || [];

      const totalAdjustments = activeAdjustments.reduce(
        (sum, adj) => sum + adj.amount,
        0
      );
      effectiveRate += totalAdjustments;
    }

    res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.name,
          email: company.email,
        },
        billing: company.guardianBilling,
        limits: company.platformLimits,
        effectiveMonthlyRate: Math.max(0, effectiveRate), // Ensure not negative
        status: company.registrationStatus,
      },
    });
  } catch (error) {
    console.error("Get company billing error:", error);
    res.status(500).json({
      success: false,
      error: "Server error retrieving company billing",
    });
  }
};

/**
 * Set custom pricing for a company
 */
const setCustomPricing = async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      customMonthlyRate,
      customYearlyRate,
      billingCycle = "monthly",
      dealInfo,
      reason,
    } = req.body;

    if (!customMonthlyRate || customMonthlyRate < 0) {
      return res.status(400).json({
        success: false,
        error: "Valid custom monthly rate is required",
      });
    }

    const company = await StorageCompany.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    // Set custom pricing
    company.guardianBilling.planName = "custom";
    company.guardianBilling.monthlyRecurringRevenue = customMonthlyRate;
    company.guardianBilling.customPricing = {
      isCustomPlan: true,
      customMonthlyRate,
      customYearlyRate: customYearlyRate || customMonthlyRate * 12,
      billingCycle,
      adjustments: company.guardianBilling.customPricing?.adjustments || [],
      dealInfo: {
        ...company.guardianBilling.customPricing?.dealInfo,
        ...dealInfo,
        contractStartDate: dealInfo?.contractStartDate
          ? new Date(dealInfo.contractStartDate)
          : new Date(),
        contractEndDate: dealInfo?.contractEndDate
          ? new Date(dealInfo.contractEndDate)
          : null,
      },
    };

    // Add audit log for the pricing change
    if (!company.guardianBilling.customPricing.adjustments) {
      company.guardianBilling.customPricing.adjustments = [];
    }

    company.guardianBilling.customPricing.adjustments.push({
      type: "manual-adjustment",
      amount: 0, // No additional amount, just logging the base rate change
      description: `Custom pricing set: $${customMonthlyRate}/month`,
      reason: reason || "Custom pricing agreement",
      appliedBy: req.user?.id, // Will be set by auth middleware later
      appliedAt: new Date(),
      isRecurring: false,
      isActive: true,
    });

    await company.save();

    res.json({
      success: true,
      message: "Custom pricing set successfully",
      data: {
        companyId: company._id,
        planName: company.guardianBilling.planName,
        customMonthlyRate,
        customYearlyRate:
          company.guardianBilling.customPricing.customYearlyRate,
        billingCycle,
      },
    });
  } catch (error) {
    console.error("Set custom pricing error:", error);
    res.status(500).json({
      success: false,
      error: "Server error setting custom pricing",
    });
  }
};

/**
 * Add billing adjustment (discount, credit, fee, etc.)
 */
const addBillingAdjustment = async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      type,
      amount,
      description,
      reason,
      isRecurring = false,
      expiresAt,
    } = req.body;

    if (!type || !amount || !description) {
      return res.status(400).json({
        success: false,
        error: "Type, amount, and description are required",
      });
    }

    if (
      !["discount", "credit", "fee", "refund", "manual-adjustment"].includes(
        type
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid adjustment type",
      });
    }

    const company = await StorageCompany.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    // Initialize custom pricing if not exists
    if (!company.guardianBilling.customPricing) {
      company.guardianBilling.customPricing = {
        isCustomPlan: true,
        adjustments: [],
      };
    }

    if (!company.guardianBilling.customPricing.adjustments) {
      company.guardianBilling.customPricing.adjustments = [];
    }

    // Add the adjustment
    const adjustment = {
      type,
      amount: parseFloat(amount),
      description,
      reason,
      appliedBy: req.user?.id, // Will be set by auth middleware later
      appliedAt: new Date(),
      isRecurring,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    };

    company.guardianBilling.customPricing.adjustments.push(adjustment);
    company.guardianBilling.customPricing.isCustomPlan = true;

    await company.save();

    res.json({
      success: true,
      message: "Billing adjustment added successfully",
      data: {
        companyId: company._id,
        adjustment: {
          ...adjustment,
          id: company.guardianBilling.customPricing.adjustments[
            company.guardianBilling.customPricing.adjustments.length - 1
          ]._id,
        },
      },
    });
  } catch (error) {
    console.error("Add billing adjustment error:", error);
    res.status(500).json({
      success: false,
      error: "Server error adding billing adjustment",
    });
  }
};

/**
 * Remove or deactivate billing adjustment
 */
const removeBillingAdjustment = async (req, res) => {
  try {
    const { companyId, adjustmentId } = req.params;

    const company = await StorageCompany.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    if (!company.guardianBilling.customPricing?.adjustments) {
      return res.status(404).json({
        success: false,
        error: "No adjustments found",
      });
    }

    const adjustment =
      company.guardianBilling.customPricing.adjustments.id(adjustmentId);

    if (!adjustment) {
      return res.status(404).json({
        success: false,
        error: "Adjustment not found",
      });
    }

    // Deactivate instead of removing for audit trail
    adjustment.isActive = false;

    await company.save();

    res.json({
      success: true,
      message: "Billing adjustment removed successfully",
      data: {
        companyId: company._id,
        adjustmentId,
      },
    });
  } catch (error) {
    console.error("Remove billing adjustment error:", error);
    res.status(500).json({
      success: false,
      error: "Server error removing billing adjustment",
    });
  }
};

/**
 * Get all companies with custom pricing (admin overview)
 */
const getCustomPricingOverview = async (req, res) => {
  try {
    const companies = await StorageCompany.find({
      "guardianBilling.customPricing.isCustomPlan": true,
    })
      .select(
        "name email guardianBilling.planName guardianBilling.monthlyRecurringRevenue guardianBilling.customPricing"
      )
      .lean();

    const overview = companies.map((company) => {
      let effectiveRate = company.guardianBilling.monthlyRecurringRevenue || 0;

      // Calculate effective rate with adjustments
      if (company.guardianBilling.customPricing?.adjustments) {
        const activeAdjustments =
          company.guardianBilling.customPricing.adjustments.filter(
            (adj) =>
              adj.isActive &&
              (!adj.expiresAt || new Date(adj.expiresAt) > new Date())
          );

        const totalAdjustments = activeAdjustments.reduce(
          (sum, adj) => sum + adj.amount,
          0
        );
        effectiveRate += totalAdjustments;
      }

      return {
        companyId: company._id,
        name: company.name,
        email: company.email,
        planName: company.guardianBilling.planName,
        standardRate: company.guardianBilling.monthlyRecurringRevenue,
        effectiveRate: Math.max(0, effectiveRate),
        hasActiveAdjustments:
          company.guardianBilling.customPricing?.adjustments?.some(
            (adj) =>
              adj.isActive &&
              (!adj.expiresAt || new Date(adj.expiresAt) > new Date())
          ) || false,
        dealInfo: company.guardianBilling.customPricing?.dealInfo,
      };
    });

    res.json({
      success: true,
      data: {
        totalCustomPricingClients: overview.length,
        companies: overview,
        totalMonthlyRevenue: overview.reduce(
          (sum, company) => sum + company.effectiveRate,
          0
        ),
      },
    });
  } catch (error) {
    console.error("Get custom pricing overview error:", error);
    res.status(500).json({
      success: false,
      error: "Server error retrieving custom pricing overview",
    });
  }
};

module.exports = {
  getCompanyBilling,
  setCustomPricing,
  addBillingAdjustment,
  removeBillingAdjustment,
  getCustomPricingOverview,
};

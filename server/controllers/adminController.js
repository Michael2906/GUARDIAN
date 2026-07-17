const crypto = require("crypto");
const { Op } = require("sequelize");
const { StorageCompany } = require("../models");

/**
 * Billing / custom-pricing admin controller (Azure SQL edition).
 * `guardianBilling` is stored as a JSON column; we manipulate it as a plain
 * object and reassign it so the model persists the change on save.
 */

const activeAdjustmentTotal = (billing) => {
  const adjustments = billing?.customPricing?.adjustments || [];
  return adjustments
    .filter((adj) => adj.isActive && (!adj.expiresAt || new Date(adj.expiresAt) > new Date()))
    .reduce((sum, adj) => sum + (adj.amount || 0), 0);
};

const getCompanyBilling = async (req, res) => {
  try {
    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const billing = company.guardianBilling || {};
    let effectiveRate = billing.monthlyRecurringRevenue || 0;
    if (billing.customPricing?.isCustomPlan) {
      effectiveRate = billing.customPricing.customMonthlyRate || effectiveRate;
      effectiveRate += activeAdjustmentTotal(billing);
    }

    res.json({
      success: true,
      data: {
        company: { id: company.id, name: company.name, email: company.email },
        billing,
        limits: company.platformLimits,
        effectiveMonthlyRate: Math.max(0, effectiveRate),
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

const setCustomPricing = async (req, res) => {
  try {
    const { customMonthlyRate, customYearlyRate, billingCycle = "monthly", dealInfo, reason } = req.body;

    if (!customMonthlyRate || customMonthlyRate < 0) {
      return res.status(400).json({
        success: false,
        error: "Valid custom monthly rate is required",
      });
    }

    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const billing = company.guardianBilling || {};
    const existing = billing.customPricing || {};
    billing.planName = "custom";
    billing.monthlyRecurringRevenue = customMonthlyRate;
    billing.customPricing = {
      isCustomPlan: true,
      customMonthlyRate,
      customYearlyRate: customYearlyRate || customMonthlyRate * 12,
      billingCycle,
      adjustments: existing.adjustments || [],
      dealInfo: {
        ...(existing.dealInfo || {}),
        ...dealInfo,
        contractStartDate: dealInfo?.contractStartDate
          ? new Date(dealInfo.contractStartDate)
          : new Date(),
        contractEndDate: dealInfo?.contractEndDate ? new Date(dealInfo.contractEndDate) : null,
      },
    };
    billing.customPricing.adjustments.push({
      id: crypto.randomUUID(),
      type: "manual-adjustment",
      amount: 0,
      description: `Custom pricing set: $${customMonthlyRate}/month`,
      reason: reason || "Custom pricing agreement",
      appliedBy: req.user?.id,
      appliedAt: new Date(),
      isRecurring: false,
      isActive: true,
    });

    company.guardianBilling = billing;
    await company.save();

    res.json({
      success: true,
      message: "Custom pricing set successfully",
      data: {
        companyId: company.id,
        planName: billing.planName,
        customMonthlyRate,
        customYearlyRate: billing.customPricing.customYearlyRate,
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

const addBillingAdjustment = async (req, res) => {
  try {
    const { type, amount, description, reason, isRecurring = false, expiresAt } = req.body;

    if (!type || !amount || !description) {
      return res.status(400).json({
        success: false,
        error: "Type, amount, and description are required",
      });
    }
    if (!["discount", "credit", "fee", "refund", "manual-adjustment"].includes(type)) {
      return res.status(400).json({ success: false, error: "Invalid adjustment type" });
    }

    const company = await StorageCompany.findByPk(req.params.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const billing = company.guardianBilling || {};
    if (!billing.customPricing) billing.customPricing = { isCustomPlan: true, adjustments: [] };
    if (!billing.customPricing.adjustments) billing.customPricing.adjustments = [];

    const adjustment = {
      id: crypto.randomUUID(),
      type,
      amount: parseFloat(amount),
      description,
      reason,
      appliedBy: req.user?.id,
      appliedAt: new Date(),
      isRecurring,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    };
    billing.customPricing.adjustments.push(adjustment);
    billing.customPricing.isCustomPlan = true;

    company.guardianBilling = billing;
    await company.save();

    res.json({
      success: true,
      message: "Billing adjustment added successfully",
      data: { companyId: company.id, adjustment },
    });
  } catch (error) {
    console.error("Add billing adjustment error:", error);
    res.status(500).json({
      success: false,
      error: "Server error adding billing adjustment",
    });
  }
};

const removeBillingAdjustment = async (req, res) => {
  try {
    const { companyId, adjustmentId } = req.params;
    const company = await StorageCompany.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const billing = company.guardianBilling || {};
    const adjustments = billing.customPricing?.adjustments;
    if (!adjustments) {
      return res.status(404).json({ success: false, error: "No adjustments found" });
    }

    const adjustment = adjustments.find((a) => a.id === adjustmentId);
    if (!adjustment) {
      return res.status(404).json({ success: false, error: "Adjustment not found" });
    }

    adjustment.isActive = false;
    company.guardianBilling = billing;
    await company.save();

    res.json({
      success: true,
      message: "Billing adjustment removed successfully",
      data: { companyId: company.id, adjustmentId },
    });
  } catch (error) {
    console.error("Remove billing adjustment error:", error);
    res.status(500).json({
      success: false,
      error: "Server error removing billing adjustment",
    });
  }
};

const getCustomPricingOverview = async (req, res) => {
  try {
    const companies = await StorageCompany.findAll({
      where: { guardianBilling: { [Op.like]: '%"isCustomPlan":true%' } },
    });

    const overview = companies.map((company) => {
      const billing = company.guardianBilling || {};
      let effectiveRate = billing.monthlyRecurringRevenue || 0;
      effectiveRate += activeAdjustmentTotal(billing);

      return {
        companyId: company.id,
        name: company.name,
        email: company.email,
        planName: billing.planName,
        standardRate: billing.monthlyRecurringRevenue,
        effectiveRate: Math.max(0, effectiveRate),
        hasActiveAdjustments:
          (billing.customPricing?.adjustments || []).some(
            (adj) => adj.isActive && (!adj.expiresAt || new Date(adj.expiresAt) > new Date())
          ) || false,
        dealInfo: billing.customPricing?.dealInfo,
      };
    });

    res.json({
      success: true,
      data: {
        totalCustomPricingClients: overview.length,
        companies: overview,
        totalMonthlyRevenue: overview.reduce((sum, c) => sum + c.effectiveRate, 0),
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

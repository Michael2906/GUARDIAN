const crypto = require("crypto");
const { Op } = require("sequelize");
const { StorageCompany, User } = require("../models");

/**
 * Generate a unique company slug from company name
 */
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
};

/**
 * Check if company name / email / slug is available
 */
const checkAvailability = async (req, res) => {
  try {
    const { name, email, slug } = req.query;
    const checks = {};

    if (name) {
      const exists = await StorageCompany.findOne({ where: { name } });
      checks.nameAvailable = !exists;
    }
    if (email) {
      const exists = await StorageCompany.findOne({
        where: { email: email.toLowerCase() },
      });
      checks.emailAvailable = !exists;
    }
    if (slug) {
      const exists = await StorageCompany.findOne({ where: { slug } });
      checks.slugAvailable = !exists;
    }

    res.json({ success: true, checks });
  } catch (error) {
    console.error("Availability check error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during availability check",
    });
  }
};

/**
 * Register a new storage company (self-service onboarding)
 */
const registerCompany = async (req, res) => {
  try {
    const {
      companyName,
      companyType = "3pl-provider",
      companyEmail,
      companyPhone,
      street,
      city,
      state,
      zipCode,
      country = "USA",
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,
      estimatedWarehouseCount = 1,
      estimatedClientCount = 10,
      website,
      description,
    } = req.body;

    if (!companyName || !companyEmail || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: companyName, companyEmail, adminEmail, adminPassword",
      });
    }
    if (!adminFirstName || !adminLastName) {
      return res.status(400).json({
        success: false,
        error: "Admin user first name and last name are required",
      });
    }
    if (!street || !city || !state || !zipCode) {
      return res.status(400).json({ success: false, error: "Complete address is required" });
    }
    if (adminPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Admin password must be at least 8 characters long",
      });
    }

    const existingCompany = await StorageCompany.findOne({
      where: { [Op.or]: [{ name: companyName }, { email: companyEmail.toLowerCase() }] },
    });
    if (existingCompany) {
      return res.status(409).json({
        success: false,
        error: "Company with this name or email already exists",
      });
    }

    const existingUser = await User.findOne({
      where: { email: adminEmail.toLowerCase() },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    // Unique slug
    const baseSlug = generateSlug(companyName);
    let slug = baseSlug;
    let counter = 1;
    while (await StorageCompany.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const storageCompany = await StorageCompany.create({
      name: companyName,
      slug,
      companyType,
      email: companyEmail.toLowerCase(),
      phone: companyPhone,
      address: { street, city, state, zipCode, country, website, description },
      platformLimits: {
        maxWarehouses: Math.max(estimatedWarehouseCount, 2),
        maxClientBusinesses: Math.max(estimatedClientCount, 50),
        maxUsersTotal: 10,
        maxStorageGB: 10000,
      },
      guardianBilling: {
        planName: "basic",
        billingStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        monthlyRecurringRevenue: 99,
        customPricing: { isCustomPlan: false, adjustments: [] },
      },
      registrationStatus: "pending",
      verificationToken,
      verificationExpires,
      isActive: false,
      isVerified: false,
    });

    // Admin user — plaintext password, hashed once by the model hook.
    await User.create({
      storageCompanyId: storageCompany.id,
      userType: "storage-admin",
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      firstName: adminFirstName,
      lastName: adminLastName,
      isActive: false,
      isEmailVerified: false,
    });

    res.status(201).json({
      success: true,
      message:
        "Storage company registration initiated. Please check email for verification.",
      data: {
        companyId: storageCompany.id,
        companySlug: slug,
        verificationToken:
          process.env.NODE_ENV === "development" ? verificationToken : undefined,
      },
    });
  } catch (error) {
    console.error("Company registration error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during registration",
    });
  }
};

/**
 * Verify email and activate company
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Verification token is required",
      });
    }

    const company = await StorageCompany.findOne({
      where: {
        verificationToken: token,
        verificationExpires: { [Op.gt]: new Date() },
        registrationStatus: "pending",
      },
    });

    if (!company) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification token",
      });
    }

    company.registrationStatus = "email-verified";
    company.isVerified = true;
    company.verificationToken = null;
    company.verificationExpires = null;
    await company.save();

    await User.update(
      { isActive: true, isEmailVerified: true },
      { where: { storageCompanyId: company.id, userType: "storage-admin" } }
    );

    res.json({
      success: true,
      message:
        "Email verified successfully. You can now complete your company setup.",
      data: {
        companyId: company.id,
        companySlug: company.slug,
        nextStep: "setup",
      },
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during email verification",
    });
  }
};

/**
 * Complete company setup (onboarding steps)
 */
const completeSetup = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { step, subscriptionPlan = "basic", billingInfo, preferences } = req.body;

    const company = await StorageCompany.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    if (
      company.registrationStatus !== "email-verified" &&
      company.registrationStatus !== "setup-completed"
    ) {
      return res.status(400).json({
        success: false,
        error: "Email must be verified before completing setup",
      });
    }

    const planLimits = {
      basic: { maxWarehouses: 2, maxClientBusinesses: 50, maxUsersTotal: 10, maxStorageGB: 10000, monthlyPrice: 99 },
      pro: { maxWarehouses: 10, maxClientBusinesses: 250, maxUsersTotal: 50, maxStorageGB: 50000, monthlyPrice: 299 },
      enterprise: { maxWarehouses: -1, maxClientBusinesses: -1, maxUsersTotal: -1, maxStorageGB: -1, monthlyPrice: 899 },
    };

    switch (step) {
      case "subscription": {
        const limits = planLimits[subscriptionPlan] || planLimits.basic;
        company.platformLimits = { ...company.platformLimits, ...limits };
        const billing = company.guardianBilling || {};
        billing.subscriptionId = subscriptionPlan;
        billing.planName = subscriptionPlan;
        billing.monthlyRecurringRevenue = limits.monthlyPrice;
        company.guardianBilling = billing;
        break;
      }
      case "billing":
        if (billingInfo) {
          company.guardianBilling = { ...company.guardianBilling, ...billingInfo };
        }
        break;
      case "preferences":
        if (preferences) {
          company.settings = { ...company.settings, ...preferences };
        }
        break;
      default:
        break;
    }

    company.setupStep = Math.max(company.setupStep, parseInt(step, 10) || 1);
    if (company.setupStep >= 4) {
      company.registrationStatus = "setup-completed";
      company.isActive = true;
      company.onboardingCompleted = true;
    }

    await company.save();

    res.json({
      success: true,
      message: `Setup step ${step} completed successfully`,
      data: {
        companyId: company.id,
        currentStep: company.setupStep,
        isComplete: company.onboardingCompleted,
        isActive: company.isActive,
      },
    });
  } catch (error) {
    console.error("Setup completion error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during setup completion",
    });
  }
};

/**
 * Available subscription plans (static)
 */
const getSubscriptionPlans = async (req, res) => {
  const plans = {
    basic: { id: "basic", name: "Basic Plan", description: "Perfect for small 3PL operations getting started", monthlyPrice: 99, yearlyPrice: 990, features: ["Up to 2 warehouses", "Up to 50 client businesses", "Up to 10 team members", "10GB storage", "Basic reporting & analytics", "Email support"], limits: { maxWarehouses: 2, maxClients: 50, maxUsers: 10, maxStorageGB: 10000 }, popular: false },
    pro: { id: "pro", name: "Professional Plan", description: "Ideal for growing 3PL companies with multiple clients", monthlyPrice: 299, yearlyPrice: 2990, features: ["Up to 10 warehouses", "Up to 250 client businesses", "Up to 50 team members", "50GB storage", "Advanced reporting", "Priority support", "Two-factor authentication"], limits: { maxWarehouses: 10, maxClients: 250, maxUsers: 50, maxStorageGB: 50000 }, popular: true },
    enterprise: { id: "enterprise", name: "Enterprise Plan", description: "For large-scale 3PL operations requiring maximum flexibility", monthlyPrice: 899, yearlyPrice: 8990, customPricing: true, features: ["Unlimited warehouses", "Unlimited client businesses", "Unlimited team members", "Unlimited storage", "White-label options", "Dedicated account manager"], limits: { maxWarehouses: -1, maxClients: -1, maxUsers: -1, maxStorageGB: -1 }, popular: false },
  };

  res.json({
    success: true,
    plans: Object.values(plans),
    trialPeriod: "14 days",
    currency: "USD",
    billingNote:
      "All plans include a 14-day free trial. No credit card required to start.",
  });
};

/**
 * Resend verification email
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const company = await StorageCompany.findOne({
      where: { email: email.toLowerCase(), registrationStatus: "pending" },
    });
    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found or already verified",
      });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    company.verificationToken = verificationToken;
    company.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await company.save();

    res.json({
      success: true,
      message: "Verification email sent successfully",
      data: process.env.NODE_ENV === "development" ? { verificationToken } : {},
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      error: "Server error while resending verification email",
    });
  }
};

module.exports = {
  checkAvailability,
  registerCompany,
  verifyEmail,
  completeSetup,
  resendVerification,
  getSubscriptionPlans,
};

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { StorageCompany, User } = require("../models");

/**
 * Generate a unique company slug from company name
 */
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .substring(0, 50); // Limit length
};

/**
 * Check if company name or email is already taken
 */
const checkAvailability = async (req, res) => {
  try {
    const { name, email, slug } = req.query;

    const checks = {};

    if (name) {
      const nameExists = await StorageCompany.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
      });
      checks.nameAvailable = !nameExists;
    }

    if (email) {
      const emailExists = await StorageCompany.findOne({
        email: email.toLowerCase(),
      });
      checks.emailAvailable = !emailExists;
    }

    if (slug) {
      const slugExists = await StorageCompany.findOne({ slug });
      checks.slugAvailable = !slugExists;
    }

    res.json({
      success: true,
      checks,
    });
  } catch (error) {
    console.error("Availability check error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during availability check",
    });
  }
};

/**
 * Register a new storage company
 */
const registerCompany = async (req, res) => {
  try {
    const {
      // Company Information
      companyName,
      companyType = "3pl-provider",
      businessTaxId,
      yearsInBusiness,

      // Contact Information
      companyEmail,
      companyPhone,

      // Address
      street,
      city,
      state,
      zipCode,
      country = "USA",

      // Admin User
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,

      // Business Details
      estimatedWarehouseCount = 1,
      estimatedClientCount = 10,

      // Optional
      website,
      description,
    } = req.body;

    // Validation
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
      return res.status(400).json({
        success: false,
        error: "Complete address is required",
      });
    }

    // Password validation
    if (adminPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Admin password must be at least 8 characters long",
      });
    }

    // Check for existing company with same name or email
    const existingCompany = await StorageCompany.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${companyName}$`, "i") } },
        { email: companyEmail.toLowerCase() },
      ],
    });

    if (existingCompany) {
      return res.status(409).json({
        success: false,
        error: "Company with this name or email already exists",
      });
    }

    // Check for existing user with admin email
    const existingUser = await User.findOne({
      email: adminEmail.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    // Generate unique slug
    let baseSlug = generateSlug(companyName);
    let slug = baseSlug;
    let counter = 1;

    while (await StorageCompany.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create storage company
    const storageCompany = new StorageCompany({
      name: companyName,
      slug,
      companyType,
      email: companyEmail.toLowerCase(),
      phone: companyPhone,

      address: {
        street,
        city,
        state,
        zipCode,
        country,
      },

      businessInfo: {
        taxId: businessTaxId,
        yearsInBusiness: yearsInBusiness
          ? parseInt(yearsInBusiness)
          : undefined,
        website,
        description,
      },

      platformLimits: {
        maxWarehouses: Math.max(estimatedWarehouseCount, 2), // Basic plan starts at 2 warehouses
        maxClients: Math.max(estimatedClientCount, 50), // Basic plan supports up to 50 clients
        maxUsers: 10, // Basic plan allows 10 users
        maxStorageGB: 10000, // 10GB default for basic plan
      },

      // Set up 14-day trial period for all new companies
      guardianBilling: {
        planName: "basic",
        billingStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        monthlyRecurringRevenue: 99, // Basic plan price
      },

      registrationStatus: "pending",
      verificationToken,
      verificationExpires,
      isActive: false,
      isVerified: false,
    });

    await storageCompany.save();

    // Hash admin password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user (but don't activate until email verified)
    const adminUser = new User({
      storageCompanyId: storageCompany._id,
      userType: "storage-admin",

      email: adminEmail.toLowerCase(),
      password: hashedPassword,

      firstName: adminFirstName,
      lastName: adminLastName,

      profile: {
        phone: companyPhone, // Use company phone as default
      },

      permissions: {
        canManageUsers: true,
        canManageClients: true,
        canManageInventory: true,
        canManageWarehouses: true,
        canViewReports: true,
        canManageBilling: true,
        canManageSettings: true,
        dataAccessLevel: "full",
      },

      isActive: false, // Will be activated after email verification
      emailVerified: false,
    });

    await adminUser.save();

    // TODO: Send verification email
    // For now, we'll return the verification token for testing

    res.status(201).json({
      success: true,
      message:
        "Storage company registration initiated. Please check email for verification.",
      data: {
        companyId: storageCompany._id,
        companySlug: slug,
        // Include verification token for testing - remove in production
        verificationToken:
          process.env.NODE_ENV === "development"
            ? verificationToken
            : undefined,
      },
    });
  } catch (error) {
    console.error("Company registration error:", error);

    // Handle specific validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: validationErrors,
      });
    }

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

    // Find company with valid token
    const company = await StorageCompany.findOne({
      verificationToken: token,
      verificationExpires: { $gt: new Date() },
      registrationStatus: "pending",
    });

    if (!company) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification token",
      });
    }

    // Update company status
    company.registrationStatus = "email-verified";
    company.isVerified = true;
    company.verificationToken = undefined;
    company.verificationExpires = undefined;
    await company.save();

    // Activate admin user
    await User.updateOne(
      {
        storageCompanyId: company._id,
        userType: "storage-admin",
      },
      {
        isActive: true,
        emailVerified: true,
      }
    );

    res.json({
      success: true,
      message:
        "Email verified successfully. You can now complete your company setup.",
      data: {
        companyId: company._id,
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
    const {
      step,
      subscriptionPlan = "basic",
      initialWarehouse,
      billingInfo,
      preferences,
    } = req.body;

    const company = await StorageCompany.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
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

    // Handle different setup steps
    switch (step) {
      case "subscription":
        // Set subscription plan and limits (All plans are paid)
        const planLimits = {
          basic: {
            maxWarehouses: 2,
            maxClients: 50,
            maxUsers: 10,
            maxStorageGB: 10000,
            monthlyPrice: 99, // $99/month for basic plan
            features: [
              "Multi-client management",
              "Basic reporting",
              "Email support",
              "Standard API access",
            ],
          },
          pro: {
            maxWarehouses: 10,
            maxClients: 250,
            maxUsers: 50,
            maxStorageGB: 50000,
            monthlyPrice: 299, // $299/month for pro plan
            features: [
              "Advanced reporting",
              "Priority support",
              "API webhooks",
              "Custom integrations",
              "2FA required",
            ],
          },
          enterprise: {
            maxWarehouses: -1, // Unlimited
            maxClients: -1, // Unlimited
            maxUsers: -1, // Unlimited
            maxStorageGB: -1, // Unlimited
            monthlyPrice: 899, // $899/month for enterprise (custom pricing available)
            features: [
              "Unlimited everything",
              "White-label options",
              "Dedicated support",
              "Custom development",
              "SLA guarantees",
            ],
          },
        };

        const limits = planLimits[subscriptionPlan] || planLimits.basic;
        company.platformLimits = limits;
        company.guardianBilling.subscriptionId = subscriptionPlan;
        company.guardianBilling.planName = subscriptionPlan;
        company.guardianBilling.monthlyRecurringRevenue = limits.monthlyPrice;
        break;

      case "warehouse":
        // Initial warehouse setup will be handled separately
        // Just mark this step as completed
        break;

      case "billing":
        // Set up billing information
        if (billingInfo) {
          company.guardianBilling = {
            ...company.guardianBilling,
            ...billingInfo,
          };
        }
        break;

      case "preferences":
        // Set company preferences
        if (preferences) {
          company.settings = { ...company.settings, ...preferences };
        }
        break;
    }

    // Update setup step
    company.setupStep = Math.max(company.setupStep, parseInt(step) || 1);

    // If all steps completed, activate company
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
        companyId: company._id,
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
 * Get available subscription plans and pricing
 */
const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = {
      basic: {
        id: "basic",
        name: "Basic Plan",
        description: "Perfect for small 3PL operations getting started",
        monthlyPrice: 99,
        yearlyPrice: 990, // 2 months free
        features: [
          "Up to 2 warehouses",
          "Up to 50 client businesses",
          "Up to 10 team members",
          "10GB storage",
          "Multi-client management",
          "Basic reporting & analytics",
          "Email support",
          "Standard API access",
          "Mobile app access",
        ],
        limits: {
          maxWarehouses: 2,
          maxClients: 50,
          maxUsers: 10,
          maxStorageGB: 10000,
        },
        popular: false,
      },

      pro: {
        id: "pro",
        name: "Professional Plan",
        description: "Ideal for growing 3PL companies with multiple clients",
        monthlyPrice: 299,
        yearlyPrice: 2990, // 2 months free
        features: [
          "Up to 10 warehouses",
          "Up to 250 client businesses",
          "Up to 50 team members",
          "50GB storage",
          "Advanced reporting & analytics",
          "Priority email & phone support",
          "API webhooks",
          "Custom integrations",
          "Two-factor authentication",
          "Advanced user permissions",
          "Bulk operations",
          "Export capabilities",
        ],
        limits: {
          maxWarehouses: 10,
          maxClients: 250,
          maxUsers: 50,
          maxStorageGB: 50000,
        },
        popular: true,
      },

      enterprise: {
        id: "enterprise",
        name: "Enterprise Plan",
        description:
          "For large-scale 3PL operations requiring maximum flexibility",
        monthlyPrice: 899,
        yearlyPrice: 8990, // 2 months free
        customPricing: true,
        features: [
          "Unlimited warehouses",
          "Unlimited client businesses",
          "Unlimited team members",
          "Unlimited storage",
          "White-label options",
          "Dedicated account manager",
          "Custom development",
          "SLA guarantees (99.9% uptime)",
          "Advanced security features",
          "Custom reporting",
          "Priority feature requests",
          "On-premise deployment options",
        ],
        limits: {
          maxWarehouses: -1, // Unlimited
          maxClients: -1,
          maxUsers: -1,
          maxStorageGB: -1,
        },
        popular: false,
      },

      custom: {
        id: "custom",
        name: "Custom Plan",
        description:
          "Tailored pricing and features for unique business requirements",
        monthlyPrice: null, // Set individually
        yearlyPrice: null,
        customPricing: true,
        contactSales: true,
        features: [
          "Fully customizable features",
          "Negotiated pricing",
          "Custom contract terms",
          "Flexible billing cycles",
          "Volume discounts available",
          "Multi-year agreements",
          "Custom integrations",
          "Dedicated implementation team",
          "Priority support",
          "Custom SLA agreements",
        ],
        limits: {
          maxWarehouses: "Custom",
          maxClients: "Custom",
          maxUsers: "Custom",
          maxStorageGB: "Custom",
        },
        popular: false,
        hidden: true, // Don't show in public pricing, only for admin use
      },
    };

    res.json({
      success: true,
      plans: Object.values(plans),
      trialPeriod: "14 days",
      currency: "USD",
      billingNote:
        "All plans include a 14-day free trial. No credit card required to start.",
    });
  } catch (error) {
    console.error("Get subscription plans error:", error);
    res.status(500).json({
      success: false,
      error: "Server error retrieving subscription plans",
    });
  }
};

/**
 * Resend verification email
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const company = await StorageCompany.findOne({
      email: email.toLowerCase(),
      registrationStatus: "pending",
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found or already verified",
      });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    company.verificationToken = verificationToken;
    company.verificationExpires = verificationExpires;
    await company.save();

    // TODO: Send verification email

    res.json({
      success: true,
      message: "Verification email sent successfully",
      // Include token for testing in development
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

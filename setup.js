#!/usr/bin/env node
/**
 * GUARDIAN Platform Setup Script
 * Creates initial GUARDIAN admin user and platform company
 */

const mongoose = require("mongoose");
const readline = require("readline");
require("dotenv").config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log("🚀 GUARDIAN Platform Setup");
  console.log("============================\n");

  try {
    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Load models
    require("./server/models");
    const { User, Company } = require("./server/models");

    // Check if GUARDIAN admin already exists
    const existingAdmin = await User.findOne({ userType: "guardian-admin" });
    if (existingAdmin) {
      console.log("👤 GUARDIAN admin already exists!");
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log("💡 Use this account to log in to the platform.\n");

      const recreate = await question(
        "Do you want to create another GUARDIAN admin? (y/N): "
      );
      if (recreate.toLowerCase() !== "y") {
        console.log("Setup cancelled.");
        process.exit(0);
      }
    }

    // Get admin details from user
    console.log("👥 Creating GUARDIAN Administrator Account");
    console.log("----------------------------------------");

    const firstName = await question("First Name: ");
    const lastName = await question("Last Name: ");
    const email = await question("Email Address: ");

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("❌ Invalid email address format");
      process.exit(1);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log("❌ A user with this email already exists");
      process.exit(1);
    }

    let password;
    let confirmPassword;

    do {
      password = await question("Password (min 8 characters): ");
      if (password.length < 8) {
        console.log("❌ Password must be at least 8 characters long");
        continue;
      }
      confirmPassword = await question("Confirm Password: ");
      if (password !== confirmPassword) {
        console.log("❌ Passwords do not match");
      }
    } while (password !== confirmPassword || password.length < 8);

    console.log("\n🏢 Creating Platform Company Record...");

    // Create or find GUARDIAN platform company
    let platformCompany = await Company.findOne({ slug: "guardian-platform" });
    if (!platformCompany) {
      platformCompany = new Company({
        name: "GUARDIAN Platform",
        slug: "guardian-platform",
        email: "platform@guardian3pl.com",
        website: "https://guardian3pl.com",
        isActive: true,
        companyType: "3pl-provider",
        billing: {
          subscriptionPlan: "enterprise",
          billingStatus: "active",
        },
      });
      await platformCompany.save();
      console.log("✅ GUARDIAN Platform company created");
    } else {
      console.log("✅ GUARDIAN Platform company found");
    }

    console.log("\n👤 Creating GUARDIAN Administrator...");

    // Create GUARDIAN admin user
    const guardianAdmin = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password, // Will be hashed by User model pre-save hook
      userType: "guardian-admin",
      // Note: storageCompanyId is not set for guardian-admin users
      isEmailVerified: true,
      isActive: true,
      twoFactorAuth: {
        enabled: false,
      },
      preferences: {
        theme: "light",
        notifications: {
          email: true,
          push: false,
        },
      },
    });

    await guardianAdmin.save();

    console.log("\n🎉 GUARDIAN Administrator Created Successfully!");
    console.log("===============================================");
    console.log(`👤 Name: ${firstName} ${lastName}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🎯 User Type: GUARDIAN Administrator`);
    console.log(`🔐 2FA: Disabled (can be enabled after login)`);
    console.log(
      "\n🚀 You can now start the server and log in to the platform!"
    );
    console.log("📝 Run: npm start");
    console.log("🌐 Navigate to: http://localhost:3000");
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  } finally {
    rl.close();
    mongoose.connection.close();
  }
}

// Handle cleanup on exit
process.on("SIGINT", () => {
  console.log("\n👋 Setup cancelled by user");
  rl.close();
  mongoose.connection.close();
  process.exit(0);
});

// Run setup
setup();

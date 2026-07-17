#!/usr/bin/env node
/**
 * Seed / reset a GUARDIAN platform administrator in Azure SQL.
 *
 * Usage:
 *   node seed-admin.js                       # uses defaults below
 *   node seed-admin.js <email> <password>    # explicit
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node seed-admin.js
 *
 * The password is passed as plaintext and hashed exactly once by the User
 * model's beforeSave hook (avoids the double-hash bug in the old Mongo script).
 */
require("dotenv").config();
const { sequelize, syncDatabase, User } = require("./server/models");

async function seed() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || "michael.sewell2906@outlook.com").toLowerCase();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || "Ms3w3ll2906@1";
  const firstName = process.env.ADMIN_FIRST_NAME || "Michael";
  const lastName = process.env.ADMIN_LAST_NAME || "Sewell";

  console.log("🔌 Connecting to Azure SQL...");
  await sequelize.authenticate();
  console.log("✅ Connected");

  console.log("🧱 Ensuring tables exist...");
  await syncDatabase();

  let user = await User.findOne({ where: { email } });

  if (user) {
    console.log(`👤 User ${email} already exists — updating to guardian-admin & resetting password.`);
    user.userType = "guardian-admin";
    user.storageCompanyId = null;
    user.clientBusinessId = null;
    user.isActive = true;
    user.isEmailVerified = true;
    user.password = password; // re-hashed by hook
    user.setDefaultPermissions();
    await user.save();
  } else {
    console.log(`👤 Creating guardian-admin ${email} ...`);
    user = await User.create({
      email,
      password, // hashed by hook
      firstName,
      lastName,
      userType: "guardian-admin",
      isActive: true,
      isEmailVerified: true,
    });
  }

  console.log("\n🎉 GUARDIAN administrator ready");
  console.log("=================================");
  console.log(`📧 Email:    ${email}`);
  console.log(`🔐 Password: ${password}`);
  console.log(`🆔 User ID:  ${user.id}`);
  console.log("👑 Role:     guardian-admin");
  console.log("\n🌐 Start the server (npm start) and log in at http://localhost:3000\n");

  await sequelize.close();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error("\n❌ Seed failed:", err.message);
  console.error(err);
  try {
    await sequelize.close();
  } catch (_) {}
  process.exit(1);
});

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
require('./server/models');

const { User, StorageCompany } = require('./server/models');

async function setupProduction() {
  try {
    // Use production MongoDB URI
    const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI || process.env.MONGODB_URI;
    
    if (!PRODUCTION_MONGODB_URI) {
      console.error('❌ Please set PRODUCTION_MONGODB_URI in your .env file');
      process.exit(1);
    }

    console.log('🔌 Connecting to production database...');
    await mongoose.connect(PRODUCTION_MONGODB_URI);
    console.log('✅ Connected to production MongoDB Atlas');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ 
      email: 'admin@guardian.com',
      role: 'guardian-admin' 
    });

    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists in production database');
      console.log('📧 Email: admin@guardian.com');
      console.log('🔐 Use your existing password');
      await mongoose.connection.close();
      return;
    }

    // Create GUARDIAN Platform company
    console.log('🏢 Creating GUARDIAN Platform company...');
    const guardianCompany = new StorageCompany({
      name: 'GUARDIAN Platform',
      slug: 'guardian-platform',
      email: 'platform@guardian.com',
      companyType: '3pl-provider',
      guardianPlan: 'enterprise',
      registrationStatus: 'active',
      isActive: true,
      isVerified: true,
      onboardingCompleted: true,
      platformLimits: {
        maxClientBusinesses: 999999,
        maxWarehouses: 999999,
        maxUsersTotal: 999999,
        maxItemsPerWarehouse: 999999,
        maxStorageGB: 999999,
        maxAPICallsPerMonth: 999999,
        maxMonthlyInvoices: 999999
      }
    });
    await guardianCompany.save();

    // Create admin user
    console.log('👤 Creating GUARDIAN admin user...');
    const hashedPassword = await bcrypt.hash('Guardian123!', 12);
    
    const adminUser = new User({
      firstName: 'GUARDIAN',
      lastName: 'Administrator',
      email: 'admin@guardian.com',
      password: hashedPassword,
      role: 'guardian-admin',
      userType: 'guardian-admin',
      isEmailVerified: true,
      isActive: true,
      permissions: {
        storageOperations: {
          viewAllClients: true,
          manageClients: true,
          viewInventory: true,
          manageInventory: true,
          processReceiving: true,
          processShipping: true,
          manageBilling: true
        },
        clientOperations: {
          viewOwnInventory: true,
          submitOrders: true,
          viewReports: true,
          exportData: true,
          viewBilling: true,
          manageUsers: true
        },
        administration: {
          manageUsers: true,
          viewAllData: true,
          modifySettings: true,
          accessReports: true,
          manageIntegrations: true
        },
        systemAccess: {
          mobileApp: true,
          webPortal: true,
          apiAccess: true,
          bulkOperations: true
        }
      }
    });
    await adminUser.save();

    console.log('');
    console.log('🎉 Production setup completed successfully!');
    console.log('');
    console.log('📋 Login Details:');
    console.log('📧 Email: admin@guardian.com');
    console.log('🔐 Password: Guardian123!');
    console.log('👑 Role: GUARDIAN Administrator');
    console.log('');
    console.log('🚀 Your application is ready for production use!');
    console.log('🌐 Users can now log in at your deployed URL');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run setup
setupProduction();
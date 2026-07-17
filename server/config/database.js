const { Sequelize } = require("sequelize");
require("dotenv").config();

/**
 * Azure SQL Database connection (via Sequelize + tedious).
 *
 * Configure with either a full connection URL (AZURE_SQL_CONNECTION_STRING as a
 * Sequelize URL) or the discrete AZURE_SQL_* variables below. Azure SQL always
 * requires encryption.
 */

const {
  AZURE_SQL_SERVER,
  AZURE_SQL_DATABASE,
  AZURE_SQL_USER,
  AZURE_SQL_PASSWORD,
  AZURE_SQL_PORT,
  SQL_LOGGING,
} = process.env;

if (!AZURE_SQL_SERVER || !AZURE_SQL_DATABASE || !AZURE_SQL_USER || !AZURE_SQL_PASSWORD) {
  console.error(
    "❌ Missing Azure SQL configuration. Set AZURE_SQL_SERVER, AZURE_SQL_DATABASE, " +
      "AZURE_SQL_USER and AZURE_SQL_PASSWORD in your .env file."
  );
}

const sequelize = new Sequelize(
  AZURE_SQL_DATABASE,
  AZURE_SQL_USER,
  AZURE_SQL_PASSWORD,
  {
    host: AZURE_SQL_SERVER,
    port: parseInt(AZURE_SQL_PORT, 10) || 1433,
    dialect: "mssql",
    dialectOptions: {
      options: {
        encrypt: true, // required for Azure SQL
        trustServerCertificate: false,
        // Azure SQL can be slow to warm up on the serverless tier; be patient.
        requestTimeout: 60000,
        connectTimeout: 60000,
      },
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 60000,
      idle: 10000,
    },
    logging: SQL_LOGGING === "true" ? console.log : false,
  }
);

module.exports = { sequelize, Sequelize };

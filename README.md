# GUARDIAN 3PL Platform

A multi-tenant Third-Party Logistics (3PL) management platform built with
Node.js, Express, and **Azure SQL Database** (via Sequelize).

> **Live:** https://guardian-3pl.azurewebsites.net

## Features

### Authentication & Security

- JWT authentication with refresh tokens
- Two-Factor Authentication (2FA) — TOTP + single-use backup codes
- Role-based access control across a multi-tenant hierarchy
- Password hashing with bcrypt, rate limiting, security headers

### Platform Management

- **Users** — GUARDIAN admins, storage-company users (admin/manager/employee),
  and client-business users (admin/user/viewer)
- **Storage Companies** — onboarding, status, plans, and billing/custom pricing
- **Warehouses** — facilities with type (ambient/refrigerated/frozen/hazmat/mixed),
  capacity, status, and per-warehouse item counts
- **Inventory** — items with SKU, quantity, unit, reorder point, cost and
  location; low-stock / out-of-stock detection
- **Stock movements** — receive / ship / adjust with overship protection and a
  full per-item audit history

### Multi-tenant scoping

GUARDIAN admins see everything; storage users are scoped to their company;
client users see only their own goods; viewers are read-only.

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** Azure SQL Database via [Sequelize](https://sequelize.org/)
  (`tedious` driver). Nested config objects are stored as JSON columns.
- **Frontend:** static HTML + Tailwind (served by Express from `public/`)
- **Hosting:** Azure App Service (Linux), auto-deployed via GitHub Actions

## Project Structure

```
GUARDIAN/
├── public/                       # Frontend (login, dashboards, admin pages)
│   └── admin/                    # user / company / warehouse / inventory mgmt
├── server/
│   ├── config/database.js        # Sequelize (Azure SQL) connection
│   ├── models/                   # Sequelize models (+ _json.js helper)
│   ├── controllers/              # auth, 2FA, admin/billing, registration
│   ├── middleware/auth.js        # JWT auth + RBAC
│   ├── routes/                   # auth, users, companies, warehouses, inventory, …
│   └── server.js                 # app entry (connects + syncs on boot)
├── seed-admin.js                 # create/reset a GUARDIAN admin
├── .env.example                  # copy to .env and fill in
└── .github/workflows/            # CI: auto-deploy to Azure App Service
```

## Setup

### Prerequisites

- Node.js 18+ (deployed on Node 22)
- An Azure SQL Database (server + database)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=guardian_db
AZURE_SQL_USER=your-admin
AZURE_SQL_PASSWORD=your-password
AZURE_SQL_PORT=1433

JWT_SECRET=...            # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_REFRESH_SECRET=...
```

Make sure the Azure SQL server firewall allows your IP (and "Allow Azure
services" for App Service).

### 3. Create the admin & tables

```bash
npm run seed            # connects, creates tables, seeds a guardian-admin
```

Override the default admin with args or env:

```bash
node seed-admin.js you@example.com "YourPassword123!"
```

### 4. Run

```bash
npm start               # http://localhost:3000
# or: npm run dev       (nodemon)
```

Tables are created automatically on boot (`sequelize.sync`). Set
`SQL_SYNC_ALTER=true` to let Sequelize alter existing tables to match models.

## Deployment

Hosted on **Azure App Service** (Linux). Pushes to `main` auto-deploy via the
GitHub Actions workflow in `.github/workflows/`, which uses the
`AZUREAPPSERVICE_PUBLISHPROFILE` repository secret. Environment variables are
set as App Service application settings (not committed).

## API Endpoints (overview)

- **Auth:** `POST /api/auth/login`, `POST /api/auth/login-2fa`,
  `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/verify`,
  `POST /api/auth/change-password`, `GET|PUT /api/auth/profile`
- **2FA:** `GET /api/2fa/status`, `GET /api/2fa/setup`,
  `POST /api/2fa/verify-setup`, `POST /api/2fa/disable`
- **Users:** `GET|POST /api/users`, `GET|PUT|DELETE /api/users/:id`
- **Companies:** `GET|POST /api/companies`, `GET|PUT|DELETE /api/companies/:id`,
  `GET /api/companies/statistics`, activate/suspend
- **Warehouses:** `GET|POST /api/warehouses`,
  `GET|PUT|DELETE /api/warehouses/:id`, `GET /api/warehouses/statistics`
- **Inventory:** `GET|POST /api/inventory`,
  `GET|PUT|DELETE /api/inventory/:id`, `GET /api/inventory/statistics`,
  `POST /api/inventory/:id/adjust`, `GET /api/inventory/:id/movements`

## License

ISC

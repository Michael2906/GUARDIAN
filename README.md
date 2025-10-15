# GUARDIAN 3PL Platform

A comprehensive Third-Party Logistics (3PL) management platform built with
Node.js, Express, and MongoDB.

## Features

### Authentication & Security

- ✅ JWT-based authentication with refresh tokens
- ✅ Two-Factor Authentication (2FA) with QR codes
- ✅ Push notifications for 2FA verification
- ✅ Role-based access control
- ✅ Password hashing with bcrypt
- ✅ Rate limiting and security middleware

### User Management

- ✅ Multi-tenant user system
- ✅ GUARDIAN admin users (platform administrators)
- ✅ Storage company users (admin, manager, employee)
- ✅ Client business users (admin, user, viewer)
- ✅ User creation, editing, and management interface

### Web Interface

- ✅ Responsive login page with 2FA integration
- ✅ Enhanced 2FA verification with push notifications
- ✅ Dashboard with role-based content
- ✅ User management interface for administrators
- ✅ Service Worker for offline functionality

## Project Structure

```
GUARDIAN/
├── public/                 # Frontend files
│   ├── index.html         # Login page
│   ├── 2fa-verify.html    # 2FA verification page
│   ├── dashboard.html     # Main dashboard
│   ├── user-management.html # User management interface
│   └── sw.js             # Service Worker for push notifications
├── server/               # Backend application
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Custom middleware
│   ├── models/           # MongoDB models
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   └── server.js         # Main server file
├── setup.js              # Initial setup script
├── package.json          # Dependencies and scripts
└── .env                  # Environment variables
```

## Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm or yarn

### 1. Clone the Repository

```bash
git clone https://github.com/Michael2906/GUARDIAN.git
cd GUARDIAN
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/guardian

# JWT Secrets
JWT_SECRET=your-super-secure-jwt-secret-here
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-here

# Server Configuration
PORT=3000
NODE_ENV=development

# Push Notifications (VAPID Keys)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=mailto:admin@yourapp.com
```

### 4. Run Initial Setup

```bash
npm run setup
```

This will:

- Connect to your MongoDB database
- Create the initial GUARDIAN administrator account
- Set up the platform company record
- Guide you through the admin account creation process

### 5. Start the Server

```bash
npm start
# or for development with auto-restart:
npm run dev
```

The platform will be available at: `http://localhost:3000`

## Usage

### First Login

1. Navigate to `http://localhost:3000`
2. Use the GUARDIAN admin credentials created during setup
3. Log in to access the platform dashboard

### User Management

GUARDIAN administrators can:

- Create and manage users across all storage companies
- Create GUARDIAN admin users (platform level)
- Create storage company users (admin, manager, employee)
- Create client business users (admin, user, viewer)
- Edit user profiles and permissions
- Deactivate users

### Two-Factor Authentication

- Users can enable 2FA from their profile settings
- Supports TOTP (Google Authenticator, Authy, etc.)
- Push notification support for streamlined verification
- Backup codes for account recovery

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify JWT token

### Two-Factor Authentication

- `GET /api/auth/2fa/status` - Get 2FA status
- `POST /api/auth/2fa/setup` - Generate 2FA QR code
- `POST /api/auth/2fa/verify-setup` - Verify and enable 2FA
- `POST /api/auth/2fa/verify` - Verify 2FA code
- `POST /api/auth/2fa/disable` - Disable 2FA

### User Management

- `GET /api/users` - List users (filtered by permissions)
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user

### Push Notifications

- `GET /api/push/vapid-public-key` - Get VAPID public key
- `POST /api/push/subscribe` - Subscribe to push notifications
- `DELETE /api/push/unsubscribe` - Unsubscribe from push notifications
- `POST /api/push/test` - Send test notification

## User Types & Permissions

### GUARDIAN Admin

- Full platform access
- Can manage all users across all storage companies
- Can create other GUARDIAN admins
- System-level settings and configuration

### Storage Company Roles

- **Storage Admin**: Full company management, user creation, billing
- **Storage Manager**: Warehouse operations, inventory management
- **Storage Employee**: Daily operations, order processing

### Client Business Roles

- **Client Admin**: Company settings, user management, billing
- **Client User**: Order management, inventory viewing
- **Client Viewer**: Read-only access to company data

## Security Features

### JWT Authentication

- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Automatic token refresh
- Secure token storage

### Two-Factor Authentication

- TOTP-based verification
- QR code setup with Google Authenticator
- Backup codes for recovery
- Push notification integration

### Rate Limiting

- Login attempt limiting
- API endpoint protection
- Configurable thresholds

## Development

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run setup      # Run initial platform setup
```

### Environment Variables

The application uses the following environment variables:

| Variable             | Description                              | Required |
| -------------------- | ---------------------------------------- | -------- |
| `MONGODB_URI`        | MongoDB connection string                | Yes      |
| `JWT_SECRET`         | Secret for signing access tokens         | Yes      |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens        | Yes      |
| `PORT`               | Server port (default: 3000)              | No       |
| `NODE_ENV`           | Environment mode                         | No       |
| `VAPID_PUBLIC_KEY`   | VAPID public key for push notifications  | No       |
| `VAPID_PRIVATE_KEY`  | VAPID private key for push notifications | No       |
| `VAPID_EMAIL`        | Email for VAPID configuration            | No       |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Contact the development team

---

**GUARDIAN 3PL Platform** - Secure, scalable, and comprehensive logistics
management.

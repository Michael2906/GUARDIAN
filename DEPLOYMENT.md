# Environment Variables for Production Deployment

## Required Environment Variables
Copy these to your hosting platform's environment variable settings:

### Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/guardian?retryWrites=true&w=majority

### Authentication
JWT_SECRET=your-super-secure-jwt-secret-key-here-change-this-in-production
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-here-change-this-in-production

### Server Configuration  
PORT=3000
NODE_ENV=production

### Security
CORS_ORIGIN=https://your-domain.com

## Setup Instructions

1. **MongoDB Atlas Setup:**
   - Go to https://cloud.mongodb.com/
   - Create free account and cluster
   - Get connection string and replace MONGODB_URI above

2. **Generate Secure JWT Secrets:**
   ```bash
   # Run these commands to generate secure secrets:
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Add to Hosting Platform:**
   - Copy the environment variables to your hosting platform
   - Update CORS_ORIGIN with your actual domain
   - Replace JWT secrets with generated ones

## Security Notes
- Never commit .env files with real secrets to GitHub
- Use different secrets for production vs development
- Enable MongoDB IP whitelisting for security
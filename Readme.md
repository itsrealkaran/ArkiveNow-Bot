# Twitter Screenshot Bot - Setup Documentation

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup (NeonDB)](#database-setup-neondb)
3. [Environment Configuration](#environment-configuration)
4. [Database Migration](#database-migration)
5. [Twitter API Setup](#twitter-api-setup)
6. [Arweave Setup](#arweave-setup)
7. [Running the Bot](#running-the-bot)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+ and pnpm
- Twitter Developer Account
- NeonDB Account (PostgreSQL)
- Arweave Wallet

## Database Setup (NeonDB)

### 1. Create NeonDB Account

1. Go to [neon.tech](https://neon.tech)
2. Sign up for a free account
3. Create a new project

### 2. Get Database Connection String

1. In your NeonDB dashboard, go to your project
2. Click on "Connection Details"
3. Copy the connection string that looks like:
   ```
   postgresql://username:password@host:port/database
   ```

### 3. Database Configuration

The bot will automatically create the required tables when you run the migration script.

**Tables Created:**

- `users` - Twitter user tracking
- `usage_logs` - Event logging and monitoring
- `user_quotas` - Daily/monthly request limits

## Environment Configuration

### 1. Copy Environment Template

```bash
cd bot
cp env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your actual values:

```env
# Twitter API Configuration
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer_token

# Database Configuration (NeonDB/PostgreSQL)
DATABASE_URL=postgresql://username:password@host:port/database

# Arweave Configuration
ARWEAVE_JWK=keyjson
ARWEAVE_HOST=arweave.net

# Bot Configuration
BOT_USERNAME=your_bot_username
POLLING_INTERVAL=30000
MAX_DAILY_REQUESTS=100
MAX_MONTHLY_REQUESTS=1000
MAX_IMAGE_SIZE_KB=100

# Logging
LOG_LEVEL=info
```

## Database Migration

### 1. Run Migration Script

```bash
cd bot
pnpm run migrate
```

**What the migration does:**

- Connects to your NeonDB database
- Creates all required tables with proper schema
- Sets up indexes for performance
- Logs the migration process

### 2. Verify Migration

The migration script will output:

```
🔄 Starting database migration...
✅ Connected to database
✅ Tables created successfully
🎉 Database migration completed successfully!
```

### 3. Manual Migration (if needed)

If you need to run migration manually:

```bash
cd bot
npx ts-node src/scripts/migrate.ts
```

## Twitter API Setup

### 1. Create Twitter Developer Account

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Apply for a developer account
3. Create a new app/project

### 2. Get API Keys

1. In your Twitter Developer Portal, go to your app
2. Navigate to "Keys and Tokens"
3. Generate the following:
   - API Key and Secret
   - Access Token and Secret
   - Bearer Token

### 3. API Permissions

Ensure your app has the following permissions:

- **Read**: To fetch tweets and mentions
- **Write**: To reply to mentions
- **Tweet**: To post replies

### 4. Use Case Description

When applying for API access, use this description:

```
Our application is a Twitter bot that provides an automated screenshot service for public tweets. The bot monitors mentions (@username) to identify when users request screenshot services, fetches the referenced tweet's content, creates visual screenshots using Puppeteer, uploads them to Arweave for permanent preservation, and responds to the original mention with the screenshot and Arweave link. We only process public tweets that are explicitly mentioned to our bot, ensuring user consent and privacy protection.
```

## Arweave Setup

### 1. Create Arweave Wallet

1. Go to [arweave.org](https://arweave.org)
2. Create a wallet and get your JWK (JSON Web Key)
3. Fund your wallet with AR tokens

### 2. Get JWK

1. Export your wallet's JWK
2. It should look like a JSON object with keys: `kty`, `n`, `e`, `d`, `p`, `q`, `dp`, `dq`, `qi`

### 3. Configure JWK

Add your JWK to the `.env` file:

```env
ARWEAVE_JWK={"kty":"RSA","n":"...","e":"AQAB","d":"...","p":"...","q":"...","dp":"...","dq":"...","qi":"..."}
```

## Running the Bot

### 1. Development Mode

```bash
cd bot
pnpm run dev
```

### 2. Production Build

```bash
cd bot
pnpm run build
pnpm start
```

### 3. Check Logs

The bot creates logs in the `logs/` directory:

- `combined.log` - All logs
- `error.log` - Error logs only

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_handle VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Usage Logs Table

```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('success', 'error', 'quota_exceeded')),
  arweave_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### User Quotas Table

```sql
CREATE TABLE user_quotas (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_requests INTEGER DEFAULT 0,
  monthly_requests INTEGER DEFAULT 0,
  last_request_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Quota Management

### Default Limits

- **Daily Requests**: 100 per user
- **Monthly Requests**: 1000 per user

### Quota Reset

- Daily quotas reset automatically at midnight UTC
- Monthly quotas reset on the first day of each month

### Monitoring Quotas

The bot logs all quota events:

- Quota exceeded events
- Daily/monthly usage tracking
- User creation and tracking

## Troubleshooting

### Database Connection Issues

1. **SSL Error**: Ensure `DATABASE_URL` includes SSL parameters
2. **Connection Timeout**: Check your NeonDB connection string
3. **Permission Denied**: Verify your database credentials

### Migration Issues

1. **Table Already Exists**: The migration uses `CREATE TABLE IF NOT EXISTS`
2. **Permission Error**: Ensure your database user has CREATE privileges
3. **Connection Failed**: Check your `DATABASE_URL` format

### Common Errors

1. **"Cannot find module"**: Run `pnpm install` to install dependencies
2. **"Environment validation failed"**: Check your `.env` file format
3. **"Failed to parse ARWEAVE_JWK"**: Ensure your JWK is valid JSON

### Log Locations

- **Application Logs**: `logs/combined.log`
- **Error Logs**: `logs/error.log`
- **Console Output**: When running in development mode

### Getting Help

1. Check the logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure all prerequisites are installed
4. Test database connection with migration script

## Security Notes

1. **Never commit `.env` file** - It contains sensitive API keys
2. **Use environment variables** - Don't hardcode secrets
3. **Regular key rotation** - Rotate API keys periodically
4. **Monitor usage** - Check logs for unusual activity
5. **Backup database** - NeonDB provides automatic backups

## Next Steps

After completing the setup:

1. Test the bot with a simple mention
2. Monitor logs for any issues
3. Set up monitoring and alerting
4. Configure production deployment
5. Set up automated quota resets

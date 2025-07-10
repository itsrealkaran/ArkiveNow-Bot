# Twitter Screenshot Bot

A Node.js Twitter bot that takes screenshots of tweets, uploads them to Arweave for permanent storage, and replies with the screenshot and Arweave link.

## Features

- 🤖 **Automated Mention Processing**: Monitors Twitter mentions and processes screenshot requests
- 📸 **Tweet Screenshots**: Takes high-quality screenshots of tweets using Puppeteer
- 🌐 **Arweave Integration**: Uploads screenshots to Arweave for permanent storage
- 📊 **Usage Quotas**: Tracks and enforces daily/monthly usage limits per user
- 🗄️ **Database Logging**: Logs all usage and quota data to PostgreSQL
- 🛡️ **Error Handling**: Comprehensive error handling and user feedback
- 📈 **Health Monitoring**: Built-in health checks for all services
- 🔧 **TypeScript**: Full TypeScript support with strict typing

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database (NeonDB recommended)
- Twitter API credentials
- Arweave wallet

### Installation

1. **Clone and install dependencies:**

   ```bash
   cd bot
   pnpm install
   ```

2. **Set up environment variables:**

   ```bash
   cp env.example .env
   # Edit .env with your credentials
   ```

3. **Set up the database:**

   ```bash
   pnpm migrate
   ```

4. **Run health check:**

   ```bash
   pnpm health-check
   ```

5. **Start the bot:**
   ```bash
   pnpm dev  # Development mode
   # or
   pnpm build && pnpm start  # Production mode
   ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database (NeonDB)
DATABASE_URL=postgresql://user:password@host:port/database

# Twitter API
TWITTER_BEARER_TOKEN=your_bearer_token
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# Arweave
ARWEAVE_WALLET_PATH=./arweave-wallet.json

# Bot Configuration
BOT_USERNAME=arkivenow
POLLING_INTERVAL=30000
MAX_DAILY_REQUESTS=10
MAX_MONTHLY_REQUESTS=100
```

## Usage

### How to Use the Bot

1. **Mention the bot** with a tweet URL:

   ```
   @arkivenow screenshot https://twitter.com/username/status/1234567890123456789
   ```

2. **The bot will:**
   - Parse the tweet URL
   - Check your usage quota
   - Take a screenshot of the tweet
   - Upload it to Arweave
   - Reply with the screenshot and Arweave link

### Supported Commands

- `@arkivenow screenshot <tweet_url>` - Take screenshot of a tweet
- `@arkivenow help` - Show help message
- `@arkivenow status` - Check your quota status

## API Reference

### Services

- **`twitterService`** - Twitter API integration and mention polling
- **`screenshotService`** - Screenshot generation using Puppeteer
- **`arweaveService`** - Arweave upload and file management
- **`quotaService`** - Usage quota tracking and enforcement
- **`databaseService`** - PostgreSQL database operations
- **`botService`** - Main bot orchestrator

### Key Methods

```typescript
// Start the bot
await botService.start();

// Process a mention
await botService.processMention(mention);

// Check user quota
const quota = await quotaService.checkUserQuota(username);

// Take screenshot
const screenshot = await screenshotService.takeScreenshot(
  tweet,
  author,
  options
);

// Upload to Arweave
const upload = await arweaveService.uploadScreenshot(
  screenshot,
  tweetId,
  author,
  text
);
```

## Testing

### Individual Service Tests

```bash
# Test Twitter integration
pnpm test-twitter

# Test screenshot generation
pnpm test-screenshot

# Test Arweave upload
pnpm test-arweave

# Test integration (screenshot + upload)
pnpm test-integration

# Test complete bot flow
pnpm test-bot
```

### Health Check

```bash
# Run comprehensive health check
pnpm health-check
```

## Development

### Project Structure

```
src/
├── config/          # Configuration and environment validation
├── services/        # Core services (Twitter, Screenshot, Arweave, etc.)
├── types/           # TypeScript type definitions
├── utils/           # Utilities (logger, turbo, tweet parser)
└── scripts/         # Test and utility scripts
```

### Adding New Features

1. **Create service methods** in the appropriate service file
2. **Add TypeScript types** in `src/types/index.ts`
3. **Update the bot orchestrator** in `src/services/bot.ts`
4. **Add tests** in `src/scripts/`
5. **Update documentation**

### Code Quality

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Deployment

### Production Setup

1. **Build the project:**

   ```bash
   pnpm build
   ```

2. **Set up environment variables** in production

3. **Run database migrations:**

   ```bash
   pnpm migrate
   ```

4. **Start the bot:**
   ```bash
   pnpm start
   ```

### Monitoring

- Use `pnpm health-check` for service monitoring
- Check logs in `logs/` directory
- Monitor database usage and quota data
- Set up alerts for quota exceeded events

## Troubleshooting

### Common Issues

1. **Twitter API errors:**
   - Verify API credentials
   - Check rate limits
   - Ensure bot account has proper permissions

2. **Screenshot failures:**
   - Check Puppeteer installation
   - Verify tweet is public
   - Check memory usage

3. **Arweave upload failures:**
   - Verify wallet file exists
   - Check wallet balance
   - Ensure network connectivity

4. **Database connection issues:**
   - Verify DATABASE_URL
   - Check database permissions
   - Ensure tables are created

### Logs

Logs are written to:

- Console (development)
- `logs/` directory (production)
- Database (usage and error logs)

### Support

For issues and questions:

1. Check the logs for error details
2. Run `pnpm health-check` to diagnose issues
3. Review the troubleshooting section above

## License

ISC License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

**Happy screenshotting! 📸✨**

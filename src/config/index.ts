import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment variable schema for validation
const envSchema = z.object({
  // Twitter API
  TWITTER_API_KEY: z.string().min(1),
  TWITTER_API_SECRET: z.string().min(1),
  TWITTER_ACCESS_TOKEN: z.string().min(1),
  TWITTER_ACCESS_SECRET: z.string().min(1),
  TWITTER_BEARER_TOKEN: z.string().min(1),
  TWITTER_CLIENT_ID: z.string().min(1),
  TWITTER_CLIENT_SECRET: z.string().min(1),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Arweave
  ARWEAVE_JWK: z.string().min(1),
  ARWEAVE_HOST: z.string().default('arweave.net'),
  
  // Bot Configuration
  BOT_USERNAME: z.string().min(1),
  POLLING_INTERVAL: z.string().transform(Number).pipe(z.number().positive()).default('910000'),
  MAX_DAILY_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('10'),
  MAX_MONTHLY_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  MAX_IMAGE_SIZE_KB: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
};

export const config = parseEnv();

// Export individual config sections for convenience
export const twitterConfig = {
  apiKey: config.TWITTER_API_KEY,
  apiSecret: config.TWITTER_API_SECRET,
  accessToken: config.TWITTER_ACCESS_TOKEN,
  accessSecret: config.TWITTER_ACCESS_SECRET,
  bearerToken: config.TWITTER_BEARER_TOKEN,
  clientId: config.TWITTER_CLIENT_ID,
  clientSecret: config.TWITTER_CLIENT_SECRET,
};

export const databaseConfig = {
  url: config.DATABASE_URL,
};

export const arweaveConfig = {
  jwk: config.ARWEAVE_JWK,
  host: config.ARWEAVE_HOST,
};

export const botConfig = {
  username: config.BOT_USERNAME,
  pollingInterval: config.POLLING_INTERVAL,
  maxDailyRequests: config.MAX_DAILY_REQUESTS,
  maxMonthlyRequests: config.MAX_MONTHLY_REQUESTS,
  maxImageSizeKB: config.MAX_IMAGE_SIZE_KB,
};

export const loggingConfig = {
  level: config.LOG_LEVEL,
}; 
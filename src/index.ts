import { botConfig } from './config';
import logger from './utils/logger';
import databaseService from './services/database';
import twitterService from './services/twitter';
import screenshotService from './services/screenshot';
import botService from './scripts/test-bot';

// Main entry point for the Twitter Screenshot Bot
async function main() {
  try {
    logger.info('🚀 Twitter Screenshot Bot starting...', {
      botUsername: botConfig.username,
      pollingInterval: botConfig.pollingInterval,
      maxDailyRequests: botConfig.maxDailyRequests,
      maxMonthlyRequests: botConfig.maxMonthlyRequests,
    });

    // Initialize database
    logger.info('📊 Initializing database...');
    await databaseService.connect();
    await databaseService.initializeTables();
    logger.info('✅ Database initialized successfully');

    // Initialize Twitter service
    logger.info('🐦 Initializing Twitter service...');
    const credentialsValid = await twitterService.verifyCredentials();
    if (!credentialsValid) {
      throw new Error('Twitter credentials are invalid');
    }
    logger.info('✅ Twitter service initialized successfully');

    // Initialize screenshot service
    logger.info('📸 Initializing screenshot service...');
    await screenshotService.initialize();
    logger.info('✅ Screenshot service initialized successfully');

    // Start the bot
    logger.info('🤖 Starting bot service...');
    await botService.start();
    logger.info('✅ Bot service started successfully');

    logger.info('🎉 Bot is now running and ready to process mentions!');
  } catch (error) {
    logger.error('❌ Failed to start bot', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  try {
    await botService.stop();
    await databaseService.close();
    logger.info('✅ Graceful shutdown completed');
  } catch (error) {
    logger.error('❌ Error during shutdown', { error });
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await botService.stop();
    await databaseService.close();
    logger.info('✅ Graceful shutdown completed');
  } catch (error) {
    logger.error('❌ Error during shutdown', { error });
  }
  process.exit(0);
});

// Start the bot
main().catch((error) => {
  logger.error('❌ Unhandled error in main', { error });
  process.exit(1);
}); 
import { config, botConfig } from './config';
import logger from './utils/logger';

// Main entry point for the Twitter Screenshot Bot
async function main() {
  try {
    logger.info('🚀 Twitter Screenshot Bot starting...', {
      botUsername: botConfig.username,
      pollingInterval: botConfig.pollingInterval,
      maxDailyRequests: botConfig.maxDailyRequests,
      maxMonthlyRequests: botConfig.maxMonthlyRequests,
    });

    // TODO: Initialize services
    // TODO: Start Twitter polling
    // TODO: Handle mentions and process screenshots

    logger.info('✅ Bot initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to start bot', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the bot
main().catch((error) => {
  logger.error('❌ Unhandled error in main', { error });
  process.exit(1);
}); 
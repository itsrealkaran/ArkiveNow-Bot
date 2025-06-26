import screenshotService from '../services/screenshot';
import logger from '../utils/logger';
import { TwitterTweet, TwitterUser } from '../types';

async function testScreenshotService() {
  try {
    logger.info('🧪 Testing screenshot service...');

    // Initialize screenshot service
    logger.info('Initializing screenshot service...');
    await screenshotService.initialize();
    logger.info('✅ Screenshot service initialized');

    // Create a sample tweet for testing
    const sampleTweet: TwitterTweet = {
      id: '1234567890123456789',
      text: 'This is a test tweet to verify the screenshot functionality! 🚀 #testing #screenshot',
      author_id: '9876543210987654321',
      created_at: new Date().toISOString(),
      public_metrics: {
        retweet_count: 42,
        reply_count: 15,
        like_count: 128,
        quote_count: 7,
      },
    };

    const sampleAuthor: TwitterUser = {
      id: '9876543210987654321',
      username: 'testuser',
      name: 'Test User',
      profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
    };

    // Take screenshot
    logger.info('Taking screenshot of sample tweet...');
    const result = await screenshotService.takeScreenshot(sampleTweet, {
      width: 600,
      height: 400,
      quality: 80,
      format: 'jpeg',
    });

    if (result.success && result.buffer) {
      logger.info('✅ Screenshot taken successfully', {
        size: result.buffer.length,
        sizeKB: (result.buffer.length / 1024).toFixed(2),
      });

      // Save to temp file for inspection
      const filename = `test-screenshot-${Date.now()}.jpg`;
      const tempPath = await screenshotService.saveScreenshot(result.buffer, filename);
      logger.info('Screenshot saved to temp file', { tempPath });
    } else {
      logger.error('❌ Screenshot failed', { error: result.error });
    }

    // Cleanup
    await screenshotService.cleanup();
    logger.info('✅ Screenshot service test completed');

  } catch (error) {
    logger.error('❌ Screenshot service test failed', { error });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testScreenshotService();
}

export default testScreenshotService; 
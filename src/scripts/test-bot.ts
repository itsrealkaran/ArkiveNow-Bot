import botService from '../services/bot';
import twitterService from '../services/twitter';
import screenshotService from '../services/screenshot';
import arweaveService from '../services/arweave';
import quotaService from '../services/quota';
import databaseService from '../services/database';
import logger from '../utils/logger';
import { TwitterMention, TwitterTweet, TwitterUser } from '../types';

async function testBotFlow() {
  try {
    logger.info('🧪 Testing complete bot flow...');

    // Initialize all services
    logger.info('Initializing services...');
    await databaseService.connect();
    await screenshotService.initialize();
    
    // Verify Twitter credentials
    const credentialsValid = await twitterService.verifyCredentials();
    if (!credentialsValid) {
      throw new Error('Twitter credentials are invalid');
    }
    logger.info('✅ All services initialized');

    // Create a simulated mention
    const simulatedMention: TwitterMention = {
      id: '9999999999999999999',
      text: '@permasnap screenshot https://twitter.com/testuser/status/1234567890123456789',
      author_id: '1111111111111111111',
      created_at: new Date().toISOString(),
    };

    // Create sample tweet and author
    const sampleTweet: TwitterTweet = {
      id: '1234567890123456789',
      text: 'This is a test tweet for bot flow verification! 🚀 #PermaSnap #Testing',
      author_id: '2222222222222222222',
      created_at: new Date().toISOString(),
      public_metrics: {
        retweet_count: 15,
        reply_count: 5,
        like_count: 89,
        quote_count: 2,
      },
    };

    const sampleAuthor: TwitterUser = {
      id: '2222222222222222222',
      username: 'testuser',
      name: 'Test User',
      profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
    };

    const sampleRequester: TwitterUser = {
      id: '1111111111111111111',
      username: 'testrequester',
      name: 'Test Requester',
      profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
    };

    logger.info('Testing bot flow with simulated data...');

    // Test 1: Quota check
    logger.info('Test 1: Checking quota...');
    const quotaCheck = await quotaService.checkUserQuota(sampleRequester.username);
    logger.info('Quota check result', { quotaCheck });

    // Test 2: Screenshot generation
    logger.info('Test 2: Taking screenshot...');
    const screenshotResult = await screenshotService.takeScreenshot(sampleTweet, sampleAuthor, {
      width: 600,
      height: 400,
      quality: 80,
      format: 'jpeg',
    });

    if (!screenshotResult.success || !screenshotResult.buffer) {
      throw new Error(`Screenshot failed: ${screenshotResult.error}`);
    }

    logger.info('✅ Screenshot taken successfully', {
      size: screenshotResult.buffer.length,
      sizeKB: (screenshotResult.buffer.length / 1024).toFixed(2),
    });

    // Test 3: Arweave upload
    logger.info('Test 3: Uploading to Arweave...');
    const uploadResult = await arweaveService.uploadScreenshot(
      screenshotResult,
      sampleTweet.id,
      sampleAuthor.username,
      sampleTweet.text
    );

    if (!uploadResult.success || !uploadResult.id) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }

    logger.info('✅ Upload successful', {
      arweaveId: uploadResult.id,
      url: arweaveService.generateArweaveUrl(uploadResult.id),
    });

    // Test 4: Message generation
    logger.info('Test 4: Generating reply message...');
    const successMessage = arweaveService.generateUploadMessage(
      uploadResult.id,
      sampleTweet.id,
      sampleAuthor.username
    );

    const errorMessage = arweaveService.generateErrorMessage(
      'Test error message',
      sampleTweet.id
    );

    logger.info('Generated messages', {
      successMessage: successMessage.substring(0, 100) + '...',
      errorMessage: errorMessage.substring(0, 100) + '...',
    });

    // Test 5: Quota increment
    logger.info('Test 5: Incrementing quota...');
    await quotaService.incrementUserQuota(sampleRequester.username);
    logger.info('✅ Quota incremented');

    // Test 6: Usage logging
    logger.info('Test 6: Logging usage...');
    await databaseService.logUsage({
      user_id: sampleRequester.id,
      tweet_id: sampleTweet.id,
      event_type: 'success',
      arweave_id: uploadResult.id,
    });
    logger.info('✅ Usage logged');

    // Test 7: Get quota status
    logger.info('Test 7: Getting quota status...');
    const quotaStatus = await quotaService.getQuotaStatus(sampleRequester.username);
    logger.info('Quota status', { quotaStatus });

    // Cleanup
    await screenshotService.cleanup();
    await databaseService.close();

    logger.info('🎉 Complete bot flow test passed!');
    logger.info('📊 Test Summary:', {
      screenshotSize: `${(screenshotResult.buffer.length / 1024).toFixed(2)}KB`,
      arweaveId: uploadResult.id,
      arweaveUrl: arweaveService.generateArweaveUrl(uploadResult.id),
      quotaStatus,
    });

  } catch (error) {
    logger.error('❌ Bot flow test failed', { error });
    
    // Cleanup on error
    try {
      await screenshotService.cleanup();
      await databaseService.close();
    } catch (cleanupError) {
      logger.error('Failed to cleanup on error', { cleanupError });
    }
    
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testBotFlow();
}

export default testBotFlow; 
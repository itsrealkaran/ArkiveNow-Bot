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

    // Test 1: Store tweet data
    logger.info('Test 1: Storing tweet data...');
    await databaseService.storeTweet({
      tweet_id: sampleTweet.id,
      author_id: sampleTweet.author_id,
      text: sampleTweet.text,
      created_at: sampleTweet.created_at,
      public_metrics: sampleTweet.public_metrics,
      author_data: sampleAuthor,
      media_data: [],
      referenced_tweets: [],
      includes_data: null
    });
    logger.info('✅ Tweet data stored');

    // Test 2: Quota check
    logger.info('Test 2: Checking quota...');
    const quotaCheck = await quotaService.checkUserQuota(sampleRequester.id);
    logger.info('Quota check result', { quotaCheck });

    // Get the actual user from database (with proper UUID)
    const user = await databaseService.getOrCreateUser(sampleRequester.id);
    if (!user) {
      throw new Error('User not found in database after quota check');
    }

    // Test 3: Update tweet processing status
    logger.info('Test 3: Updating tweet processing status...');
    await databaseService.updateTweetProcessingStatus(sampleTweet.id, 'processing');
    logger.info('✅ Tweet status updated to processing');

    // Test 4: Screenshot generation
    logger.info('Test 4: Taking screenshot...');
    const screenshotResult = await screenshotService.takeScreenshot(sampleTweet);

    if (!screenshotResult.success || !screenshotResult.buffer) {
      throw new Error(`Screenshot failed: ${screenshotResult.error}`);
    }

    logger.info('✅ Screenshot taken successfully', {
      size: screenshotResult.buffer.length,
      sizeKB: (screenshotResult.buffer.length / 1024).toFixed(2),
    });

    // Test 5: Arweave upload
    logger.info('Test 5: Uploading to Arweave...');
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

    // Test 6: Update tweet processing status to completed
    logger.info('Test 6: Updating tweet processing status to completed...');
    await databaseService.updateTweetProcessingStatus(sampleTweet.id, 'completed', uploadResult.id);
    logger.info('✅ Tweet status updated to completed');

    // Test 7: Message generation
    logger.info('Test 7: Generating reply message...');
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

    // Test 8: Quota increment
    logger.info('Test 8: Incrementing quota...');
    await quotaService.incrementUserQuota(sampleRequester.id);
    logger.info('✅ Quota incremented');

    // Test 9: Usage logging
    logger.info('Test 9: Logging usage...');
    await databaseService.logUsage({
      user_id: sampleRequester.id, // Use author_id for logUsage
      tweet_id: sampleTweet.id,
      event_type: 'success',
      arweave_id: uploadResult.id,
    });
    logger.info('✅ Usage logged');

    // Test 10: Get quota status
    logger.info('Test 10: Getting quota status...');
    const quotaStatus = await quotaService.getQuotaStatus(sampleRequester.id);
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
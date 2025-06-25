import screenshotService from '../services/screenshot';
import arweaveService from '../services/arweave';
import logger from '../utils/logger';
import { TwitterTweet, TwitterUser } from '../types';

async function testIntegration() {
  try {
    logger.info('🧪 Testing screenshot + Arweave integration...');

    // Initialize services
    logger.info('Initializing services...');
    await screenshotService.initialize();
    logger.info('✅ Services initialized');

    // Create a sample tweet for testing
    const sampleTweet: TwitterTweet = {
      id: '1234567890123456789',
      text: 'This is an integration test tweet! Testing the complete screenshot → Arweave flow. 🚀 #PermaSnap #Arweave',
      author_id: '9876543210987654321',
      created_at: new Date().toISOString(),
      public_metrics: {
        retweet_count: 25,
        reply_count: 8,
        like_count: 156,
        quote_count: 3,
      },
    };

    const sampleAuthor: TwitterUser = {
      id: '9876543210987654321',
      username: 'testuser',
      name: 'Test User',
      profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
    };

    // Step 1: Take screenshot
    logger.info('Step 1: Taking screenshot...');
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

    // Step 2: Upload to Arweave
    logger.info('Step 2: Uploading to Arweave...');
    const uploadResult = await arweaveService.uploadScreenshot(
      screenshotResult,
      sampleTweet.id,
      sampleAuthor.username,
      sampleTweet.text
    );

    if (!uploadResult.success || !uploadResult.id) {
      throw new Error(`Arweave upload failed: ${uploadResult.error}`);
    }

    logger.info('✅ Upload to Arweave successful', {
      arweaveId: uploadResult.id,
      url: arweaveService.generateArweaveUrl(uploadResult.id),
    });

    // Step 3: Generate reply message
    logger.info('Step 3: Generating reply message...');
    const replyMessage = arweaveService.generateUploadMessage(
      uploadResult.id,
      sampleTweet.id,
      sampleAuthor.username
    );

    logger.info('Generated reply message:', { replyMessage });

    // Step 4: Validate transaction ID
    const isValid = arweaveService.isValidTransactionId(uploadResult.id);
    logger.info('Transaction validation', { 
      arweaveId: uploadResult.id, 
      isValid 
    });

    // Cleanup
    await screenshotService.cleanup();
    logger.info('✅ Integration test completed successfully');

    // Summary
    logger.info('🎉 Integration Test Summary:', {
      screenshotSize: `${(screenshotResult.buffer.length / 1024).toFixed(2)}KB`,
      arweaveId: uploadResult.id,
      arweaveUrl: arweaveService.generateArweaveUrl(uploadResult.id),
      messageLength: replyMessage.length,
    });

  } catch (error) {
    logger.error('❌ Integration test failed', { error });
    
    // Cleanup on error
    try {
      await screenshotService.cleanup();
    } catch (cleanupError) {
      logger.error('Failed to cleanup on error', { cleanupError });
    }
    
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testIntegration();
}

export default testIntegration; 
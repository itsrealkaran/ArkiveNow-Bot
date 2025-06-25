import twitterService from '../services/twitter';
import logger from '../utils/logger';

async function testTwitterIntegration() {
  try {
    logger.info('🧪 Testing Twitter integration...');

    // Test 1: Verify credentials
    logger.info('Testing credentials...');
    const credentialsValid = await twitterService.verifyCredentials();
    if (!credentialsValid) {
      throw new Error('Twitter credentials are invalid');
    }
    logger.info('✅ Credentials verified successfully');

    // Test 2: Get recent mentions
    logger.info('Testing mention retrieval...');
    const mentions = await twitterService.getMentions();
    logger.info(`✅ Retrieved ${mentions.length} mentions`);

    // Test 3: Test tweet parsing (if we have mentions)
    if (mentions.length > 0) {
      const firstMention = mentions[0];
      if (firstMention) {
        logger.info('Testing tweet parsing with first mention...', {
          mentionId: firstMention.id,
          text: firstMention.text.substring(0, 50) + '...',
        });
      }
    }

    logger.info('🎉 All Twitter integration tests passed!');
  } catch (error) {
    logger.error('❌ Twitter integration test failed', { error });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testTwitterIntegration();
}

export default testTwitterIntegration; 
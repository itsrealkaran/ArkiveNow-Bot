import twitterService from '../services/twitter';
import logger from '../utils/logger';

async function testRateLimitHandling() {
  try {
    logger.info('🧪 Testing Twitter rate limit handling...');

    // Test 1: Verify credentials
    logger.info('Test 1: Verifying Twitter credentials...');
    const credentialsValid = await twitterService.verifyCredentials();
    if (!credentialsValid) {
      throw new Error('Twitter credentials are invalid');
    }
    logger.info('✅ Credentials verified');

    // Test 2: Get mentions (this is where rate limiting usually occurs)
    logger.info('Test 2: Testing mentions endpoint...');
    const mentions = await twitterService.getMentions();
    logger.info('✅ Mentions retrieved', { count: mentions.length });

    // Test 3: Test multiple rapid requests to trigger rate limiting
    logger.info('Test 3: Testing rapid requests...');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(twitterService.getMentions());
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Rapid requests test completed', {
      successful,
      failed,
      total: results.length
    });

    // Test 4: Test individual API calls
    logger.info('Test 4: Testing individual API calls...');
    
    // Test getting a user (using a known user ID)
    const testUserId = '783214'; // Twitter's user ID
    const user = await twitterService.getUser(testUserId);
    logger.info('✅ User retrieval test', { 
      success: !!user, 
      username: user?.username 
    });

    logger.info('🎉 Rate limit handling test completed successfully!');

  } catch (error) {
    logger.error('❌ Rate limit test failed', { error });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testRateLimitHandling();
}

export default testRateLimitHandling; 
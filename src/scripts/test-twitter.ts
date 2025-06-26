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

    // Test 2: Get recent mentions with detailed debugging
    logger.info('Testing mention retrieval with detailed debugging...');
    
    // Add a small delay to ensure we're not hitting rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    let mentions: any[] = [];
    try {
      mentions = await twitterService.getMentions();
      logger.info(`✅ Retrieved ${mentions.length} mentions`);
      
      // Log each mention in detail
      if (mentions.length > 0) {
        logger.info('📋 Detailed mention information:');
        mentions.forEach((mention, index) => {
          logger.info(`Mention ${index + 1}:`, {
            id: mention.id,
            text: mention.text,
            author_id: mention.author_id,
            created_at: mention.created_at,
            in_reply_to_user_id: mention.in_reply_to_user_id,
            referenced_tweets: mention.referenced_tweets
          });
        });
      } else {
        logger.info('ℹ️ No mentions found - this could be normal if no one has mentioned the bot recently');
      }
    } catch (error) {
      logger.error('❌ Error retrieving mentions', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Try to get more details about the error
      if (error && typeof error === 'object') {
        logger.error('Error details:', {
          code: (error as any).code,
          status: (error as any).status,
          data: (error as any).data,
          rateLimit: (error as any).rateLimit
        });
      }
    }

    // Test 3: Test tweet parsing (if we have mentions)
    if (mentions && mentions.length > 0) {
      const firstMention = mentions[0];
      if (firstMention) {
        logger.info('Testing tweet parsing with first mention...', {
          mentionId: firstMention.id,
          text: firstMention.text.substring(0, 50) + '...',
        });
        
        // Test extracting tweet ID from mention
        const extractedTweetId = twitterService.extractTweetIdFromMention(firstMention);
        logger.info('Extracted tweet ID from mention:', { extractedTweetId });
      }
    }

    // Test 4: Test getting a specific tweet (use a known public tweet ID for testing)
    logger.info('Testing single tweet retrieval...');
    try {
      // Use a known public tweet ID for testing (you can replace this with any public tweet)
      const testTweetId = '1234567890123456789'; // Replace with a real tweet ID
      const tweet = await twitterService.getTweet(testTweetId);
      if (tweet) {
        logger.info('✅ Successfully retrieved test tweet', {
          tweetId: tweet.id,
          authorId: tweet.author_id,
          textLength: tweet.text.length
        });
      } else {
        logger.info('ℹ️ Test tweet not found (this is normal if the ID is invalid)');
      }
    } catch (error) {
      logger.error('❌ Error retrieving test tweet', { error });
    }

    logger.info('🎉 Twitter integration test completed!');
  } catch (error) {
    logger.error('❌ Twitter integration test failed', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testTwitterIntegration();
}

export default testTwitterIntegration; 
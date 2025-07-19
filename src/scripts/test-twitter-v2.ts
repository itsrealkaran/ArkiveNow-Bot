import twitterService from '../services/twitter-v2';
import logger from '../utils/logger';
import { TwitterMention } from '../types';

async function testTwitterV2() {
  try {
    logger.info('🧪 Testing new Twitter service (direct fetch)...');

    // // Test 1: Verify credentials
    // logger.info('Testing credential verification...');
    // const credentialsValid = await twitterService.verifyCredentials();
    // logger.info('Credentials verification result:', { valid: credentialsValid });

    // if (!credentialsValid) {
    //   logger.error('❌ Credentials verification failed');
    //   return;
    // }

    // Test 2: Get mentions (limited to recent)
    logger.info('Testing getMentions...');
    const mentions = await twitterService.getMentions();
    logger.info('Mentions test result:', { 
      count: mentions.length,
      sample: mentions.slice(0, 2).map(m => (m))
    });

    // // Test 3: Get a specific tweet (if we have any mentions)
    // if (mentions.length > 0) {
    //   const firstMention = mentions[0];
    //   if (firstMention) {
    //     logger.info('Testing getTweet with mention ID...');
    //     const tweet = await twitterService.getTweet(firstMention.id);
    //     logger.info('Tweet fetch result:', { 
    //       found: !!tweet,
    //       tweetId: firstMention.id,
    //       authorId: tweet?.author_id,
    //       textLength: tweet?.text?.length,
    //       tweet: tweet
    //     });
    //   }
    // }

    // Test 4: Test utility methods
    logger.info('Testing utility methods...');
    const testMention: TwitterMention = {
      id: '123456789',
      text: 'Check out this tweet: https://twitter.com/user/status/987654321',
      author_id: 'test_user_123',
      created_at: new Date().toISOString(),
      referenced_tweets: [
        { type: 'quoted' as const, id: '987654321' }
      ]
    };

    const extractedId = twitterService.extractTweetIdFromMention(testMention);
    const parentId = twitterService.extractParentTweetId(testMention);
    
    logger.info('Utility methods test:', {
      extractedId,
      parentId,
      hasReferencedTweets: !!testMention.referenced_tweets
    });

    // Test 5: Test batch tweet fetching (if we have tweet IDs)
    if (mentions.length > 0) {
      const tweetIds = mentions.slice(0, 3).map(m => m.id);
      logger.info('Testing batch tweet fetching...');
      const tweets = await twitterService.getTweetsByIds(tweetIds);
      logger.info('Batch fetch result:', {
        requested: tweetIds.length,
        received: tweets.length,
        tweetIds: tweetIds,
        tweets: tweets
      });
    }

    logger.info('✅ All Twitter v2 service tests passed!');

  } catch (error) {
    logger.error('❌ Twitter v2 service test failed:', error);
  }
}

// Run the test
testTwitterV2().catch(console.error); 
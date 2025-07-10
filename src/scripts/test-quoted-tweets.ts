import twitterService from '../services/twitter';
import databaseService from '../services/database';
import logger from '../utils/logger';
import { TwitterMention } from '../types';

/**
 * Test script for quoted tweet handling
 * 
 * ⚠️  IMPORTANT: Twitter API has rate limits:
 * - getTweets endpoint: 1 request per 15 minutes
 * - This test will consume one rate limit slot
 * - Use sparingly and replace dummy tweet ID with real quoted tweet ID
 */

async function testQuotedTweets() {
  try {
    logger.info('🧪 Testing quoted tweet handling...');

    // Test 1: Create a simulated mention with a tweet that quotes another tweet
    // Note: You'll need to replace this with a real tweet ID that quotes another tweet
    const simulatedMention: TwitterMention = {
      id: '9999999999999999999',
      text: '@arkivenow screenshot https://twitter.com/testuser/status/1234567890123456789',
      author_id: '1111111111111111111',
      created_at: new Date().toISOString(),
      author: {
        id: '1111111111111111111',
        username: 'testrequester',
        name: 'Test Requester',
        profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
      }
    };

    logger.info('⚠️  Note: This test uses a dummy tweet ID. Replace with a real tweet ID that quotes another tweet to test properly.');
    logger.info('⚠️  Rate limit: 1 request per 15 minutes for getTweets endpoint');
    logger.info('📝  Flow: Main tweet (quotes) → Fetch original tweet (being quoted) → Combine data');

    // Test 2: Simulate the bot's mention processing flow
    logger.info('Testing mention processing with quoted tweets...');
    
    // Step 1: Extract tweet ID
    const tweetId = twitterService.extractTweetIdFromMention(simulatedMention);
    logger.info('Extracted tweet ID:', { tweetId });

    if (!tweetId) {
      logger.warn('No tweet ID found in mention');
      return;
    }

    // Step 2: Fetch the main tweet
    const mainTweet = await twitterService.getTweet(tweetId);
    if (!mainTweet) {
      logger.warn('Main tweet not found');
      return;
    }

    logger.info('Main tweet fetched:', {
      id: mainTweet.id,
      text: mainTweet.text?.substring(0, 100) + '...',
      hasReferencedTweets: !!mainTweet.referenced_tweets,
      referencedTweetsCount: mainTweet.referenced_tweets?.length || 0,
      hasIncludes: !!mainTweet.includes,
      includesTweetsCount: mainTweet.includes?.tweets?.length || 0
    });

    // Step 3: Check if main tweet is quoting another tweet
    if (mainTweet.referenced_tweets) {
      const quotedTweetRefs = mainTweet.referenced_tweets.filter(ref => ref.type === 'quoted');
      logger.info('Found quoted tweet references:', {
        count: quotedTweetRefs.length,
        refs: quotedTweetRefs.map(ref => ({ type: ref.type, id: ref.id }))
      });

      // Step 4: Fetch original tweets that are being quoted
      if (quotedTweetRefs.length > 0) {
        const originalTweetIds = quotedTweetRefs.map(ref => ref.id);
        logger.info('Fetching original tweets (being quoted):', { ids: originalTweetIds });
        
        const originalTweets = await twitterService.getTweetsByIds(originalTweetIds);
        logger.info('Original tweets fetched:', {
          count: originalTweets.length,
          tweets: originalTweets.map(tweet => ({
            id: tweet.id,
            text: tweet.text?.substring(0, 50) + '...',
            author: tweet.author?.username
          }))
        });

        // Step 5: Enhance main tweet with original tweet data
        if (!mainTweet.includes) {
          mainTweet.includes = { users: [], media: [], tweets: [] };
        }
        mainTweet.includes.tweets = originalTweets;
        
        // Add original tweet authors to includes
        const originalAuthors = originalTweets
          .map(ot => ot.author)
          .filter(author => author !== undefined);
        if (mainTweet.includes.users) {
          mainTweet.includes.users.push(...originalAuthors);
        }

        logger.info('Enhanced main tweet with original tweet data:', {
          includesTweetsCount: mainTweet.includes.tweets.length,
          includesUsersCount: mainTweet.includes.users?.length || 0,
          hasOriginalTweets: mainTweet.includes.tweets.length > 0
        });
      }
    }

    // Test 3: Store enhanced tweet in database
    logger.info('Storing enhanced tweet in database...');
    await databaseService.storeTweet({
      tweet_id: mainTweet.id,
      author_id: mainTweet.author_id,
      text: mainTweet.text,
      created_at: mainTweet.created_at,
      public_metrics: mainTweet.public_metrics,
      author_data: mainTweet.author,
      media_data: mainTweet.media,
      referenced_tweets: mainTweet.referenced_tweets,
      includes_data: mainTweet.includes
    });
    logger.info('✅ Enhanced tweet stored successfully');

    // Test 4: Verify stored data
    const storedTweet = await databaseService.getTweetByTweetId(mainTweet.id);
    if (storedTweet) {
      logger.info('Stored tweet data verified:', {
        hasIncludesData: !!storedTweet.includes_data,
        includesDataKeys: storedTweet.includes_data ? Object.keys(storedTweet.includes_data) : []
      });
    }

    logger.info('✅ All quoted tweet tests completed!');

  } catch (error) {
    logger.error('❌ Quoted tweet test failed:', error);
  } finally {
    await databaseService.close();
  }
}

// Run the test
testQuotedTweets().catch(console.error); 
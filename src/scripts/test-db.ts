import databaseService from '../services/database';
import logger from '../utils/logger';

async function testDatabase() {
  try {
    logger.info('🧪 Testing database functionality...');

    // Test tweet storage with multiple users requesting same tweet
    const testTweet1 = {
      tweet_id: '1234567890123456789',
      author_id: '9876543210987654321',
      username: 'user1',
      text: 'This is a test tweet with quoted content!',
      created_at: new Date().toISOString(),
      public_metrics: {
        retweet_count: 10,
        reply_count: 5,
        like_count: 100,
        quote_count: 2
      },
      author_data: {
        id: '9876543210987654321',
        username: 'user1',
        name: 'Test User 1',
        profile_image_url: 'https://example.com/avatar1.jpg',
        verified: false
      },
      media_data: [
        {
          media_key: 'media123',
          type: 'photo',
          url: 'https://example.com/image.jpg',
          width: 800,
          height: 600
        }
      ],
      includes_data: {
        quoted_tweet_id: '1111111111111111111',
        quoted_tweet: {
          id: '1111111111111111111',
          text: 'This is the quoted tweet content',
          author_id: '1111111111111111111'
        }
      }
    };

    const testTweet2 = {
      tweet_id: '1234567890123456789', // Same tweet ID
      author_id: '5555555555555555555', // Different user
      username: 'user2',
      text: 'This is a test tweet with quoted content!',
      created_at: new Date().toISOString(),
      public_metrics: {
        retweet_count: 10,
        reply_count: 5,
        like_count: 100,
        quote_count: 2
      },
      author_data: {
        id: '9876543210987654321',
        username: 'user1',
        name: 'Test User 1',
        profile_image_url: 'https://example.com/avatar1.jpg',
        verified: false
      },
      media_data: [
        {
          media_key: 'media123',
          type: 'photo',
          url: 'https://example.com/image.jpg',
          width: 800,
          height: 600
        }
      ],
      includes_data: {
        quoted_tweet_id: '1111111111111111111',
        quoted_tweet: {
          id: '1111111111111111111',
          text: 'This is the quoted tweet content',
          author_id: '1111111111111111111'
        }
      }
    };

    // Store first tweet request
    await databaseService.storeTweet(testTweet1);
    logger.info('✅ First tweet request stored successfully');

    // Store second tweet request (same tweet, different user)
    await databaseService.storeTweet(testTweet2);
    logger.info('✅ Second tweet request stored successfully');

    // Test getting all records for the same tweet_id
    const allTweets = await databaseService.getAllTweetsByTweetId('1234567890123456789');
    logger.info('✅ Retrieved all tweets for same tweet_id', { count: allTweets.length });

    // Test getting the most recent tweet
    const latestTweet = await databaseService.getTweetByTweetId('1234567890123456789');
    logger.info('✅ Retrieved latest tweet successfully');

    // Update processing status for all records
    await databaseService.updateTweetProcessingStatus('1234567890123456789', 'processing');
    logger.info('✅ Tweet status updated to processing');

    // Test getting updated records
    const updatedTweets = await databaseService.getAllTweetsByTweetId('1234567890123456789');
    logger.info('✅ Retrieved updated tweets', { count: updatedTweets.length });

    // Log the results
    logger.info('📊 Test Results:', {
      totalRecords: allTweets.length,
      firstUser: allTweets[0]?.author_id,
      secondUser: allTweets[1]?.author_id,
      latestTweetId: latestTweet?.id
    });

    logger.info('✅ Database test completed successfully');
  } catch (error) {
    logger.error('❌ Database test failed', { error });
    throw error;
  }
}

// Run the test
testDatabase()
  .then(() => {
    logger.info('🎉 All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('💥 Test failed', { error });
    process.exit(1);
  }); 
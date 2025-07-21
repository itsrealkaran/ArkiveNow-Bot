import databaseService from '../services/database';
import logger from '../utils/logger';

async function testDatabase() {
  try {
    logger.info('🧪 Testing database functionality...');

    // Test tweet storage
    const testTweet = {
      tweet_id: '1234567890123456789',
      author_id: '9876543210987654321',
      username: 'testuser',
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
        username: 'testuser',
        name: 'Test User',
        profile_image_url: 'https://example.com/avatar.jpg',
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
      referenced_tweets: [
        {
          type: 'quoted',
          id: '1111111111111111111'
        }
      ],
      includes_data: {
        users: [
          {
            id: '1111111111111111111',
            username: 'quoteduser',
            name: 'Quoted User',
            profile_image_url: 'https://example.com/quoted-avatar.jpg'
          }
        ],
        tweets: [
          {
            id: '1111111111111111111',
            text: 'This is the quoted tweet content',
            author_id: '1111111111111111111',
            created_at: new Date().toISOString()
          }
        ],
        media: []
      }
    };

    // Store test tweet
    await databaseService.storeTweet(testTweet);
    logger.info('✅ Test tweet stored successfully');

    // Update processing status
    await databaseService.updateTweetProcessingStatus(testTweet.tweet_id, 'processing');
    logger.info('✅ Tweet status updated to processing');

    // Get tweet by ID
    const retrievedTweet = await databaseService.getTweetByTweetId(testTweet.tweet_id);
    logger.info('✅ Retrieved tweet:', { 
      tweetId: retrievedTweet.tweet_id,
      status: retrievedTweet.processing_status,
      hasAuthorData: !!retrievedTweet.author_data,
      hasMediaData: !!retrievedTweet.media_data,
      username: retrievedTweet.username
    });

    // Update to completed
    await databaseService.updateTweetProcessingStatus(testTweet.tweet_id, 'completed', 'arweave-test-id-123');
    logger.info('✅ Tweet status updated to completed');

    // Get tweets by status
    const completedTweets = await databaseService.getTweetsByStatus('completed', 10);
    logger.info('✅ Retrieved completed tweets:', { count: completedTweets.length });

    // Get tweet stats
    const stats = await databaseService.getTweetStats();
    logger.info('✅ Tweet stats:', stats);

    // Get tweets by author
    const authorTweets = await databaseService.getTweetsByAuthorId(testTweet.author_id, 10);
    logger.info('✅ Retrieved author tweets:', { count: authorTweets.length });

    logger.info('✅ All database tests passed!');

  } catch (error) {
    logger.error('❌ Database test failed:', error);
  } finally {
    await databaseService.close();
  }
}

// Run the test
testDatabase().catch(console.error); 
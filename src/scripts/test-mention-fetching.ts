import twitterService from '../services/twitter';
import databaseService from '../services/database';
import logger from '../utils/logger';

async function testMentionFetching() {
  try {
    logger.info('🧪 Testing database-based mention fetching...');

    // Test 1: Get latest timestamps from database
    const latestTweetTime = await databaseService.getLatestTweetTimestamp();
    const latestMentionTime = await databaseService.getLatestMentionTimestamp();
    
    logger.info('Database timestamps:', {
      latestTweetTime,
      latestMentionTime,
      hasTweetData: !!latestTweetTime,
      hasMentionData: !!latestMentionTime
    });

    // Test 2: Get mentions using database timestamps
    logger.info('Fetching mentions with database timestamps...');
    const mentions = await twitterService.getMentions();
    
    logger.info('Mentions fetched:', {
      count: mentions.length,
      mentions: mentions.map(m => ({
        id: m.id,
        author: m.author?.username,
        created_at: m.created_at,
        text: m.text.substring(0, 50) + '...'
      }))
    });

    // Test 3: Test with specific start time
    if (latestTweetTime) {
      const sinceTime = new Date(latestTweetTime);
      sinceTime.setMinutes(sinceTime.getMinutes() - 10); // 10 minutes before
      
      logger.info('Fetching mentions with specific start time...', {
        startTime: sinceTime.toISOString()
      });
      
      const mentionsWithTime = await twitterService.getMentions(sinceTime);
      
      logger.info('Mentions with specific time:', {
        count: mentionsWithTime.length,
        startTime: sinceTime.toISOString()
      });
    }

    // Test 4: Get tweet stats
    const stats = await databaseService.getTweetStats();
    logger.info('Tweet processing stats:', stats);

    logger.info('✅ All mention fetching tests completed!');

  } catch (error) {
    logger.error('❌ Mention fetching test failed:', error);
  } finally {
    await databaseService.close();
  }
}

// Run the test
testMentionFetching().catch(console.error); 
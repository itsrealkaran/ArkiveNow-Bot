import databaseService from '../services/database';
import logger from '../utils/logger';

async function populateTweetUsernames() {
  try {
    logger.info('🔄 Starting username population process for tweets...');
    const client = await databaseService['pool'].connect();
    try {
      // Find tweets with missing or empty username
      const tweetsToUpdate = await client.query(`
        SELECT t.id, t.tweet_id, t.author_id, t.username, u.username as correct_username
        FROM tweets t
        JOIN users u ON t.author_id = u.author_id
        WHERE (t.username IS NULL OR t.username = '')
      `);
      logger.info(`📋 Found ${tweetsToUpdate.rows.length} tweets to update`);
      if (tweetsToUpdate.rows.length === 0) {
        logger.info('✅ No tweets need username update');
        return;
      }
      // Show a sample of what will be updated
      const examples = tweetsToUpdate.rows.slice(0, 5);
      logger.info('📝 Examples of updates to be made:', examples.map(row => ({
        tweet_id: row.tweet_id,
        author_id: row.author_id,
        current_username: row.username,
        correct_username: row.correct_username
      })));
      // Start transaction
      await client.query('BEGIN');
      let updatedCount = 0;
      for (const row of tweetsToUpdate.rows) {
        if (!row.correct_username) continue;
        await client.query(
          'UPDATE tweets SET username = $1, updated_at = NOW() WHERE id = $2',
          [row.correct_username, row.id]
        );
        updatedCount++;
        if (updatedCount % 100 === 0) {
          logger.info(`🔄 Updated ${updatedCount} tweets so far...`);
        }
      }
      await client.query('COMMIT');
      logger.info(`✅ Username population completed!`);
      logger.info(`📊 Total tweets updated: ${updatedCount}`);
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('❌ Error populating usernames:', error);
    throw error;
  }
}

if (require.main === module) {
  populateTweetUsernames().catch(err => {
    logger.error('Script failed:', err);
    process.exit(1);
  });
} 
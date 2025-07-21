import databaseService from '../services/database';
import logger from '../utils/logger';

async function updateAuthorIds() {
  try {
    logger.info('🔄 Starting author_id update process...');

    const client = await databaseService['pool'].connect();
    
    try {
      // First, let's see what we're working with
      const statsBefore = await databaseService.getTweetStats();
      logger.info('📊 Stats before update:', statsBefore);

      // Get all tweets that need updating
      const tweetsToUpdate = await client.query(`
        SELECT t.id, t.tweet_id, t.author_id as current_author_id, 
               u.author_id as correct_author_id, ul.created_at as log_created_at
        FROM tweets t
        JOIN usage_logs ul ON t.tweet_id = ul.tweet_id
        JOIN users u ON ul.user_id = u.id
        WHERE ul.event_type = 'success'
        ORDER BY ul.created_at DESC
      `);

      logger.info(`📋 Found ${tweetsToUpdate.rows.length} tweets to update`);

      if (tweetsToUpdate.rows.length === 0) {
        logger.info('✅ No tweets need updating');
        return;
      }

      // Show some examples of what will be updated
      const examples = tweetsToUpdate.rows.slice(0, 5);
      logger.info('📝 Examples of updates to be made:', examples.map(row => ({
        tweet_id: row.tweet_id,
        current_author_id: row.current_author_id,
        correct_author_id: row.correct_author_id
      })));

      // Start transaction
      await client.query('BEGIN');

      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of tweetsToUpdate.rows) {
        // Skip if the author_id is already correct and username is already correct
        const userRes = await client.query('SELECT username FROM users WHERE author_id = $1', [row.correct_author_id]);
        const correctUsername = userRes.rows[0]?.username || null;
        const tweetRes = await client.query('SELECT username FROM tweets WHERE id = $1', [row.id]);
        const currentUsername = tweetRes.rows[0]?.username || null;
        let updated = false;
        if (row.current_author_id !== row.correct_author_id) {
          await client.query(
            'UPDATE tweets SET author_id = $1, username = $2, updated_at = NOW() WHERE id = $3',
            [row.correct_author_id, correctUsername, row.id]
          );
          updated = true;
        } else if (currentUsername !== correctUsername) {
          await client.query(
            'UPDATE tweets SET username = $1, updated_at = NOW() WHERE id = $2',
            [correctUsername, row.id]
          );
          updated = true;
        } else {
          skippedCount++;
          continue;
        }
        if (updated) updatedCount++;
        if (updatedCount % 100 === 0) {
          logger.info(`🔄 Updated ${updatedCount} tweets so far...`);
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      logger.info(`✅ Update completed!`);
      logger.info(`📊 Summary:`);
      logger.info(`   - Total tweets processed: ${tweetsToUpdate.rows.length}`);
      logger.info(`   - Tweets updated: ${updatedCount}`);
      logger.info(`   - Tweets skipped (already correct): ${skippedCount}`);

      // Get stats after update
      const statsAfter = await databaseService.getTweetStats();
      logger.info('📊 Stats after update:', statsAfter);

      // Verify some updates
      const verificationQuery = await client.query(`
        SELECT t.tweet_id, t.author_id, u.author_id as requester_author_id
        FROM tweets t
        JOIN usage_logs ul ON t.tweet_id = ul.tweet_id
        JOIN users u ON ul.user_id = u.id
        WHERE ul.event_type = 'success'
        LIMIT 10
      `);

      logger.info('🔍 Verification - Sample of updated tweets:', 
        verificationQuery.rows.map(row => ({
          tweet_id: row.tweet_id,
          tweet_author_id: row.author_id,
          requester_author_id: row.requester_author_id,
          is_correct: row.author_id === row.requester_author_id
        }))
      );

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error updating author_ids:', error);
    throw error;
  } finally {
    await databaseService.close();
  }
}

// Run the update
updateAuthorIds().catch(console.error); 
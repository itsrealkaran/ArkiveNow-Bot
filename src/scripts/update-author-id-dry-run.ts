import databaseService from '../services/database';
import logger from '../utils/logger';

async function updateAuthorIdsDryRun() {
  try {
    logger.info('🔍 Starting author_id update DRY RUN...');

    const client = await databaseService['pool'].connect();
    
    try {
      // First, let's see what we're working with
      const statsBefore = await databaseService.getTweetStats();
      logger.info('📊 Stats before update:', statsBefore);

      // Get all tweets that need updating
      const tweetsToUpdate = await client.query(`
        SELECT t.id, t.tweet_id, t.author_id as current_author_id, 
               u.author_id as correct_author_id, ul.created_at as log_created_at,
               t.text as tweet_text
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

      // Show examples of what would be updated
      const examples = tweetsToUpdate.rows.slice(0, 10);
      logger.info('📝 Examples of updates that would be made:');
      examples.forEach((row, index) => {
        logger.info(`   ${index + 1}. Tweet ID: ${row.tweet_id}`);
        logger.info(`      Current author_id: ${row.current_author_id}`);
        logger.info(`      Correct author_id: ${row.correct_author_id}`);
        logger.info(`      Tweet text: ${row.tweet_text?.substring(0, 100)}...`);
        logger.info(`      Log created: ${row.log_created_at}`);
        logger.info('');
      });

      // Count how many would actually be updated
      let wouldUpdateCount = 0;
      let wouldSkipCount = 0;

      for (const row of tweetsToUpdate.rows) {
        if (row.current_author_id === row.correct_author_id) {
          wouldSkipCount++;
        } else {
          wouldUpdateCount++;
        }
      }

      logger.info(`📊 DRY RUN SUMMARY:`);
      logger.info(`   - Total tweets processed: ${tweetsToUpdate.rows.length}`);
      logger.info(`   - Tweets that would be updated: ${wouldUpdateCount}`);
      logger.info(`   - Tweets that would be skipped (already correct): ${wouldSkipCount}`);

      // Show some statistics about the changes
      const authorIdChanges = new Map<string, number>();
      for (const row of tweetsToUpdate.rows) {
        if (row.current_author_id !== row.correct_author_id) {
          const key = `${row.current_author_id} -> ${row.correct_author_id}`;
          authorIdChanges.set(key, (authorIdChanges.get(key) || 0) + 1);
        }
      }

      logger.info('🔄 Most common author_id changes:');
      const sortedChanges = Array.from(authorIdChanges.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      sortedChanges.forEach(([change, count]) => {
        logger.info(`   ${change}: ${count} tweets`);
      });

      // Check for any potential issues
      const duplicateTweets = await client.query(`
        SELECT tweet_id, COUNT(*) as count
        FROM tweets
        GROUP BY tweet_id
        HAVING COUNT(*) > 1
      `);

      if (duplicateTweets.rows.length > 0) {
        logger.warn('⚠️  Found duplicate tweet_ids:', duplicateTweets.rows);
      }

      logger.info('✅ DRY RUN completed successfully!');
      logger.info('💡 To run the actual update, use: npm run update-author-id');

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error in dry run:', error);
    throw error;
  } finally {
    await databaseService.close();
  }
}

// Run the dry run
updateAuthorIdsDryRun().catch(console.error); 
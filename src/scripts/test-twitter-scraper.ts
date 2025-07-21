import twitterScraperService from '../services/twitter-scraper';
import logger from '../utils/logger';

function getDefaultLastCheckedTime(hoursAgo = 48) {
  const d = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return d.toISOString();
}

async function testTwitterScraper() {
  try {
    logger.info('🧪 Testing X.com scraper service...');

    // Accept lastCheckedTime from CLI or use default (24h ago)
    const lastCheckedTime = process.argv[2] || getDefaultLastCheckedTime();
    logger.info(`Using lastCheckedTime: ${lastCheckedTime}`);

    // Test 1: Load existing session
    logger.info('Testing session restoration...');
    const sessionRestored = await twitterScraperService.loadSession();
    logger.info('Session restoration result:', { restored: sessionRestored });

    if (!sessionRestored) {
      logger.info('No saved session found. You will need to login manually.');
      logger.info('To login, run: npm run setup-scraper');
      return;
    }

    // Test 2: Restore session
    logger.info('Testing session restoration...');
    const restored = await twitterScraperService.restoreSession();
    logger.info('Session restoration result:', { restored });

    if (!restored) {
      logger.error('❌ Session restoration failed');
      logger.info('You may need to re-login. Run: npm run setup-scraper');
      return;
    }

    // Test 3: Get mentions since lastCheckedTime
    logger.info('Testing mentions scraping with parent tweet extraction...');
    try {
      const mentions = await twitterScraperService.getMentions(lastCheckedTime);
      logger.info('Mentions scraping result:', {
        count: mentions.length,
        mentions: mentions.map(m => ({
          id: m.id,
          text: m.text.substring(0, 100) + '...',
          author_id: m.author_id,
          created_at: m.created_at,
          author: m.author ? {
            username: m.author.username,
            name: m.author.name,
            verified: m.author.verified
          } : null,
          in_reply_to_user_id: m.in_reply_to_user_id,
          referenced_tweets: m.referenced_tweets,
          public_metrics: m.public_metrics
        }))
      });

      // Show detailed info for replies
      const replies = mentions.filter(m => m.in_reply_to_user_id || m.referenced_tweets?.length);
      if (replies.length > 0) {
        logger.info('📝 Reply details found:', replies.map(r => ({
          id: r.id,
          in_reply_to_user_id: r.in_reply_to_user_id,
          referenced_tweets: r.referenced_tweets,
          created_at: r.created_at,
          text: r.text.substring(0, 50) + '...'
        })));
      } else {
        logger.info('ℹ️  No replies found in mentions');
      }

      if (mentions.length === 0) {
        logger.info('ℹ️  No new mentions found since lastCheckedTime.');
      }

    } catch (error) {
      logger.error('❌ Mentions scraping failed:', error);
      logger.info('This might be due to:');
      logger.info('  - No mentions available');
      logger.info('  - Navigation issues with X.com interface');
      logger.info('  - Session expired');
      logger.info('  - X.com interface changes');
      logger.info('Check the logs above for detailed debugging information.');
      return;
    }

    // Test 4: Save session
    logger.info('Testing session saving...');
    await twitterScraperService.saveSession();
    logger.info('Session saved successfully');
    
    logger.info('✅ All tests completed successfully!');
    logger.info('🎉 X.com scraper service is working correctly!');

  } catch (error) {
    logger.error('❌ Test failed:', error);
    logger.info('💡 Troubleshooting tips:');
    logger.info('  - Run "npm run setup-scraper" to re-login');
    logger.info('  - Check if X.com interface has changed');
    logger.info('  - Verify your account has mentions to scrape');
    logger.info('  - Check login_error_*.png files for visual debugging');
  } finally {
    // Clean up
    await twitterScraperService.stopPolling();
  }
}

// Run test
testTwitterScraper().catch(console.error); 
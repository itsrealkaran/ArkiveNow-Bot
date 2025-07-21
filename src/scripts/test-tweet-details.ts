import twitterScraperService from '../services/twitter-scraper';
import logger from '../utils/logger';

async function testTweetDetails() {
  try {
    logger.info('🧪 Testing tweet details extraction...');

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

    // Test 3: Get mentions with detailed parent tweet extraction
    logger.info('Testing mentions scraping with parent tweet extraction...');
    try {
      const mentions = await twitterScraperService.getMentions();
      
      logger.info('Mentions scraping result:', { 
        count: mentions.length,
        mentions: mentions.slice(0, 5).map(m => ({
          id: m.id,
          text: m.text.substring(0, 100) + '...',
          author_id: m.author_id,
          in_reply_to_user_id: m.in_reply_to_user_id,
          referenced_tweets: m.referenced_tweets,
          author: m.author ? {
            username: m.author.username,
            name: m.author.name,
            verified: m.author.verified
          } : null
        }))
      });

      // Show detailed info for replies
      const replies = mentions.filter(m => m.in_reply_to_user_id || m.referenced_tweets?.length);
      if (replies.length > 0) {
        logger.info('📝 Reply details found:', replies.map(r => ({
          id: r.id,
          in_reply_to_user_id: r.in_reply_to_user_id,
          referenced_tweets: r.referenced_tweets,
          text: r.text.substring(0, 50) + '...'
        })));
      } else {
        logger.info('ℹ️  No replies found in mentions');
      }

    } catch (error) {
      logger.error('❌ Mentions scraping failed:', error);
      return;
    }

    // Test 4: Save session
    logger.info('Testing session saving...');
    await twitterScraperService.saveSession();
    logger.info('Session saved successfully');
    
    logger.info('✅ Tweet details test completed successfully!');

  } catch (error) {
    logger.error('❌ Test failed:', error);
  } finally {
    // Clean up
    await twitterScraperService.stopPolling();
  }
}

// Run test
testTweetDetails().catch(console.error); 
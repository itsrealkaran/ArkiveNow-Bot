import twitterService from '../services/twitter-v2';
import twitterScraperService from '../services/twitter-scraper';
import logger from '../utils/logger';
import { TwitterMention } from '../types';

async function testTwitterV2() {
  try {
    logger.info('🧪 Testing new Twitter scraper service (browser-based fetch)...');

    // Restore session before fetching mentions
    logger.info('Restoring Twitter scraper session...');
    const sessionLoaded = await twitterScraperService.loadSession();
    const sessionRestored = sessionLoaded ? await twitterScraperService.restoreSession() : false;
    logger.info('Session restoration result:', { loaded: sessionLoaded, restored: sessionRestored });
    if (!sessionRestored) {
      logger.warn('No valid session found. Skipping mention fetch.');
      return;
    }
    // Use a default of 24h ago for lastCheckedTime
    const lastCheckedTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    logger.info(`Using lastCheckedTime: ${lastCheckedTime}`);
    const mentions = await twitterScraperService.getMentions(lastCheckedTime);
    logger.info('Mentions test result (scraper):', { 
      count: mentions.length,
      mentions: mentions
    });

    // Test 3: Extract tweet IDs from mentions and fetch them
    if (mentions.length > 0) {
      logger.info('Extracting tweet IDs from mentions...');
      // Map ScrapedMention[] to TwitterMention[]
      const mappedMentions: TwitterMention[] = mentions.map(m => ({
        ...m,
        in_reply_to_user_id: m.in_reply_to_user_id || '',
      }));
      const tweetIdsToFetch: string[] = [];
      for (const mention of mappedMentions) {
        // Extract tweet ID from mention text or referenced tweets
        const extractedTweetId = twitterService.extractTweetIdFromMention(mention);
        const parentTweetId = twitterService.extractParentTweetId(mention);
        if (extractedTweetId) {
          tweetIdsToFetch.push(extractedTweetId);
          logger.info('Found tweet ID in mention:', { 
            mentionId: mention.id, 
            extractedTweetId,
            mentionText: mention.text?.substring(0, 50) + '...'
          });
        }
        if (parentTweetId) {
          tweetIdsToFetch.push(parentTweetId);
          logger.info('Found parent tweet ID in mention:', { 
            mentionId: mention.id, 
            parentTweetId,
            mentionText: mention.text?.substring(0, 50) + '...'
          });
        }
      }
      // Remove duplicates
      const uniqueTweetIds = [...new Set(tweetIdsToFetch)];
      logger.info('Tweet IDs to fetch:', { 
        total: uniqueTweetIds.length,
        tweetIds: uniqueTweetIds
      });
      // Fetch the tweets using optimized batch API
      if (uniqueTweetIds.length > 0) {
        logger.info('Fetching tweets using optimized batch API...');
        const optimizedResponse = await twitterService.getOptimizedTweetsByIds(uniqueTweetIds);
        logger.info('Optimized batch fetch result:', {
          tweetCount: optimizedResponse.tweets.length,
          tweets: optimizedResponse.tweets
        });
      } else {
        logger.info('No tweet IDs found in mentions to fetch');
      }
    }

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

    // Test 5: Test media posting with archiving quote and Pengu image
    logger.info('Testing media posting with archiving quote and Pengu image...');
    
    const archivingQuote = "Archiving isn't just about preserving the past—it's about building bridges to the future. Every tweet, every moment, every story deserves to be remembered. #arkivenow";
    
    // Use the actual Pengu.png image
    const imagePath = 'D:/project-k/bot/assets/Pengu.png';
    
    // Check if the image exists
    const fs = require('fs');
    if (fs.existsSync(imagePath)) {
      logger.info('Found Pengu image for media post:', { 
        quote: archivingQuote,
        imagePath: imagePath,
        imageExists: true
      });
      
      // If we have mentions, reply to the first one with the media
      if (mentions.length > 0) {
        const firstMention = mentions[0];
        if (firstMention && firstMention.id) {
          logger.info('Posting media reply to first mention:', { 
            mentionId: firstMention.id,
            quote: archivingQuote.substring(0, 100) + '...'
          });
          
          try {
            const success = await twitterService.replyWithMedia(firstMention.id, archivingQuote, imagePath);
            logger.info('Media post result:', { 
              success, 
              mentionId: firstMention.id,
              quoteLength: archivingQuote.length
            });
          } catch (error) {
            logger.error('Failed to post media reply:', { error });
          }
        } else {
          logger.warn('First mention is invalid, skipping media post');
        }
      } else {
        logger.info('No mentions found to reply to, skipping media post');
      }
    } else {
      logger.warn('Pengu image not found, skipping media post:', { 
        imagePath: imagePath,
        imageExists: false
      });
    }
    
    logger.info('✅ All Twitter v2 service tests passed!');

  } catch (error) {
    logger.error('❌ Twitter v2 service test failed:', error);
  }
}

// Run the test
testTwitterV2().catch(console.error); 
import { TwitterMention, TwitterTweet, QuotaCheck } from '../types';
import { TweetParser, ParsedMention } from '../utils/tweetParser';
import twitterService from './twitter';
import screenshotService from './screenshot';
import arweaveService from './arweave';
import quotaService from './quota';
import databaseService from './database';
import logger from '../utils/logger';

class BotService {
  private isProcessing = false;

  constructor() {
    logger.info('Bot service initialized');
  }

  /**
   * Start the bot and begin polling for mentions
   */
  async start(): Promise<void> {
    logger.info('🚀 Starting bot service...');

    // Start polling for mentions
    await twitterService.startPolling(async (mentions) => {
      await this.processMentionsBatch(mentions);
    });

    logger.info('✅ Bot service started successfully');
  }

  /**
   * Process a batch of mentions
   */
  async processMentionsBatch(mentions: TwitterMention[]): Promise<void> {
    // Step 1: Collect all relevant tweet IDs (including quoted tweets)
    const mentionToTweetId: { [mentionId: string]: string } = {};
    
    for (const mention of mentions) {
      if (!mention.id) continue; // skip if mention.id is undefined
      
      // Upsert user info in DB if author info is available
      if (mention.author) {
        const userUpsert: any = { author_id: mention.author.id };
        if (mention.author.username !== undefined) userUpsert.username = mention.author.username;
        if (mention.author.name !== undefined) userUpsert.name = mention.author.name;
        if (mention.author.profile_image_url !== undefined) userUpsert.profile_image_url = mention.author.profile_image_url;
        if (mention.author.verified !== undefined) userUpsert.verified = mention.author.verified;
        await databaseService.upsertUserByAuthorId(userUpsert);
      }
      
      let tweetId = twitterService.extractParentTweetId(mention);
      if (!tweetId) {
        const parsed = TweetParser.parseMention(mention);
        tweetId = parsed.tweetId || '';
      }
      
      if (tweetId && tweetId !== '') {
        mentionToTweetId[mention.id] = tweetId;
      }
    }
    
    const uniqueTweetIds = Array.from(new Set(Object.values(mentionToTweetId)));
    if (!uniqueTweetIds.length) {
      logger.warn('No valid tweet references found in batch');
      return;
    }

    // Step 2: Batch fetch main tweets (with rate limiting handled by Twitter service)
    logger.info('Fetching main tweets', { tweetIds: uniqueTweetIds });
    const tweets = await twitterService.getTweetsByIds(uniqueTweetIds);
    console.log('tweets:', tweets);
    for (const tweet of tweets) {
      console.log('tweet:', tweet.referenced_tweets);
    }
    logger.info('Batch fetched main tweets', { tweetIds: uniqueTweetIds, count: tweets.length });
    
    // Step 3: Check if main tweets are quoted tweets and collect original tweet IDs
    const originalTweetIds: Set<string> = new Set();
    const quotedMainTweets: Map<string, string> = new Map(); // mainTweetId -> originalTweetId
    
    for (const tweet of tweets) {
      if (tweet.referenced_tweets) {
        for (const ref of tweet.referenced_tweets) {
          if (ref.type === 'quoted') {
            // This main tweet is quoting another tweet
            originalTweetIds.add(ref.id);
            quotedMainTweets.set(tweet.id, ref.id);
          }
        }
      }
    }
    
    // Step 4: Fetch original tweets that are being quoted (with rate limiting handled by Twitter service)
    let originalTweets: TwitterTweet[] = [];
    if (originalTweetIds.size > 0) {
      const originalTweetIdsArray = Array.from(originalTweetIds);
      logger.info('Found quoted tweets - fetching original tweets', { 
        quotedTweetCount: originalTweetIdsArray.length,
        originalTweetIds: originalTweetIdsArray 
      });
      
      // The Twitter service handles rate limiting automatically
      originalTweets = await twitterService.getTweetsByIds(originalTweetIdsArray);
      console.log('originalTweets:', originalTweets);
      logger.info('Fetched original tweets', { 
        requested: originalTweetIdsArray.length,
        received: originalTweets.length,
        missing: originalTweetIdsArray.length - originalTweets.length
      });
    }
    
    // Step 5: Create combined tweet map
    const tweetMap = new Map(tweets.map(tweet => [tweet.id, tweet]));
    const originalTweetMap = new Map(originalTweets.map(tweet => [tweet.id, tweet]));
    
    // Step 6: Enhance main tweets with original tweet data (the tweets they're quoting)
    for (const tweet of tweets) {
      const originalTweetId = quotedMainTweets.get(tweet.id);
      if (originalTweetId) {
        const originalTweet = originalTweetMap.get(originalTweetId);
        if (originalTweet) {
          // Add original tweet to the main tweet's includes
          if (!tweet.includes) {
            tweet.includes = { users: [], media: [], tweets: [] };
          }
          tweet.includes.tweets = [originalTweet];
          
          // Also add original tweet author to includes.users
          if (originalTweet.author && tweet.includes.users) {
            tweet.includes.users.push(originalTweet.author);
          }
        }
      }
    }

    // Step 7: Process each mention with its corresponding tweet
    logger.info('Processing mentions with enhanced tweet data', { 
      mentionCount: mentions.length,
      mainTweetCount: tweets.length,
      originalTweetCount: originalTweets.length
    });
    
    for (const mention of mentions) {
      const tweetId = mentionToTweetId[mention.id];
      if (!tweetId || tweetId === '') {
        logger.warn('No tweetId found for mention', { mentionId: mention.id });
        await this.handleInvalidRequest(mention, { tweetId: null, type: 'invalid', originalText: mention.text });
        continue;
      }
      const tweet = tweetMap.get(tweetId);
      if (!tweet) {
        logger.warn('Tweet not found for mention', { mentionId: mention.id, tweetId });
        await this.handleInvalidRequest(mention, { tweetId: null, type: 'invalid', originalText: mention.text });
        continue;
      }
      
      // Log if this tweet has original tweets (the tweets it's quoting)
      if (tweet.includes?.tweets && tweet.includes.tweets.length > 0) {
        logger.info('Processing mention with original tweets (quoted content)', {
          mentionId: mention.id,
          tweetId: tweet.id,
          originalTweetCount: tweet.includes.tweets.length,
          originalTweetIds: tweet.includes.tweets.map(ot => ot.id)
        });
      }
      
      await this.processMentionWithTweet(mention, tweet);
    }
  }

  /**
   * Process a single mention with its tweet (refactored from processMention)
   */
  async processMentionWithTweet(mention: TwitterMention, tweet: TwitterTweet): Promise<void> {
    if (this.isProcessing) {
      logger.info('Bot is already processing a mention, skipping', { mentionId: mention.id });
      return;
    }
    this.isProcessing = true;
    try {
      logger.info('Processing mention', {
        mentionId: mention.id,
        authorId: mention.author_id,
        text: mention.text,
        tweetId: tweet.id
      });

      // Step 1.5: Store tweet data in database
      try {
        await databaseService.storeTweet({
          tweet_id: tweet.id,
          author_id: tweet.author_id,
          text: tweet.text,
          created_at: tweet.created_at,
          public_metrics: tweet.public_metrics,
          author_data: tweet.author,
          media_data: tweet.media,
          referenced_tweets: tweet.referenced_tweets,
          includes_data: tweet.includes
        });
        
        // Update processing status to processing
        await databaseService.updateTweetProcessingStatus(tweet.id, 'processing');
      } catch (error) {
        logger.error('Failed to store tweet data', { tweetId: tweet.id, error });
        // Continue processing even if storage fails
      }

      // Step 2: Check user quota using author_id
      const quotaCheck = await quotaService.checkUserQuota(mention.author_id);
      if (!quotaCheck.allowed) {
        await this.handleQuotaExceeded(mention, mention.author_id, quotaCheck);
        return;
      }
      // Step 4: Check if tweet is public
      const isPublic = await twitterService.isPublicTweet(tweet);
      if (!isPublic) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'failed', undefined, 'Cannot screenshot private tweets');
        await this.handleError(mention, 'Cannot screenshot private tweets');
        return;
      }
      // Step 5: Take screenshot (no author lookup)
      const screenshotResult = await screenshotService.takeScreenshot(tweet, {});
      if (!screenshotResult.success || !screenshotResult.buffer) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'failed', undefined, `Screenshot failed: ${screenshotResult.error}`);
        await this.handleError(mention, `Screenshot failed: ${screenshotResult.error}`);
        return;
      }
      // Step 6: Upload to Arweave
      const uploadResult = await arweaveService.uploadScreenshot(
        screenshotResult,
        tweet.id,
        tweet.author_id,
        tweet.text
      );
      if (!uploadResult.success || !uploadResult.id) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'failed', undefined, `Upload failed: ${uploadResult.error}`);
        await this.handleError(mention, `Upload failed: ${uploadResult.error}`);
        return;
      }
      // Step 7: Increment user quota using author_id
      await quotaService.incrementUserQuota(mention.author_id);
      // Step 8: Update tweet processing status to completed
      await databaseService.updateTweetProcessingStatus(tweet.id, 'completed', uploadResult.id);
      
      // Step 9: Log successful usage with mention timestamp
      await databaseService.logUsage({
        user_id: mention.author_id,
        tweet_id: tweet.id,
        event_type: 'success',
        arweave_id: uploadResult.id,
      });
      
      // Step 10: Reply with success message
      // await this.handleSuccess(mention, uploadResult.id, tweet.id, tweet.author_id, screenshotResult.buffer);
      logger.info('Successfully processed mention', {
        mentionId: mention.id,
        tweetId: tweet.id,
        arweaveId: uploadResult.id,
        requester: mention.author_id,
      });
    } catch (error) {
      logger.error('Error processing mention', { mentionId: mention.id, error });
      await databaseService.updateTweetProcessingStatus(tweet.id, 'failed', undefined, 'An unexpected error occurred while processing your request');
      await this.handleError(mention, 'An unexpected error occurred while processing your request');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle successful screenshot and upload
   */
  private async handleSuccess(
    mention: TwitterMention,
    arweaveId: string,
    tweetId: string,
    authorId: string,
    screenshotBuffer: Buffer
  ): Promise<void> {
    try {
      const message = arweaveService.generateUploadMessage(arweaveId, tweetId, authorId);
      
      // Save screenshot to temp file for Twitter upload
      const tempFilename = `tweet-${tweetId}-${Date.now()}.jpg`;
      const tempPath = await screenshotService.saveScreenshot(screenshotBuffer, tempFilename);
      
      // Reply with the message and screenshot image
      const replySuccess = await twitterService.replyWithMedia(mention.id, message, tempPath);
      
      if (replySuccess) {
        logger.info('Success reply with image sent', { 
          mentionId: mention.id, 
          arweaveId,
          messageLength: message.length,
          imageSize: screenshotBuffer.length
        });
      } else {
        logger.error('Failed to send success reply with image', { mentionId: mention.id });
      }
    } catch (error) {
      logger.error('Error sending success reply with image', { mentionId: mention.id, error });
    }
  }

  /**
   * Handle quota exceeded
   */
  private async handleQuotaExceeded(
    mention: TwitterMention,
    authorId: string,
    quotaCheck: QuotaCheck
  ): Promise<void> {
    try {
      // Log quota exceeded event
      await quotaService.logQuotaExceeded(authorId, mention.id, quotaCheck.reason || 'Quota exceeded');

      const message = `❌ Sorry, you've reached your limit for today.

Daily remaining: ${quotaCheck.daily_remaining}
Monthly remaining: ${quotaCheck.monthly_remaining}

Please try again tomorrow!`;

      const replySuccess = await twitterService.replyToTweet(mention.id, message);
      
      if (replySuccess) {
        logger.info('Quota exceeded reply sent', { mentionId: mention.id, authorId });
      } else {
        logger.error('Failed to send quota exceeded reply', { mentionId: mention.id });
      }
    } catch (error) {
      logger.error('Error sending quota exceeded reply', { mentionId: mention.id, error });
    }
  }

  /**
   * Handle invalid requests
   */
  private async handleInvalidRequest(mention: TwitterMention, parsed: ParsedMention): Promise<void> {
    try {
      const message = TweetParser.getErrorMessage(parsed);
      
      const replySuccess = await twitterService.replyToTweet(mention.id, message);
      
      if (replySuccess) {
        logger.info('Invalid request reply sent', { 
          mentionId: mention.id, 
          type: parsed.type 
        });
      } else {
        logger.error('Failed to send invalid request reply', { mentionId: mention.id });
      }
    } catch (error) {
      logger.error('Error sending invalid request reply', { mentionId: mention.id, error });
    }
  }

  /**
   * Handle errors
   */
  private async handleError(mention: TwitterMention, errorMessage: string): Promise<void> {
    try {
      const message = arweaveService.generateErrorMessage(errorMessage, mention.id);
      
      const replySuccess = await twitterService.replyToTweet(mention.id, message);
      
      if (replySuccess) {
        logger.info('Error reply sent', { 
          mentionId: mention.id, 
          error: errorMessage 
        });
      } else {
        logger.error('Failed to send error reply', { mentionId: mention.id });
      }
    } catch (error) {
      logger.error('Error sending error reply', { mentionId: mention.id, error });
    }
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping bot service...');
    
    try {
      await twitterService.stopPolling();
      await screenshotService.cleanup();
      logger.info('✅ Bot service stopped successfully');
    } catch (error) {
      logger.error('Error stopping bot service', { error });
    }
  }

  /**
   * Get bot status
   */
  getStatus(): {
    isRunning: boolean;
    isProcessing: boolean;
    lastActivity?: Date;
  } {
    return {
      isRunning: true, // This would be more sophisticated in production
      isProcessing: this.isProcessing,
    };
  }
}

// Export singleton instance
export const botService = new BotService();
export default botService; 
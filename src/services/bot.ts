import { TwitterMention, TwitterTweet, TwitterUser, BotResponse, QuotaCheck, OptimizedTweet } from '../types';
import { TweetParser, ParsedMention } from '../utils/tweetParser';
import twitterService from './twitter';
import twitterScraperService from './twitter-scraper';
import screenshotService from './screenshot';
import arweaveService from './arweave';
import quotaService from './quota';
import databaseService from './database';
import logger from '../utils/logger';
import twitterV2Service from './twitter-v2';

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

    // Start polling for mentions using the scraper
    const poll = async () => {
      try {
        // Restore session before fetching mentions
        logger.info('Restoring Twitter scraper session...');
        const sessionLoaded = await twitterScraperService.loadSession();
        const sessionRestored = sessionLoaded ? await twitterScraperService.restoreSession() : false;
        logger.info('Session restoration result:', { loaded: sessionLoaded, restored: sessionRestored });
        if (!sessionRestored) {
          logger.warn('No valid session found. Skipping mention fetch.');
          return;
        }
        // Get the latest tweet and mention timestamps from the database
        const latestTweetTime = await databaseService.getLatestTweetTimestamp();
        const latestMentionTime = await databaseService.getLatestMentionTimestamp();
        let lastCheckedTime: string | undefined = undefined;
        if (latestTweetTime && latestMentionTime) {
          lastCheckedTime = new Date(Math.max(new Date(latestTweetTime).getTime(), new Date(latestMentionTime).getTime())).toISOString();
        } else if (latestTweetTime) {
          lastCheckedTime = new Date(latestTweetTime).toISOString();
        } else if (latestMentionTime) {
          lastCheckedTime = new Date(latestMentionTime).toISOString();
        } else {
          // Default to 24h ago
          lastCheckedTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        }
        logger.info(`Using lastCheckedTime: ${lastCheckedTime}`);
        const mentions = await twitterScraperService.getMentions(lastCheckedTime);
        // Map ScrapedMention[] to TwitterMention[]
        const mappedMentions = mentions.map(m => ({
          ...m,
          in_reply_to_user_id: m.in_reply_to_user_id || '',
        }));
        await this.processMentionsBatch(mappedMentions);
      } catch (error) {
        logger.error('Error in scraper polling cycle', { error });
      }
    };
    // Initial poll
    await poll();
    // Set up interval
    setInterval(poll, 15 * 60 * 1000); // 15 minutes, or use botConfig.pollingInterval
    logger.info('✅ Bot service started successfully');
  }

  /**
   * Process a batch of mentions
   */
  async processMentionsBatch(mentions: TwitterMention[]): Promise<void> {
    // First, process any retries from previous cycles
    await this.processRetries();
    
    // Then process new mentions
    // Step 1: Collect all relevant tweet IDs
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

    // Step 2: Batch fetch tweets
    const { tweets }: { tweets: OptimizedTweet[] } = await twitterV2Service.getOptimizedTweetsByIds(uniqueTweetIds);
    console.log('tweets:', tweets);
    logger.info('Batch fetched tweets', { tweetIds: uniqueTweetIds, tweets });
    const tweetMap = new Map(tweets.map(tweet => [tweet.id, tweet]));

    // Step 3: Process each mention with its corresponding tweet
    for (const mention of mentions) {
      const tweetId = mentionToTweetId[mention.id];
      if (!tweetId || tweetId === '') {
        logger.warn('No tweetId found for mention', { mentionId: mention.id });
        // Don't reply immediately, will retry in next cycle
        continue;
      }
      const tweet = tweetMap.get(tweetId);
      if (!tweet) {
        logger.warn('Tweet not found for mention', { mentionId: mention.id, tweetId });
        // Don't reply immediately, will retry in next cycle
        continue;
      }
      
      // Store tweet data for each request (allows multiple users to archive same tweet)
      try {
        await databaseService.storeTweet({
          tweet_id: tweet.id,
          author_id: tweet.author.id,
          username: tweet.author.username || '',
          text: tweet.content,
          created_at: tweet.created_at,
          public_metrics: tweet.metrics,
          author_data: tweet.author,
          media_data: tweet.media,
          includes_data: {
            quoted_tweet_id: tweet.quoted_tweet_id || null,
            quoted_tweet: tweet.quoted_tweet || null,
            poll: tweet.poll || null,
            article: tweet.article || null
          }
        });
        
        // Update processing status to processing
        await databaseService.updateTweetProcessingStatus(tweet.id, 'processing');
      } catch (error) {
        logger.error('Failed to store tweet data', { tweetId: tweet.id, error });
        // Continue processing even if storage fails
      }
      
      await this.processMentionWithTweet(mention, tweet);
    }
  }

  /**
   * Process retries from previous cycles
   */
  async processRetries(): Promise<void> {
    try {
      const retryTweets = await databaseService.getTweetsForRetry();
      
      // Process upload retries (screenshot exists, just retry upload)
      for (const tweetData of retryTweets.uploadRetry) {
        logger.info('Processing upload retry', { tweetId: tweetData.tweet_id });
        
        try {
          // Reconstruct tweet object from stored data
          const tweet: OptimizedTweet = {
            id: tweetData.tweet_id,
            content: tweetData.text,
            created_at: tweetData.created_at,
            metrics: tweetData.public_metrics,
            author: tweetData.author_data,
            media: tweetData.media_data,
            quoted_tweet_id: tweetData.includes_data?.quoted_tweet_id || null,
            quoted_tweet: tweetData.includes_data?.quoted_tweet || null,
            poll: tweetData.includes_data?.poll || null,
            article: tweetData.includes_data?.article || null
          };

          // Take screenshot again (since we don't store screenshots)
          const screenshotResult = await screenshotService.takeScreenshot(tweet, {});
          if (!screenshotResult.success || !screenshotResult.buffer) {
            await databaseService.updateTweetProcessingStatus(tweet.id, 'upload_failed', undefined, `Screenshot retry failed: ${screenshotResult.error}`);
            continue;
          }

          // Retry upload
          const uploadResult = await arweaveService.uploadScreenshot(
            screenshotResult,
            tweet.id,
            tweet.author.id,
            tweet.content
          );

          if (uploadResult.success && uploadResult.id) {
            await databaseService.updateTweetProcessingStatus(tweet.id, 'completed', uploadResult.id);
            logger.info('Upload retry successful', { tweetId: tweet.id, arweaveId: uploadResult.id });
          } else {
            await databaseService.updateTweetProcessingStatus(tweet.id, 'upload_failed', undefined, `Upload retry failed: ${uploadResult.error}`);
            logger.warn('Upload retry failed, will retry again', { tweetId: tweet.id, error: uploadResult.error });
          }
        } catch (error) {
          logger.error('Error processing upload retry', { tweetId: tweetData.tweet_id, error });
          await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'upload_failed', undefined, `Upload retry error: ${error}`);
        }
      }

      // Process fetch retries (need to refetch tweet data)
      for (const tweetData of retryTweets.fetchRetry) {
        logger.info('Processing fetch retry', { tweetId: tweetData.tweet_id });
        
        try {
          // Refetch tweet data from Twitter
          const { tweets: retryTweets } = await twitterV2Service.getOptimizedTweetsByIds([tweetData.tweet_id]);
          if (retryTweets.length === 0) {
            await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'fetch_failed', undefined, 'Tweet not found on retry');
            continue;
          }
          const tweet = retryTweets[0];
          if (!tweet) {
            await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'fetch_failed', undefined, 'Tweet not found on retry');
            continue;
          }
          // Update stored tweet data
          await databaseService.storeTweet({
            tweet_id: tweet.id,
            author_id: tweetData.author_id, // Keep the original requester's author_id from stored data
            username: tweet.author?.username || '',
            text: tweet.content,
            created_at: tweet.created_at,
            public_metrics: tweet.metrics,
            author_data: tweet.author,
            media_data: tweet.media,
            includes_data: {
              quoted_tweet_id: tweet.quoted_tweet_id || null,
              quoted_tweet: tweet.quoted_tweet || null,
              poll: tweet.poll || null,
              article: tweet.article || null
            }
          });

          // Process the tweet normally
          await this.processTweetForRetry(tweet);
        } catch (error) {
          logger.error('Error processing fetch retry', { tweetId: tweetData.tweet_id, error });
          await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'fetch_failed', undefined, `Fetch retry error: ${error}`);
        }
      }

      // Process other retries (full reprocessing)
      for (const tweetData of retryTweets.otherRetry) {
        logger.info('Processing other retry', { tweetId: tweetData.tweet_id });
        
        try {
          // Refetch tweet data from Twitter
          const { tweets: retryOtherTweets } = await twitterV2Service.getOptimizedTweetsByIds([tweetData.tweet_id]);
          if (retryOtherTweets.length === 0) {
            await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'other_failed', undefined, 'Tweet not found on retry');
            continue;
          }
          const tweet = retryOtherTweets[0];
          if (!tweet) {
            await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'other_failed', undefined, 'Tweet not found on retry');
            continue;
          }
          // Update stored tweet data
          await databaseService.storeTweet({
            tweet_id: tweet.id,
            author_id: tweetData.author_id, // Keep the original requester's author_id from stored data
            username: tweet.author?.username || '',
            text: tweet.content,
            created_at: tweet.created_at,
            public_metrics: tweet.metrics,
            author_data: tweet.author,
            media_data: tweet.media,
            includes_data: {
              quoted_tweet_id: tweet.quoted_tweet_id || null,
              quoted_tweet: tweet.quoted_tweet || null,
              poll: tweet.poll || null,
              article: tweet.article || null
            }
          });

          // Process the tweet normally
          await this.processTweetForRetry(tweet);
        } catch (error) {
          logger.error('Error processing other retry', { tweetId: tweetData.tweet_id, error });
          await databaseService.updateTweetProcessingStatus(tweetData.tweet_id, 'other_failed', undefined, `Other retry error: ${error}`);
        }
      }
    } catch (error) {
      logger.error('Error processing retries', { error });
    }
  }

  /**
   * Process a tweet for retry (without mention context)
   */
  async processTweetForRetry(tweet: OptimizedTweet): Promise<void> {
    try {
      // Check if tweet is public
      const isPublic = await twitterService.isPublicTweet({
        id: tweet.id,
        text: tweet.content,
        author_id: tweet.author.id,
        created_at: tweet.created_at
      });
      if (!isPublic) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, 'Cannot screenshot private tweets');
        return;
      }

      // Take screenshot
      const screenshotResult = await screenshotService.takeScreenshot(tweet, {});
      if (!screenshotResult.success || !screenshotResult.buffer) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, `Screenshot failed: ${screenshotResult.error}`);
        return;
      }

      // Upload to Arweave
      const uploadResult = await arweaveService.uploadScreenshot(
        screenshotResult,
        tweet.id,
        tweet.author.id,
        tweet.content
      );

      if (uploadResult.success && uploadResult.id) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'completed', uploadResult.id);
        logger.info('Retry processing successful', { tweetId: tweet.id, arweaveId: uploadResult.id });
      } else {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'upload_failed', undefined, `Upload failed: ${uploadResult.error}`);
        logger.warn('Retry upload failed, will retry again', { tweetId: tweet.id, error: uploadResult.error });
      }
    } catch (error) {
      logger.error('Error processing tweet for retry', { tweetId: tweet.id, error });
      await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, `Retry processing error: ${error}`);
    }
  }

  /**
   * Process a single mention with its tweet (refactored from processMention)
   */
  async processMentionWithTweet(mention: TwitterMention, tweet: OptimizedTweet): Promise<void> {
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
      // Step 2: Check user quota using author_id
      const quotaCheck = await quotaService.checkUserQuota(mention.author_id);
      if (!quotaCheck.allowed) {
        await this.handleQuotaExceeded(mention, mention.author_id, quotaCheck);
        return;
      }
      // Step 4: Check if tweet is public
      const isPublic = await twitterService.isPublicTweet({
        id: tweet.id,
        text: tweet.content,
        author_id: tweet.author.id,
        created_at: tweet.created_at
      });
      if (!isPublic) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, 'Cannot screenshot private tweets');
        logger.warn('Private tweet, will retry in next cycle', { tweetId: tweet.id });
        return;
      }
      // Step 5: Take screenshot (no author lookup)
      const screenshotResult = await screenshotService.takeScreenshot(tweet, {});
      if (!screenshotResult.success || !screenshotResult.buffer) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, `Screenshot failed: ${screenshotResult.error}`);
        logger.warn('Screenshot failed, will retry in next cycle', { tweetId: tweet.id, error: screenshotResult.error });
        return;
      }
      // Step 6: Upload to Arweave
      const uploadResult = await arweaveService.uploadScreenshot(
        screenshotResult,
        tweet.id,
        tweet.author.id,
        tweet.content
      );
      if (!uploadResult.success || !uploadResult.id) {
        await databaseService.updateTweetProcessingStatus(tweet.id, 'upload_failed', undefined, `Upload failed: ${uploadResult.error}`);
        logger.warn('Upload failed, will retry upload in next cycle', { tweetId: tweet.id, error: uploadResult.error });
        return;
      }
      // Step 7: Increment user quota using author_id
      await quotaService.incrementUserQuota(mention.author_id);
      // Step 8: Update tweet processing status to completed
      await databaseService.updateTweetProcessingStatus(tweet.id, 'completed', uploadResult.id);
      // Step 9: Log successful usage
      await databaseService.logUsage({
        user_id: mention.author_id,
        tweet_id: tweet.id,
        event_type: 'success',
        arweave_id: uploadResult.id,
      });
      // Step 10: Reply with success message
      const authorUsername = tweet.author?.username || tweet.author.id;
      const requester = mention.author?.username || mention.author_id;
      await this.handleSuccess(mention, uploadResult.id, tweet.id, authorUsername, requester, screenshotResult.buffer);
      logger.info('Successfully processed mention', {
        mentionId: mention.id,
        tweetId: tweet.id,
        arweaveId: uploadResult.id,
        requester: mention.author_id,
      });
    } catch (error) {
      logger.error('Error processing mention', { mentionId: mention.id, error });
      await databaseService.updateTweetProcessingStatus(tweet.id, 'other_failed', undefined, 'An unexpected error occurred while processing your request');
      logger.warn('Unexpected error, will retry in next cycle', { tweetId: tweet.id, error });
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
    authorUsername: string,
    requester: string,
    screenshotBuffer: Buffer
  ): Promise<void> {
    try {
      const message = arweaveService.generateUploadMessage(arweaveId, tweetId, authorUsername, requester);
      
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

      const message = `Sorry${mention.author?.username && ` @${mention.author?.username}`}, you've reached your limit for today.

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
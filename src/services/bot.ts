import { TwitterMention, TwitterTweet, TwitterUser, BotResponse, QuotaCheck } from '../types';
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
    await twitterService.startPolling(async (mention) => {
      await this.processMention(mention);
    });

    logger.info('✅ Bot service started successfully');
  }

  /**
   * Process a single mention
   */
  async processMention(mention: TwitterMention): Promise<void> {
    if (this.isProcessing) {
      logger.info('Bot is already processing a mention, skipping', { mentionId: mention.id });
      return;
    }

    this.isProcessing = true;

    try {
      logger.info('Processing mention', { 
        mentionId: mention.id, 
        authorId: mention.author_id,
        text: mention.text
      });

      // Step 1: Extract the target tweet ID (parent tweet or referenced tweet)
      let targetTweetId = twitterService.extractParentTweetId(mention);
      if (!targetTweetId) {
        // Fallback: Try to extract from mention text (URL, quoted, ID, etc.)
        const parsed = TweetParser.parseMention(mention);
        targetTweetId = parsed.tweetId;
      }
      if (!targetTweetId) {
        logger.warn('No valid tweet reference found in mention', { mentionId: mention.id, text: mention.text });
        await this.handleInvalidRequest(mention, { tweetId: null, type: 'invalid', originalText: mention.text });
        return;
      }

      // Step 2: Check user quota using author_id
      const quotaCheck = await quotaService.checkUserQuota(mention.author_id);
      if (!quotaCheck.allowed) {
        await this.handleQuotaExceeded(mention, mention.author_id, quotaCheck);
        return;
      }

      // Step 3: Get the target tweet
      const tweet = await twitterService.getTweet(targetTweetId);
      if (!tweet) {
        await this.handleError(mention, 'Could not find the tweet to screenshot');
        return;
      }

      // Step 4: Check if tweet is public
      const isPublic = await twitterService.isPublicTweet(tweet);
      if (!isPublic) {
        await this.handleError(mention, 'Cannot screenshot private tweets');
        return;
      }

      // Step 5: Get tweet author (optional, only if needed for screenshot)
      const author = await twitterService.getUser(tweet.author_id);
      if (!author) {
        await this.handleError(mention, 'Could not get tweet author information');
        return;
      }

      // Step 6: Take screenshot
      const screenshotResult = await screenshotService.takeScreenshot(tweet, author, {
        width: 600,
        height: 400,
        quality: 80,
        format: 'jpeg',
      });

      if (!screenshotResult.success || !screenshotResult.buffer) {
        await this.handleError(mention, `Screenshot failed: ${screenshotResult.error}`);
        return;
      }

      // Step 7: Upload to Arweave
      const uploadResult = await arweaveService.uploadScreenshot(
        screenshotResult,
        tweet.id,
        author.username,
        tweet.text
      );

      if (!uploadResult.success || !uploadResult.id) {
        await this.handleError(mention, `Upload failed: ${uploadResult.error}`);
        return;
      }

      // Step 8: Increment user quota using author_id
      await quotaService.incrementUserQuota(mention.author_id);

      // Step 9: Log successful usage
      await databaseService.logUsage({
        user_id: mention.author_id,
        tweet_id: tweet.id,
        event_type: 'success',
        arweave_id: uploadResult.id,
      });

      // Step 10: Reply with success message
      await this.handleSuccess(mention, uploadResult.id, tweet.id, author.username);

      logger.info('Successfully processed mention', {
        mentionId: mention.id,
        tweetId: tweet.id,
        arweaveId: uploadResult.id,
        requester: mention.author_id,
      });

    } catch (error) {
      logger.error('Error processing mention', { mentionId: mention.id, error });
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
    authorUsername: string
  ): Promise<void> {
    try {
      const message = arweaveService.generateUploadMessage(arweaveId, tweetId, authorUsername);
      
      // Reply with the message
      const replySuccess = await twitterService.replyToTweet(mention.id, message);
      
      if (replySuccess) {
        logger.info('Success reply sent', { 
          mentionId: mention.id, 
          arweaveId,
          messageLength: message.length 
        });
      } else {
        logger.error('Failed to send success reply', { mentionId: mention.id });
      }
    } catch (error) {
      logger.error('Error sending success reply', { mentionId: mention.id, error });
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
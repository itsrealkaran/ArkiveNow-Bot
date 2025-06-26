import { TwitterApi } from 'twitter-api-v2';
import { twitterConfig, botConfig } from '../config';
import logger from '../utils/logger';
import { TwitterMention, TwitterTweet, TwitterUser } from '../types';

class TwitterService {
  private client: TwitterApi;
  private lastMentionId: string | null = null;
  private rateLimitReset: number = 0;
  private isRateLimited: boolean = false;
  private botUserId: string | null = null; // Cache for bot user ID

  constructor() {
    // Initialize Twitter client with user authentication
    this.client = new TwitterApi({
      appKey: twitterConfig.apiKey,
      appSecret: twitterConfig.apiSecret,
      accessToken: twitterConfig.accessToken,
      accessSecret: twitterConfig.accessSecret,
    });

    logger.info('Twitter client initialized', { botUsername: botConfig.username });
  }

  private async handleRateLimit(error: any): Promise<void> {
    if (error.code === 429) {
      this.isRateLimited = true;
      
      // Extract rate limit info from headers
      const resetTime = error.rateLimit?.reset || error.headers?.['x-rate-limit-reset'];
      if (resetTime) {
        this.rateLimitReset = parseInt(resetTime) * 1000; // Convert to milliseconds
        const waitTime = Math.max(this.rateLimitReset - Date.now(), 0);
        
        logger.warn('Rate limited by Twitter API', {
          resetTime: new Date(this.rateLimitReset).toISOString(),
          waitTimeMs: waitTime,
          limit: error.rateLimit?.limit,
          remaining: error.rateLimit?.remaining
        });

        // Wait for rate limit to reset
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime + 1000)); // Add 1 second buffer
        }
      } else {
        // Fallback: wait 15 minutes
        logger.warn('Rate limited but no reset time found, waiting 15 minutes');
        await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
      }
      
      this.isRateLimited = false;
    }
  }

  private async makeRateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if we're currently rate limited
        if (this.isRateLimited && Date.now() < this.rateLimitReset) {
          const waitTime = this.rateLimitReset - Date.now();
          logger.info('Waiting for rate limit to reset', { waitTimeMs: waitTime });
          await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
        }

        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        if (error.code === 429) {
          await this.handleRateLimit(error);
          continue; // Retry after handling rate limit
        }
        
        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      const me = await this.client.v2.me();
      
      if (me.data) {
        logger.info('Twitter credentials verified', { 
          userId: me.data.id, 
          username: me.data.username 
        });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to verify Twitter credentials', { error });
      return false;
    }
  }

  /**
   * Get and cache the bot user ID
   */
  private async getBotUserId(): Promise<string> {
    if (this.botUserId) {
      return this.botUserId;
    }
    const botUser = await this.client.v2.userByUsername(botConfig.username);
    if (!botUser.data) {
      logger.error('Could not find bot user', { username: botConfig.username });
      throw new Error('Could not find bot user');
    }
    this.botUserId = botUser.data.id;
    return this.botUserId;
  }

  async getMentions(): Promise<TwitterMention[]> {
    return this.makeRateLimitedRequest(async () => {
      // Use cached bot user ID
      const botUserId = await this.getBotUserId();
      logger.info('Getting mentions for bot user', { botUserId, botUsername: botConfig.username });

      const params: any = {
        max_results: 10,
        'tweet.fields': ['created_at', 'author_id', 'in_reply_to_user_id', 'referenced_tweets'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id', 'referenced_tweets.id'],
      };

      // Only add since_id if we have a last mention ID
      if (this.lastMentionId) {
        params.since_id = this.lastMentionId;
        logger.info('Using since_id filter', { since_id: this.lastMentionId });
      } else {
        logger.info('No since_id filter - getting all recent mentions');
      }

      logger.info('Making userMentionTimeline API call with params:', params);

      try {
        const mentions = await this.client.v2.userMentionTimeline(botUserId, params);
        console.log(mentions);
        
        logger.info('Raw API response received:', {
          hasData: !!mentions.data,
          dataType: typeof mentions.data,
          dataLength: Array.isArray(mentions.data) ? mentions.data.length : 'not array',
          includes: mentions.includes ? Object.keys(mentions.includes) : 'none',
          meta: mentions.meta || 'none',
          fullResponseKeys: Object.keys(mentions)
        });

        // Handle different possible response structures
        let mentionsData: any[] = [];
        
        if (mentions.data && Array.isArray(mentions.data)) {
          // Standard array format
          mentionsData = mentions.data;
        } else if (mentions.data && typeof mentions.data === 'object') {
          // Object format - might be paginated or nested
          logger.info('Data is object, checking structure:', mentions.data);
          const dataObj = mentions.data as any;
          if (dataObj.result && Array.isArray(dataObj.result)) {
            mentionsData = dataObj.result;
          } else if (dataObj.data && Array.isArray(dataObj.data)) {
            mentionsData = dataObj.data;
          } else {
            // Try to convert object to array if it has numeric keys
            const keys = Object.keys(mentions.data);
            if (keys.some(key => !isNaN(Number(key)))) {
              mentionsData = Object.values(mentions.data);
            }
          }
        } else if ((mentions as any).result && Array.isArray((mentions as any).result)) {
          // Direct result array
          mentionsData = (mentions as any).result;
        }

        logger.info('Processed mentions data:', {
          processedLength: mentionsData.length,
          isArray: Array.isArray(mentionsData),
          firstItem: mentionsData.length > 0 ? typeof mentionsData[0] : 'none'
        });

        if (mentionsData.length > 0) {
          // Update last mention ID for next poll
          this.lastMentionId = mentionsData[0].id;
          
          logger.info('Found new mentions', { 
            count: mentionsData.length,
            latestId: this.lastMentionId 
          });
        } else {
          logger.info('No mentions data in response or empty array');
        }

        return mentionsData;
      } catch (error) {
        logger.error('Error in userMentionTimeline API call:', {
          error: error instanceof Error ? error.message : error,
          botUserId,
          params
        });
        throw error;
      }
    });
  }

  async getTweet(tweetId: string): Promise<TwitterTweet | null> {
    return this.makeRateLimitedRequest(async () => {
      try {
        const tweet = await this.client.v2.singleTweet(tweetId, {
          'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
          'user.fields': ['username', 'name'],
          expansions: ['author_id'],
        });

        if (!tweet.data) {
          logger.warn('Tweet not found', { tweetId });
          return null;
        }

        // Ensure required fields are present
        if (!tweet.data.author_id) {
          logger.warn('Tweet missing author_id', { tweetId });
          return null;
        }

        const twitterTweet: TwitterTweet = {
          id: tweet.data.id,
          text: tweet.data.text,
          author_id: tweet.data.author_id,
          created_at: tweet.data.created_at || new Date().toISOString(),
        };

        // Add public_metrics only if it exists
        if (tweet.data.public_metrics) {
          twitterTweet.public_metrics = {
            retweet_count: tweet.data.public_metrics.retweet_count || 0,
            reply_count: tweet.data.public_metrics.reply_count || 0,
            like_count: tweet.data.public_metrics.like_count || 0,
            quote_count: tweet.data.public_metrics.quote_count || 0,
          };
        }

        logger.info('Retrieved tweet', { 
          tweetId, 
          authorId: twitterTweet.author_id,
          textLength: twitterTweet.text.length 
        });

        return twitterTweet;
      } catch (error) {
        logger.error('Failed to fetch tweet', { tweetId, error });
        return null;
      }
    });
  }

  async getUser(userId: string): Promise<TwitterUser | null> {
    return this.makeRateLimitedRequest(async () => {
      try {
        const user = await this.client.v2.user(userId, {
          'user.fields': ['username', 'name', 'profile_image_url'],
        });

        if (!user.data) {
          logger.warn('User not found', { userId });
          return null;
        }

        return user.data;
      } catch (error) {
        logger.error('Failed to fetch user', { userId, error });
        return null;
      }
    });
  }

  async replyToTweet(tweetId: string, text: string): Promise<boolean> {
    return this.makeRateLimitedRequest(async () => {
      try {
        const reply = await this.client.v2.reply(text, tweetId);
        
        logger.info('Replied to tweet', { 
          tweetId, 
          replyId: reply.data.id,
          textLength: text.length 
        });
        
        return true;
      } catch (error) {
        logger.error('Failed to reply to tweet', { tweetId, error });
        return false;
      }
    });
  }

  async replyWithMedia(tweetId: string, text: string, mediaPath: string): Promise<boolean> {
    try {
      // Upload media first
      const mediaId = await this.client.v1.uploadMedia(mediaPath);
      
      // Reply with media
      const reply = await this.client.v2.reply(text, tweetId, {
        media: { media_ids: [mediaId] },
      });
      
      logger.info('Replied to tweet with media', { 
        tweetId, 
        replyId: reply.data.id,
        mediaId,
        textLength: text.length 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to reply with media', { tweetId, mediaPath, error });
      return false;
    }
  }

  async isPublicTweet(tweet: TwitterTweet): Promise<boolean> {
    try {
      // Get the author of the tweet
      const author = await this.getUser(tweet.author_id);
      
      if (!author) {
        logger.warn('Could not determine tweet visibility - author not found', { 
          tweetId: tweet.id, 
          authorId: tweet.author_id 
        });
        return false;
      }

      // For now, we'll assume all tweets are public
      // In a more sophisticated implementation, you might check the user's protected status
      // or the tweet's visibility settings
      return true;
    } catch (error) {
      logger.error('Error checking tweet visibility', { tweetId: tweet.id, error });
      return false;
    }
  }

  extractTweetIdFromMention(mention: TwitterMention): string | null {
    try {
      // Look for tweet IDs in the mention text
      // Common patterns: URLs, quoted tweets, etc.
      
      // Check if this is a reply to another tweet
      if (mention.in_reply_to_user_id) {
        // This is a reply, we need to get the parent tweet
        return null; // We'll handle this in the bot logic
      }

      // Check for referenced tweets
      if (mention.referenced_tweets && mention.referenced_tweets.length > 0) {
        const quotedTweet = mention.referenced_tweets.find(ref => ref.type === 'quoted');
        if (quotedTweet) {
          return quotedTweet.id;
        }
      }

      // Look for tweet URLs in the text
      const tweetUrlMatch = mention.text.match(/https?:\/\/twitter\.com\/\w+\/status\/(\d+)/);
      if (tweetUrlMatch && tweetUrlMatch[1]) {
        return tweetUrlMatch[1];
      }

      // Look for just tweet IDs (18-19 digit numbers)
      const tweetIdMatch = mention.text.match(/\b(\d{18,19})\b/);
      if (tweetIdMatch && tweetIdMatch[1]) {
        return tweetIdMatch[1];
      }

      return null;
    } catch (error) {
      logger.error('Error extracting tweet ID from mention', { mentionId: mention.id, error });
      return null;
    }
  }

  async startPolling(callback: (mention: TwitterMention) => Promise<void>): Promise<void> {
    logger.info('Starting Twitter mention polling', { 
      interval: botConfig.pollingInterval,
      botUsername: botConfig.username 
    });

    const poll = async () => {
      try {
        const mentions = await this.getMentions();
        
        // Process mentions in reverse order (oldest first)
        for (const mention of mentions.reverse()) {
          await callback(mention);
        }
      } catch (error) {
        logger.error('Error in polling cycle', { error });
      }
    };

    // Initial poll
    await poll();

    // Set up interval
    setInterval(poll, botConfig.pollingInterval);
  }

  async stopPolling(): Promise<void> {
    logger.info('Stopping Twitter mention polling');
    // Note: setInterval doesn't have a direct stop method
    // In a production environment, you might want to use a proper scheduler
  }
}

// Export singleton instance
export const twitterService = new TwitterService();
export default twitterService; 
import { TwitterApi } from 'twitter-api-v2';
import { twitterConfig, botConfig } from '../config';
import logger from '../utils/logger';
import { TwitterMention, TwitterTweet, TwitterUser, TwitterMedia } from '../types';
import databaseService from './database';

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

  async getMentions(sinceTime?: Date): Promise<TwitterMention[]> {
    return this.makeRateLimitedRequest(async () => {
      // Use cached bot user ID
      const botUserId = await this.getBotUserId();
      logger.info('Getting mentions for bot user', { botUserId, botUsername: botConfig.username });

      const params: any = {
        max_results: 100,
        'tweet.fields': ['created_at', 'author_id', 'in_reply_to_user_id', 'referenced_tweets', 'public_metrics'],
        'user.fields': ['username', 'name', 'profile_image_url', 'verified', 'verified_type', 'connection_status'],
        expansions: ['author_id', 'referenced_tweets.id', 'referenced_tweets.id.author_id'],
      };

      // Get the latest tweet timestamp from database (if not provided)
      const latestTweetTime = sinceTime ? null : await databaseService.getLatestTweetTimestamp();
      const latestMentionTime = sinceTime ? null : await databaseService.getLatestMentionTimestamp();
      
      // Use the most recent timestamp between tweet creation and mention processing
      const effectiveSinceTime = sinceTime || (latestTweetTime && latestMentionTime 
        ? new Date(Math.max(new Date(latestTweetTime).getTime(), new Date(latestMentionTime).getTime()))
        : latestTweetTime 
          ? new Date(latestTweetTime)
          : latestMentionTime 
            ? new Date(latestMentionTime)
            : null);

      if (effectiveSinceTime) {
        // Add since_id if we have a last mention ID (fallback)
        if (this.lastMentionId) {
          params.since_id = this.lastMentionId;
          logger.info('Using since_id filter as fallback', { since_id: this.lastMentionId });
        } else {
          // Use start_time for more precise filtering
          params.start_time = effectiveSinceTime.toISOString();
          logger.info('Using start_time filter from database', { 
            start_time: params.start_time,
            latestTweetTime,
            latestMentionTime,
            providedSinceTime: sinceTime?.toISOString()
          });
        }
      } else {
        logger.info('No database timestamp found - getting all recent mentions');
      }

      logger.info('Making userMentionTimeline API call with params:', params);

      try {
        const mentions = await this.client.v2.userMentionTimeline(botUserId, params);
        // Extract mentions from paginator's _realData.data
        const mentionsData: any[] = (mentions as any)._realData?.data || [];
        const usersData: any[] = (mentions as any)._realData?.includes?.users || [];

        logger.info('Raw API response received:', {
          hasData: mentionsData.length > 0,
          processedLength: mentionsData.length,
          usersCount: usersData.length,
          isArray: Array.isArray(mentionsData),
          firstItem: mentionsData.length > 0 ? typeof mentionsData[0] : 'none',
          meta: (mentions as any)._realData?.meta || 'none',
          fullResponseKeys: Object.keys(mentions)
        });

        // Create a map of users for quick lookup
        const usersMap = new Map<string, TwitterUser>();
        usersData.forEach((user: any) => {
          usersMap.set(user.id, {
            id: user.id,
            username: user.username,
            name: user.name,
            profile_image_url: user.profile_image_url,
          });
        });

        // Map mentions with user information
        const mentionsWithUsers = mentionsData.map((mention: any) => {
          const author = usersMap.get(mention.author_id);
          const mentionData: TwitterMention = {
            id: mention.id,
            text: mention.text,
            author_id: mention.author_id,
            created_at: mention.created_at,
            in_reply_to_user_id: mention.in_reply_to_user_id,
            referenced_tweets: mention.referenced_tweets,
          };
          
          // Only add author if it exists
          if (author && author.id) {
            mentionData.author = author;
          }
          
          return mentionData;
        });

        if (mentionsWithUsers.length > 0) {
          // Update last mention ID for next poll
          const firstMention = mentionsWithUsers[0];
          if (firstMention && firstMention.id) {
            this.lastMentionId = firstMention.id;
          }
          logger.info('Found new mentions', { 
            count: mentionsWithUsers.length, 
            latestId: this.lastMentionId,
            usersWithInfo: mentionsWithUsers.filter(m => m.author).length
          });
        } else {
          logger.info('No mentions data in response or empty array');
        }

        return mentionsWithUsers;
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
          'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets', 'attachments'],
          'user.fields': ['username', 'name', 'profile_image_url', 'verified'],
          'media.fields': ['url', 'preview_image_url', 'type', 'width', 'height', 'alt_text'],
          expansions: [
            'author_id', 
            'attachments.media_keys', 
            'referenced_tweets.id',
            'referenced_tweets.id.author_id',
            'referenced_tweets.id.attachments.media_keys'
          ] as any,
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

        // Add author information if available
        if (tweet.includes?.users && tweet.includes.users.length > 0) {
          const user = tweet.includes.users[0];
          if (user && user.id === tweet.data.author_id) {
            const author: TwitterUser = {
              id: user.id,
              username: user.username,
              name: user.name,
            };
            
            // Only add profile_image_url if it exists
            if (user.profile_image_url) {
              author.profile_image_url = user.profile_image_url;
            }
            
            // Add verified status if available
            if (user.verified !== undefined) {
              author.verified = user.verified;
            }
            
            twitterTweet.author = author;
          }
        }

        // Add media information if available
        if (tweet.includes?.media && tweet.includes.media.length > 0) {
          const mediaData: any[] = tweet.includes.media;
          twitterTweet.media = mediaData.map((media: any) => ({
            media_key: media.media_key,
            type: media.type,
            url: media.url,
            preview_image_url: media.preview_image_url,
            width: media.width,
            height: media.height,
            alt_text: media.alt_text,
          }));
        }

        // Add referenced tweets information (for quoted tweets)
        if (tweet.data.referenced_tweets && tweet.data.referenced_tweets.length > 0) {
          twitterTweet.referenced_tweets = tweet.data.referenced_tweets;
        }

        // Add includes for quoted tweets
        if (tweet.includes) {
          twitterTweet.includes = {
            users: tweet.includes.users || [],
            media: (tweet.includes.media || []).map((media: any) => ({
              media_key: media.media_key,
              type: media.type as 'photo' | 'video' | 'animated_gif',
              url: media.url,
              preview_image_url: media.preview_image_url,
              width: media.width,
              height: media.height,
              alt_text: media.alt_text,
            })),
            tweets: (tweet.includes.tweets || []).map((tweetData: any) => {
              const mappedTweet: TwitterTweet = {
                id: tweetData.id,
                text: tweetData.text,
                author_id: tweetData.author_id || '',
                created_at: tweetData.created_at || new Date().toISOString(),
              };
              
              if (tweetData.public_metrics) {
                mappedTweet.public_metrics = {
                  retweet_count: tweetData.public_metrics.retweet_count || 0,
                  reply_count: tweetData.public_metrics.reply_count || 0,
                  like_count: tweetData.public_metrics.like_count || 0,
                  quote_count: tweetData.public_metrics.quote_count || 0,
                };
              }
              
              if (tweetData.author) {
                mappedTweet.author = tweetData.author;
              }
              
              if (tweetData.media) {
                mappedTweet.media = tweetData.media;
              }
              
              return mappedTweet;
            })
          };
        }

        logger.info('Retrieved tweet', { 
          tweetId, 
          authorId: twitterTweet.author_id,
          textLength: twitterTweet.text.length,
          hasAuthorInfo: !!twitterTweet.author,
          hasReferencedTweets: !!twitterTweet.referenced_tweets,
          hasIncludes: !!twitterTweet.includes,
          referencedTweetsCount: twitterTweet.referenced_tweets?.length || 0,
          includesUsersCount: twitterTweet.includes?.users?.length || 0,
          includesTweetsCount: twitterTweet.includes?.tweets?.length || 0,
          includesMediaCount: twitterTweet.includes?.media?.length || 0
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
    // For now, we'll assume all tweets are public
    // In a more sophisticated implementation, you might check the tweet's visibility settings if available in the tweet object
    return true;
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

  async startPolling(callback: (mentions: TwitterMention[]) => Promise<void>): Promise<void> {
    logger.info('Starting Twitter mention polling', { 
      interval: botConfig.pollingInterval,
      botUsername: botConfig.username 
    });

    const poll = async () => {
      try {
        const mentions = await this.getMentions();
        console.log('mentions:', mentions);
        for (const mention of mentions) {
            console.log('tweet:', mention.referenced_tweets);
        }
        // Pass all mentions at once for batch processing
        await callback(mentions.reverse());
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

  /**
   * Extract the parent tweet ID (the tweet being replied to) from a mention.
   */
  extractParentTweetId(mention: TwitterMention): string | null {
    if (mention.referenced_tweets && Array.isArray(mention.referenced_tweets)) {
      const repliedTo = mention.referenced_tweets.find(ref => ref.type === 'replied_to');
      return repliedTo ? repliedTo.id : null;
    }
    return null;
  }

  /**
   * Batch fetch tweets by IDs (up to 100 per request)
   */
  async getTweetsByIds(tweetIds: string[]): Promise<TwitterTweet[]> {
    if (!tweetIds.length) return [];
    return this.makeRateLimitedRequest(async () => {
      try {
        const response = await this.client.v2.tweets(tweetIds, {
          'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'entities', 'referenced_tweets', 'attachments'],
          'user.fields': ['username', 'name', 'profile_image_url', 'verified', 'verified_type'],
          'media.fields': ['url', 'preview_image_url', 'type', 'width', 'height', 'alt_text'],
          expansions: ['author_id', 'attachments.media_keys', 'referenced_tweets.id'],
        });
        // response.includes?.media is an array (not an object), so console.log will work and print the array or undefined.
        if (Array.isArray(response.includes?.media)) {
          console.log("fetched tweet media array, length:", response.includes.media.length, response.includes.media);
        } else {
          console.log("fetched tweet media is not an array:", response.includes?.media);
        }
        logger.info('Batch tweet fetch response', { tweetIds, response: response.data });
        if (!response.data) return [];
        
        // Extract users data
        const usersData: any[] = response.includes?.users || [];
        const usersMap = new Map<string, TwitterUser>();
        
        usersData.forEach((user: any) => {
          usersMap.set(user.id, {
            id: user.id,
            username: user.username,
            name: user.name,
            profile_image_url: user.profile_image_url,
            verified: user.verified,
            verified_type: user.verified_type,
          });
        });
        
        // Extract media data
        const mediaData: any[] = response.includes?.media || [];
        const mediaMap = new Map<string, TwitterMedia>();
        
        mediaData.forEach((media: any) => {
          mediaMap.set(media.media_key, {
            media_key: media.media_key,
            type: media.type,
            url: media.url,
            preview_image_url: media.preview_image_url,
            width: media.width,
            height: media.height,
            alt_text: media.alt_text,
          });
        });
        
        return response.data.map((tweet: any) => {
          const metrics = tweet.public_metrics || {};
          const author = usersMap.get(tweet.author_id);
          
          const twitterTweet: TwitterTweet = {
            id: tweet.id,
            text: tweet.text,
            author_id: tweet.author_id,
            created_at: tweet.created_at || new Date().toISOString(),
            public_metrics: {
              retweet_count: typeof metrics.retweet_count === 'number' ? metrics.retweet_count : 0,
              reply_count: typeof metrics.reply_count === 'number' ? metrics.reply_count : 0,
              like_count: typeof metrics.like_count === 'number' ? metrics.like_count : 0,
              quote_count: typeof metrics.quote_count === 'number' ? metrics.quote_count : 0,
            },
          };
          
          // Only add author if it exists
          if (author && author.id) {
            twitterTweet.author = author;
          }
          
          // Add media if available
          if (tweet.attachments?.media_keys && mediaMap.size > 0) {
            const mediaKeys = tweet.attachments.media_keys;
            twitterTweet.media = mediaKeys
              .map((key: string) => mediaMap.get(key))
              .filter((media: TwitterMedia | undefined): media is TwitterMedia => media !== undefined);
          }
          
          return twitterTweet;
        });
      } catch (error) {
        logger.error('Failed to batch fetch tweets', { tweetIds, error });
        return [];
      }
    });
  }
}

// Export singleton instance
export const twitterService = new TwitterService();
export default twitterService; 
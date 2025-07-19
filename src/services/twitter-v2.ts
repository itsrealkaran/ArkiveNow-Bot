import { botConfig } from '../config';
import logger from '../utils/logger';
import { TwitterMention, TwitterTweet, TwitterUser, TwitterMedia } from '../types';
import databaseService from './database';
import apiManager from './api-manager';

class TwitterService {
  private bearerToken: string | null = null;
  private lastMentionId: string | null = null;
  private rateLimitReset: number = 0;
  private isRateLimited: boolean = false;
  private botUserId: string | null = null; // Cache for bot user ID

  constructor() {
    logger.info('Twitter service initialized with API manager', { botUsername: botConfig.username });
  }

  private async constructBearerToken(useDynamicApi: boolean = false): Promise<string> {
    if (useDynamicApi) {
      // Get available API configuration for dynamic selection
      const apiConfig = await apiManager.getAvailableApi();
      if (!apiConfig) {
        throw new Error('No available API configuration found');
      }
      
      // Use the Bearer token from the selected API configuration
      return apiConfig.apiTokens.TWITTER_BEARER_TOKEN;
    } else {
      // Use default API configuration from environment
      const { twitterConfig } = await import('../config');
      return twitterConfig.bearerToken;
    }
  }

  private async handleRateLimit(error: any): Promise<void> {
    if (error.status === 429) {
      this.isRateLimited = true;
      
      // Extract rate limit info from headers
      const resetTime = error.headers?.['x-rate-limit-reset'];
      if (resetTime) {
        this.rateLimitReset = parseInt(resetTime) * 1000; // Convert to milliseconds
        const waitTime = Math.max(this.rateLimitReset - Date.now(), 0);
        
        logger.warn('Rate limited by Twitter API', {
          resetTime: new Date(this.rateLimitReset).toISOString(),
          waitTimeMs: waitTime,
          limit: error.headers?.['x-rate-limit-limit'],
          remaining: error.headers?.['x-rate-limit-remaining']
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

  private async makeRateLimitedRequest<T>(requestFn: () => Promise<T>, requestCount: number = 1): Promise<T> {
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

        // Get fresh bearer token for each request
        this.bearerToken = await this.constructBearerToken();
        
        const result = await requestFn();
        
        // Increment request count based on the number of requests made
        await apiManager.incrementRequests(requestCount);
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        if (error.status === 429) {
          await this.handleRateLimit(error);
          continue; // Retry after handling rate limit
        }
        
        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  private async makeDefaultRequest<T>(requestFn: () => Promise<T>): Promise<T> {
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

        // Get fresh bearer token for each request (using default config)
        this.bearerToken = await this.constructBearerToken(false);
        
        const result = await requestFn();
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        if (error.status === 429) {
          await this.handleRateLimit(error);
          continue; // Retry after handling rate limit
        }
        
        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  private async makeTwitterRequest(endpoint: string, options: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<any> {
    const baseUrl = 'https://api.twitter.com/2';
    const url = `${baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Authorization': `Bearer ${this.bearerToken}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: any = {
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const error = new Error(`Twitter API error: ${response.status} ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).headers = Object.fromEntries(response.headers.entries());
      throw error;
    }

    return await response.json();
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      const response = await this.makeDefaultRequest(() => this.makeTwitterRequest('/users/me'));
      
      if (response.data) {
        logger.info('Twitter credentials verified', { 
          userId: response.data.id, 
          username: response.data.username 
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
    
    const response = await this.makeDefaultRequest(() => 
      this.makeTwitterRequest(`/users/by/username/${botConfig.username}`)
    );
    if (!response.data || !response.data.id) {
      logger.error('Could not find bot user', { username: botConfig.username });
      throw new Error('Could not find bot user');
    }
    const userId = response.data.id;
    this.botUserId = userId;
    return userId;
  }

  async getMentions(sinceTime?: Date): Promise<TwitterMention[]> {
    return this.makeDefaultRequest(async () => {
      // Use cached bot user ID
      const botUserId = await this.getBotUserId();
      logger.info('Getting mentions for bot user', { botUserId, botUsername: botConfig.username });

      const params = new URLSearchParams({
        'max_results': '100',
        'tweet.fields': 'created_at,author_id,in_reply_to_user_id,referenced_tweets,public_metrics',
        'user.fields': 'username,name,profile_image_url,verified,verified_type,connection_status',
        'expansions': 'author_id,referenced_tweets.id,referenced_tweets.id.author_id',
      });

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
          params.append('since_id', this.lastMentionId);
          logger.info('Using since_id filter as fallback', { since_id: this.lastMentionId });
        } else {
          // Use start_time for more precise filtering
          params.append('start_time', effectiveSinceTime.toISOString());
          logger.info('Using start_time filter from database', { 
            start_time: effectiveSinceTime.toISOString(),
            latestTweetTime,
            latestMentionTime,
            providedSinceTime: sinceTime?.toISOString()
          });
        }
      } else {
        logger.info('No database timestamp found - getting all recent mentions');
      }

      logger.info('Making userMentionTimeline API call with params:', Object.fromEntries(params));

      try {
        const response = await this.makeTwitterRequest(`/users/${botUserId}/mentions?${params.toString()}`);
        const mentionsData: any[] = response.data || [];
        const usersData: any[] = response.includes?.users || [];

        logger.info('Raw API response received:', {
          hasData: mentionsData.length > 0,
          processedLength: mentionsData.length,
          usersCount: usersData.length,
          isArray: Array.isArray(mentionsData),
          firstItem: mentionsData.length > 0 ? typeof mentionsData[0] : 'none',
          meta: response.meta || 'none',
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
          params: Object.fromEntries(params)
        });
        throw error;
      }
    });
  }

  async getTweet(tweetId: string): Promise<TwitterTweet | null> {
    return this.makeDefaultRequest(async () => {
      try {
        const params = new URLSearchParams({
          'tweet.fields': 'created_at,author_id,public_metrics,referenced_tweets,attachments',
          'user.fields': 'username,name,profile_image_url,verified,verified_type,affiliation,entities',
          'media.fields': 'url,preview_image_url,type,width,height,alt_text',
          'poll.fields': 'duration_minutes,end_datetime,options,voting_status',
          'expansions': 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys',
        });

        const response = await this.makeTwitterRequest(`/tweets/${tweetId}?${params.toString()}`);

        if (!response.data) {
          logger.warn('Tweet not found', { tweetId });
          return null;
        }

        // Ensure required fields are present
        if (!response.data.author_id) {
          logger.warn('Tweet missing author_id', { tweetId });
          return null;
        }

        const twitterTweet: TwitterTweet = {
          id: response.data.id,
          text: response.data.text,
          author_id: response.data.author_id,
          created_at: response.data.created_at || new Date().toISOString(),
        };

        // Add public_metrics only if it exists
        if (response.data.public_metrics) {
          twitterTweet.public_metrics = {
            retweet_count: response.data.public_metrics.retweet_count || 0,
            reply_count: response.data.public_metrics.reply_count || 0,
            like_count: response.data.public_metrics.like_count || 0,
            quote_count: response.data.public_metrics.quote_count || 0,
          };
        }

        // Add author information if available
        if (response.includes?.users && response.includes.users.length > 0) {
          const user = response.includes.users[0];
          if (user && user.id === response.data.author_id) {
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
        if (response.includes?.media && response.includes.media.length > 0) {
          const mediaData: any[] = response.includes.media;
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
        if (response.data.referenced_tweets && response.data.referenced_tweets.length > 0) {
          twitterTweet.referenced_tweets = response.data.referenced_tweets;
        }

        // Add includes for quoted tweets
        if (response.includes) {
          twitterTweet.includes = {
            users: response.includes.users || [],
            media: (response.includes.media || []).map((media: any) => ({
              media_key: media.media_key,
              type: media.type as 'photo' | 'video' | 'animated_gif',
              url: media.url,
              preview_image_url: media.preview_image_url,
              width: media.width,
              height: media.height,
              alt_text: media.alt_text,
            })),
            tweets: (response.includes.tweets || []).map((tweetData: any) => {
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
    return this.makeDefaultRequest(async () => {
      try {
        const params = new URLSearchParams({
          'user.fields': 'username,name,profile_image_url',
        });

        const response = await this.makeTwitterRequest(`/users/${userId}?${params.toString()}`);

        if (!response.data) {
          logger.warn('User not found', { userId });
          return null;
        }

        return response.data;
      } catch (error) {
        logger.error('Failed to fetch user', { userId, error });
        return null;
      }
    });
  }

  async replyToTweet(tweetId: string, text: string): Promise<boolean> {
    return this.makeDefaultRequest(async () => {
      try {
        const response = await this.makeTwitterRequest('/tweets', {
          method: 'POST',
          body: JSON.stringify({
            text: text,
            reply: {
              in_reply_to_tweet_id: tweetId
            }
          })
        });
        
        logger.info('Replied to tweet', { 
          tweetId, 
          replyId: response.data.id,
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
      // For media upload, we need to use v1.1 endpoint
      const mediaResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify({
          media_category: 'tweet_image',
          media_data: Buffer.from(mediaPath).toString('base64')
        })
      });

      if (!mediaResponse.ok) {
        throw new Error(`Media upload failed: ${mediaResponse.statusText}`);
      }

      const mediaData = await mediaResponse.json() as any;
      const mediaId = mediaData.media_id_string;
      
      // Reply with media
      const response = await this.makeTwitterRequest('/tweets', {
        method: 'POST',
        body: JSON.stringify({
          text: text,
          reply: {
            in_reply_to_tweet_id: tweetId
          },
          media: {
            media_ids: [mediaId]
          }
        })
      });
      
      logger.info('Replied to tweet with media', { 
        tweetId, 
        replyId: response.data.id,
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
    
    // Calculate how many API requests we'll need
    const requestsNeeded = Math.ceil(tweetIds.length / 100);
    
    return this.makeRateLimitedRequest(async () => {
      // Use dynamic API selection for this method
      this.bearerToken = await this.constructBearerToken(true);
      
      try {
        const params = new URLSearchParams({
          'user.fields': 'username,name,profile_image_url,verified,verified_type,affiliation,entities',
          'media.fields': 'url,preview_image_url,type,width,height,alt_text',
          'poll.fields': 'id,duration_minutes,end_datetime,options,voting_status',
          'expansions': 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys',
          'tweet.fields': 'created_at,author_id,public_metrics,entities,referenced_tweets,attachments',
          'ids': tweetIds.join(',')
        });

        const response = await this.makeTwitterRequest(`/tweets?${params.toString()}`);
        
        if (Array.isArray(response.includes?.media)) {
          console.log("fetched tweet media array, length:", response.includes.media.length, response.includes.media);
        } else {
          console.log("fetched tweet media is not an array:", response.includes?.media);
        }
        
        logger.info('Batch tweet fetch response', { 
          tweetIds, 
          response: response,
          requestsNeeded,
          tweetCount: tweetIds.length
        });
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
    }, requestsNeeded);
  }
}

// Export singleton instance
export const twitterService = new TwitterService();
export default twitterService; 
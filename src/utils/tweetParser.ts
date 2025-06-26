import { TwitterMention } from '../types';
import logger from './logger';

export interface ParsedMention {
  tweetId: string | null;
  type: 'url' | 'quoted' | 'reply' | 'id_only' | 'invalid';
  originalText: string;
  extractedId?: string;
}

export class TweetParser {
  /**
   * Parse a mention to extract the target tweet ID
   */
  static parseMention(mention: TwitterMention): ParsedMention {
    const text = mention.text;
    
    try {
      // 1. Check for quoted tweets (most reliable)
      if (mention.referenced_tweets && mention.referenced_tweets.length > 0) {
        const quotedTweet = mention.referenced_tweets.find(ref => ref.type === 'quoted');
        if (quotedTweet) {
          logger.info('Found quoted tweet reference', { 
            mentionId: mention.id, 
            quotedTweetId: quotedTweet.id 
          });
          return {
            tweetId: quotedTweet.id,
            type: 'quoted',
            originalText: text,
            extractedId: quotedTweet.id,
          };
        }
      }

      // 2. Check for reply to a tweet
      if (mention.in_reply_to_user_id) {
        // This is a reply, we need to get the parent tweet ID
        // For now, we'll look for tweet IDs in the text
        const tweetIdMatch = text.match(/\b(\d{18,19})\b/);
        if (tweetIdMatch && tweetIdMatch[1]) {
          logger.info('Found tweet ID in reply', { 
            mentionId: mention.id, 
            tweetId: tweetIdMatch[1] 
          });
          return {
            tweetId: tweetIdMatch[1],
            type: 'reply',
            originalText: text,
            extractedId: tweetIdMatch[1],
          };
        }
      }

      // 3. Look for Twitter URLs
      const urlPatterns = [
        /https?:\/\/twitter\.com\/\w+\/status\/(\d+)/,
        /https?:\/\/x\.com\/\w+\/status\/(\d+)/,
        /https?:\/\/t\.co\/\w+/,
      ];

      for (const pattern of urlPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const tweetId = match[1];
          if (this.isValidTweetId(tweetId)) {
            logger.info('Found tweet URL', { 
              mentionId: mention.id, 
              tweetId,
              url: match[0] 
            });
            return {
              tweetId,
              type: 'url',
              originalText: text,
              extractedId: tweetId,
            };
          }
        }
      }

      // 4. Look for standalone tweet IDs (18-19 digit numbers)
      const tweetIdMatch = text.match(/\b(\d{18,19})\b/);
      if (tweetIdMatch && tweetIdMatch[1] && this.isValidTweetId(tweetIdMatch[1])) {
        logger.info('Found standalone tweet ID', { 
          mentionId: mention.id, 
          tweetId: tweetIdMatch[1] 
        });
        return {
          tweetId: tweetIdMatch[1],
          type: 'id_only',
          originalText: text,
          extractedId: tweetIdMatch[1],
        };
      }

      // 5. No valid tweet reference found
      logger.warn('No valid tweet reference found in mention', { 
        mentionId: mention.id, 
        text: text.substring(0, 100) + '...' 
      });
      
      return {
        tweetId: null,
        type: 'invalid',
        originalText: text,
      };

    } catch (error) {
      logger.error('Error parsing mention', { mentionId: mention.id, error });
      return {
        tweetId: null,
        type: 'invalid',
        originalText: text,
      };
    }
  }

  /**
   * Validate if a string is a valid tweet ID
   */
  static isValidTweetId(id: string): boolean {
    // Twitter tweet IDs are typically 18-19 digits
    return /^\d{18,19}$/.test(id);
  }

  /**
   * Extract tweet ID from a Twitter URL
   */
  static extractTweetIdFromUrl(url: string): string | null {
    const patterns = [
      /https?:\/\/twitter\.com\/\w+\/status\/(\d+)/,
      /https?:\/\/x\.com\/\w+\/status\/(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1] && this.isValidTweetId(match[1])) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if a mention is a valid request for screenshot
   */
  static isValidScreenshotRequest(mention: TwitterMention): boolean {
    // Check if we can extract a tweet ID
    const parsed = this.parseMention(mention);
    if (!parsed.tweetId) {
      logger.info('No valid tweet ID found in screenshot request', { 
        mentionId: mention.id 
      });
      return false;
    }

    return true;
  }

  /**
   * Generate a user-friendly error message for invalid requests
   */
  static getErrorMessage(parsed: ParsedMention): string {
    switch (parsed.type) {
      case 'invalid':
        return "I couldn't find a valid tweet to screenshot. Please mention me with a tweet URL or ID and include 'screenshot' in your message.";
      
      case 'reply':
        return "I found a tweet ID in your reply, but please make sure to include 'screenshot' in your message so I know what you want me to do.";
      
      default:
        return "Please include 'screenshot' in your message so I know what you want me to do.";
    }
  }

  /**
   * Clean and format tweet text for logging
   */
  static cleanTweetText(text: string, maxLength: number = 100): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  }
} 
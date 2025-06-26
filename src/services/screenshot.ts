import puppeteer, { Browser, Page } from 'puppeteer';
import sharp from 'sharp';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ScreenshotResult, ScreenshotOptions, TwitterTweet, TwitterUser } from '../types';
import { botConfig } from '../config';
import logger from '../utils/logger';

class ScreenshotService {
  private browser: Browser | null = null;

  constructor() {
    logger.info('Screenshot service initialized');
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      logger.info('✅ Puppeteer browser initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Puppeteer browser', { error });
      throw error;
    }
  }

  async takeScreenshot(
    tweet: TwitterTweet,
    author: TwitterUser,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    if (!this.browser) {
      return { success: false, error: 'Browser not initialized' };
    }

    let page: Page | null = null;

    try {
      page = await this.browser.newPage();
      
      // Set viewport
      const width = options.width || 600;
      const height = options.height || 400;
      await page.setViewport({ width, height });

      // Generate HTML for the tweet
      const html = this.generateTweetHTML(tweet);
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        omitBackground: false,
      });

      // Compress and optimize the image
      const compressedBuffer = await this.compressImage(screenshot as Buffer, options);

      // Check file size
      const fileSizeKB = compressedBuffer.length / 1024;
      if (fileSizeKB > botConfig.maxImageSizeKB) {
        logger.warn('Screenshot too large, attempting further compression', {
          originalSize: fileSizeKB,
          maxSize: botConfig.maxImageSizeKB,
        });
        
        // Try more aggressive compression
        const furtherCompressed = await this.compressImage(compressedBuffer, {
          ...options,
          quality: Math.max(50, (options.quality || 80) - 20),
        });
        
        const newSizeKB = furtherCompressed.length / 1024;
        if (newSizeKB <= botConfig.maxImageSizeKB) {
          logger.info('Successfully compressed image to acceptable size', {
            finalSize: newSizeKB,
          });
          return { success: true, buffer: furtherCompressed };
        } else {
          return { 
            success: false, 
            error: `Image too large even after compression: ${newSizeKB}KB > ${botConfig.maxImageSizeKB}KB` 
          };
        }
      }

      logger.info('Screenshot taken successfully', {
        tweetId: tweet.id,
        fileSize: fileSizeKB.toFixed(2) + 'KB',
        dimensions: `${width}x${height}`,
      });

      return { success: true, buffer: compressedBuffer };

    } catch (error) {
      logger.error('Failed to take screenshot', { tweetId: tweet.id, error });
      return { success: false, error: error instanceof Error ? error.message : 'Screenshot failed' };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private generateTweetHTML(tweet: TwitterTweet): string {
    const displayName = tweet.author_id;
    const tweetText = this.escapeHtml(tweet.text);
    const tweetDate = new Date(tweet.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tweet Screenshot</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f1419;
            line-height: 1.4;
            padding: 20px;
          }
          
          .tweet-container {
            max-width: 600px;
            border: 1px solid #e1e8ed;
            border-radius: 12px;
            padding: 16px;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          
          .tweet-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
          }
          
          .profile-image {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 12px;
            object-fit: cover;
          }
          
          .user-info {
            flex: 1;
          }
          
          .display-name {
            font-weight: 700;
            font-size: 15px;
            color: #0f1419;
            margin-bottom: 2px;
          }
          
          .username {
            font-size: 14px;
            color: #536471;
          }
          
          .tweet-content {
            font-size: 15px;
            line-height: 1.5;
            margin-bottom: 12px;
            word-wrap: break-word;
          }
          
          .tweet-meta {
            display: flex;
            align-items: center;
            color: #536471;
            font-size: 14px;
          }
          
          .tweet-date {
            margin-right: 12px;
          }
          
          .tweet-id {
            font-family: monospace;
            font-size: 12px;
            opacity: 0.7;
          }
          
          .metrics {
            display: flex;
            gap: 16px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #e1e8ed;
            font-size: 13px;
            color: #536471;
          }
          
          .metric {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          
          .metric-value {
            font-weight: 500;
            color: #0f1419;
          }
        </style>
      </head>
      <body>
        <div class="tweet-container">
          <div class="tweet-header">
            <div class="user-info">
              <div class="display-name">${this.escapeHtml(displayName)}</div>
            </div>
          </div>
          <div class="tweet-content">${tweetText}</div>
          <div class="tweet-meta">
            <span class="tweet-date">${tweetDate}</span>
            <span class="tweet-id">ID: ${tweet.id}</span>
          </div>
          ${tweet.public_metrics ? `
            <div class="metrics">
              <div class="metric">
                <span class="metric-value">${tweet.public_metrics.retweet_count}</span>
                <span>Retweets</span>
              </div>
              <div class="metric">
                <span class="metric-value">${tweet.public_metrics.reply_count}</span>
                <span>Replies</span>
              </div>
              <div class="metric">
                <span class="metric-value">${tweet.public_metrics.like_count}</span>
                <span>Likes</span>
              </div>
              <div class="metric">
                <span class="metric-value">${tweet.public_metrics.quote_count}</span>
                <span>Quotes</span>
              </div>
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }

  private async compressImage(buffer: Buffer, options: ScreenshotOptions): Promise<Buffer> {
    const quality = options.quality || 80;
    const format = options.format || 'jpeg';

    try {
      let sharpInstance = sharp(buffer);

      // Resize if needed
      if (options.width || options.height) {
        sharpInstance = sharpInstance.resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Compress based on format
      switch (format) {
        case 'jpeg':
          return await sharpInstance.jpeg({ quality }).toBuffer();
        case 'png':
          return await sharpInstance.png({ quality }).toBuffer();
        case 'webp':
          return await sharpInstance.webp({ quality }).toBuffer();
        default:
          return await sharpInstance.jpeg({ quality }).toBuffer();
      }
    } catch (error) {
      logger.error('Failed to compress image', { error });
      return buffer; // Return original if compression fails
    }
  }

  private escapeHtml(text: string): string {
    // Simple HTML escaping for Node.js environment
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async saveScreenshot(buffer: Buffer, filename: string): Promise<string> {
    const tempPath = join(tmpdir(), filename);
    await writeFile(tempPath, buffer);
    logger.info('Screenshot saved to temp file', { tempPath, size: buffer.length });
    return tempPath;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Screenshot service browser closed');
    }
  }

  async checkBrowserHealth(): Promise<boolean> {
    try {
      if (!this.browser) {
        return false;
      }

      // Try to create a new page to test browser health
      const page = await this.browser.newPage();
      await page.close();
      
      return true;
    } catch (error) {
      logger.error('Browser health check failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
export default screenshotService; 
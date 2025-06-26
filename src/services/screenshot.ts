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
          body {
            background: #f4f6fb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .tweet-card {
            background: #fff;
            border-radius: 18px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.07), 0 1.5px 4px rgba(0,0,0,0.03);
            max-width: 520px;
            width: 100%;
            padding: 32px 28px 24px 28px;
            display: flex;
            flex-direction: column;
            position: relative;
          }
          .tweet-author {
            font-weight: 700;
            font-size: 1.1rem;
            color: #1a1a1a;
            margin-bottom: 8px;
            letter-spacing: 0.01em;
          }
          .tweet-text {
            font-size: 1.35rem;
            color: #222;
            margin-bottom: 18px;
            line-height: 1.6;
            word-break: break-word;
          }
          .tweet-date {
            color: #8a99a8;
            font-size: 0.98rem;
            margin-bottom: 8px;
          }
          .tweet-id {
            color: #c0c7d1;
            font-size: 0.85rem;
            margin-bottom: 8px;
          }
          .badge {
            position: absolute;
            bottom: 12px;
            right: 18px;
            background: #e6f0fa;
            color: #1a7fd7;
            font-size: 0.92rem;
            padding: 3px 12px;
            border-radius: 12px;
            font-weight: 600;
            letter-spacing: 0.03em;
            box-shadow: 0 1px 3px rgba(26,127,215,0.07);
          }
        </style>
      </head>
      <body>
        <div class="tweet-card">
          <div class="tweet-author">${this.escapeHtml(displayName)}</div>
          <div class="tweet-text">${tweetText}</div>
          <div class="tweet-date">${tweetDate}</div>
          <div class="tweet-id">ID: ${tweet.id}</div>
          <div class="badge">PermaSnap</div>
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
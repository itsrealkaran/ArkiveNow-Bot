import { createCanvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { ScreenshotResult, ScreenshotOptions, TwitterTweet } from '../types';
import { botConfig } from '../config';
import logger from '../utils/logger';

// Add type declaration for roundRect if it doesn't exist
declare global {
  interface CanvasRenderingContext2D {
    roundRect(x: number, y: number, width: number, height: number, radius: number): void;
  }
}

class ScreenshotService {
  constructor() {
    logger.info('Screenshot service initialized');
  }

  async initialize(): Promise<void> {
    try {
      // Register fonts if needed (optional)
      // registerFont('path/to/font.ttf', { family: 'CustomFont' });
      logger.info('✅ Canvas-based screenshot service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize screenshot service', { error });
      throw error;
    }
  }

  async takeScreenshot(
    tweet: TwitterTweet,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    try {
      const width = options.width || 600;
      const height = options.height || 400;

      // Create canvas
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Draw tweet card
      this.drawTweetCard(ctx, tweet, width, height);

      // Get image buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });

      // Check file size
      const fileSizeKB = buffer.length / 1024;
      if (fileSizeKB > botConfig.maxImageSizeKB) {
        logger.warn('Image too large, attempting compression', {
          originalSize: fileSizeKB,
          maxSize: botConfig.maxImageSizeKB,
        });
        
        // Try with lower quality
        const compressedBuffer = canvas.toBuffer('image/jpeg', { 
          quality: Math.max(0.5, 0.9 - (fileSizeKB - botConfig.maxImageSizeKB) / 100) 
        });
        
        const newSizeKB = compressedBuffer.length / 1024;
        if (newSizeKB <= botConfig.maxImageSizeKB) {
          logger.info('Successfully compressed image', { finalSize: newSizeKB });
          return { success: true, buffer: compressedBuffer };
        } else {
          return { 
            success: false, 
            error: `Image too large even after compression: ${newSizeKB}KB > ${botConfig.maxImageSizeKB}KB` 
          };
        }
      }

      logger.info('Tweet image generated successfully', {
        tweetId: tweet.id,
        fileSize: fileSizeKB.toFixed(2) + 'KB',
        dimensions: `${width}x${height}`,
      });

      return { success: true, buffer };

    } catch (error) {
      logger.error('Failed to generate tweet image', { tweetId: tweet.id, error });
      return { success: false, error: error instanceof Error ? error.message : 'Image generation failed' };
    }
  }

  private drawTweetCard(ctx: CanvasRenderingContext2D, tweet: TwitterTweet, width: number, height: number): void {
    // Background
    ctx.fillStyle = '#f4f6fb';
    ctx.fillRect(0, 0, width, height);

    // Card background
    const cardWidth = width * 0.85;
    const cardHeight = height * 0.8;
    const cardX = (width - cardWidth) / 2;
    const cardY = (height - cardHeight) / 2;

    // Card shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Card background with rounded corners
    ctx.fillStyle = '#ffffff';
    this.drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 18);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Padding
    const padding = 24;
    const contentX = cardX + padding;
    const contentY = cardY + padding;
    const contentWidth = cardWidth - (padding * 2);

    // Author name
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(tweet.author_id, contentX, contentY + 20);

    // Tweet text
    ctx.fillStyle = '#222222';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    const words = tweet.text.split(' ');
    let line = '';
    let y = contentY + 50;
    const maxWidth = contentWidth - 20;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line, contentX, y);
        line = word + ' ';
        y += 24;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, contentX, y);

    // Date
    const tweetDate = new Date(tweet.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    
    ctx.fillStyle = '#8a99a8';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(tweetDate, contentX, y + 30);

    // Tweet ID
    ctx.fillStyle = '#c0c7d1';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`ID: ${tweet.id}`, contentX, y + 50);

    // PermaSnap badge
    const badgeX = cardX + cardWidth - padding - 80;
    const badgeY = cardY + cardHeight - padding - 30;
    
    ctx.fillStyle = '#e6f0fa';
    this.drawRoundedRect(ctx, badgeX, badgeY, 80, 24, 12);
    ctx.fill();
    
    ctx.fillStyle = '#1a7fd7';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PermaSnap', badgeX + 40, badgeY + 16);
    ctx.textAlign = 'left';
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  async saveScreenshot(buffer: Buffer, filename: string): Promise<string> {
    const { writeFile } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const tempPath = join(tmpdir(), filename);
    await writeFile(tempPath, buffer);
    logger.info('Screenshot saved to temp file', { tempPath, size: buffer.length });
    return tempPath;
  }

  async cleanup(): Promise<void> {
    // No browser cleanup needed with canvas
    logger.info('Screenshot service cleanup completed');
  }

  async checkBrowserHealth(): Promise<boolean> {
    // Canvas doesn't need health checks like a browser
    return true;
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
export default screenshotService; 
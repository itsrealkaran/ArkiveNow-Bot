import { createCanvas, CanvasRenderingContext2D, loadImage } from 'canvas';
import { ScreenshotResult, ScreenshotOptions, TwitterTweet } from '../types';
import { botConfig } from '../config';
import logger from '../utils/logger';

interface TweetDimensions {
  width: number;
  height: number;
  textHeight: number;
  mediaHeight: number;
}

interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width: number;
  height: number;
}

class ScreenshotService {
  private readonly CARD_WIDTH = 612;
  private readonly PADDING = 16;
  private readonly AVATAR_SIZE = 48;
  private readonly MEDIA_MAX_WIDTH = 520;
  private readonly MEDIA_MAX_HEIGHT = 300;

  constructor() {
    logger.info('Screenshot service initialized');
  }

  async initialize(): Promise<void> {
    try {
      logger.info('✅ Modern X tweet screenshot service initialized successfully');
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
      // Calculate dynamic dimensions based on content
      const dimensions = this.calculateTweetDimensions(tweet);
      
      // Create canvas with exact content dimensions
      const canvas = createCanvas(dimensions.width, dimensions.height);
      const ctx = canvas.getContext('2d');

      // Render modern X tweet design (await all async rendering)
      await this.renderModernTweet(ctx, tweet, dimensions);

      // Get image buffer with high quality
      const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });

      // Check file size and compress if needed
      const fileSizeKB = buffer.length / 1024;
      if (fileSizeKB > botConfig.maxImageSizeKB) {
        logger.warn('Image too large, compressing', {
          originalSize: fileSizeKB,
          maxSize: botConfig.maxImageSizeKB,
        });
        
        const compressedBuffer = canvas.toBuffer('image/jpeg', { 
          quality: Math.max(0.6, 0.95 - (fileSizeKB - botConfig.maxImageSizeKB) / 50) 
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

      logger.info('Modern X tweet image generated successfully', {
        tweetId: tweet.id,
        fileSize: fileSizeKB.toFixed(2) + 'KB',
        dimensions: `${dimensions.width}x${dimensions.height}`,
      });

      return { success: true, buffer };

    } catch (error) {
      logger.error('Failed to generate modern X tweet image', { tweetId: tweet.id, error });
      return { success: false, error: error instanceof Error ? error.message : 'Image generation failed' };
    }
  }

  private calculateTweetDimensions(tweet: TwitterTweet): TweetDimensions {
    const ctx = createCanvas(1, 1).getContext('2d');
    
    // Set fonts for measurement
    ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // Calculate text height with word wrapping
    const maxTextWidth = this.CARD_WIDTH - (this.PADDING * 2) - this.AVATAR_SIZE - 12 - 12;
    const textLines = this.wrapText(ctx, tweet.text, maxTextWidth);
    const textHeight = textLines.length * 20; // 20px line height
    
    // Calculate media height based on actual media in tweet
    let mediaHeight = 0;
    if (tweet.media && tweet.media.length > 0) {
      const mediaCount = tweet.media.length;
      const mediaSpacing = 4; // Spacing between media items
      
      if (mediaCount === 1) {
        // Single media - use aspect ratio
        const media = tweet.media[0];
        if (media) {
          const aspectRatio = media.width && media.height ? media.width / media.height : 16 / 9;
          mediaHeight = Math.min(this.MEDIA_MAX_HEIGHT, this.MEDIA_MAX_WIDTH / aspectRatio);
        } else {
          mediaHeight = this.MEDIA_MAX_HEIGHT / 2; // Default height
        }
      } else if (mediaCount === 2) {
        // 2 media items side by side
        mediaHeight = this.MEDIA_MAX_HEIGHT / 2;
      } else if (mediaCount === 3) {
        // 3 media items - 2 on top, 1 below
        mediaHeight = this.MEDIA_MAX_HEIGHT;
      } else if (mediaCount === 4) {
        // 4 media items in 2x2 grid
        mediaHeight = this.MEDIA_MAX_HEIGHT;
      } else {
        // More than 4 - show first 4 in grid
        mediaHeight = this.MEDIA_MAX_HEIGHT;
      }
      
      // Add spacing after media
      mediaHeight += 16;
    }
    
    // Calculate total height
    const headerHeight = 60; // Avatar + padding
    const contentPadding = 16;
    const footerHeight = 40; // Metrics + PermaSnap badge
    const totalHeight = headerHeight + contentPadding + textHeight + mediaHeight + footerHeight + (this.PADDING * 2);
    
    return {
      width: this.CARD_WIDTH,
      height: totalHeight,
      textHeight,
      mediaHeight
    };
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + word + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    return lines;
  }

  private async renderModernTweet(ctx: CanvasRenderingContext2D, tweet: TwitterTweet, dimensions: TweetDimensions): Promise<void> {
    // Background (X dark theme)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Tweet card background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Header section
    await this.renderHeader(ctx, tweet);
    
    // Content section
    await this.renderContent(ctx, tweet, dimensions);
    
    // Footer section
    this.renderFooter(ctx, tweet, dimensions);
  }

  private async renderHeader(ctx: CanvasRenderingContext2D, tweet: TwitterTweet): Promise<void> {
    const headerY = this.PADDING;
    
    // User avatar (actual profile image or placeholder circle)
    if (tweet.author?.profile_image_url) {
      try {
        // Load and render actual profile image
        const profileImage = await loadImage(tweet.author.profile_image_url);
        
        // Create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.PADDING + this.AVATAR_SIZE / 2, headerY + this.AVATAR_SIZE / 2, this.AVATAR_SIZE / 2, 0, 2 * Math.PI);
        ctx.clip();
        
        // Draw the profile image
        ctx.drawImage(profileImage, this.PADDING, headerY, this.AVATAR_SIZE, this.AVATAR_SIZE);
        
        // Restore context
        ctx.restore();
        
        logger.debug('Profile image loaded successfully', { 
          username: tweet.author.username,
          imageUrl: tweet.author.profile_image_url 
        });
      } catch (error) {
        logger.warn('Failed to load profile image, using placeholder', { 
          error: error instanceof Error ? error.message : error,
          username: tweet.author.username,
          imageUrl: tweet.author.profile_image_url 
        });
        // Fallback to placeholder circle
        this.drawAvatarPlaceholder(ctx, headerY);
      }
    } else {
      // No profile image URL - use placeholder circle
      this.drawAvatarPlaceholder(ctx, headerY);
    }
    
    // Username (display name)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const displayName = tweet.author?.name || tweet.author_id;
    ctx.fillText(displayName, this.PADDING + this.AVATAR_SIZE + 12, headerY + 20);
    
    // Verified badge (blue checkmark)
    if (tweet.author?.verified) {
      const nameWidth = ctx.measureText(displayName).width;
      const badgeX = this.PADDING + this.AVATAR_SIZE + 12 + nameWidth + 4;
      const badgeY = headerY + 8;
      
      // Draw blue circle background
      ctx.fillStyle = '#1d9bf0';
      ctx.beginPath();
      ctx.arc(badgeX + 8, badgeY + 8, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw white checkmark
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', badgeX + 8, badgeY + 12);
      ctx.textAlign = 'left';
    }
    
    // Handle (username)
    ctx.fillStyle = '#71767b';
    ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const handle = tweet.author?.username ? `@${tweet.author.username}` : `@${tweet.author_id}`;
    ctx.fillText(handle, this.PADDING + this.AVATAR_SIZE + 12, headerY + 40);
    
    // Date
    const tweetDate = new Date(tweet.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    ctx.fillText(`· ${tweetDate}`, this.PADDING + this.AVATAR_SIZE + 12 + ctx.measureText(handle).width + 8, headerY + 40);
  }

  private drawAvatarPlaceholder(ctx: CanvasRenderingContext2D, headerY: number): void {
    // Draw placeholder circle
    ctx.fillStyle = '#1d9bf0';
    ctx.beginPath();
    ctx.arc(this.PADDING + this.AVATAR_SIZE / 2, headerY + this.AVATAR_SIZE / 2, this.AVATAR_SIZE / 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  private async renderContent(ctx: CanvasRenderingContext2D, tweet: TwitterTweet, dimensions: TweetDimensions): Promise<void> {
    const contentY = this.PADDING + 60; // Header height
    const textX = this.PADDING + this.AVATAR_SIZE + 12;
    const maxTextWidth = this.CARD_WIDTH - textX - this.PADDING - 12;
    
    // Tweet text
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    const textLines = this.wrapText(ctx, tweet.text, maxTextWidth);
    let lineY = contentY;
    
    for (const line of textLines) {
      ctx.fillText(line, textX, lineY);
      lineY += 20; // Line height
    }
    
    // Render media if available
    if (tweet.media && tweet.media.length > 0) {
      await this.renderMedia(ctx, tweet, lineY + 8); // Add 8px spacing after text
    }
  }

  private async renderMedia(ctx: CanvasRenderingContext2D, tweet: TwitterTweet, startY: number): Promise<void> {
    if (!tweet.media || tweet.media.length === 0) return;
    
    const mediaCount = tweet.media.length;
    const mediaX = this.PADDING + this.AVATAR_SIZE + 12;
    const mediaSpacing = 4;
    
    // Limit to first 4 media items
    const mediaToRender = tweet.media.slice(0, 4);
    
    if (mediaCount === 1) {
      // Single media
      const media = mediaToRender[0];
      if (media) {
        await this.renderSingleMedia(ctx, media, mediaX, startY);
      }
    } else if (mediaCount === 2) {
      // 2 media items side by side
      const mediaWidth = (this.MEDIA_MAX_WIDTH - mediaSpacing) / 2;
      const mediaHeight = this.MEDIA_MAX_HEIGHT / 2;
      
      for (let index = 0; index < mediaToRender.length; index++) {
        const media = mediaToRender[index];
        if (media) {
          const x = mediaX + (index * (mediaWidth + mediaSpacing));
          await this.renderMediaItem(ctx, media, x, startY, mediaWidth, mediaHeight);
        }
      }
    } else if (mediaCount === 3) {
      // 3 media items - 2 on top, 1 below
      const topWidth = (this.MEDIA_MAX_WIDTH - mediaSpacing) / 2;
      const topHeight = this.MEDIA_MAX_HEIGHT / 2;
      const bottomWidth = this.MEDIA_MAX_WIDTH;
      const bottomHeight = this.MEDIA_MAX_HEIGHT / 2;
      
      // Top left
      if (mediaToRender[0]) {
        await this.renderMediaItem(ctx, mediaToRender[0], mediaX, startY, topWidth, topHeight);
      }
      // Top right
      if (mediaToRender[1]) {
        await this.renderMediaItem(ctx, mediaToRender[1], mediaX + topWidth + mediaSpacing, startY, topWidth, topHeight);
      }
      // Bottom
      if (mediaToRender[2]) {
        await this.renderMediaItem(ctx, mediaToRender[2], mediaX, startY + topHeight + mediaSpacing, bottomWidth, bottomHeight);
      }
    } else {
      // 4 or more media items in 2x2 grid
      const gridWidth = (this.MEDIA_MAX_WIDTH - mediaSpacing) / 2;
      const gridHeight = (this.MEDIA_MAX_HEIGHT - mediaSpacing) / 2;
      
      for (let index = 0; index < mediaToRender.length; index++) {
        const media = mediaToRender[index];
        if (media) {
          const row = Math.floor(index / 2);
          const col = index % 2;
          const x = mediaX + (col * (gridWidth + mediaSpacing));
          const y = startY + (row * (gridHeight + mediaSpacing));
          await this.renderMediaItem(ctx, media, x, y, gridWidth, gridHeight);
        }
      }
    }
  }

  private async renderSingleMedia(ctx: CanvasRenderingContext2D, media: any, x: number, y: number): Promise<void> {
    const aspectRatio = media.width && media.height ? media.width / media.height : 16 / 9;
    const mediaHeight = Math.min(this.MEDIA_MAX_HEIGHT, this.MEDIA_MAX_WIDTH / aspectRatio);
    await this.renderMediaItem(ctx, media, x, y, this.MEDIA_MAX_WIDTH, mediaHeight);
  }

  private async renderMediaItem(ctx: CanvasRenderingContext2D, media: any, x: number, y: number, width: number, height: number): Promise<void> {
    // Draw media placeholder with rounded corners
    ctx.fillStyle = '#2f3336'; // Dark gray background for media
    this.drawRoundedRect(ctx, x, y, width, height, 12);
    ctx.fill();

    // Try to load and draw the actual media image
    let imageUrl = media.url;
    if (media.type === 'video' || media.type === 'animated_gif') {
      imageUrl = media.preview_image_url || media.url;
    }
    let imageLoaded = false;
    if (imageUrl) {
      try {
        const img = await loadImage(imageUrl);
        // Calculate cover crop
        const imgAspect = img.width / img.height;
        const boxAspect = width / height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgAspect > boxAspect) {
          // Image is wider than box: crop sides
          sw = img.height * boxAspect;
          sx = (img.width - sw) / 2;
        } else {
          // Image is taller than box: crop top/bottom
          sh = img.width / boxAspect;
          sy = (img.height - sh) / 2;
        }
        ctx.save();
        this.drawRoundedRect(ctx, x, y, width, height, 12);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
        ctx.restore();
        imageLoaded = true;
        logger.debug('Media image loaded successfully', { imageUrl, type: media.type });
      } catch (error) {
        logger.warn('Failed to load media image, using placeholder', { imageUrl, type: media.type, error: error instanceof Error ? error.message : error });
      }
    }

    // If image not loaded, show placeholder and type emoji
    if (!imageLoaded) {
      // Add media type indicator
      ctx.fillStyle = '#71767b';
      ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      let mediaText = '📷';
      if (media.type === 'video') {
        mediaText = '🎥';
      } else if (media.type === 'animated_gif') {
        mediaText = '🎬';
      }
      ctx.fillText(mediaText, x + width / 2, y + height / 2 + 8);
      ctx.textAlign = 'left';
    }

    // Add alt text if available
    if (media.alt_text) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Alt: ' + media.alt_text.substring(0, 20) + (media.alt_text.length > 20 ? '...' : ''), x + width / 2, y + height - 8);
      ctx.textAlign = 'left';
    }
  }

  private renderFooter(ctx: CanvasRenderingContext2D, tweet: TwitterTweet, dimensions: TweetDimensions): void {
    const footerY = dimensions.height - 40;
    
    // Engagement metrics (if available)
    const metrics = [
      { icon: '💬', count: tweet.public_metrics?.reply_count ?? 0 },
      { icon: '🔄', count: tweet.public_metrics?.retweet_count ?? 0 },
      { icon: '❤️', count: tweet.public_metrics?.like_count ?? 0 },
      { icon: '📊', count: tweet.public_metrics?.quote_count ?? 0 }
    ];
    
    let metricX = this.PADDING + this.AVATAR_SIZE + 12;
    
    for (const metric of metrics) {
      if (metric.count > 0) {
        ctx.fillStyle = '#71767b';
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`${metric.icon} ${metric.count}`, metricX, footerY);
        metricX += ctx.measureText(`${metric.icon} ${metric.count}`).width + 24;
      }
    }
    
    // PermaSnap badge
    const badgeX = dimensions.width - this.PADDING - 100;
    const badgeY = footerY - 20;
    
    // Badge background
    ctx.fillStyle = '#1d9bf0';
    this.drawRoundedRect(ctx, badgeX, badgeY, 100, 24, 12);
    ctx.fill();
    
    // Badge text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PermaSnap', badgeX + 50, badgeY + 16);
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
    logger.info('Screenshot service cleanup completed');
  }

  async checkBrowserHealth(): Promise<boolean> {
      return true;
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
export default screenshotService; 
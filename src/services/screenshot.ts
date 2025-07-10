import path from 'path';
import fs, { truncate } from 'fs/promises';
import { ScreenshotResult, ScreenshotOptions, TwitterTweet } from '../types';
import { botConfig } from '../config';
import logger from '../utils/logger';
import puppeteer from 'puppeteer';

class ScreenshotService {
  private readonly TEMPLATE_PATH = path.join(__dirname, '../../assets/tweet-card-template.html');

  async initialize(): Promise<void> {
    logger.info('✅ Puppeteer-based tweet screenshot service initialized successfully');
  }

  async takeScreenshot(
    tweet: TwitterTweet,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    try {
      // Read HTML template
      const templateHtml = await fs.readFile(this.TEMPLATE_PATH, 'utf8');
      // Launch Puppeteer with proper settings for image loading
      const browser = await puppeteer.launch({ 
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      const page = await browser.newPage();
      
      // Set viewport and user agent for better compatibility
      await page.setViewport({ width: 1200, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      // Serve the HTML template as a data URL
      await page.setContent(templateHtml, { waitUntil: 'networkidle0' });
      // Inject tweet data and render
      await page.evaluate((tweetData: any) => {
        // @ts-expect-error: window is defined in browser context
        (window as any).tweetData = tweetData;
        // @ts-expect-error: window is defined in browser context
        if ((window as any).renderTweet) (window as any).renderTweet(tweetData);
      }, tweet);
      // Wait for tweet card to render
      await page.waitForSelector('.tweet-card');
      
      // Wait for all images to load properly with better error handling
      await page.evaluate(async () => {
        // @ts-expect-error: document is defined in browser context
        const tweetEl = document.querySelector('.tweet-card');
        if (!tweetEl) return;
        
        const images = tweetEl.querySelectorAll('img');
        if (images.length === 0) return;
        
        // Wait for all images to load with proper error handling
        await Promise.all(Array.from(images).map((img, index) => {
          return new Promise<void>((resolve) => {
            // @ts-expect-error: HTMLImageElement is defined in browser context
            const imgElement = img as HTMLImageElement;
            
            // If image is already loaded
            if (imgElement.complete && imgElement.naturalWidth > 0) {
              resolve();
              return;
            }
            
            // Set up load and error handlers
            const handleLoad = () => {
              imgElement.removeEventListener('load', handleLoad);
              imgElement.removeEventListener('error', handleError);
              resolve();
            };
            
            const handleError = () => {
              console.warn(`Image failed to load: ${imgElement.src}`);
              imgElement.removeEventListener('load', handleLoad);
              imgElement.removeEventListener('error', handleError);
              resolve(); // Resolve even on error to continue
            };
            
            imgElement.addEventListener('load', handleLoad, { once: true });
            imgElement.addEventListener('error', handleError, { once: true });
            
            // Timeout after 10 seconds
            setTimeout(() => {
              imgElement.removeEventListener('load', handleLoad);
              imgElement.removeEventListener('error', handleError);
              console.warn(`Image load timeout: ${imgElement.src}`);
              resolve();
            }, 500);
          });
        }));
        
        // Additional wait to ensure images are fully rendered
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Final check - verify all images are properly loaded
        const finalImages = tweetEl.querySelectorAll('img');
        const loadedImages = Array.from(finalImages).filter(img => {
          // @ts-expect-error: HTMLImageElement is defined in browser context
          const imgElement = img as HTMLImageElement;
          return imgElement.complete && imgElement.naturalWidth > 0;
        });
        
        console.log(`Image loading status: ${loadedImages.length}/${finalImages.length} images loaded successfully`);
      });
      
      // Take screenshot with html2canvas
      const dataUrl = await page.evaluate(async () => {
        // @ts-expect-error: document is defined in browser context
        const tweetEl = document.querySelector('.tweet-card');
        if (!tweetEl) throw new Error('Tweet element not found');
        
        // @ts-expect-error: window is defined in browser context
        const canvas = await (window as any).html2canvas(tweetEl, { 
          backgroundColor: '#fff', 
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false
        });
        
        return canvas.toDataURL('image/png');
      });
      // Convert data URL to buffer
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      await browser.close();
      // Check file size and compress if needed (optional)
      const fileSizeKB = buffer.length / 1024;
      if (fileSizeKB > botConfig.maxImageSizeKB) {
        logger.warn('Image too large, consider compressing or resizing', {
          originalSize: fileSizeKB,
          maxSize: botConfig.maxImageSizeKB,
        });
      }
      logger.info('Tweet image generated successfully', {
        tweetId: tweet.id,
        fileSize: fileSizeKB.toFixed(2) + 'KB',
      });
      return { success: true, buffer };
    } catch (error) {
      logger.error('Failed to generate tweet image', { error });
      return { success: false, error: error instanceof Error ? error.message : 'Image generation failed' };
    }
  }

  async saveScreenshot(buffer: Buffer, filename: string): Promise<string> {
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const tempPath = join(tmpdir(), filename);
    await fs.writeFile(tempPath, buffer);
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

export const screenshotService = new ScreenshotService();
export default screenshotService; 
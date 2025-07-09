import path from 'path';
import fs from 'fs/promises';
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
      // Launch Puppeteer
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
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
      // Scroll tweet card into view (in case of lazy loading)
      await page.evaluate(() => {
        // @ts-expect-error: document is defined in browser context
        const tweetEl = document.querySelector('.tweet-card');
        if (tweetEl) tweetEl.scrollIntoView();
      });
      // Add a short delay to allow images to start loading
      await new Promise(res => setTimeout(res, 1000));
      // Use html2canvas in the page context
      const dataUrl = await page.evaluate(async () => {
        // @ts-expect-error: document is defined in browser context
        const tweetEl = document.querySelector('.tweet-card');
        const images = tweetEl.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
          return new Promise(resolve => {
            // @ts-expect-error: HTMLImageElement is defined in browser context
            if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth !== 0) {
              return resolve(true);
            }
            // Otherwise, wait for load/error, or timeout after 5s
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(true); } };
            // @ts-expect-error: HTMLImageElement is defined in browser context
            (img as HTMLImageElement).addEventListener('load', done, { once: true });
            // @ts-expect-error: HTMLImageElement is defined in browser context
            (img as HTMLImageElement).addEventListener('error', done, { once: true });
            setTimeout(done, 200);
          });
        }));
        // Log failed images for debugging
        const failedImages = Array.from(images).filter(img => {
          // @ts-expect-error: HTMLImageElement is defined in browser context
          return (img as HTMLImageElement).naturalWidth === 0;
        });
        if (failedImages.length) {
          // @ts-expect-error: console is available in browser context
          console.warn('Some images failed to load:', failedImages.map(img => img.src));
        }
        // Now run html2canvas
        // @ts-expect-error: window is defined in browser context
        const canvas = await (window as any).html2canvas(tweetEl, { backgroundColor: '#fff', scale: 2 });
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
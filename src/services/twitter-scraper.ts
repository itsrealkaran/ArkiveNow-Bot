import puppeteer, { Browser, Page } from 'puppeteer';
import logger from '../utils/logger';
import { botConfig } from '../config';
import { OptimizedTweet, OptimizedAuthor, OptimizedMedia, OptimizedMetrics, TwitterMention, TwitterUser } from '../types';

// Add DOM types for browser evaluation
declare global {
  interface Window {
    scrollBy: (x: number, y: number) => void;
  }
  
  interface HTMLElement extends Element {
    scrollHeight: number;
  }
  
  interface Document {
    querySelector(selectors: string): Element | null;
    querySelectorAll(selectors: string): NodeListOf<Element>;
    body: HTMLElement;
  }
  
  interface Element {
    querySelector(selectors: string): Element | null;
    querySelectorAll(selectors: string): NodeListOf<Element>;
    textContent: string | null;
    getAttribute(name: string): string | null;
  }
  
  interface HTMLAnchorElement extends Element {
    href: string;
  }
  
  interface HTMLImageElement extends Element {
    src: string;
  }
  
  interface NodeListOf<T> {
    forEach(callbackfn: (value: T, index: number, list: NodeListOf<T>) => void): void;
    [index: number]: T;
    length: number;
  }
  
  var document: Document;
  var window: Window;
}

interface ScrapedMention {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  in_reply_to_user_id?: string | undefined;
  referenced_tweets?: Array<{
    type: 'replied_to' | 'retweeted' | 'quoted';
    id: string;
  }>;
  author?: TwitterUser;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

class TwitterScraperService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;
  private lastMentionId: string | null = null;
  private sessionCookies: any[] = [];

  constructor() {
    logger.info('Twitter scraper service initialized');
  }

  /**
   * Initialize the browser and page
   */
  private async initializeBrowser(): Promise<void> {
    if (this.browser) return;

    try {
      this.browser = await puppeteer.launch({
        headless: true, // Set to false for debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set viewport
      await this.page.setViewport({ width: 1280, height: 720 });

      logger.info('Browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize browser', { error });
      throw error;
    }
  }

  /**
   * Login to X.com (Twitter)
   */
  async login(username: string, password: string): Promise<boolean> {
    try {
      await this.initializeBrowser();
      if (!this.page) throw new Error('Page not initialized');

      logger.info('Attempting to login to X.com', { username });

      // Navigate to X.com login page
      await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle0' });

      // Handle username input
      logger.info('Waiting for username input field...');
      const usernameInput = await this.page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
      if (!usernameInput) throw new Error('Username input field not found');
      
      logger.info('Filling in username...');
      await usernameInput.type(username);
      await new Promise(resolve => setTimeout(resolve, 1000));

      logger.info('Clicking Next button...');
      const nextClicked = await this.clickButton('Next');
      if (!nextClicked) {
        throw new Error('Failed to click Next button');
      }
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check for unusual login activity prompt
      try {
        logger.info('Checking for unusual login activity prompt...');
        const unusualActivity = await this.page.waitForSelector(
          'span:has-text("Enter your phone number or email address")',
          { timeout: 5000 }
        );

        if (unusualActivity) {
          logger.info('Unusual login activity detected, entering email...');
          const emailInput = await this.page.waitForSelector('input[type="text"]');
          if (!emailInput) throw new Error('Email input field not found');
          
          await emailInput.type(username); // Use username as email
          await new Promise(resolve => setTimeout(resolve, 1000));

          logger.info('Clicking Next after entering email...');
          const nextClicked2 = await this.clickButton('Next');
          if (!nextClicked2) {
            throw new Error('Failed to click Next button after email input');
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        logger.info('No unusual activity prompt detected');
      }

      // Handle password input
      logger.info('Waiting for password input field...');
      const passwordInput = await this.page.waitForSelector('input[name="password"]', { timeout: 10000 });
      if (!passwordInput) throw new Error('Password input field not found');
      
      logger.info('Filling in password...');
      await passwordInput.type(password);
      await new Promise(resolve => setTimeout(resolve, 2000));

      logger.info('Clicking Log in button...');
      const loginClicked = await this.clickButton('Log in');
      if (!loginClicked) {
        throw new Error('Failed to click Log in button');
      }
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify login success
      const isLoggedIn = await this.verifyLogin();

      if (isLoggedIn) {
        // Save cookies for future sessions
        this.sessionCookies = await this.page.cookies();
        this.isLoggedIn = true;
        logger.info('Successfully logged in to X.com');
        return true;
      } else {
        logger.error('Login failed');
        return false;
      }
    } catch (error) {
      logger.error('Failed to login to X.com', { error });
      // Take screenshot for debugging
      if (this.page) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await this.page.screenshot({ path: `login_error_${timestamp}.png`, fullPage: true });
      }
      return false;
    }
  }

  /**
   * Verify successful login
   */
  private async verifyLogin(): Promise<boolean> {
    try {
      if (!this.page) return false;
      await this.page.waitForSelector('a[aria-label="Profile"]', { timeout: 10000 });
      logger.info('Login verification successful!');
      return true;
    } catch (error) {
      logger.error('Login verification failed!');
      return false;
    }
  }

  /**
   * Click button with multiple fallback selectors
   */
  private async clickButton(buttonText: string, fallbackSelectors: string[] = []): Promise<boolean> {
    if (!this.page) return false;

    const selectors = [
      `div[role="button"]:has-text("${buttonText}")`,
      `button:has-text("${buttonText}")`,
      `[data-testid="auth_${buttonText.toLowerCase().replace(' ', '_')}_button"]`,
      ...fallbackSelectors
    ];

    for (const selector of selectors) {
      try {
        logger.info(`Trying to click button with selector: ${selector}`);
        await this.page.click(selector);
        logger.info(`Successfully clicked button: ${buttonText}`);
        return true;
      } catch (error) {
        logger.debug(`Failed to click with selector ${selector}:`, error);
        continue;
      }
    }

    // Last resort: try to find any button with the text
    try {
      const buttons = await this.page.$$('div[role="button"], button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent);
        if (text && text.toLowerCase().includes(buttonText.toLowerCase())) {
          await button.click();
          logger.info(`Successfully clicked button by text matching: ${buttonText}`);
          return true;
        }
      }
    } catch (error) {
      logger.debug('Failed to find button by text matching');
    }

    // Debug: log all available buttons
    await this.debugAvailableButtons();

    logger.error(`Failed to click button: ${buttonText}`);
    return false;
  }

  /**
   * Debug method to log all available buttons on the page
   */
  private async debugAvailableButtons(): Promise<void> {
    if (!this.page) return;

    try {
      const buttons = await this.page.$$('div[role="button"], button, [data-testid*="button"]');
      logger.info(`Found ${buttons.length} buttons on the page:`);
      
      for (let i = 0; i < buttons.length; i++) {
        try {
          const button = buttons[i];
          if (!button) continue;
          
          const text = await button.evaluate(el => el.textContent);
          const testId = await button.evaluate(el => el.getAttribute('data-testid'));
          const role = await button.evaluate(el => el.getAttribute('role'));
          
          logger.info(`Button ${i + 1}: text="${text}", testid="${testId}", role="${role}"`);
        } catch (error) {
          logger.debug(`Could not get details for button ${i + 1}`);
        }
      }
    } catch (error) {
      logger.debug('Failed to debug buttons');
    }
  }

  /**
   * Navigate to mentions using direct URL
   */
  private async navigateToMentions(): Promise<boolean> {
    if (!this.page) return false;

    try {
      logger.info('Navigating directly to mentions URL...');
      
      // Direct navigation to mentions
      await this.page.goto('https://x.com/notifications/mentions', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if we're on the right page
      const currentUrl = this.page.url();
      logger.info(`Current URL: ${currentUrl}`);
      
      if (currentUrl.includes('/notifications/mentions') || currentUrl.includes('/mentions')) {
        logger.info('✅ Direct navigation to mentions successful');
        return true;
      } else {
        logger.warn('⚠️  Navigation may have failed, but continuing...');
        return false;
      }

    } catch (error) {
      logger.error('Error navigating to mentions:', error);
      return false;
    }
  }

  /**
   * Debug method to log navigation elements on the page
   */
  private async debugNavigationElements(): Promise<void> {
    if (!this.page) return;

    try {
      logger.info('🔍 Debugging navigation elements...');
      
      // Log current URL
      const currentUrl = this.page.url();
      logger.info(`Current URL: ${currentUrl}`);
      
      // Find all navigation links
      const navLinks = await this.page.$$('a[href*="notifications"], a[href*="mentions"], [data-testid*="notification"], [data-testid*="mention"]');
      logger.info(`Found ${navLinks.length} navigation links:`);
      
      for (let i = 0; i < navLinks.length; i++) {
        try {
          const link = navLinks[i];
          if (!link) continue;
          
          const href = await link.evaluate(el => el.getAttribute('href'));
          const text = await link.evaluate(el => el.textContent);
          const testId = await link.evaluate(el => el.getAttribute('data-testid'));
          const ariaLabel = await link.evaluate(el => el.getAttribute('aria-label'));
          
          logger.info(`Link ${i + 1}: href="${href}", text="${text}", testid="${testId}", aria-label="${ariaLabel}"`);
        } catch (error) {
          logger.debug(`Could not get details for link ${i + 1}`);
        }
      }

      // Find all clickable elements with role="link"
      const clickableLinks = await this.page.$$('[role="link"], a, button, [data-testid*="link"], [data-testid*="button"]');
      logger.info(`Found ${clickableLinks.length} clickable elements:`);
      
      for (let i = 0; i < Math.min(clickableLinks.length, 20); i++) { // Limit to first 20
        try {
          const element = clickableLinks[i];
          if (!element) continue;
          
          const href = await element.evaluate(el => el.getAttribute('href'));
          const text = await element.evaluate(el => el.textContent);
          const testId = await element.evaluate(el => el.getAttribute('data-testid'));
          const role = await element.evaluate(el => el.getAttribute('role'));
          const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label'));
          
          // Only log if it has relevant text or attributes
          if (text && (text.toLowerCase().includes('notification') || text.toLowerCase().includes('mention') || 
              href && (href.includes('notification') || href.includes('mention')) ||
              testId && (testId.toLowerCase().includes('notification') || testId.toLowerCase().includes('mention')))) {
            logger.info(`Clickable ${i + 1}: href="${href}", text="${text}", testid="${testId}", role="${role}", aria-label="${ariaLabel}"`);
          }
        } catch (error) {
          logger.debug(`Could not get details for clickable element ${i + 1}`);
        }
      }

      // Find all elements with data-testid containing navigation-related terms
      const testIdElements = await this.page.$$('[data-testid*="nav"], [data-testid*="tab"], [data-testid*="link"]');
      logger.info(`Found ${testIdElements.length} elements with navigation-related test IDs:`);
      
      for (let i = 0; i < Math.min(testIdElements.length, 10); i++) { // Limit to first 10
        try {
          const element = testIdElements[i];
          if (!element) continue;
          
          const testId = await element.evaluate(el => el.getAttribute('data-testid'));
          const text = await element.evaluate(el => el.textContent);
          const href = await element.evaluate(el => el.getAttribute('href'));
          
          logger.info(`TestID ${i + 1}: testid="${testId}", text="${text}", href="${href}"`);
        } catch (error) {
          logger.debug(`Could not get details for testID element ${i + 1}`);
        }
      }

      // Take a screenshot for visual debugging
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await this.page.screenshot({ path: `navigation_debug_${timestamp}.png`, fullPage: true });
        logger.info(`📸 Screenshot saved: navigation_debug_${timestamp}.png`);
      } catch (error) {
        logger.debug('Failed to take screenshot');
      }
      
    } catch (error) {
      logger.debug('Failed to debug navigation elements:', error);
    }
  }

  /**
   * Restore session using saved cookies
   */
  async restoreSession(): Promise<boolean> {
    try {
      if (this.sessionCookies.length === 0) {
        logger.warn('No saved cookies found');
        return false;
      }

      await this.initializeBrowser();
      if (!this.page) throw new Error('Page not initialized');

      // Set cookies
      await this.page.setCookie(...this.sessionCookies);

      // Navigate to Twitter to check if session is valid
      await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });

      // Check if we're logged in
      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('input[autocomplete="username"]');
      });

      if (isLoggedIn) {
        this.isLoggedIn = true;
        logger.info('Successfully restored Twitter session');
        return true;
      } else {
        logger.warn('Session restoration failed - cookies may be expired');
        return false;
      }
    } catch (error) {
      logger.error('Failed to restore session', { error });
      return false;
    }
  }

  /**
   * Scrolls the mentions timeline until a tweet older than lastCheckedTime is found
   * and collects all tweets with @arkivenow in the text.
   */
  private async autoScrollUntilTime(lastCheckedTime: string): Promise<void> {
    if (!this.page) return;
    let lastHeight = 0;
    let reachedOldTweet = false;
    let prevTweetCount = 0;
    let sameCountTries = 0;
    while (!reachedOldTweet && sameCountTries < 5) {
      // Scroll to bottom (in browser context)
      await this.page.evaluate(() => {
        window.scrollBy(0, (window as any).innerHeight || document.body.scrollHeight / 10);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Check if any tweet is older than lastCheckedTime
      const { reached, tweetCount } = await this.page.evaluate((lastCheckedTime) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        let reached = false;
        for (const article of articles) {
          const timeElement = article.querySelector('time');
          const timestamp = timeElement?.getAttribute('datetime') || '';
          if (lastCheckedTime && timestamp && timestamp < lastCheckedTime) {
            reached = true;
            break;
          }
        }
        return { reached, tweetCount: articles.length };
      }, lastCheckedTime);
      if (tweetCount === prevTweetCount) {
        sameCountTries++;
      } else {
        sameCountTries = 0;
        prevTweetCount = tweetCount;
      }
      if (reached) reachedOldTweet = true;
    }
  }

  /**
   * Navigate to mentions page and scrape mentions
   */
  async getMentions(lastCheckedTime?: string): Promise<ScrapedMention[]> {
    if (!this.isLoggedIn) {
      // Load credentials from env only
      const username = process.env.TWITTER_SCRAPER_USERNAME;
      const password = process.env.TWITTER_SCRAPER_PASSWORD;
      if (!username || !password) {
        throw new Error('Twitter scraper credentials not set in environment variables');
      }
      const loginSuccess = await this.login(username, password);
      if (!loginSuccess) {
        throw new Error('Failed to login to X.com');
      }
    }
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    try {
      logger.info('Navigating directly to mentions page');
      try {
        await this.page.goto('https://x.com/notifications/mentions', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error('Failed to navigate to mentions:', error);
        return [];
      }
      // Wait for tweets to load
      try {
        await this.page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        logger.warn('No tweets found, might be no mentions available');
      }
      logger.info('Successfully navigated to mentions tab');
      // Iteratively scroll until we reach a tweet older than lastCheckedTime
      if (lastCheckedTime) {
        await this.autoScrollUntilTime(lastCheckedTime);
      } else {
        await this.autoScroll();
      }
      // Extract mentions
      const mentions = await this.page.evaluate((lastId, lastCheckedTime) => {
        const tweets: ScrapedMention[] = [];
        const tweetsToInspect: string[] = [];
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        for (const article of articles) {
          try {
            // Extract tweet ID
            const tweetLink = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
            if (!tweetLink) continue;
            const tweetId = tweetLink.href.split('/status/')[1]?.split('?')[0];
            if (!tweetId) continue;
            // Skip if we've already processed this tweet
            if (lastId && tweetId === lastId) continue;
            // Extract tweet content
            const contentElement = article.querySelector('[data-testid="tweetText"]');
            const content = contentElement?.textContent || '';
            // Filter for @arkivenow
            if (!content.includes('@arkivenow')) continue;
            // Extract timestamp
            const timeElement = article.querySelector('time');
            const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
            // Stop if this tweet is older than lastCheckedTime
            if (lastCheckedTime && timestamp < lastCheckedTime) break;
            // Extract user information
            const userLink = article.querySelector('a[href^="/"][role="link"]') as HTMLAnchorElement;
            let username: string = '';
            if (userLink && typeof userLink.href === 'string') {
              const match = userLink.href.match(/(?:https?:\/\/)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)(?:[/?#]|$)/i);
              username = match && match[1] ? match[1] : '';
            }
            const nameElement = article.querySelector('[data-testid="User-Name"] span');
            const name = nameElement?.textContent || username;
            // Extract profile picture
            const profilePicElement = article.querySelector('img[src*="profile_images"]') as HTMLImageElement;
            const profilePicture = profilePicElement?.src || '';
            // Check verification status
            const verifiedBadge = article.querySelector('[data-testid="icon-verified"]');
            const verified = !!verifiedBadge;
            // Extract media
            const media: Array<{type: string, url: string | undefined, preview_image_url: string | undefined}> = [];
            const mediaElements = article.querySelectorAll('img[src*="media"]');
            mediaElements.forEach((img: Element) => {
              const imgElement = img as HTMLImageElement;
              media.push({
                type: 'photo',
                url: imgElement.src,
                preview_image_url: imgElement.src
              });
            });
            // Extract metrics (these are usually not visible in mentions, so we'll use defaults)
            const metrics = {
              replies: 0,
              retweets: 0,
              likes: 0,
              quotes: 0,
              bookmarks: 0,
              impressions: 0
            };
            // Check if this is a reply and get parent tweet info
            const replyIndicator = article.querySelector('[data-testid="reply"]');
            let parentTweetId: string | undefined;
            let inReplyToUserId: string | undefined;
            if (replyIndicator) {
              // Look for "Replying to @username" text in the current view
              const replyText = article.textContent || '';
              const replyMatch = replyText.match(/Replying to @(\w+)/);
              if (replyMatch) {
                inReplyToUserId = replyMatch[1];
              }
              // Try to find the parent tweet link in the current view
              const parentLink = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
              if (parentLink && parentLink.href.includes('/status/')) {
                const urlParts = parentLink.href.split('/status/');
                if (urlParts.length > 1) {
                  parentTweetId = urlParts[1]?.split('?')[0];
                }
              }
              // Always add to tweetsToInspect for replies
              if (tweetId) {
                tweetsToInspect.push(tweetId);
              }
            }
            tweets.push({
              id: tweetId,
              text: content,
              author_id: username, // Using username as ID since we can't get the actual user ID
              created_at: timestamp,
              in_reply_to_user_id: inReplyToUserId,
              ...(parentTweetId ? {
                referenced_tweets: [{
                  type: 'replied_to' as const,
                  id: parentTweetId
                }]
              } : {}),
              author: {
                id: username,
                username,
                name,
                profile_image_url: profilePicture,
                verified,
                verified_type: verified ? 'blue' : 'none'
              },
              public_metrics: {
                retweet_count: metrics.retweets,
                reply_count: metrics.replies,
                like_count: metrics.likes,
                quote_count: metrics.quotes
              }
            });
          } catch (error) {
            console.error('Error parsing tweet:', error);
          }
        }
        // No reverse: keep as top-to-bottom (newest to oldest)
        return { tweets, tweetsToInspect };
      }, this.lastMentionId, lastCheckedTime);
      // Process tweets that need detailed inspection
      const { tweets, tweetsToInspect } = mentions;
      if (tweetsToInspect.length > 0) {
        logger.info(`Need to inspect ${tweetsToInspect.length} tweets for parent information...`);
        for (const tweetId of tweetsToInspect) {
          try {
            const tweetDetails = await this.getTweetDetails(tweetId);
            // Update the tweet with parent information
            const tweetIndex = tweets.findIndex(t => t.id === tweetId);
            if (tweetIndex !== -1 && tweetDetails && tweets[tweetIndex]) {
              tweets[tweetIndex].in_reply_to_user_id = tweetDetails.inReplyToUserId;
              if (tweetDetails.parentTweetId) {
                tweets[tweetIndex].referenced_tweets = [{
                  type: 'replied_to' as const,
                  id: tweetDetails.parentTweetId
                }];
              }
            }
          } catch (error) {
            logger.warn(`Failed to get details for tweet ${tweetId}:`, error);
          }
        }
      }
      // Sort by created_at descending (newest first)
      tweets.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      logger.info('Scraped mentions', { count: tweets.length });
      return tweets;
    } catch (error) {
      logger.error('Failed to scrape mentions', { error });
      return [];
    }
  }

  /**
   * Navigate to a specific tweet and extract parent tweet information
   */
  private async getTweetDetails(tweetId: string): Promise<{ parentTweetId?: string; inReplyToUserId?: string }> {
    if (!this.page) return {};
    
    try {
      logger.info(`Navigating to tweet ${tweetId} to get parent information...`);
      await this.page.goto(`https://x.com/i/status/${tweetId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract parent tweet info
      const tweetInfo = await this.page.evaluate((replyId) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        let parentTweetId: string | undefined;

        for (const article of articles) {
          const link = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
          if (link) {
            const urlParts = link.href.split('/status/');
            if (urlParts.length > 1) {
              const candidateId = urlParts[1]?.split('?')[0]?.split('/')[0];
              if (candidateId && candidateId !== replyId) {
                parentTweetId = candidateId;
                break;
              }
            }
          }
        }

        // Optionally, extract in-reply-to username as before
        const replyText = document.body.textContent || '';
        const replyMatch = replyText.match(/Replying to @(\w+)/);
        const inReplyToUserId = replyMatch ? replyMatch[1] : undefined;

        const result: { parentTweetId?: string; inReplyToUserId?: string } = {};
        if (typeof parentTweetId === 'string') result.parentTweetId = parentTweetId;
        if (typeof inReplyToUserId === 'string') result.inReplyToUserId = inReplyToUserId;
        return result;
      }, tweetId);

      logger.info(`Tweet ${tweetId} details:`, tweetInfo);
      return tweetInfo;

    } catch (error) {
      logger.warn(`Failed to get details for tweet ${tweetId}:`, error);
      return {};
    }
  }

  /**
   * Auto-scroll to load more tweets
   */
  private async autoScroll(): Promise<void> {
    if (!this.page) return;

    await this.page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

          // Wait a bit for new content to load
      await new Promise(resolve => setTimeout(resolve, 2000));
  }



  /**
   * Start polling for mentions
   */
  async startPolling(callback: (mentions: ScrapedMention[]) => Promise<void>): Promise<void> {
    logger.info('Starting Twitter scraper polling', { 
      interval: botConfig.pollingInterval,
      botUsername: botConfig.username 
    });

    const poll = async () => {
      try {
        const scrapedMentions = await this.getMentions();
        
        if (scrapedMentions.length > 0) {
          // Update last mention ID
          this.lastMentionId = scrapedMentions[0]?.id || null;
          
          
          // Pass to callback
          await callback(scrapedMentions.reverse());
        } else {
          logger.info('No new mentions found');
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

  /**
   * Stop polling and close browser
   */
  async stopPolling(): Promise<void> {
    logger.info('Stopping Twitter scraper polling');
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Save session cookies to file
   */
  async saveSession(): Promise<void> {
    if (this.sessionCookies.length > 0) {
      const fs = require('fs');
      const path = require('path');
      
      const cookiesPath = path.join(process.cwd(), 'session-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(this.sessionCookies, null, 2));
      
      logger.info('Session cookies saved', { path: cookiesPath });
    }
  }

  /**
   * Load session cookies from file
   */
  async loadSession(): Promise<boolean> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const cookiesPath = path.join(process.cwd(), 'session-cookies.json');
      
      if (fs.existsSync(cookiesPath)) {
        const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
        this.sessionCookies = JSON.parse(cookiesData);
        
        logger.info('Session cookies loaded', { path: cookiesPath });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to load session cookies', { error });
      return false;
    }
  }
}

// Export singleton instance
export const twitterScraperService = new TwitterScraperService();
export default twitterScraperService; 
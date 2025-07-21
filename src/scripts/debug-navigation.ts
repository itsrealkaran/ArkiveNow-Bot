import twitterScraperService from '../services/twitter-scraper';
import logger from '../utils/logger';

async function debugNavigation() {
  try {
    logger.info('🔍 Debugging X.com navigation...');

    // Test 1: Load and restore session
    logger.info('Step 1: Loading session...');
    const sessionRestored = await twitterScraperService.loadSession();
    logger.info('Session loaded:', { restored: sessionRestored });

    if (!sessionRestored) {
      logger.error('❌ No saved session found. Run setup-scraper first.');
      return;
    }

    // Test 2: Restore session
    logger.info('Step 2: Restoring session...');
    const restored = await twitterScraperService.restoreSession();
    logger.info('Session restored:', { restored });

    if (!restored) {
      logger.error('❌ Session restoration failed. Run setup-scraper to re-login.');
      return;
    }

    // Test 3: Navigate to home page
    logger.info('Step 3: Navigating to home page...');
    if (!twitterScraperService['page']) {
      logger.error('❌ Page not initialized');
      return;
    }

    try {
      await twitterScraperService['page'].goto('https://x.com/home', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const homeUrl = twitterScraperService['page'].url();
      logger.info('Home page URL:', homeUrl);
    } catch (error) {
      logger.error('❌ Failed to navigate to home:', error);
      return;
    }

    // Test 4: Debug navigation elements
    logger.info('Step 4: Debugging navigation elements...');
    await twitterScraperService['debugNavigationElements']();

    // Test 5: Try direct navigation to mentions
    logger.info('Step 5: Trying direct navigation to mentions...');
    try {
      await twitterScraperService['page'].goto('https://x.com/notifications/mentions', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const mentionsUrl = twitterScraperService['page'].url();
      logger.info('Mentions page URL:', mentionsUrl);
      
      if (mentionsUrl.includes('/notifications/mentions') || mentionsUrl.includes('/mentions')) {
        logger.info('✅ Direct navigation to mentions successful');
      } else {
        logger.warn('⚠️  Direct navigation may have failed');
      }
    } catch (error) {
      logger.error('❌ Direct navigation failed:', error);
    }

    // Test 6: Try navigation via notifications
    logger.info('Step 6: Trying navigation via notifications...');
    try {
      await twitterScraperService['page'].goto('https://x.com/notifications', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const notificationsUrl = twitterScraperService['page'].url();
      logger.info('Notifications page URL:', notificationsUrl);
      
      // Debug elements on notifications page
      await twitterScraperService['debugNavigationElements']();
      
    } catch (error) {
      logger.error('❌ Navigation via notifications failed:', error);
    }

    logger.info('🎉 Navigation debugging completed!');
    logger.info('📸 Check the generated screenshots for visual debugging');
    logger.info('📋 Review the logs above for element details');

  } catch (error) {
    logger.error('❌ Navigation debugging failed:', error);
  } finally {
    // Clean up
    await twitterScraperService.stopPolling();
  }
}

// Run debug
debugNavigation().catch(console.error);
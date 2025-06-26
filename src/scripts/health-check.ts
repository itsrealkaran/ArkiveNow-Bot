import databaseService from '../services/database';
import twitterService from '../services/twitter';
import screenshotService from '../services/screenshot';
import arweaveService from '../services/arweave';
import quotaService from '../services/quota';
import botService from '../services/bot';
import logger from '../utils/logger';
import { config } from '../config';

interface HealthStatus {
  timestamp: string;
  bot: {
    isRunning: boolean;
    isProcessing: boolean;
    uptime: number;
  };
  database: {
    connected: boolean;
    tablesExist: boolean;
  };
  twitter: {
    credentialsValid: boolean;
    canPoll: boolean;
  };
  screenshot: {
    initialized: boolean;
    browserAvailable: boolean;
  };
  arweave: {
    walletLoaded: boolean;
    canUpload: boolean;
  };
  quota: {
    serviceAvailable: boolean;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    nodeVersion: string;
  };
}

async function performHealthCheck(): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    logger.info('🏥 Performing health check...');

    // Check bot status
    const botStatus = botService.getStatus();

    // Check database
    let dbConnected = false;
    let tablesExist = false;
    try {
      await databaseService.connect();
      dbConnected = true;
      tablesExist = await databaseService.checkTablesExist();
    } catch (error) {
      logger.error('Database health check failed', { error });
    }

    // Check Twitter
    let credentialsValid = false;
    let canPoll = false;
    try {
      credentialsValid = await twitterService.verifyCredentials();
      canPoll = credentialsValid; // If credentials are valid, we can poll
    } catch (error) {
      logger.error('Twitter health check failed', { error });
    }

    // Check screenshot service
    let screenshotInitialized = false;
    let browserAvailable = false;
    try {
      await screenshotService.initialize();
      screenshotInitialized = true;
      browserAvailable = await screenshotService.checkBrowserHealth();
    } catch (error) {
      logger.error('Screenshot service health check failed', { error });
    }

    // Check Arweave
    let walletLoaded = false;
    let canUpload = false;
    try {
      walletLoaded = arweaveService.isWalletLoaded();
      canUpload = await arweaveService.checkHealth();
    } catch (error) {
      logger.error('Arweave health check failed', { error });
    }

    // Check quota service
    let quotaAvailable = false;
    try {
      quotaAvailable = await quotaService.checkHealth();
    } catch (error) {
      logger.error('Quota service health check failed', { error });
    }

    const healthStatus: HealthStatus = {
      timestamp: new Date().toISOString(),
      bot: {
        isRunning: botStatus.isRunning,
        isProcessing: botStatus.isProcessing,
        uptime: process.uptime(),
      },
      database: {
        connected: dbConnected,
        tablesExist,
      },
      twitter: {
        credentialsValid,
        canPoll,
      },
      screenshot: {
        initialized: screenshotInitialized,
        browserAvailable,
      },
      arweave: {
        walletLoaded,
        canUpload,
      },
      quota: {
        serviceAvailable: quotaAvailable,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
    };

    const duration = Date.now() - startTime;
    logger.info('Health check completed', { duration, healthStatus });

    return healthStatus;

  } catch (error) {
    logger.error('Health check failed', { error });
    throw error;
  }
}

function printHealthStatus(status: HealthStatus): void {
  console.log('\n🏥 Bot Health Check Report');
  console.log('=' .repeat(50));
  console.log(`Timestamp: ${status.timestamp}`);
  console.log(`Duration: ${Date.now() - new Date(status.timestamp).getTime()}ms`);
  
  console.log('\n🤖 Bot Status:');
  console.log(`  Running: ${status.bot.isRunning ? '✅' : '❌'}`);
  console.log(`  Processing: ${status.bot.isProcessing ? '🔄' : '⏸️'}`);
  console.log(`  Uptime: ${Math.floor(status.bot.uptime / 60)} minutes`);

  console.log('\n📊 Database:');
  console.log(`  Connected: ${status.database.connected ? '✅' : '❌'}`);
  console.log(`  Tables Exist: ${status.database.tablesExist ? '✅' : '❌'}`);

  console.log('\n🐦 Twitter:');
  console.log(`  Credentials Valid: ${status.twitter.credentialsValid ? '✅' : '❌'}`);
  console.log(`  Can Poll: ${status.twitter.canPoll ? '✅' : '❌'}`);

  console.log('\n📸 Screenshot Service:');
  console.log(`  Initialized: ${status.screenshot.initialized ? '✅' : '❌'}`);
  console.log(`  Browser Available: ${status.screenshot.browserAvailable ? '✅' : '❌'}`);

  console.log('\n🌐 Arweave:');
  console.log(`  Wallet Loaded: ${status.arweave.walletLoaded ? '✅' : '❌'}`);
  console.log(`  Can Upload: ${status.arweave.canUpload ? '✅' : '❌'}`);

  console.log('\n📈 Quota Service:');
  console.log(`  Available: ${status.quota.serviceAvailable ? '✅' : '❌'}`);

  console.log('\n💻 System:');
  console.log(`  Node Version: ${status.system.nodeVersion}`);
  console.log(`  Uptime: ${Math.floor(status.system.uptime / 60)} minutes`);
  console.log(`  Memory Usage: ${Math.round(status.system.memoryUsage.heapUsed / 1024 / 1024)}MB`);

  // Overall health
  const allServicesHealthy = 
    status.bot.isRunning &&
    status.database.connected &&
    status.twitter.credentialsValid &&
    status.screenshot.initialized &&
    status.arweave.walletLoaded &&
    status.quota.serviceAvailable;

  console.log('\n🎯 Overall Health:');
  console.log(`  Status: ${allServicesHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  
  if (!allServicesHealthy) {
    console.log('\n⚠️  Issues Found:');
    if (!status.database.connected) console.log('  - Database connection failed');
    if (!status.twitter.credentialsValid) console.log('  - Twitter credentials invalid');
    if (!status.screenshot.initialized) console.log('  - Screenshot service not initialized');
    if (!status.arweave.walletLoaded) console.log('  - Arweave wallet not loaded');
    if (!status.quota.serviceAvailable) console.log('  - Quota service unavailable');
  }

  console.log('\n' + '=' .repeat(50));
}

async function main() {
  try {
    const healthStatus = await performHealthCheck();
    printHealthStatus(healthStatus);

    // Exit with appropriate code
    const allServicesHealthy = 
      healthStatus.bot.isRunning &&
      healthStatus.database.connected &&
      healthStatus.twitter.credentialsValid &&
      healthStatus.screenshot.initialized &&
      healthStatus.arweave.walletLoaded &&
      healthStatus.quota.serviceAvailable;

    process.exit(allServicesHealthy ? 0 : 1);

  } catch (error) {
    logger.error('Health check failed', { error });
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { performHealthCheck, printHealthStatus }; 
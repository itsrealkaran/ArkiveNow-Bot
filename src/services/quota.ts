import { botConfig } from '../config';
import databaseService from './database';
import logger from '../utils/logger';
import { QuotaCheck } from '../types';

class QuotaService {
  async checkUserQuota(twitterHandle: string): Promise<QuotaCheck> {
    try {
      // Get or create user
      const user = await databaseService.getOrCreateUser(twitterHandle);
      
      // Get current quota
      const quota = await databaseService.getUserQuota(user.id);
      
      if (!quota) {
        // First time user, allow the request
        return {
          allowed: true,
          daily_remaining: botConfig.maxDailyRequests - 1,
          monthly_remaining: botConfig.maxMonthlyRequests - 1,
        };
      }

      // Check daily quota
      const dailyRemaining = Math.max(0, botConfig.maxDailyRequests - quota.daily_requests);
      const monthlyRemaining = Math.max(0, botConfig.maxMonthlyRequests - quota.monthly_requests);

      // Check if user has exceeded limits
      if (quota.daily_requests >= botConfig.maxDailyRequests) {
        logger.info('User exceeded daily quota', { 
          twitterHandle, 
          dailyRequests: quota.daily_requests,
          maxDaily: botConfig.maxDailyRequests 
        });
        
        return {
          allowed: false,
          daily_remaining: 0,
          monthly_remaining: monthlyRemaining,
          reason: 'Daily quota exceeded',
        };
      }

      if (quota.monthly_requests >= botConfig.maxMonthlyRequests) {
        logger.info('User exceeded monthly quota', { 
          twitterHandle, 
          monthlyRequests: quota.monthly_requests,
          maxMonthly: botConfig.maxMonthlyRequests 
        });
        
        return {
          allowed: false,
          daily_remaining: dailyRemaining,
          monthly_remaining: 0,
          reason: 'Monthly quota exceeded',
        };
      }

      return {
        allowed: true,
        daily_remaining: dailyRemaining,
        monthly_remaining: monthlyRemaining,
      };
    } catch (error) {
      logger.error('Error checking user quota', { twitterHandle, error });
      // In case of error, allow the request to prevent blocking users
      return {
        allowed: true,
        daily_remaining: botConfig.maxDailyRequests,
        monthly_remaining: botConfig.maxMonthlyRequests,
      };
    }
  }

  async incrementUserQuota(twitterHandle: string): Promise<void> {
    try {
      const user = await databaseService.getOrCreateUser(twitterHandle);
      await databaseService.createOrUpdateUserQuota(user.id);
      
      logger.info('Incremented user quota', { twitterHandle, userId: user.id });
    } catch (error) {
      logger.error('Error incrementing user quota', { twitterHandle, error });
    }
  }

  async logQuotaExceeded(twitterHandle: string, tweetId: string, reason: string): Promise<void> {
    try {
      const user = await databaseService.getOrCreateUser(twitterHandle);
      
      await databaseService.logUsage({
        user_id: user.id,
        tweet_id: tweetId,
        event_type: 'quota_exceeded',
        error_message: reason,
      });
      
      logger.info('Logged quota exceeded event', { 
        twitterHandle, 
        tweetId, 
        reason 
      });
    } catch (error) {
      logger.error('Error logging quota exceeded', { twitterHandle, tweetId, error });
    }
  }

  async getQuotaStatus(twitterHandle: string): Promise<{
    daily_used: number;
    daily_remaining: number;
    monthly_used: number;
    monthly_remaining: number;
  }> {
    try {
      const user = await databaseService.getUserByTwitterHandle(twitterHandle);
      if (!user) {
        return {
          daily_used: 0,
          daily_remaining: botConfig.maxDailyRequests,
          monthly_used: 0,
          monthly_remaining: botConfig.maxMonthlyRequests,
        };
      }

      const quota = await databaseService.getUserQuota(user.id);
      if (!quota) {
        return {
          daily_used: 0,
          daily_remaining: botConfig.maxDailyRequests,
          monthly_used: 0,
          monthly_remaining: botConfig.maxMonthlyRequests,
        };
      }

      return {
        daily_used: quota.daily_requests,
        daily_remaining: Math.max(0, botConfig.maxDailyRequests - quota.daily_requests),
        monthly_used: quota.monthly_requests,
        monthly_remaining: Math.max(0, botConfig.maxMonthlyRequests - quota.monthly_requests),
      };
    } catch (error) {
      logger.error('Error getting quota status', { twitterHandle, error });
      return {
        daily_used: 0,
        daily_remaining: botConfig.maxDailyRequests,
        monthly_used: 0,
        monthly_remaining: botConfig.maxMonthlyRequests,
      };
    }
  }

  // Schedule quota resets (to be called by a cron job or scheduler)
  async resetDailyQuotas(): Promise<void> {
    try {
      await databaseService.resetDailyQuotas();
      logger.info('Daily quotas reset successfully');
    } catch (error) {
      logger.error('Error resetting daily quotas', { error });
    }
  }

  async resetMonthlyQuotas(): Promise<void> {
    try {
      await databaseService.resetMonthlyQuotas();
      logger.info('Monthly quotas reset successfully');
    } catch (error) {
      logger.error('Error resetting monthly quotas', { error });
    }
  }
}

// Export singleton instance
export const quotaService = new QuotaService();
export default quotaService; 
import databaseService from './database';
import logger from '../utils/logger';

interface ApiTokens {
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  TWITTER_BEARER_TOKEN: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
}

interface ApiConfig {
  id: string;
  name: string;
  apiTokens: ApiTokens;
  requests: number;
  renewDate: string;
  isActive: boolean;
}

class ApiManager {
  private currentApi: ApiConfig | null = null;

  constructor() {
    // Reset API requests on startup
    this.resetApiRequests();
  }

  /**
   * Get the best available API configuration
   */
  async getAvailableApi(): Promise<ApiConfig | null> {
    try {
      // Reset expired APIs first
      await this.resetApiRequests();
      
      // Get available API from database
      const apiData = await databaseService.getAvailableApi();
      
      if (!apiData) {
        logger.warn('No available API configurations found');
        return null;
      }

      const apiConfig: ApiConfig = {
        id: apiData.id,
        name: apiData.name,
        apiTokens: apiData.api_tokens,
        requests: apiData.requests,
        renewDate: apiData.renew_date,
        isActive: apiData.is_active
      };

      this.currentApi = apiConfig;
      logger.info('Selected API for use', { 
        apiId: apiConfig.id, 
        name: apiConfig.name, 
        requests: apiConfig.requests 
      });

      return apiConfig;
    } catch (error) {
      logger.error('Error getting available API', { error });
      return null;
    }
  }

  /**
   * Increment request count for current API
   */
  async incrementRequests(count: number = 1): Promise<void> {
    if (!this.currentApi) {
      logger.warn('No current API to increment requests for');
      return;
    }

    try {
      // Increment by the specified count
      for (let i = 0; i < count; i++) {
        await databaseService.incrementApiRequests(this.currentApi.id);
        this.currentApi.requests++;
      }
      
      logger.debug('Incremented API requests', { 
        apiId: this.currentApi.id, 
        requests: this.currentApi.requests,
        incrementCount: count
      });
    } catch (error) {
      logger.error('Error incrementing API requests', { error });
    }
  }

  /**
   * Reset API requests for expired renew dates
   */
  async resetApiRequests(): Promise<void> {
    try {
      await databaseService.resetApiRequests();
    } catch (error) {
      logger.error('Error resetting API requests', { error });
    }
  }

  /**
   * Add a new API configuration
   */
  async addApi(name: string, apiTokens: ApiTokens, renewDate: string): Promise<any> {
    try {
      const result = await databaseService.addApi({
        name,
        apiTokens,
        renewDate
      });
      
      logger.info('Added new API configuration', { name, renewDate });
      return result;
    } catch (error) {
      logger.error('Error adding API configuration', { error });
      throw error;
    }
  }

  /**
   * Update an API configuration
   */
  async updateApi(apiId: string, updates: {
    name?: string;
    apiTokens?: ApiTokens;
    renewDate?: string;
    isActive?: boolean;
  }): Promise<void> {
    try {
      await databaseService.updateApi(apiId, updates);
      logger.info('Updated API configuration', { apiId, updates });
    } catch (error) {
      logger.error('Error updating API configuration', { error });
      throw error;
    }
  }

  /**
   * Get all API configurations
   */
  async getAllApis(): Promise<ApiConfig[]> {
    try {
      const apis = await databaseService.getAllApis();
      return apis.map(api => ({
        id: api.id,
        name: api.name,
        apiTokens: api.api_tokens,
        requests: api.requests,
        renewDate: api.renew_date,
        isActive: api.is_active
      }));
    } catch (error) {
      logger.error('Error getting all APIs', { error });
      return [];
    }
  }

  /**
   * Delete an API configuration
   */
  async deleteApi(apiId: string): Promise<void> {
    try {
      await databaseService.deleteApi(apiId);
      logger.info('Deleted API configuration', { apiId });
    } catch (error) {
      logger.error('Error deleting API configuration', { error });
      throw error;
    }
  }

  /**
   * Get current API configuration
   */
  getCurrentApi(): ApiConfig | null {
    return this.currentApi;
  }

  /**
   * Check if current API has requests available
   */
  hasRequestsAvailable(): boolean {
    if (!this.currentApi) return false;
    // Assuming 100 requests per day limit
    return this.currentApi.requests < 100;
  }

  /**
   * Get remaining requests for current API
   */
  getRemainingRequests(): number {
    if (!this.currentApi) return 0;
    return Math.max(0, 100 - this.currentApi.requests);
  }
}

// Export singleton instance
export const apiManager = new ApiManager();
export default apiManager; 
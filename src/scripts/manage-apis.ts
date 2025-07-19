import apiManager from '../services/api-manager';
import logger from '../utils/logger';

async function main() {
  try {
    logger.info('🔧 API Management Script Started');

    // Example: Add a new API configuration
    const newApi = {
      name: 'Twitter API Account 1',
      apiTokens: {
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || '',
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
        TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || '',
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
        TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID || '',
        TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET || '',
      },
      renewDate: '2024-12-31' // Set to your API renewal date
    };

    // Add the API configuration
    const addedApi = await apiManager.addApi(
      newApi.name,
      newApi.apiTokens,
      newApi.renewDate
    );

    logger.info('✅ Added API configuration', { 
      apiId: addedApi.id, 
      name: addedApi.name 
    });

    // List all APIs
    const allApis = await apiManager.getAllApis();
    logger.info('📋 All API configurations:', { 
      count: allApis.length,
      apis: allApis.map(api => ({
        id: api.id,
        name: api.name,
        requests: api.requests,
        renewDate: api.renewDate,
        isActive: api.isActive
      }))
    });

    // Test getting available API
    const availableApi = await apiManager.getAvailableApi();
    if (availableApi) {
      logger.info('✅ Available API found', {
        apiId: availableApi.id,
        name: availableApi.name,
        requests: availableApi.requests,
        remainingRequests: apiManager.getRemainingRequests()
      });
    } else {
      logger.warn('⚠️ No available API found');
    }

    logger.info('✅ API Management Script Completed');

  } catch (error) {
    logger.error('❌ Error in API management script', { error });
    process.exit(1);
  }
}

// Run the script
main(); 
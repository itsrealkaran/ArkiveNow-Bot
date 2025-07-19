import apiManager from '../services/api-manager';
import logger from '../utils/logger';

async function main() {
  try {
    logger.info('🔧 API Management Script Started');

    // Example: Add a new API configuration
    const newApi = {
      name: 'Apectory',
      apiTokens: {
        TWITTER_API_KEY: 'fch1jvD74dqwCCUcHd8Hywman',
        TWITTER_API_SECRET: 'hCPROxXeRzLUSdRkBZN3eWICFQ1xz1Hn99TjP5d9GhY4Oa2Il7',
        TWITTER_ACCESS_TOKEN: '1369963168022237186-kpDKq7B3QPGTACKtgcR1GDVWDj2xR6',
        TWITTER_ACCESS_SECRET: 'hp4H3jSUD0FtK27uWBFN9HAlUe47rf9ivbnkJ4biviDy7',
        TWITTER_BEARER_TOKEN: 'AAAAAAAAAAAAAAAAAAAAAL1ANgEAAAAArVMeGx4ZDWEzkNA%2B2AwfcehvAEo%3DE6cJ8T4cczozeQsvAnVFwHyUkJwhgj87tqwqehCGQIAVPXyrtX',
        TWITTER_CLIENT_ID: '',
        TWITTER_CLIENT_SECRET: '',
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
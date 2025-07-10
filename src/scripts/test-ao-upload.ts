import arweaveService from '../services/arweave';
import { shouldUseAOUpload, formatFileSize } from '../utils/aoupload';
import logger from '../utils/logger';

async function testAOUpload() {
  try {
    logger.info('🧪 Testing AO upload functionality...');
    
    // Check for Arweave wallet configuration
    const walletJson = process.env.ARWEAVE_JWK;
    const keyFile = process.env.ARWEAVE_JWK || 'arweave-key.json';
    
    logger.info('Wallet configuration check:', {
      hasWalletEnv: !!walletJson,
      keyFile,
      hasKeyFile: require('fs').existsSync(keyFile)
    });
    
    if (!walletJson && !require('fs').existsSync(keyFile)) {
      logger.warn('⚠️  No Arweave wallet found!');
      logger.warn('Please set up your Arweave wallet by either:');
      logger.warn('1. Setting ARWEAVE_JWK environment variable');
      logger.warn('2. Creating arweave-key.json file in the project root');
      logger.warn('AO upload tests will fail without wallet configuration.');
    }

    // Test 1: Create a small buffer (under 100KB)
    const smallBuffer = Buffer.alloc(50 * 1024); // 50KB
    logger.info('Testing small file upload', {
      size: smallBuffer.length,
      formattedSize: formatFileSize(smallBuffer.length),
      shouldUseAO: shouldUseAOUpload(smallBuffer.length)
    });

    // Test 2: Create a large buffer (over 100KB)
    const largeBuffer = Buffer.alloc(150 * 1024); // 150KB
    logger.info('Testing large file upload', {
      size: largeBuffer.length,
      formattedSize: formatFileSize(largeBuffer.length),
      shouldUseAO: shouldUseAOUpload(largeBuffer.length)
    });

    // Test 3: Test file size threshold
    const thresholdTest = Buffer.alloc(100 * 1024); // Exactly 100KB
    logger.info('Testing threshold file size', {
      size: thresholdTest.length,
      formattedSize: formatFileSize(thresholdTest.length),
      shouldUseAO: shouldUseAOUpload(thresholdTest.length)
    });

    // Test 4: Test actual upload with small file
    logger.info('Testing small file upload to Arweave...');
    const smallFileResult = await arweaveService.uploadFile(
      smallBuffer,
      'test-small-file.jpg',
      'image/jpeg',
      'Test Small File',
      'A test file under 100KB'
    );

    logger.info('Small file upload result:', {
      success: smallFileResult.success,
      id: smallFileResult.id,
      error: smallFileResult.error
    });

    // Test 5: Test actual upload with large file
    logger.info('Testing large file upload to Arweave...');
    const largeFileResult = await arweaveService.uploadFile(
      largeBuffer,
      'test-large-file.jpg',
      'image/jpeg',
      'Test Large File',
      'A test file over 100KB'
    );

    logger.info('Large file upload result:', {
      success: largeFileResult.success,
      id: largeFileResult.id,
      error: largeFileResult.error
    });

    // Test 6: Test file size formatting
    const testSizes = [1024, 1024 * 1024, 1024 * 1024 * 1024, 500];
    logger.info('Testing file size formatting:');
    testSizes.forEach(size => {
      logger.info(`  ${size} bytes = ${formatFileSize(size)}`);
    });

    logger.info('✅ All AO upload tests completed!');

  } catch (error) {
    logger.error('❌ AO upload test failed:', error);
  }
}

// Run the test
testAOUpload().catch(console.error); 
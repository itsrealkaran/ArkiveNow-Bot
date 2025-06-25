import arweaveService from '../services/arweave';
import logger from '../utils/logger';

async function testArweaveService() {
  try {
    logger.info('🧪 Testing Arweave service...');

    // Test 1: Health check
    logger.info('Testing Arweave health check...');
    const healthCheck = await arweaveService.healthCheck();
    if (healthCheck) {
      logger.info('✅ Arweave health check passed');
    } else {
      logger.warn('⚠️ Arweave health check failed');
    }

    // Test 2: Upload a test file
    logger.info('Testing file upload...');
    const testContent = 'This is a test file for Arweave upload verification.';
    const testBuffer = Buffer.from(testContent, 'utf8');
    
    const uploadResult = await arweaveService.uploadFile(
      testBuffer,
      'test-upload.txt',
      'text/plain',
      'Test Upload',
      'Test file for Arweave service verification'
    );

    if (uploadResult.success && uploadResult.id) {
      logger.info('✅ File uploaded successfully', {
        arweaveId: uploadResult.id,
        url: arweaveService.generateArweaveUrl(uploadResult.id),
      });

      // Test 3: Generate message
      const message = arweaveService.generateUploadMessage(
        uploadResult.id,
        '1234567890123456789',
        'testuser'
      );
      logger.info('Generated upload message:', { message });

      // Test 4: Validate transaction ID
      const isValid = arweaveService.isValidTransactionId(uploadResult.id);
      logger.info('Transaction ID validation', { 
        arweaveId: uploadResult.id, 
        isValid 
      });

    } else {
      logger.error('❌ File upload failed', { error: uploadResult.error });
    }

    // Test 5: Get upload stats
    const stats = await arweaveService.getUploadStats();
    logger.info('Upload statistics', { stats });

    logger.info('🎉 Arweave service test completed');

  } catch (error) {
    logger.error('❌ Arweave service test failed', { error });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testArweaveService();
}

export default testArweaveService; 
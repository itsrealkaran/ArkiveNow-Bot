import { uploadFileTurbo, createArweaveFileData } from '../utils/turbo';
import { ArweaveUploadResult, ScreenshotResult } from '../types';
import logger from '../utils/logger';

class ArweaveService {
  constructor() {
    logger.info('Arweave service initialized');
  }

  /**
   * Upload a screenshot to Arweave
   */
  async uploadScreenshot(
    screenshotResult: ScreenshotResult,
    tweetId: string,
    authorUsername: string,
    tweetText: string
  ): Promise<ArweaveUploadResult> {
    if (!screenshotResult.success || !screenshotResult.buffer) {
      return {
        success: false,
        error: screenshotResult.error || 'No screenshot buffer available',
      };
    }

    try {
      // Create filename with timestamp and tweet ID
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `tweet-${tweetId}-${timestamp}.jpg`;

      // Create title and description
      const title = `Tweet Screenshot - @${authorUsername}`;
      const description = `Screenshot of tweet by @${authorUsername}: ${this.truncateText(tweetText, 200)}`;

      // Create file data
      const fileData = createArweaveFileData(
        screenshotResult.buffer,
        filename,
        'image/jpeg',
        title,
        description
      );

      logger.info('Uploading screenshot to Arweave', {
        tweetId,
        authorUsername,
        filename,
        size: screenshotResult.buffer.length,
      });

      // Upload to Arweave
      const result = await uploadFileTurbo(fileData);

      if (result.success && result.id) {
        logger.info('Screenshot uploaded to Arweave successfully', {
          tweetId,
          arweaveId: result.id,
          filename,
        });
      } else {
        logger.error('Failed to upload screenshot to Arweave', {
          tweetId,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      logger.error('Error uploading screenshot to Arweave', {
        tweetId,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Upload any file to Arweave with custom metadata
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    title?: string,
    description?: string
  ): Promise<ArweaveUploadResult> {
    try {
      const fileData = createArweaveFileData(
        buffer,
        filename,
        contentType,
        title,
        description
      );

      logger.info('Uploading file to Arweave', {
        filename,
        contentType,
        size: buffer.length,
      });

      const result = await uploadFileTurbo(fileData);

      if (result.success && result.id) {
        logger.info('File uploaded to Arweave successfully', {
          filename,
          arweaveId: result.id,
        });
      } else {
        logger.error('Failed to upload file to Arweave', {
          filename,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      logger.error('Error uploading file to Arweave', {
        filename,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate Arweave URL from transaction ID
   */
  generateArweaveUrl(transactionId: string): string {
    return `https://arweave.net/${transactionId}`;
  }

  /**
   * Generate a user-friendly message with Arweave link
   */
  generateUploadMessage(
    arweaveId: string,
    tweetId: string,
    authorUsername: string
  ): string {
    const arweaveUrl = this.generateArweaveUrl(arweaveId);
    return `📸 Screenshot saved! 

Tweet by @${authorUsername} has been preserved on Arweave.

🔗 View: ${arweaveUrl}

#PermaSnap #Arweave`;
  }

  /**
   * Generate error message for failed uploads
   */
  generateErrorMessage(error: string, tweetId: string): string {
    return `❌ Sorry, I couldn't save the screenshot of that tweet.

Error: ${error}

Please try again later or contact support if the issue persists.

Tweet ID: ${tweetId}`;
  }

  /**
   * Validate Arweave transaction ID format
   */
  isValidTransactionId(transactionId: string): boolean {
    // Arweave transaction IDs are base64url encoded and typically 43 characters
    return /^[A-Za-z0-9_-]{43}$/.test(transactionId);
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get upload statistics (for monitoring)
   */
  async getUploadStats(): Promise<{
    totalUploads: number;
    successfulUploads: number;
    failedUploads: number;
    averageFileSize: number;
  }> {
    // This would typically query a database or cache
    // For now, return placeholder stats
    return {
      totalUploads: 0,
      successfulUploads: 0,
      failedUploads: 0,
      averageFileSize: 0,
    };
  }

  /**
   * Health check for Arweave service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to upload a small test file
      const testBuffer = Buffer.from('test');
      const testFileData = createArweaveFileData(
        testBuffer,
        'health-check.txt',
        'text/plain',
        'Health Check',
        'Arweave service health check'
      );

      const result = await uploadFileTurbo(testFileData);
      return result.success;
    } catch (error) {
      logger.error('Arweave health check failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const arweaveService = new ArweaveService();
export default arweaveService;
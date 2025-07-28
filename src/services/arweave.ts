import { uploadFileTurbo, createArweaveFileData } from '../utils/turbo';
import { uploadFileAO, shouldUseAOUpload, formatFileSize } from '../utils/aoupload';
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

      const fileSize = screenshotResult.buffer.length;
      const formattedSize = formatFileSize(fileSize);
      
      logger.info('Preparing screenshot upload', {
        tweetId,
        authorUsername,
        filename,
        size: fileSize,
        formattedSize,
        useAO: shouldUseAOUpload(fileSize)
      });

      let result: ArweaveUploadResult;

      // Check if we should use AO upload for larger files
      if (shouldUseAOUpload(fileSize)) {
        logger.info('Using AO upload for large file', {
          tweetId,
          size: formattedSize,
          threshold: '100KB'
        });

        // Use AO upload for larger files
        const aoResult = await uploadFileAO(
          screenshotResult.buffer,
          filename,
          'image/jpeg',
          title,
          description
        );

        result = {
          success: aoResult.success,
          ...(aoResult.id && { id: aoResult.id }),
          ...(aoResult.error && { error: aoResult.error })
        };
      } else {
        logger.info('Using Turbo upload for small file', {
          tweetId,
          size: formattedSize
        });

        // Use Turbo upload for smaller files
        const fileData = createArweaveFileData(
          screenshotResult.buffer,
          filename,
          'image/jpeg',
          title,
          description
        );

        result = await uploadFileTurbo(fileData);
      }

      if (result.success && result.id) {
        logger.info('Screenshot uploaded to Arweave successfully', {
          tweetId,
          arweaveId: result.id,
          filename,
          method: shouldUseAOUpload(fileSize) ? 'AO' : 'Turbo',
          size: formattedSize
        });
      } else {
        logger.error('Failed to upload screenshot to Arweave', {
          tweetId,
          error: result.error,
          method: shouldUseAOUpload(fileSize) ? 'AO' : 'Turbo'
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
      const fileSize = buffer.length;
      const formattedSize = formatFileSize(fileSize);
      
      logger.info('Preparing file upload', {
        filename,
        contentType,
        size: fileSize,
        formattedSize,
        useAO: shouldUseAOUpload(fileSize)
      });

      let result: ArweaveUploadResult;

      // Check if we should use AO upload for larger files
      if (shouldUseAOUpload(fileSize)) {
        logger.info('Using AO upload for large file', {
          filename,
          size: formattedSize,
          threshold: '100KB'
        });

        // Use AO upload for larger files
        const aoResult = await uploadFileAO(
          buffer,
          filename,
          contentType,
          title || filename,
          description || 'File uploaded to Arweave'
        );

        result = {
          success: aoResult.success,
          ...(aoResult.id && { id: aoResult.id }),
          ...(aoResult.error && { error: aoResult.error })
        };
      } else {
        logger.info('Using Turbo upload for small file', {
          filename,
          size: formattedSize
        });

        // Use Turbo upload for smaller files
        const fileData = createArweaveFileData(
          buffer,
          filename,
          contentType,
          title,
          description
        );

        result = await uploadFileTurbo(fileData);
      }

      if (result.success && result.id) {
        logger.info('File uploaded to Arweave successfully', {
          filename,
          arweaveId: result.id,
          method: shouldUseAOUpload(fileSize) ? 'AO' : 'Turbo',
          size: formattedSize
        });
      } else {
        logger.error('Failed to upload file to Arweave', {
          filename,
          error: result.error,
          method: shouldUseAOUpload(fileSize) ? 'AO' : 'Turbo'
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
   * Generate a user-friendly, dynamic message with Arweave link (ArkiveNow penguin style)
   */
  generateUploadMessage(
    arweaveId: string,
    tweetId: string,
    authorUsername: string,
    requester: string
  ): string {
    const arweaveUrl = this.generateArweaveUrl(arweaveId);
    const arkiveNowUrl = `https://arkivenow.com/arkive/${arweaveId}`;

    // Dynamic intros with username personalization
    const intros = [
      `🐧 Chill @${authorUsername}! Your tweet is now safe in the Arkive.`,
      `❄️ Ice cold @${authorUsername}! This moment is now frozen forever.`,
      `🧊 Penguin-approved preservation complete for @${authorUsername}.`,
      `📦 @${authorUsername}, your tweet has been packed in the ArkiveNow icebox.`,
      `🐧 The ArkiveNow penguin has archived @${authorUsername}'s tweet.`,
      `🐧 @${authorUsername}, your memory is now on ice—permanently!`,
      `❄️ The penguin has slid @${authorUsername}'s tweet into the vault.`,
      `🧊 Another tweet from @${authorUsername}, perfectly preserved by ArkiveNow.`,
    ];

    // Dynamic outros
    const outros = [
      `Stay frosty @${requester}. #ArkiveNow`,
      `Cool moves @${requester}. This tweet is now immortal. #ArkiveNow`,
      `The penguin never forgets @${requester}. #ArkiveNow`,
      `Glide on @${requester}, this tweet is safe. #ArkiveNow`,
      `Keep it cool @${requester}. #ArkiveNow`,
      `Preserved with penguin precision for @${requester}. #ArkiveNow`,
    ];

    // Pick random intro and outro
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const outro = outros[Math.floor(Math.random() * outros.length)];

    return `${intro}\n\n🔗 [View on ArkiveNow](${arkiveNowUrl})\n\n${outro}`;
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

  /**
   * Check if Arweave wallet is loaded
   */
  isWalletLoaded(): boolean {
    try {
      // Check if the ARWEAVE_JWK environment variable is set and valid
      const jwk = process.env.ARWEAVE_JWK;
      if (!jwk) {
        return false;
      }

      // Try to parse the JWK to validate it
      const parsedJwk = JSON.parse(jwk);
      return !!(parsedJwk && parsedJwk.kty && parsedJwk.n);
    } catch (error) {
      logger.error('Failed to validate Arweave wallet', { error });
      return false;
    }
  }

  /**
   * Check health of Arweave service (alias for healthCheck)
   */
  async checkHealth(): Promise<boolean> {
    return this.healthCheck();
  }
}

// Export singleton instance
export const arweaveService = new ArweaveService();
export default arweaveService;
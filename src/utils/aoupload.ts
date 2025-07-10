import { spawn } from "@permaweb/aoconnect";
import { createDataItemSigner } from "@permaweb/aoconnect";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import logger from './logger';

// Polyfill crypto for aoconnect library
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

// AO configuration
const AO_CONFIG = {
  module: "Do_Uc2Sju_ffp6Ev0AnLVdPtot15rvMjP-a9VVaA5fM",
  scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
  assetSrc: "Fmtgzy1Chs-5ZuUwHpQjQrQ7H7v1fjsP0Bi8jVaDIKA",
  defaultToken: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10",
  ucm: "U3TjJAZWJjlWBB4KAXSHKzuky81jtyh0zqH8rUL4Wd0",
  pixl: "DM3FoZUq_yebASPhgd8pEIRIzDW6muXEhxz5-JwbZwo",
  collectionsRegistry: "TFWDmf8a3_nw43GCm_CuYlYoylHAjCcFGbgHfDaGcsg",
  collectionSrc: "2ZDuM2VUCN8WHoAKOOjiH4_7Apq0ZHKnTWdLppxCdGY",
  profileRegistry: "SNy4m-DrqxWl01YqGM4sxI8qCni-58re8uuJLvZPypY",
  profileSrc: "_R2XYWDPUXVvQrQKFaQRvDTDcDwnQNbqlTd_qvCRSpQ",
  collection: "PxzVQgaVXhtwiM7J6Eljk-D8g1WKp9f8Ke4PjgAA10mc",
} as const;

export const AO = AO_CONFIG;

export interface AOUploadResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Get server-side Arweave wallet from environment or key file
 */
async function getServerWallet(): Promise<any> {
  try {
    // First try to get from environment variable
    const walletJson = process.env.ARWEAVE_JWK;
    if (walletJson) {
      logger.info('Using Arweave wallet from environment variable');
      return JSON.parse(walletJson);
    }

    // Then try to get from key file
    const keyFilePath = process.env.ARWEAVE_KEY_FILE || path.join(process.cwd(), 'arweave-key.json');
    if (fs.existsSync(keyFilePath)) {
      logger.info('Using Arweave wallet from key file', { keyFilePath });
      const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
      return JSON.parse(keyFileContent);
    }

    throw new Error('No Arweave wallet found. Please set ARWEAVE_JWK environment variable or create arweave-key.json file.');
  } catch (error) {
    logger.error('Failed to load Arweave wallet', { error });
    throw error;
  }
}

export async function uploadFileAO(
  buffer: Buffer,
  filename: string,
  contentType: string = "image/jpeg",
  title: string = "Tweet Screenshot",
  description: string = "Screenshot of a tweet preserved on Arweave"
): Promise<AOUploadResult> {
  try {
    logger.info('Starting AO upload', {
      filename,
      contentType,
      size: buffer.length,
      title,
      description
    });

    // Check if we're in the browser (this is for server-side use)
    // if (typeof window !== 'undefined') {
    //   throw new Error('This function is designed for server-side use');
    // }

    // Get server-side wallet
    const wallet = await getServerWallet();
    const signer = createDataItemSigner(wallet);
    logger.info('Server wallet loaded and signer created');

    // spawn process to upload file data to Arweave
    logger.info('Uploading file to Arweave...');
    
    // Sanitize tag values to avoid Unicode escape issues
    const sanitizedTitle = title.replace(/[^\x00-\x7F]/g, ''); // Remove non-ASCII characters
    const sanitizedDescription = description.replace(/[^\x00-\x7F]/g, ''); // Remove non-ASCII characters
    
    const assetProcess = await spawn({
      module: AO_CONFIG.module,
      scheduler: AO_CONFIG.scheduler,
      signer: signer,
      tags: [
        { name: "App-Name", value: "ArkiveNow" },
        { name: "Implements", value: "ANS-110" },
        { name: "Content-Type", value: contentType },
        { name: "Title", value: sanitizedTitle },
        { name: "Description", value: sanitizedDescription },
      ],
      data: buffer
    });

    logger.info('assetProcess created with ID:', assetProcess);
    return {
      success: true,
      id: assetProcess // This is your transaction ID (xid)
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'AO upload failed';
    logger.error('Error uploading file to Arweave:', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if file size requires AO upload (over 100KB)
 */
export function shouldUseAOUpload(fileSize: number): boolean {
  const AO_UPLOAD_THRESHOLD = 100 * 1024; // 100KB
  return fileSize > AO_UPLOAD_THRESHOLD;
}

/**
 * Get file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 
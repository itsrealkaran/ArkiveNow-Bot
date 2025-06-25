'use server'

import { ArweaveSigner, TurboFactory } from '@ardrive/turbo-sdk';
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { arweaveConfig } from '../config';
import { ArweaveUploadResult, ArweaveFileData } from '../types';
import logger from './logger';

// Parse JWK from environment
let jwk: any;
try {
  jwk = JSON.parse(arweaveConfig.jwk);
} catch (error) {
  logger.error('Failed to parse ARWEAVE_JWK environment variable', { error });
  throw new Error('Failed to parse ARWEAVE_JWK environment variable');
}

export async function uploadFileTurbo(fileData: ArweaveFileData): Promise<ArweaveUploadResult> {
  let tempPath: string | null = null;
  
  try {
    // Write buffer to temp file
    tempPath = join(tmpdir(), fileData.filename);
    await writeFile(tempPath, fileData.buffer);

    const turbo = TurboFactory.authenticated({ 
      signer: new ArweaveSigner(jwk)
    });

    const res = await turbo.uploadFile({
      fileStreamFactory: () => createReadStream(tempPath!),
      fileSizeFactory: () => fileData.buffer.length,
      dataItemOpts: {
        tags: [
          { name: "App-Name", value: "Twitter-Screenshot-Bot" },
          { name: "Implements", value: "ANS-110" },
          { name: "Content-Type", value: fileData.contentType },
          { name: "Title", value: fileData.title || "Tweet Screenshot" },
          { name: "Description", value: fileData.description || "Screenshot of a tweet" },
        ],
      }
    });

    logger.info('File uploaded to Arweave successfully', { 
      id: res.id, 
      filename: fileData.filename,
      size: fileData.buffer.length 
    });

    return { success: true, id: res.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    logger.error('Arweave upload failed', { 
      error: errorMessage, 
      filename: fileData.filename 
    });
    return { success: false, error: errorMessage };
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file', { tempPath, error: cleanupError });
      }
    }
  }
}

// Helper function to create file data from buffer
export function createArweaveFileData(
  buffer: Buffer, 
  filename: string, 
  contentType: string = 'image/png',
  title?: string,
  description?: string
): ArweaveFileData {
  const fileData: ArweaveFileData = {
    buffer,
    filename,
    contentType,
  };
  
  if (title !== undefined) {
    fileData.title = title;
  }
  
  if (description !== undefined) {
    fileData.description = description;
  }
  
  return fileData;
} 
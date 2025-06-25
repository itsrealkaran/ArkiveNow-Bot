import winston from 'winston';
import { loggingConfig } from '../config';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: loggingConfig.level,
  format: fileFormat,
  defaultMeta: { service: 'twitter-screenshot-bot' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// If we're not in production, log to console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Create logs directory if it doesn't exist
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

if (!existsSync('logs')) {
  mkdir('logs').catch(console.error);
}

// Helper methods for specific log types
export const logEvent = (event: string, data?: Record<string, any>) => {
  logger.info(`Event: ${event}`, data);
};

export const logError = (error: Error | string, context?: Record<string, any>) => {
  if (typeof error === 'string') {
    logger.error(error, context);
  } else {
    logger.error(error.message, { 
      stack: error.stack,
      ...context 
    });
  }
};

export const logTwitterAction = (action: string, tweetId: string, userId: string) => {
  logger.info(`Twitter ${action}`, { tweetId, userId });
};

export const logArweaveAction = (action: string, fileId: string, result: string) => {
  logger.info(`Arweave ${action}`, { fileId, result });
};

export const logQuotaCheck = (userId: string, allowed: boolean, reason?: string) => {
  logger.info(`Quota check for user ${userId}`, { allowed, reason });
};

export default logger; 
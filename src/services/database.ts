import { Pool } from 'pg';
import { databaseConfig } from '../config';
import logger from '../utils/logger';
import { User, UsageLog, UserQuota } from '../types';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: databaseConfig.url,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err });
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      logger.info('✅ Database connected successfully');
      client.release();
    } catch (error) {
      logger.error('❌ Failed to connect to database', { error });
      throw error;
    }
  }

  async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          author_id VARCHAR(32) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create usage_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS usage_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tweet_id VARCHAR(255) NOT NULL,
          event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('success', 'error', 'quota_exceeded')),
          arweave_id VARCHAR(255),
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create user_quotas table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_quotas (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          daily_requests INTEGER DEFAULT 0,
          monthly_requests INTEGER DEFAULT 0,
          last_request_date DATE DEFAULT CURRENT_DATE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_author_id ON users(author_id);
      `);

      await client.query('COMMIT');
      logger.info('✅ Database tables initialized successfully');
    } finally {
      client.release();
    }
  }

  async getUserByAuthorId(authorId: string): Promise<User | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE author_id = $1',
        [authorId]
      );
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createUser(authorId: string): Promise<User> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'INSERT INTO users (author_id) VALUES ($1) RETURNING *',
        [authorId]
      );
      
      logger.info('Created new user', { authorId, userId: result.rows[0].id });
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getOrCreateUser(authorId: string): Promise<User> {
    const existingUser = await this.getUserByAuthorId(authorId);
    if (existingUser) {
      return existingUser;
    }
    return await this.createUser(authorId);
  }

  async logUsage(usageLog: Omit<UsageLog, 'id' | 'created_at'>): Promise<UsageLog> {
    const user = await this.getOrCreateUser(usageLog.user_id);
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `INSERT INTO usage_logs (user_id, tweet_id, event_type, arweave_id, error_message)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [user.id, usageLog.tweet_id, usageLog.event_type, usageLog.arweave_id, usageLog.error_message]
      );
      
      logger.info('Logged usage', { 
        userId: user.id, 
        tweetId: usageLog.tweet_id, 
        eventType: usageLog.event_type 
      });
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getUserQuota(authorId: string): Promise<UserQuota | null> {
    const user = await this.getOrCreateUser(authorId);
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM user_quotas WHERE user_id = $1',
        [user.id]
      );
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createOrUpdateUserQuota(authorId: string): Promise<UserQuota> {
    const user = await this.getOrCreateUser(authorId);
    const client = await this.pool.connect();
    
    try {
      // Try to insert, if exists then update
      const result = await client.query(
        `INSERT INTO user_quotas (user_id, daily_requests, monthly_requests, last_request_date)
         VALUES ($1, 1, 1, CURRENT_DATE)
         ON CONFLICT (user_id) DO UPDATE SET
           daily_requests = CASE 
             WHEN user_quotas.last_request_date = CURRENT_DATE 
             THEN user_quotas.daily_requests + 1 
             ELSE 1 
           END,
           monthly_requests = CASE 
             WHEN DATE_TRUNC('month', user_quotas.last_request_date) = DATE_TRUNC('month', CURRENT_DATE)
             THEN user_quotas.monthly_requests + 1 
             ELSE 1 
           END,
           last_request_date = CURRENT_DATE,
           updated_at = NOW()
         RETURNING *`,
        [user.id]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async resetDailyQuotas(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `UPDATE user_quotas 
         SET daily_requests = 0, updated_at = NOW()
         WHERE last_request_date < CURRENT_DATE`
      );
      
      logger.info('Reset daily quotas for users');
    } finally {
      client.release();
    }
  }

  async resetMonthlyQuotas(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `UPDATE user_quotas 
         SET monthly_requests = 0, updated_at = NOW()
         WHERE DATE_TRUNC('month', last_request_date) < DATE_TRUNC('month', CURRENT_DATE)`
      );
      
      logger.info('Reset monthly quotas for users');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  async checkTablesExist(): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      // Check if all required tables exist
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'usage_logs', 'user_quotas')
      `);
      
      const existingTables = result.rows.map(row => row.table_name);
      const requiredTables = ['users', 'usage_logs', 'user_quotas'];
      const allTablesExist = requiredTables.every(table => existingTables.includes(table));
      
      logger.info('Database tables check', { 
        existingTables, 
        requiredTables, 
        allTablesExist 
      });
      
      return allTablesExist;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export default databaseService; 
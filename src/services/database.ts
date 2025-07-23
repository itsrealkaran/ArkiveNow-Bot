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
          username VARCHAR,
          name VARCHAR,
          profile_image_url VARCHAR,
          verified BOOLEAN,
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

      // Create apis table to store multiple API configurations
      await client.query(`
        CREATE TABLE IF NOT EXISTS apis (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          api_tokens JSONB NOT NULL,
          requests INTEGER DEFAULT 0,
          renew_date DATE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create tweets table to store all tweet data
      await client.query(`
        CREATE TABLE IF NOT EXISTS tweets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tweet_id VARCHAR(255) UNIQUE NOT NULL,
          author_id VARCHAR(255) NOT NULL,
          username VARCHAR,
          text TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL,
          public_metrics JSONB,
          author_data JSONB,
          media_data JSONB,
          includes_data JSONB,
          screenshot_arweave_id VARCHAR(255),
          screenshot_created_at TIMESTAMP WITH TIME ZONE,
          processing_status VARCHAR(50) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'upload_failed', 'fetch_failed', 'other_failed')),
          error_message TEXT,
          created_at_db TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Remove referenced_tweets column if it exists
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tweets' AND column_name='referenced_tweets') THEN
            ALTER TABLE tweets DROP COLUMN referenced_tweets;
          END IF;
        END$$;
      `);

      // Add username column if it doesn't exist
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tweets' AND column_name='username') THEN
            ALTER TABLE tweets ADD COLUMN username VARCHAR;
          END IF;
        END$$;
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_author_id ON users(author_id);
        CREATE INDEX IF NOT EXISTS idx_tweets_tweet_id ON tweets(tweet_id);
        CREATE INDEX IF NOT EXISTS idx_tweets_author_id ON tweets(author_id);
        CREATE INDEX IF NOT EXISTS idx_tweets_processing_status ON tweets(processing_status);
        CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
        CREATE INDEX IF NOT EXISTS idx_tweets_screenshot_created_at ON tweets(screenshot_created_at);
        CREATE INDEX IF NOT EXISTS idx_apis_is_active ON apis(is_active);
        CREATE INDEX IF NOT EXISTS idx_apis_renew_date ON apis(renew_date);
        CREATE INDEX IF NOT EXISTS idx_apis_requests ON apis(requests);
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
        AND table_name IN ('users', 'usage_logs', 'user_quotas', 'tweets')
      `);
      
      const existingTables = result.rows.map(row => row.table_name);
      const requiredTables = ['users', 'usage_logs', 'user_quotas', 'tweets'];
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

  async upsertUserByUsername(user: {
    username: string;
    author_id?: string;
    name?: string;
    profile_image_url?: string;
    verified?: boolean;
  }): Promise<User> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (username, author_id, name, profile_image_url, verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (username) DO UPDATE SET
           author_id = EXCLUDED.author_id,
           name = EXCLUDED.name,
           profile_image_url = EXCLUDED.profile_image_url,
           verified = EXCLUDED.verified,
           updated_at = NOW()
         RETURNING *`,
        [
          user.username,
          user.author_id || null,
          user.name || null,
          user.profile_image_url || null,
          user.verified ?? null
        ]
      );
      logger.info('Upserted user', { username: user.username, userId: result.rows[0].id });
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // Tweet storage methods
  async storeTweet(tweetData: {
    tweet_id: string;
    author_id: string;
    username?: string;
    text: string;
    created_at: string;
    public_metrics?: any;
    author_data?: any;
    media_data?: any;
    includes_data?: any;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO tweets (
          tweet_id, author_id, username, text, created_at, public_metrics, 
          author_data, media_data, includes_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tweet_id) DO UPDATE SET
          author_id = EXCLUDED.author_id,
          username = EXCLUDED.username,
          text = EXCLUDED.text,
          public_metrics = EXCLUDED.public_metrics,
          author_data = EXCLUDED.author_data,
          media_data = EXCLUDED.media_data,
          includes_data = EXCLUDED.includes_data,
          updated_at = NOW()`,
        [
          tweetData.tweet_id,
          tweetData.author_id,
          tweetData.username || (tweetData.author_data?.username ?? null),
          tweetData.text,
          tweetData.created_at,
          JSON.stringify(tweetData.public_metrics),
          JSON.stringify(tweetData.author_data),
          JSON.stringify(tweetData.media_data),
          JSON.stringify(tweetData.includes_data)
        ]
      );
      logger.info('Stored tweet data', { tweetId: tweetData.tweet_id });
    } finally {
      client.release();
    }
  }

  async getTweetByTweetId(tweetId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM tweets WHERE tweet_id = $1',
        [tweetId]
      );
      const row = result.rows[0] || null;
      if (!row) return null;
      // Reconstruct OptimizedTweet from DB row
      const includes = row.includes_data || {};
      return {
        id: row.tweet_id,
        content: row.text,
        created_at: row.created_at,
        metrics: row.public_metrics,
        author: row.author_data,
        media: row.media_data,
        quoted_tweet_id: includes.quoted_tweet_id || null,
        quoted_tweet: includes.quoted_tweet || null,
        poll: includes.poll || null,
        article: includes.article || null
      };
    } finally {
      client.release();
    }
  }

  async updateTweetProcessingStatus(
    tweetId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'upload_failed' | 'fetch_failed' | 'other_failed',
    arweaveId?: string,
    errorMessage?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const updateData: any = {
        processing_status: status,
        updated_at: new Date()
      };

      if (status === 'completed' && arweaveId) {
        updateData.screenshot_arweave_id = arweaveId;
        updateData.screenshot_created_at = new Date();
      }

      if ((status === 'failed' || status === 'upload_failed' || status === 'fetch_failed' || status === 'other_failed') && errorMessage) {
        updateData.error_message = errorMessage;
      }

      const setClause = Object.keys(updateData)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');

      await client.query(
        `UPDATE tweets SET ${setClause} WHERE tweet_id = $1`,
        [tweetId, ...Object.values(updateData)]
      );
      
      logger.info('Updated tweet processing status', { 
        tweetId, 
        status, 
        arweaveId: arweaveId || null 
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get tweets that need retry based on their failure type
   */
  async getTweetsForRetry(): Promise<{
    uploadRetry: any[];
    fetchRetry: any[];
    otherRetry: any[];
  }> {
    const client = await this.pool.connect();
    
    try {
      // Get tweets that failed upload (screenshot exists, upload failed)
      const uploadRetryResult = await client.query(`
        SELECT * FROM tweets 
        WHERE processing_status = 'upload_failed' 
        ORDER BY updated_at ASC
      `);

      // Get tweets that failed fetch (no screenshot, fetch failed)
      const fetchRetryResult = await client.query(`
        SELECT * FROM tweets 
        WHERE processing_status = 'fetch_failed' 
        ORDER BY updated_at ASC
      `);

      // Get tweets that failed other operations (need full reprocessing)
      const otherRetryResult = await client.query(`
        SELECT * FROM tweets 
        WHERE processing_status = 'other_failed' 
        ORDER BY updated_at ASC
      `);

      return {
        uploadRetry: uploadRetryResult.rows,
        fetchRetry: fetchRetryResult.rows,
        otherRetry: otherRetryResult.rows
      };
    } finally {
      client.release();
    }
  }

  async getTweetsByStatus(status: 'pending' | 'processing' | 'completed' | 'failed' | 'upload_failed' | 'fetch_failed' | 'other_failed', limit = 100): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM tweets WHERE processing_status = $1 ORDER BY created_at_db DESC LIMIT $2',
        [status, limit]
      );
      
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTweetsByAuthorId(authorId: string, limit = 50): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM tweets WHERE author_id = $1 ORDER BY created_at DESC LIMIT $2',
        [authorId, limit]
      );
      
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTweetStats(): Promise<{
    total_tweets: number;
    completed_tweets: number;
    failed_tweets: number;
    pending_tweets: number;
    processing_tweets: number;
    upload_failed_tweets: number;
    fetch_failed_tweets: number;
    other_failed_tweets: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_tweets,
          COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_tweets,
          COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_tweets,
          COUNT(CASE WHEN processing_status = 'pending' THEN 1 END) as pending_tweets,
          COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as processing_tweets,
          COUNT(CASE WHEN processing_status = 'upload_failed' THEN 1 END) as upload_failed_tweets,
          COUNT(CASE WHEN processing_status = 'fetch_failed' THEN 1 END) as fetch_failed_tweets,
          COUNT(CASE WHEN processing_status = 'other_failed' THEN 1 END) as other_failed_tweets
        FROM tweets
      `);
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getLatestTweetTimestamp(): Promise<string | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT created_at 
        FROM tweets 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      return result.rows[0]?.created_at || null;
    } finally {
      client.release();
    }
  }

  async getLatestMentionTimestamp(): Promise<string | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT MAX(created_at) as latest_mention_time
        FROM usage_logs
        WHERE event_type = 'success'
      `);
      
      return result.rows[0]?.latest_mention_time || null;
    } finally {
      client.release();
    }
  }

  // API Management Methods
  async getAvailableApi(): Promise<any | null> {
    const client = await this.pool.connect();
    
    try {
      // Get the API with the least requests that is active and not expired
      const result = await client.query(`
        SELECT * FROM apis 
        WHERE is_active = true 
        AND renew_date >= CURRENT_DATE
        ORDER BY requests ASC, renew_date ASC
        LIMIT 1
      `);
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async incrementApiRequests(apiId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        'UPDATE apis SET requests = requests + 1, updated_at = NOW() WHERE id = $1',
        [apiId]
      );
    } finally {
      client.release();
    }
  }

  async resetApiRequests(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Reset requests for APIs where renew_date has passed
      await client.query(`
        UPDATE apis 
        SET requests = 0, updated_at = NOW() 
        WHERE renew_date < CURRENT_DATE
      `);
      
      logger.info('Reset API requests for expired renew dates');
    } finally {
      client.release();
    }
  }

  async addApi(apiData: {
    name: string;
    apiTokens: any;
    renewDate: string;
  }): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `INSERT INTO apis (name, api_tokens, renew_date) 
         VALUES ($1, $2, $3) RETURNING *`,
        [apiData.name, JSON.stringify(apiData.apiTokens), apiData.renewDate]
      );
      
      logger.info('Added new API configuration', { name: apiData.name });
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateApi(apiId: string, updates: {
    name?: string;
    apiTokens?: any;
    renewDate?: string;
    isActive?: boolean;
  }): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates)
        .map((key, index) => {
          if (key === 'apiTokens') return `api_tokens = $${index + 2}`;
          if (key === 'renewDate') return `renew_date = $${index + 2}`;
          if (key === 'isActive') return `is_active = $${index + 2}`;
          return `${key} = $${index + 2}`;
        })
        .join(', ');

      const values = Object.values(updates).map(value => 
        typeof value === 'object' ? JSON.stringify(value) : value
      );

      await client.query(
        `UPDATE apis SET ${setClause}, updated_at = NOW() WHERE id = $1`,
        [apiId, ...values]
      );
      
      logger.info('Updated API configuration', { apiId });
    } finally {
      client.release();
    }
  }

  async getAllApis(): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM apis ORDER BY name');
      return result.rows;
    } finally {
      client.release();
    }
  }

  async deleteApi(apiId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('DELETE FROM apis WHERE id = $1', [apiId]);
      logger.info('Deleted API configuration', { apiId });
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export default databaseService; 
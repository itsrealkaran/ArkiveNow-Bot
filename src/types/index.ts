// Twitter Types
export interface TwitterMention {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{
    type: 'replied_to' | 'retweeted' | 'quoted';
    id: string;
  }>;
  author?: TwitterUser;
}

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  verified?: boolean;
}

export interface TwitterMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  author?: TwitterUser;
  media?: TwitterMedia[];
}

// Database Types
export interface User {
  id: string;
  author_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface UsageLog {
  id: string;
  user_id: string;
  tweet_id: string;
  event_type: 'success' | 'error' | 'quota_exceeded';
  arweave_id?: string;
  error_message?: string;
  created_at: Date;
}

export interface UserQuota {
  user_id: string;
  daily_requests: number;
  monthly_requests: number;
  last_request_date: Date;
}

// Arweave Types
export interface ArweaveUploadResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface ArweaveFileData {
  buffer: Buffer;
  filename: string;
  contentType: string;
  title?: string;
  description?: string;
}

// Screenshot Types
export interface ScreenshotResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'png' | 'jpeg' | 'webp';
}

// Bot Response Types
export interface BotResponse {
  success: boolean;
  message: string;
  arweave_id?: string;
  error?: string;
}

// Quota Types
export interface QuotaCheck {
  allowed: boolean;
  daily_remaining: number;
  monthly_remaining: number;
  reason?: string;
}

// Event Types
export type EventType = 
  | 'mention_received'
  | 'screenshot_taken'
  | 'arweave_uploaded'
  | 'reply_sent'
  | 'quota_exceeded'
  | 'error_occurred';

export interface BotEvent {
  type: EventType;
  user_id: string;
  tweet_id: string;
  timestamp: Date;
  data?: Record<string, any>;
  error?: string;
} 
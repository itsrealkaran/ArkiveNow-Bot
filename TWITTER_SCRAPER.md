# Twitter Scraper Service

This service provides an alternative to the Twitter API for monitoring mentions when API rate limits are too restrictive.

## ⚠️ Important Disclaimer

**This service scrapes Twitter's web interface, which is against Twitter's Terms of Service.** Use at your own risk. Your account could be suspended or banned if detected.

## Features

- ✅ **No API Rate Limits**: Scrapes the web interface directly
- ✅ **Full Mention Data**: Gets all mentions as they appear in the UI
- ✅ **Session Management**: Saves and restores login sessions
- ✅ **Optimized Output**: Converts scraped data to the same format as the API
- ✅ **Polling Support**: Continuous monitoring with configurable intervals

## Setup

### 1. Install Dependencies

Puppeteer is already included in the project dependencies.

### 2. Initial Setup

Run the setup script to login and save your session:

```bash
npm run setup-scraper
```

This will:

- Prompt for your Twitter username/email and password
- Attempt to login to Twitter
- Save the session cookies for future use
- Test the mentions scraping

### 3. Test the Service

```bash
npm run test-scraper
```

## Usage

### Basic Usage

```typescript
import twitterScraperService from './services/twitter-scraper';

// Restore session
const restored = await twitterScraperService.restoreSession();
if (!restored) {
  // Need to login again
  await twitterScraperService.login(username, password);
}

// Get mentions
const mentions = await twitterScraperService.getMentions();

// Convert to optimized format
const optimizedMentions =
  twitterScraperService.convertToOptimizedTweets(mentions);
```

### Polling for Mentions

```typescript
// Start polling
await twitterScraperService.startPolling(async (mentions) => {
  // Process mentions here
  console.log('New mentions:', mentions.length);

  for (const mention of mentions) {
    // Process each mention
    console.log('Mention from:', mention.author.username);
    console.log('Content:', mention.content);
  }
});
```

## Data Structure

The scraper extracts the following data:

```typescript
interface ScrapedMention {
  id: string; // Tweet ID
  content: string; // Tweet text
  created_at: string; // ISO timestamp
  author: {
    id: string; // Username (used as ID)
    username: string; // Username
    name: string; // Display name
    profile_picture: string; // Profile image URL
    verified: boolean; // Verification status
    verification_type: string; // 'blue', 'business', etc.
  };
  parent_tweet_id?: string; // Parent tweet ID (if reply)
  media: Array<{
    type: string; // 'photo', 'video', etc.
    url?: string; // Media URL
    preview_image_url?: string; // Preview image URL
  }>;
  metrics: {
    replies: number; // Reply count
    retweets: number; // Retweet count
    likes: number; // Like count
    quotes: number; // Quote count
    bookmarks: number; // Bookmark count
    impressions: number; // Impression count
  };
}
```

## Limitations

### What the Scraper Can Do

- ✅ Extract tweet IDs
- ✅ Get author information (username, name, profile picture)
- ✅ Detect verification status
- ✅ Extract tweet content
- ✅ Identify parent tweets (replies)
- ✅ Extract media URLs
- ✅ Get basic metrics (limited)

### What the Scraper Cannot Do

- ❌ Get exact user IDs (uses username as ID)
- ❌ Get detailed metrics (uses defaults)
- ❌ Get quoted tweet details (only parent tweet ID)
- ❌ Get poll data
- ❌ Get article information
- ❌ Handle 2FA automatically

## Configuration

The scraper uses the same polling interval as the API service:

```typescript
// From botConfig
pollingInterval: 910000, // 15 minutes
```

## Troubleshooting

### Login Issues

- **2FA Enabled**: Temporarily disable 2FA for setup
- **Account Locked**: Check if your account is suspended
- **Wrong Credentials**: Double-check username/password

### Session Issues

- **Expired Session**: Run setup again to login
- **Invalid Cookies**: Delete `session-cookies.json` and re-login

### Scraping Issues

- **No Mentions Found**: Check if you have any mentions
- **Page Not Loading**: Check internet connection
- **Selectors Broken**: Twitter may have updated their UI

## Security Considerations

1. **Session Storage**: Session cookies are stored locally in `session-cookies.json`
2. **Credentials**: Never commit credentials to version control
3. **Rate Limiting**: The scraper includes delays to avoid detection
4. **Account Risk**: Using this service may violate Twitter's TOS

## Integration with Bot

To integrate with the existing bot:

```typescript
// In your bot service
import twitterScraperService from './services/twitter-scraper';

// Replace API service with scraper
const mentions = await twitterScraperService.getMentions();
const optimizedMentions =
  twitterScraperService.convertToOptimizedTweets(mentions);

// Process mentions as before
for (const mention of optimizedMentions) {
  // Your existing processing logic
}
```

## Files

- `src/services/twitter-scraper.ts` - Main scraper service
- `src/scripts/setup-scraper.ts` - Setup script
- `src/scripts/test-twitter-scraper.ts` - Test script
- `session-cookies.json` - Saved session (created after setup)

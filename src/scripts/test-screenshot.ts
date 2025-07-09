import screenshotService from '../services/screenshot';
import logger from '../utils/logger';
import { TwitterTweet } from '../types';

interface TestTweet {
  name: string;
  tweet: TwitterTweet;
  description: string;
}

async function testScreenshotService() {
  try {
    logger.info('🧪 Testing screenshot service with various tweet types...');

    // Initialize screenshot service
    logger.info('Initializing screenshot service...');
    await screenshotService.initialize();
    logger.info('✅ Screenshot service initialized');

    // Define different test tweets
    const testTweets: TestTweet[] = [
      {
        name: 'Short Tweet',
        tweet: {
      id: '1234567890123456789',
          text: 'Just a quick update! 🚀',
          author_id: 'testuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'testuser',
            username: 'testuser',
            name: 'Test User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1234567890/test_normal.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 5,
            reply_count: 2,
            like_count: 25,
            quote_count: 1,
          },
        },
        description: 'Simple short tweet with basic engagement and user info'
      },
      {
        name: 'Long Tweet',
        tweet: {
          id: '1234567890123456790',
          text: 'This is a much longer tweet that demonstrates how the screenshot service handles text wrapping and multiple lines. It should properly wrap the text and adjust the image height accordingly. The design should look clean and professional even with longer content. #testing #screenshot #longtweet',
          author_id: 'longtweetuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'longtweetuser',
            username: 'longtweetuser',
            name: 'Long Tweet User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1234567891/long_normal.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 15,
            reply_count: 8,
            like_count: 89,
            quote_count: 3,
          },
        },
        description: 'Long tweet with text wrapping and multiple lines'
      },
      {
        name: 'High Engagement Tweet',
        tweet: {
          id: '1234567890123456791',
          text: 'Breaking: Major announcement coming soon! 🔥 This is going to be huge for our community. Stay tuned for updates. #breaking #announcement #excited',
          author_id: 'viraluser',
          created_at: new Date().toISOString(),
          author: {
            id: 'viraluser',
            username: 'viraluser',
            name: 'Viral User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 15420,
            reply_count: 892,
            like_count: 45678,
            quote_count: 2341,
          },
        },
        description: 'Tweet with very high engagement numbers'
      },
      {
        name: 'Minimal Engagement Tweet',
        tweet: {
          id: '1234567890123456792',
          text: 'Just thinking out loud... 🤔',
          author_id: 'quietuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'quietuser',
            username: 'quietuser',
            name: 'Quiet User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1234567893/quiet_normal.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 0,
            reply_count: 0,
            like_count: 0,
            quote_count: 0,
          },
        },
        description: 'Tweet with no engagement metrics'
      },
      {
        name: 'Tweet with Special Characters',
        tweet: {
          id: '1234567890123456793',
          text: 'Testing special characters: @username #hashtag $BTC €EUR £GBP 100% ✅ ❌ 🎉 🚀 📱 💻 🌟',
          author_id: 'specialuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'specialuser',
            username: 'specialuser',
            name: 'Special User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1234567894/special_normal.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 12,
            reply_count: 5,
            like_count: 67,
            quote_count: 2,
          },
        },
        description: 'Tweet with various special characters and emojis'
      },
      {
        name: 'Very Long Username Tweet',
        tweet: {
          id: '1234567890123456794',
          text: 'Testing with a very long username to see how the layout handles it.',
          author_id: 'verylongusername123456789',
          created_at: new Date().toISOString(),
          author: {
            id: 'verylongusername123456789',
            username: 'verylongusername123456789',
            name: 'Very Long Username User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 3,
            reply_count: 1,
            like_count: 18,
            quote_count: 0,
          },
        },
        description: 'Tweet with very long username'
      },
      {
        name: 'Tweet Without User Info',
        tweet: {
          id: '1234567890123456796',
          text: 'This tweet has no user information to test fallback behavior.',
          author_id: 'unknownuser',
          created_at: new Date().toISOString(),
          public_metrics: {
            retweet_count: 7,
            reply_count: 3,
            like_count: 42,
            quote_count: 1,
          },
        },
        description: 'Tweet without author information to test fallback'
      },
      {
        name: 'Tweet With Media',
        tweet: {
          id: '1234567890123456797',
          text: 'Check out this amazing image! 📸 #media #testing',
          author_id: 'mediauser',
          created_at: new Date().toISOString(),
          author: {
            id: 'mediauser',
            username: 'mediauser',
            name: 'Media User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          media: [
            {
              media_key: '3_1234567890123456789',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 1200,
              height: 800,
              alt_text: 'A beautiful example image',
            }
          ],
          public_metrics: {
            retweet_count: 23,
            reply_count: 8,
            like_count: 156,
            quote_count: 4,
          },
        },
        description: 'Tweet with single photo media'
      },
      {
        name: 'Tweet With Multiple Media',
        tweet: {
          id: '1234567890123456798',
          text: 'Here are some amazing photos! 📸📸📸 #multiple #media',
          author_id: 'multimediauser',
          created_at: new Date().toISOString(),
          author: {
            id: 'multimediauser',
            username: 'multimediauser',
            name: 'Multi Media User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          media: [
            {
              media_key: '3_1234567890123456790',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 800,
              height: 600,
              alt_text: 'First photo description',
            },
            {
              media_key: '3_1234567890123456791',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 600,
              height: 800,
              alt_text: 'Second photo description',
            },
            {
              media_key: '3_1234567890123456792',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 1000,
              height: 500,
              alt_text: 'Third photo description',
            }
          ],
          public_metrics: {
            retweet_count: 45,
            reply_count: 12,
            like_count: 234,
            quote_count: 8,
          },
        },
        description: 'Tweet with multiple photos in grid layout'
      },
      {
        name: 'Tweet With Video',
        tweet: {
          id: '1234567890123456799',
          text: 'Check out this awesome video! 🎥 #video #content',
          author_id: 'videouser',
          created_at: new Date().toISOString(),
          author: {
            id: 'videouser',
            username: 'videouser',
            name: 'Video User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          media: [
            {
              media_key: '3_1234567890123456793',
              type: 'video',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 1920,
              height: 1080,
              alt_text: 'An awesome video with amazing content',
            }
          ],
          public_metrics: {
            retweet_count: 67,
            reply_count: 15,
            like_count: 456,
            quote_count: 12,
          },
        },
        description: 'Tweet with video media'
      },
      {
        name: 'Tweet With GIF',
        tweet: {
          id: '1234567890123456800',
          text: 'This GIF is hilarious! 😂 #gif #funny',
          author_id: 'gifuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'gifuser',
            username: 'gifuser',
            name: 'GIF User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          media: [
            {
              media_key: '3_1234567890123456794',
              type: 'animated_gif',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 480,
              height: 270,
              alt_text: 'A funny animated GIF',
            }
          ],
          public_metrics: {
            retweet_count: 89,
            reply_count: 23,
            like_count: 789,
            quote_count: 18,
          },
        },
        description: 'Tweet with animated GIF'
      },
      {
        name: 'Tweet With Four Photos',
        tweet: {
          id: '1234567890123456801',
          text: 'Four amazing photos! 📸📸📸📸 #four #photos',
          author_id: 'fourmediauser',
          created_at: new Date().toISOString(),
          author: {
            id: 'fourmediauser',
            username: 'fourmediauser',
            name: 'Four Media User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          media: [
            {
              media_key: '3_1234567890123456795',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 600,
              height: 600,
              alt_text: 'First photo',
            },
            {
              media_key: '3_1234567890123456796',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 600,
              height: 600,
              alt_text: 'Second photo',
            },
            {
              media_key: '3_1234567890123456797',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 600,
              height: 600,
              alt_text: 'Third photo',
            },
            {
              media_key: '3_1234567890123456798',
              type: 'photo',
              url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              preview_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
              width: 600,
              height: 600,
              alt_text: 'Fourth photo',
            }
          ],
          public_metrics: {
            retweet_count: 123,
            reply_count: 34,
            like_count: 567,
            quote_count: 23,
          },
        },
        description: 'Tweet with exactly four photos in 2x2 grid'
      },
      {
        name: 'Tweet With Real Profile Picture',
        tweet: {
          id: '1234567890123456802',
          text: 'Testing with a real profile picture! 👤 #profile #testing',
          author_id: 'realprofileuser',
          created_at: new Date().toISOString(),
          author: {
            id: 'realprofileuser',
            username: 'realprofileuser',
            name: 'Real Profile User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/1940352680846635008/gMK5JINJ_400x400.jpg',
            verified: true,
          },
          public_metrics: {
            retweet_count: 5,
            reply_count: 2,
            like_count: 18,
            quote_count: 1,
          },
        },
        description: 'Tweet with real profile picture URL to test image loading'
      }
    ];

    // Test each tweet type
    for (const testCase of testTweets) {
      logger.info(`\n📝 Testing: ${testCase.name}`);
      logger.info(`Description: ${testCase.description}`);
      
      try {
        const result = await screenshotService.takeScreenshot(testCase.tweet);

        if (result.success && result.buffer) {
          const sizeKB = (result.buffer.length / 1024).toFixed(2);
          logger.info('✅ Screenshot generated successfully', {
            tweetType: testCase.name,
            size: `${sizeKB}KB`,
            tweetId: testCase.tweet.id,
            textLength: testCase.tweet.text.length,
          });

          // Save to temp file for inspection
          const filename = `test-${testCase.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.jpg`;
          const tempPath = await screenshotService.saveScreenshot(result.buffer, filename);
          logger.info('Screenshot saved', { tempPath });
        } else {
          logger.error('❌ Screenshot failed', { 
            tweetType: testCase.name,
            error: result.error 
          });
        }
      } catch (error) {
        logger.error('❌ Test case failed', { 
          tweetType: testCase.name,
          error 
        });
      }
    }



    // Cleanup
    await screenshotService.cleanup();
    logger.info('\n✅ All screenshot service tests completed successfully');

  } catch (error) {
    logger.error('❌ Screenshot service test failed', { error });
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testScreenshotService();
}

export default testScreenshotService; 
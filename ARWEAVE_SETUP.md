# Arweave Wallet Setup for AO Upload

This guide explains how to set up your Arweave wallet for AO upload functionality in the Twitter Screenshot Bot.

## Overview

The bot uses AO (Arweave Oracle) upload for large files (>100KB) and Turbo upload for small files (<100KB). AO upload requires an Arweave wallet for authentication.

## Setup Options

### Option 1: Environment Variable (Recommended)

1. **Generate Arweave Wallet** (if you don't have one):

   ```bash
   # Install Arweave CLI
   npm install -g arweave

   # Generate a new wallet
   arweave generate-wallet
   ```

2. **Export Wallet to Environment**:
   ```bash
   # Copy the wallet JSON to your .env file
   echo "ARWEAVE_JWK='{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\",\"d\":\"...\",\"p\":\"...\",\"q\":\"...\",\"dp\":\"...\",\"dq\":\"...\",\"qi\":\"...\"}'" >> .env
   ```

### Option 2: Key File

1. **Create Key File**:

   ```bash
   # Create arweave-key.json in project root
   touch arweave-key.json
   ```

2. **Add Wallet JSON**:

   ```json
   {
     "kty": "RSA",
     "n": "your-public-key-n",
     "e": "AQAB",
     "d": "your-private-key-d",
     "p": "your-private-key-p",
     "q": "your-private-key-q",
     "dp": "your-private-key-dp",
     "dq": "your-private-key-dq",
     "qi": "your-private-key-qi"
   }
   ```

3. **Set Custom Path** (optional):
   ```bash
   # In your .env file
   ARWEAVE_KEY_FILE=/path/to/your/arweave-key.json
   ```

## Testing

Run the AO upload test to verify your setup:

```bash
npm run test-ao-upload
```

## Security Notes

- **Never commit your wallet file** to version control
- **Use environment variables** in production
- **Keep your private key secure**
- **Add arweave-key.json to .gitignore**

## File Size Thresholds

- **< 100KB**: Uses Turbo upload (fast)
- **≥ 100KB**: Uses AO upload (robust)

## Troubleshooting

### "No Arweave wallet found"

- Check that your wallet JSON is properly formatted
- Verify the environment variable is set correctly
- Ensure the key file exists and is readable

### "AO upload failed"

- Check your internet connection
- Verify your wallet has sufficient AR tokens
- Check the logs for specific error messages

## Example .env Configuration

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bot

# Twitter API
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret

# Arweave Wallet (for AO upload)
ARWEAVE_JWK={"kty":"RSA","n":"...","e":"AQAB","d":"...","p":"...","q":"...","dp":"...","dq":"...","qi":"..."}
```

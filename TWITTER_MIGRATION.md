# Twitter Service Migration Guide

This guide explains how to migrate from the `twitter-api-v2` package to direct fetch calls.

## 📋 Overview

We've created a new Twitter service (`twitter-v2.ts`) that uses direct fetch calls instead of the `twitter-api-v2` package. This provides better maintainability and control over the API interactions.

## 🗂️ Files Created

### New Service

- `src/services/twitter-v2.ts` - New service with direct fetch implementation
- `src/scripts/test-twitter-v2.ts` - Test script for the new service
- `src/scripts/compare-twitter-services.ts` - Comparison script

### Updated

- `package.json` - Added new test scripts

## 🧪 Testing

### 1. Test the New Service

```bash
npm run test-twitter-v2
```

### 2. Compare Both Services

```bash
npm run compare-twitter
```

### 3. Test the Original Service

```bash
npm run test-twitter
```

## 🔄 Migration Steps

### Phase 1: Testing (Current)

1. ✅ Create new service with direct fetch
2. ✅ Add test scripts
3. ✅ Test functionality
4. ✅ Compare with original service

### Phase 2: Switch Implementation

1. **Backup current service:**

   ```bash
   cp src/services/twitter.ts src/services/twitter.ts.bak
   ```

2. **Replace with new implementation:**

   ```bash
   cp src/services/twitter-v2.ts src/services/twitter.ts
   ```

3. **Update imports if needed** (should be minimal since interface is identical)

4. **Test thoroughly:**
   ```bash
   npm run test-twitter
   npm run test-bot
   ```

### Phase 3: Cleanup

1. **Remove old dependency:**

   ```bash
   npm uninstall twitter-api-v2
   ```

2. **Remove backup files:**
   ```bash
   rm src/services/twitter.ts.bak
   rm src/services/twitter-v2.ts
   rm src/scripts/test-twitter-v2.ts
   rm src/scripts/compare-twitter-services.ts
   ```

## 🔧 Key Differences

### Authentication

- **Old**: Uses `twitter-api-v2` client with OAuth 1.0a
- **New**: Uses direct fetch with Bearer token

### Rate Limiting

- **Old**: Handled by the package
- **New**: Custom implementation with exponential backoff

### Error Handling

- **Old**: Package-specific error types
- **New**: Standard HTTP error handling

## 📊 Benefits

### ✅ Advantages of Direct Fetch

- **Better control** over API calls
- **No dependency** on unmaintained package
- **Customizable** rate limiting and error handling
- **Smaller bundle size** (no external package)
- **Easier debugging** with standard HTTP requests

### ⚠️ Considerations

- **More code** to maintain
- **Manual implementation** of rate limiting
- **Need to handle** API changes manually

## 🚀 Quick Migration

If you want to switch immediately:

```bash
# 1. Test the new service
npm run test-twitter-v2

# 2. If tests pass, backup and switch
cp src/services/twitter.ts src/services/twitter.ts.bak
cp src/services/twitter-v2.ts src/services/twitter.ts

# 3. Test the switch
npm run test-twitter

# 4. If everything works, remove the dependency
npm uninstall twitter-api-v2
```

## 🔍 Monitoring

After migration, monitor:

- **API response times**
- **Rate limiting behavior**
- **Error rates**
- **Bot functionality**

## 📝 Rollback Plan

If issues arise:

```bash
# Restore original service
cp src/services/twitter.ts.bak src/services/twitter.ts

# Reinstall dependency
npm install twitter-api-v2
```

## 🎯 Next Steps

1. **Test thoroughly** in development
2. **Monitor** in production after switch
3. **Remove old dependency** once stable
4. **Update documentation** as needed

# Azure Environment Variables Example

## Add These to Your `.env` File

Copy these lines and add them to `AI_powered/.env`:

```env
# ====================================
# Azure Document Intelligence Config
# ====================================

# Your Azure Document Intelligence endpoint URL
# Format: https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com/

# Your Azure Document Intelligence API key (32 characters)
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_32_character_key_here
```

## How to Get Your Values

### 1. Endpoint

1. Go to https://portal.azure.com
2. Open your **Document Intelligence** resource
3. Click **"Keys and Endpoint"** in left sidebar
4. Copy the **"Endpoint"** value
5. Paste into `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`

**Example**: `https://my-form-recognizer.cognitiveservices.azure.com/`

### 2. API Key

1. Same page (**"Keys and Endpoint"**)
2. Copy **"KEY 1"** or **"KEY 2"**
3. Paste into `AZURE_DOCUMENT_INTELLIGENCE_KEY`

**Example**: `a1b2c3d4e5f6789012345678901234567890abcd`

## Complete Example

```env
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://my-form-recognizer.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=a1b2c3d4e5f6789012345678901234567890abcd
```

## After Adding

**Restart your server:**

```powershell
# Stop (Ctrl+C)
npm start
```

## Verify It's Working

Upload a PDF and check logs for:

```
[HYBRID] 🚀 Running Azure Document Intelligence as PRIMARY method...
[AZURE-DI] ✅ Azure Document Intelligence client initialized
```

## Notes

- ✅ Region is embedded in endpoint URL (no separate variable needed)
- ✅ Free tier: 500 pages/month
- ✅ If not configured: System falls back to OCR/AI (still works!)
- ⚠️ Don't commit `.env` to git (it's in `.gitignore`)


# WAC/RCW Compliance System - Complete Flow Explanation

## ❌ CURRENT ISSUE (FIXED)

**Error**: `getEmbedding is not a function`

**Root Cause**: The `wacRcwCompliance.service.js` tried to import `getEmbedding` from `embedding.service.js`, but it was never exported from that file.

**Fix Applied**: Added OpenAI embeddings directly to `wacRcwCompliance.service.js` using LangChain's `OpenAIEmbeddings`.

---

## 📋 COMPLETE FLOW

### 1️⃣ **PDF UPLOAD TRIGGER**
When you upload a PDF to `/api/embeddings/upload`:

```
User uploads PDF 
    ↓
embedding.service.js:processPdfAndStore()
    ↓
    ├─ Upload PDF to S3
    ├─ Extract text with PDF.js
    ├─ Store embeddings in PostgreSQL
    └─ Queue background job for schema generation ✅
        ↓
        backgroundJobQueue.addSchemaGenerationJob()
```

**File**: `AI_powered/src/services/embedding.service.js` (lines 118-128)

---

### 2️⃣ **BACKGROUND SCHEMA GENERATION** (Where Compliance Happens)
The background job processes immediately after upload:

```
Background Job Starts
    ↓
ai.service.js:generateFormSchema()
    ↓
    ├─ Fetch all PDF embeddings from tenant
    ├─ Find relevant WAC/RCW regulations ← COMPLIANCE STARTS HERE
    │   ↓
    │   wacRcwCompliance.service.js:findRelevantRegulations()
    │   ↓
    │   ├─ Create embedding for form context
    │   ├─ Search PostgreSQL vector DB for similar regulations
    │   └─ Return top 5 most relevant regulations
    │
    ├─ Pass regulations to GPT-4o for schema generation
    │   ↓
    │   System Prompt includes:
    │   - WAC/RCW regulations text
    │   - Instructions to attach citations to fields
    │   - Compliance requirements
    │
    ├─ GPT-4o generates schema with:
    │   {
    │     "label": "Resident Name",
    │     "name": "resident_name",
    │     "wacCitation": "WAC 388-76-10650",
    │     "rcwCitation": "RCW 70.128.120",
    │     "complianceNote": "Required by law"
    │   }
    │
    └─ Save schema to database with compliance metadata:
        - isWacRcwCompliant: true
        - complianceVersion: "1.0"
        - lastComplianceCheck: timestamp
        - adminApproved: false (pending HITL review)
```

**Files**:
- `AI_powered/src/services/ai.service.js` (lines 156-320)
- `AI_powered/src/services/wacRcwCompliance.service.js` (lines 350-385)

---

### 3️⃣ **WHERE COMPLIANCE DATA IS SAVED**

#### A. **Schema Saved in `tenant_form_schemas` Table**
```sql
INSERT INTO tenant_form_schemas (
  id,
  tenantId,
  formName,
  description,
  schemaJson,  ← Contains ALL field definitions with citations
  isWacRcwCompliant,  ← TRUE if compliance applied
  complianceVersion,   ← "1.0"
  lastComplianceCheck, ← Timestamp
  adminApproved,       ← FALSE (pending review)
  createdAt,
  updatedAt
)
```

**What's in `schemaJson`?**
```json
{
  "fields": [
    {
      "label": "Resident Name",
      "name": "resident_name",
      "type": "text",
      "required": true,
      "wacCitation": "WAC 388-76-10650",
      "rcwCitation": "RCW 70.128.120",
      "complianceNote": "Required for resident records"
    }
  ]
}
```

#### B. **Regulations Saved in `wac_rcw_regulations` Table**
This is the vector database where all WAC/RCW regulations are stored:

```sql
CREATE TABLE wac_rcw_regulations (
  id TEXT PRIMARY KEY,
  type TEXT,                -- 'wac' or 'rcw'
  citeCode TEXT,            -- '388-76-10650'
  section TEXT,
  title TEXT,
  text TEXT,                -- Regulation content (chunked)
  effectiveDate TEXT,
  version TEXT,
  source TEXT,              -- 'api' or 'web'
  lastFetched TIMESTAMP,
  chunkIndex INTEGER,       -- Which chunk (0, 1, 2...)
  totalChunks INTEGER,      -- Total chunks for this regulation
  embedding VECTOR(1536),   -- OpenAI embedding for semantic search
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

---

### 4️⃣ **CRON JOB FLOW** (Monthly Updates)

```
📅 Cron Job Runs (1st of every month at 2 AM)
    ↓
regulationMonitoring.job.js:runRegulationUpdate()
    ↓
    ├─ Check if regulations exist
    │   ↓
    │   Count records in wac_rcw_regulations table
    │   If 0 → Initialize regulations (first-time setup)
    │
    ├─ Fetch latest regulations from WA LawDoc API
    │   ↓
    │   For each WAC/RCW cite code:
    │   - Fetch from API or web scrape
    │   - Compare effectiveDate with stored version
    │   - If newer → Update regulation
    │
    ├─ Update PostgreSQL vector database
    │   ↓
    │   - Delete old chunks
    │   - Insert new chunks with embeddings
    │
    ├─ Find schemas affected by regulation changes
    │   ↓
    │   wacRcwCompliance.service.js:checkForRegulationUpdates()
    │   ↓
    │   Query all tenant_form_schemas where:
    │   - isWacRcwCompliant = true
    │   - complianceVersion is outdated
    │
    └─ Mark schemas for revalidation
        ↓
        UPDATE tenant_form_schemas
        SET adminApproved = false
        WHERE schema uses outdated regulations
```

**Cron Schedule**: `0 2 1 * *` (2 AM on 1st of every month)

**File**: `AI_powered/src/jobs/regulationMonitoring.job.js`

---

## 🔄 INITIALIZATION FLOW (First Server Start)

```
Server Starts
    ↓
server.js:startRegulationMonitoring()
    ↓
regulationMonitoring.job.js:initializeRegulationsIfNeeded()
    ↓
    ├─ Check if regulations exist in PostgreSQL
    │   ↓
    │   SELECT COUNT(*) FROM wac_rcw_regulations
    │
    ├─ If count = 0 → Run initialization
    │   ↓
    │   wacRcwCompliance.service.js:initializeRegulations()
    │   ↓
    │   ├─ Fetch all 14 WAC regulations
    │   ├─ Fetch all 8 RCW regulations
    │   ├─ Chunk each regulation (500-1000 tokens)
    │   ├─ Generate embeddings for each chunk
    │   └─ Store in wac_rcw_regulations table
    │
    └─ Schedule monthly cron job
```

**Time to Initialize**: ~5-10 minutes (fetching 22 regulations, chunking, embedding)

---

## 📊 YOUR CURRENT LOGS EXPLAINED

### Line 493: `[WAC-RCW] ❌ Failed to find relevant regulations: getEmbedding is not a function`
- **Why**: `getEmbedding` was not exported from `embedding.service.js`
- **Impact**: Regulations couldn't be searched
- **Result**: Schema generated with 0 regulations found

### Line 495: `[SCHEMA-GEN] ✅ Found 0 relevant regulations`
- **Why**: The error above caused no regulations to be found
- **Impact**: GPT-4o generated schema without compliance context

### Lines 631-636: Compliance Summary Shows Mock Data
```
[COMPLIANCE] 🏛️ WAC/RCW Compliance Summary:
  - Total fields: 26
  - Fields with citations: 26 (100.0%)
  - Unique WAC citations: 2
  - WAC: WAC 388-76-10650, WAC 388-76-10800
```
- **Why**: GPT-4o was instructed to add citations even without regulation data
- **Impact**: Citations are **MOCK/HALLUCINATED** by AI, not from real regulations
- **Solution**: After fix, real regulations will be used

---

## ✅ AFTER FIX (What Will Happen)

### 1. **First Server Start**
```
✅ Check wac_rcw_regulations table → empty
✅ Fetch 22 regulations from WA state websites
✅ Chunk into ~50-100 pieces
✅ Generate embeddings (takes 5-10 minutes)
✅ Store in PostgreSQL
```

### 2. **Next PDF Upload**
```
✅ Upload PDF
✅ Extract text
✅ Background job starts schema generation
✅ Find relevant regulations (vector search) → REAL DATA!
✅ Pass regulations to GPT-4o
✅ Generate schema with REAL citations
✅ Save to database with isWacRcwCompliant=true
```

### 3. **Monthly Cron Job**
```
✅ Fetch latest regulations
✅ Compare versions
✅ Update if needed
✅ Mark affected schemas for review
```

---

## 🎯 NEXT STEPS

1. **Restart your server** to apply the fix
2. **Wait 5-10 minutes** for regulations to initialize (only first time)
3. **Upload a new PDF** to see real compliance citations
4. **Check schema** in database to see `wacCitation` and `rcwCitation` fields

---

## 🛠️ HOW TO CHECK IF IT WORKED

### Check if regulations are initialized:
```sql
SELECT COUNT(*) FROM wac_rcw_regulations;
-- Should return 50-100 rows (chunked regulations)
```

### Check schema compliance:
```sql
SELECT 
  id, 
  formName, 
  isWacRcwCompliant, 
  complianceVersion, 
  adminApproved
FROM tenant_form_schemas
ORDER BY createdAt DESC
LIMIT 1;
```

### Check field citations:
```sql
SELECT schemaJson->'fields'->0->'wacCitation' as first_field_citation
FROM tenant_form_schemas
ORDER BY createdAt DESC
LIMIT 1;
```

---

## 📚 FILES INVOLVED

| File | Purpose |
|------|---------|
| `embedding.service.js` | Uploads PDF, triggers schema generation |
| `ai.service.js` | Generates schema with compliance |
| `wacRcwCompliance.service.js` | Fetches/stores/searches regulations |
| `regulationMonitoring.job.js` | Cron job for monthly updates |
| `server.js` | Initializes compliance on startup |
| `prisma/schema.prisma` | Database schema for regulations & form schemas |

---

## 🎉 SUMMARY

**Compliance applies**: ✅ During schema generation (background job after PDF upload)  
**Compliance saved**: ✅ In `tenant_form_schemas.schemaJson` (field citations) + compliance metadata  
**Regulations stored**: ✅ In `wac_rcw_regulations` table (vector database)  
**Cron job**: ✅ Runs monthly to update regulations and revalidate schemas  
**Current issue**: ❌ FIXED - `getEmbedding` now available in compliance service  


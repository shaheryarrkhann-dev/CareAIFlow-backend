/**
 * Field Name Normalization and Deduplication Utilities
 * Handles semantic understanding of field names, deduplication, and filtering
 */

/**
 * Normalize field name with semantic understanding
 * Extracts semantic meaning and handles variations intelligently
 * @param {string} fieldName - Original field name
 * @returns {string|null} - Normalized field name, or null if generic/too vague
 */
function normalizeFieldNameSemantic(fieldName) {
  if (!fieldName) return null;

  // Step 1: Basic normalization
  let normalized = fieldName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s]/g, "");

  // Step 2: Normalize numbers (One→1, Two→2, Three→3, etc.)
  const numberMap = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
    fifth: "5",
  };

  for (const [word, num] of Object.entries(numberMap)) {
    // Replace whole words only (not substrings)
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), num);
  }

  // Step 3: Normalize plural/singular variations
  // Remove trailing 's' if it's a plural (but keep if it's part of the word)
  normalized = normalized.replace(/\b(\w+)s\b/g, (match, word) => {
    // Keep common plurals that are different words
    const keepPlurals = ["address", "class", "pass", "mass", "glass", "grass"];
    if (keepPlurals.includes(word)) return match;
    // Otherwise normalize to singular
    return word;
  });

  // Step 4: Remove common prefixes/suffixes
  let cleaned = normalized
    .replace(/^\*+|\*+$/g, "") // Remove asterisks
    .replace(/^additional_/, "")
    .replace(/_additional$/, "")
    .replace(/_copy$/, "")
    .replace(/_duplicate$/, "")
    .replace(/_initial$/, "")
    .replace(/_initials$/, "")
    .replace(/^resident_initial/, "resident")
    .replace(/^guardian_initial/, "guardian")
    .replace(/^phone\s*:?\s*$/, "") // Remove generic "phone :"
    .replace(/^address\s*:?\s*$/, "") // Remove generic "address:"
    .trim();

  // Generic single-word fields without context → return null (should be filtered)
  const genericWords = ["date", "name", "phone", "address", "email"];
  if (genericWords.includes(cleaned) || cleaned === "date*") {
    return null; // Mark for removal
  }

  // For all fields, just normalize format (no hardcoded field names)
  // The semantic similarity function will handle matching using patterns
  return cleaned.replace(/\s+/g, "_").replace(/_+/g, "_");
}

/**
 * Check if two fields are semantically similar
 * @param {Object} field1 - First field object
 * @param {Object} field2 - Second field object
 * @returns {boolean} - True if fields are similar
 */
function areFieldsSimilar(field1, field2) {
  const norm1 = normalizeFieldNameSemantic(
    field1.name || field1.fieldName || ""
  );
  const norm2 = normalizeFieldNameSemantic(
    field2.name || field2.fieldName || ""
  );

  // If either is null (generic field), handle specially
  if (!norm1 || !norm2) {
    // Generic fields should be merged with context-specific ones
    const field1Name = (field1.name || field1.fieldName || "").toLowerCase();
    const field2Name = (field2.name || field2.fieldName || "").toLowerCase();

    if (!norm1 && norm2 && field1Name.includes("date")) {
      // Generic "date" can merge with specific date field
      return true;
    }
    if (!norm2 && norm1 && field2Name.includes("date")) {
      return true;
    }
    return false;
  }

  // Exact match
  if (norm1 === norm2) return true;

  // Date field variations - extract base category (dynamic, pattern-based)
  if (norm1.includes("date") && norm2.includes("date")) {
    // Extract base by removing date-related words (start, end, of, the)
    const base1 = norm1
      .replace(/_(start|end|of|the).*date/, "_date")
      .replace(/^date_of_/, "");
    const base2 = norm2
      .replace(/_(start|end|of|the).*date/, "_date")
      .replace(/^date_of_/, "");

    if (base1 === base2) {
      return true;
    }

    // Extract category (everything before "date")
    const category1 = norm1
      .replace(/_date.*$/, "")
      .replace(/^date_of_/, "")
      .trim();
    const category2 = norm2
      .replace(/_date.*$/, "")
      .replace(/^date_of_/, "")
      .trim();

    if (category1 && category2 && category1 === category2) {
      return true;
    }
  }

  // Name field variations - dynamic pattern matching (no hardcoded prefixes)
  if (norm1.includes("name") && norm2.includes("name")) {
    // Extract category by removing "name" (pattern-based, no hardcoded prefixes)
    const category1 = norm1
      .replace(/_name.*$/, "")
      .replace(/^name_/, "")
      .trim();
    const category2 = norm2
      .replace(/_name.*$/, "")
      .replace(/^name_/, "")
      .trim();

    if (category1 && category2) {
      // Remove numbers and compare base (handles "party_1" vs "party_one")
      const base1 = category1.replace(/\d/g, "").trim();
      const base2 = category2.replace(/\d/g, "").trim();

      if (base1 === base2 && base1.length > 0) {
        return true;
      }

      // Direct match
      if (category1 === category2) {
        return true;
      }
    }
  }

  // Phone field variations - dynamic pattern matching (removes type variations)
  if (norm1.includes("phone") && norm2.includes("phone")) {
    // Remove phone type variations (home, work, cell, mobile, etc.) - pattern-based
    const base1 = norm1
      .replace(/_phone.*$/, "")
      .replace(/^phone_/, "")
      .replace(/_home$/, "")
      .replace(/_work$/, "")
      .replace(/_cell$/, "")
      .replace(/_mobile$/, "")
      .replace(/^wk\s*/, "")
      // Remove person names (pattern: firstname_lastname_)
      .replace(/^[a-z]+_[a-z]+_/, "");
    const base2 = norm2
      .replace(/_phone.*$/, "")
      .replace(/^phone_/, "")
      .replace(/_home$/, "")
      .replace(/_work$/, "")
      .replace(/_cell$/, "")
      .replace(/_mobile$/, "")
      .replace(/^wk\s*/, "")
      // Remove person names (pattern: firstname_lastname_)
      .replace(/^[a-z]+_[a-z]+_/, "");

    if (base1 && base2 && base1 === base2) {
      return true;
    }
  }

  // Address field variations - dynamic pattern matching
  if (norm1.includes("address") && norm2.includes("address")) {
    const base1 = norm1.replace(/_address.*$/, "").replace(/^address_/, "");
    const base2 = norm2.replace(/_address.*$/, "").replace(/^address_/, "");

    if (base1 && base2 && base1 === base2) {
      return true;
    }
  }

  // Signature field variations - dynamic pattern matching (no hardcoded prefixes)
  if (norm1.includes("signature") && norm2.includes("signature")) {
    // Extract base by removing "signature" (pattern-based, no hardcoded prefixes)
    const base1 = norm1
      .replace(/_signature.*$/, "")
      .replace(/^signature_/, "")
      .trim();
    const base2 = norm2
      .replace(/_signature.*$/, "")
      .replace(/^signature_/, "")
      .trim();

    if (base1 && base2 && base1 === base2) {
      return true;
    }
  }

  // Substring matching for similar fields (e.g., "admission_start_date" contains "admission_date")
  // But only if one is significantly longer (to avoid false positives)
  if (
    norm1.includes(norm2) &&
    norm2.length > 8 &&
    norm1.length > norm2.length + 3
  ) {
    return true;
  }
  if (
    norm2.includes(norm1) &&
    norm1.length > 8 &&
    norm2.length > norm1.length + 3
  ) {
    return true;
  }

  // Check for word-level similarity (e.g., "belonging" vs "belongings")
  const words1 = norm1.split(/[_\s]+/).filter((w) => w.length > 2);
  const words2 = norm2.split(/[_\s]+/).filter((w) => w.length > 2);

  if (words1.length === words2.length && words1.length > 0) {
    // Check if all words match (accounting for plural/singular)
    let matches = 0;
    for (let i = 0; i < words1.length; i++) {
      const w1 = words1[i].replace(/s$/, ""); // Remove trailing 's'
      const w2 = words2[i].replace(/s$/, "");
      if (w1 === w2 || words1[i] === words2[i]) {
        matches++;
      }
    }
    // If most words match, consider similar
    if (matches >= words1.length * 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a field should be included in schema
 * Filters out generic, vague, or problematic fields
 * @param {Object} field - Field object
 * @returns {boolean} - True if field should be included
 */
function shouldIncludeFieldInSchema(field) {
  const fieldName = field.name || field.fieldName || "";

  // Filter out empty fields
  if (!fieldName || fieldName.trim().length === 0) {
    return false;
  }

  const normalized = normalizeFieldNameSemantic(fieldName);

  // Filter out generic fields without context
  if (normalized === null || normalized.trim().length === 0) {
    console.log(
      `[FIELD-FILTER] ⚠️ Filtering out generic field: "${fieldName}"`
    );
    return false;
  }

  // Filter out fields that are too short/vague
  if (normalized.length < 3) {
    console.log(
      `[FIELD-FILTER] ⚠️ Filtering out too-short field: "${fieldName}"`
    );
    return false;
  }

  // Filter out fields that are just common words
  const commonWords = [
    "the",
    "and",
    "or",
    "for",
    "with",
    "from",
    "to",
    "a",
    "an",
    "of",
    "in",
    "on",
    "at",
  ];
  if (commonWords.includes(normalized)) {
    console.log(
      `[FIELD-FILTER] ⚠️ Filtering out common word field: "${fieldName}"`
    );
    return false;
  }

  // Filter out generic fields like "phone :", "address:", etc.
  const genericPatterns = [
    /^phone\s*:?\s*$/i,
    /^address\s*:?\s*$/i,
    /^name\s*:?\s*$/i,
    /^date\s*:?\s*$/i,
    /^email\s*:?\s*$/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(fieldName.trim())) {
      console.log(
        `[FIELD-FILTER] ⚠️ Filtering out generic pattern field: "${fieldName}"`
      );
      return false;
    }
  }

  // Filter out fields that are just person names (like "Rebecca Mwaura" without context)
  // These should be part of a larger field name, not standalone
  if (
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(fieldName.trim()) &&
    !fieldName.toLowerCase().includes("name") &&
    !fieldName.toLowerCase().includes("phone") &&
    !fieldName.toLowerCase().includes("address")
  ) {
    console.log(
      `[FIELD-FILTER] ⚠️ Filtering out standalone person name: "${fieldName}"`
    );
    return false;
  }

  return true;
}

/**
 * Deduplicate fields for schema generation
 * Keeps unique fields only, merges metadata from duplicates
 * @param {Array} fields - Array of field objects
 * @returns {Array} - Deduplicated array of unique fields
 */
function deduplicateFieldsForSchema(fields) {
  const uniqueFields = new Map();
  const consolidationLog = [];

  for (const field of fields) {
    const fieldName = field.name || field.fieldName || "";

    // Skip empty fields
    if (!fieldName || fieldName.trim().length === 0) {
      continue;
    }

    const normalized = normalizeFieldNameSemantic(fieldName);

    // Skip if field should be filtered (but log it for debugging)
    if (!shouldIncludeFieldInSchema(field)) {
      console.log(
        `[FIELD-DEDUP] ⚠️ Skipping field (filtered): "${fieldName}" (normalized: ${normalized})`
      );
      continue;
    }

    // If normalization returned null but field passed filter, use original name
    if (!normalized) {
      console.warn(
        `[FIELD-DEDUP] ⚠️ Field "${fieldName}" normalized to null but passed filter - using original name`
      );
    }

    // Use normalized name as key for matching, but preserve original field name
    const key = normalized || fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (uniqueFields.has(key)) {
      // Field already exists - merge metadata
      const existing = uniqueFields.get(key);
      consolidationLog.push({
        kept: existing.name || existing.fieldName,
        removed: fieldName,
        reason: "duplicate",
      });

      // Merge metadata - prefer better quality
      if (!existing.label && field.label) {
        existing.label = field.label;
      }
      if (!existing.wacCitation && field.wacCitation) {
        existing.wacCitation = field.wacCitation;
      }
      if (!existing.rcwCitation && field.rcwCitation) {
        existing.rcwCitation = field.rcwCitation;
      }
      if (!existing.placeholder && field.placeholder) {
        existing.placeholder = field.placeholder;
      }
      // Prefer more specific types
      if (field.type && field.type !== "text" && existing.type === "text") {
        existing.type = field.type;
      }
    } else {
      // Check for semantic similarity with existing fields
      let foundSimilar = false;
      for (const [existingKey, existingField] of uniqueFields.entries()) {
        if (areFieldsSimilar(field, existingField)) {
          foundSimilar = true;
          consolidationLog.push({
            kept: existingField.name || existingField.fieldName,
            removed: fieldName,
            reason: "semantically_similar",
          });

          // Merge metadata
          if (!existingField.label && field.label) {
            existingField.label = field.label;
          }
          if (!existingField.wacCitation && field.wacCitation) {
            existingField.wacCitation = field.wacCitation;
          }
          if (!existingField.rcwCitation && field.rcwCitation) {
            existingField.rcwCitation = field.rcwCitation;
          }
          // Prefer more descriptive name (longer is usually better, but avoid "initial" suffixes)
          const existingName =
            existingField.name || existingField.fieldName || "";
          const existingHasInitial = existingName
            .toLowerCase()
            .includes("initial");
          const newHasInitial = fieldName.toLowerCase().includes("initial");

          // Prefer name without "initial" suffix, or longer name if both have/not have it
          if (!newHasInitial && existingHasInitial) {
            // New name is better (no initial suffix)
            existingField.name = fieldName;
            existingField.fieldName = fieldName;
          } else if (newHasInitial && !existingHasInitial) {
            // Keep existing (no initial suffix)
            // Don't change
          } else if (fieldName.length > existingName.length && !newHasInitial) {
            // New name is longer and doesn't have initial - prefer it
            existingField.name = fieldName;
            existingField.fieldName = fieldName;
          }
          break;
        }
      }

      if (!foundSimilar) {
        // New unique field - preserve original field name
        uniqueFields.set(key, {
          ...field,
          name: fieldName, // Keep original name, not normalized
          fieldName: fieldName, // Also set fieldName for compatibility
        });
      }
    }
  }

  // Log consolidation results
  if (consolidationLog.length > 0) {
    console.log(
      `[FIELD-DEDUP] 🔄 Consolidated ${consolidationLog.length} duplicate/similar fields:`
    );
    consolidationLog.forEach((log) => {
      console.log(
        `  ✅ Kept: "${log.kept}" | Removed: "${log.removed}" (${log.reason})`
      );
    });
  }

  return Array.from(uniqueFields.values());
}

/**
 * Calculate simple string similarity (0-1 scale)
 * Uses character-level comparison for fuzzy matching
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1, where 1 is identical)
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  // Check if one string contains the other (high similarity)
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Calculate character-level similarity
  let matches = 0;
  const shorterChars = shorter.split("");
  const longerChars = longer.split("");

  for (const char of shorterChars) {
    const index = longerChars.indexOf(char);
    if (index !== -1) {
      matches++;
      longerChars.splice(index, 1);
    }
  }

  return matches / longer.length;
}

/**
 * Calculate word-level similarity between two field names
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1)
 */
function calculateWordSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const words1 = str1
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((w) => w.length > 2);
  const words2 = str2
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((w) => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  // Count matching words (accounting for plural/singular)
  let matches = 0;
  const words2Copy = [...words2];

  for (const word1 of words1) {
    for (let i = 0; i < words2Copy.length; i++) {
      const word2 = words2Copy[i];
      const word1Base = word1.replace(/s$/, "");
      const word2Base = word2.replace(/s$/, "");

      if (word1 === word2 || word1Base === word2Base) {
        matches++;
        words2Copy.splice(i, 1);
        break;
      }
    }
  }

  // Return average of both directions (handles different lengths)
  const similarity1 = matches / words1.length;
  const similarity2 = matches / words2.length;
  return (similarity1 + similarity2) / 2;
}

/**
 * Comprehensive final deduplication pass using multiple strategies
 * This is the most robust deduplication that should be called after all processing
 * @param {Array} fields - Array of field objects
 * @returns {Array} - Deduplicated array of unique fields
 */
function performFinalDeduplicationPass(fields) {
  if (!fields || fields.length === 0) return [];

  console.log(
    `[FINAL-DEDUP] 🔍 Starting comprehensive deduplication pass on ${fields.length} fields...`
  );

  const uniqueFields = new Map();
  const consolidationLog = [];
  const processedIndices = new Set();

  // Pass 1: Exact match (normalized) - fastest, most reliable
  for (let i = 0; i < fields.length; i++) {
    if (processedIndices.has(i)) continue;

    const field = fields[i];
    const fieldName = field.name || field.fieldName || "";

    if (!fieldName || fieldName.trim().length === 0) {
      processedIndices.add(i);
      continue;
    }

    if (!shouldIncludeFieldInSchema(field)) {
      processedIndices.add(i);
      continue;
    }

    const normalized = normalizeFieldNameSemantic(fieldName);
    if (!normalized) {
      processedIndices.add(i);
      continue;
    }

    const key = normalized.replace(/[^a-z0-9]/g, "");

    if (uniqueFields.has(key)) {
      // Exact match found - merge metadata
      const existing = uniqueFields.get(key);
      consolidationLog.push({
        kept: existing.name || existing.fieldName,
        removed: fieldName,
        reason: "exact_match_normalized",
        strategy: "pass1",
      });
      mergeFieldMetadata(existing, field);
      processedIndices.add(i);
    } else {
      // Check for semantic similarity with existing fields
      let foundSimilar = false;
      for (const [existingKey, existingField] of uniqueFields.entries()) {
        if (areFieldsSimilar(field, existingField)) {
          foundSimilar = true;
          consolidationLog.push({
            kept: existingField.name || existingField.fieldName,
            removed: fieldName,
            reason: "semantic_similarity",
            strategy: "pass1",
          });
          mergeFieldMetadata(existingField, field);
          processedIndices.add(i);
          break;
        }
      }

      if (!foundSimilar) {
        uniqueFields.set(key, {
          ...field,
          name: fieldName,
          fieldName: fieldName,
        });
        processedIndices.add(i);
      }
    }
  }

  // Pass 2: Fuzzy string matching for near-duplicates (typos, variations)
  const remainingFields = fields.filter(
    (_, index) => !processedIndices.has(index)
  );
  const FUZZY_THRESHOLD = 0.85; // 85% similarity

  for (let i = 0; i < remainingFields.length; i++) {
    const field = remainingFields[i];
    const fieldName = field.name || field.fieldName || "";
    if (!fieldName) continue;

    const normalized = normalizeFieldNameSemantic(fieldName);
    if (!normalized) continue;

    let bestMatch = null;
    let bestScore = 0;

    // Compare with all existing unique fields
    for (const [existingKey, existingField] of uniqueFields.entries()) {
      const existingName = existingField.name || existingField.fieldName || "";
      const existingNormalized =
        normalizeFieldNameSemantic(existingName) || existingName.toLowerCase();

      // Calculate fuzzy similarity
      const similarity = calculateStringSimilarity(
        normalized,
        existingNormalized
      );
      if (similarity > bestScore && similarity >= FUZZY_THRESHOLD) {
        bestScore = similarity;
        bestMatch = existingField;
      }
    }

    if (bestMatch) {
      consolidationLog.push({
        kept: bestMatch.name || bestMatch.fieldName,
        removed: fieldName,
        reason: "fuzzy_match",
        strategy: "pass2",
        similarity: (bestScore * 100).toFixed(1) + "%",
      });
      mergeFieldMetadata(bestMatch, field);
      processedIndices.add(
        fields.findIndex((f) => (f.name || f.fieldName) === fieldName)
      );
    }
  }

  // Pass 3: Word-level comparison for similar but not identical fields
  const stillRemaining = fields.filter(
    (_, index) => !processedIndices.has(index)
  );

  for (let i = 0; i < stillRemaining.length; i++) {
    const field = stillRemaining[i];
    const fieldName = field.name || field.fieldName || "";
    if (!fieldName) continue;

    const normalized = normalizeFieldNameSemantic(fieldName);
    if (!normalized) continue;

    let bestMatch = null;
    let bestScore = 0;
    const WORD_SIMILARITY_THRESHOLD = 0.75; // 75% word similarity

    for (const [existingKey, existingField] of uniqueFields.entries()) {
      const existingName = existingField.name || existingField.fieldName || "";
      const existingNormalized =
        normalizeFieldNameSemantic(existingName) || existingName.toLowerCase();

      // Skip if types are different (might be intentional)
      if (
        field.type &&
        existingField.type &&
        field.type !== existingField.type
      ) {
        continue;
      }

      const wordSimilarity = calculateWordSimilarity(
        normalized,
        existingNormalized
      );
      if (
        wordSimilarity > bestScore &&
        wordSimilarity >= WORD_SIMILARITY_THRESHOLD
      ) {
        bestScore = wordSimilarity;
        bestMatch = existingField;
      }
    }

    if (bestMatch) {
      consolidationLog.push({
        kept: bestMatch.name || bestMatch.fieldName,
        removed: fieldName,
        reason: "word_similarity",
        strategy: "pass3",
        similarity: (bestScore * 100).toFixed(1) + "%",
      });
      mergeFieldMetadata(bestMatch, field);
      processedIndices.add(
        fields.findIndex((f) => (f.name || f.fieldName) === fieldName)
      );
    } else {
      // No match found - add as new unique field
      const normalized = normalizeFieldNameSemantic(fieldName);
      const key = normalized
        ? normalized.replace(/[^a-z0-9]/g, "")
        : fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!uniqueFields.has(key)) {
        uniqueFields.set(key, {
          ...field,
          name: fieldName,
          fieldName: fieldName,
        });
      }
    }
  }

  // Log comprehensive results
  const finalCount = uniqueFields.size;
  const removedCount = fields.length - finalCount;

  if (consolidationLog.length > 0) {
    console.log(
      `[FINAL-DEDUP] ✅ Deduplication complete: ${fields.length} → ${finalCount} fields (removed ${removedCount} duplicates)`
    );
    console.log(`[FINAL-DEDUP] 📊 Consolidation breakdown:`);

    const byStrategy = {};
    consolidationLog.forEach((log) => {
      if (!byStrategy[log.strategy]) {
        byStrategy[log.strategy] = [];
      }
      byStrategy[log.strategy].push(log);
    });

    Object.entries(byStrategy).forEach(([strategy, logs]) => {
      console.log(`  ${strategy}: ${logs.length} fields consolidated`);
      logs.slice(0, 5).forEach((log) => {
        const similarity = log.similarity ? ` (${log.similarity})` : "";
        console.log(
          `    ✅ Kept: "${log.kept}" | Removed: "${log.removed}" (${log.reason}${similarity})`
        );
      });
      if (logs.length > 5) {
        console.log(`    ... and ${logs.length - 5} more`);
      }
    });
  } else {
    console.log(
      `[FINAL-DEDUP] ✅ No duplicates found - all ${finalCount} fields are unique`
    );
  }

  return Array.from(uniqueFields.values());
}

/**
 * Merge metadata from source field into target field
 * Prefers better quality metadata (non-empty, more specific)
 * @param {Object} target - Target field to merge into
 * @param {Object} source - Source field to merge from
 */
function mergeFieldMetadata(target, source) {
  // Merge label (prefer more descriptive)
  if (!target.label && source.label) {
    target.label = source.label;
  } else if (source.label && source.label.length > target.label.length) {
    target.label = source.label;
  }

  // Merge citations (add if missing)
  if (!target.wacCitation && source.wacCitation) {
    target.wacCitation = source.wacCitation;
  }
  if (!target.rcwCitation && source.rcwCitation) {
    target.rcwCitation = source.rcwCitation;
  }

  // Merge placeholder (prefer more descriptive)
  if (!target.placeholder && source.placeholder) {
    target.placeholder = source.placeholder;
  } else if (
    source.placeholder &&
    source.placeholder.length > (target.placeholder || "").length
  ) {
    target.placeholder = source.placeholder;
  }

  // Merge type (prefer more specific)
  if (
    source.type &&
    source.type !== "text" &&
    (!target.type || target.type === "text")
  ) {
    target.type = source.type;
  }

  // Merge options (for dropdowns)
  if (
    source.options &&
    Array.isArray(source.options) &&
    source.options.length > 0
  ) {
    if (
      !target.options ||
      !Array.isArray(target.options) ||
      target.options.length === 0
    ) {
      target.options = source.options;
    }
  }

  // Merge required flag (prefer true if either is required)
  if (source.required && !target.required) {
    target.required = true;
  }

  // Prefer better field name (longer, more descriptive, without asterisks)
  const targetName = (target.name || target.fieldName || "").toLowerCase();
  const sourceName = (source.name || source.fieldName || "").toLowerCase();

  const targetHasAsterisk = targetName.includes("*");
  const sourceHasAsterisk = sourceName.includes("*");

  if (!targetHasAsterisk && sourceHasAsterisk) {
    // Keep target (no asterisk)
  } else if (targetHasAsterisk && !sourceHasAsterisk) {
    // Prefer source (no asterisk)
    target.name = source.name || source.fieldName;
    target.fieldName = source.fieldName || source.name;
  } else if (sourceName.length > targetName.length) {
    // Prefer longer name (more descriptive)
    target.name = source.name || source.fieldName;
    target.fieldName = source.fieldName || source.name;
  }
}

module.exports = {
  normalizeFieldNameSemantic,
  areFieldsSimilar,
  shouldIncludeFieldInSchema,
  deduplicateFieldsForSchema,
  performFinalDeduplicationPass,
  calculateStringSimilarity,
  calculateWordSimilarity,
};

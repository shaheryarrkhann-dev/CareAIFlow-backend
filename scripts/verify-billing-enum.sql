-- Verification script to check if billing actions exist in AuditAction enum
-- Run this before and after applying the migration

-- Check all billing-related enum values
SELECT
  unnest(enum_range(NULL::"AuditAction")) AS action
WHERE action LIKE 'BILLING%'
   OR action LIKE 'RESIDENT_TIER%'
   OR action LIKE 'INVOICE%'
ORDER BY action;

-- Count total enum values (should include billing actions)
SELECT COUNT(*) as total_enum_values
FROM unnest(enum_range(NULL::"AuditAction")) AS action;

-- List ALL enum values (for debugging)
SELECT unnest(enum_range(NULL::"AuditAction")) AS action
ORDER BY action;


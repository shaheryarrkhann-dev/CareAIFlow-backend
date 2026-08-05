-- NOTE: The original version of this migration dropped `residents` and rewrote `AuditAction`,
-- which breaks shadow-database replay and is unsafe for environments where `residents` is canonical.
-- Replaced with a no-op; surrounding migrations carry the intended notes/residents schema forward.
SELECT 1;

-- Verification script for migration 001_dynamic_model_pricing
-- Run this after applying the migration to verify everything is set up correctly

\echo '=== Verifying Dynamic Model Pricing Migration ==='
\echo ''

-- Check if tables exist
\echo 'Checking if tables exist...'
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('models', 'model_pricing', 'pricing_history', 'sync_status', 'scraping_config') 
    THEN '✓ EXISTS'
    ELSE '✗ MISSING'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('models', 'model_pricing', 'pricing_history', 'sync_status', 'scraping_config')
ORDER BY table_name;

\echo ''
\echo 'Checking indexes...'
SELECT 
  tablename,
  indexname,
  '✓ EXISTS' as status
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('models', 'model_pricing', 'pricing_history', 'sync_status', 'scraping_config')
ORDER BY tablename, indexname;

\echo ''
\echo 'Checking initial scraping configurations...'
SELECT 
  provider,
  active,
  '✓ SEEDED' as status
FROM scraping_config
ORDER BY provider;

\echo ''
\echo 'Checking initial sync status...'
SELECT 
  provider,
  status,
  '✓ INITIALIZED' as status
FROM sync_status
ORDER BY provider;

\echo ''
\echo 'Checking foreign key constraints...'
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  '✓ EXISTS' as status
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('models', 'model_pricing', 'pricing_history', 'sync_status', 'scraping_config')
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

\echo ''
\echo '=== Verification Complete ==='

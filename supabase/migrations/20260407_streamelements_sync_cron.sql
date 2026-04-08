-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to trigger StreamElements sync every 30 seconds
-- Note: pg_cron minimum interval is 60 seconds, so we'll use that instead
SELECT cron.schedule(
  'streamelements-sync-every-minute',
  '* * * * *', -- Every minute
  'SELECT
    http_post(
      CONCAT(
        (SELECT current_setting(''app.supabase_url'')) || ''/functions/v1/streamelements-sync-scheduler'',
        ''?project_ref='' || (SELECT current_setting(''app.project_ref''))
      ),
      ''{}''::jsonb,
      ''{"Content-Type": "application/json", "Authorization": "Bearer '' || current_setting(''app.service_role_key'') || ''"}"''::jsonb
    )
');

-- Grant cron access
GRANT USAGE ON SCHEMA cron TO postgres;

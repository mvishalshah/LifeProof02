-- One-time scheduler setup. Replace both placeholders before running this file.
-- Use the same random secret for REMINDER_CRON_SECRET in Supabase Edge Function
-- secrets and habit_reminder_cron_secret below.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-habit-reminders',
  'habit_reminder_function_url'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_LONG_RANDOM_CRON_SECRET',
  'habit_reminder_cron_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'send-lifeproof-habit-reminders';

select cron.schedule(
  'send-lifeproof-habit-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'habit_reminder_function_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'habit_reminder_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

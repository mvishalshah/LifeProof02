# LifeProof — CODESLAYER 2k26 MVP

> Your life. Your progress. Your story.

LifeProof is a personal evidence-and-growth dashboard based on the supplied CODESLAYER 2k26 concept: Personal Life Timeline, Habit Tracker, Progress Analytics, Personal Insights, Life–Habit Connection, Contextual Memories, and one unified journey.

## MVP included

- Supabase email/password authentication
- Responsive dashboard
- Editable profile with Supabase Storage photo uploads
- Weekly and monthly habit/memory reports with sharing
- Website share action in the navigation
- Personal life timeline
- Create/edit/delete memories
- Habit creation and daily completion
- Scheduled habit reminders via browser push notifications
- Streak and completion calculations
- Recharts analytics
- Rule-based personal insights
- Life–habit connection
- Search/filter timeline
- GitHub-safe `.env.example`
- Supabase SQL schema with Row Level Security

## Tech stack

React + Vite + Supabase/PostgreSQL + Recharts + Lucide React.

## Setup

1. Install Node.js 20+.
2. Create a Supabase project.
3. In Supabase SQL Editor, run `supabase/schema.sql`. This also creates the public `profile-photos` Storage bucket and policies that restrict uploads/updates/deletes to each signed-in user's own folder. Profile photos are publicly viewable by URL.
4. In Supabase Authentication, enable Email provider.
5. Copy `.env.example` to `.env`.
6. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
7. Run:

```bash
npm install
npm run dev
```

8. Open the local URL shown by Vite.

## Habit push reminders

Push reminders can arrive when the app is closed, but require HTTPS (localhost is allowed for development), browser notification permission, a deployed Supabase Edge Function, and Supabase Cron.

1. Generate a VAPID key pair with `npx web-push generate-vapid-keys`.
2. Add the public key as `VITE_VAPID_PUBLIC_KEY` in `.env`, then restart Vite. Add the same public key as a Vercel environment variable for production builds.
3. Deploy the reminder function from the repository root using the Supabase CLI:

   ```bash
   supabase functions deploy send-habit-reminders --no-verify-jwt
   ```

4. Set Edge Function secrets. Use the generated VAPID keys, a `mailto:` subject, and one long random cron secret:

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com REMINDER_CRON_SECRET=...
   ```

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function. Never place the private VAPID key, cron secret, or service-role key in frontend environment variables.
5. In Supabase SQL Editor, run `supabase/reminder-scheduler.sql` once after replacing the project URL and cron-secret placeholders. The cron secret must match `REMINDER_CRON_SECRET`.
6. Run `supabase/schema.sql` if it has not already been run. In Habits, set a reminder time (and a weekday for weekly habits), then click **Enable reminders** and allow notifications.

The scheduled job checks reminders once per minute. Daily habits notify every day; weekly habits notify only on their selected weekday. The saved time uses the browser's current timezone.

## GitHub safety

- `.env` is ignored.
- Only the public Supabase URL and anon key belong in frontend environment variables.
- Never expose `service_role` keys.
- Do not upload Supabase secrets, database passwords, or private API keys.

## Deploy to Vercel

Import the repository into Vercel and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy.

## Scope note

The source PDF supports the MVP categories and high-level stack. This implementation adds practical UI/database details needed to make those categories runnable; it does not claim that every implementation detail was specified in the PDF.
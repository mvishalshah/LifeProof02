-- LifeProof database schema
-- Run this entire file in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Public avatars are viewable by URL; writes are restricted to each user's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
for select using (bucket_id = 'profile-photos');

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  memory_date date not null default current_date,
  category text not null default 'Personal',
  mood text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  reminder_time time,
  reminder_timezone text not null default 'UTC',
  reminder_weekday smallint check (reminder_weekday between 1 and 7),
  created_at timestamptz not null default now(),
  active boolean not null default true
);

alter table public.habits add column if not exists reminder_time time;
alter table public.habits add column if not exists reminder_timezone text not null default 'UTC';
alter table public.habits add column if not exists reminder_weekday smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_reminder_weekday_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_reminder_weekday_check
      check (reminder_weekday is null or reminder_weekday between 1 and 7);
  end if;
end;
$$;

create table if not exists public.habit_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_reminder_deliveries (
  habit_id uuid not null references public.habits(id) on delete cascade,
  reminder_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, reminder_date)
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique(habit_id, log_date)
);

create table if not exists public.habit_memory_links (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(habit_id, memory_id)
);

create index if not exists memories_user_date_idx
  on public.memories(user_id, memory_date desc);

create index if not exists habits_user_idx
  on public.habits(user_id);

create index if not exists habit_logs_user_date_idx
  on public.habit_logs(user_id, log_date desc);

create index if not exists habit_memory_links_user_idx
  on public.habit_memory_links(user_id);

alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.habit_memory_links enable row level security;
alter table public.habit_push_subscriptions enable row level security;
alter table public.habit_reminder_deliveries enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "memories_own_all" on public.memories;
create policy "memories_own_all" on public.memories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habits_own_all" on public.habits;
create policy "habits_own_all" on public.habits
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habit_logs_own_all" on public.habit_logs;
create policy "habit_logs_own_all" on public.habit_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "links_own_all" on public.habit_memory_links;
create policy "links_own_all" on public.habit_memory_links
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habit_push_subscriptions_own_all" on public.habit_push_subscriptions;
create policy "habit_push_subscriptions_own_all" on public.habit_push_subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists memories_updated_at on public.memories;
create trigger memories_updated_at before update on public.memories
for each row execute procedure public.set_updated_at();
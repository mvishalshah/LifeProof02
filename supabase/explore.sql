create or replace function public.search_explore_profiles(search_name text)
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and nullif(trim(search_name), '') is not null
    and position(lower(trim(search_name)) in lower(coalesce(p.full_name, ''))) > 0
  order by p.full_name
  limit 20;
$$;

revoke all on function public.search_explore_profiles(text) from public;
grant execute on function public.search_explore_profiles(text) to authenticated;

create or replace function public.get_explore_habit_summary(target_user_id uuid)
returns table(
  habit_id uuid,
  habit_name text,
  frequency text,
  completed_today boolean,
  completed_this_week integer,
  week_goal integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with current_week as (
    select date_trunc('week', current_date)::date as week_start
  )
  select
    h.id,
    h.name,
    h.frequency,
    exists (
      select 1
      from public.habit_logs today_log
      where today_log.habit_id = h.id
        and today_log.user_id = h.user_id
        and today_log.log_date = current_date
        and today_log.completed
    ),
    case
      when h.frequency = 'weekly' then case when exists (
        select 1
        from public.habit_logs week_log
        cross join current_week cw
        where week_log.habit_id = h.id
          and week_log.user_id = h.user_id
          and week_log.log_date between cw.week_start and current_date
          and week_log.completed
      ) then 1 else 0 end
      else (
        select count(*)::integer
        from public.habit_logs week_log
        cross join current_week cw
        where week_log.habit_id = h.id
          and week_log.user_id = h.user_id
          and week_log.log_date between greatest(cw.week_start, h.created_at::date) and current_date
          and week_log.completed
      )
    end,
    case
      when h.frequency = 'weekly' then 1
      else greatest(0, current_date - greatest(
        (select week_start from current_week),
        h.created_at::date
      ) + 1)
    end
  from public.habits h
  where auth.uid() is not null
    and h.user_id = target_user_id
    and h.active
  order by h.created_at, h.id;
$$;

revoke all on function public.get_explore_habit_summary(uuid) from public;
grant execute on function public.get_explore_habit_summary(uuid) to authenticated;

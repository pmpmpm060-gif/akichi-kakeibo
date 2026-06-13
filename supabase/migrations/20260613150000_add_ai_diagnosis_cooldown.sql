-- AI診断の短時間連打をDB側で原子的に拒否し、外部AI課金と重複実行を抑える。

create table public.ai_diagnosis_cooldowns (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id text not null,
  target_month date not null check (target_month = date_trunc('month', target_month)::date),
  last_requested_at timestamptz not null default now(),
  primary key (auth_user_id, household_id, profile_id, target_month)
);

alter table public.ai_diagnosis_cooldowns enable row level security;
revoke all on public.ai_diagnosis_cooldowns from public, anon, authenticated;

drop function if exists public.consume_ai_diagnosis_quota();

create or replace function public.consume_ai_diagnosis_quota(
  target_profile_id text,
  target_month date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  target_household_id uuid := public.current_household_id();
  normalized_month date := date_trunc('month', target_month)::date;
  current_hour timestamptz := date_trunc('hour', now());
  current_day timestamptz := date_trunc('day', now());
  previous_request_at timestamptz;
  hourly_count integer;
  daily_count integer;
begin
  if requester_id is null
    or target_household_id is null
    or not public.is_approved_user()
    or not public.can_edit_profile(target_household_id, target_profile_id)
  then
    return 'forbidden';
  end if;
  if normalized_month < date_trunc('month', current_date - interval '5 years')::date
    or normalized_month > date_trunc('month', current_date)::date
  then
    return 'invalid_month';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester_id::text, 0));

  select cooldown.last_requested_at into previous_request_at
  from public.ai_diagnosis_cooldowns cooldown
  where cooldown.auth_user_id = requester_id
    and cooldown.household_id = target_household_id
    and cooldown.profile_id = target_profile_id
    and cooldown.target_month = normalized_month;

  if previous_request_at is not null and previous_request_at > now() - interval '3 minutes' then
    return 'cooldown';
  end if;

  insert into public.ai_request_limits (user_id, request_kind, window_started_at, request_count)
  values (requester_id, 'diagnosis_hour', current_hour, 1)
  on conflict (user_id, request_kind) do update
  set window_started_at = case
        when public.ai_request_limits.window_started_at < current_hour then current_hour
        else public.ai_request_limits.window_started_at
      end,
      request_count = case
        when public.ai_request_limits.window_started_at < current_hour then 1
        else least(public.ai_request_limits.request_count + 1, 7)
      end
  returning request_count into hourly_count;

  insert into public.ai_request_limits (user_id, request_kind, window_started_at, request_count)
  values (requester_id, 'diagnosis_day', current_day, 1)
  on conflict (user_id, request_kind) do update
  set window_started_at = case
        when public.ai_request_limits.window_started_at < current_day then current_day
        else public.ai_request_limits.window_started_at
      end,
      request_count = case
        when public.ai_request_limits.window_started_at < current_day then 1
        else least(public.ai_request_limits.request_count + 1, 21)
      end
  returning request_count into daily_count;

  if hourly_count > 6 or daily_count > 20 then return 'limit_reached'; end if;

  insert into public.ai_diagnosis_cooldowns (
    auth_user_id, household_id, profile_id, target_month, last_requested_at
  ) values (
    requester_id, target_household_id, target_profile_id, normalized_month, now()
  )
  on conflict on constraint ai_diagnosis_cooldowns_pkey do update
  set last_requested_at = excluded.last_requested_at;

  delete from public.ai_diagnosis_cooldowns cooldown
  where cooldown.auth_user_id = requester_id
    and cooldown.last_requested_at < now() - interval '6 months';

  return 'allowed';
end
$$;

revoke all on function public.consume_ai_diagnosis_quota(text, date) from public, anon;
grant execute on function public.consume_ai_diagnosis_quota(text, date) to authenticated;

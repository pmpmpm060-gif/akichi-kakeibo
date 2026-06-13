-- AI診断の課金・DB負荷を時間単位と日単位で制限し、古い確認済みアラートを自動整理する。

alter table public.ai_request_limits
  drop constraint if exists ai_request_limits_request_kind_check;

update public.ai_request_limits
set request_kind = 'diagnosis_hour'
where request_kind = 'diagnosis';

alter table public.ai_request_limits
  add constraint ai_request_limits_request_kind_check
  check (request_kind in ('diagnosis_hour', 'diagnosis_day'));

create or replace function public.consume_ai_diagnosis_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hour timestamptz := date_trunc('hour', now());
  current_day timestamptz := date_trunc('day', now());
  hourly_count integer;
  daily_count integer;
begin
  if auth.uid() is null or not public.is_approved_user() then
    return false;
  end if;

  insert into public.ai_request_limits (user_id, request_kind, window_started_at, request_count)
  values (auth.uid(), 'diagnosis_hour', current_hour, 1)
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
  values (auth.uid(), 'diagnosis_day', current_day, 1)
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

  return hourly_count <= 6 and daily_count <= 20;
end
$$;

create or replace function public.cleanup_old_dismissed_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dismissed_alerts alert
  where alert.id in (
    select old_alert.id
    from public.dismissed_alerts old_alert
    where old_alert.household_id = new.household_id
      and old_alert.user_id = new.user_id
    order by old_alert.dismissed_at desc, old_alert.id desc
    offset 400
  );
  return new;
end
$$;

create trigger cleanup_old_dismissed_alerts_trigger
before insert on public.dismissed_alerts
for each row execute function public.cleanup_old_dismissed_alerts();

create index if not exists savings_contributions_goal_id_idx
  on public.savings_contributions (goal_id);

create or replace function public.get_savings_goal_totals(target_user_id text)
returns table (goal_id uuid, total numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select contribution.goal_id, sum(contribution.amount) as total
  from public.savings_contributions contribution
  where contribution.household_id = public.current_household_id()
    and contribution.user_id = target_user_id
    and public.is_household_profile(contribution.household_id, target_user_id)
  group by contribution.goal_id
$$;

revoke all on function public.consume_ai_diagnosis_quota() from public, anon;
grant execute on function public.consume_ai_diagnosis_quota() to authenticated;
revoke execute on function public.cleanup_old_dismissed_alerts() from public, anon, authenticated;
revoke all on function public.get_savings_goal_totals(text) from public, anon;
grant execute on function public.get_savings_goal_totals(text) to authenticated;

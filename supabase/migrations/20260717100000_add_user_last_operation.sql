-- 利用申請の承認画面では、ログイン日時ではなくアプリ内の最終操作時刻を表示する。

create table if not exists public.user_operation_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_operated_at timestamptz not null default now(),
  last_path text not null default '/',
  constraint user_operation_activity_path_length_check check (length(last_path) between 1 and 200)
);

alter table public.user_operation_activity enable row level security;

drop policy if exists "Users can view own operation activity" on public.user_operation_activity;
create policy "Users can view own operation activity"
  on public.user_operation_activity
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins can view operation activity" on public.user_operation_activity;
create policy "Admins can view operation activity"
  on public.user_operation_activity
  for select
  to authenticated
  using (public.is_app_admin());

create or replace function public.touch_user_operation(operation_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_path text := left(coalesce(nullif(trim(operation_path), ''), '/'), 200);
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  insert into public.user_operation_activity (user_id, last_operated_at, last_path)
  values (current_user_id, now(), normalized_path)
  on conflict (user_id) do update
    set last_operated_at = excluded.last_operated_at,
        last_path = excluded.last_path;
end;
$$;

create or replace function public.list_user_approvals_with_last_operation()
returns table (
  user_id uuid,
  email text,
  status text,
  is_admin boolean,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  last_operation_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    approval.user_id,
    approval.email,
    approval.status,
    approval.is_admin,
    approval.requested_at,
    approval.reviewed_at,
    approval.reviewed_by,
    activity.last_operated_at as last_operation_at
  from public.user_approvals approval
  left join public.user_operation_activity activity on activity.user_id = approval.user_id
  where public.is_app_admin()
    and not approval.is_admin
  order by approval.requested_at desc
  limit 200
$$;

revoke all on table public.user_operation_activity from public, anon;
grant select on table public.user_operation_activity to authenticated;

revoke all on function public.touch_user_operation(text) from public, anon;
grant execute on function public.touch_user_operation(text) to authenticated;

revoke all on function public.list_user_approvals_with_last_operation() from public, anon;
grant execute on function public.list_user_approvals_with_last_operation() to authenticated;

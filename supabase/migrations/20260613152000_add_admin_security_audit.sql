-- 管理者による重要操作を改ざん不可の履歴へ残し、内部不正・誤操作の追跡を可能にする。

create table public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('approve_user', 'reject_user', 'assign_mama_profile')),
  created_at timestamptz not null default now()
);

create index admin_security_events_created_at_idx
  on public.admin_security_events (created_at desc);

alter table public.admin_security_events enable row level security;
create policy "Admins can view security events"
  on public.admin_security_events for select to authenticated
  using (public.is_app_admin());

grant select on public.admin_security_events to authenticated;
revoke insert, update, delete on public.admin_security_events from public, anon, authenticated;

create or replace function public.retain_recent_admin_security_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.admin_security_events event
  where event.id in (
    select old_event.id
    from public.admin_security_events old_event
    order by old_event.created_at desc, old_event.id desc
    offset 1000
  );
  return null;
end
$$;

create trigger retain_recent_admin_security_events_trigger
after insert on public.admin_security_events
for each row execute function public.retain_recent_admin_security_events();

create or replace function public.review_app_user(target_user_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then raise exception 'Administrator approval is required.'; end if;
  if target_user_id = auth.uid() then raise exception 'Administrators cannot review themselves.'; end if;

  update public.user_approvals
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where user_id = target_user_id and not is_admin;

  if not found then raise exception 'Approval request was not found.'; end if;

  insert into public.admin_security_events (actor_user_id, target_user_id, action)
  values (auth.uid(), target_user_id, case when approve then 'approve_user' else 'reject_user' end);
end
$$;

create or replace function public.assign_household_profile(
  target_user_id uuid,
  target_profile_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
begin
  if not public.is_app_admin() or target_household_id is null then
    raise exception 'Administrator approval is required.';
  end if;
  if target_profile_id <> 'user_a' then
    raise exception 'Only the mama profile can be assigned.';
  end if;
  if not exists (
    select 1 from public.user_approvals approval
    where approval.user_id = target_user_id
      and approval.status = 'approved'
      and not approval.is_admin
  ) then
    raise exception 'Approved user was not found.';
  end if;
  if exists (select 1 from public.household_members member where member.user_id = target_user_id) then
    raise exception 'User already belongs to a household.';
  end if;
  if exists (
    select 1 from public.household_profiles profile
    where profile.household_id = target_household_id
      and profile.profile_id = target_profile_id
      and profile.auth_user_id is not null
  ) then
    raise exception 'Profile is already assigned.';
  end if;

  insert into public.household_members (user_id, household_id)
  values (target_user_id, target_household_id);

  update public.household_profiles
  set auth_user_id = target_user_id
  where household_id = target_household_id
    and profile_id = target_profile_id;

  insert into public.admin_security_events (actor_user_id, target_user_id, action)
  values (auth.uid(), target_user_id, 'assign_mama_profile');
end
$$;

revoke execute on function public.retain_recent_admin_security_events() from public, anon, authenticated;
revoke all on function public.review_app_user(uuid, boolean) from public, anon;
grant execute on function public.review_app_user(uuid, boolean) to authenticated;
revoke all on function public.assign_household_profile(uuid, text) from public, anon;
grant execute on function public.assign_household_profile(uuid, text) to authenticated;

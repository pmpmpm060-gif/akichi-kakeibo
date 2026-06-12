-- メール確認の代わりに、既存利用者による新規アカウント承認を導入する。

create table public.user_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

-- 導入時点で家計簿を利用中のアカウントは、承認済み管理者として引き継ぐ。
insert into public.user_approvals (user_id, email, status, is_admin, reviewed_at, reviewed_by)
select member.user_id, auth_user.email, 'approved', true, now(), member.user_id
from public.household_members member
join auth.users auth_user on auth_user.id = member.user_id
on conflict (user_id) do update
set status = 'approved', is_admin = true, reviewed_at = now(), reviewed_by = excluded.user_id;

-- メール配送問題で止まっていた既存アカウントも、承認待ちとしてログイン可能にする。
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email is not null and email_confirmed_at is null;

insert into public.user_approvals (user_id, email, status)
select auth_user.id, auth_user.email, 'pending'
from auth.users auth_user
left join public.household_members member on member.user_id = auth_user.id
where member.user_id is null and auth_user.email is not null
on conflict (user_id) do nothing;

alter table public.user_approvals enable row level security;

create or replace function public.is_approved_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_approvals
    where user_id = (select auth.uid()) and status = 'approved'
  )
$$;

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_approvals
    where user_id = (select auth.uid()) and status = 'approved' and is_admin
  )
$$;

create policy "Users can view their approval"
  on public.user_approvals for select to authenticated
  using (user_id = (select auth.uid()) or public.is_app_admin());

create or replace function public.request_app_approval()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  requester_email text;
  current_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select email into requester_email from auth.users where id = auth.uid();
  if requester_email is null then raise exception 'Email address is unavailable.'; end if;

  insert into public.user_approvals (user_id, email, status)
  values (auth.uid(), requester_email, 'pending')
  on conflict (user_id) do update
  set email = excluded.email,
      status = case when public.user_approvals.status = 'approved' then 'approved' else 'pending' end,
      requested_at = case when public.user_approvals.status = 'approved' then public.user_approvals.requested_at else now() end,
      reviewed_at = case when public.user_approvals.status = 'approved' then public.user_approvals.reviewed_at else null end,
      reviewed_by = case when public.user_approvals.status = 'approved' then public.user_approvals.reviewed_by else null end
  returning status into current_status;
  return current_status;
end
$$;

create or replace function public.review_app_user(target_user_id uuid, approve boolean)
returns void
language plpgsql security definer set search_path = ''
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
end
$$;

create or replace function public.setup_personal_household(household_name text, display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.is_approved_user() then raise exception 'Administrator approval is required.'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household.';
  end if;
  if length(trim(household_name)) not between 1 and 50 or length(trim(display_name)) not between 1 and 30 then
    raise exception 'Invalid household or display name.';
  end if;

  insert into public.households (name) values (trim(household_name)) returning id into new_household_id;
  insert into public.household_members (user_id, household_id) values (auth.uid(), new_household_id);
  insert into public.household_profiles (household_id, profile_id, display_name, icon, sort_order)
    values (new_household_id, 'user_a', trim(display_name), '👤', 0);

  insert into public.categories (household_id, user_id, name, type, icon, sort_order)
  values
    (new_household_id, 'user_a', '食費', 'expense', '🍔', 0),
    (new_household_id, 'user_a', '日用品', 'expense', '🛍️', 1),
    (new_household_id, 'user_a', '交通費', 'expense', '🚗', 2),
    (new_household_id, 'user_a', '住居費', 'expense', '🏠', 3),
    (new_household_id, 'user_a', '給与', 'income', '💴', 4);
  return new_household_id;
end
$$;

revoke all on function public.is_approved_user() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.request_app_approval() from public;
revoke all on function public.review_app_user(uuid, boolean) from public;
grant execute on function public.is_approved_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.request_app_approval() to authenticated;
grant execute on function public.review_app_user(uuid, boolean) to authenticated;
grant select on public.user_approvals to authenticated;

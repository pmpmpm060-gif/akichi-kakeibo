-- 利用申請の承認画面で、管理者だけが最終利用日を確認できるようにする。

create or replace function public.list_user_approvals_with_last_sign_in()
returns table (
  user_id uuid,
  email text,
  status text,
  is_admin boolean,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  last_sign_in_at timestamptz
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
    auth_user.last_sign_in_at
  from public.user_approvals approval
  join auth.users auth_user on auth_user.id = approval.user_id
  where public.is_app_admin()
    and not approval.is_admin
  order by approval.requested_at desc
  limit 200
$$;

revoke all on function public.list_user_approvals_with_last_sign_in() from public, anon;
grant execute on function public.list_user_approvals_with_last_sign_in() to authenticated;

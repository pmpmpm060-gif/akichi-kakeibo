-- 利用申請の承認権限を、指定されたパパのAuthアカウントだけへ限定する。

update public.user_approvals
set is_admin = (lower(email) = 'pmpmpm060@gmail.com');

-- 管理者権限の誤付与を防ぎ、パパのアカウントが削除・変更された場合も
-- 複数アカウントへ承認権限が広がらないよう一意制約を設ける。
create unique index user_approvals_single_admin_idx
  on public.user_approvals (is_admin)
  where is_admin;


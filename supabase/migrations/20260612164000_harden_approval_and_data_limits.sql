-- 承認状態をRLSの基礎へ組み込み、直接APIアクセスでも利用停止を即時反映する。
-- あわせて、極端な金額・長大文字列・巨大JSONによる集計崩れと容量圧迫を防ぐ。

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.household_id
  from public.household_members member
  join public.user_approvals approval on approval.user_id = member.user_id
  where member.user_id = (select auth.uid())
    and approval.status = 'approved'
  limit 1
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members member
    join public.user_approvals approval on approval.user_id = member.user_id
    where member.user_id = (select auth.uid())
      and member.household_id = target_household_id
      and approval.status = 'approved'
  )
$$;

drop policy if exists "Members can view their membership" on public.household_members;
create policy "Approved members can view their membership"
  on public.household_members for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_approved_user()
  );

alter table public.transactions
  drop constraint if exists transactions_amount_nonnegative_check,
  add constraint transactions_amount_valid_check
    check (amount > 0 and amount = trunc(amount) and amount <= 1000000000),
  add constraint transactions_description_length_check
    check (length(description) <= 500),
  add constraint transactions_receipt_path_length_check
    check (receipt_path is null or length(receipt_path) <= 500);

alter table public.budgets
  drop constraint if exists budgets_amount_nonnegative_check,
  add constraint budgets_amount_valid_check
    check (amount >= 0 and amount = trunc(amount) and amount <= 1000000000);

alter table public.categories
  add constraint categories_name_length_check check (length(name) <= 50),
  add constraint categories_icon_length_check check (icon is null or length(icon) <= 20);

alter table public.recurring_transactions
  add constraint recurring_transactions_amount_limit_check check (amount <= 1000000000),
  add constraint recurring_transactions_description_length_check check (length(description) <= 500);

alter table public.savings_goals
  add constraint savings_goals_name_length_check check (length(name) <= 100),
  add constraint savings_goals_target_amount_limit_check check (target_amount <= 1000000000);

alter table public.savings_contributions
  add constraint savings_contributions_amount_limit_check check (abs(amount) <= 1000000000),
  add constraint savings_contributions_note_length_check check (length(note) <= 500);

alter table public.transaction_templates
  add constraint transaction_templates_amount_limit_check check (amount <= 1000000000),
  add constraint transaction_templates_description_length_check check (length(description) <= 500);

alter table public.monthly_reviews
  add constraint monthly_reviews_content_length_check check (length(content) <= 5000);

alter table public.saved_filters
  add constraint saved_filters_conditions_object_check check (jsonb_typeof(conditions) = 'object'),
  add constraint saved_filters_conditions_size_check check (octet_length(conditions::text) <= 20000);

alter table public.ai_household_diagnoses
  add constraint ai_household_diagnoses_strengths_size_check check (octet_length(strengths::text) <= 10000),
  add constraint ai_household_diagnoses_concerns_size_check check (octet_length(concerns::text) <= 10000),
  add constraint ai_household_diagnoses_actions_size_check check (octet_length(actions::text) <= 10000),
  add constraint ai_household_diagnoses_budgets_size_check check (octet_length(recommended_budgets::text) <= 20000);

alter table public.user_approvals
  add constraint user_approvals_email_length_check check (length(email) between 3 and 320),
  add constraint user_approvals_review_state_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  );

-- RLSの判定に利用する関数以外の内部検証関数は、クライアントから直接実行させない。
revoke execute on function public.is_household_profile(uuid, text) from authenticated;


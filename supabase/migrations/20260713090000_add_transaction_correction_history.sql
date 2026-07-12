-- 取引の過去実績を物理削除せず、訂正・取消の履歴を残す。

alter table public.transactions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deletion_reason text;

alter table public.transactions
  drop constraint if exists transactions_deletion_reason_length_check,
  add constraint transactions_deletion_reason_length_check
    check (deletion_reason is null or length(deletion_reason) <= 500);

create table if not exists public.transaction_correction_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  user_id text not null,
  action text not null check (action in ('update', 'void')),
  reason text not null check (length(reason) between 1 and 500),
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  before_data jsonb not null,
  after_data jsonb
);

create index if not exists transaction_correction_history_transaction_idx
  on public.transaction_correction_history (transaction_id, changed_at desc);

alter table public.transaction_correction_history enable row level security;

drop policy if exists "Members can view transaction correction history" on public.transaction_correction_history;
create policy "Members can view transaction correction history"
  on public.transaction_correction_history
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Owners can insert transaction correction history" on public.transaction_correction_history;
create policy "Owners can insert transaction correction history"
  on public.transaction_correction_history
  for insert
  to authenticated
  with check (public.can_edit_profile(household_id, user_id));

create or replace function public.prevent_direct_transaction_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.transaction_correction_allowed', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(old) is distinct from to_jsonb(new) then
    raise exception 'Use transaction correction RPC to change transaction records.';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Transaction records must be voided, not physically deleted.';
  end if;

  return new;
end
$$;

drop trigger if exists prevent_direct_transaction_correction_trigger on public.transactions;
create trigger prevent_direct_transaction_correction_trigger
before update or delete on public.transactions
for each row execute function public.prevent_direct_transaction_correction();

create or replace function public.detach_generated_transactions_before_recurring_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.transaction_correction_allowed', 'on', true);

  update public.transactions
  set
    recurring_transaction_id = null,
    recurring_month = null
  where recurring_transaction_id = old.id;

  return old;
end
$$;

create or replace function public.update_transaction_with_history(
  target_transaction_id uuid,
  target_category_id uuid,
  target_amount integer,
  target_date date,
  target_description text,
  target_budget_offset_type text default 'none',
  target_budget_offset_category_id uuid default null,
  correction_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_transaction public.transactions%rowtype;
  target_household_id uuid := public.current_household_id();
  target_category_type text;
  offset_category_type text;
  normalized_offset_type text := coalesce(target_budget_offset_type, 'none');
  normalized_reason text := btrim(coalesce(correction_reason, ''));
  before_data jsonb;
  after_data jsonb;
begin
  if target_household_id is null then
    raise exception 'Profile is read only.';
  end if;
  if target_amount <= 0 or target_amount > 1000000000 then raise exception 'Transaction amount is invalid.'; end if;
  if target_date < date '2000-01-01' or target_date > (current_date + interval '5 years')::date then raise exception 'Transaction date is outside the supported range.'; end if;
  if length(coalesce(target_description, '')) > 500 then raise exception 'Transaction description is too long.'; end if;
  if length(normalized_reason) < 1 or length(normalized_reason) > 500 then raise exception 'Correction reason is required.'; end if;
  if normalized_offset_type not in ('none', 'overall', 'category') then raise exception 'Invalid budget offset type.'; end if;

  select *
    into existing_transaction
    from public.transactions
    where id = target_transaction_id
      and household_id = target_household_id
    for update;

  if existing_transaction.id is null or existing_transaction.deleted_at is not null then
    raise exception 'Transaction was not found.';
  end if;
  if not public.can_edit_profile(existing_transaction.household_id, existing_transaction.user_id) then
    raise exception 'Profile is read only.';
  end if;

  select type into target_category_type
  from public.categories
  where id = target_category_id
    and household_id = existing_transaction.household_id
    and user_id = existing_transaction.user_id
    and deleted_at is null;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if target_category_type <> 'income' and normalized_offset_type <> 'none' then
    raise exception 'Only income transactions can be applied to budget.';
  end if;

  if normalized_offset_type = 'category' then
    select type into offset_category_type
    from public.categories
    where id = target_budget_offset_category_id
      and household_id = existing_transaction.household_id
      and user_id = existing_transaction.user_id
      and deleted_at is null;
    if offset_category_type <> 'expense' then
      raise exception 'Budget offset category must be an expense category.';
    end if;
  elsif target_budget_offset_category_id is not null then
    raise exception 'Budget offset category is only available for category offsets.';
  end if;

  before_data := to_jsonb(existing_transaction);

  perform set_config('app.transaction_correction_allowed', 'on', true);
  update public.transactions
  set
    category_id = target_category_id,
    type = target_category_type,
    amount = target_amount,
    date = target_date,
    description = coalesce(target_description, ''),
    budget_offset_type = case when target_category_type = 'income' then normalized_offset_type else 'none' end,
    budget_offset_category_id = case when target_category_type = 'income' and normalized_offset_type = 'category' then target_budget_offset_category_id else null end
  where id = target_transaction_id;

  select to_jsonb(transaction.*)
    into after_data
    from public.transactions transaction
    where transaction.id = target_transaction_id;

  insert into public.transaction_correction_history (
    household_id,
    transaction_id,
    user_id,
    action,
    reason,
    before_data,
    after_data
  )
  values (
    existing_transaction.household_id,
    existing_transaction.id,
    existing_transaction.user_id,
    'update',
    normalized_reason,
    before_data,
    after_data
  );

  return target_transaction_id;
end
$$;

create or replace function public.void_transaction_with_history(
  target_transaction_id uuid,
  correction_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_transaction public.transactions%rowtype;
  target_household_id uuid := public.current_household_id();
  normalized_reason text := btrim(coalesce(correction_reason, ''));
  before_data jsonb;
  after_data jsonb;
begin
  if target_household_id is null then
    raise exception 'Profile is read only.';
  end if;
  if length(normalized_reason) < 1 or length(normalized_reason) > 500 then raise exception 'Correction reason is required.'; end if;

  select *
    into existing_transaction
    from public.transactions
    where id = target_transaction_id
      and household_id = target_household_id
    for update;

  if existing_transaction.id is null or existing_transaction.deleted_at is not null then
    raise exception 'Transaction was not found.';
  end if;
  if not public.can_edit_profile(existing_transaction.household_id, existing_transaction.user_id) then
    raise exception 'Profile is read only.';
  end if;

  before_data := to_jsonb(existing_transaction);

  perform set_config('app.transaction_correction_allowed', 'on', true);
  update public.transactions
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    deletion_reason = normalized_reason
  where id = target_transaction_id;

  select to_jsonb(transaction.*)
    into after_data
    from public.transactions transaction
    where transaction.id = target_transaction_id;

  insert into public.transaction_correction_history (
    household_id,
    transaction_id,
    user_id,
    action,
    reason,
    before_data,
    after_data
  )
  values (
    existing_transaction.household_id,
    existing_transaction.id,
    existing_transaction.user_id,
    'void',
    normalized_reason,
    before_data,
    after_data
  );

  return target_transaction_id;
end
$$;

create or replace function public.get_effective_budgets(target_user_id text, target_month date)
returns table (category_id uuid, category_type text, base_amount numeric, carryover_amount numeric, amount numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with category_budgets as (
    select
      category.id category_id,
      category.type category_type,
      category.carryover_enabled,
      category.carryover_start_month,
      coalesce(budget.amount, 0::numeric) base_amount,
      date_trunc('month', target_month)::date target_month_start
    from public.categories category
    left join public.budgets budget
      on budget.category_id = category.id
      and budget.user_id = target_user_id
      and budget.household_id = category.household_id
    where category.household_id = public.current_household_id()
      and category.user_id = target_user_id
      and public.is_household_profile(category.household_id, target_user_id)
      and category.deleted_at is null
      and target_month >= date '2000-01-01'
      and target_month <= (current_date + interval '5 years')::date
  ),
  total_carryover as (
    select coalesce(sum(
      case
        when category_budget.category_type = 'expense'
          and category_budget.carryover_enabled
          and category_budget.carryover_start_month < category_budget.target_month_start
        then category_budget.base_amount
          * (
            (extract(year from category_budget.target_month_start) - extract(year from category_budget.carryover_start_month)) * 12
            + extract(month from category_budget.target_month_start)
            - extract(month from category_budget.carryover_start_month)
          )
          - coalesce((
            select sum(transaction.amount)
            from public.transactions transaction
            where transaction.category_id = category_budget.category_id
              and transaction.user_id = target_user_id
              and transaction.type = 'expense'
              and transaction.deleted_at is null
              and transaction.date >= category_budget.carryover_start_month
              and transaction.date < category_budget.target_month_start
          ), 0::numeric)
        else 0::numeric
      end
    ), 0::numeric) as amount
    from category_budgets category_budget
  ),
  ranked as (
    select
      category_budgets.*,
      row_number() over (
        partition by category_budgets.category_type
        order by category_budgets.category_id
      ) as type_row_number
    from category_budgets
  )
  select
    ranked.category_id,
    ranked.category_type,
    ranked.base_amount,
    case
      when ranked.category_type = 'expense' and ranked.type_row_number = 1
      then total_carryover.amount
      else 0::numeric
    end as carryover_amount,
    ranked.base_amount
      + case
        when ranked.category_type = 'expense' and ranked.type_row_number = 1
        then total_carryover.amount
        else 0::numeric
      end as amount
  from ranked
  cross join total_carryover
$$;

revoke execute on function public.prevent_direct_transaction_correction() from public, anon, authenticated;
revoke execute on function public.detach_generated_transactions_before_recurring_delete() from public, anon, authenticated;
revoke all on function public.update_transaction_with_history(uuid, uuid, integer, date, text, text, uuid, text) from public, anon;
grant execute on function public.update_transaction_with_history(uuid, uuid, integer, date, text, text, uuid, text) to authenticated;
revoke all on function public.void_transaction_with_history(uuid, text) from public, anon;
grant execute on function public.void_transaction_with_history(uuid, text) to authenticated;
revoke all on function public.get_effective_budgets(text, date) from public, anon;
grant execute on function public.get_effective_budgets(text, date) to authenticated;

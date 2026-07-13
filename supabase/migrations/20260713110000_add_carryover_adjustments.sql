-- 繰越金額を直接上書きせず、対象月ごとの調整額として履歴つきで保存する。

create table if not exists public.carryover_adjustments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null,
  month date not null,
  amount integer not null default 0,
  reason text not null,
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint carryover_adjustments_month_start_check check (month = date_trunc('month', month)::date),
  constraint carryover_adjustments_amount_check check (amount between -1000000000 and 1000000000),
  constraint carryover_adjustments_reason_length_check check (length(reason) between 1 and 500),
  constraint carryover_adjustments_household_user_check check (user_id in ('user_a', 'user_b')),
  unique (household_id, user_id, month)
);

create table if not exists public.carryover_adjustment_history (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid references public.carryover_adjustments(id) on delete set null,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id text not null,
  month date not null,
  before_amount integer,
  after_amount integer not null,
  before_reason text,
  after_reason text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);

create index if not exists carryover_adjustments_user_month_idx
  on public.carryover_adjustments (household_id, user_id, month);

create index if not exists carryover_adjustment_history_month_idx
  on public.carryover_adjustment_history (household_id, user_id, month, changed_at desc);

alter table public.carryover_adjustments enable row level security;
alter table public.carryover_adjustment_history enable row level security;

drop policy if exists "Members can view carryover adjustments" on public.carryover_adjustments;
create policy "Members can view carryover adjustments"
  on public.carryover_adjustments
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Owners can insert carryover adjustments" on public.carryover_adjustments;
create policy "Owners can insert carryover adjustments"
  on public.carryover_adjustments
  for insert
  to authenticated
  with check (public.can_edit_profile(household_id, user_id));

drop policy if exists "Owners can update carryover adjustments" on public.carryover_adjustments;
create policy "Owners can update carryover adjustments"
  on public.carryover_adjustments
  for update
  to authenticated
  using (public.can_edit_profile(household_id, user_id))
  with check (public.can_edit_profile(household_id, user_id));

drop policy if exists "Members can view carryover adjustment history" on public.carryover_adjustment_history;
create policy "Members can view carryover adjustment history"
  on public.carryover_adjustment_history
  for select
  to authenticated
  using (public.is_household_member(household_id));

create or replace function public.save_carryover_adjustment(
  target_user_id text,
  target_month date,
  target_amount integer,
  adjustment_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  normalized_month date := date_trunc('month', target_month)::date;
  normalized_reason text := btrim(coalesce(adjustment_reason, ''));
  existing_adjustment public.carryover_adjustments%rowtype;
  saved_adjustment_id uuid;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if normalized_month < date '2000-01-01'
    or normalized_month > date_trunc('month', current_date + interval '5 years')::date
  then
    raise exception 'Target month is outside the supported range.';
  end if;
  if target_amount < -1000000000 or target_amount > 1000000000 then
    raise exception 'Carryover adjustment amount is invalid.';
  end if;
  if length(normalized_reason) < 1 or length(normalized_reason) > 500 then
    raise exception 'Carryover adjustment reason is required.';
  end if;

  select *
    into existing_adjustment
    from public.carryover_adjustments
    where household_id = target_household_id
      and user_id = target_user_id
      and month = normalized_month
    for update;

  insert into public.carryover_adjustments (
    household_id,
    user_id,
    month,
    amount,
    reason,
    updated_by,
    updated_at
  )
  values (
    target_household_id,
    target_user_id,
    normalized_month,
    target_amount,
    normalized_reason,
    auth.uid(),
    now()
  )
  on conflict (household_id, user_id, month)
  do update set
    amount = excluded.amount,
    reason = excluded.reason,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into saved_adjustment_id;

  insert into public.carryover_adjustment_history (
    adjustment_id,
    household_id,
    user_id,
    month,
    before_amount,
    after_amount,
    before_reason,
    after_reason
  )
  values (
    saved_adjustment_id,
    target_household_id,
    target_user_id,
    normalized_month,
    existing_adjustment.amount,
    target_amount,
    existing_adjustment.reason,
    normalized_reason
  );

  return saved_adjustment_id;
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
  raw_total_carryover as (
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
  total_carryover as (
    select raw_total_carryover.amount
      + coalesce((
        select sum(adjustment.amount)
        from public.carryover_adjustments adjustment
        where adjustment.household_id = public.current_household_id()
          and adjustment.user_id = target_user_id
          and adjustment.month = date_trunc('month', target_month)::date
      ), 0::numeric) as amount
    from raw_total_carryover
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

revoke all on function public.save_carryover_adjustment(text, date, integer, text) from public, anon;
grant execute on function public.save_carryover_adjustment(text, date, integer, text) to authenticated;
revoke all on function public.get_effective_budgets(text, date) from public, anon;
grant execute on function public.get_effective_budgets(text, date) to authenticated;

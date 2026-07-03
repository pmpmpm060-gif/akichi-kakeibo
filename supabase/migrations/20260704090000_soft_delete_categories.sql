-- カテゴリを物理削除せず、過去の取引履歴から参照できる状態で非表示にする。

alter table public.categories
  add column if not exists deleted_at timestamptz;

create index if not exists categories_active_household_user_sort_order_idx
  on public.categories (household_id, user_id, sort_order, created_at)
  where deleted_at is null;

create or replace function public.enforce_profile_row_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  maximum_rows integer := tg_argv[0]::integer;
  filter_column text := nullif(tg_argv[1], '');
  filter_value text;
  current_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(tg_table_name || ':' || new.household_id::text || ':' || new.user_id, 0)
  );

  if tg_table_name = 'categories' then
    select count(*) into current_count
    from public.categories
    where household_id = new.household_id
      and user_id = new.user_id
      and deleted_at is null;
  elsif filter_column is null then
    execute format('select count(*) from public.%I where household_id = $1 and user_id = $2', tg_table_name)
      into current_count using new.household_id, new.user_id;
  else
    filter_value := to_jsonb(new) ->> filter_column;
    execute format(
      'select count(*) from public.%I where household_id = $1 and user_id = $2 and %I::text = $3',
      tg_table_name,
      filter_column
    ) into current_count using new.household_id, new.user_id, filter_value;
  end if;

  if current_count >= maximum_rows then
    raise exception 'Stored item limit reached.';
  end if;
  return new;
end
$$;

create or replace function public.delete_unused_category(target_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid;
  target_user_id text;
  disabled_recurring_count integer;
begin
  select household_id, user_id
    into target_household_id, target_user_id
    from public.categories
    where id = target_category_id
    for update;

  if target_household_id is null
    or not public.can_edit_profile(target_household_id, target_user_id)
  then
    raise exception 'Category not found.';
  end if;

  update public.categories
  set deleted_at = coalesce(deleted_at, now())
  where id = target_category_id
    and household_id = target_household_id
    and user_id = target_user_id;

  update public.recurring_transactions
  set enabled = false
  where category_id = target_category_id
    and household_id = target_household_id
    and user_id = target_user_id
    and enabled;

  get diagnostics disabled_recurring_count = row_count;
  return disabled_recurring_count;
end
$$;

create or replace function public.save_user_budgets(target_user_id text, budget_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  entry_count integer;
  matched_category_count integer;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if budget_entries is null
    or jsonb_typeof(budget_entries) <> 'array'
    or octet_length(budget_entries::text) > 50000
    or jsonb_array_length(budget_entries) > 100
  then
    raise exception 'Budget entries are invalid or too large.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(budget_entries) entry
    where jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry -> 'category_id') is distinct from 'string'
      or jsonb_typeof(entry -> 'amount') is distinct from 'number'
      or jsonb_typeof(entry -> 'carryover_enabled') is distinct from 'boolean'
      or (entry ->> 'amount')::numeric < 0
      or (entry ->> 'amount')::numeric > 1000000000
      or (entry ->> 'amount')::numeric <> trunc((entry ->> 'amount')::numeric)
  ) then
    raise exception 'Budget entries contain invalid values.';
  end if;

  select count(*), count(distinct entry ->> 'category_id')
    into entry_count, matched_category_count
    from jsonb_array_elements(budget_entries) entry;
  if entry_count <> matched_category_count then raise exception 'Budget entries contain duplicate categories.'; end if;

  select count(*) into matched_category_count
  from public.categories category
  join jsonb_array_elements(budget_entries) entry on category.id = (entry ->> 'category_id')::uuid
  where category.household_id = target_household_id
    and category.user_id = target_user_id
    and category.deleted_at is null;
  if entry_count <> matched_category_count then raise exception 'Budget entries contain inaccessible categories.'; end if;

  insert into public.budgets (household_id, user_id, category_id, amount)
  select target_household_id, target_user_id, (entry ->> 'category_id')::uuid, (entry ->> 'amount')::numeric
  from jsonb_array_elements(budget_entries) entry
  on conflict (household_id, user_id, category_id) do update set amount = excluded.amount;

  update public.categories category
  set carryover_enabled = (entry ->> 'carryover_enabled')::boolean
  from jsonb_array_elements(budget_entries) entry
  where category.id = (entry ->> 'category_id')::uuid
    and category.household_id = target_household_id
    and category.user_id = target_user_id
    and category.deleted_at is null;
  return entry_count;
end
$$;

create or replace function public.save_category_order(target_user_id text, category_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  expected_count integer;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if coalesce(array_length(category_ids, 1), 0) > 100 then raise exception 'Category order is too large.'; end if;

  select count(*) into expected_count from public.categories
  where household_id = target_household_id
    and user_id = target_user_id
    and deleted_at is null;
  if expected_count <> coalesce(array_length(category_ids, 1), 0)
    or expected_count <> (select count(distinct entry.category_id) from unnest(category_ids) as entry(category_id))
    or exists (
      select 1 from unnest(category_ids) as category_id
      left join public.categories category on category.id = category_id
        and category.household_id = target_household_id
        and category.user_id = target_user_id
        and category.deleted_at is null
      where category.id is null
    )
  then
    raise exception 'Category order must contain all active categories exactly once.';
  end if;

  update public.categories category
  set sort_order = (ordered.ordinality - 1)::integer
  from unnest(category_ids) with ordinality as ordered(category_id, ordinality)
  where category.id = ordered.category_id
    and category.household_id = target_household_id
    and category.user_id = target_user_id
    and category.deleted_at is null;
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
      and category.deleted_at is null
      and public.is_household_profile(category.household_id, target_user_id)
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

create or replace function public.create_transaction_with_tags(
  target_user_id text,
  target_category_id uuid,
  target_amount integer,
  target_date date,
  target_description text,
  target_budget_offset_type text default 'none',
  target_budget_offset_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  target_category_type text;
  offset_category_type text;
  normalized_offset_type text := coalesce(target_budget_offset_type, 'none');
  new_transaction_id uuid;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if target_amount <= 0 or target_amount > 1000000000 then raise exception 'Transaction amount is invalid.'; end if;
  if target_date < date '2000-01-01' or target_date > (current_date + interval '5 years')::date then raise exception 'Transaction date is outside the supported range.'; end if;
  if length(coalesce(target_description, '')) > 500 then raise exception 'Transaction description is too long.'; end if;
  if normalized_offset_type not in ('none', 'overall', 'category') then raise exception 'Invalid budget offset type.'; end if;

  select type into target_category_type from public.categories
  where id = target_category_id
    and household_id = target_household_id
    and user_id = target_user_id
    and deleted_at is null;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if target_category_type <> 'income' and normalized_offset_type <> 'none' then
    raise exception 'Only income transactions can be applied to budget.';
  end if;

  if normalized_offset_type = 'category' then
    select type into offset_category_type from public.categories
    where id = target_budget_offset_category_id
      and household_id = target_household_id
      and user_id = target_user_id
      and deleted_at is null;

    if offset_category_type <> 'expense' then
      raise exception 'Budget offset category must be an expense category.';
    end if;
  elsif target_budget_offset_category_id is not null then
    raise exception 'Budget offset category is only available for category offsets.';
  end if;

  insert into public.transactions (
    household_id,
    user_id,
    category_id,
    type,
    amount,
    date,
    description,
    budget_offset_type,
    budget_offset_category_id
  )
  values (
    target_household_id,
    target_user_id,
    target_category_id,
    target_category_type,
    target_amount,
    target_date,
    coalesce(target_description, ''),
    normalized_offset_type,
    case when normalized_offset_type = 'category' then target_budget_offset_category_id else null end
  )
  returning id into new_transaction_id;

  return new_transaction_id;
end
$$;

create or replace function public.generate_recurring_transactions(target_user_id text, target_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  normalized_month date := date_trunc('month', target_month)::date;
  inserted_count integer;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if normalized_month < date '2000-01-01'
    or normalized_month > date_trunc('month', current_date + interval '5 years')::date
  then
    raise exception 'Target month is outside the supported range.';
  end if;

  insert into public.transactions (household_id, user_id, category_id, type, amount, date, description, recurring_transaction_id, recurring_month)
  select recurring.household_id, recurring.user_id, recurring.category_id, category.type, recurring.amount,
    make_date(extract(year from normalized_month)::integer, extract(month from normalized_month)::integer, least(recurring.day_of_month, extract(day from (normalized_month + interval '1 month - 1 day'))::integer)),
    recurring.description, recurring.id, normalized_month
  from public.recurring_transactions recurring
  join public.categories category on category.id = recurring.category_id
  where recurring.household_id = target_household_id
    and recurring.user_id = target_user_id
    and recurring.enabled
    and recurring.start_month <= normalized_month
    and (recurring.end_month is null or recurring.end_month >= normalized_month)
    and category.deleted_at is null
  on conflict (recurring_transaction_id, recurring_month) where recurring_transaction_id is not null do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;

revoke all on function public.delete_unused_category(uuid) from public, anon;
grant execute on function public.delete_unused_category(uuid) to authenticated;
revoke all on function public.save_user_budgets(text, jsonb) from public, anon;
grant execute on function public.save_user_budgets(text, jsonb) to authenticated;
revoke all on function public.save_category_order(text, uuid[]) from public, anon;
grant execute on function public.save_category_order(text, uuid[]) to authenticated;
revoke all on function public.get_effective_budgets(text, date) from public, anon;
grant execute on function public.get_effective_budgets(text, date) to authenticated;
revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, text, uuid) from public, anon;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, text, uuid) to authenticated;
revoke all on function public.generate_recurring_transactions(text, date) from public, anon;
grant execute on function public.generate_recurring_transactions(text, date) to authenticated;
revoke execute on function public.enforce_profile_row_limit() from public, anon, authenticated;

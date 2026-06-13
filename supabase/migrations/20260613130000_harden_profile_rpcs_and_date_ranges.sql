-- 公開RPCの入口で本人権限・入力サイズ・年月範囲を検証し、拒否リクエストのDB負荷を抑える。

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
  where category.household_id = target_household_id and category.user_id = target_user_id;
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
    and category.user_id = target_user_id;
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
  where household_id = target_household_id and user_id = target_user_id;
  if expected_count <> coalesce(array_length(category_ids, 1), 0)
    or expected_count <> (select count(distinct entry.category_id) from unnest(category_ids) as entry(category_id))
    or exists (
      select 1 from unnest(category_ids) as category_id
      left join public.categories category on category.id = category_id
        and category.household_id = target_household_id and category.user_id = target_user_id
      where category.id is null
    )
  then
    raise exception 'Category order must contain all categories exactly once.';
  end if;

  update public.categories category
  set sort_order = (ordered.ordinality - 1)::integer
  from unnest(category_ids) with ordinality as ordered(category_id, ordinality)
  where category.id = ordered.category_id
    and category.household_id = target_household_id
    and category.user_id = target_user_id;
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
  on conflict (recurring_transaction_id, recurring_month) where recurring_transaction_id is not null do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;

create or replace function public.create_transaction_with_tags(
  target_user_id text,
  target_category_id uuid,
  target_amount integer,
  target_date date,
  target_description text,
  target_tag_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  target_category_type text;
  new_transaction_id uuid;
  tag_count integer := coalesce(array_length(target_tag_ids, 1), 0);
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if target_amount <= 0 or target_amount > 1000000000 then raise exception 'Transaction amount is invalid.'; end if;
  if target_date < date '2000-01-01' or target_date > (current_date + interval '5 years')::date then raise exception 'Transaction date is outside the supported range.'; end if;
  if length(coalesce(target_description, '')) > 500 then raise exception 'Transaction description is too long.'; end if;
  if tag_count > 20 then raise exception 'A transaction can have at most 20 tags.'; end if;

  select type into target_category_type from public.categories
  where id = target_category_id and household_id = target_household_id and user_id = target_user_id;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if exists (
    select 1 from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
    left join public.tags tag on tag.id = tag_id and tag.household_id = target_household_id and tag.user_id = target_user_id
    where tag.id is null
  ) or tag_count <> (
    select count(distinct tag_id) from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
  ) then
    raise exception 'Invalid or duplicate transaction tags.';
  end if;

  insert into public.transactions (household_id, user_id, category_id, type, amount, date, description)
  values (target_household_id, target_user_id, target_category_id, target_category_type, target_amount, target_date, coalesce(target_description, ''))
  returning id into new_transaction_id;

  insert into public.transaction_tags (household_id, transaction_id, tag_id)
  select target_household_id, new_transaction_id, tag_id
  from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id;
  return new_transaction_id;
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
    select category.id category_id, category.type category_type, category.carryover_enabled,
      category.carryover_start_month, coalesce(budget.amount, 0::numeric) base_amount,
      date_trunc('month', target_month)::date target_month_start
    from public.categories category
    left join public.budgets budget on budget.category_id = category.id and budget.user_id = target_user_id and budget.household_id = category.household_id
    where category.household_id = public.current_household_id()
      and category.user_id = target_user_id
      and public.is_household_profile(category.household_id, target_user_id)
      and target_month >= date '2000-01-01'
      and target_month <= (current_date + interval '5 years')::date
  ),
  calculated as (
    select category_budget.*,
      case when category_budget.carryover_enabled and category_budget.carryover_start_month < category_budget.target_month_start
      then category_budget.base_amount * ((extract(year from category_budget.target_month_start) - extract(year from category_budget.carryover_start_month)) * 12 + extract(month from category_budget.target_month_start) - extract(month from category_budget.carryover_start_month))
        - coalesce((select sum(transaction.amount) from public.transactions transaction where transaction.category_id = category_budget.category_id and transaction.user_id = target_user_id and transaction.date >= category_budget.carryover_start_month and transaction.date < category_budget.target_month_start), 0::numeric)
      else 0::numeric end carryover_amount
    from category_budgets category_budget
  )
  select calculated.category_id, calculated.category_type, calculated.base_amount, calculated.carryover_amount,
    calculated.base_amount + calculated.carryover_amount amount from calculated
$$;

create or replace function public.can_insert_ai_diagnosis(target_household_id uuid, target_user_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare diagnosis_count bigint;
begin
  if not public.can_edit_profile(target_household_id, target_user_id) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_household_id::text, 0));
  select count(*) into diagnosis_count from public.ai_household_diagnoses diagnosis
  where diagnosis.household_id = target_household_id and diagnosis.created_at >= date_trunc('hour', now());
  return diagnosis_count < 12;
end
$$;

revoke all on function public.save_user_budgets(text, jsonb) from public, anon;
grant execute on function public.save_user_budgets(text, jsonb) to authenticated;
revoke all on function public.save_category_order(text, uuid[]) from public, anon;
grant execute on function public.save_category_order(text, uuid[]) to authenticated;
revoke all on function public.generate_recurring_transactions(text, date) from public, anon;
grant execute on function public.generate_recurring_transactions(text, date) to authenticated;
revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) from public, anon;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) to authenticated;
revoke all on function public.get_effective_budgets(text, date) from public, anon;
grant execute on function public.get_effective_budgets(text, date) to authenticated;
revoke execute on function public.can_insert_ai_diagnosis(uuid, text) from public, anon, authenticated;

-- 世帯ごとの表示プロフィールと、新規利用者の独立世帯セットアップを追加する。

create table public.household_profiles (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id text not null,
  display_name text not null check (length(trim(display_name)) between 1 and 30),
  icon text not null default '👤',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (household_id, profile_id),
  check (profile_id in ('user_a', 'user_b'))
);

insert into public.household_profiles (household_id, profile_id, display_name, icon, sort_order)
select id, 'user_a', 'ママ', '👩‍🦰', 0 from public.households
on conflict do nothing;

insert into public.household_profiles (household_id, profile_id, display_name, icon, sort_order)
select id, 'user_b', 'パパ', '👨', 1 from public.households
on conflict do nothing;

alter table public.household_profiles enable row level security;
create policy "Members can manage household profiles" on public.household_profiles for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
grant select, insert, update, delete on public.household_profiles to authenticated;

create or replace function public.is_household_profile(target_household_id uuid, target_profile_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_profiles
    where household_id = target_household_id and profile_id = target_profile_id
  )
$$;

create or replace function public.setup_personal_household(household_name text, display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
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

revoke all on function public.is_household_profile(uuid, text) from public;
grant execute on function public.is_household_profile(uuid, text) to authenticated;
revoke all on function public.setup_personal_household(text, text) from public;
grant execute on function public.setup_personal_household(text, text) to authenticated;

create or replace function public.validate_household_profile_reference()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_household_profile(new.household_id, new.user_id) then
    raise exception 'User profile does not belong to the household.';
  end if;
  return new;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'categories', 'transactions', 'budgets', 'recurring_transactions', 'savings_goals',
    'savings_contributions', 'dismissed_alerts', 'tags', 'transaction_templates',
    'monthly_reviews', 'saved_filters', 'notification_preferences'
  ] loop
    execute format('drop trigger if exists validate_household_profile_reference_trigger on public.%I', table_name);
    execute format(
      'create trigger validate_household_profile_reference_trigger before insert or update of household_id, user_id on public.%I for each row execute function public.validate_household_profile_reference()',
      table_name
    );
  end loop;
end
$$;

revoke all on function public.validate_household_profile_reference() from public;

create or replace function public.save_user_budgets(target_user_id text, budget_entries jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare target_household_id uuid := public.current_household_id(); entry_count integer; matched_category_count integer;
begin
  if target_household_id is null or not public.is_household_profile(target_household_id, target_user_id) then raise exception 'Invalid household user.'; end if;
  if budget_entries is null or jsonb_typeof(budget_entries) <> 'array' then raise exception 'Budget entries must be an array.'; end if;
  if exists (select 1 from jsonb_array_elements(budget_entries) entry where jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry -> 'category_id') is distinct from 'string' or jsonb_typeof(entry -> 'amount') is distinct from 'number' or jsonb_typeof(entry -> 'carryover_enabled') is distinct from 'boolean' or (entry ->> 'amount')::numeric < 0) then raise exception 'Budget entries contain invalid values.'; end if;
  select count(*), count(distinct entry ->> 'category_id') into entry_count, matched_category_count from jsonb_array_elements(budget_entries) entry;
  if entry_count <> matched_category_count then raise exception 'Budget entries contain duplicate categories.'; end if;
  select count(*) into matched_category_count from public.categories category join jsonb_array_elements(budget_entries) entry on category.id = (entry ->> 'category_id')::uuid where category.household_id = target_household_id and category.user_id = target_user_id;
  if entry_count <> matched_category_count then raise exception 'Budget entries contain inaccessible categories.'; end if;
  insert into public.budgets (household_id, user_id, category_id, amount) select target_household_id, target_user_id, (entry ->> 'category_id')::uuid, (entry ->> 'amount')::numeric from jsonb_array_elements(budget_entries) entry on conflict (household_id, user_id, category_id) do update set amount = excluded.amount;
  update public.categories category set carryover_enabled = (entry ->> 'carryover_enabled')::boolean from jsonb_array_elements(budget_entries) entry where category.id = (entry ->> 'category_id')::uuid and category.household_id = target_household_id and category.user_id = target_user_id;
  return entry_count;
end $$;

create or replace function public.save_category_order(target_user_id text, category_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
declare target_household_id uuid := public.current_household_id(); expected_count integer;
begin
  if target_household_id is null or not public.is_household_profile(target_household_id, target_user_id) then raise exception 'Invalid household user.'; end if;
  select count(*) into expected_count from public.categories where household_id = target_household_id and user_id = target_user_id;
  if expected_count <> coalesce(array_length(category_ids, 1), 0) or expected_count <> (select count(distinct entry.category_id) from unnest(category_ids) as entry(category_id)) or exists (select 1 from unnest(category_ids) as category_id left join public.categories category on category.id = category_id and category.household_id = target_household_id and category.user_id = target_user_id where category.id is null) then raise exception 'Category order must contain all categories exactly once.'; end if;
  update public.categories category set sort_order = (ordered.ordinality - 1)::integer from unnest(category_ids) with ordinality as ordered(category_id, ordinality) where category.id = ordered.category_id and category.household_id = target_household_id and category.user_id = target_user_id;
end $$;

create or replace function public.generate_recurring_transactions(target_user_id text, target_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare target_household_id uuid := public.current_household_id(); normalized_month date := date_trunc('month', target_month)::date; inserted_count integer;
begin
  if target_household_id is null or not public.is_household_profile(target_household_id, target_user_id) then raise exception 'Invalid household user.'; end if;
  insert into public.transactions (household_id, user_id, category_id, type, amount, date, description, recurring_transaction_id, recurring_month)
  select recurring.household_id, recurring.user_id, recurring.category_id, category.type, recurring.amount, make_date(extract(year from normalized_month)::integer, extract(month from normalized_month)::integer, least(recurring.day_of_month, extract(day from (normalized_month + interval '1 month - 1 day'))::integer)), recurring.description, recurring.id, normalized_month
  from public.recurring_transactions recurring join public.categories category on category.id = recurring.category_id
  where recurring.household_id = target_household_id and recurring.user_id = target_user_id and recurring.enabled and recurring.start_month <= normalized_month and (recurring.end_month is null or recurring.end_month >= normalized_month)
  on conflict (recurring_transaction_id, recurring_month) where recurring_transaction_id is not null do nothing;
  get diagnostics inserted_count = row_count; return inserted_count;
end $$;

create or replace function public.get_effective_budgets(target_user_id text, target_month date)
returns table (category_id uuid, category_type text, base_amount numeric, carryover_amount numeric, amount numeric)
language sql stable security definer set search_path = ''
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

-- JSON必須項目の欠落と、型が不正な項目を拒否する。

create or replace function public.save_user_budgets(
  target_user_id text,
  budget_entries jsonb
)
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
  -- 書き込み前に入力全体を検証する。途中で例外が発生した場合は、
  -- 予算額とカテゴリの繰越設定を両方ロールバックする。
  if target_household_id is null then
    raise exception 'Authenticated user does not belong to a household.';
  end if;

  if target_user_id not in ('user_a', 'user_b') then
    raise exception 'Invalid household user.';
  end if;

  if budget_entries is null or jsonb_typeof(budget_entries) <> 'array' then
    raise exception 'Budget entries must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(budget_entries) entry
    where jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry -> 'category_id') is distinct from 'string'
      or jsonb_typeof(entry -> 'amount') is distinct from 'number'
      or jsonb_typeof(entry -> 'carryover_enabled') is distinct from 'boolean'
      or (entry ->> 'amount')::numeric < 0
  ) then
    raise exception 'Budget entries contain invalid values.';
  end if;

  select count(*), count(distinct entry ->> 'category_id')
    into entry_count, matched_category_count
    from jsonb_array_elements(budget_entries) entry;

  if entry_count <> matched_category_count then
    raise exception 'Budget entries contain duplicate categories.';
  end if;

  select count(*)
    into matched_category_count
    from public.categories category
    join jsonb_array_elements(budget_entries) entry
      on category.id = (entry ->> 'category_id')::uuid
    where category.household_id = target_household_id
      and category.user_id = target_user_id;

  if entry_count <> matched_category_count then
    -- アクセス可能なカテゴリだけを部分保存せず、
    -- 別世帯・別画面表示ユーザーのカテゴリIDが含まれていれば全体を拒否する。
    raise exception 'Budget entries contain inaccessible categories.';
  end if;

  insert into public.budgets (household_id, user_id, category_id, amount)
  select
    target_household_id,
    target_user_id,
    (entry ->> 'category_id')::uuid,
    (entry ->> 'amount')::numeric
  from jsonb_array_elements(budget_entries) entry
  on conflict (household_id, user_id, category_id)
  do update set amount = excluded.amount;

  update public.categories category
  set carryover_enabled = (entry ->> 'carryover_enabled')::boolean
  from jsonb_array_elements(budget_entries) entry
  where category.id = (entry ->> 'category_id')::uuid
    and category.household_id = target_household_id
    and category.user_id = target_user_id;

  return entry_count;
end
$$;

revoke all on function public.save_user_budgets(text, jsonb) from public;
grant execute on function public.save_user_budgets(text, jsonb) to authenticated;

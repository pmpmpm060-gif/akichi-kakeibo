-- 特別支出予定機能を廃止する。

update public.transactions
set
  budget_offset_type = 'none',
  budget_offset_category_id = null
where budget_offset_type = 'special_reserve';

alter table public.transactions
  drop constraint if exists transactions_budget_offset_type_check,
  add constraint transactions_budget_offset_type_check
    check (budget_offset_type in ('none', 'overall', 'category'));

alter table public.transactions
  drop constraint if exists transactions_budget_offset_shape_check,
  add constraint transactions_budget_offset_shape_check
    check (
      (budget_offset_type = 'none' and budget_offset_category_id is null)
      or (budget_offset_type = 'category' and budget_offset_category_id is not null)
      or (budget_offset_type = 'overall' and budget_offset_category_id is null)
    );

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
  where id = target_category_id and household_id = target_household_id and user_id = target_user_id;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if target_category_type <> 'income' and normalized_offset_type <> 'none' then
    raise exception 'Only income transactions can be applied to budget.';
  end if;

  if normalized_offset_type = 'category' then
    select type into offset_category_type from public.categories
    where id = target_budget_offset_category_id
      and household_id = target_household_id
      and user_id = target_user_id;

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

revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, text, uuid) from public, anon;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, text, uuid) to authenticated;

drop table if exists public.special_expense_payments;
drop table if exists public.special_expense_plans;

drop function if exists public.get_special_expense_summary(text, date);
drop function if exists public.generate_special_expense_payments(text, date);
drop function if exists public.create_special_expense_plan(text, uuid, text, integer, date, jsonb);
drop function if exists public.validate_special_expense_links();

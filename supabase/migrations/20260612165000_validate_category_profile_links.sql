-- 取引・予算が、同じ世帯だけでなく同じ表示プロフィールのカテゴリを参照することを保証する。

create or replace function public.validate_transaction_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_household_id uuid;
  category_user_id text;
  category_type text;
begin
  select household_id, user_id, type
    into category_household_id, category_user_id, category_type
    from public.categories
    where id = new.category_id;

  if category_household_id is null then
    raise exception 'Transaction category does not exist.';
  end if;
  if category_household_id <> new.household_id or category_user_id <> new.user_id then
    raise exception 'Transaction category must belong to the same household user.';
  end if;
  if category_type <> new.type then
    raise exception 'Transaction type must match category type.';
  end if;
  return new;
end
$$;

drop trigger if exists validate_transaction_category_trigger on public.transactions;
create trigger validate_transaction_category_trigger
before insert or update of category_id, household_id, user_id, type
on public.transactions
for each row execute function public.validate_transaction_category();

create or replace function public.validate_budget_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_household_id uuid;
  category_user_id text;
begin
  select household_id, user_id
    into category_household_id, category_user_id
    from public.categories
    where id = new.category_id;

  if category_household_id is null then
    raise exception 'Budget category does not exist.';
  end if;
  if category_household_id <> new.household_id or category_user_id <> new.user_id then
    raise exception 'Budget category must belong to the same household user.';
  end if;
  return new;
end
$$;

drop trigger if exists validate_budget_category_trigger on public.budgets;
create trigger validate_budget_category_trigger
before insert or update of category_id, household_id, user_id
on public.budgets
for each row execute function public.validate_budget_category();

revoke execute on function public.validate_transaction_category() from public, anon, authenticated;
revoke execute on function public.validate_budget_category() from public, anon, authenticated;


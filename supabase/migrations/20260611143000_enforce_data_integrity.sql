-- アプリ画面が前提としているデータ整合性を、DB制約でも保証する。

update public.transactions
  set description = ''
  where description is null;

alter table public.transactions
  alter column category_id set not null,
  alter column description set default '',
  alter column description set not null,
  alter column user_id set not null;

alter table public.categories
  drop constraint if exists categories_type_check;

alter table public.categories
  add constraint categories_type_check
  check (type in ('expense', 'income'));

alter table public.categories
  drop constraint if exists categories_name_not_blank_check;

alter table public.categories
  add constraint categories_name_not_blank_check
  check (btrim(name) <> '');

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('expense', 'income'));

alter table public.transactions
  drop constraint if exists transactions_amount_nonnegative_check;

alter table public.transactions
  add constraint transactions_amount_nonnegative_check
  check (amount >= 0);

alter table public.budgets
  drop constraint if exists budgets_amount_nonnegative_check;

alter table public.budgets
  add constraint budgets_amount_nonnegative_check
  check (amount >= 0);

create or replace function public.validate_transaction_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_household_id uuid;
  category_type text;
begin
  -- RLSは世帯へのアクセス権を検証し、このトリガーは特権処理や
  -- 将来のサーバー処理から書き込む場合も行同士の整合性を保護する。
  select household_id, type
    into category_household_id, category_type
    from public.categories
    where id = new.category_id;

  if category_household_id is null then
    raise exception 'Transaction category does not exist.';
  end if;

  if category_household_id <> new.household_id then
    raise exception 'Transaction and category must belong to the same household.';
  end if;

  if category_type <> new.type then
    raise exception 'Transaction type must match category type.';
  end if;

  return new;
end
$$;

revoke all on function public.validate_transaction_category() from public;

drop trigger if exists validate_transaction_category_trigger on public.transactions;

create trigger validate_transaction_category_trigger
before insert or update of category_id, household_id, type
on public.transactions
for each row
execute function public.validate_transaction_category();

create or replace function public.sync_transaction_category_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 集計を簡単にするため取引にもカテゴリ種別を保持している。
  -- カテゴリ種別の変更時は、非正規化した値も同期する。
  update public.transactions
    set type = new.type
    where category_id = new.id
      and type <> new.type;

  return new;
end
$$;

revoke all on function public.sync_transaction_category_type() from public;

drop trigger if exists sync_transaction_category_type_trigger on public.categories;

create trigger sync_transaction_category_type_trigger
after update of type
on public.categories
for each row
when (old.type is distinct from new.type)
execute function public.sync_transaction_category_type();

create or replace function public.validate_budget_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_household_id uuid;
begin
  -- 予算が別世帯のカテゴリを参照することを禁止する。
  select household_id
    into category_household_id
    from public.categories
    where id = new.category_id;

  if category_household_id is null then
    raise exception 'Budget category does not exist.';
  end if;

  if category_household_id <> new.household_id then
    raise exception 'Budget and category must belong to the same household.';
  end if;

  return new;
end
$$;

revoke all on function public.validate_budget_category() from public;

drop trigger if exists validate_budget_category_trigger on public.budgets;

create trigger validate_budget_category_trigger
before insert or update of category_id, household_id
on public.budgets
for each row
execute function public.validate_budget_category();

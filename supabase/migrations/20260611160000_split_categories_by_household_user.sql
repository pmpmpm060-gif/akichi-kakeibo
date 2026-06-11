-- Categories are owned separately by the two household display users.

alter table public.categories
  add column if not exists user_id text;

update public.categories
  set user_id = 'user_a'
  where user_id is null;

alter table public.categories
  alter column user_id set default 'user_a',
  alter column user_id set not null;

alter table public.categories
  drop constraint if exists categories_household_user_check;

alter table public.categories
  add constraint categories_household_user_check
  check (user_id in ('user_a', 'user_b'));

create or replace function public.prevent_category_user_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id <> new.user_id then
    raise exception 'Category household user cannot be changed.';
  end if;

  return new;
end
$$;

revoke all on function public.prevent_category_user_change() from public;

drop trigger if exists prevent_category_user_change_trigger on public.categories;

create trigger prevent_category_user_change_trigger
before update of user_id
on public.categories
for each row
execute function public.prevent_category_user_change();

insert into public.categories (household_id, user_id, name, type, icon)
select household_id, 'user_b', name, type, icon
from public.categories source
where source.user_id = 'user_a'
  and not exists (
    select 1
    from public.categories target
    where target.household_id = source.household_id
      and target.user_id = 'user_b'
      and target.name = source.name
      and target.type = source.type
  );

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

  if category_household_id <> new.household_id then
    raise exception 'Transaction and category must belong to the same household.';
  end if;

  if category_user_id <> new.user_id then
    raise exception 'Transaction and category must belong to the same household user.';
  end if;

  if category_type <> new.type then
    raise exception 'Transaction type must match category type.';
  end if;

  return new;
end
$$;

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

  if category_household_id <> new.household_id then
    raise exception 'Budget and category must belong to the same household.';
  end if;

  if category_user_id <> new.user_id then
    raise exception 'Budget and category must belong to the same household user.';
  end if;

  return new;
end
$$;

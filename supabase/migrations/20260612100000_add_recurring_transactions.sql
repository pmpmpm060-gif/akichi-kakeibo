-- 固定費・定期収入を管理し、対象月の取引を重複なく生成できるようにする。

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric not null check (amount > 0 and amount = trunc(amount)),
  description text not null default '',
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null check (start_month = date_trunc('month', start_month)::date),
  end_month date check (
    end_month is null
    or (
      end_month = date_trunc('month', end_month)::date
      and end_month >= start_month
    )
  ),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column recurring_transaction_id uuid
    references public.recurring_transactions(id) on delete set null,
  add column recurring_month date;

alter table public.transactions
  add constraint transactions_recurring_month_check
  check (
    (recurring_transaction_id is null and recurring_month is null)
    or (
      recurring_transaction_id is not null
      and recurring_month = date_trunc('month', recurring_month)::date
    )
  );

create unique index transactions_recurring_month_key
  on public.transactions (recurring_transaction_id, recurring_month)
  where recurring_transaction_id is not null;

create or replace function public.validate_recurring_transaction_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.categories category
    where category.id = new.category_id
      and category.household_id = new.household_id
      and category.user_id = new.user_id
  ) then
    raise exception 'Recurring transaction category must belong to the same household user.';
  end if;

  return new;
end
$$;

create trigger validate_recurring_transaction_category_trigger
before insert or update on public.recurring_transactions
for each row execute function public.validate_recurring_transaction_category();

create or replace function public.generate_recurring_transactions(
  target_user_id text,
  target_month date
)
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
  if target_household_id is null then
    raise exception 'Authenticated user does not belong to a household.';
  end if;

  if target_user_id not in ('user_a', 'user_b') then
    raise exception 'Invalid household user.';
  end if;

  insert into public.transactions (
    household_id,
    user_id,
    category_id,
    type,
    amount,
    date,
    description,
    recurring_transaction_id,
    recurring_month
  )
  select
    recurring.household_id,
    recurring.user_id,
    recurring.category_id,
    category.type,
    recurring.amount,
    make_date(
      extract(year from normalized_month)::integer,
      extract(month from normalized_month)::integer,
      least(
        recurring.day_of_month,
        extract(day from (normalized_month + interval '1 month - 1 day'))::integer
      )
    ),
    recurring.description,
    recurring.id,
    normalized_month
  from public.recurring_transactions recurring
  join public.categories category on category.id = recurring.category_id
  where recurring.household_id = target_household_id
    and recurring.user_id = target_user_id
    and recurring.enabled
    and recurring.start_month <= normalized_month
    and (recurring.end_month is null or recurring.end_month >= normalized_month)
  on conflict (recurring_transaction_id, recurring_month)
    where recurring_transaction_id is not null
    do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;

alter table public.recurring_transactions enable row level security;

create policy "Members can manage household recurring transactions"
  on public.recurring_transactions
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

revoke all on function public.generate_recurring_transactions(text, date) from public;
grant execute on function public.generate_recurring_transactions(text, date) to authenticated;

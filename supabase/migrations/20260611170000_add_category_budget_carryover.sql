-- Calculate effective monthly budgets with optional positive or negative carryover.

alter table public.categories
  add column if not exists carryover_enabled boolean not null default false,
  add column if not exists carryover_start_month date;

create or replace function public.set_category_carryover_start_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.carryover_enabled and not old.carryover_enabled then
    new.carryover_start_month = date_trunc('month', current_date)::date;
  elsif not new.carryover_enabled then
    new.carryover_start_month = null;
  end if;

  return new;
end
$$;

revoke all on function public.set_category_carryover_start_month() from public;

drop trigger if exists set_category_carryover_start_month_trigger on public.categories;

create trigger set_category_carryover_start_month_trigger
before update of carryover_enabled
on public.categories
for each row
execute function public.set_category_carryover_start_month();

create or replace function public.get_effective_budgets(
  target_user_id text,
  target_month date
)
returns table (
  category_id uuid,
  category_type text,
  base_amount numeric,
  carryover_amount numeric,
  amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with category_budgets as (
    select
      category.id as category_id,
      category.type as category_type,
      category.carryover_enabled,
      category.carryover_start_month,
      coalesce(budget.amount, 0::numeric) as base_amount,
      date_trunc('month', target_month)::date as target_month_start
    from public.categories category
    left join public.budgets budget
      on budget.category_id = category.id
      and budget.user_id = target_user_id
      and budget.household_id = category.household_id
    where category.household_id = public.current_household_id()
      and category.user_id = target_user_id
      and target_user_id in ('user_a', 'user_b')
  ),
  calculated as (
    select
      category_budget.*,
      case
        when category_budget.carryover_enabled
          and category_budget.carryover_start_month < category_budget.target_month_start
        then (
          category_budget.base_amount * (
            (
              extract(year from category_budget.target_month_start)
              - extract(year from category_budget.carryover_start_month)
            ) * 12
            + extract(month from category_budget.target_month_start)
            - extract(month from category_budget.carryover_start_month)
          )
          - coalesce((
            select sum(transaction.amount)
            from public.transactions transaction
            where transaction.category_id = category_budget.category_id
              and transaction.user_id = target_user_id
              and transaction.date >= category_budget.carryover_start_month
              and transaction.date < category_budget.target_month_start
          ), 0::numeric)
        )
        else 0::numeric
      end as carryover_amount
    from category_budgets category_budget
  )
  select
    calculated.category_id,
    calculated.category_type,
    calculated.base_amount,
    calculated.carryover_amount,
    calculated.base_amount + calculated.carryover_amount as amount
  from calculated
$$;

revoke all on function public.get_effective_budgets(text, date) from public;
grant execute on function public.get_effective_budgets(text, date) to authenticated;

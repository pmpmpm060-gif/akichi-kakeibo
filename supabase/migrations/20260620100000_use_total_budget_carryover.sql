-- 予算繰越をカテゴリ単位から支出TOTAL単位へ変更する。

alter table public.categories disable trigger prevent_unowned_profile_write_trigger;

with enabled_profiles as (
  select
    household_id,
    user_id,
    min(carryover_start_month) as carryover_start_month
  from public.categories
  where type = 'expense'
    and carryover_enabled
  group by household_id, user_id
)
update public.categories category
set
  carryover_enabled = true,
  carryover_start_month = enabled_profiles.carryover_start_month
from enabled_profiles
where category.household_id = enabled_profiles.household_id
  and category.user_id = enabled_profiles.user_id
  and category.type = 'expense';

update public.categories
set
  carryover_enabled = false,
  carryover_start_month = null
where type <> 'expense'
  and carryover_enabled;

alter table public.categories enable trigger prevent_unowned_profile_write_trigger;

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

revoke all on function public.get_effective_budgets(text, date) from public, anon;
grant execute on function public.get_effective_budgets(text, date) to authenticated;

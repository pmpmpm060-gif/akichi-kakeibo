-- 積立開始前の特別支出予定を月次積立目安へ含めない。

create or replace function public.get_special_expense_summary(target_user_id text, target_month date)
returns table (monthly_reserve numeric, scheduled_payment numeric, reserve_balance numeric)
language sql stable security definer set search_path = ''
as $$
  with plans as (
    select plan.*,
      greatest(0, (
        (extract(year from age(date_trunc('month', target_month), plan.reserve_start_month)) * 12)
        + extract(month from age(date_trunc('month', target_month), plan.reserve_start_month))
        + 1
      )::integer) as reserved_months
    from public.special_expense_plans plan
    where plan.household_id = public.current_household_id() and plan.user_id = target_user_id and plan.enabled
      and plan.reserve_start_month <= date_trunc('month', target_month)::date
  )
  select coalesce(sum(plan.monthly_reserve), 0),
    coalesce((select sum(payment.amount) from public.special_expense_payments payment where payment.plan_id in (select id from plans) and payment.payment_date >= date_trunc('month', target_month) and payment.payment_date < date_trunc('month', target_month) + interval '1 month'), 0),
    coalesce(sum(plan.monthly_reserve * plan.reserved_months), 0)
      - coalesce((select sum(payment.amount) from public.special_expense_payments payment where payment.plan_id in (select id from plans) and payment.payment_date < date_trunc('month', target_month) + interval '1 month'), 0)
  from plans plan
$$;

revoke all on function public.get_special_expense_summary(text, date) from public, anon;
grant execute on function public.get_special_expense_summary(text, date) to authenticated;

-- 不定期な税金・保険料などを個別日程で管理し、毎月の積立目安と実支払を分離する。

create table public.special_expense_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 100),
  monthly_reserve integer not null check (monthly_reserve >= 0 and monthly_reserve <= 1000000000),
  reserve_start_month date not null check (reserve_start_month = date_trunc('month', reserve_start_month)::date),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.special_expense_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id text not null,
  plan_id uuid not null references public.special_expense_plans(id) on delete cascade,
  payment_date date not null,
  amount integer not null check (amount > 0 and amount <= 1000000000),
  transaction_id uuid unique references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, payment_date)
);

create index special_expense_payments_due_idx
  on public.special_expense_payments (household_id, user_id, payment_date);

alter table public.special_expense_plans enable row level security;
alter table public.special_expense_payments enable row level security;

create policy "Members can view special expense plans" on public.special_expense_plans for select to authenticated
  using (public.is_household_member(household_id));
create policy "Owners can manage special expense plans" on public.special_expense_plans for all to authenticated
  using (public.can_edit_profile(household_id, user_id))
  with check (public.can_edit_profile(household_id, user_id));
create policy "Members can view special expense payments" on public.special_expense_payments for select to authenticated
  using (public.is_household_member(household_id));
create policy "Owners can manage special expense payments" on public.special_expense_payments for all to authenticated
  using (public.can_edit_profile(household_id, user_id))
  with check (public.can_edit_profile(household_id, user_id));

grant select, insert, update, delete on public.special_expense_plans, public.special_expense_payments to authenticated;

create or replace function public.validate_special_expense_links()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'special_expense_plans' then
    if not exists (select 1 from public.categories category where category.id = new.category_id and category.household_id = new.household_id and category.user_id = new.user_id and category.type = 'expense')
    then raise exception 'Special expense category is invalid.'; end if;
  else
    if not exists (select 1 from public.special_expense_plans plan where plan.id = new.plan_id and plan.household_id = new.household_id and plan.user_id = new.user_id)
    then raise exception 'Special expense plan is invalid.'; end if;
    if new.payment_date < date '2000-01-01' or new.payment_date > current_date + interval '5 years'
    then raise exception 'Special expense payment date is outside the supported range.'; end if;
  end if;
  return new;
end
$$;

create trigger validate_special_expense_plan_links before insert or update on public.special_expense_plans
for each row execute function public.validate_special_expense_links();
create trigger validate_special_expense_payment_links before insert or update on public.special_expense_payments
for each row execute function public.validate_special_expense_links();

create trigger limit_special_expense_plans before insert on public.special_expense_plans
for each row execute function public.enforce_profile_row_limit('100', '');
create trigger limit_special_expense_payments before insert on public.special_expense_payments
for each row execute function public.enforce_profile_row_limit('500', '');

create trigger prevent_unowned_special_expense_plan_write before insert or update or delete on public.special_expense_plans
for each row execute function public.prevent_unowned_profile_write();
create trigger prevent_unowned_special_expense_payment_write before insert or update or delete on public.special_expense_payments
for each row execute function public.prevent_unowned_profile_write();

create or replace function public.create_special_expense_plan(
  target_user_id text,
  target_category_id uuid,
  target_name text,
  target_monthly_reserve integer,
  target_reserve_start_month date,
  target_payments jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  new_plan_id uuid;
  payment_count integer;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then raise exception 'Profile is read only.'; end if;
  if length(trim(target_name)) not between 1 and 100 or target_monthly_reserve < 0 or target_monthly_reserve > 1000000000 then raise exception 'Special expense plan is invalid.'; end if;
  if jsonb_typeof(target_payments) <> 'array' or octet_length(target_payments::text) > 30000 or jsonb_array_length(target_payments) not between 1 and 100 then raise exception 'Special expense payments are invalid.'; end if;
  if exists (
    select 1 from jsonb_array_elements(target_payments) payment
    where jsonb_typeof(payment -> 'date') is distinct from 'string'
      or jsonb_typeof(payment -> 'amount') is distinct from 'number'
      or (payment ->> 'date')::date < date '2000-01-01'
      or (payment ->> 'date')::date > current_date + interval '5 years'
      or (payment ->> 'amount')::numeric <= 0
      or (payment ->> 'amount')::numeric > 1000000000
      or (payment ->> 'amount')::numeric <> trunc((payment ->> 'amount')::numeric)
  ) then raise exception 'Special expense payments contain invalid values.'; end if;
  select count(*) into payment_count from jsonb_array_elements(target_payments) payment;
  if payment_count <> (select count(distinct payment ->> 'date') from jsonb_array_elements(target_payments) payment) then raise exception 'Special expense payment dates are duplicated.'; end if;

  insert into public.special_expense_plans (household_id, user_id, category_id, name, monthly_reserve, reserve_start_month)
  values (target_household_id, target_user_id, target_category_id, trim(target_name), target_monthly_reserve, date_trunc('month', target_reserve_start_month)::date)
  returning id into new_plan_id;
  insert into public.special_expense_payments (household_id, user_id, plan_id, payment_date, amount)
  select target_household_id, target_user_id, new_plan_id, (payment ->> 'date')::date, (payment ->> 'amount')::integer
  from jsonb_array_elements(target_payments) payment;
  return new_plan_id;
end
$$;

create or replace function public.generate_special_expense_payments(target_user_id text, target_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  month_start date := date_trunc('month', target_month)::date;
  payment record;
  new_transaction_id uuid;
  inserted_count integer := 0;
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then raise exception 'Profile is read only.'; end if;
  for payment in
    select due.id, due.payment_date, due.amount, plan.category_id, plan.name
    from public.special_expense_payments due join public.special_expense_plans plan on plan.id = due.plan_id
    where due.household_id = target_household_id and due.user_id = target_user_id and due.transaction_id is null
      and plan.enabled and due.payment_date >= month_start and due.payment_date < month_start + interval '1 month'
    for update of due
  loop
    insert into public.transactions (household_id, user_id, category_id, type, amount, date, description)
    values (target_household_id, target_user_id, payment.category_id, 'expense', payment.amount, payment.payment_date, payment.name)
    returning id into new_transaction_id;
    update public.special_expense_payments set transaction_id = new_transaction_id where id = payment.id;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end
$$;

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

revoke execute on function public.validate_special_expense_links() from public, anon, authenticated;
revoke all on function public.create_special_expense_plan(text, uuid, text, integer, date, jsonb) from public, anon;
grant execute on function public.create_special_expense_plan(text, uuid, text, integer, date, jsonb) to authenticated;
revoke all on function public.generate_special_expense_payments(text, date) from public, anon;
grant execute on function public.generate_special_expense_payments(text, date) to authenticated;
revoke all on function public.get_special_expense_summary(text, date) from public, anon;
grant execute on function public.get_special_expense_summary(text, date) to authenticated;

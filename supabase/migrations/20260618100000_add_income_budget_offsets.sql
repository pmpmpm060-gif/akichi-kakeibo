-- 臨時収入を、給与収入とは別に当月予算へ充当できるようにする。

alter table public.transactions
  add column if not exists budget_offset_type text not null default 'none',
  add column if not exists budget_offset_category_id uuid references public.categories(id) on delete restrict;

alter table public.transactions
  drop constraint if exists transactions_budget_offset_type_check,
  add constraint transactions_budget_offset_type_check
    check (budget_offset_type in ('none', 'overall', 'category', 'special_reserve'));

alter table public.transactions
  drop constraint if exists transactions_budget_offset_shape_check,
  add constraint transactions_budget_offset_shape_check
    check (
      (budget_offset_type = 'none' and budget_offset_category_id is null)
      or (budget_offset_type = 'category' and budget_offset_category_id is not null)
      or (budget_offset_type in ('overall', 'special_reserve') and budget_offset_category_id is null)
    );

alter table public.transactions
  drop constraint if exists transactions_budget_offset_income_check,
  add constraint transactions_budget_offset_income_check
    check (type = 'income' or budget_offset_type = 'none');

create or replace function public.validate_transaction_budget_offset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offset_category record;
begin
  if new.budget_offset_type = 'category' then
    select category.household_id, category.user_id, category.type
      into offset_category
    from public.categories category
    where category.id = new.budget_offset_category_id;

    if offset_category.household_id is null then
      raise exception 'Invalid budget offset category.';
    end if;

    if offset_category.household_id <> new.household_id
      or offset_category.user_id <> new.user_id
      or offset_category.type <> 'expense'
    then
      raise exception 'Budget offset category must be an expense category for the same profile.';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists validate_transaction_budget_offset_trigger on public.transactions;
create trigger validate_transaction_budget_offset_trigger
before insert or update of household_id, user_id, type, budget_offset_type, budget_offset_category_id
on public.transactions
for each row execute function public.validate_transaction_budget_offset();

drop function if exists public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]);

create or replace function public.create_transaction_with_tags(
  target_user_id text,
  target_category_id uuid,
  target_amount integer,
  target_date date,
  target_description text,
  target_tag_ids uuid[],
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
  tag_count integer := coalesce(array_length(target_tag_ids, 1), 0);
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  if target_amount <= 0 or target_amount > 1000000000 then raise exception 'Transaction amount is invalid.'; end if;
  if target_date < date '2000-01-01' or target_date > (current_date + interval '5 years')::date then raise exception 'Transaction date is outside the supported range.'; end if;
  if length(coalesce(target_description, '')) > 500 then raise exception 'Transaction description is too long.'; end if;
  if tag_count > 20 then raise exception 'A transaction can have at most 20 tags.'; end if;
  if normalized_offset_type not in ('none', 'overall', 'category', 'special_reserve') then raise exception 'Invalid budget offset type.'; end if;

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

  if exists (
    select 1 from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
    left join public.tags tag on tag.id = tag_id and tag.household_id = target_household_id and tag.user_id = target_user_id
    where tag.id is null
  ) or tag_count <> (
    select count(distinct tag_id) from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
  ) then
    raise exception 'Invalid or duplicate transaction tags.';
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

  insert into public.transaction_tags (household_id, transaction_id, tag_id)
  select target_household_id, new_transaction_id, tag_id
  from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id;
  return new_transaction_id;
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
  ),
  special_reserve_offsets as (
    select coalesce(sum(transaction.amount), 0::numeric) amount
    from public.transactions transaction
    where transaction.household_id = public.current_household_id()
      and transaction.user_id = target_user_id
      and transaction.type = 'income'
      and transaction.budget_offset_type = 'special_reserve'
      and transaction.date < date_trunc('month', target_month) + interval '1 month'
  )
  select coalesce(sum(plan.monthly_reserve), 0),
    coalesce((select sum(payment.amount) from public.special_expense_payments payment where payment.plan_id in (select id from plans) and payment.payment_date >= date_trunc('month', target_month) and payment.payment_date < date_trunc('month', target_month) + interval '1 month'), 0),
    coalesce(sum(plan.monthly_reserve * plan.reserved_months), 0)
      + (select amount from special_reserve_offsets)
      - coalesce((select sum(payment.amount) from public.special_expense_payments payment where payment.plan_id in (select id from plans) and payment.payment_date < date_trunc('month', target_month) + interval '1 month'), 0)
  from plans plan
$$;

revoke all on function public.validate_transaction_budget_offset() from public, anon, authenticated;
revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[], text, uuid) from public, anon;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[], text, uuid) to authenticated;
revoke all on function public.get_special_expense_summary(text, date) from public, anon;
grant execute on function public.get_special_expense_summary(text, date) to authenticated;

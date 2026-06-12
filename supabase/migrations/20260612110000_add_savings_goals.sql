-- 貯金目標と積立履歴を管理する。

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  name text not null check (length(trim(name)) > 0),
  target_amount numeric not null check (target_amount > 0 and target_amount = trunc(target_amount)),
  target_date date,
  created_at timestamptz not null default now()
);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric not null check (amount <> 0 and amount = trunc(amount)),
  contribution_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.validate_savings_contribution_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.savings_goals goal
    where goal.id = new.goal_id
      and goal.household_id = new.household_id
      and goal.user_id = new.user_id
  ) then
    raise exception 'Savings contribution goal must belong to the same household user.';
  end if;
  return new;
end
$$;

create trigger validate_savings_contribution_goal_trigger
before insert or update on public.savings_contributions
for each row execute function public.validate_savings_contribution_goal();

create or replace function public.prevent_negative_savings_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_total numeric;
begin
  if tg_op = 'INSERT' then
    select coalesce(sum(amount), 0)
      into current_total
      from public.savings_contributions
      where goal_id = new.goal_id;
  else
    select coalesce(sum(amount), 0)
      into current_total
      from public.savings_contributions
      where goal_id = new.goal_id
        and id <> old.id;
  end if;

  if current_total + new.amount < 0 then
    raise exception 'Savings balance cannot be negative.';
  end if;

  return new;
end
$$;

create trigger prevent_negative_savings_balance_trigger
before insert or update on public.savings_contributions
for each row execute function public.prevent_negative_savings_balance();

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

create policy "Members can manage household savings goals"
  on public.savings_goals for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can manage household savings contributions"
  on public.savings_contributions for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

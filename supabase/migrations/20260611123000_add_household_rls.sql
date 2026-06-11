-- 複数のSupabase Authアカウントが、同じ世帯データを共有できるようにする。
-- 既存のAuthユーザーとアプリデータは、初期世帯へまとめて移行する。

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'わが家',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.categories
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.transactions
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.budgets
  add column if not exists household_id uuid references public.households(id) on delete cascade;

do $$
declare
  initial_household_id uuid;
begin
  -- 世帯機能追加前の共有状態を維持するため、既存ユーザーとデータを
  -- このマイグレーションで1つの初期世帯へ所属させる。
  select id
    into initial_household_id
    from public.households
    order by created_at
    limit 1;

  if initial_household_id is null then
    insert into public.households default values
      returning id into initial_household_id;
  end if;

  insert into public.household_members (user_id, household_id)
    select id, initial_household_id
    from auth.users
    on conflict (user_id) do nothing;

  update public.categories
    set household_id = initial_household_id
    where household_id is null;

  update public.transactions
    set household_id = initial_household_id
    where household_id is null;

  update public.budgets
    set household_id = initial_household_id
    where household_id is null;
end
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Authユーザーはセッションを所有し、household_membersが
  -- そのセッションから参照可能な共有データを決定する。
  select household_id
  from public.household_members
  where user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where user_id = (select auth.uid())
      and household_id = target_household_id
  )
$$;

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.categories
  alter column household_id set default public.current_household_id(),
  alter column household_id set not null;

alter table public.transactions
  alter column household_id set default public.current_household_id(),
  alter column household_id set not null;

alter table public.budgets
  alter column household_id set default public.current_household_id(),
  alter column household_id set not null;

alter table public.transactions
  drop constraint if exists transactions_household_user_check;

alter table public.transactions
  add constraint transactions_household_user_check
  check (user_id in ('user_a', 'user_b'));

alter table public.budgets
  drop constraint if exists budgets_household_user_check;

alter table public.budgets
  add constraint budgets_household_user_check
  check (user_id in ('user_a', 'user_b'));

alter table public.budgets
  drop constraint if exists budgets_user_id_category_id_key;

drop index if exists public.budgets_user_id_category_id_key;

create unique index if not exists budgets_household_user_category_key
  on public.budgets (household_id, user_id, category_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

do $$
declare
  policy_record record;
begin
  -- 古い許可ポリシーが残らないよう、対象テーブルのポリシーを一式置き換える。
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'households',
        'household_members',
        'categories',
        'transactions',
        'budgets'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "Members can view their household"
  on public.households
  for select
  to authenticated
  using (public.is_household_member(id));

create policy "Members can view their membership"
  on public.household_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Members can manage household categories"
  on public.categories
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can manage household transactions"
  on public.transactions
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can manage household budgets"
  on public.budgets
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

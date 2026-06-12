-- 計算済みアラートの既読状態と、表示ユーザー単位のカテゴリ並び順を管理する。

alter table public.categories
  add column if not exists sort_order integer not null default 0;

with ordered as (
  select
    id,
    row_number() over (
      partition by household_id, user_id
      order by created_at, id
    ) - 1 as sort_order
  from public.categories
)
update public.categories category
set sort_order = ordered.sort_order
from ordered
where category.id = ordered.id;

alter table public.categories
  drop constraint if exists categories_sort_order_check;

alter table public.categories
  add constraint categories_sort_order_check check (sort_order >= 0);

create index if not exists categories_household_user_sort_order_idx
  on public.categories (household_id, user_id, sort_order, created_at);

create table if not exists public.dismissed_alerts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  alert_key text not null,
  dismissed_at timestamptz not null default now(),
  unique (household_id, user_id, alert_key)
);

alter table public.dismissed_alerts enable row level security;

create policy "Members can manage household dismissed alerts"
  on public.dismissed_alerts
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on table public.dismissed_alerts to authenticated;

create or replace function public.save_category_order(
  target_user_id text,
  category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  expected_count integer;
begin
  if target_household_id is null then
    raise exception 'Authenticated user does not belong to a household.';
  end if;

  if target_user_id not in ('user_a', 'user_b') then
    raise exception 'Invalid household user.';
  end if;

  select count(*)
    into expected_count
    from public.categories
    where household_id = target_household_id
      and user_id = target_user_id;

  if expected_count <> coalesce(array_length(category_ids, 1), 0)
    or expected_count <> (
      select count(distinct entry.category_id)
      from unnest(category_ids) as entry(category_id)
    )
    or exists (
      select 1
      from unnest(category_ids) as category_id
      left join public.categories category
        on category.id = category_id
        and category.household_id = target_household_id
        and category.user_id = target_user_id
      where category.id is null
    )
  then
    raise exception 'Category order must contain all categories exactly once.';
  end if;

  update public.categories category
  set sort_order = (ordered.ordinality - 1)::integer
  from unnest(category_ids) with ordinality as ordered(category_id, ordinality)
  where category.id = ordered.category_id
    and category.household_id = target_household_id
    and category.user_id = target_user_id;
end
$$;

revoke all on function public.save_category_order(text, uuid[]) from public;
grant execute on function public.save_category_order(text, uuid[]) to authenticated;

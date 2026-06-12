-- 同じ貯金目標への同時積立を直列化し、残高が0円未満になる競合を防ぐ。

create or replace function public.prevent_negative_savings_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_total numeric;
begin
  perform 1
  from public.savings_goals
  where id = new.goal_id
  for update;

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

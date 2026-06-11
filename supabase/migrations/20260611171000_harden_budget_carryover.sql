create or replace function public.set_category_carryover_start_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.carryover_enabled
    and (tg_op = 'INSERT' or not old.carryover_enabled)
  then
    new.carryover_start_month =
      date_trunc('month', current_timestamp at time zone 'Asia/Tokyo')::date;
  elsif not new.carryover_enabled then
    new.carryover_start_month = null;
  end if;

  return new;
end
$$;

drop trigger if exists set_category_carryover_start_month_trigger on public.categories;

create trigger set_category_carryover_start_month_trigger
before insert or update of carryover_enabled
on public.categories
for each row
execute function public.set_category_carryover_start_month();

alter table public.categories
  drop constraint if exists categories_carryover_start_check;

alter table public.categories
  add constraint categories_carryover_start_check
  check (
    (carryover_enabled and carryover_start_month is not null)
    or (not carryover_enabled and carryover_start_month is null)
  );

revoke execute on function public.get_effective_budgets(text, date) from anon;

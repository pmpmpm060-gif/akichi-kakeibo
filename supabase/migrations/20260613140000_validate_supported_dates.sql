-- 取引以外の業務日付も対応範囲へ制限し、直接API入力による集計崩れを防ぐ。

create or replace function public.validate_supported_business_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'recurring_transactions' then
    if new.start_month < date '2000-01-01'
      or new.start_month > date_trunc('month', current_date + interval '5 years')::date
      or (new.end_month is not null and (
        new.end_month < new.start_month
        or new.end_month > date_trunc('month', current_date + interval '5 years')::date
      ))
    then raise exception 'Recurring transaction month is outside the supported range.'; end if;
  elsif tg_table_name = 'savings_goals' then
    if new.target_date is not null and (
      new.target_date < date '2000-01-01'
      or new.target_date > (current_date + interval '100 years')::date
    ) then raise exception 'Savings target date is outside the supported range.'; end if;
  elsif tg_table_name = 'savings_contributions' then
    if new.contribution_date < date '2000-01-01'
      or new.contribution_date > (current_date + interval '5 years')::date
    then raise exception 'Savings contribution date is outside the supported range.'; end if;
  elsif tg_table_name = 'monthly_reviews' then
    if new.month < date '2000-01-01'
      or new.month > date_trunc('month', current_date + interval '5 years')::date
    then raise exception 'Monthly review date is outside the supported range.'; end if;
  elsif tg_table_name = 'ai_household_diagnoses' then
    if new.target_month < date_trunc('month', current_date - interval '5 years')::date
      or new.target_month > date_trunc('month', current_date)::date
    then raise exception 'AI diagnosis month is outside the supported range.'; end if;
  end if;
  return new;
end
$$;

create trigger validate_supported_business_dates_trigger
before insert or update on public.recurring_transactions
for each row execute function public.validate_supported_business_dates();
create trigger validate_supported_business_dates_trigger
before insert or update on public.savings_goals
for each row execute function public.validate_supported_business_dates();
create trigger validate_supported_business_dates_trigger
before insert or update on public.savings_contributions
for each row execute function public.validate_supported_business_dates();
create trigger validate_supported_business_dates_trigger
before insert or update on public.monthly_reviews
for each row execute function public.validate_supported_business_dates();
create trigger validate_supported_business_dates_trigger
before insert or update on public.ai_household_diagnoses
for each row execute function public.validate_supported_business_dates();

revoke execute on function public.validate_supported_business_dates() from public, anon, authenticated;

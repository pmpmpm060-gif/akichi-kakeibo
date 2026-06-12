-- 1か月の取引件数をAPIの1ページ上限に合わせ、家計簿画面の集計欠落を防ぐ。

create or replace function public.enforce_monthly_transaction_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', new.date)::date;
  current_count bigint;
begin
  if new.date < date '2000-01-01' or new.date > (current_date + interval '5 years')::date then
    raise exception 'Transaction date is outside the supported range.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'transactions:' || new.household_id::text || ':' || new.user_id || ':' || month_start::text,
      0
    )
  );

  select count(*) into current_count
  from public.transactions transaction
  where transaction.household_id = new.household_id
    and transaction.user_id = new.user_id
    and transaction.date >= month_start
    and transaction.date < month_start + interval '1 month';

  if current_count >= 1000 then raise exception 'Monthly transaction limit reached.'; end if;
  return new;
end
$$;

revoke execute on function public.enforce_monthly_transaction_limit() from public, anon, authenticated;

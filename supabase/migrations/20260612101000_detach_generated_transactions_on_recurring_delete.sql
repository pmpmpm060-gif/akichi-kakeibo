-- 定期取引を削除しても、生成済みの家計簿記録は通常取引として保持する。

create or replace function public.detach_generated_transactions_before_recurring_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.transactions
  set
    recurring_transaction_id = null,
    recurring_month = null
  where recurring_transaction_id = old.id;

  return old;
end
$$;

create trigger detach_generated_transactions_before_recurring_delete_trigger
before delete on public.recurring_transactions
for each row execute function public.detach_generated_transactions_before_recurring_delete();

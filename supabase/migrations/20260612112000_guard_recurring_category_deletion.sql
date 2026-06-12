-- 定期取引で使用中のカテゴリを、分かりやすいエラーで削除拒否する。

create or replace function public.delete_unused_category(target_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid;
  transaction_count integer;
  recurring_transaction_count integer;
  deleted_budget_count integer;
begin
  select household_id
    into target_household_id
    from public.categories
    where id = target_category_id
    for update;

  if target_household_id is null
    or not public.is_household_member(target_household_id)
  then
    raise exception 'Category not found.';
  end if;

  select count(*)
    into transaction_count
    from public.transactions
    where category_id = target_category_id;

  if transaction_count > 0 then
    raise exception 'Category has % transaction records and cannot be deleted.', transaction_count;
  end if;

  select count(*)
    into recurring_transaction_count
    from public.recurring_transactions
    where category_id = target_category_id;

  if recurring_transaction_count > 0 then
    raise exception 'Category has % recurring transactions and cannot be deleted.', recurring_transaction_count;
  end if;

  delete from public.budgets
    where category_id = target_category_id;

  get diagnostics deleted_budget_count = row_count;

  delete from public.categories
    where id = target_category_id;

  return deleted_budget_count;
end
$$;

revoke all on function public.delete_unused_category(uuid) from public;
grant execute on function public.delete_unused_category(uuid) to authenticated;
revoke execute on function public.delete_unused_category(uuid) from anon;

-- カテゴリ削除時に、取引履歴や予算が意図せず失われることを防ぐ。

alter table public.budgets
  drop constraint if exists budgets_category_id_fkey;

alter table public.budgets
  add constraint budgets_category_id_fkey
  foreign key (category_id)
  references public.categories(id)
  on delete restrict;

create or replace function public.delete_unused_category(target_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid;
  transaction_count integer;
  deleted_budget_count integer;
begin
  -- 履歴確認からカテゴリ削除までの間に取引が追加されないよう、
  -- 最初に対象カテゴリをロックする。
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

  delete from public.budgets
    where category_id = target_category_id;

  -- 関連予算を削除したか画面で説明できるよう、削除件数を返す。
  get diagnostics deleted_budget_count = row_count;

  delete from public.categories
    where id = target_category_id;

  return deleted_budget_count;
end
$$;

revoke all on function public.delete_unused_category(uuid) from public;
grant execute on function public.delete_unused_category(uuid) to authenticated;

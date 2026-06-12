-- 取引とタグを原子的に登録し、内部トリガー関数の直接実行を禁止する。

create or replace function public.create_transaction_with_tags(
  target_user_id text,
  target_category_id uuid,
  target_amount integer,
  target_date date,
  target_description text,
  target_tag_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
  target_category_type text;
  new_transaction_id uuid;
begin
  if target_household_id is null or not public.is_household_profile(target_household_id, target_user_id) then
    raise exception 'Invalid household user.';
  end if;
  if target_amount <= 0 then raise exception 'Transaction amount must be positive.'; end if;

  select type into target_category_type
  from public.categories
  where id = target_category_id and household_id = target_household_id and user_id = target_user_id;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if exists (
    select 1 from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
    left join public.tags tag on tag.id = tag_id and tag.household_id = target_household_id and tag.user_id = target_user_id
    where tag.id is null
  ) or (
    select count(*) from unnest(coalesce(target_tag_ids, array[]::uuid[]))
  ) <> (
    select count(distinct tag_id) from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
  ) then
    raise exception 'Invalid or duplicate transaction tags.';
  end if;

  insert into public.transactions (household_id, user_id, category_id, type, amount, date, description)
  values (target_household_id, target_user_id, target_category_id, target_category_type, target_amount, target_date, coalesce(target_description, ''))
  returning id into new_transaction_id;

  insert into public.transaction_tags (household_id, transaction_id, tag_id)
  select target_household_id, new_transaction_id, tag_id
  from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id;

  return new_transaction_id;
end
$$;

revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) from public;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) to authenticated;

-- SECURITY DEFINERの内部検証・トリガー関数はテーブル処理からだけ呼び出す。
revoke execute on function public.validate_transaction_category() from public, anon, authenticated;
revoke execute on function public.sync_transaction_category_type() from public, anon, authenticated;
revoke execute on function public.validate_budget_category() from public, anon, authenticated;
revoke execute on function public.prevent_category_user_change() from public, anon, authenticated;
revoke execute on function public.validate_recurring_transaction_category() from public, anon, authenticated;
revoke execute on function public.validate_savings_contribution_goal() from public, anon, authenticated;
revoke execute on function public.prevent_negative_savings_balance() from public, anon, authenticated;
revoke execute on function public.validate_transaction_tag_link() from public, anon, authenticated;
revoke execute on function public.validate_transaction_template_category() from public, anon, authenticated;
revoke execute on function public.validate_household_profile_reference() from public, anon, authenticated;

revoke execute on function public.save_user_budgets(text, jsonb) from anon;
revoke execute on function public.save_category_order(text, uuid[]) from anon;
revoke execute on function public.generate_recurring_transactions(text, date) from anon;
revoke execute on function public.get_effective_budgets(text, date) from anon;
revoke execute on function public.delete_unused_category(uuid) from anon;
revoke execute on function public.setup_personal_household(text, text) from anon;

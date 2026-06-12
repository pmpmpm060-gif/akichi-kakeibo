-- タグ・テンプレートが同じ世帯表示ユーザーのデータだけを参照することを保証する。

create or replace function public.validate_transaction_tag_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_household_id uuid;
  transaction_user_id text;
  tag_household_id uuid;
  tag_user_id text;
begin
  select household_id, user_id into transaction_household_id, transaction_user_id
  from public.transactions where id = new.transaction_id;
  select household_id, user_id into tag_household_id, tag_user_id
  from public.tags where id = new.tag_id;

  if transaction_household_id is null or tag_household_id is null
    or transaction_household_id <> new.household_id
    or tag_household_id <> new.household_id
    or transaction_user_id <> tag_user_id then
    raise exception 'Transaction and tag must belong to the same household user.';
  end if;
  return new;
end
$$;

drop trigger if exists validate_transaction_tag_link_trigger on public.transaction_tags;
create trigger validate_transaction_tag_link_trigger
before insert or update on public.transaction_tags
for each row execute function public.validate_transaction_tag_link();

create or replace function public.validate_transaction_template_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categories category
    where category.id = new.category_id
      and category.household_id = new.household_id
      and category.user_id = new.user_id
  ) then
    raise exception 'Template category must belong to the same household user.';
  end if;
  return new;
end
$$;

drop trigger if exists validate_transaction_template_category_trigger on public.transaction_templates;
create trigger validate_transaction_template_category_trigger
before insert or update of household_id, user_id, category_id on public.transaction_templates
for each row execute function public.validate_transaction_template_category();

revoke all on function public.validate_transaction_tag_link() from public;
revoke all on function public.validate_transaction_template_category() from public;

-- 承認済み利用者による大量書き込みと、取引タグの過剰紐付けをDB側で抑止する。

create index if not exists transactions_household_user_date_idx
  on public.transactions (household_id, user_id, date);

create index if not exists savings_contributions_household_user_idx
  on public.savings_contributions (household_id, user_id);

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

  if current_count >= 5000 then raise exception 'Monthly transaction limit reached.'; end if;
  return new;
end
$$;

create trigger limit_monthly_transactions_per_profile
before insert on public.transactions
for each row execute function public.enforce_monthly_transaction_limit();

create or replace function public.enforce_transaction_tag_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('transaction-tags:' || new.transaction_id::text, 0)
  );
  select count(*) into current_count
  from public.transaction_tags link
  where link.transaction_id = new.transaction_id;
  if current_count >= 20 then raise exception 'Transaction tag limit reached.'; end if;
  return new;
end
$$;

create trigger limit_tags_per_transaction
before insert on public.transaction_tags
for each row execute function public.enforce_transaction_tag_limit();

create trigger limit_categories_per_profile before insert on public.categories
for each row execute function public.enforce_profile_row_limit('100', '');

create trigger limit_dismissed_alerts_per_profile before insert on public.dismissed_alerts
for each row execute function public.enforce_profile_row_limit('500', '');

create trigger limit_savings_contributions_per_profile before insert on public.savings_contributions
for each row execute function public.enforce_profile_row_limit('10000', '');

alter table public.dismissed_alerts
  add constraint dismissed_alerts_key_length_check check (length(alert_key) between 1 and 200);

alter table public.tags
  add constraint tags_color_format_check check (color ~ '^#[0-9A-Fa-f]{6}$');

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
  tag_count integer := coalesce(array_length(target_tag_ids, 1), 0);
begin
  if target_household_id is null or not public.is_household_profile(target_household_id, target_user_id) then
    raise exception 'Invalid household user.';
  end if;
  if target_amount <= 0 then raise exception 'Transaction amount must be positive.'; end if;
  if tag_count > 20 then raise exception 'A transaction can have at most 20 tags.'; end if;

  select type into target_category_type
  from public.categories
  where id = target_category_id and household_id = target_household_id and user_id = target_user_id;
  if target_category_type is null then raise exception 'Invalid transaction category.'; end if;

  if exists (
    select 1 from unnest(coalesce(target_tag_ids, array[]::uuid[])) tag_id
    left join public.tags tag on tag.id = tag_id and tag.household_id = target_household_id and tag.user_id = target_user_id
    where tag.id is null
  ) or tag_count <> (
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

revoke execute on function public.enforce_monthly_transaction_limit() from public, anon, authenticated;
revoke execute on function public.enforce_transaction_tag_limit() from public, anon, authenticated;
revoke all on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) from public, anon;
grant execute on function public.create_transaction_with_tags(text, uuid, integer, date, text, uuid[]) to authenticated;

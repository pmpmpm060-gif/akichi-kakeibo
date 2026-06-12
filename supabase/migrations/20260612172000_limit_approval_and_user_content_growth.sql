-- 承認フローの自己変更を防ぎ、補助データの無制限増加をDB側で抑止する。

create or replace function public.get_my_approval_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select approval.status from public.user_approvals approval where approval.user_id = (select auth.uid())),
    'unrequested'
  )
$$;

create or replace function public.request_app_approval()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_email text;
  current_status text;
  pending_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select status into current_status
  from public.user_approvals
  where user_id = auth.uid();

  -- 却下済み・承認済み状態は本人操作で変更させない。
  if current_status is not null then return current_status; end if;

  select email into requester_email from auth.users where id = auth.uid();
  if requester_email is null then raise exception 'Email address is unavailable.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(81220260612);
  select count(*) into pending_count from public.user_approvals where status = 'pending';
  if pending_count >= 100 then raise exception 'Approval request capacity reached.'; end if;

  insert into public.user_approvals (user_id, email, status)
  values (auth.uid(), requester_email, 'pending')
  returning status into current_status;
  return current_status;
end
$$;

create or replace function public.enforce_profile_row_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  maximum_rows integer := tg_argv[0]::integer;
  filter_column text := nullif(tg_argv[1], '');
  filter_value text;
  current_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(tg_table_name || ':' || new.household_id::text || ':' || new.user_id, 0)
  );

  if filter_column is null then
    execute format('select count(*) from public.%I where household_id = $1 and user_id = $2', tg_table_name)
      into current_count using new.household_id, new.user_id;
  else
    filter_value := to_jsonb(new) ->> filter_column;
    execute format(
      'select count(*) from public.%I where household_id = $1 and user_id = $2 and %I::text = $3',
      tg_table_name,
      filter_column
    ) into current_count using new.household_id, new.user_id, filter_value;
  end if;

  if current_count >= maximum_rows then
    raise exception 'Stored item limit reached.';
  end if;
  return new;
end
$$;

create trigger limit_tags_per_profile before insert on public.tags
for each row execute function public.enforce_profile_row_limit('100', '');

create trigger limit_templates_per_profile before insert on public.transaction_templates
for each row execute function public.enforce_profile_row_limit('100', '');

create trigger limit_saved_filters_per_profile before insert on public.saved_filters
for each row execute function public.enforce_profile_row_limit('50', 'filter_type');

create trigger limit_savings_goals_per_profile before insert on public.savings_goals
for each row execute function public.enforce_profile_row_limit('100', '');

create trigger limit_recurring_transactions_per_profile before insert on public.recurring_transactions
for each row execute function public.enforce_profile_row_limit('200', '');

revoke execute on function public.enforce_profile_row_limit() from public, anon, authenticated;
revoke all on function public.get_my_approval_status() from public, anon;
grant execute on function public.get_my_approval_status() to authenticated;
revoke all on function public.request_app_approval() from public, anon;
grant execute on function public.request_app_approval() to authenticated;

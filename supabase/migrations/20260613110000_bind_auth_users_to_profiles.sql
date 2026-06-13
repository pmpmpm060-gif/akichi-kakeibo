-- Authユーザーと表示プロフィールを一対一で紐付け、本人以外のプロフィールは参照専用にする。

alter table public.household_profiles
  add column auth_user_id uuid references auth.users(id) on delete set null;

create unique index household_profiles_auth_user_id_key
  on public.household_profiles (auth_user_id)
  where auth_user_id is not null;

-- パパ管理者はパパへ、それ以外の既存世帯メンバーは本人またはママへ引き継ぐ。
update public.household_profiles profile
set auth_user_id = member.user_id
from public.household_members member
join public.user_approvals approval on approval.user_id = member.user_id
where profile.household_id = member.household_id
  and profile.profile_id = case when approval.is_admin then 'user_b' else 'user_a' end
  and profile.auth_user_id is null;

create or replace function public.current_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.profile_id
  from public.household_profiles profile
  where profile.household_id = public.current_household_id()
    and profile.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.can_edit_profile(target_household_id uuid, target_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_profiles profile
    where profile.household_id = target_household_id
      and profile.profile_id = target_profile_id
      and profile.auth_user_id = (select auth.uid())
      and public.is_household_member(target_household_id)
  )
$$;

create or replace function public.assign_household_profile(
  target_user_id uuid,
  target_profile_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := public.current_household_id();
begin
  if not public.is_app_admin() or target_household_id is null then
    raise exception 'Administrator approval is required.';
  end if;
  if target_profile_id <> 'user_a' then
    raise exception 'Only the mama profile can be assigned.';
  end if;
  if not exists (
    select 1 from public.user_approvals approval
    where approval.user_id = target_user_id
      and approval.status = 'approved'
      and not approval.is_admin
  ) then
    raise exception 'Approved user was not found.';
  end if;
  if exists (select 1 from public.household_members member where member.user_id = target_user_id) then
    raise exception 'User already belongs to a household.';
  end if;
  if exists (
    select 1 from public.household_profiles profile
    where profile.household_id = target_household_id
      and profile.profile_id = target_profile_id
      and profile.auth_user_id is not null
  ) then
    raise exception 'Profile is already assigned.';
  end if;

  insert into public.household_members (user_id, household_id)
  values (target_user_id, target_household_id);

  update public.household_profiles
  set auth_user_id = target_user_id
  where household_id = target_household_id
    and profile_id = target_profile_id;
end
$$;

-- 個人用家計簿を作成した本人は、その表示プロフィールへ自動的に紐付ける。
create or replace function public.bind_personal_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id = 'user_a'
    and exists (
      select 1 from public.household_members member
      where member.household_id = new.household_id
        and member.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.household_profiles profile
      where profile.auth_user_id = (select auth.uid())
    )
  then
    new.auth_user_id = auth.uid();
  end if;
  return new;
end
$$;

create trigger bind_personal_profile_trigger
before insert on public.household_profiles
for each row execute function public.bind_personal_profile();

do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'categories', 'transactions', 'budgets', 'recurring_transactions', 'savings_goals',
    'savings_contributions', 'dismissed_alerts', 'tags', 'transaction_templates',
    'monthly_reviews', 'saved_filters', 'notification_preferences'
  ] loop
    for policy_record in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;

    execute format(
      'create policy "Members can view %1$s" on public.%1$I for select to authenticated using (public.is_household_member(household_id))',
      table_name
    );
    execute format(
      'create policy "Owners can insert %1$s" on public.%1$I for insert to authenticated with check (public.can_edit_profile(household_id, user_id))',
      table_name
    );
    execute format(
      'create policy "Owners can update %1$s" on public.%1$I for update to authenticated using (public.can_edit_profile(household_id, user_id)) with check (public.can_edit_profile(household_id, user_id))',
      table_name
    );
    execute format(
      'create policy "Owners can delete %1$s" on public.%1$I for delete to authenticated using (public.can_edit_profile(household_id, user_id))',
      table_name
    );
  end loop;
end
$$;

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'transaction_tags'
  loop
    execute format('drop policy if exists %I on public.transaction_tags', policy_record.policyname);
  end loop;
end
$$;

create policy "Members can view transaction tags"
  on public.transaction_tags for select to authenticated
  using (public.is_household_member(household_id));
create policy "Owners can insert transaction tags"
  on public.transaction_tags for insert to authenticated
  with check (
    exists (
      select 1 from public.transactions transaction
      where transaction.id = transaction_id
        and public.can_edit_profile(transaction.household_id, transaction.user_id)
    )
  );
create policy "Owners can delete transaction tags"
  on public.transaction_tags for delete to authenticated
  using (
    exists (
      select 1 from public.transactions transaction
      where transaction.id = transaction_id
        and public.can_edit_profile(transaction.household_id, transaction.user_id)
    )
  );

drop policy if exists "Members can create rate limited household AI diagnoses" on public.ai_household_diagnoses;
create policy "Owners can create rate limited household AI diagnoses"
  on public.ai_household_diagnoses for insert to authenticated
  with check (
    public.can_edit_profile(household_id, user_id)
    and public.can_insert_ai_diagnosis(household_id, user_id)
  );

create or replace function public.validate_owned_profile(target_user_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_household_id uuid := public.current_household_id();
begin
  if target_household_id is null or not public.can_edit_profile(target_household_id, target_user_id) then
    raise exception 'Profile is read only.';
  end if;
  return target_household_id;
end
$$;

create or replace function public.prevent_unowned_profile_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household_id uuid := case when tg_op = 'DELETE' then old.household_id else new.household_id end;
  target_profile_id text := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if not public.can_edit_profile(target_household_id, target_profile_id) then
    raise exception 'Profile is read only.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'categories', 'transactions', 'budgets', 'recurring_transactions', 'savings_goals',
    'savings_contributions', 'dismissed_alerts', 'tags', 'transaction_templates',
    'monthly_reviews', 'saved_filters', 'notification_preferences', 'ai_household_diagnoses'
  ] loop
    execute format('create trigger prevent_unowned_profile_write_trigger before insert or update or delete on public.%I for each row execute function public.prevent_unowned_profile_write()', table_name);
  end loop;
end
$$;

revoke all on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated;
revoke execute on function public.can_edit_profile(uuid, text) from public, anon, authenticated;
revoke all on function public.assign_household_profile(uuid, text) from public, anon;
grant execute on function public.assign_household_profile(uuid, text) to authenticated;
revoke execute on function public.bind_personal_profile() from public, anon, authenticated;
revoke execute on function public.validate_owned_profile(text) from public, anon, authenticated;
revoke execute on function public.prevent_unowned_profile_write() from public, anon, authenticated;

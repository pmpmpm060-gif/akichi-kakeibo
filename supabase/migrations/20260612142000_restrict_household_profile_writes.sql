-- 世帯プロフィールの作成は初回セットアップRPCだけに限定する。
drop policy if exists "Members can manage household profiles" on public.household_profiles;

create policy "Members can view household profiles"
  on public.household_profiles
  for select
  to authenticated
  using (public.is_household_member(household_id));

revoke insert, update, delete on public.household_profiles from authenticated;

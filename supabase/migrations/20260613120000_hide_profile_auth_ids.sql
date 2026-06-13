-- プロフィール紐付け用のAuthユーザーIDを通常の世帯参照APIへ公開しない。

revoke select on public.household_profiles from authenticated;
grant select (
  household_id,
  profile_id,
  display_name,
  icon,
  sort_order,
  created_at
) on public.household_profiles to authenticated;

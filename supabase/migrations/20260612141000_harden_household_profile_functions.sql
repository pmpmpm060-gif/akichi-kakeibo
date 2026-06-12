-- 世帯プロフィール検証関数は内部処理専用とし、クライアントからの直接実行を禁止する。
revoke execute on function public.is_household_profile(uuid, text) from authenticated;
revoke execute on function public.is_household_profile(uuid, text) from anon;

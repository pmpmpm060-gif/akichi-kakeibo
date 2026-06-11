-- SECURITY DEFINERのRPCは、未認証クライアントから明示的に実行不可とする。
revoke execute on function public.save_user_budgets(text, jsonb) from anon;

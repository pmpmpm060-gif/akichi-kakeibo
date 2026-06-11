-- SECURITY DEFINERのRPCは、未認証クライアントから明示的に実行不可とする。
revoke execute on function public.delete_unused_category(uuid) from anon;

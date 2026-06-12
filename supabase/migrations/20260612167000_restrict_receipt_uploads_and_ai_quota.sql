-- レシートの任意アップロードを防ぎ、AI診断回数上限を固定値として管理する。

create or replace function public.consume_ai_diagnosis_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  current_count integer;
begin
  if auth.uid() is null or not public.is_approved_user() then
    return false;
  end if;

  insert into public.ai_request_limits (user_id, request_kind, window_started_at, request_count)
  values (auth.uid(), 'diagnosis', current_window, 1)
  on conflict (user_id, request_kind) do update
  set window_started_at = case
        when public.ai_request_limits.window_started_at < current_window then current_window
        else public.ai_request_limits.window_started_at
      end,
      request_count = case
        when public.ai_request_limits.window_started_at < current_window then 1
        else public.ai_request_limits.request_count + 1
      end
  returning request_count into current_count;

  return current_count <= 10;
end
$$;

revoke all on function public.consume_ai_diagnosis_quota() from public, anon;
grant execute on function public.consume_ai_diagnosis_quota() to authenticated;

revoke execute on function public.consume_ai_request_quota(text, integer) from authenticated;
drop function public.consume_ai_request_quota(text, integer);

drop policy if exists "Members can upload household receipts" on storage.objects;
create policy "Members can upload transaction receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
    and exists (
      select 1
      from public.transactions transaction
      where transaction.household_id = (storage.foldername(name))[1]::uuid
        and transaction.id::text = split_part(storage.filename(name), '.', 1)
    )
  );


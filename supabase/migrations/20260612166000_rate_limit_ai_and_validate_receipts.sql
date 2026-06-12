-- 外部AIの過剰呼び出しをDBで原子的に制限し、レシート参照先の整合性を保証する。

create table public.ai_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_kind text not null check (request_kind in ('diagnosis')),
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, request_kind)
);

alter table public.ai_request_limits enable row level security;

create or replace function public.consume_ai_request_quota(
  target_kind text,
  request_limit integer
)
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
  if target_kind <> 'diagnosis' or request_limit < 1 or request_limit > 100 then
    raise exception 'Invalid AI quota parameters.';
  end if;

  insert into public.ai_request_limits (user_id, request_kind, window_started_at, request_count)
  values (auth.uid(), target_kind, current_window, 1)
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

  return current_count <= request_limit;
end
$$;

revoke all on function public.consume_ai_request_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_request_quota(text, integer) to authenticated;

drop policy if exists "Members can delete household AI diagnoses" on public.ai_household_diagnoses;
revoke delete on public.ai_household_diagnoses from authenticated;

alter table public.transactions
  add constraint transactions_receipt_path_owner_check check (
    receipt_path is null
    or receipt_path like household_id::text || '/' || id::text || '.%'
  );


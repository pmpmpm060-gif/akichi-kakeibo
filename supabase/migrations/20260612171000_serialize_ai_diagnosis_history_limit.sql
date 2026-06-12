-- 同時INSERTでも診断履歴の時間上限を超えないよう、世帯単位で判定を直列化する。

create or replace function public.can_insert_ai_diagnosis(
  target_household_id uuid,
  target_user_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  diagnosis_count bigint;
begin
  if target_household_id <> public.current_household_id()
    or not public.is_household_profile(target_household_id, target_user_id) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_household_id::text, 0)
  );

  select count(*)
    into diagnosis_count
    from public.ai_household_diagnoses diagnosis
    where diagnosis.household_id = target_household_id
      and diagnosis.created_at >= date_trunc('hour', now());

  return diagnosis_count < 10;
end
$$;

revoke execute on function public.can_insert_ai_diagnosis(uuid, text) from public, anon, authenticated;

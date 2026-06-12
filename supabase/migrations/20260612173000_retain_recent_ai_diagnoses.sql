-- AI診断履歴は画面で利用する最新10件だけを対象月ごとに保持する。

create or replace function public.retain_recent_ai_diagnoses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_household_diagnoses diagnosis
  where diagnosis.id in (
    select old_diagnosis.id
    from public.ai_household_diagnoses old_diagnosis
    where old_diagnosis.household_id = new.household_id
      and old_diagnosis.user_id = new.user_id
      and old_diagnosis.target_month = new.target_month
    order by old_diagnosis.created_at desc, old_diagnosis.id desc
    offset 10
  );
  return null;
end
$$;

create trigger retain_recent_ai_diagnoses_trigger
after insert on public.ai_household_diagnoses
for each row execute function public.retain_recent_ai_diagnoses();

revoke execute on function public.retain_recent_ai_diagnoses() from public, anon, authenticated;

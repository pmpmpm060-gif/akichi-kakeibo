-- 認証済みクライアントからの診断履歴直接INSERTも、時間単位の上限内へ制限する。

create or replace function public.can_insert_ai_diagnosis(
  target_household_id uuid,
  target_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_household_id = public.current_household_id()
    and public.is_household_profile(target_household_id, target_user_id)
    and (
      select count(*)
      from public.ai_household_diagnoses diagnosis
      where diagnosis.household_id = target_household_id
        and diagnosis.created_at >= date_trunc('hour', now())
    ) < 10
$$;

create or replace function public.set_ai_diagnosis_created_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- クライアント指定日時で時間上限を回避できないよう、DB時刻で固定する。
  new.created_at = now();
  return new;
end
$$;

drop trigger if exists set_ai_diagnosis_created_at_trigger on public.ai_household_diagnoses;
create trigger set_ai_diagnosis_created_at_trigger
before insert on public.ai_household_diagnoses
for each row execute function public.set_ai_diagnosis_created_at();

drop policy if exists "Members can create household AI diagnoses" on public.ai_household_diagnoses;
create policy "Members can create rate limited household AI diagnoses"
  on public.ai_household_diagnoses for insert to authenticated
  with check (public.can_insert_ai_diagnosis(household_id, user_id));

revoke execute on function public.can_insert_ai_diagnosis(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_ai_diagnosis_created_at() from public, anon, authenticated;

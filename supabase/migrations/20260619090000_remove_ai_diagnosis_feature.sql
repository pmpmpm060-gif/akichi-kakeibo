-- AI家計診断機能を廃止する。

drop policy if exists "Owners can create rate limited household AI diagnoses" on public.ai_household_diagnoses;
drop policy if exists "Members can create household AI diagnoses" on public.ai_household_diagnoses;
drop policy if exists "Members can view household AI diagnoses" on public.ai_household_diagnoses;
drop policy if exists "Members can delete household AI diagnoses" on public.ai_household_diagnoses;

drop function if exists public.consume_ai_diagnosis_quota(text, date);
drop function if exists public.consume_ai_diagnosis_quota();
drop function if exists public.can_insert_ai_diagnosis(uuid, text);

drop table if exists public.ai_diagnosis_cooldowns;
drop table if exists public.ai_request_limits;
drop table if exists public.ai_household_diagnoses;

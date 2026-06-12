-- AI家計診断の結果を、世帯・表示プロフィール・対象月ごとの履歴として保存する。

create table public.ai_household_diagnoses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null,
  target_month date not null check (target_month = date_trunc('month', target_month)::date),
  score integer not null check (score between 0 and 100),
  summary text not null check (length(summary) between 1 and 1000),
  strengths jsonb not null default '[]'::jsonb check (jsonb_typeof(strengths) = 'array'),
  concerns jsonb not null default '[]'::jsonb check (jsonb_typeof(concerns) = 'array'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  recommended_budgets jsonb not null default '[]'::jsonb check (jsonb_typeof(recommended_budgets) = 'array'),
  created_at timestamptz not null default now()
);

create index ai_household_diagnoses_history_idx
  on public.ai_household_diagnoses (household_id, user_id, target_month, created_at desc);

alter table public.ai_household_diagnoses enable row level security;

create policy "Members can read household AI diagnoses"
  on public.ai_household_diagnoses for select to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create household AI diagnoses"
  on public.ai_household_diagnoses for insert to authenticated
  with check (
    household_id = public.current_household_id()
    and public.is_household_profile(household_id, user_id)
  );

create policy "Members can delete household AI diagnoses"
  on public.ai_household_diagnoses for delete to authenticated
  using (public.is_household_member(household_id));

create trigger validate_household_profile_reference_trigger
before insert or update of household_id, user_id
on public.ai_household_diagnoses
for each row execute function public.validate_household_profile_reference();

grant select, insert, delete on public.ai_household_diagnoses to authenticated;
revoke update on public.ai_household_diagnoses from authenticated;


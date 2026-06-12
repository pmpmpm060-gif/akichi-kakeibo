-- 内部検証関数の直接実行権限に依存せず、診断結果を保存できるようにする。
-- 表示プロフィールの整合性はSECURITY DEFINERの既存トリガーで検証する。

drop policy if exists "Members can create household AI diagnoses" on public.ai_household_diagnoses;

create policy "Members can create household AI diagnoses"
  on public.ai_household_diagnoses for insert to authenticated
  with check (household_id = public.current_household_id());


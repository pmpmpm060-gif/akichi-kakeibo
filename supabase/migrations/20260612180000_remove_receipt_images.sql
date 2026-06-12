-- 廃止したレシート画像機能の既存ファイル、Storage設定、取引参照列を削除する。

drop policy if exists "Members can view household receipts" on storage.objects;
drop policy if exists "Members can upload household receipts" on storage.objects;
drop policy if exists "Members can upload transaction receipts" on storage.objects;
drop policy if exists "Members can delete household receipts" on storage.objects;

alter table public.transactions
  drop constraint if exists transactions_receipt_path_owner_check,
  drop constraint if exists transactions_receipt_path_length_check,
  drop column if exists receipt_path;

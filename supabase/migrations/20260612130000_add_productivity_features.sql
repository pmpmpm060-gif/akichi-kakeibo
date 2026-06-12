-- レシート、タグ、テンプレート、月次振り返り、保存条件、通知設定を追加する。

alter table public.transactions
  add column if not exists receipt_path text;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  name text not null check (length(trim(name)) between 1 and 30),
  color text not null default '#fbbf24',
  created_at timestamptz not null default now(),
  unique (household_id, user_id, name)
);

create table public.transaction_tags (
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create table public.transaction_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 50),
  amount integer not null check (amount > 0),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  month date not null check (month = date_trunc('month', month)::date),
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (household_id, user_id, month)
);

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  name text not null check (length(trim(name)) between 1 and 50),
  filter_type text not null check (filter_type in ('transactions', 'reports')),
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  user_id text not null check (user_id in ('user_a', 'user_b')),
  enabled boolean not null default false,
  reminder_hour integer not null default 20 check (reminder_hour between 0 and 23),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.transaction_templates enable row level security;
alter table public.monthly_reviews enable row level security;
alter table public.saved_filters enable row level security;
alter table public.notification_preferences enable row level security;

create policy "Members can manage household tags" on public.tags for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can manage household transaction tags" on public.transaction_tags for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can manage household templates" on public.transaction_templates for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can manage household monthly reviews" on public.monthly_reviews for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can manage household saved filters" on public.saved_filters for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can manage household notification preferences" on public.notification_preferences for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.tags, public.transaction_tags, public.transaction_templates,
  public.monthly_reviews, public.saved_filters, public.notification_preferences to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can view household receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_household_member((storage.foldername(name))[1]::uuid));
create policy "Members can upload household receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_household_member((storage.foldername(name))[1]::uuid));
create policy "Members can delete household receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_household_member((storage.foldername(name))[1]::uuid));
